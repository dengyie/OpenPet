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
			const inserted = repo.insert(job("job-defaults", {
				kind: "creator.workflow",
				attempt: 9,
				maxAttempts: 99,
				input: { redacted: true, summary: "test job-defaults" },
			}))

			assert.equal(inserted.id, "job-defaults")
			assert.equal(inserted.status, "queued")
			assert.equal(inserted.attempt, 1)
			assert.equal(inserted.maxAttempts, 2)
			assert.deepEqual(inserted.input, { redacted: true, summary: "test job-defaults" })
		})
	})

	it("image generation Job input is redacted before persistence and public reads", async () => {
		await withRepository(({ db, repo }) => {
			const input = {
				prompt: "private character prompt",
				referenceImages: [{ path: "/Users/private/pet/reference.png" }],
				output: { dataDir: "/Users/private/OpenPet", dataRelativeDir: "runs/private/frames" },
				apiKey: "sk-image-must-not-persist",
			}
			repo.insert(job("job-private-image", { input }))

			const expected = { redacted: true, summary: "Image generation input withheld" }
			assert.deepEqual(repo.byId("job-private-image").input, expected)
			const persisted = db.prepare("SELECT input_json FROM jobs WHERE id = ?").get("job-private-image").input_json
			assert.deepEqual(JSON.parse(persisted), expected)
			for (const value of [input.prompt, input.referenceImages[0].path, input.output.dataDir, input.apiKey]) {
				assert.equal(persisted.includes(value), false)
			}
		})
	})

	it("Actions import Job input is redacted before persistence and public reads", async () => {
		await withRepository(({ db, repo }) => {
			const input = { selectionId: "selection-private-id", path: "/Users/private/frames", label: "Wave" }
			repo.insert(job("job-private-actions-import", { kind: "actions.import-frames", input }))

			const expected = { redacted: true, summary: "Action frame import input withheld" }
			assert.deepEqual(repo.byId("job-private-actions-import").input, expected)
			const persisted = db.prepare("SELECT input_json FROM jobs WHERE id = ?").get("job-private-actions-import").input_json
			assert.deepEqual(JSON.parse(persisted), expected)
			for (const value of Object.values(input)) assert.equal(persisted.includes(value), false)
		})
	})

	it("repository startup scrubs previously persisted image inputs", async () => {
		await withRepository(({ db }) => {
			db.prepare("INSERT INTO jobs (id, kind, status, input_json, attempt, max_attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
				.run("legacy-image", "image.generate", "queued", JSON.stringify({ prompt: "legacy private prompt", output: { dataDir: "/Users/private" } }), 1, 2, 1)
			const repo = createJobsRepository({ db })
			const persisted = db.prepare("SELECT input_json FROM jobs WHERE id = ?").get("legacy-image").input_json
			assert.deepEqual(JSON.parse(persisted), { redacted: true, summary: "Image generation input withheld" })
			assert.equal(persisted.includes("legacy private prompt"), false)
			assert.equal(repo.byId("legacy-image").input.redacted, true)
		})
	})

	it("repository startup scrubs previously persisted Actions import paths and selection handles", async () => {
		await withRepository(({ db }) => {
			db.prepare("INSERT INTO jobs (id, kind, status, input_json, attempt, max_attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
				.run(
					"legacy-actions-import", "actions.import-frames", "queued",
					JSON.stringify({ selectionId: "selection-private-id", path: "/Users/private/frames", label: "Wave" }),
					1, 1, 1,
				)
			const repo = createJobsRepository({ db })
			const persisted = db.prepare("SELECT input_json FROM jobs WHERE id = ?").get("legacy-actions-import").input_json
			const expected = { redacted: true, summary: "Action frame import input withheld" }
			assert.deepEqual(JSON.parse(persisted), expected)
			assert.deepEqual(repo.byId("legacy-actions-import").input, expected)
			for (const value of ["selection-private-id", "/Users/private/frames", "Wave"]) assert.equal(persisted.includes(value), false)
		})
	})

	it("every repository read hides legacy image input before startup recovery runs", async () => {
		await withRepository(({ db, repo }) => {
			db.prepare("INSERT INTO jobs (id, kind, status, resource_key, input_json, attempt, max_attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
				.run(
					"legacy-image-readable",
					"image.generate",
					"queued",
					"image:legacy",
					JSON.stringify({ prompt: "legacy private prompt", output: { dataDir: "/Users/private" } }),
					1,
					2,
					1,
				)
			const expected = { redacted: true, summary: "Image generation input withheld" }
			assert.deepEqual(repo.list()[0].input, expected)
			assert.deepEqual(repo.activeByResourceKey("image:legacy").input, expected)
		})
	})

	it("every repository read hides legacy Actions import input before startup recovery runs", async () => {
		await withRepository(({ db, repo }) => {
			db.prepare("INSERT INTO jobs (id, kind, status, resource_key, input_json, attempt, max_attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
				.run(
					"legacy-actions-import-readable", "actions.import-frames", "queued", "actions:legacy",
					JSON.stringify({ selectionId: "selection-private-id", path: "/Users/private/frames" }),
					1, 1, 1,
				)
			const expected = { redacted: true, summary: "Action frame import input withheld" }
			assert.deepEqual(repo.list()[0].input, expected)
			assert.deepEqual(repo.activeByResourceKey("actions:legacy").input, expected)
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

	it("retry resource collision returns LOCKED without incrementing attempt", async () => {
		await withRepository(({ repo }) => {
			repo.insert(job("retry-owner", { resourceKey: "shared" }))
			repo.transition("retry-owner", "running")
			repo.finish("retry-owner", { status: "failed" })
			repo.insert(job("new-owner", { resourceKey: "shared" }))

			assert.throws(
				() => repo.transition("retry-owner", "queued"),
				(error) => error.code === "LOCKED" && error.status === 423 && error.details.jobId === "new-owner",
			)
			assert.equal(repo.byId("retry-owner").status, "failed")
			assert.equal(repo.byId("retry-owner").attempt, 1)
		})
	})

	it("increments an automatic retry attempt while keeping the Job running and resource locked", async () => {
		await withRepository(({ repo, db }) => {
			repo.insert(job("retrying-owner", { kind: "catalog.install", resourceKey: "catalog-selection:selection-1" }))
			repo.transition("retrying-owner", "running")
			const retrying = repo.incrementAttempt("retrying-owner")

			assert.equal(retrying.status, "running")
			assert.equal(retrying.attempt, 2)
			assert.throws(
				() => repo.insert(job("retrying-intruder", { kind: "catalog.install", resourceKey: "catalog-selection:selection-1" })),
				(error) => error.code === "LOCKED",
			)
			assert.equal(db.prepare("SELECT attempt FROM jobs WHERE id = ?").get("retrying-owner").attempt, 2)
		})
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

	it("counts filters and removes terminal jobs with cascaded events", async () => {
		await withRepository(({ repo }) => {
			repo.insert(job("queued", { kind: "image.generate" }))
			repo.insert(job("failed", { kind: "creator.export" }))
			repo.transition("failed", "running")
			repo.appendEvent("failed", { phase: "checking", percent: 10 })
			repo.finish("failed", { status: "failed" })
			repo.insert(job("succeeded", { kind: "about.check-updates" }))
			repo.transition("succeeded", "running")
			repo.finish("succeeded", { status: "succeeded" })
			repo.insert(job("retryable", { kind: "about.check-updates" }))
			repo.transition("retryable", "running")
			repo.finish("retryable", { status: "interrupted" })

			assert.equal(repo.count(), 4)
			assert.equal(repo.count({ kind: "about.check-updates" }), 2)
			assert.equal(repo.count({ status: "queued" }), 1)
			assert.equal(repo.countEvents("failed"), 1)
			assert.equal(repo.removeCompleted(), 2)
			assert.deepEqual(repo.list().map(({ id }) => id), ["retryable", "queued"])
			assert.deepEqual(repo.listEvents("failed"), [])
		})
	})
})
