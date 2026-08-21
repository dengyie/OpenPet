"use strict"

// Job 状态机单元测试 —— 跑法:npm run test:backend
//
// 刻意不碰 Electron、不碰 SQLite。状态机是纯函数,所以这是整个后端里第一块
// 能在裸 node 下被完整验证的逻辑 —— 六条 spike 全红也不影响这个文件跑通。
//
// tests/ 属于根包(CJS),而 services/backend 是 ESM,所以用动态 import()。

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { before, describe, it } = require("node:test")

const MIGRATION_PATH = path.join(
	__dirname,
	"..",
	"..",
	"services",
	"backend",
	"store",
	"migrations",
	"001_init.sql",
)

// 04 篇 §2.2 的状态图,逐条列出。共 9 条合法边。
const LEGAL_TRANSITIONS = [
	["queued", "running"],
	["queued", "canceled"],
	["running", "succeeded"],
	["running", "failed"],
	["running", "canceled"],
	["running", "interrupted"],
	["failed", "queued"],
	["canceled", "queued"],
	["interrupted", "queued"],
]

const ILLEGAL_TRANSITIONS = [
	["queued", "succeeded"],
	["queued", "failed"],
	["queued", "interrupted"],
	["running", "queued"],
	["succeeded", "queued"],
	["succeeded", "running"],
	["succeeded", "failed"],
	["failed", "running"],
	["failed", "succeeded"],
	["canceled", "running"],
	["interrupted", "running"],
]

const TERMINAL = ["succeeded", "failed", "canceled", "interrupted"]

let sm

before(async () => {
	sm = await import("../../services/backend/jobs/state-machine.js")
})

describe("状态机 · 常量", () => {
	it("6 个状态,17 个 kind,且均不重复", () => {
		assert.equal(sm.JOB_STATUSES.length, 6)
		assert.equal(new Set(sm.JOB_STATUSES).size, 6)
		assert.equal(sm.JOB_KINDS.length, 17)
		assert.equal(new Set(sm.JOB_KINDS).size, 17, "kind 不得重复")
	})

	it("isJobStatus 只认枚举内的值,不被原型链污染", () => {
		for (const status of sm.JOB_STATUSES) {
			assert.equal(sm.isJobStatus(status), true, status + " 应该被认出")
		}
		assert.equal(sm.isJobStatus("toString"), false)
		assert.equal(sm.isJobStatus("constructor"), false)
		assert.equal(sm.isJobStatus(undefined), false)
		assert.equal(sm.isJobStatus("QUEUED"), false, "大小写敏感")
	})

	it("活跃、终态、可重试三个集合划分正确", () => {
		assert.deepEqual(Array.from(sm.ACTIVE_STATUSES).sort(), ["queued", "running"])
		assert.deepEqual(Array.from(sm.TERMINAL_STATUSES).sort(), TERMINAL.slice().sort())
		// API contract 仅允许 failed / interrupted 由用户显式重试。
		assert.equal(sm.RETRYABLE_STATUSES.has("succeeded"), false)
		assert.deepEqual(
			Array.from(sm.RETRYABLE_STATUSES).sort(),
			["failed", "interrupted"],
		)
	})
})

describe("状态机 · 流转", () => {
	it("9 条合法边全部放行", () => {
		for (const [from, to] of LEGAL_TRANSITIONS) {
			assert.equal(sm.canTransition(from, to), true, from + " -> " + to + " 应该合法")
			assert.equal(sm.assertTransition(from, to), to)
		}
	})

	it("36 个组合里恰好只有 9 条合法", () => {
		let legal = 0
		for (const from of sm.JOB_STATUSES) {
			for (const to of sm.JOB_STATUSES) {
				if (sm.canTransition(from, to)) legal += 1
			}
		}
		// 这条断言是防「情急之下随手给状态机开后门」的 —— 新增一条边就必须先改测试。
		assert.equal(legal, LEGAL_TRANSITIONS.length)
	})

	it("非法流转报 CONFLICT / 409,并带上允许的目标", () => {
		for (const [from, to] of ILLEGAL_TRANSITIONS) {
			assert.equal(sm.canTransition(from, to), false, from + " -> " + to + " 应该非法")
			assert.throws(
				() => sm.assertTransition(from, to, { jobId: "job-1" }),
				(error) => {
					assert.equal(error.name, "ApiError")
					assert.equal(error.code, "CONFLICT")
					assert.equal(error.status, 409)
					assert.equal(error.details.jobId, "job-1")
					assert.deepEqual(error.details.allowed, sm.nextStatuses(from))
					return true
				},
			)
		}
	})

	it("succeeded 是死胡同", () => {
		assert.deepEqual(sm.nextStatuses("succeeded"), [])
		assert.equal(sm.isTerminal("succeeded"), true)
	})

	it("未知状态报 INTERNAL,而不是默默放行", () => {
		for (const bad of [["nope", "running"], ["queued", "nope"]]) {
			assert.throws(
				() => sm.assertTransition(bad[0], bad[1]),
				(error) => {
					assert.equal(error.code, "INTERNAL")
					assert.equal(error.status, 500)
					return true
				},
			)
		}
	})
})

describe("状态机 · 取消", () => {
	it("queued 与普通 running 可取消", () => {
		assert.equal(sm.isCancelable({ status: "queued" }), true)
		assert.equal(sm.isCancelable({ status: "running" }), true)
		assert.equal(sm.isCancelable({ status: "running", phase: "rendering" }), true)
	})

	it("finalizing 阶段不可取消(04 篇 §2.5)", () => {
		assert.equal(sm.isCancelable({ status: "running", phase: "finalizing" }), false)
	})

	it("终态一律不可取消", () => {
		for (const status of TERMINAL) {
			assert.equal(sm.isCancelable({ status }), false, status + " 不应该可取消")
		}
	})

	it("assertCancelable 报 JOB_NOT_CANCELABLE / 423 且不可重试", () => {
		const cases = [
			{ id: "job-a", status: "running", phase: "finalizing" },
			{ id: "job-b", status: "succeeded" },
			{ id: "job-c", status: "canceled" },
		]
		for (const job of cases) {
			assert.throws(
				() => sm.assertCancelable(job),
				(error) => {
					// JOB_NOT_CANCELABLE 是专用业务码,不在 middleware 的通用码表里,
					// 所以 status 必须由抛出方显式给到 —— 这条就是盯它的。
					assert.equal(error.code, "JOB_NOT_CANCELABLE")
					assert.equal(error.status, 423)
					assert.equal(error.retryable, false)
					assert.equal(error.details.jobId, job.id)
					return true
				},
			)
		}
	})
})

describe("状态机 · 重试预算", () => {
	it("恰好 9 个 kind 的 maxAttempts 为 2,其余为 1", () => {
		const keys = Object.keys(sm.MAX_ATTEMPTS_BY_KIND)
		assert.equal(keys.length, 9)
		for (const key of keys) {
			// 漂移护栏:写错 kind 名字会默默退化成不重试,这里直接报错。
			assert.equal(sm.isJobKind(key), true, key + " 不是合法 kind")
			assert.equal(sm.MAX_ATTEMPTS_BY_KIND[key], 2)
		}
		assert.equal(sm.maxAttemptsFor("image.generate"), 2)
		assert.equal(sm.maxAttemptsFor("creator.export"), 1)
		assert.equal(sm.maxAttemptsFor("store.migrate"), 1)
		assert.equal(sm.maxAttemptsFor("不存在的kind"), sm.DEFAULT_MAX_ATTEMPTS)
	})

	it("canRetry 看状态也看剩余次数", () => {
		assert.equal(sm.canRetry({ status: "failed", kind: "image.generate", attempt: 1 }), true)
		assert.equal(sm.canRetry({ status: "failed", kind: "image.generate", attempt: 2 }), false)
		assert.equal(sm.canRetry({ status: "failed", kind: "creator.export", attempt: 1 }), false)
		assert.equal(sm.canRetry({ status: "interrupted", kind: "hatch.run", attempt: 1 }), true)
		assert.equal(sm.canRetry({ status: "succeeded", kind: "image.generate", attempt: 1 }), false)
		assert.equal(sm.canRetry({ status: "running", kind: "image.generate", attempt: 1 }), false)
		// 显式 maxAttempts 覆盖 kind 默认值。
		assert.equal(
			sm.canRetry({ status: "failed", kind: "creator.export", attempt: 1, maxAttempts: 3 }),
			true,
		)
	})

	it("assertRetry 对两种失败给不同的 details", () => {
		assert.throws(
			() => sm.assertRetry({ id: "job-x", status: "running" }),
			(error) => {
				assert.equal(error.code, "CONFLICT")
				assert.equal(error.details.status, "running")
				return true
			},
		)
		assert.throws(
			() => sm.assertRetry({ id: "job-y", status: "failed", kind: "image.generate", attempt: 2 }),
			(error) => {
				assert.equal(error.code, "CONFLICT")
				assert.equal(error.details.attempt, 2)
				assert.equal(error.details.maxAttempts, 2)
				return true
			},
		)
	})

	it("中断错误用固定的 BACKEND_RESTARTED", () => {
		const error = sm.interruptionError()
		assert.equal(error.code, "BACKEND_RESTARTED")
		assert.equal(error.code, sm.INTERRUPTED_ERROR_CODE)
		assert.equal(error.retryable, true)
	})
})

describe("状态机 · 与 001_init.sql 的一致性", () => {
	it("ACTIVE_STATUSES 等于 idx_jobs_resource_active 的 WHERE 子句", () => {
		// 这是本文件最有价值的一条。两处不同步时,代码以为锁已释放,而部分唯一
		// 索引仍然拦着 INSERT,表现为莫名其妙的 SQLITE_CONSTRAINT。靠人看看不住。
		const sql = fs.readFileSync(MIGRATION_PATH, "utf8")
		const match = sql.match(/idx_jobs_resource_active[\s\S]*?WHERE status IN \(([^)]+)\)/)
		assert.ok(match, "在 001_init.sql 里找不到 idx_jobs_resource_active 的 WHERE 子句")
		const fromSql = match[1]
			.split(",")
			.map((piece) => piece.trim().replace(/^'|'$/g, ""))
			.sort()
		assert.deepEqual(fromSql, Array.from(sm.ACTIVE_STATUSES).sort())
	})

	it("001_init.sql 建了 04 篇 §3.4 的 9 张表", () => {
		const sql = fs.readFileSync(MIGRATION_PATH, "utf8")
		assert.equal((sql.match(/CREATE TABLE/g) || []).length, 9)
		for (const table of [
			"ai_conversations",
			"ai_messages",
			"ai_memories",
			"jobs",
			"job_events",
			"plugin_logs",
			"http_access_logs",
			"traces",
			"schema_migrations",
		]) {
			assert.ok(sql.includes(table), "缺少表 " + table)
		}
	})
})
