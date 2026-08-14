import { z } from "zod"

/**
 * SSE 主题与事件目录 —— 见 docs/refactor/03-api-contract.md §5。
 *
 * 本文件是「后端实际发出的事件名」的唯一枚举源。
 * scripts/check-api-contract.mjs 会拿 EVENT_NAMES / EVENT_TOPIC 与文档 §5
 * 的表格逐字对账 —— 03 §5 曾漏登 system.jobs-recovered 与 system.events-dropped
 * 两项,就是因为它们只写在子系统篇里而没回归到契约。
 */

export const SSE_TOPICS = ["pet", "jobs", "plugins", "ai", "logs", "settings", "catalog", "system"] as const
export type SseTopic = (typeof SSE_TOPICS)[number]

/** system 无论是否出现在 ?topics= 里都会下发:降级与关闭通知不能被漏订 */
export const ALWAYS_DELIVERED_TOPICS = ["system"] as const

/** 前端默认订阅集合。logs 只在日志面板打开时追加订阅。 */
export const DEFAULT_SUBSCRIBED_TOPICS = ["pet", "jobs", "plugins", "ai", "settings", "catalog"] as const

export const EVENT_NAMES = [
  "job.created",
  "job.progress",
  "job.succeeded",
  "job.failed",
  "job.canceled",
  "plugin.installed",
  "plugin.removed",
  "plugin.status-changed",
  "plugin.log",
  "ai.chat-delta",
  "ai.chat-done",
  "ai.talk-utterance",
  "pet.pack-activated",
  "pet.actions-changed",
  "settings.changed",
  "catalog.refreshed",
  "log.appended",
  "backend.shutting-down",
  "backend.degraded",
  "system.jobs-recovered",
  "system.events-dropped",
] as const
export type EventName = (typeof EVENT_NAMES)[number]

export const EVENT_TOPIC: Record<EventName, SseTopic> = {
  "job.created": "jobs",
  "job.progress": "jobs",
  "job.succeeded": "jobs",
  "job.failed": "jobs",
  "job.canceled": "jobs",
  "plugin.installed": "plugins",
  "plugin.removed": "plugins",
  "plugin.status-changed": "plugins",
  "plugin.log": "plugins",
  "ai.chat-delta": "ai",
  "ai.chat-done": "ai",
  "ai.talk-utterance": "ai",
  "pet.pack-activated": "pet",
  "pet.actions-changed": "pet",
  "settings.changed": "settings",
  "catalog.refreshed": "catalog",
  "log.appended": "logs",
  "backend.shutting-down": "system",
  "backend.degraded": "system",
  "system.jobs-recovered": "system",
  "system.events-dropped": "system",
}

/** 心跳:后端每 15s 发一行 ": ping" 注释 */
export const SSE_HEARTBEAT_MS = 15_000

/** 前端 45s 无帧即重连 */
export const SSE_RECONNECT_AFTER_SILENCE_MS = 45_000

/** 重连退避。不用 EventSource(它带不了 Authorization),走 fetch + ReadableStream。 */
export const SSE_RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000] as const

/** 单连接缓冲上限,超限丢最旧的 log.appended 并发一条 system.events-dropped */
export const SSE_BUFFER_MAX_FRAMES = 1_000

/** 后端重启后的 Job 恢复结果 —— 见 04 §2.6 */
export const jobsRecoveredSchema = z.object({
  interrupted: z.array(z.string()),
  requeued: z.array(z.string()),
})
export type JobsRecovered = z.infer<typeof jobsRecoveredSchema>

/** 背压丢帧通告。前端收到即视为本地缓存不再可信,需全量重拉受影响 topic。 */
export const eventsDroppedSchema = z.object({
  topic: z.enum(SSE_TOPICS),
  dropped: z.number().int().positive(),
  since: z.string(),
})
export type EventsDropped = z.infer<typeof eventsDroppedSchema>

export const backendDegradedSchema = z.object({ reason: z.string().min(1) })

export const isEventName = (name: string): name is EventName =>
  (EVENT_NAMES as readonly string[]).includes(name)

export const topicOf = (name: EventName): SseTopic => EVENT_TOPIC[name]
