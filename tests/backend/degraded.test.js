"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { describe, it } = require("node:test")

describe("T23 degraded gate", () => {
	it("keeps health and service routes alive while rejecting business routes", async () => {
		const [{ createRouter }, middleware, health] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/http/middleware.js"),
			import("../../services/backend/routes/health.js"),
		])
		const runtime = {
			sessionToken: "degraded-session",
			startedAt: Date.now(),
			secrets: null,
			degraded: true,
			degradedReason: "NODE_SQLITE_UNAVAILABLE",
			db: null,
		}
		const router = createRouter({ basePath: "/api/v1" })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.loopbackOnly())
		router.use(middleware.bearerAuth({ getSessionToken: () => runtime.sessionToken }))
		health.registerHealthRoutes({ router, runtime, deps: { now: Date.now, pid: 1 } })
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const base = `http://127.0.0.1:${server.address().port}/api/v1`
			const headers = { authorization: "Bearer degraded-session" }
			const healthResponse = await fetch(`${base}/health`, { headers })
			assert.equal(healthResponse.status, 200)
			assert.equal((await healthResponse.json()).data.status, "degraded")
			const serviceResponse = await fetch(`${base}/service/status`, { headers })
			assert.equal(serviceResponse.status, 503)
			assert.equal((await serviceResponse.json()).error.code, "BACKEND_UNAVAILABLE")
			const businessResponse = await fetch(`${base}/about`, { headers })
			assert.equal(businessResponse.status, 503)
			assert.equal((await businessResponse.json()).error.code, "MIGRATION_REQUIRED")
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
	})

	it("does not exit when initialization fails and still binds", async () => {
		const health = await import("../../services/backend/routes/health.js")
		const sent = []
		let bound = false
		const runtime = { degraded: false, degradedReason: null }
		const result = await health.initializeBackendRuntime({
			runtime,
			userDataDir: "/tmp/openpet-degraded-test",
			shell: { send: (message) => sent.push(message) },
			deps: {
				createSettingsStore: () => ({}),
				openDatabase: async () => { throw Object.assign(new Error("sqlite"), { code: "NODE_SQLITE_UNAVAILABLE" }) },
				migrate: () => {},
				createJobsRepository: () => ({}),
				createLogsRepository: () => ({}),
				recoverJobs: () => ({}),
			},
			bind: async () => { bound = true },
		})
		assert.equal(result.degraded, true)
		assert.equal(bound, true)
		assert.deepEqual(sent, [{ type: "degraded", reason: "NODE_SQLITE_UNAVAILABLE" }])
	})
})
