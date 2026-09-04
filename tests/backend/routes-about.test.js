"use strict"
const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { describe, it } = require("node:test")

async function eventually(check) {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const value = check()
		if (value) return value
		await new Promise((resolve) => setTimeout(resolve, 5))
	}
	throw new Error("condition was not reached")
}

describe("T15 about", () => {
	it("exports the canonical route list", async () => {
		const { createRouter } = await import("../../services/backend/http/router.js")
		const { registerAboutRoutes, ABOUT_ROUTES } = await import("../../services/backend/routes/about.js")
		const router = createRouter({ basePath: "/api/v1" })
		registerAboutRoutes(router, { about: { info: () => ({ version: "1.0.1" }) }, jobs: { insert: ({ id, kind }) => ({ id, kind }) } })
		assert.deepEqual(router.routes(), ABOUT_ROUTES.map((x) => {
			const [method, route] = x.split(" ")
			return `${method} /api/v1${route}`
		}))
	})

	it("creates collision-resistant Job ids for checks started in the same clock tick", async () => {
		const { createRouter } = await import("../../services/backend/http/router.js")
		const { registerAboutRoutes } = await import("../../services/backend/routes/about.js")
		const inserted = []
		const router = createRouter({ basePath: "/api/v1" })
		registerAboutRoutes(router, {
			about: { info: () => ({ version: "1.0.1" }) },
			jobs: {
				insert(input) {
					inserted.push(input)
					return input
				},
			},
		})
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		const realNow = Date.now
		Date.now = () => 123
		try {
			const url = `http://127.0.0.1:${server.address().port}/api/v1/about/check-updates`
			const responses = await Promise.all([
				fetch(url, { method: "POST" }),
				fetch(url, { method: "POST" }),
			])
			assert.deepEqual(responses.map(({ status }) => status), [202, 202])
		} finally {
			Date.now = realNow
			await new Promise((resolve) => server.close(resolve))
		}
		assert.equal(new Set(inserted.map(({ id }) => id)).size, 2)
		assert.equal(inserted.every(({ id }) => id.startsWith("about-check:")), true)
	})

	it("queues the existing Job kind and exposes the terminal update result through GET /jobs/:id", async () => {
		const [
			{ createRouter },
			middleware,
			{ registerAboutRoutes },
			{ registerJobRoutes },
			{ createAboutService },
			{ openDatabase },
			{ migrate },
			{ createJobsRepository },
			{ createQueue },
			{ createRunner },
			{ createJobDispatcher },
		] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/http/middleware.js"),
			import("../../services/backend/routes/about.js"),
			import("../../services/backend/routes/jobs.js"),
			import("../../services/backend/domains/about.js"),
			import("../../services/backend/store/db.js"),
			import("../../services/backend/store/migrate.js"),
			import("../../services/backend/store/repositories/jobs.js"),
			import("../../services/backend/jobs/queue.js"),
			import("../../services/backend/jobs/runner.js"),
			import("../../services/backend/jobs/dispatcher.js"),
		])
		const db = await openDatabase({ file: ":memory:" })
		migrate({ db })
		const jobs = createJobsRepository({ db, now: () => Date.parse("2026-09-05T03:04:05.000Z") })
		const queue = createQueue({ repo: jobs })
		const about = createAboutService({
			pkg: {
				name: "openpet",
				version: "1.0.0",
				build: { publish: { provider: "github", owner: "dengyie", repo: "OpenPet" } },
			},
			runtime: { version: "1.0.0", platform: "darwin", arch: "arm64" },
			now: () => Date.parse("2026-09-05T03:04:05.000Z"),
			fetchImpl: async () => ({
				ok: true,
				json: async () => ({ tag_name: "v1.1.0", assets: [] }),
			}),
		})
		const runner = createRunner({
			repo: jobs,
			queue,
			handlers: {
				"about.check-updates": async ({ report }) => {
					report({ phase: "checking", percent: 25 })
					return about.checkUpdates()
				},
			},
		})
		const dispatcher = createJobDispatcher({ queue, runner })
		const router = createRouter({ basePath: "/api/v1" })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.bearerAuth({ getSessionToken: () => "token" }))
		registerAboutRoutes(router, { about, jobs: { insert: dispatcher } })
		registerJobRoutes(router, { jobs, runner, dispatcher })
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`
			const headers = { authorization: "Bearer token", "content-type": "application/json" }
			const infoResponse = await fetch(`${baseUrl}/about`, { headers })
			assert.equal(infoResponse.status, 200)
			assert.equal((await infoResponse.json()).data.version, "1.0.0")

			const queuedResponse = await fetch(`${baseUrl}/about/check-updates`, { method: "POST", headers, body: "{}" })
			assert.equal(queuedResponse.status, 202)
			const queued = (await queuedResponse.json()).data
			assert.match(queued.jobId, /^about-check:[0-9a-f-]{36}$/)
			const succeeded = await eventually(() => jobs.byId(queued.jobId)?.status === "succeeded" && jobs.byId(queued.jobId))
			assert.equal(succeeded.kind, "about.check-updates")

			const jobResponse = await fetch(`${baseUrl}/jobs/${encodeURIComponent(queued.jobId)}`, { headers })
			assert.equal(jobResponse.status, 200)
			assert.deepEqual((await jobResponse.json()).data.result, {
				status: "ok",
				configured: true,
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				updateAvailable: true,
				prerelease: false,
				releaseUrl: "https://github.com/dengyie/OpenPet/releases",
				assets: [],
				checkedAt: "2026-09-05T03:04:05.000Z",
				message: "A newer version is available.",
			})
		} finally {
			await new Promise((resolve) => server.close(resolve))
			queue.stop()
			await runner.shutdown()
			db.close()
		}
	})
})
