"use strict"

const assert = require("node:assert/strict")
const { before, describe, it } = require("node:test")

let createQueue
let createJobsRepository
let migrate
let openDatabase
let groupOf
let CONCURRENCY_BY_GROUP
let JOB_KINDS

before(async () => {
	;({ createQueue, groupOf, CONCURRENCY_BY_GROUP, JOB_KINDS } = await import("../../services/backend/jobs/queue.js"))
	;({ createJobsRepository } = await import("../../services/backend/store/repositories/jobs.js"))
	;({ migrate } = await import("../../services/backend/store/migrate.js"))
	;({ openDatabase } = await import("../../services/backend/store/db.js"))
})

async function withQueue(run, options = {}) {
	const db = await openDatabase({ file: ":memory:" })
	try {
		migrate({ db })
		const repo = createJobsRepository({ db, now: options.now ?? (() => 1_000) })
		const queue = createQueue({ repo, now: options.now ?? (() => 1_000), ...options })
		return await run({ db, repo, queue })
	} finally {
		db.close()
	}
}

function job(id, kind = "image.generate") {
	return { id, kind, input: { test: true } }
}

describe("Job queue · groups", () => {
	it("covers all 17 kinds and uses the documented group limits", () => {
		assert.equal(JOB_KINDS.length, 17)
		for (const kind of JOB_KINDS) {
			const group = groupOf(kind)
			assert.ok(Object.hasOwn(CONCURRENCY_BY_GROUP, group), `${kind} has unknown group ${group}`)
		}
		assert.deepEqual(CONCURRENCY_BY_GROUP, {
			image: 1,
			creator: 1,
			"plugin-install": 2,
			"plugin-command": 4,
			pack: 2,
			other: 4,
		})
	})
})

describe("Job queue · scheduling", () => {
	it("serializes image jobs and starts the next one after release", async () => {
		await withQueue(({ repo, queue }) => {
			queue.enqueue(job("image-1"))
			queue.enqueue(job("image-2"))

			assert.equal(queue.next().id, "image-1")
			assert.equal(repo.byId("image-1").status, "running")
			assert.equal(queue.next(), null)
			assert.deepEqual(queue.stats().groups.image, { running: 1, queued: 1, limit: 1 })

			assert.equal(queue.release("image-1").id, "image-2")
			assert.equal(repo.byId("image-2").status, "running")
			assert.deepEqual(queue.stats().groups.image, { running: 1, queued: 0, limit: 1 })
		})
	})

	it("does not enqueue a resource-lock conflict", async () => {
		await withQueue(({ queue }) => {
			queue.enqueue({ ...job("plugin-1", "plugin.install"), resourceKey: "plugin:demo" })
			assert.throws(
				() => queue.enqueue({ ...job("plugin-2", "plugin.install"), resourceKey: "plugin:demo" }),
				(error) => error.code === "LOCKED" && error.status === 423 && error.details.jobId === "plugin-1",
			)
		})
	})

	it("cancels queued jobs and leaves running cancellation to the runner", async () => {
		await withQueue(({ repo, queue }) => {
			queue.enqueue(job("cancel-queued"))
			assert.equal(queue.cancel("cancel-queued").status, "canceled")
			assert.equal(queue.stats().queued, 0)

			queue.enqueue(job("cancel-running"))
			queue.next()
			assert.throws(() => queue.cancel("cancel-running"), (error) => error.code === "JOB_NOT_CANCELABLE" && error.status === 423)
			assert.equal(repo.byId("cancel-running").status, "running")
		})
	})

	it("accepts a new job object once without re-inserting it", async () => {
		const inserted = []
		const repo = {
			insert(input) { inserted.push(input); return { id: input.id, kind: input.kind, status: "queued" } },
			byId(id) { return inserted.find((job) => job.id === id) ? { id, kind: "about.check-updates", status: "queued" } : null },
			transition(id, status) { return { id, kind: "about.check-updates", status } },
		}
		const queue = createQueue({ repo, tickMs: 60_000 })
		try {
			const job = queue.enqueue({ id: "once", kind: "about.check-updates", input: {} })
			assert.equal(job.id, "once")
			assert.equal(inserted.length, 1)
		} finally {
			queue.stop()
		}
	})
})

describe("Job queue · timeout", () => {
	it("expires an idle queued job when the timer check advances", async () => {
		let currentTime = 0
		await withQueue(({ repo, queue }) => {
			queue.enqueue(job("timeout-job"))
			currentTime = 101
			const expired = queue.expire()
			assert.equal(expired.length, 0)
			currentTime = 1_001
			assert.equal(queue.expire().length, 1)
			assert.equal(repo.byId("timeout-job").status, "canceled")
		}, { now: () => currentTime, queueTimeoutMs: 1_000, tickMs: 50 })
	})
})
