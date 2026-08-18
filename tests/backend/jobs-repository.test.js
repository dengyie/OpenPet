"use strict"

const assert = require("node:assert/strict")
const { before, describe, it } = require("node:test")

let createJobsRepository
let migrate
let openDatabase

before(async () => {
	;({ createJobsRepository } = await import("../../services/backend/store/repositories/jobs.js"))
	;({ migrate } = await import("../../services/backend/store/migrate.js"))
	;({ openDatabase } = await import("../../services/backend/store/db.js"))
})

async function withRepository(run, options = {}) {
	const db = await openDatabase({ file: ":memory:" })
	try {
		migrate({ db })
		const repo = createJobsRepository({ db: options.db?.(db) ?? db, now: options.now })
		return await run({ db, repo })
	} finally {
		db.close()
	}
}

function job(id, overrides = {}) {
	return {
		id,
		kind: "image.generate",
		resourceKey: null,
		input: { redacted: true, summary: "test " + id },
		...overrides,
	}
}

describe("Jobs repository · insert 与互斥", () => {
	it("insert 从 queued / attempt 1 开始并按 kind 填 maxAttempts", async () => {
		await withRepository(({ repo }) => {
			const inserted = repo.insert(job("job-defaults", { attempt: 9, maxAttempts: 99 }))

			assert.equal(inserted.id, "job-defaults")
			assert.equal(inserted.status, "queued")
			assert.equal(inserted.attempt, 1)
			assert.equal(inserted.maxAttempts, 2)
			assert.deepEqual(inserted.input, { redacted: true, summary: "test job-defaults" })
		})
	})

	it("同一 resourceKey 的第二个 active Job 由唯一索引转成 LOCKED / 423", async () => {
		await withRepository(({ repo }) => {
			repo.insert(job("job-owner", { resourceKey: "plugin:demo" }))

			assert.throws(
				() => repo.insert(job("job-blocked", { resourceKey: "plugin:demo" })),
				(error) => {
					assert.equal(error.name, "ApiError")
					assert.equal(error.code, "LOCKED")
					assert.equal(error.status, 423)
					assert.equal(error.details.jobId, "job-owner")
					return true
				},
			)
			assert.equal(repo.activeByResourceKey("plugin:demo").id, "job-owner")
		})
	})

	it("Job 进入终态后相同 resourceKey 可以再次插入", async () => {
			const ticks = [1_000, 2_000, 3_000]
		await withRepository(({ repo }) => {
			repo.insert(job("job-first", { resourceKey: "pet-pack:cat" }))
			repo.transition("job-first", "canceled")
			const second = repo.insert(job("job-second", { resourceKey: "pet-pack:cat" }))

			assert.equal(second.id, "job-second")
			assert.equal(repo.activeByResourceKey("pet-pack:cat").id, "job-second")
		}, { now: () => ticks.shift() })
	})
})

describe("Jobs repository · CAS 与状态时间", () => {
	it("读取旧状态后另一写者先转终态时 CAS 抛 CONFLICT", async () => {
		let race = false
		const wrapDb = (raw) => ({
			...raw,
			prepare(sql) {
				const statement = raw.prepare(sql)
				if (!sql.startsWith("UPDATE jobs SET status =")) return statement
				return {
					...statement,
					run(...params) {
						if (race) {
							race = false
							raw.prepare("UPDATE jobs SET status = 'canceled' WHERE id = ?").run(params.at(-2))
						}
						return statement.run(...params)
					},
				}
			},
		})

		await withRepository(({ repo }) => {
			repo.insert(job("job-race"))
			race = true

			assert.throws(
				() => repo.transition("job-race", "running"),
				(error) => {
					assert.equal(error.code, "CONFLICT")
					assert.equal(error.status, 409)
					assert.equal(error.details.jobId, "job-race")
					return true
				},
			)
			assert.equal(repo.byId("job-race").status, "canceled")
		}, { db: wrapDb, now: () => 2_000 })
	})

	it("进入 running 写 startedAt,finish 进终态写 finishedAt 与同形 error", async () => {
		const ticks = [1_000, 2_000, 3_000]
		await withRepository(({ repo }) => {
			repo.insert(job("job-finish", { kind: "creator.export" }))
			const running = repo.transition("job-finish", "running")
			const failed = repo.finish("job-finish", {
				status: "failed",
				error: { code: "PROVIDER_ERROR", message: "boom", details: { attempt: 1 }, retryable: true },
			})

			assert.equal(running.startedAt, 2_000)
			assert.equal(running.attempt, 1)
			assert.equal(running.finishedAt, null)
			assert.equal(failed.finishedAt, 3_000)
			assert.deepEqual(failed.error, {
				code: "PROVIDER_ERROR",
				message: "boom",
				details: { attempt: 1 },
				retryable: true,
			})
		}, { now: () => ticks.shift() })
		})
	})

	it("重试状态回到 queued 时在 CAS 内递增 attempt", async () => {
		await withRepository(({ repo }) => {
			repo.insert(job("job-retry"))
			repo.transition("job-retry", "running")
			repo.finish("job-retry", { status: "failed", error: { code: "INTERNAL", message: "retry" } })

			const queued = repo.transition("job-retry", "queued")
			assert.equal(queued.status, "queued")
			assert.equal(queued.attempt, 2)
		})
	})

describe("Jobs repository · progress、events 与查询", () => {
	it("JSON 字段、事件顺序、过滤列表与状态计数可往返", async () => {
		const ticks = [1_000, 2_000, 3_000, 4_000]
		await withRepository(({ repo }) => {
			repo.insert(job("job-query"))
			repo.setProgress("job-query", { phase: "rendering", percent: 62, message: "3/5" })
			const firstEvent = repo.appendEvent("job-query", { phase: "rendering", percent: 62, message: "3/5" })
			const secondEvent = repo.appendEvent("job-query", { phase: "finalizing", percent: 100 })

			assert.deepEqual(repo.byId("job-query").progress, {
				phase: "rendering",
				percent: 62,
				message: "3/5",
			})
			assert.equal(firstEvent.at, 2_000)
			assert.equal(secondEvent.at, 3_000)
			assert.deepEqual(repo.listEvents("job-query").map(({ phase }) => phase), ["rendering", "finalizing"])
			assert.deepEqual(repo.list({ status: "queued" }).map(({ id }) => id), ["job-query"])
			assert.equal(repo.countByStatus("queued"), 1)
				assert.deepEqual(repo.countByStatus(), { queued: 1 })
			}, { now: () => ticks.shift() })
	})
})
