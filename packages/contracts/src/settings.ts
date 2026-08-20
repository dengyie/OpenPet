import { z } from "zod"

/**
 * 设置读写契约 —— 见 docs/refactor/03-api-contract.md §4.2。
 *
 * 关键变更:SETTINGS_SAVE 不得直译为 PUT /settings。
 * 现状是全量读-改-写,拆成两个进程后必然丢写。改为 PATCH + 版本号乐观锁,
 * 冲突返 409 CONFLICT,由前端重拉后重放。
 */

export const settingsPatchRequestSchema = z.object({
  /** 前端上次读到的 version。不匹配即 409,不做静默覆盖。 */
  ifVersion: z.number().int().nonnegative(),
  /** 只提交变更过的字段,键为点分路径,如 "pet.scale" */
  patch: z.record(z.string(), z.unknown()),
})
export type SettingsPatchRequest = z.infer<typeof settingsPatchRequestSchema>

export const settingsPatchResponseSchema = z.object({
  version: z.number().int().nonnegative(),
  changedPaths: z.array(z.string()),
})
export type SettingsPatchResponse = z.infer<typeof settingsPatchResponseSchema>

export const settingsEnvelopeSchema = z.object({
  version: z.number().int().nonnegative(),
  /** 已脱敏:密钥类字段只返回存在性与尾号 */
  values: z.record(z.string(), z.unknown()),
})
export type SettingsEnvelope = z.infer<typeof settingsEnvelopeSchema>

/** settings.changed 只告知变更路径,前端据此决定失效哪些 query */
export const settingsChangedSchema = z.object({
  paths: z.array(z.string()).min(1),
  version: z.number().int().nonnegative(),
})
export type SettingsChanged = z.infer<typeof settingsChangedSchema>

/** 密钥类字段的对外形状:任何响应体都不得含明文 */
export const secretStatusSchema = z.object({
  configured: z.boolean(),
  maskedTail: z.string().nullable(),
})
export type SecretStatus = z.infer<typeof secretStatusSchema>

/** 进程内缓存 GET /settings 的时长 —— 03 §10 的超标处理手段 */
export const SETTINGS_CACHE_TTL_MS = 5_000
