import { z } from "zod"

/**
 * Job 契约 —— 见 docs/refactor/03-api-contract.md §6 与 04-subsystems.md §2。
 * 长任务(图像生成实测约 265 秒,超时 420 秒)不能走同步请求/响应,统一走 Job。
 */

export const JOB_KINDS = [
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
] as const
export type JobKind = (typeof JOB_KINDS)[number]

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "canceled", "interrupted"] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

/** 已落地、不再变化的状态 */
export const TERMINAL_JOB_STATUSES = ["succeeded", "failed", "canceled"] as const

/** 允许 POST /jobs/{id}/retry 的状态。interrupted 来自后端重启遗留。 */
export const RETRYABLE_JOB_STATUSES = ["failed", "interrupted"] as const

/**
 * 重试次数。03 §6.2 的示例写 maxAttempts: 2,04 §2.5 写默认 1 —— 两者并不冲突:
 * 只有 provider / 网络类任务才自动重试第二次,本地文件与数据库类一律 1 次。
 * 这张表就是那条口径的唯一落点。
 */
export const DEFAULT_MAX_ATTEMPTS = 1
export const NETWORK_MAX_ATTEMPTS = 2

export const MAX_ATTEMPTS_BY_KIND = {
  "image.generate": NETWORK_MAX_ATTEMPTS,
  "sprite.generate": NETWORK_MAX_ATTEMPTS,
  "sprite.evaluate": NETWORK_MAX_ATTEMPTS,
  "creator.character": NETWORK_MAX_ATTEMPTS,
  "creator.workflow": NETWORK_MAX_ATTEMPTS,
  "creator.export": DEFAULT_MAX_ATTEMPTS,
  "hatch.run": NETWORK_MAX_ATTEMPTS,
  "plugin.install": DEFAULT_MAX_ATTEMPTS,
  "plugin.install.github": NETWORK_MAX_ATTEMPTS,
  "plugin.command": DEFAULT_MAX_ATTEMPTS,
  "plugin.sync-bundled": DEFAULT_MAX_ATTEMPTS,
  "pet-pack.import": DEFAULT_MAX_ATTEMPTS,
  "pet-pack.export": DEFAULT_MAX_ATTEMPTS,
  "actions.import-frames": DEFAULT_MAX_ATTEMPTS,
  "catalog.install": NETWORK_MAX_ATTEMPTS,
  "about.check-updates": NETWORK_MAX_ATTEMPTS,
  "store.migrate": DEFAULT_MAX_ATTEMPTS,
} as const satisfies Record<JobKind, number>

/** 进度事件节流窗口 —— 见 04 §2.4 */
export const JOB_PROGRESS_THROTTLE_MS = 500

export const jobProgressSchema = z.object({
  phase: z.string().min(1),
  percent: z.number().min(0).max(100),
  message: z.string().optional(),
})
export type JobProgress = z.infer<typeof jobProgressSchema>

export const jobSchema = z.object({
  jobId: z.string().min(1),
  kind: z.enum(JOB_KINDS),
  status: z.enum(JOB_STATUSES),
  progress: jobProgressSchema.nullable(),
  cancelable: z.boolean(),
  attempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  resourceKey: z.string().nullable().optional(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  result: z.unknown().nullable(),
	error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).nullable(),
	canRetry: z.boolean(),
  /** input 一律脱敏后存储,不得落 prompt 全文以外的密钥类字段 */
  input: z.object({ redacted: z.literal(true), summary: z.string() }),
})
export type Job = z.infer<typeof jobSchema>

/** 所有创建长任务的端点统一返 202 Accepted,body 为此形状 */
export const jobCreatedSchema = z.object({
  jobId: z.string().min(1),
  kind: z.enum(JOB_KINDS),
  status: z.literal("queued"),
  createdAt: z.string(),
  estimatedMs: z.number().int().positive().nullable(),
  pollUrl: z.string().min(1),
})
export type JobCreated = z.infer<typeof jobCreatedSchema>

export const isTerminalJobStatus = (s: string): boolean =>
  (TERMINAL_JOB_STATUSES as readonly string[]).includes(s)

export const isRetryableJobStatus = (s: string): boolean =>
  (RETRYABLE_JOB_STATUSES as readonly string[]).includes(s)
