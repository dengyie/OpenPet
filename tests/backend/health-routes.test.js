"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const path = require("node:path")
const { before, describe, it } = require("node:test")

let createRouter
let middleware
let health

before(async () => {
	;({ createRouter } = await import("../../services/backend/http/router.js"))
	middleware = await import("../../services/backend/http/middleware.js")
	health = await import("../../services/backend/routes/health.js")
})

function createRuntime(overrides = {}) {
	return {
		sessionToken: "test-session-token",
		startedAt: 1_000,
		secrets: {},
		degraded: false,
		degradedReason: null,
		db: { driverName: "test-sqlite" },
		settings: null,
		jobs: null,
		...overrides,
	}
}

async function withServer(runtime, run) {
	const router = createRouter({ basePath: "/api/v1" })
	router.use(middleware.requestId())
	router.use(middleware.errorBoundary())
	router.use(middleware.loopbackOnly())
	router.use(middleware.bearerAuth({ getSessionToken: () => runtime.sessionToken }))
	router.use(middleware.jsonBody())
	health.registerHealthRoutes({ router, runtime, deps: { now: () => 2_500, pid: 42 } })
	const server = createServer((req, res) => void router.handle(req, res))
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	try {
		const { port } = server.address()
		await run({ router, url: `http://127.0.0.1:${port}/api/v1` })
	} finally {
		await new Promise((resolve) => server.close(resolve))
	}
}

describe("T09 health 与服务路由", () => {
	it("注册 03 篇 §4.1 的 10 条路由", () => {
		const router = createRouter({ basePath: "/api/v1" })
		health.registerHealthRoutes({ router, runtime: createRuntime() })
		assert.deepEqual(router.routes(), health.HEALTH_AND_SERVICE_ROUTES.map((entry) => {
			const [method, routePath] = entry.split(" ")
			return `${method} /api/v1${routePath}`
		}))
		assert.equal(router.routes().length, 10)
	})

	it("health 需要鉴权,鉴权后返回运行状态且不泄露 token", async () => {
		await withServer(createRuntime(), async ({ url }) => {
			const unauthorized = await fetch(url + "/health")
			assert.equal(unauthorized.status, 401)
			const response = await fetch(url + "/health", {
				headers: { authorization: "Bearer test-session-token" },
			})
			assert.equal(response.status, 200)
			const body = await response.json()
			assert.deepEqual(body.data, {
				status: "ok",
				pid: 42,
				apiVersion: "v1",
				uptimeMs: 1_500,
				store: "test-sqlite",
				secretsLoaded: true,
			})
			assert.equal(JSON.stringify(body).includes("test-session-token"), false)
		})
	})

	it("降级时业务路由返 MIGRATION_REQUIRED,health 与 service 仍可访问", async () => {
		await withServer(createRuntime({ degraded: true, degradedReason: "NODE_SQLITE_UNAVAILABLE", db: null }), async ({ url }) => {
			const headers = { authorization: "Bearer test-session-token" }
			const healthResponse = await fetch(url + "/health", { headers })
			assert.equal(healthResponse.status, 200)
			assert.equal((await healthResponse.json()).data.status, "degraded")

			const business = await fetch(url + "/about", { headers })
			assert.equal(business.status, 503)
			assert.equal((await business.json()).error.code, "MIGRATION_REQUIRED")

			const service = await fetch(url + "/service/status", { headers })
			assert.equal(service.status, 503)
			assert.equal((await service.json()).error.code, "BACKEND_UNAVAILABLE")
		})
	})
})

describe("T09 启动编排", () => {
	it("按 settings → open → migrate → recover → bind 顺序注入运行时", async () => {
		const calls = []
		const runtime = createRuntime({ db: null, settings: null, jobs: null })
		const userDataDir = "/tmp/openpet-user"
		const db = { driverName: "fake" }
		const repo = { name: "jobs" }
		const result = await health.initializeBackendRuntime({
			runtime,
			userDataDir,
			deps: {
				createSettingsStore(options) {
					calls.push(["settings", options.file])
					return { name: "settings" }
				},
				async openDatabase(options) {
					calls.push(["open", options.file])
					return db
				},
				migrate: ({ db: received }) => calls.push(["migrate", received]),
				createJobsRepository: ({ db: received }) => {
					calls.push(["repo", received])
					return repo
				},
				createLogsRepository: ({ db: received }) => {
					calls.push(["logs", received])
					return { cleanup() {} }
				},
				recoverJobs(options) {
					calls.push(["recover", options.repo, options.tmpDir])
					return { interrupted: [], requeued: [], tmpRemoved: 0 }
				},
			},
			bind: async () => calls.push(["bind"]),
		})

		assert.deepEqual(calls, [
			["settings", path.join(userDataDir, "backend/settings.json")],
			["open", path.join(userDataDir, "backend/openpet.db")],
			["migrate", db],
			["repo", db],
			["logs", db],
			["recover", repo, path.join(userDataDir, "backend/tmp")],
			["bind"],
		])
		assert.equal(runtime.db, db)
		assert.equal(runtime.settings.name, "settings")
		assert.equal(runtime.jobs, repo)
		assert.equal(result.degraded, false)
	})

	it("schema 首次迁移后导入 JSON,再创建 repositories", async () => {
		const calls = []
		const runtime = createRuntime({ db: null, settings: null, jobs: null })
		const db = { driverName: "fake" }
		await health.initializeBackendRuntime({
			runtime,
			userDataDir: "/tmp/openpet-user",
			deps: {
				createSettingsStore: () => ({}),
				openDatabase: async () => db,
				needsJsonImport: () => { calls.push("needs"); return true },
				migrate: () => calls.push("migrate"),
				migrateFromJson: async () => calls.push("import"),
				createJobsRepository: () => { calls.push("repo"); return {} },
				createLogsRepository: () => ({}),
				recoverJobs: () => ({}),
			},
			bind: async () => calls.push("bind"),
		})
		assert.deepEqual(calls, ["needs", "migrate", "import", "repo", "bind"])
	})

	it("开库或迁移失败时通知 Shell 并仍然 bind", async () => {
		for (const failureAt of ["open", "migrate"]) {
			const calls = []
			const sent = []
			const runtime = createRuntime({ db: null, settings: null, jobs: null })
			const error = Object.assign(new Error(failureAt), {
				code: failureAt === "migrate" ? "MIGRATION_REQUIRED" : "NODE_SQLITE_UNAVAILABLE",
			})
			await health.initializeBackendRuntime({
				runtime,
				userDataDir: "/tmp/openpet-user",
				shell: { send: (message) => sent.push(message) },
				deps: {
					createSettingsStore: () => ({}),
					openDatabase: async () => {
						calls.push("open")
						if (failureAt === "open") throw error
						return { driverName: "fake" }
					},
					migrate: () => {
						calls.push("migrate")
						if (failureAt === "migrate") throw error
					},
					createJobsRepository: () => ({}),
					createLogsRepository: () => ({ cleanup() {} }),
					recoverJobs: () => calls.push("recover"),
				},
				bind: async () => calls.push("bind"),
			})
			assert.equal(runtime.degraded, true)
			assert.equal(runtime.degradedReason, error.code)
			assert.equal(calls.at(-1), "bind")
			assert.equal(calls.includes("recover"), false)
			assert.deepEqual(sent, [{ type: "degraded", reason: error.code }])
		}
	})

	it("每小时日志清理定时器会 unref", () => {
		const intervals = []
		const timer = { unrefCalled: false, unref() { this.unrefCalled = true } }
		const router = createRouter({ basePath: "/api/v1" })
		health.registerHealthRoutes({
			router,
			runtime: createRuntime(),
			deps: {
				cleanup() {},
				setInterval(callback, delay) {
					intervals.push({ callback, delay })
					return timer
				},
			},
		})
		assert.equal(intervals[0].delay, health.LOG_CLEANUP_INTERVAL_MS)
		assert.equal(timer.unrefCalled, true)
	})
})
