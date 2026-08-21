"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

describe("backend Job 编排", () => {
	it("每个请求只入队一次并立即交给 runner", async () => {
		const { createJobDispatcher } = await import("../../services/backend/jobs/dispatcher.js")
		const calls = []
		const queued = { id: "job-1", kind: "about.check-updates", status: "queued" }
		let pending = { ...queued, status: "running" }
		const dispatch = createJobDispatcher({
			queue: {
				enqueue(input) { calls.push(["enqueue", input]); return queued },
				next() { const value = pending; pending = null; return value },
			},
			runner: { run(job) { calls.push(["run", job]); return Promise.resolve(job) } },
			publish(name, job) { calls.push(["publish", name, job]) },
		})

		const input = { id: "job-1", kind: "about.check-updates", input: {} }
		assert.equal(dispatch(input), queued)
		assert.deepEqual(calls, [
			["enqueue", input],
			["publish", "job.created", queued],
			["run", { ...queued, status: "running" }],
		])
	})

	it("drains available capacity and logs runner rejection without failing enqueue", async () => {
		const { createJobDispatcher } = await import("../../services/backend/jobs/dispatcher.js")
		const errors = []
		const jobs = [{ id: "one", status: "running" }, { id: "two", status: "running" }]
		let enqueueCount = 0
		const dispatch = createJobDispatcher({
			queue: {
				enqueue() { enqueueCount += 1; return { id: "created", status: "queued" } },
				next() { return jobs.shift() ?? null },
			},
			runner: { run(job) { return job.id === "one" ? Promise.reject(new Error("failed")) : Promise.resolve(job) } },
			logger: { error(message, fields) { errors.push([message, fields]) } },
		})
		assert.equal(dispatch({ id: "created" }).id, "created")
		await new Promise((resolve) => setImmediate(resolve))
		assert.equal(enqueueCount, 1)
		assert.equal(jobs.length, 0)
		assert.equal(errors.length, 1)
		assert.equal(errors[0][1].jobId, "one")
	})
})
