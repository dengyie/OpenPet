"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { before, describe, it } = require("node:test")

let createRouter
let middleware
let registerJobRoutes

before(async () => {
	;({ createRouter } = await import("../../services/backend/http/router.js"))
	middleware = await import("../../services/backend/http/middleware.js")
	;({ registerJobRoutes } = await import("../../services/backend/routes/jobs.js"))
})

async function withServer(deps, run) {
	const router = createRouter({ basePath: "/api/v1" })
	router.use(middleware.requestId())
	router.use(middleware.errorBoundary())
	router.use(middleware.bearerAuth({ getSessionToken: () => "token" }))
	registerJobRoutes(router, deps)
	const server = createServer((req, res) => void router.handle(req, res))
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	try { await run(`http://127.0.0.1:${server.address().port}/api/v1`) }
	finally { await new Promise((resolve) => server.close(resolve)) }
}

const headers = { authorization: "Bearer token" }
const json = async (response) => ({ response, body: await response.json() })

describe("Job HTTP contract", () => {
	it("lists with validated filters and pagination boundaries", async () => {
		const received = []
		const jobs = {
			byId: () => null,
			list(options) { received.push(["list", options]); return [{ id: "job-1" }] },
			count(options) { received.push(["count", options]); return 7 },
		}
		await withServer({ jobs, runner: {}, dispatcher: {} }, async (url) => {
			const listed = await json(await fetch(`${url}/jobs?status=failed&kind=about.check-updates&limit=25&offset=50`, { headers }))
			assert.equal(listed.response.status, 200)
			assert.deepEqual(listed.body.data, { items: [{ id: "job-1" }], total: 7, cursor: null })
			assert.deepEqual(received[0][1], { status: "failed", kind: "about.check-updates", limit: 25, offset: 50 })
			for (const query of ["status=bad", "kind=bad", "limit=0", "limit=1001", "offset=-1", "offset=x"]) {
				assert.equal((await fetch(`${url}/jobs?${query}`, { headers })).status, 400, query)
			}
		})
	})

	it("gets, cancels, and returns historical events", async () => {
		const job = { id: "job-1", kind: "about.check-updates", status: "queued" }
		let canceled = null
		const jobs = { byId: (id) => id === job.id ? job : null, list: () => [], count: () => 0, listEvents: () => [{ phase: "checking" }], countEvents: () => 3, removeCompleted: () => 0 }
		await withServer({ jobs, runner: { cancel: async (id) => { canceled = id; return { ...job, status: "canceled" } } }, dispatcher: {} }, async (url) => {
			assert.deepEqual((await json(await fetch(`${url}/jobs/job-1`, { headers }))).body.data, job)
			assert.equal((await json(await fetch(`${url}/jobs/job-1/cancel`, { method: "POST", headers }))).body.data.status, "canceled")
			assert.equal(canceled, "job-1")
			const events = await json(await fetch(`${url}/jobs/job-1/events?limit=10`, { headers }))
			assert.deepEqual(events.body.data.items, [{ phase: "checking" }])
			assert.equal(events.body.data.total, 3)
			assert.equal((await fetch(`${url}/jobs/missing`, { headers })).status, 404)
		})
	})

	it("retries through transition and dispatcher so queued work starts", async () => {
		const current = { id: "retry", kind: "about.check-updates", status: "failed", attempt: 1, maxAttempts: 2 }
		const calls = []
		const jobs = {
			byId: () => current, list: () => [], count: () => 0, listEvents: () => [], removeCompleted: () => 0,
			transition(id, status) { calls.push(["transition", id, status]); current.status = status; current.attempt += 1; return current },
		}
		await withServer({ jobs, runner: {}, dispatcher: { resume(id) { calls.push(["resume", id]); current.status = "running"; return current } } }, async (url) => {
			const retried = await json(await fetch(`${url}/jobs/retry/retry`, { method: "POST", headers }))
			assert.equal(retried.response.status, 202)
			assert.equal(retried.body.data.status, "running")
			assert.deepEqual(calls, [["transition", "retry", "queued"], ["resume", "retry"]])
		})
	})

	it("retry HTTP executes an interrupted job through the real queue and runner", async () => {
		const [{ openDatabase }, { migrate }, { createJobsRepository }, { createQueue }, { createRunner }, { createJobDispatcher }] = await Promise.all([
			import("../../services/backend/store/db.js"),
			import("../../services/backend/store/migrate.js"),
			import("../../services/backend/store/repositories/jobs.js"),
			import("../../services/backend/jobs/queue.js"),
			import("../../services/backend/jobs/runner.js"),
			import("../../services/backend/jobs/dispatcher.js"),
		])
		const db = await openDatabase({ file: ":memory:" })
		migrate({ db })
		const jobs = createJobsRepository({ db })
		jobs.insert({ id: "real-retry", kind: "about.check-updates", input: {} })
		jobs.transition("real-retry", "running")
		jobs.finish("real-retry", { status: "interrupted" })
		const queue = createQueue({ repo: jobs })
		const runner = createRunner({ repo: jobs, queue, handlers: { "about.check-updates": async () => ({ checked: true }) } })
		const dispatcher = createJobDispatcher({ queue, runner })
		try {
			await withServer({ jobs, runner, dispatcher }, async (url) => {
				assert.equal((await fetch(`${url}/jobs/real-retry/retry`, { method: "POST", headers })).status, 202)
				for (let index = 0; index < 20 && jobs.byId("real-retry").status !== "succeeded"; index += 1) {
					await new Promise((resolve) => setTimeout(resolve, 5))
				}
				assert.equal(jobs.byId("real-retry").status, "succeeded")
				assert.deepEqual(jobs.byId("real-retry").result, { checked: true })
			})
		} finally {
			queue.stop()
			await runner.shutdown()
			db.close()
		}
	})

	it("rejects exhausted, canceled, and active retries without dispatching", async () => {
		for (const current of [
			{ id: "x", kind: "about.check-updates", status: "failed", attempt: 2, maxAttempts: 2 },
			{ id: "x", kind: "about.check-updates", status: "canceled", attempt: 1, maxAttempts: 2 },
			{ id: "x", kind: "about.check-updates", status: "running", attempt: 1, maxAttempts: 2 },
		]) {
			let resumed = false
			const jobs = { byId: () => current, list: () => [], count: () => 0, transition: () => { throw new Error("must not transition") } }
			await withServer({ jobs, runner: {}, dispatcher: { resume() { resumed = true } } }, async (url) => {
				assert.equal((await fetch(`${url}/jobs/x/retry`, { method: "POST", headers })).status, 409)
				assert.equal(resumed, false)
			})
		}
	})

	it("returns LOCKED when retry resource is occupied and does not dispatch", async () => {
		let resumed = false
		const current = { id: "retry", kind: "about.check-updates", status: "failed", attempt: 1, maxAttempts: 2 }
		const jobs = {
			byId: () => current, list: () => [], count: () => 0,
			transition() { throw new middleware.ApiError("LOCKED", "occupied", { status: 423, details: { jobId: "owner", resourceKey: "shared" } }) },
		}
		await withServer({ jobs, runner: {}, dispatcher: { resume() { resumed = true } } }, async (url) => {
			const result = await json(await fetch(`${url}/jobs/retry/retry`, { method: "POST", headers }))
			assert.equal(result.response.status, 423)
			assert.deepEqual(result.body.error.details, { jobId: "owner", resourceKey: "shared" })
			assert.equal(resumed, false)
		})
	})

	it("deletes terminal jobs and exposes unavailable dependencies", async () => {
		const jobs = { byId: () => null, list: () => [], count: () => 0, removeCompleted: () => 4 }
		await withServer({ jobs, runner: {}, dispatcher: {} }, async (url) => {
			assert.deepEqual((await json(await fetch(`${url}/jobs/completed`, { method: "DELETE", headers }))).body.data, { deleted: 4 })
			assert.equal((await fetch(`${url}/jobs/missing/cancel`, { method: "POST", headers })).status, 503)
			assert.equal((await fetch(`${url}/jobs/missing/retry`, { method: "POST", headers })).status, 503)
		})
	})
})
