// HTTP 关注点:错误类型、响应信封、鉴权、body 上限、访问日志。
// 契约来源:docs/refactor/03-api-contract.md §2(信封与错误码)、§8(鉴权)。
//
// 为什么这些都在同一个文件、而不是单独的 errors.js / respond.js:
// 02 篇 §3 的目标目录树里 http/ 只有 router.js 与 middleware.js。为了让代码
// 与文档的目录树严格一致,本文件承担全部「HTTP 关注点」,router.js 只做分发
// 并从这里 import(反向 import 会形成环)。

import { createHash, randomUUID, timingSafeEqual } from "node:crypto"

// 03 篇 §2.3 的 13 个通用错误码 -> HTTP 状态。
//
// ⚠️ 这里**故意只有通用码**。8 个专用业务码(PLUGIN_MANIFEST_INVALID 等)不在
// 这里出现,抛出方必须显式传 status。原因:完整映射的权威副本在
// packages/contracts/src/envelope.ts,而本包还没接入根 workspaces(等 spike 5),
// 现在 import 不到。只复制通用码这一小半,能把漂移面压到最小;接入 workspaces
// 后本常量改为 re-export,并给 check:api-contract 加一条对账。
export const GENERIC_ERROR_HTTP_STATUS = Object.freeze({
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
})

export const RETRYABLE_ERROR_CODES = Object.freeze(
	new Set(["RATE_LIMITED", "INTERNAL", "PROVIDER_ERROR", "BACKEND_UNAVAILABLE", "PROVIDER_TIMEOUT"]),
)

export const MAX_BODY_BYTES = 1024 * 1024

const KNOWN_CLIENTS = Object.freeze(new Set(["control-center", "pet-window", "mcp"]))
const LOOPBACK_HOSTS = Object.freeze(new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]))
const BEARER_PREFIX = "bearer "

export class ApiError extends Error {
	constructor(code, message, options = {}) {
		super(message ?? code)
		this.name = "ApiError"
		this.code = code
		this.status = options.status ?? GENERIC_ERROR_HTTP_STATUS[code] ?? 500
		this.details = options.details ?? null
		this.retryable = options.retryable ?? RETRYABLE_ERROR_CODES.has(code)
		if (options.cause !== undefined) this.cause = options.cause
	}
}

export function elapsedMs(ctx) {
	return Math.round(performance.now() - ctx.startedAt)
}

function writeJson(ctx, status, payload) {
	if (ctx.res.writableEnded) return
	const body = Buffer.from(JSON.stringify(payload), "utf8")
	ctx.res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": String(body.byteLength),
		"cache-control": "no-store",
	})
	ctx.res.end(body)
}

export function sendSuccess(ctx, data, status = 200) {
	writeJson(ctx, status, {
		ok: true,
		data,
		meta: { requestId: ctx.requestId, elapsedMs: elapsedMs(ctx) },
	})
}

export function sendList(ctx, items, options = {}) {
	sendSuccess(ctx, {
		items,
		total: options.total ?? items.length,
		cursor: options.cursor ?? null,
	})
}

export function sendError(ctx, error) {
	const apiError =
		error instanceof ApiError ? error : new ApiError("INTERNAL", "后端内部错误", { cause: error })
	writeJson(ctx, apiError.status, {
		ok: false,
		error: {
			code: apiError.code,
			message: apiError.message,
			details: apiError.details,
			retryable: apiError.retryable,
			requestId: ctx.requestId,
		},
	})
}

export function requestId() {
	return async (ctx, next) => {
		const header = ctx.req.headers["x-request-id"]
		const usable = typeof header === "string" && header.length > 0 && header.length <= 200
		ctx.requestId = usable ? header : randomUUID()
		ctx.res.setHeader("x-request-id", ctx.requestId)
		await next()
	}
}

export function errorBoundary({ logger } = {}) {
	return async (ctx, next) => {
		try {
			await next()
		} catch (error) {
			const isExpected = error instanceof ApiError && error.status < 500
			if (!isExpected) {
				logger?.error?.("请求处理失败", {
					requestId: ctx.requestId,
					method: ctx.method,
					path: ctx.rawPath,
					error: String(error),
					stack: error?.stack,
				})
			}
			sendError(ctx, error)
		}
	}
}

export function loopbackOnly() {
	return async (ctx, next) => {
		// 02 篇 §6:后端只监听回环。listen("127.0.0.1") 已经挡住外部,
		// 这一层是纵深防御 —— 将来若有人误改成 0.0.0.0,请求仍然进不来。
		const remote = ctx.req.socket?.remoteAddress ?? ""
		if (!LOOPBACK_HOSTS.has(remote)) {
			throw new ApiError("PERMISSION_DENIED", "只接受来自回环地址的请求", {
				details: { remoteAddress: remote },
			})
		}
		await next()
	}
}

function digest(value) {
	return createHash("sha256").update(String(value), "utf8").digest()
}

function constantTimeEqual(left, right) {
	// 先摘要再比,长度不同也能走常量时间比较(timingSafeEqual 长度不等会直接抛)。
	return timingSafeEqual(digest(left), digest(right))
}

function readBearer(authorization) {
	if (typeof authorization !== "string") return null
	if (!authorization.toLowerCase().startsWith(BEARER_PREFIX)) return null
	const token = authorization.slice(BEARER_PREFIX.length).trim()
	return token.length > 0 ? token : null
}

function read