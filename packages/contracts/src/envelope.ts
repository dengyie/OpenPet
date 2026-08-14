import { z } from "zod"

/**
 * 统一响应包装与错误码 —— 见 docs/refactor/03-api-contract.md §1、§2。
 *
 * ERROR_CODES 的顺序与文档 §2.3 表格一致(先 13 个通用码,再 8 个专用业务码)。
 * scripts/check-api-contract.mjs 会逐字对账,改一边必须改另一边。
 */

export const API_BASE_PATH = "/api/v1"

/** 字符串 "v1",不是数字 1。见 03 §7 规则 5。 */
export const API_VERSION = "v1"

/** 请求体上限,与现有 local-http-service.js 的 MAX_BODY_BYTES 一致 */
export const MAX_BODY_BYTES = 1024 * 1024

/** 后端未就绪时前端的排队上限 —— 见 03 §1.2 第 4、5 条 */
export const REQUEST_QUEUE_LIMIT = { maxRequests: 50, maxWaitMs: 10_000 } as const

export const HEADER = {
  authorization: "Authorization",
  contentType: "Content-Type",
  requestId: "X-Request-Id",
  idempotencyKey: "Idempotency-Key",
  client: "X-Client",
} as const

export const CLIENT_KINDS = ["control-center", "pet-window", "mcp"] as const
export type ClientKind = (typeof CLIENT_KINDS)[number]

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "LOCKED",
  "RATE_LIMITED",
  "INTERNAL",
  "PROVIDER_ERROR",
  "BACKEND_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PLUGIN_MANIFEST_INVALID",
  "PLUGIN_ALREADY_RUNNING",
  "PLUGIN_NATIVE_NOT_APPROVED",
  "PET_PACK_INCOMPATIBLE",
  "ACTION_FRAMES_MISSING",
  "AI_KEY_NOT_CONFIGURED",
  "JOB_NOT_CANCELABLE",
  "MIGRATION_REQUIRED",
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

/**
 * 通用码 → HTTP 状态码。
 * 8 个专用业务码搭配 400 / 409 / 423,由抛出点决定,故不在此表。
 */
export const ERROR_HTTP_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  LOCKED: 423,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  PROVIDER_ERROR: 502,
  BACKEND_UNAVAILABLE: 503,
  PROVIDER_TIMEOUT: 504,
} as const satisfies Partial<Record<ErrorCode, number>>

/**
 * 可重试码。前端只允许对「retryable 且请求本身幂等」的调用自动重试;
 * 写操作即使 retryable 也必须带 Idempotency-Key 才能自动重试。
 */
export const RETRYABLE_ERROR_CODES = [
  "CONFLICT",
  "LOCKED",
  "RATE_LIMITED",
  "INTERNAL",
  "PROVIDER_ERROR",
  "BACKEND_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
] as const

export const isRetryableErrorCode = (code: string): boolean =>
  (RETRYABLE_ERROR_CODES as readonly string[]).includes(code)

export const responseMetaSchema = z.object({
  requestId: z.string().min(1),
  elapsedMs: z.number().int().nonnegative().optional(),
})
export type ResponseMeta = z.infer<typeof responseMetaSchema>

export const apiErrorSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),
  requestId: z.string().min(1),
})
export type ApiError = z.infer<typeof apiErrorSchema>

export const apiFailureSchema = z.object({
  ok: z.literal(false),
  error: apiErrorSchema,
})
export type ApiFailure = z.infer<typeof apiFailureSchema>

export const apiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ ok: z.literal(true), data, meta: responseMetaSchema })

export const apiListSchema = <T extends z.ZodTypeAny>(item: T) =>
  apiSuccessSchema(
    z.object({
      items: z.array(item),
      total: z.number().int().nonnegative(),
      cursor: z.string().nullable().optional(),
    }),
  )

export type ApiSuccess<T> = { ok: true; data: T; meta: ResponseMeta }
export type ApiList<T> = ApiSuccess<{ items: T[]; total: number; cursor?: string | null }>
export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export const isApiFailure = <T>(r: ApiResult<T>): r is ApiFailure => r.ok === false
