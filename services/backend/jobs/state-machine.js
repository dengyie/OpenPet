// Job 状态机 —— 所有 jobs.status 变更的唯一裁决点。
// 契约来源:docs/refactor/04-subsystems.md §2.2(状态表)、§2.5(取消与重试),
// 以及 docs/refactor/03-api-contract.md §6.2 / §6.3(Job 对象与 17 个 kind)。
//
// 硬规则:任何代码都不得直接写 jobs.status,必须先过 assertTransition()。
// 本模块是纯函数 —— 不碰数据库、不发事件、不读时钟。这样 node --test 能把
// 全部分支覆盖掉,而不需要起一个真实的后端。

import { ApiError } from "../http/middleware.js"

export const JOB_STATUSES = Object.freeze([
	"queued",
	"running",
	"succeeded",
	"failed",
	"canceled",
	"interrupted",
])

/**
 * 「活跃」= 占用 resourceKey 互斥锁的状态。
 *
 * ⚠️ 这个集合必须与 store/migrations/001_init.sql 里
 * `idx_jobs_resource_active ... WHERE status IN ('queued','running')` 完全一致。
 * 两处不同步的后果是:代码认为锁已释放,而部分唯一索引仍然拦着 INSERT,
 * 表现为莫名其妙的 SQLITE_CONSTRAINT。改一处必须改另一处。
 */
export const ACTIVE_STATUSES = Object.freeze(new Set(["queued", "running"]))

/** 终态:不再自行流转(但 failed / canceled / interrupted 可由用户显式重试)。 */
export const TERMINAL_STATUSES = Object.freeze(
	new Set(["succeeded", "failed", "canceled", "interrupted"]),
)

/** 04 篇 §2.2:succeeded 是唯一不可重试的终态。 */
export const RETRYABLE_STATUSES = Object.freeze(new Set(["failed", "canceled", "interrupted"]))

const TRANSITIONS = Object.freeze({
	queued: Object.freeze(new Set(["running", "canceled"])),
	running: Object.freeze(new Set(["succeeded", "failed", "canceled", "interrupted"])),
	succeeded: Object.freeze(new Set()),
	failed: Object.freeze(new Set(["queued"])),
	canceled: Object.freeze(new Set(["queued"])),
	interrupted: Object.freeze(new Set(["queued"])),
})

/** 03 篇 §6.3 的 17 个 kind。顺序无意义,但集合必须与契约一致。 */
export const JOB_KINDS = Object.freeze([
	"image.generate",
	"sprite.generate",
	"sprite.evaluate",
	"creator.character",
	"creator.workflow",
	"creator.export",
	"hatch.run",
	"plugin.install",
	"plugin.install.github",
	"plugin.command",
	"plugin.sync-bundled",
	"pet-pack.import",
	"pet-pack.export",
	"actions.import-frames",
	"catalog.install",
	"about.check-updates",
	"store.migrate",
])

export const DEFAULT_MAX_ATTEMPTS = 1

/**
 * 04 篇 §2.5:默认不重试;provider / 网络类 kind 自动重试 1 次(maxAttempts = 2)。
 * 只列 2 的那 9 个,其余走 DEFAULT_MAX_ATTEMPTS —— 避免写 17 行然后跟契约漂移。
 *
 * 不重试的理由各不相同,别随手加:
 * - plugin.command / creator.export / pet-pack.* / actions.import-frames:有磁盘副作用,
 *   重跑可能产生半成品文件。
 * - store.migrate:重跑迁移是数据事故,必须人工介入。
 * - plugin.install:安装失败通常是 manifest 或权限问题,重试只是重复失败。
 */
export const MAX_ATTEMPTS_BY_KIND = Object.freeze({
	"image.generate": 2,
	"sprite.generate": 2,
	"sprite.evaluate": 2,
	"creator.character": 2,
	"creator.workflow": 2,
	"hatch.run": 2,
	"plugin.install.github": 2,
	"catalog.install": 2,
	"about.check-updates": 2,
})

/**
 * 04 篇 §2.5「不可取消阶段」的落地方式。
 *
 * 文档写的是「如正在写入最终文件」—— 那是阶段属性,不是 kind 属性:同一个
 * image.generate,在 prompting 阶段可以随时取消,在写盘阶段不能。所以判定放在
 * phase 上,runner 在开始写最终产物前必须把 phase 置为 "finalizing"。
 */
export const UNCANCELABLE_PHASES = Object.freeze(new Set(["finalizing"]))

export function isJobStatus(value) {
	return typeof value === "string" && Object.hasOwn(TRANSITIONS, value)
}

export function isJobKind(value) {
	return typeof value === "string" && JOB_KINDS.includes(value)
}

export function isActive(status) {
	return ACTIVE_STATUSES.has(status)
}

export function isTerminal(status) {
	return TERMINAL_STATUSES.has(status)
}

export function maxAttemptsFor(kind) {
	return MAX_ATTEMPTS_BY_KIND[kind] ?? DEFAULT_MAX_ATTEMPTS
}

export function nextStatuses(from) {
	return isJobStatus(from) ? Array.from(TRANSITIONS[from]) : []
}

export function canTransition(from, to) {
	if (!isJobStatus(from) || !isJobStatus(to)) return false
	return TRANSITIONS[from].has(to)
}

/**
 * 校验一次状态流转,不合法就抛 409 CONFLICT。
 *
 * 用 CONFLICT 而不是 VALIDATION_FAILED:非法流转几乎总是并发造成的(两个请求
 * 同时取消,或 runner 完成的同时用户点了取消),而不是入参写错。CONFLICT 让
 * 前端知道「重拉一次就好」,VALIDATION_FAILED 会让人以为是 bug。
 */
export function assertTransition(from, to, context = {}) {
	if (!isJobStatus(from)) {
		throw new ApiError("INTERNAL", "未知的 Job 起始状态:" + String(from), {
			details: { jobId: context.jobId ?? null, from, to },
		})
	}
	if (!isJobStatus(to)) {
		throw new ApiError("INTERNAL", "未知的 Job 目标状态:" + String(to), {
			details: { jobId: context.jobId ?? null, from, to },
		})
	}
	if (!TRANSITIONS[from].has(to)) {
		throw new ApiError("CONFLICT", "Job 不能从 " + from + " 变为 " + to, {
			details: {
				jobId: context.jobId ?? null,
				from,
				to,
				allowed: Array.from(TRANSITIONS[from]),
			},
		})
	}
	return to
}

/** 04 篇 §2.2 的「可取消」列 + §2.5 的不可取消阶段。 */
export function isCancelable(job = {}) {
	const { status, phase = null } = job
	if (status === "queued") return true
	if (status !== "running") return false
	return !UNCANCELABLE_PHASES.has(phase)
}

/**
 * JOB_NOT_CANCELABLE 是 03 篇 §2.3 的 8 个专用业务码之一,不在
 * middleware.js 的通用码表里,所以这里必须显式给 status。
 */
export function assertCancelable(job = {}) {
	if (isCancelable(job)) return true
	if (isTerminal(job.status)) {
		throw new ApiError("JOB_NOT_CANCELABLE", "Job 已处于终态 " + job.status + ",无法取消", {
			status: 423,
			details: { jobId: job.id ?? null, status: job.status ?? null },
		})
	}
	throw new ApiError("JOB_NOT_CANCELABLE", "Job 正处于不可中断阶段,无法取消", {
		status: 423,
		details: { jobId: job.id ?? null, status: job.status ?? null, phase: job.phase ?? null },
	})
}

/** 可重试 = 状态可回到 queued 且还有剩余尝试次数。 */
export function canRetry(job = {}) {
	if (!RETRYABLE_STATUSES.has(job.status)) return false
	const attempt = Number.isFinite(job.attempt) ? job.attempt : 1
	const maxAttempts = Number.isFinite(job.maxAttempts) ? job.maxAttempts : maxAttemptsFor(job.kind)
	return attempt < maxAttempts
}

export function assertRetry(job = {}) {
	if (canRetry(job)) return true
	if (!RETRYABLE_STATUSES.has(job.status)) {
		throw new ApiError("CONFLICT", "只有 failed / canceled / interrupted 的 Job 能重试", {
			details: { jobId: job.id ?? null, status: job.status ?? null },
		})
	}
	throw new ApiError("CONFLICT", "Job 已用尽重试次数", {
		details: {
			jobId: job.id ?? null,
			attempt: job.attempt ?? null,
			maxAttempts: job.maxAttempts ?? maxAttemptsFor(job.kind),
		},
	})
}

/**
 * 04 篇 §2.6 第 1 步:启动恢复时 running -> interrupted。
 * error.code 固定 BACKEND_RESTARTED —— 这个值会进 jobs.error_json,前端据此
 * 区分「后端重启导致的中断」与「任务本身失败」。
 */
export const INTERRUPTED_ERROR_CODE = "BACKEND_RESTARTED"

export function interruptionError(reason = "后端重启,任务被中断") {
	return { code: INTERRUPTED_ERROR_CODE, message: reason, retryable: true }
}
