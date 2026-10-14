import { randomUUID } from "node:crypto"
import { aiBehaviorConfigPatchSchema, aiBehaviorDryRunPayloadSchema, aiBehaviorRuleSchema } from "@openpet/contracts"
import { ApiError, sendSuccess } from "../http/middleware.js"

export const AI_SECRET_ROUTES = Object.freeze([
	"PUT /ai/providers/:id/key",
	"DELETE /ai/providers/:id/key",
])

export const AI_ROUTES = Object.freeze([
	"POST /ai/images/generate",
	"GET /ai/images/config",
	"PATCH /ai/images/config",
	"PUT /ai/images/key",
	"DELETE /ai/images/key",
])
export const AI_TALK_ROUTES = Object.freeze([
	"GET /ai/config",
	"PATCH /ai/config",
	"POST /ai/providers/:id/test",
	"GET /ai/providers/:id/models",
	"GET /ai/persona",
	"PUT /ai/persona",
	"POST /ai/persona/draft",
	"GET /ai/memories",
	"POST /ai/memories",
	"DELETE /ai/memories/:id",
	"DELETE /ai/memories/pet-pack",
	"POST /ai/chat",
	"GET /ai/conversations",
	"GET /ai/conversations/:id",
	"DELETE /ai/conversations/:id",
	"POST /ai/talk/start",
	"POST /ai/talk/stop",
	"GET /ai/behavior",
	"PATCH /ai/behavior",
	"GET /ai/behavior/rules",
	"POST /ai/behavior/rules",
	"PATCH /ai/behavior/rules/:id",
	"DELETE /ai/behavior/rules/:id",
	"POST /ai/behavior/dry-run",
	"GET /ai/traces",
	"POST /ai/traces/export",
	"GET /ai/hatch/agents",
	"GET /ai/hatch/config",
	"PATCH /ai/hatch/config",
	"PUT /ai/hatch/key",
	"DELETE /ai/hatch/key",
	"POST /ai/hatch/capability",
	"GET /ai/hatch/runs/:runId",
	"POST /ai/hatch/start",
	"GET /ai/hatch/budget",
	"POST /ai/behavior/decisions/:id/replay",
	"GET /ai/behavior/diagnostics",
	"DELETE /ai/behavior/decisions",
	"GET /ai/images/health",
	"GET /ai/images/models",
])

const PROVIDER_KEY_IDS = new Set(["ai.default", "ai.vision"])

const AI_QUERY_FIELDS = new Map([
	["GET /ai/conversations", ["entrypoint", "petPackId"]],
	["GET /ai/traces", ["conversationId"]],
	["GET /ai/hatch/budget", ["runId"]],
])

function apiKey(body) {
	if (body === null || typeof body !== "object" || Array.isArray(body) || typeof body.apiKey !== "string" || body.apiKey.length > 4096 || Object.keys(body).some((key) => key !== "apiKey")) {
		throw new ApiError("VALIDATION_FAILED", "apiKey is required", { details: { field: "apiKey" } })
	}
	return body.apiKey
}

function maskedProviderKey(value) {
	return { configured: true, maskedTail: value.length > 4 ? "…" + value.slice(-4) : "…" }
}

function providerKeyView(result, fallback) {
	return {
		configured: result?.configured === true,
		maskedTail: typeof result?.maskedTail === "string" ? result.maskedTail : maskedProviderKey(fallback).maskedTail,
	}
}

function providerKeyId(value) {
	if (typeof value !== "string" || !PROVIDER_KEY_IDS.has(value)) {
		throw new ApiError("VALIDATION_FAILED", "Provider id is not supported", { details: { field: "providerId" } })
	}
	return value
}

async function persistProviderKey(operation) {
	try {
		return await operation()
	} catch (cause) {
		if (cause instanceof ApiError) throw cause
		throw new ApiError("BACKEND_UNAVAILABLE", "Provider key persistence unavailable", { cause })
	}
}

function imageApiKey(body) {
	const value = apiKey(body).trim()
	if (!value || value.length > 4096) throw new ApiError("VALIDATION_FAILED", "Image API key is invalid")
	return value
}

function containsCredential(value) {
	if (Array.isArray(value)) return value.some(containsCredential)
	if (!value || typeof value !== "object") return false
	return Object.entries(value).some(([key, entry]) => /api.?key|password|secret|token|credential/i.test(key) || containsCredential(entry))
}

export function registerAiSecretRoutes(router, { secrets, onChanged } = {}) {
	if (!router || typeof router.put !== "function" || typeof router.delete !== "function") {
		throw new TypeError("registerAiSecretRoutes requires router")
	}
	if (!secrets || typeof secrets.set !== "function" || typeof secrets.clear !== "function") {
		throw new TypeError("registerAiSecretRoutes requires secrets service")
	}
	const register = (method, path, handler) => registerAiRoute(router, method, path, handler)

	register("put", "/ai/providers/:id/key", async (ctx) => {
		const value = apiKey(ctx.body)
		const result = await persistProviderKey(() => secrets.set(providerKeyId(ctx.params.id), value))
		onChanged?.()
		return sendSuccess(ctx, providerKeyView(result, value))
	})
	register("delete", "/ai/providers/:id/key", async (ctx) => {
		await persistProviderKey(() => secrets.clear(providerKeyId(ctx.params.id)))
		onChanged?.()
		return sendSuccess(ctx, { configured: false, maskedTail: "" })
	})
}

const IMAGE_CONFIG_FIELDS = new Set(["provider", "baseUrl", "model", "organization", "project", "timeoutMs", "maxConcurrentJobs"])

function validateImageConfig(value) {
	const config = bodyObject(value)
	if (Object.keys(config).some((key) => !IMAGE_CONFIG_FIELDS.has(key))) throw new ApiError("VALIDATION_FAILED", "Image config contains unsupported fields")
	for (const key of ["provider", "baseUrl", "model", "organization", "project"]) {
		if (config[key] !== undefined && (typeof config[key] !== "string" || config[key].length > 2000)) throw new ApiError("VALIDATION_FAILED", `Image config ${key} is invalid`)
	}
	if (config.provider !== undefined && !["openai-compatible", "openai"].includes(config.provider)) throw new ApiError("VALIDATION_FAILED", "Image provider is unsupported")
	if (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 300000)) throw new ApiError("VALIDATION_FAILED", "Image timeoutMs is invalid")
	if (config.maxConcurrentJobs !== undefined && (!Number.isInteger(config.maxConcurrentJobs) || config.maxConcurrentJobs < 1 || config.maxConcurrentJobs > 8)) throw new ApiError("VALIDATION_FAILED", "Image maxConcurrentJobs is invalid")
	return structuredClone(config)
}

function requireImageAi(ai) {
	if (!ai || typeof ai.getConfig !== "function" || typeof ai.saveConfig !== "function" || typeof ai.saveProviderApiKey !== "function" || typeof ai.clearProviderApiKey !== "function") {
		throw new ApiError("BACKEND_UNAVAILABLE", "Image AI service unavailable")
	}
	return ai
}

export function registerAiRoutes(router, { jobs, ai, secrets } = {}) {
	if (!router || ["get", "post", "put", "patch", "delete"].some((method) => typeof router[method] !== "function")) throw new TypeError("registerAiRoutes requires router")
	const register = (method, path, handler) => registerAiRoute(router, method, path, handler)
	register("post", "/ai/images/generate", (ctx) => {
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const input = ctx.body
		if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError("VALIDATION_FAILED", "Image generation input is required")
		if (containsCredential(input)) {
			throw new ApiError("VALIDATION_FAILED", "Image generation credentials are host-managed")
		}
		const job = jobs.insert({
			id: `image-generate:${randomUUID()}`,
			kind: "image.generate",
			input: { redacted: true, summary: "Image generation input withheld" },
			privateInput: input,
		})
		return sendSuccess(ctx, { jobId: job.id }, 202)
	})
	register("get", "/ai/images/config", async (ctx) => sendSuccess(ctx, await requireImageAi(ai).getConfig()))
	register("patch", "/ai/images/config", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["config"])
		return sendSuccess(ctx, await requireImageAi(ai).saveConfig(validateImageConfig(body.config)))
	})
	register("put", "/ai/images/key", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["apiKey"])
		const result = await requireImageAi(ai).saveProviderApiKey(imageApiKey(body))
		return sendSuccess(ctx, { apiKeyRef: result.apiKeyRef, hasApiKey: result.hasApiKey, apiKeyPreview: result.apiKeyPreview })
	})
	register("delete", "/ai/images/key", async (ctx) => sendSuccess(ctx, await requireImageAi(ai).clearProviderApiKey()))
}

function bodyObject(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("VALIDATION_FAILED", "Request body must be an object")
	return value
}

function exactBodyKeys(body, allowed) {
	if (Object.keys(body).some((key) => !allowed.includes(key))) throw new ApiError("VALIDATION_FAILED", "Request body contains unsupported fields")
}

function boundedQueryString(value, field, { required = false } = {}) {
	if (value === undefined) {
		if (required) throw new ApiError("VALIDATION_FAILED", `${field} is required`)
		return undefined
	}
	if (typeof value !== "string" || value.length > 160 || (required && !value.trim())) throw new ApiError("VALIDATION_FAILED", `${field} is invalid`)
	return value.trim()
}

function exactQueryKeys(query, allowed, label, hasDuplicateQueryKeys = false) {
	if (hasDuplicateQueryKeys || Object.keys(query ?? {}).some((key) => !allowed.includes(key))) throw new ApiError("VALIDATION_FAILED", `${label} contains unsupported query fields`)
}

function registerAiRoute(router, method, path, handler) {
	const route = `${method.toUpperCase()} ${path}`
	const register = router[method]
	if (typeof register !== "function") throw new TypeError(`AI router does not support ${method.toUpperCase()}`)
	register.call(router, path, async (ctx) => {
		exactQueryKeys(ctx.query, AI_QUERY_FIELDS.get(route) ?? [], route, ctx.hasDuplicateQueryKeys)
		return handler(ctx)
	})
}

function chatBody(value) {
	const body = bodyObject(value)
	exactBodyKeys(body, ["message", "conversationId", "entrypoint", "requestId"])
	if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 4000) throw new ApiError("VALIDATION_FAILED", "message must be a non-empty string up to 4000 characters")
	for (const key of ["conversationId", "entrypoint", "requestId"]) {
		if (body[key] !== undefined && (typeof body[key] !== "string" || body[key].length > 160)) throw new ApiError("VALIDATION_FAILED", key + " is invalid")
	}
	return {
		message: body.message.trim(),
		...(body.conversationId === undefined ? {} : { conversationId: body.conversationId.trim() }),
		...(body.entrypoint === undefined ? {} : { entrypoint: body.entrypoint.trim() }),
		...(body.requestId === undefined ? {} : { requestId: body.requestId.trim() }),
	}
}

function traceFilters(value) {
	const filters = bodyObject(value)
	if (Object.keys(filters).some((key) => !["petPackId", "conversationId"].includes(key))) throw new ApiError("VALIDATION_FAILED", "Trace filters contain unsupported fields")
	for (const key of ["petPackId", "conversationId"]) {
		if (filters[key] !== undefined && (typeof filters[key] !== "string" || filters[key].length > 160)) throw new ApiError("VALIDATION_FAILED", key + " is invalid")
	}
	return {
		...(filters.petPackId === undefined ? {} : { petPackId: filters.petPackId.trim() }),
		...(filters.conversationId === undefined ? {} : { conversationId: filters.conversationId.trim() }),
	}
}

function behaviorRuleId(value) {
	if (typeof value !== "string" || !value.trim()) throw new ApiError("VALIDATION_FAILED", "rule id is required")
	return value.trim()
}

function validateBehaviorDryRun(body) {
	if (!aiBehaviorDryRunPayloadSchema.safeParse(body).success) throw new ApiError("VALIDATION_FAILED", "Behavior dry-run payload is invalid")
}

function validateBehaviorConfigPatch(value) {
	const parsed = aiBehaviorConfigPatchSchema.safeParse(value)
	if (!parsed.success) throw new ApiError("VALIDATION_FAILED", "Behavior config is invalid")
	return parsed.data
}

function validateBehaviorRule(value, label = "Behavior rule") {
	const parsed = aiBehaviorRuleSchema.safeParse(value)
	if (!parsed.success) throw new ApiError("VALIDATION_FAILED", `${label} is invalid`)
	return parsed.data
}

function behaviorDecisionId(value) {
	const id = Number(value)
	if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError("VALIDATION_FAILED", "decision id is invalid")
	return id
}

export function validateHatchRunId(value) {
	if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) throw new ApiError("VALIDATION_FAILED", "runId is invalid")
	return value
}

export function validateHatchConfig(value) {
	const config = bodyObject(value)
	const fields = new Set(["enabled", "configMode", "provider", "baseUrl", "model", "requireIdentityReviewBeforeActions", "budgets"])
	if (Object.keys(config).some((key) => !fields.has(key))) throw new ApiError("VALIDATION_FAILED", "Hatch config contains unsupported fields")
	for (const key of ["enabled", "requireIdentityReviewBeforeActions"]) if (config[key] !== undefined && typeof config[key] !== "boolean") throw new ApiError("VALIDATION_FAILED", "Hatch config " + key + " is invalid")
	if (config.configMode !== undefined && !["follow-chat", "override"].includes(config.configMode)) throw new ApiError("VALIDATION_FAILED", "Hatch configMode is invalid")
	for (const key of ["provider", "baseUrl", "model"]) if (config[key] !== undefined && (typeof config[key] !== "string" || config[key].length > 2000)) throw new ApiError("VALIDATION_FAILED", "Hatch config " + key + " is invalid")
	if (config.budgets !== undefined) {
		const limits = { maxIdentityRegenerations: [0, 10], maxActionAttemptsPerAction: [1, 20], maxEvaluationAttemptsPerArtifact: [1, 10], maxProviderCalls: [1, 1000], maxElapsedMs: [1000, 86400000], maxEstimatedCost: [0.01, 100000] }
		if (!isPlainObject(config.budgets) || Object.keys(config.budgets).some((key) => !Object.hasOwn(limits, key))) throw new ApiError("VALIDATION_FAILED", "Hatch budgets are invalid")
		for (const [key, [min, max]] of Object.entries(limits)) {
			const entry = config.budgets[key]
			if (entry !== undefined && !(key === "maxEstimatedCost" && entry === null) && (typeof entry !== "number" || !Number.isFinite(entry) || entry < min || entry > max)) throw new ApiError("VALIDATION_FAILED", "Hatch budget " + key + " is invalid")
		}
	}
	return structuredClone(config)
}

export function validateHatchStart(value) {
	const body = bodyObject(value)
	exactBodyKeys(body, ["runId", "mode", "userIntent", "stage", "scope", "workflowEvidence"])
	const runId = validateHatchRunId(body.runId)
	if (body.mode !== undefined && !["single-action", "full-pet"].includes(body.mode)) throw new ApiError("VALIDATION_FAILED", "mode is invalid")
	if (body.stage !== undefined && (typeof body.stage !== "string" || body.stage.length > 80)) throw new ApiError("VALIDATION_FAILED", "stage is invalid")
	if (body.userIntent !== undefined && (typeof body.userIntent !== "string" || body.userIntent.length > 2000)) throw new ApiError("VALIDATION_FAILED", "userIntent is invalid")
	const scope = body.scope === undefined ? {} : bodyObject(body.scope)
	if (Object.keys(scope).some((key) => key !== "actionId") || (scope.actionId !== undefined && (typeof scope.actionId !== "string" || scope.actionId.length > 80))) throw new ApiError("VALIDATION_FAILED", "scope is invalid")
	const evidence = body.workflowEvidence === undefined ? {} : bodyObject(body.workflowEvidence)
	const provider = evidence.provider === undefined ? {} : bodyObject(evidence.provider)
	if (Object.keys(evidence).some((key) => key !== "provider") || Object.keys(provider).some((key) => !["ready", "code", "message", "provider", "model"].includes(key))) throw new ApiError("VALIDATION_FAILED", "workflowEvidence is invalid")
	if (provider.ready !== undefined && typeof provider.ready !== "boolean") throw new ApiError("VALIDATION_FAILED", "workflowEvidence.provider.ready is invalid")
	for (const key of ["code", "message", "provider", "model"]) if (provider[key] !== undefined && (typeof provider[key] !== "string" || provider[key].length > (key === "message" ? 240 : 160))) throw new ApiError("VALIDATION_FAILED", "workflowEvidence.provider." + key + " is invalid")
	return {
		runId,
		...(body.mode === undefined ? {} : { mode: body.mode }),
		...(body.userIntent === undefined ? {} : { userIntent: body.userIntent }),
		...(body.stage === undefined ? {} : { stage: body.stage }),
		scope: structuredClone(scope),
		workflowEvidence: { provider: structuredClone(provider) },
	}
}

export function registerAiTalkRoutes(router, { talk, jobs, emit, logger } = {}) {
	if (!router || typeof router.get !== "function" || typeof router.put !== "function" || typeof router.post !== "function" || typeof router.delete !== "function") throw new TypeError("registerAiTalkRoutes requires router")
	if (!talk || typeof talk.getPersona !== "function") throw new TypeError("registerAiTalkRoutes requires AI talk service")
	// Keep a partially assembled/degraded AI service behind the same typed
	// dependency boundary as a disconnected Shell. Route tests and startup
	// diagnostics should receive a retryable 503 instead of a leaked TypeError.
	talk = new Proxy(talk, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver)
			if (typeof value === "function") return value.bind(target)
			return () => { throw new ApiError("BACKEND_UNAVAILABLE", "AI talk service unavailable") }
		},
	})
	const register = (method, path, handler) => registerAiRoute(router, method, path, handler)
	register("get", "/ai/config", async (ctx) => {
		return sendSuccess(ctx, await talk.getConfig())
	})
	register("patch", "/ai/config", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["config"])
		return sendSuccess(ctx, await talk.saveConfig(body.config))
	})
	register("post", "/ai/providers/:id/test", async (ctx) => {
		if (ctx.body !== null && ctx.body !== undefined) exactBodyKeys(bodyObject(ctx.body), [])
		return sendSuccess(ctx, await talk.testProvider(ctx.params.id))
	})
	register("get", "/ai/providers/:id/models", async (ctx) => {
		return sendSuccess(ctx, await talk.discoverModels(ctx.params.id))
	})
	register("get", "/ai/persona", async (ctx) => {
		return sendSuccess(ctx, await talk.getPersona())
	})
	register("put", "/ai/persona", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["override"])
		return sendSuccess(ctx, await talk.savePersona(body.override))
	})
	register("post", "/ai/persona/draft", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["instruction"])
		if (typeof body.instruction !== "string" || body.instruction.length > 2000) throw new ApiError("VALIDATION_FAILED", "instruction must be a string up to 2000 characters")
		return sendSuccess(ctx, await talk.generatePersonaDraft({ instruction: body.instruction }))
	})
	register("get", "/ai/memories", async (ctx) => sendSuccess(ctx, await talk.getMemoryProfile()))
	register("post", "/ai/memories", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["memory"])
		return sendSuccess(ctx, await talk.createMemory(body.memory))
	})
	register("delete", "/ai/memories/pet-pack", async (ctx) => {
		return sendSuccess(ctx, await talk.clearPetPackMemories())
	})
	register("delete", "/ai/memories/:id", async (ctx) => sendSuccess(ctx, await talk.deleteMemory(boundedQueryString(ctx.params.id, "memoryId", { required: true }))))
	register("post", "/ai/chat", async (ctx) => {
		const body = chatBody(ctx.body)
		const requestId = body.requestId || `ai-chat:${randomUUID()}`
		let resolveDisconnected
		const disconnected = new Promise((resolve) => { resolveDisconnected = resolve })
		const onClose = () => {
			if (!ctx.res.writableEnded) resolveDisconnected()
		}
		ctx.res.once("close", onClose)
		if (ctx.res.destroyed && !ctx.res.writableEnded) onClose()

		const chat = Promise.resolve()
			.then(() => talk.chat({ ...body, requestId }))
			.then((result) => ({ result }), (error) => ({ error }))
		const outcome = await Promise.race([
			chat,
			disconnected.then(() => ({ disconnected: true })),
		])
		ctx.res.off("close", onClose)
		if (outcome.disconnected) {
			ctx.hijacked = true
			void Promise.resolve()
				.then(() => talk.stopTalk(requestId))
				.catch((error) => {
					const code = typeof error?.code === "string" && /^[A-Z_]{1,64}$/.test(error.code)
						? error.code
						: "BACKEND_UNAVAILABLE"
					logger?.warn?.("AI chat cancellation request failed", { requestId, code })
				})
			return
		}
		if (Object.hasOwn(outcome, "error")) throw outcome.error
		const result = outcome.result
		if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.reply !== "string" || typeof result.conversationId !== "string" || !result.conversationId.trim()) {
			throw new ApiError("INTERNAL", "AI chat domain returned an invalid result")
		}
		if (Object.keys(result).some((key) => !["reply", "conversationId", "bubble", "bubbleSegments", "behaviorIntent", "behavior", "messages", "state", "action", "requestId", "providerLatencyMs", "canceled", "partialReply"].includes(key))) {
			throw new ApiError("INTERNAL", "AI chat domain returned unsupported fields")
		}
		ctx.res.writeHead(200, {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache, no-store",
			connection: "keep-alive",
			"x-accel-buffering": "no",
		})
		ctx.hijacked = true
		const conversationId = result?.conversationId || body.conversationId || ""
		const delta = { conversationId, delta: String(result?.reply || "") }
		emit?.("ai.chat-delta", delta)
		emit?.("ai.chat-done", { ...result, conversationId })
		ctx.res.write(`event: ai.chat-delta\ndata: ${JSON.stringify(delta)}\n\n`)
		ctx.res.write(`event: ai.chat-done\ndata: ${JSON.stringify({ ...result, conversationId })}\n\n`)
		ctx.res.end()
		return result
	})
	register("get", "/ai/conversations", async (ctx) => {
		return sendSuccess(ctx, await talk.listConversations({
			entrypoint: boundedQueryString(ctx.query.entrypoint, "entrypoint"),
			petPackId: boundedQueryString(ctx.query.petPackId, "petPackId"),
		}))
	})
	register("get", "/ai/conversations/:id", async (ctx) => sendSuccess(ctx, await talk.getConversation(boundedQueryString(ctx.params.id, "conversationId", { required: true }))))
	register("delete", "/ai/conversations/:id", async (ctx) => sendSuccess(ctx, await talk.deleteConversation(boundedQueryString(ctx.params.id, "conversationId", { required: true }))))
	register("post", "/ai/talk/start", async (ctx) => {
		const body = chatBody(ctx.body)
		return sendSuccess(ctx, await talk.startTalk(body))
	})
	register("post", "/ai/talk/stop", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["requestId"])
		return sendSuccess(ctx, await talk.stopTalk(boundedQueryString(body.requestId, "requestId", { required: true })))
	})
	register("get", "/ai/behavior", async (ctx) => sendSuccess(ctx, await talk.getBehavior()))
	register("post", "/ai/behavior/decisions/:id/replay", async (ctx) => {
		if (ctx.body !== null && ctx.body !== undefined) exactBodyKeys(bodyObject(ctx.body), [])
		return sendSuccess(ctx, await talk.replayBehaviorDecision(behaviorDecisionId(ctx.params.id)))
	})
	register("get", "/ai/behavior/diagnostics", async (ctx) => sendSuccess(ctx, { content: await talk.exportBehaviorDiagnostics() }))
	register("delete", "/ai/behavior/decisions", async (ctx) => {
		return sendSuccess(ctx, await talk.clearBehaviorDecisions())
	})
	register("patch", "/ai/behavior", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["config"])
		return sendSuccess(ctx, await talk.saveBehavior(validateBehaviorConfigPatch(body.config)))
	})
	register("get", "/ai/behavior/rules", async (ctx) => {
		const config = await talk.getBehavior()
		return sendSuccess(ctx, { rules: Array.isArray(config?.rules) ? config.rules : [] })
	})
	register("post", "/ai/behavior/rules", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["rule"])
		return sendSuccess(ctx, await talk.createBehaviorRule(validateBehaviorRule(body.rule)))
	})
	register("patch", "/ai/behavior/rules/:id", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["patch"])
		return sendSuccess(ctx, await talk.updateBehaviorRule(behaviorRuleId(ctx.params.id), validateBehaviorRule(body.patch, "Behavior rule patch")))
	})
	register("delete", "/ai/behavior/rules/:id", async (ctx) => sendSuccess(ctx, await talk.deleteBehaviorRule(behaviorRuleId(ctx.params.id))))
	register("post", "/ai/behavior/dry-run", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["reply", "behaviorIntent", "rules"])
		if (typeof body.reply !== "string") throw new ApiError("VALIDATION_FAILED", "reply must be a string")
		validateBehaviorDryRun(body)
		return sendSuccess(ctx, await talk.dryRunBehavior(body))
	})
	register("get", "/ai/traces", async (ctx) => {
		const conversationId = ctx.query?.conversationId
		if (typeof conversationId !== "string" || !conversationId.trim() || conversationId.length > 160) throw new ApiError("VALIDATION_FAILED", "conversationId is invalid")
		return sendSuccess(ctx, await talk.getTrace(conversationId.trim()))
	})
	register("post", "/ai/traces/export", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["filters"])
		return sendSuccess(ctx, await talk.exportTrace(traceFilters(body.filters)))
	})
	register("get", "/ai/hatch/agents", async (ctx) => sendSuccess(ctx, await talk.getHatchAgents()))
	register("get", "/ai/hatch/config", async (ctx) => {
		return sendSuccess(ctx, await talk.getHatchConfig())
	})
	register("patch", "/ai/hatch/config", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["config"])
		return sendSuccess(ctx, await talk.saveHatchConfig(validateHatchConfig(body.config)))
	})
	register("put", "/ai/hatch/key", async (ctx) => {
		const body = bodyObject(ctx.body)
		exactBodyKeys(body, ["apiKey"])
		if (typeof body.apiKey !== "string" || !body.apiKey.trim() || body.apiKey.length > 4096) throw new ApiError("VALIDATION_FAILED", "apiKey is invalid")
		const result = await talk.saveHatchApiKey(body.apiKey)
		return sendSuccess(ctx, { apiKeyRef: result.apiKeyRef, hasApiKey: result.hasApiKey, updatedAt: result.updatedAt })
	})
	register("delete", "/ai/hatch/key", async (ctx) => {
		const result = await talk.clearHatchApiKey()
		return sendSuccess(ctx, { apiKeyRef: result.apiKeyRef, hasApiKey: result.hasApiKey, updatedAt: result.updatedAt })
	})
	register("post", "/ai/hatch/capability", async (ctx) => {
		if (ctx.body !== null && ctx.body !== undefined) exactBodyKeys(bodyObject(ctx.body), [])
		return sendSuccess(ctx, await talk.checkHatchCapability())
	})
	register("get", "/ai/hatch/runs/:runId", async (ctx) => sendSuccess(ctx, await talk.getHatchRunStatus(validateHatchRunId(ctx.params.runId))))
	register("post", "/ai/hatch/start", async (ctx) => {
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Hatch Job service unavailable")
		const input = validateHatchStart(ctx.body)
		const job = jobs.insert({ id: "hatch-start:" + randomUUID(), kind: "hatch.run", resourceKey: "hatch:" + input.runId, input })
		return sendSuccess(ctx, { jobId: job.id }, 202)
	})
	register("get", "/ai/hatch/budget", async (ctx) => {
		const runId = ctx.query?.runId
		if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) throw new ApiError("VALIDATION_FAILED", "runId is invalid")
		return sendSuccess(ctx, await talk.getHatchBudget(runId))
	})
	register("get", "/ai/images/health", async (ctx) => {
		return sendSuccess(ctx, await talk.checkImageHealth({}))
	})
	register("get", "/ai/images/models", async (ctx) => {
		return sendSuccess(ctx, await talk.discoverImageModels({}))
	})
}
