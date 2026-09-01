"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { after, before, describe, it } = require("node:test")

let createJobsRepository
let migrate
let openDatabase
let recoverJobs

before(async () => {
	;({ createJobsRepository } = await import("../../services/backend/store/repositories/jobs.js"))
	;({ migrate } = await import("../../services/backend/store/migrate.js"))
	;({ openDatabase } = await import("../../services/backend/store/db.js"))
	;({ recoverJobs } = await import("../../services/backend/jobs/recovery.js"))
})

function makeJob(id, kind = "image.generate") {
	return { id, kind, input: { redacted: true }, resourceKey: null }
}

async function withRepository(run) {
	const db = await openDatabase({ file: ":memory:" })
	try {
		migrate({ db })
		return await run(createJobsRepository({ db, now: () => 1_000 }))
	} finally {
		db.close()
	}
}

describe("Job 启动恢复", () => {
	it("中断 running 后重新入队,保留重启错误并清理临时目录", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-recovery-"))
		fs.mkdirSync(path.join(tmpDir, "job-running"))
		fs.writeFileSync(path.join(tmpDir, "job-running", "partial.bin"), "partial")
		fs.mkdirSync(path.join(tmpDir, "job-queued"))
		fs.mkdirSync(path.join(tmpDir, "keep-me"))
		const events = []
		try {
			await withRepository((repo) => {
				repo.insert(makeJob("running-a"))
				repo.insert(makeJob("running-b", "creator.workflow"))
				repo.insert(makeJob("queued-c"))
				repo.transition("running-a", "running")
				repo.transition("running-b", "running")

				const result = recoverJobs({ repo, tmpDir, emit: (...args) => events.push(args) })
				assert.deepEqual(result.interrupted, ["running-b", "running-a"])
				assert.deepEqual(result.requeued, ["running-b", "running-a", "queued-c"])
				assert.equal(result.tmpRemoved, 2)
				assert.equal(repo.byId("running-a").status, "queued")
				assert.equal(repo.byId("running-a").error.code, "BACKEND_RESTARTED")
				assert.equal(repo.byId("running-a").attempt, 2)
				assert.equal(repo.byId("queued-c").status, "queued")
				assert.equal(repo.byId("queued-c").error, null)
				assert.deepEqual(events, [["system.jobs-recovered", {
					interrupted: ["running-b", "running-a"],
					requeued: ["running-b", "running-a", "queued-c"],
				}]])
			})
			assert.equal(fs.existsSync(path.join(tmpDir, "keep-me")), true)
			assert.equal(fs.existsSync(path.join(tmpDir, "job-running")), false)
			assert.equal(fs.existsSync(path.join(tmpDir, "job-queued")), false)
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})

	it("重复执行幂等且不改动终态任务", async () => {
		await withRepository((repo) => {
			repo.insert(makeJob("running"))
			repo.insert(makeJob("succeeded"))
			repo.transition("running", "running")
			repo.transition("succeeded", "running")
			repo.finish("succeeded", { status: "succeeded", result: { ok: true } })

			const first = recoverJobs({ repo })
			const second = recoverJobs({ repo })
			assert.equal(first.interrupted.length, 1)
			assert.equal(second.interrupted.length, 0)
			assert.deepEqual(second.requeued, ["running"])
			assert.equal(repo.byId("succeeded").status, "succeeded")
			assert.deepEqual(repo.byId("succeeded").result, { ok: true })
		})
	})

	it("redacted plugin commands cannot survive restart as queued work", async () => {
		await withRepository((repo) => {
			for (const [id, running] of [["running-command", true], ["queued-command", false]]) {
				repo.insert({
					id,
					kind: "plugin.command",
					input: { pluginId: "demo", command: "send", args: { secret: "must-not-persist" } },
					resourceKey: null,
				})
				if (running) repo.transition(id, "running")
			}

			const result = recoverJobs({ repo })
			assert.deepEqual(result.interrupted.sort(), ["queued-command", "running-command"])
			assert.deepEqual(result.requeued, [])
			for (const id of ["running-command", "queued-command"]) {
				const job = repo.byId(id)
				assert.equal(job.status, "interrupted")
				assert.equal(job.error.code, "BACKEND_RESTARTED")
				assert.equal(job.error.retryable, true)
				assert.equal(job.input.redacted, true)
			}
		})
	})
})
