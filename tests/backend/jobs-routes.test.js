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

async function withServer(jobs, runner, run) {
	const router = createRouter({ basePath: "/api/v1" })
	router.use(middleware.requestId())
	router.use(middleware.errorBoundary())
	router.use(middleware.bearerAuth({ getSessionToken: () => "token" }))
	registerJobRoutes(router, { jobs, runner })
	const server = createServer((req, res) => void router.handle(req, res))
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	try {
		await run(`http://127.0.0.1:${server.address().port}/api/v1`)
	} finally {
		await new Promise((resolve) => server.close(resolve))
	}
}

describe("Job 查询与取消路由", () => {
	it("返回 Job 并把取消交给 runner", async () => {
		const job = { id: "job-1", kind: "about.check-updates", status: "queued" }
		let canceled = null
		await withServer({ byId: (id) => id === job.id ? job : null }, { cancel: async (id) => { canceled = id; return { ...job, status: "canceled" } } }, async (url) => {
			const headers = { authorization: "Bearer token" }
			const found = await fetch(`${url}/jobs/job-1`, { headers })
			assert.equal(found.status, 200)
			assert.deepEqual((await found.json()).data, job)
			const canceledResponse = await fetch(`${url}/jobs/job-1/cancel`, { method: "POST", headers })
			assert.equal(canceledResponse.status, 200)
			assert.equal((await canceledResponse.json()).data.status, "canceled")
			assert.equal(canceled, "job-1")
		})
	})

	it("reports missing jobs and unavailable cancellation", async () => {
		await withServer({ byId: () => null }, {}, async (url) => {
			const headers = { authorization: "Bearer token" }
			const missing = await fetch(`${url}/jobs/missing`, { headers })
			assert.equal(missing.status, 404)
			assert.equal((await missing.json()).error.code, "NOT_FOUND")
			const unavailable = await fetch(`${url}/jobs/missing/cancel`, { method: "POST", headers })
			assert.equal(unavailable.status, 503)
			assert.equal((await unavailable.json()).error.code, "BACKEND_UNAVAILABLE")
		})
	})
})
