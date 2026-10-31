import { createServer } from "node:http"
import { randomUUID, timingSafeEqual } from "node:crypto"
import { createRequire } from "node:module"

import { ApiError, MAX_BODY_BYTES } from "../http/middleware.js"

const require = createRequire(import.meta.url)
const { readBoundedResponseBuffer } = require("../../../apps/desktop/src/services/bounded-response-body.js")
const { sanitizeLogText } = require("../../../apps/desktop/src/services/log-safety.js")

const HOST = "127.0.0.1"
const NETWORK_RESPONSE_MAX_BYTES = 128 * 1024
const CAPABILITY_HEADER = "x-openpet-capability"
const CAPABILITIES = Object.freeze([
	"pet:say",
	"pet:play-action",
	"pet:event",
	"pet:attention",
	"trigger-proposals:write",
	"model:image-generate",
	"settings:read",
	"logs:write",
	"network:fetch",
	"creator:model-settings",
	"creator:model-health-check",
	"creator:model-image-generate",
	"creator:hatch-pet-plan",
	"creator:hatch-pet-evaluate",
])
const PERMISSION_FOR_CAPABILITY = Object.freeze({
	"pet:say": "pet:say",
	"pet:play-action": "pet:action",
	"pet:event": "pet:event",
	"pet:attention": "pet:attention",
	"trigger-proposals:write": "trigger-proposals:write",
	"model:image-generate": "model:image-generate",
	"settings:read": "settings:read",
	"logs:write": "logs:write",
	"network:fetch": "network",
	"creator:model-settings": "model:image-generate",
	"creator:model-health-check": "model:image-generate",
	"creator:model-image-generate": "model:image-generate",
	"creator:hatch-pet-plan": "model:image-generate",
	"creator:hatch-pet-evaluate": "model:image-generate",
})

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function bearerToken(header = "") {
	const match = String(header).match(/^Bearer\s+(.+)$/i)
	return match?.[1] ?? ""
}

function tokensEqual(left, right) {
	const candidate = Buffer.from(String(left ?? ""))
	const expected = Buffer.from(String(right ?? ""))
	return candidate.byteLength === expected.byteLength && timingSafeEqual(candidate, expected)
}

function requireMethod(owner, method, message) {
	if (typeof owner?.[method] !== "function") throw new ApiError("BACKEND_UNAVAILABLE", message)
	return owner[method].bind(owner)
}

function statusFor(error) {
	return error instanceof ApiError ? error.status : 500
}

function sendJson(response, status, body) {
	if (response.destroyed || response.writableEnded) return
	const payload = Buffer.from(JSON.stringify(body), "utf8")
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": String(payload.byteLength),
		"cache-control": "no-store",
	})
	response.end(payload)
}

async function readJsonBody(request) {
	const contentType = String(request.headers["content-type"] ?? "").toLowerCase()
	if (!contentType.startsWith("application/json")) {
		throw new ApiError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json")
	}
	const chunks = []
	let bytes = 0
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		bytes += buffer.byteLength
		if (bytes > MAX_BODY_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "Plugin runtime request body is too large")
		chunks.push(buffer)
	}
	if (bytes === 0) return {}
	try {
		const parsed = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"))
		if (!isRecord(parsed)) throw new SyntaxError("body must be an object")
		return parsed
	} catch (cause) {
		throw new ApiError("VALIDATION_FAILED", "Plugin runtime request body must be a JSON object", { cause })
	}
}

function publicHeaders(headers) {
	if (!headers || typeof headers.entries !== "function") return {}
	return Object.fromEntries(headers.entries())
}

export function createPluginRuntimeServer({ shell, plugins, settings, jobs, network, logs, creator, logger, now = Date.now } = {}) {
	if (!plugins || typeof plugins.get !== "function") throw new TypeError("plugin runtime server requires plugins")
	let server = null
	let starting = null
	const sessions = new Map()
	const tokenToPlugin = new Map()

	function authorizedPlugin(pluginId, capability) {
		if (!CAPABILITIES.includes(capability)) {
			throw new ApiError("VALIDATION_FAILED", "Unknown plugin runtime capability", {
				details: { capability },
			})
		}
		const plugin = plugins.get(pluginId)
		const permission = PERMISSION_FOR_CAPABILITY[capability]
		if (!Array.isArray(plugin?.permissions) || !plugin.permissions.includes(permission)) {
			throw new ApiError("PERMISSION_DENIED", `Plugin ${pluginId} does not have ${permission} permission`, {
				details: { pluginId, capability, permission },
			})
		}
		return plugin
	}

	async function handleCapability(pluginId, capability, payload = {}, { signal } = {}) {
		const plugin = authorizedPlugin(pluginId, capability)
		const body = isRecord(payload) ? payload : {}
		switch (capability) {
			case "pet:say": {
				const text = String(body.text ?? "")
				if (!text) throw new ApiError("VALIDATION_FAILED", "pet:say text is required")
				const durationMs = body.durationMs ?? body.ttlMs
				const message = {
					type: "pet.say",
					text,
					...(durationMs === undefined ? {} : { durationMs: Number(durationMs) }),
				}
				requireMethod(shell, "send", "Shell reverse channel is unavailable")(message)
				return { ok: true }
			}
			case "pet:play-action": {
				const actionId = String(body.actionId ?? "")
				if (!actionId) throw new ApiError("VALIDATION_FAILED", "pet:play-action actionId is required")
				requireMethod(shell, "send", "Shell reverse channel is unavailable")({
					type: "pet.playAction",
					actionId,
					...(body.loop === undefined ? {} : { loop: Boolean(body.loop) }),
				})
				return { ok: true }
			}
			case "pet:event": {
				const name = String(body.name ?? body.type ?? "")
				if (!name) throw new ApiError("VALIDATION_FAILED", "pet:event name is required")
				requireMethod(shell, "send", "Shell reverse channel is unavailable")({
					type: "pet.event",
					name,
					...(body.payload === undefined ? {} : { payload: body.payload }),
				})
				return { ok: true }
			}
			case "pet:attention": {
				if (pluginId !== "openpet.agent-awareness") {
					throw new ApiError("PERMISSION_DENIED", "pet:attention is reserved for Agent Awareness")
				}
				const allowed = new Set(["sessionKey", "status", "eventId", "ttlMs", "activeTurn"])
				if (Object.keys(body).some((key) => !allowed.has(key))) {
					throw new ApiError("VALIDATION_FAILED", "pet:attention contains unsupported fields")
				}
				const sessionKey = typeof body.sessionKey === "string" ? body.sessionKey : ""
				const statuses = ["idle", "thinking", "working", "waiting", "blocked", "completed", "failed", "compacting"]
				if (!/^[a-f0-9]{12}$/.test(sessionKey) || !statuses.includes(body.status)) {
					throw new ApiError("VALIDATION_FAILED", "pet:attention sessionKey or status is invalid")
				}
				if (body.eventId !== undefined && (typeof body.eventId !== "string" || body.eventId.length < 1 || body.eventId.length > 128)) {
					throw new ApiError("VALIDATION_FAILED", "pet:attention eventId is invalid")
				}
				if (body.ttlMs !== undefined && (typeof body.ttlMs !== "number" || !Number.isFinite(body.ttlMs) || body.ttlMs < 0 || body.ttlMs > 600000)) {
					throw new ApiError("VALIDATION_FAILED", "pet:attention ttlMs is invalid")
				}
				if (body.activeTurn !== undefined && typeof body.activeTurn !== "boolean") {
					throw new ApiError("VALIDATION_FAILED", "pet:attention activeTurn is invalid")
				}
				requireMethod(shell, "send", "Shell reverse channel is unavailable")({
					type: "pet.attention",
					source: "agent-awareness",
					sessionKey,
					status: body.status,
					...(body.eventId === undefined ? {} : { eventId: body.eventId }),
					...(body.ttlMs === undefined ? {} : { ttlMs: body.ttlMs }),
					...(body.activeTurn === undefined ? {} : { activeTurn: body.activeTurn }),
				})
				return { ok: true }
			}
			case "trigger-proposals:write":
				return requireMethod(plugins, "submitTriggerProposal", "Plugin trigger proposal service is unavailable")(pluginId, body)
			case "model:image-generate": {
				const insert = requireMethod(jobs, "insert", "Image Job service is unavailable")
				const input = { pluginId, ...structuredClone(body) }
				const job = insert({
				id: `image-generate:${randomUUID()}`,
					kind: "image.generate",
					input: { redacted: true, summary: "Image generation input withheld" },
					privateInput: input,
					resourceKey: `plugin:${pluginId}`,
				})
				return { jobId: job.id }
			}
			case "creator:model-settings":
				return requireMethod(creator, "modelSettings", "Creator model settings are unavailable")(pluginId)
			case "creator:model-health-check":
				return { ok: true, result: await requireMethod(creator, "modelHealthCheck", "Creator model health check is unavailable")(pluginId, { signal }) }
			case "creator:model-image-generate":
				return { ok: true, result: await requireMethod(creator, "modelImageGenerate", "Creator model image generation is unavailable")(pluginId, body, { signal }) }
			case "creator:hatch-pet-plan":
				return { ok: true, result: await requireMethod(creator, "hatchPetPlan", "Creator hatch-pet planning is unavailable")(pluginId, body, { signal }) }
			case "creator:hatch-pet-evaluate":
				return { ok: true, result: await requireMethod(creator, "hatchPetEvaluate", "Creator hatch-pet evaluation is unavailable")(pluginId, body, { signal }) }
			case "settings:read":
				return requireMethod(settings, "read", "Settings service is unavailable")()
			case "logs:write": {
				const message = sanitizeLogText(body.message, { maxChars: 240 })
				if (!message) throw new ApiError("VALIDATION_FAILED", "Plugin log message is required")
				const level = ["info", "warn", "error"].includes(body.level) ? body.level : "info"
				requireMethod(logs, "appendPlugin", "Plugin logs service is unavailable")({
					pluginId,
					level,
					message,
					at: now(),
				})
				return { ok: true }
			}
			case "network:fetch": {
				const controller = new AbortController()
				const abort = () => controller.abort(signal?.reason)
				if (signal?.aborted) abort()
				else signal?.addEventListener?.("abort", abort, { once: true })
				try {
					const response = await requireMethod(network, "fetch", "Plugin network service is unavailable")(plugin, body, { signal: controller.signal })
					const buffer = await readBoundedResponseBuffer(response, {
						maxBytes: NETWORK_RESPONSE_MAX_BYTES,
						sizeErrorMessage: `Plugin network response exceeds ${NETWORK_RESPONSE_MAX_BYTES} bytes`,
						controller,
					})
					return {
						ok: Boolean(response?.ok ?? (Number(response?.status) >= 200 && Number(response?.status) < 300)),
						status: Number(response?.status) || 0,
						headers: publicHeaders(response?.headers),
						body: buffer.toString("utf8"),
					}
				} finally {
					signal?.removeEventListener?.("abort", abort)
				}
			}
		}
		throw new ApiError("VALIDATION_FAILED", "Unknown plugin runtime capability", { details: { capability } })
	}

	async function handleRequest(request, response) {
		const controller = new AbortController()
		const abort = () => {
			if (!controller.signal.aborted) controller.abort(new Error("Plugin runtime client disconnected"))
		}
		const closed = () => { if (!response.writableEnded) abort() }
		request.once("aborted", abort)
		response.once("close", closed)
		try {
			if (request.method !== "POST") {
				sendJson(response, 404, { ok: false, error: "Not found" })
				return
			}
			const token = bearerToken(request.headers.authorization)
			const pluginId = tokenToPlugin.get(token)
			const session = pluginId ? sessions.get(pluginId) : null
			if (!session || !tokensEqual(token, session.token)) {
				sendJson(response, 401, { ok: false, error: "Unauthorized" })
				return
			}
			const pathname = new URL(request.url, `http://${HOST}`).pathname
			const legacyCapability = {
				"/pet/say": "pet:say",
				"/pet/action": "pet:play-action",
				"/pet/play-action": "pet:play-action",
				"/pet/event": "pet:event",
				"/pet/attention": "pet:attention",
				"/trigger-proposals/write": "trigger-proposals:write",
				"/model/image-generate": "model:image-generate",
				"/settings/read": "settings:read",
				"/logs/write": "logs:write",
				"/network/fetch": "network:fetch",
				"/creator/model-settings": "creator:model-settings",
				"/creator/model-health-check": "creator:model-health-check",
				"/creator/model-image-generate": "creator:model-image-generate",
				"/creator/hatch-pet/plan": "creator:hatch-pet-plan",
				"/creator/hatch-pet/evaluate": "creator:hatch-pet-evaluate",
			}[pathname]
			const headerCapability = String(request.headers[CAPABILITY_HEADER] ?? "")
			// Legacy paths are fixed aliases. Do not let a caller rewrite the
			// operation by pairing a different capability header with the path.
			if (pathname !== "/" && (!legacyCapability || (headerCapability && headerCapability !== legacyCapability))) {
				sendJson(response, 404, { ok: false, error: "Not found" })
				return
			}
			const capability = headerCapability || legacyCapability
			if (!capability) {
				sendJson(response, 404, { ok: false, error: "Not found" })
				return
			}
			const result = await handleCapability(session.pluginId, capability, await readJsonBody(request), { signal: controller.signal })
			sendJson(response, 200, result)
		} catch (error) {
			if (statusFor(error) >= 500) logger?.error?.("Plugin runtime bridge request failed", { error: String(error) })
			sendJson(response, statusFor(error), { ok: false, error: error?.message ?? "Plugin runtime request failed", code: error?.code ?? "INTERNAL" })
		} finally {
			request.off("aborted", abort)
			response.off("close", closed)
		}
	}

	async function ensureServer() {
		if (server?.listening) return
		if (starting) return starting
		starting = new Promise((resolve, reject) => {
			const next = createServer((request, response) => void handleRequest(request, response))
			next.requestTimeout = 0
			next.once("error", (error) => {
				if (server === next) server = null
				reject(error)
			})
			next.listen(0, HOST, () => {
				next.removeAllListeners("error")
				server = next
				server.unref?.()
				resolve()
			})
		}).finally(() => { starting = null })
		return starting
	}

	async function listen({ pluginId, token } = {}) {
		if (typeof pluginId !== "string" || !pluginId || typeof token !== "string" || !token) {
			throw new ApiError("VALIDATION_FAILED", "plugin runtime listen requires pluginId and token")
		}
		await ensureServer()
		const existing = sessions.get(pluginId)
		if (existing) {
			if (!tokensEqual(token, existing.token)) throw new ApiError("CONFLICT", "Plugin runtime session is already active")
			return { host: HOST, port: server.address().port, url: `http://${HOST}:${server.address().port}`, token: existing.token }
		}
		if (tokenToPlugin.has(token)) throw new ApiError("CONFLICT", "Plugin runtime token is already active")
		sessions.set(pluginId, { pluginId, token })
		tokenToPlugin.set(token, pluginId)
		const port = server.address().port
		return { host: HOST, port, url: `http://${HOST}:${port}`, token }
	}

	async function close() {
		const current = server
		server = null
		for (const [pluginId, session] of sessions) {
			sessions.delete(pluginId)
			tokenToPlugin.delete(session.token)
		}
		starting = null
		if (!current) return
		current.closeAllConnections?.()
		await new Promise((resolve) => current.close(() => resolve()))
	}

	async function closePlugin(pluginId) {
		const session = sessions.get(pluginId)
		if (!session) return
		sessions.delete(pluginId)
		tokenToPlugin.delete(session.token)
		if (sessions.size === 0) await close()
	}

	return { listen, close, closePlugin, handleCapability }
}

export { CAPABILITIES as PLUGIN_RUNTIME_CAPABILITIES, NETWORK_RESPONSE_MAX_BYTES as PLUGIN_NETWORK_RESPONSE_MAX_BYTES }
export const PLUGIN_RUNTIME_PERMISSIONS = Object.freeze([...new Set(Object.values(PERMISSION_FOR_CAPABILITY))])
