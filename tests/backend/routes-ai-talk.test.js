"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { test } = require("node:test")

async function withAiTalkServer(talk, run, dependencies = {}) {
	const [{ createRouter }, middleware, { registerAiTalkRoutes }] = await Promise.all([
		import("../../services/backend/http/router.js"),
		import("../../services/backend/http/middleware.js"),
		import("../../services/backend/routes/ai.js"),
	])
	const router = createRouter({ basePath: "/api/v1" })
	router.use(middleware.requestId())
	router.use(middleware.errorBoundary())
	router.use(middleware.jsonBody())
	registerAiTalkRoutes(router, { talk, ...dependencies })
	const server = createServer((req, res) => void router.handle(req, res))
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	try { await run(`http://127.0.0.1:${server.address().port}/api/v1`) }
	finally { await new Promise((resolve) => server.close(resolve)) }
}

test("AI persona and memory routes call only validated Shell domain operations", async () => {
	const { createAiTalkService } = await import("../../services/backend/domains/ai/talk.js")
	const calls = []
	const persona = {
		name: "Cat", identity: "cat", tone: "warm", coreTraits: [],
		speakingStyle: "short", relationshipToUser: "companion", actionStyle: "playful", boundaries: [],
	}
	const profile = {
		petPackId: "cat", petPackDisplayName: "Cat", packPersona: persona,
		overridePersona: { name: "Neko" }, effectivePersona: { ...persona, name: "Neko" },
		compiledPersonaPrompt: "A warm cat.", compiledSystemPrompt: "You are a warm cat.",
	}
	const memories = { petPackId: "cat", petPackDisplayName: "Cat", globalMemories: [], petPackMemories: [], recentJobs: [] }
	const modelCatalog = { cacheKey: "", models: [], fetchedAt: "", source: "none" }
	const aiConfig = {
		enabled: false, provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini",
		apiKeyRef: "ai.default", systemPrompt: "pet", memory: { enabled: false },
		behavior: { enabled: false, useTools: true, cooldownMs: 0, rules: [], decisions: [] },
		vision: {
			mode: "follow-chat", provider: "openai-compatible", baseUrl: "https://api.openai.com/v1",
			model: "gpt-4o-mini", apiKeyRef: "ai.vision", hasApiKey: false, modelCatalog,
			effectiveProvider: "openai-compatible", effectiveBaseUrl: "https://api.openai.com/v1",
			effectiveModel: "gpt-4o-mini", effectiveHasApiKey: false,
		},
		hasApiKey: false, modelCatalog,
	}
	const shell = { request: async (body, options) => {
		calls.push({ body, options })
		const result = body.operation.startsWith("config") ? aiConfig
			: body.operation === "provider.models" ? { ok: true, provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", hasApiKey: true, models: ["gpt-4o-mini"], code: "ok", message: "ok" }
				: body.operation === "provider.test" ? { ok: true, provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", hasApiKey: true, elapsedMs: 1 }
					: body.operation === "persona.draft" ? { petPackId: "cat", petPackDisplayName: "Cat", draftPersona: { tone: "warm" }, compiledPersonaPrompt: "A warm cat." }
						: body.operation.startsWith("persona") ? profile
							: memories
		return { body: { type: "ai.talk.result", operation: body.operation, ok: true, result } }
	} }
	const talk = createAiTalkService({ shell })
	await withAiTalkServer(talk, async (base) => {
		const json = { "content-type": "application/json" }
		const responses = await Promise.all([
			fetch(`${base}/ai/config`),
			fetch(`${base}/ai/config`, { method: "PATCH", headers: json, body: JSON.stringify({ config: { enabled: true } }) }),
			fetch(`${base}/ai/providers/chat/test`, { method: "POST", headers: json, body: "{}" }),
			fetch(`${base}/ai/providers/vision/models`),
			fetch(`${base}/ai/persona`),
			fetch(`${base}/ai/persona`, { method: "PUT", headers: json, body: JSON.stringify({ override: { name: "Neko" } }) }),
		fetch(`${base}/ai/persona/draft`, { method: "POST", headers: json, body: JSON.stringify({ instruction: "brighter" }) }),
		fetch(`${base}/ai/memories`),
		fetch(`${base}/ai/memories/m-1`, { method: "DELETE" }),
		fetch(`${base}/ai/memories/pet-pack`, { method: "DELETE" }),
	])
		assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 200, 200, 200, 200, 200, 200])
		for (const response of responses) assert.equal((await response.json()).ok, true)
		const invalid = await fetch(`${base}/ai/persona`, { method: "PUT", headers: json, body: JSON.stringify({ override: { apiKey: "secret" } }) })
		assert.equal(invalid.status, 400)
		assert.equal((await invalid.json()).error.code, "VALIDATION_FAILED")
	})
	assert.deepEqual(new Set(calls.map(({ body }) => body.operation)), new Set([
		"config.get", "config.save", "provider.test", "provider.models", "persona.get", "persona.save", "persona.draft", "memory.list", "memory.delete", "memory.clear-pet-pack",
	]))
	assert.deepEqual(calls.find(({ body }) => body.operation === "persona.save").body.payload, { override: { name: "Neko" } })
	assert.deepEqual(calls.find(({ body }) => body.operation === "persona.draft").body.payload, { instruction: "brighter" })
	assert.equal(calls.every(({ options }) => options.expectedType === "ai.talk.result"), true)
})

test("AI routes map missing domain methods to retryable unavailability", async () => {
	const calls = []
	await withAiTalkServer({
		getPersona: async () => ({}),
	}, async (base) => {
		const response = await fetch(`${base}/ai/config`)
		const body = await response.json()
		calls.push(body)
		assert.equal(response.status, 503)
		assert.equal(body.error.code, "BACKEND_UNAVAILABLE")
		assert.equal(body.error.retryable, true)
	})
	assert.equal(calls.length, 1)
})

test("AI chat client disconnect requests Shell cancellation with the same request id", async () => {
	let finishChat
	let stopRequested
	const stop = new Promise((resolve) => { stopRequested = resolve })
	let chatRequestId = ""
	const talk = {
		getPersona: async () => ({}),
		chat: (payload) => {
			chatRequestId = payload.requestId || ""
			return new Promise((resolve) => { finishChat = resolve })
		},
		stopTalk: async (requestId) => {
			stopRequested(requestId)
			finishChat({ conversationId: "control-center:cat:main", reply: "", canceled: true, requestId })
			return { canceled: true, requestId, reason: "backend-request", status: "canceling" }
		},
	}
	const events = []
	await withAiTalkServer(talk, async (base) => {
		const controller = new AbortController()
		const request = fetch(base + "/ai/chat", {
			method: "POST",
			headers: { "content-type": "application/json", accept: "text/event-stream" },
			body: JSON.stringify({ message: "hello" }),
			signal: controller.signal,
		})
		while (!finishChat) await new Promise((resolve) => setImmediate(resolve))
		assert.match(chatRequestId, /^ai-chat:/)
		controller.abort()
		await assert.rejects(request, (error) => error.name === "AbortError")
		assert.equal(await Promise.race([stop, new Promise((resolve) => setTimeout(() => resolve("timeout"), 500))]), chatRequestId)
		assert.deepEqual(events, [])
	}, { emit: (name, payload) => events.push({ name, payload }) })
})

test("AI chat cancellation failure logs only a bounded request id and error code", async () => {
	let finishChat
	let reportWarning
	const warning = new Promise((resolve) => { reportWarning = resolve })
	let requestId = ""
	const talk = {
		getPersona: async () => ({}),
		chat: (payload) => {
			requestId = payload.requestId
			return new Promise((resolve) => { finishChat = resolve })
		},
		stopTalk: async () => {
			const error = new Error("provider secret must not be logged")
			error.code = "BACKEND_UNAVAILABLE"
			throw error
		},
	}
	const warnings = []
	await withAiTalkServer(talk, async (base) => {
		const controller = new AbortController()
		const request = fetch(base + "/ai/chat", {
			method: "POST",
			headers: { "content-type": "application/json", accept: "text/event-stream" },
			body: JSON.stringify({ message: "hello" }),
			signal: controller.signal,
		})
		while (!finishChat) await new Promise((resolve) => setImmediate(resolve))
		controller.abort()
		await assert.rejects(request, (error) => error.name === "AbortError")
		assert.deepEqual(await Promise.race([warning, new Promise((resolve) => setTimeout(() => resolve("timeout"), 500))]), {
			message: "AI chat cancellation request failed",
			fields: { requestId, code: "BACKEND_UNAVAILABLE" },
		})
	}, {
		logger: { warn: (message, fields) => {
			warnings.push({ message, fields })
			reportWarning(warnings.at(-1))
		} },
	})
	assert.match(requestId, /^ai-chat:/)
	assert.equal(JSON.stringify(warnings).includes("provider secret must not be logged"), false)
	assert.equal(JSON.stringify(warnings).includes("secret"), false)
})

test("AI config routes reject Shell-owned fields and route provider probes by capability", async () => {
	const { createAiTalkService } = await import("../../services/backend/domains/ai/talk.js")
	const calls = []
	const modelCatalog = { cacheKey: "", models: [], fetchedAt: "", source: "none" }
	const config = {
		enabled: true, provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini",
		apiKeyRef: "ai.default", systemPrompt: "", memory: { enabled: false },
		behavior: { enabled: false, useTools: true, cooldownMs: 0, rules: [], decisions: [] },
		vision: {
			mode: "follow-chat", provider: "openai-compatible", baseUrl: "https://api.openai.com/v1",
			model: "gpt-4o-mini", apiKeyRef: "ai.vision", hasApiKey: false, modelCatalog,
			effectiveProvider: "openai-compatible", effectiveBaseUrl: "https://api.openai.com/v1",
			effectiveModel: "gpt-4o-mini", effectiveHasApiKey: false,
		},
		hasApiKey: true, modelCatalog,
	}
	const shell = { request: async (body, options) => {
		calls.push({ body, options })
		const result = body.operation === "config.save" || body.operation === "config.get"
			? config
			: body.operation === "provider.test"
				? { ok: true, provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", hasApiKey: true, elapsedMs: 1 }
					: { ok: true, provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", hasApiKey: true, models: [], code: "ok", message: "ok" }
		return { body: { type: "ai.talk.result", operation: body.operation, ok: true, result } }
	} }
	const talk = createAiTalkService({ shell })
	await withAiTalkServer(talk, async (base) => {
		const json = { "content-type": "application/json" }
		const read = await fetch(`${base}/ai/config`)
		const save = await fetch(`${base}/ai/config`, { method: "PATCH", headers: json, body: JSON.stringify({ config: { enabled: true, memory: { enabled: false }, vision: { mode: "follow-chat" } } }) })
		const testChat = await fetch(`${base}/ai/providers/chat/test`, { method: "POST", headers: json, body: "{}" })
		const modelsChat = await fetch(`${base}/ai/providers/chat/models`)
		const modelsVision = await fetch(`${base}/ai/providers/vision/models`)
		assert.deepEqual([read.status, save.status, testChat.status, modelsChat.status, modelsVision.status], [200, 200, 200, 200, 200])
		const unsafe = await fetch(`${base}/ai/config`, { method: "PATCH", headers: json, body: JSON.stringify({ config: { apiKeyRef: "attacker" } }) })
		assert.equal(unsafe.status, 400)
		for (const config of [
			{ provider: "custom-provider" },
			{ vision: { provider: "custom-provider" } },
			{ baseUrl: "file:///tmp/provider" },
			{ vision: { baseUrl: "https://user:pass@example.test/v1" } },
			{ model: "   " },
			{ baseUrl: "x".repeat(2001) },
			{ vision: { model: "x".repeat(2001) } },
		]) {
			const rejected = await fetch(`${base}/ai/config`, { method: "PATCH", headers: json, body: JSON.stringify({ config }) })
			assert.equal(rejected.status, 400, JSON.stringify(config).slice(0, 80))
		}
	})
	assert.deepEqual(calls.map(({ body }) => body.operation), ["config.get", "config.save", "provider.test", "provider.models", "provider.models"])
	assert.equal(calls[1].body.payload.config.apiKeyRef, undefined)
	assert.deepEqual(calls.slice(2).map(({ body }) => body.payload.providerId), ["chat", "chat", "vision"])
})

test("AI talk domain rejects malformed and mismatched reverse responses and preserves failure codes", async () => {
	const { createAiTalkService } = await import("../../services/backend/domains/ai/talk.js")
	const malformed = createAiTalkService({ shell: { request: async () => ({ body: { type: "ai.talk.result", operation: "memory.list", ok: true } }) } })
	await assert.rejects(() => malformed.getPersona(), (error) => error.code === "INTERNAL")
	const extraField = createAiTalkService({ shell: { request: async () => ({ body: { type: "ai.talk.result", operation: "persona.get", ok: true, result: {}, leaked: true } }) } })
	await assert.rejects(() => extraField.getPersona(), (error) => error.code === "INTERNAL")
	const failed = createAiTalkService({ shell: { request: async () => ({ body: {
		type: "ai.talk.result", operation: "memory.delete", ok: false, error: { code: "NOT_FOUND", message: "memory not found" },
	} }) } })
	await assert.rejects(() => failed.deleteMemory("m-1"), (error) => error.code === "NOT_FOUND" && error.status === 404 && error.message === "memory not found")
	let providerFailureBody
	const providerDetail = createAiTalkService({ shell: { request: async () => {
		providerFailureBody = {
			type: "ai.talk.result", operation: "provider.test", ok: false, error: { code: "PROVIDER_ERROR", message: "request failed: apiKey=sk-provider-super-secret" },
		}
		return { body: providerFailureBody }
	} } })
	await assert.rejects(() => providerDetail.testProvider(), (error) => {
		assert.equal(error.code, "PROVIDER_ERROR")
		assert.equal(error.message, "AI provider request failed")
		assert.equal(JSON.stringify({ error: { message: error.message, details: error.details } }).includes("sk-provider-super-secret"), false)
		return true
	})
	const unavailable = createAiTalkService({ shell: { request: async () => { throw new Error("sidecar disconnected") } } })
	await assert.rejects(() => unavailable.getPersona(), (error) => error.code === "BACKEND_UNAVAILABLE" && error.cause?.message === "sidecar disconnected")
	assert.throws(() => unavailable.savePersona({ token: "secret" }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => unavailable.saveConfig({ apiKeyRef: "attacker" }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => unavailable.generatePersonaDraft({ instruction: "x".repeat(2001) }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => unavailable.listConversations({ entrypoint: "x".repeat(161) }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => unavailable.getConversation("x".repeat(161)), (error) => error.code === "VALIDATION_FAILED")
})

test("AI behavior domain rejects malformed rule ids and non-string dry-run replies before Shell dispatch", async () => {
	const { createAiTalkService } = await import("../../services/backend/domains/ai/talk.js")
	let calls = 0
	const service = createAiTalkService({
		shell: {
			request: async () => {
				calls += 1
				return { body: { type: "ai.talk.result", operation: "behavior.get", ok: true, result: {} } }
			},
		},
	})
	assert.throws(() => service.updateBehaviorRule("  ", {}), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.deleteBehaviorRule(42), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.dryRunBehavior({ reply: 42 }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.dryRunBehavior({ reply: "hello", behaviorIntent: { confidence: "high" } }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.dryRunBehavior({ reply: "hello", rules: [{ then: { type: "shell.execute" } }] }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.dryRunBehavior({ reply: "hello", rules: Array.from({ length: 51 }, () => ({})) }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.createBehaviorRule({ when: { unsupported: true } }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.updateBehaviorRule("rule-1", { then: { type: "shell.execute" } }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.saveBehavior({ unsupported: true }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.saveBehavior({ decisions: [] }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.saveBehavior({ rules: [{ when: { unsupported: true } }] }), (error) => error.code === "VALIDATION_FAILED")
	assert.equal(calls, 0)
})

test("AI legacy behavior operations validate and dispatch through the AI talk domain", async () => {
	const { createAiTalkService } = await import("../../services/backend/domains/ai/talk.js")
	const calls = []
	const service = createAiTalkService({ shell: { request: async (body) => {
		calls.push(body)
		const result = {
			"hatch.config.save": {
				enabled: true, executionMode: "shadow", configMode: "override", provider: "openai-compatible",
				baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKeyRef: "ai.hatch-pet",
				systemPromptVersion: 1, requireIdentityReviewBeforeActions: false,
				budgets: {
					maxIdentityRegenerations: 1, maxActionAttemptsPerAction: 3,
					maxEvaluationAttemptsPerArtifact: 2, maxPlannerCalls: 34, maxEvaluatorCalls: 68,
					maxProviderCalls: 20, maxElapsedMs: 43200000, maxEstimatedCost: null,
				},
				hasApiKey: false, configSource: "hatch-pet-override",
				effectiveProvider: "openai-compatible", effectiveBaseUrl: "https://api.openai.com/v1",
				effectiveModel: "gpt-4o-mini",
			},
			"hatch.key.save": { apiKeyRef: "ai.hatch-pet", hasApiKey: true },
			"hatch.key.clear": { apiKeyRef: "ai.hatch-pet", hasApiKey: false },
			"hatch.capability.check": { ok: true, code: "ready", message: "ready", provider: "openai-compatible", model: "gpt-4o-mini", elapsedMs: 1 },
			"hatch.run.status": { ok: true, runId: "run-1", state: null, decisions: [] },
			"behavior.decision.replay": { replayOf: 2, matched: false, reason: "no behavior rule matched" },
			"behavior.decisions.clear": [],
			"behavior.diagnostics.export": "{}",
		}[body.operation]
		return { body: { type: "ai.talk.result", operation: body.operation, ok: true, result } }
	} } })
	assert.throws(() => service.saveHatchConfig({ apiKeyRef: "forged" }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.saveHatchConfig({ budgets: { maxProviderCalls: "large" } }), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.saveHatchApiKey("  "), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.replayBehaviorDecision(0), (error) => error.code === "VALIDATION_FAILED")
	assert.equal((await service.saveHatchConfig({ enabled: true, configMode: "override", budgets: { maxProviderCalls: 20 } })).executionMode, "shadow")
	assert.equal((await service.saveHatchApiKey("hatch-secret-value")).hasApiKey, true)
	assert.equal((await service.clearHatchApiKey()).hasApiKey, false)
	assert.equal((await service.checkHatchCapability()).ok, true)
	assert.equal((await service.getHatchRunStatus("run-1")).runId, "run-1")
	assert.equal((await service.replayBehaviorDecision(2)).replayOf, 2)
	assert.equal(await service.exportBehaviorDiagnostics(), "{}")
	assert.deepEqual(await service.clearBehaviorDecisions(), [])
	assert.equal(JSON.stringify(calls).includes("hatch-secret-value"), true)
	assert.deepEqual(calls.map(({ operation }) => operation), [
		"hatch.config.save", "hatch.key.save", "hatch.key.clear", "hatch.capability.check", "hatch.run.status",
		"behavior.decision.replay", "behavior.diagnostics.export", "behavior.decisions.clear",
	])
})

test("AI Hatch domain validates the complete bounded start input before Shell dispatch", async () => {
	const { createAiTalkService } = await import("../../services/backend/domains/ai/talk.js")
	let calls = 0
	const service = createAiTalkService({ shell: { request: async () => { calls += 1; return { body: { type: "ai.talk.result", operation: "hatch.start", ok: true, result: {} } } } } })
	for (const input of [
		{ runId: "run-1", mode: { nested: true } },
		{ runId: "run-1", stage: "x".repeat(81) },
		{ runId: "run-1", scope: { actionId: 12 } },
		{ runId: "run-1", workflowEvidence: { provider: { ready: "yes" } } },
		{ runId: "run-1", workflowEvidence: { provider: { apiKey: "secret" } } },
	]) assert.throws(() => service.startHatch(input), (error) => error.code === "VALIDATION_FAILED")
	assert.equal(calls, 0)
})

test("AI Hatch configuration and behavior diagnostic routes reject malformed input and dispatch valid requests", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		getHatchConfig: async () => ({ enabled: false }),
		saveHatchConfig: async (config) => { calls.push(["config", config]); return config },
		saveHatchApiKey: async (apiKey) => { calls.push(["key", apiKey]); return { apiKeyRef: "ai.hatch-pet", hasApiKey: true } },
		clearHatchApiKey: async () => ({ apiKeyRef: "ai.hatch-pet", hasApiKey: false }),
		checkHatchCapability: async () => ({ ok: true }),
		getHatchRunStatus: async (runId) => ({ ok: true, runId }),
		replayBehaviorDecision: async (id) => ({ replayOf: id, matched: true, reason: "ok" }),
		exportBehaviorDiagnostics: async () => "{}",
		clearBehaviorDecisions: async () => [],
	}
	await withAiTalkServer(talk, async (base) => {
		const headers = { "content-type": "application/json" }
		const read = await fetch(base + "/ai/hatch/config")
		const save = await fetch(base + "/ai/hatch/config", { method: "PATCH", headers, body: JSON.stringify({ config: { enabled: true, configMode: "follow-chat" } }) })
		const badSave = await fetch(base + "/ai/hatch/config", { method: "PATCH", headers, body: JSON.stringify({ config: { apiKeyRef: "forged" } }) })
		const key = await fetch(base + "/ai/hatch/key", { method: "PUT", headers, body: JSON.stringify({ apiKey: "hatch-secret" }) })
		const badKey = await fetch(base + "/ai/hatch/key", { method: "PUT", headers, body: JSON.stringify({ apiKey: " " }) })
		const capability = await fetch(base + "/ai/hatch/capability", { method: "POST", headers, body: "{}" })
		const run = await fetch(base + "/ai/hatch/runs/run-1")
		const badRun = await fetch(base + "/ai/hatch/runs/bad%20id")
		const replay = await fetch(base + "/ai/behavior/decisions/4/replay", { method: "POST", headers, body: "{}" })
		const badReplay = await fetch(base + "/ai/behavior/decisions/0/replay", { method: "POST", headers, body: "{}" })
		const exported = await fetch(base + "/ai/behavior/diagnostics")
		const cleared = await fetch(base + "/ai/behavior/decisions", { method: "DELETE" })
		assert.deepEqual([read.status, save.status, badSave.status, key.status, badKey.status, capability.status, run.status, badRun.status, replay.status, badReplay.status, exported.status, cleared.status], [200, 200, 400, 200, 400, 200, 200, 400, 200, 400, 200, 200])
		assert.equal(JSON.stringify(await key.json()).includes("hatch-secret"), false)
	})
	assert.deepEqual(calls, [["config", { enabled: true, configMode: "follow-chat" }], ["key", "hatch-secret"]])
})

test("AI trace requires a non-empty conversation id before touching the Shell", async () => {
	const { createAiTalkService } = await import("../../services/backend/domains/ai/talk.js")
	let calls = 0
	const service = createAiTalkService({
		shell: {
			request: async () => {
				calls += 1
				return { body: { type: "ai.talk.result", operation: "trace.get", ok: true, result: { traces: [] } } }
			},
		},
	})
	assert.throws(() => service.getTrace(""), (error) => error.code === "VALIDATION_FAILED")
	assert.throws(() => service.getTrace(42), (error) => error.code === "VALIDATION_FAILED")
	assert.equal(calls, 0)
})

test("AI trace route rejects a missing conversation id before calling the domain", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		getTrace: async (conversationId) => { calls.push(conversationId); return { traces: [] } },
	}
	await withAiTalkServer(talk, async (base) => {
		const response = await fetch(`${base}/ai/traces`)
		assert.equal(response.status, 400)
		assert.equal((await response.json()).error.code, "VALIDATION_FAILED")
	})
	assert.deepEqual(calls, [])
})

test("AI trace and Hatch budget routes reject unknown query fields before domain dispatch", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		getTrace: async (conversationId) => { calls.push(["trace", conversationId]); return { traces: [] } },
		getHatchBudget: async (runId) => { calls.push(["budget", runId]); return { runId, budget: {} } },
	}
	await withAiTalkServer(talk, async (base) => {
		const responses = await Promise.all([
			fetch(`${base}/ai/traces?conversationId=cat%3Amain&includeMessages=true`),
			fetch(`${base}/ai/hatch/budget?runId=run-1&debug=true`),
			fetch(`${base}/ai/hatch/budget?runId=run-1&runId=run-2`),
			fetch(`${base}/ai/traces?conversationId=cat%3Amain`),
			fetch(`${base}/ai/hatch/budget?runId=run-1`),
		])
		assert.deepEqual(responses.map((response) => response.status), [400, 400, 400, 200, 200])
	})
	assert.deepEqual(calls, [["trace", "cat:main"], ["budget", "run-1"]])
})

test("AI conversation filters reject extra or overlong query values before dispatch", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		listConversations: async (filters) => { calls.push(filters); return [] },
		getConversation: async (conversationId) => { calls.push(["get", conversationId]); return {} },
		deleteConversation: async (conversationId) => { calls.push(["delete", conversationId]); return {} },
	}
	await withAiTalkServer(talk, async (base) => {
		const overlong = await fetch(`${base}/ai/conversations?entrypoint=${"x".repeat(161)}`)
		const extra = await fetch(`${base}/ai/conversations?entrypoint=control-center&unexpected=true`)
		const detail = await fetch(`${base}/ai/conversations/${"x".repeat(161)}`)
		assert.deepEqual([overlong.status, extra.status, detail.status], [400, 400, 400])
		const valid = await fetch(`${base}/ai/conversations?entrypoint=%20control-center%20&petPackId=%20cat%20`)
		assert.equal(valid.status, 200)
	})
	assert.deepEqual(calls, [{ entrypoint: "control-center", petPackId: "cat" }])
})

test("AI Hatch budget route rejects a missing or malformed run id before calling the domain", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		getHatchBudget: async (runId) => { calls.push(runId); return { runId, budget: {} } },
	}
	await withAiTalkServer(talk, async (base) => {
		const responses = await Promise.all([
			fetch(`${base}/ai/hatch/budget`),
			fetch(`${base}/ai/hatch/budget?runId=bad%20id`),
		])
		assert.deepEqual(responses.map((response) => response.status), [400, 400])
	})
	assert.deepEqual(calls, [])
})

test("AI chat writes the terminal SSE frame and closes the response", async () => {
	const emitted = []
	const talk = {
		getPersona: async () => ({}),
		chat: async (payload) => ({
			conversationId: payload.conversationId || "control-center:cat:main",
			reply: "hello from OpenPet",
		}),
	}
	await withAiTalkServer(talk, async (base) => {
		const response = await fetch(`${base}/ai/chat`, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "text/event-stream" },
			body: JSON.stringify({ message: "hello", requestId: "chat-1" }),
		})
		assert.equal(response.status, 200)
		assert.match(response.headers.get("content-type") || "", /text\/event-stream/)
		const body = await response.text()
		assert.match(body, /event: ai\.chat-delta/)
		assert.match(body, /event: ai\.chat-done/)
		assert.match(body, /hello from OpenPet/)
	})
	assert.deepEqual(emitted, [])
})

test("AI talk start rejects fields outside the chat request contract", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		startTalk: async (payload) => { calls.push(payload); return { accepted: true } },
	}
	await withAiTalkServer(talk, async (base) => {
		const response = await fetch(`${base}/ai/talk/start`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message: "hello", apiKey: "secret" }),
		})
		assert.equal(response.status, 400)
	})
	assert.deepEqual(calls, [])
})

test("AI talk stop rejects malformed request ids before calling the domain", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		stopTalk: async (requestId) => { calls.push(requestId); return { canceled: true, requestId, reason: "backend-request" } },
	}
	await withAiTalkServer(talk, async (base) => {
		const headers = { "content-type": "application/json" }
		const cases = [
			{ requestId: "" },
			{ requestId: 42 },
			{ requestId: "x".repeat(161) },
		]
		const responses = await Promise.all(cases.map((body) => fetch(`${base}/ai/talk/stop`, { method: "POST", headers, body: JSON.stringify(body) })))
		assert.deepEqual(responses.map((response) => response.status), [400, 400, 400])
		const valid = await fetch(`${base}/ai/talk/stop`, { method: "POST", headers, body: JSON.stringify({ requestId: "stop-1" }) })
		assert.equal(valid.status, 200)
	})
	assert.deepEqual(calls, ["stop-1"])
})

test("AI talk routes reject invalid chat bounds and unsupported trace filters before calling the domain", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		startTalk: async (payload) => { calls.push(["start", payload]); return { accepted: true } },
		exportTrace: async (filters) => { calls.push(["trace", filters]); return "{}" },
	}
	await withAiTalkServer(talk, async (base) => {
		const headers = { "content-type": "application/json" }
		const longMessage = await fetch(`${base}/ai/talk/start`, { method: "POST", headers, body: JSON.stringify({ message: "x".repeat(4001) }) })
		const invalidFilter = await fetch(`${base}/ai/traces/export`, { method: "POST", headers, body: JSON.stringify({ filters: { conversationId: "cat:main", includeMessages: true } }) })
		const validFilter = await fetch(`${base}/ai/traces/export`, { method: "POST", headers, body: JSON.stringify({ filters: { conversationId: "cat:main" } }) })
		assert.deepEqual([longMessage.status, invalidFilter.status, validFilter.status], [400, 400, 200])
	})
	assert.deepEqual(calls, [["trace", { conversationId: "cat:main" }]])
})

test("AI behavior routes reject malformed rule ids and non-string dry-run replies before calling the domain", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		updateBehaviorRule: async (...args) => { calls.push(["update", ...args]); return { ok: true } },
		deleteBehaviorRule: async (...args) => { calls.push(["delete", ...args]); return { ok: true } },
		dryRunBehavior: async (...args) => { calls.push(["dry-run", ...args]); return { ok: true } },
	}
	await withAiTalkServer(talk, async (base) => {
		const headers = { "content-type": "application/json" }
		const update = await fetch(`${base}/ai/behavior/rules/%20`, { method: "PATCH", headers, body: JSON.stringify({ patch: {} }) })
		const remove = await fetch(`${base}/ai/behavior/rules/%20`, { method: "DELETE" })
		const dryRun = await fetch(`${base}/ai/behavior/dry-run`, { method: "POST", headers, body: JSON.stringify({ reply: 42 }) })
		const create = await fetch(`${base}/ai/behavior/rules`, { method: "POST", headers, body: JSON.stringify({ rule: { when: { unsupported: true } } }) })
		const malformedPatch = await fetch(`${base}/ai/behavior/rules/rule-1`, { method: "PATCH", headers, body: JSON.stringify({ patch: { then: { type: "shell.execute" } } }) })
		assert.deepEqual([update.status, remove.status, dryRun.status, create.status, malformedPatch.status], [400, 400, 400, 400, 400])
	})
	assert.deepEqual(calls, [])
})

test("AI behavior save rejects unsupported config fields and malformed rules before dispatch", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		saveBehavior: async (config) => { calls.push(config); return { ok: true } },
	}
	await withAiTalkServer(talk, async (base) => {
		const headers = { "content-type": "application/json" }
		const extra = await fetch(`${base}/ai/behavior`, { method: "PATCH", headers, body: JSON.stringify({ config: { enabled: true, unsupported: true } }) })
		const malformedRule = await fetch(`${base}/ai/behavior`, { method: "PATCH", headers, body: JSON.stringify({ config: { rules: [{ then: { type: "shell.execute" } }] } }) })
		const decisions = await fetch(`${base}/ai/behavior`, { method: "PATCH", headers, body: JSON.stringify({ config: { decisions: [] } }) })
		const malformedCooldown = await fetch(`${base}/ai/behavior`, { method: "PATCH", headers, body: JSON.stringify({ config: { cooldownMs: -1 } }) })
		const valid = await fetch(`${base}/ai/behavior`, { method: "PATCH", headers, body: JSON.stringify({ config: { enabled: true } }) })
		assert.deepEqual([extra.status, malformedRule.status, decisions.status, malformedCooldown.status, valid.status], [400, 400, 400, 400, 200])
	})
	assert.deepEqual(calls, [{ enabled: true }])
})

test("AI behavior dry-run rejects malformed intents and rules before calling the domain", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		dryRunBehavior: async (payload) => { calls.push(payload); return { ok: true } },
	}
	await withAiTalkServer(talk, async (base) => {
		const headers = { "content-type": "application/json" }
		const cases = [
			{ reply: "hello", behaviorIntent: { confidence: "high" } },
			{ reply: "hello", behaviorIntent: { secret: "unexpected" } },
			{ reply: "hello", behaviorIntent: { intent: "x".repeat(121) } },
			{ reply: "hello", rules: [{ when: { minConfidence: 2 } }] },
			{ reply: "hello", rules: [{ then: { type: "execute" } }] },
			{ reply: "hello", rules: Array.from({ length: 51 }, () => ({})) },
		]
		const responses = await Promise.all(cases.map((body) => fetch(`${base}/ai/behavior/dry-run`, { method: "POST", headers, body: JSON.stringify(body) })))
		assert.deepEqual(responses.map((response) => response.status), cases.map(() => 400))
	})
	assert.deepEqual(calls, [])
})

test("AI Talk routes preserve typed domain dependency failures", async () => {
	const { ApiError } = await import("../../services/backend/http/middleware.js")
	const talk = {
		getPersona: async () => { throw new ApiError("BACKEND_UNAVAILABLE", "Shell AI talk authority unavailable") },
	}
	await withAiTalkServer(talk, async (base) => {
		const response = await fetch(`${base}/ai/persona`)
		const body = await response.json()
		assert.equal(response.status, 503)
		assert.equal(body.error.code, "BACKEND_UNAVAILABLE")
		assert.equal(body.error.retryable, true)
	})
})

test("AI provider timeout and service dependency errors keep distinct safe HTTP diagnostics", async () => {
	const { createAiTalkService } = await import("../../services/backend/domains/ai/talk.js")
	const cases = [
		{ code: "PERMISSION_DENIED", status: 403, retryable: false, message: "AI provider authentication failed" },
		{ code: "NOT_FOUND", status: 404, retryable: false, message: "AI provider endpoint or model was not found" },
		{ code: "VALIDATION_FAILED", status: 400, retryable: false, message: "AI provider rejected the request" },
		{ code: "RATE_LIMITED", status: 429, retryable: true, message: "AI provider rate limit exceeded" },
		{ code: "PROVIDER_ERROR", status: 502, retryable: true, message: "AI provider request failed" },
		{ code: "PROVIDER_TIMEOUT", status: 504, retryable: true, message: "AI provider request timed out" },
		{ code: "BACKEND_UNAVAILABLE", status: 503, retryable: true, message: "AI service temporarily unavailable" },
	]
	for (const item of cases) {
		const talk = createAiTalkService({ shell: { request: async () => ({ body: {
			type: "ai.talk.result", operation: "provider.test", ok: false,
			error: { code: item.code, message: `upstream apiKey=sk-secret ${item.code}` },
		} }) } })
		await withAiTalkServer(talk, async (base) => {
			const response = await fetch(`${base}/ai/providers/chat/test`, { method: "POST" })
			const body = await response.text()
			assert.equal(response.status, item.status)
			assert.match(body, new RegExp(item.message))
			if (item.retryable !== undefined) assert.equal(JSON.parse(body).error.retryable, item.retryable)
			if (item.code === "RATE_LIMITED") assert.equal(response.headers.get("retry-after"), "1")
			assert.equal(body.includes("sk-secret"), false)
			assert.equal(body.includes("upstream"), false)
		})
		const chatTalk = createAiTalkService({ shell: { request: async ({ operation }) => ({ body: {
			type: "ai.talk.result", operation, ok: false,
			error: { code: item.code, message: item.message },
		} }) } })
		await withAiTalkServer(chatTalk, async (base) => {
			const response = await fetch(`${base}/ai/chat`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: "hello" }),
			})
			const body = await response.json()
			assert.equal(response.status, item.status)
			assert.equal(body.error.code, item.code)
			assert.equal(body.error.retryable, item.retryable)
			assert.equal(body.error.message, item.message)
		})
	}
})

test("AI provider HTTP errors do not expose upstream response text", async () => {
	const { createAiTalkService } = await import("../../services/backend/domains/ai/talk.js")
	const talk = createAiTalkService({ shell: { request: async () => ({ body: {
		type: "ai.talk.result",
		operation: "provider.test",
		ok: false,
		error: { code: "PROVIDER_ERROR", message: "upstream apiKey=sk-provider-response-secret leaked by provider" },
	} }) } })
	await withAiTalkServer(talk, async (base) => {
		const response = await fetch(`${base}/ai/providers/chat/test`, { method: "POST" })
		const body = await response.text()
		assert.equal(response.status, 502)
		assert.match(body, /AI provider request failed/)
		assert.equal(body.includes("sk-provider-response-secret"), false)
		assert.equal(body.includes("upstream"), false)
	})
})

test("AI chat refuses to start an SSE stream for an invalid domain result", async () => {
	const talk = {
		getPersona: async () => ({}),
		chat: async () => ({ conversationId: "control-center:cat:main" }),
	}
	await withAiTalkServer(talk, async (base) => {
		const response = await fetch(`${base}/ai/chat`, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "text/event-stream" },
			body: JSON.stringify({ message: "hello" }),
		})
		assert.equal(response.status, 500)
		assert.equal((await response.json()).error.code, "INTERNAL")
	})
})

test("AI chat preserves typed dependency failures and never emits failed chat events", async () => {
	const { ApiError } = await import("../../services/backend/http/middleware.js")
	const emitted = []
	const talk = {
		getPersona: async () => ({}),
		chat: async () => { throw new ApiError("BACKEND_UNAVAILABLE", "Shell AI talk authority unavailable", { cause: new Error("provider-secret-value") }) },
	}
	await withAiTalkServer(talk, async (base) => {
		const response = await fetch(`${base}/ai/chat`, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "text/event-stream" },
			body: JSON.stringify({ message: "hello" }),
		})
		const body = await response.text()
		assert.equal(response.status, 503)
		assert.match(body, /BACKEND_UNAVAILABLE/)
		assert.equal(body.includes("provider-secret-value"), false)
		assert.equal(body.includes("event: ai.chat-"), false)
	}, { emit: (name, payload) => emitted.push({ name, payload }) })
	assert.deepEqual(emitted, [])
})

test("AI Hatch start keeps the Job resource lock and rejects unbounded evidence", async () => {
	const jobs = []
	const talk = {
		getPersona: async () => ({}),
	}
	await withAiTalkServer(talk, async (base) => {
		const headers = { "content-type": "application/json" }
		const accepted = await fetch(`${base}/ai/hatch/start`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				runId: "run-1",
				mode: "full-pet",
				userIntent: "make a cat",
				stage: "planning",
				scope: { actionId: "wave" },
				workflowEvidence: { provider: { ready: true, provider: "chat", model: "gpt-5.5" } },
			}),
		})
		const rejected = await fetch(`${base}/ai/hatch/start`, {
			method: "POST",
			headers,
			body: JSON.stringify({ runId: "run-2", workflowEvidence: { provider: { ready: true, secret: "leak" } } }),
		})
		assert.equal(accepted.status, 202)
		assert.equal(rejected.status, 400)
	}, { jobs: { insert: (job) => { jobs.push(job); return { id: job.id } } } })
	assert.equal(jobs.length, 1)
	assert.equal(jobs[0].kind, "hatch.run")
	assert.equal(jobs[0].resourceKey, "hatch:run-1")
	assert.deepEqual(jobs[0].input.scope, { actionId: "wave" })
	assert.deepEqual(jobs[0].input.workflowEvidence, { provider: { ready: true, provider: "chat", model: "gpt-5.5" } })
})

test("AI image dependency failures remain structured and do not become fake success payloads", async () => {
	const { ApiError } = await import("../../services/backend/http/middleware.js")
	const talk = {
		getPersona: async () => ({}),
		checkImageHealth: async () => ({ ok: false, code: "missing_api_key", message: "Image generation API key is missing" }),
		discoverImageModels: async () => { throw new ApiError("BACKEND_UNAVAILABLE", "Shell image model authority unavailable") },
	}
	await withAiTalkServer(talk, async (base) => {
		const health = await fetch(`${base}/ai/images/health`)
		const models = await fetch(`${base}/ai/images/models`)
		assert.equal(health.status, 200)
		assert.deepEqual((await health.json()).data, { ok: false, code: "missing_api_key", message: "Image generation API key is missing" })
		assert.equal(models.status, 503)
		assert.equal((await models.json()).error.code, "BACKEND_UNAVAILABLE")
	})
})

test("image health and model routes preserve diagnostic DTOs and map reverse failures", async () => {
	const { createAiTalkService } = await import("../../services/backend/domains/ai/talk.js")
	let failReverse = false
	let malformed = false
	const talk = createAiTalkService({ shell: { request: async (body) => {
		if (failReverse) throw new Error("Shell image authority disconnected")
		if (body.operation === "image.health") return { body: {
			type: "ai.talk.result", operation: body.operation, ok: true,
			result: { ok: false, provider: "openai-compatible", code: "provider_unhealthy", message: "Image Provider responded with HTTP 503", modelsProbe: "failed", availableModels: [], currentModelDiscovered: false },
		} }
		return { body: {
			type: "ai.talk.result", operation: body.operation, ok: true,
			result: malformed
				? { ok: false, provider: "openai-compatible", models: [], code: "provider_unhealthy", message: "Provider unavailable" }
				: { ok: false, provider: "openai-compatible", baseUrl: "https://images.example.test/v1", model: "gpt-image-2", hasApiKey: true, models: [], code: "provider_unhealthy", message: "Image Provider responded with HTTP 503" },
		} }
	} } })
	await withAiTalkServer(talk, async (base) => {
		const health = await fetch(`${base}/ai/images/health`)
		const healthBody = await health.json()
		assert.equal(health.status, 200)
		assert.equal(healthBody.data.ok, false)
		assert.equal(healthBody.data.code, "provider_unhealthy")
		assert.equal(healthBody.data.modelsProbe, "failed")

		const models = await fetch(`${base}/ai/images/models`)
		const modelsBody = await models.json()
		assert.equal(models.status, 200)
		assert.equal(modelsBody.data.ok, false)
		assert.equal(modelsBody.data.code, "provider_unhealthy")

		failReverse = true
		const unavailable = await fetch(`${base}/ai/images/models`)
		const unavailableBody = await unavailable.json()
		assert.equal(unavailable.status, 503)
		assert.equal(unavailableBody.error.code, "BACKEND_UNAVAILABLE")
		assert.equal(unavailableBody.error.retryable, true)
		assert.equal(JSON.stringify(unavailableBody).includes("Shell image authority disconnected"), false)

		failReverse = false
		malformed = true
		const invalid = await fetch(`${base}/ai/images/models`)
		const invalidBody = await invalid.json()
		assert.equal(invalid.status, 500)
		assert.equal(invalidBody.error.code, "INTERNAL")
	})
})

test("AI provider probe and image diagnostics reject unknown query fields before dispatch", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		testProvider: async (providerId) => { calls.push(["test", providerId]); return { ok: true } },
		discoverModels: async (providerId) => { calls.push(["models", providerId]); return { models: [] } },
		checkImageHealth: async () => { calls.push(["health"]); return { ok: true } },
		discoverImageModels: async () => { calls.push(["image-models"]); return { ok: true, models: [] } },
	}
	await withAiTalkServer(talk, async (base) => {
		const json = { "content-type": "application/json" }
		const responses = await Promise.all([
			fetch(`${base}/ai/providers/chat/test?probe=true`, { method: "POST", headers: json, body: "{}" }),
			fetch(`${base}/ai/providers/chat/models?refresh=true`),
			fetch(`${base}/ai/images/health?verbose=true`),
			fetch(`${base}/ai/images/models?refresh=true`),
			fetch(`${base}/ai/providers/chat/test`, { method: "POST", headers: json, body: "{}" }),
			fetch(`${base}/ai/providers/chat/models`),
			fetch(`${base}/ai/images/health`),
			fetch(`${base}/ai/images/models`),
		])
		assert.deepEqual(responses.map((response) => response.status), [400, 400, 400, 400, 200, 200, 200, 200])
	})
	assert.deepEqual(calls.sort((left, right) => left[0].localeCompare(right[0])), [["health"], ["image-models"], ["models", "chat"], ["test", "chat"]])
})

test("AI routes reject undeclared query fields before destructive writes and Job enqueue", async () => {
	const calls = []
	const jobs = []
	const talk = {
		getPersona: async () => ({}),
		getHatchConfig: async () => { calls.push("hatch-config"); return {} },
		clearPetPackMemories: async () => { calls.push("clear-memories"); return {} },
		clearBehaviorDecisions: async () => { calls.push("clear-decisions"); return {} },
	}
	await withAiTalkServer(talk, async (base) => {
		const responses = await Promise.all([
			fetch(`${base}/ai/memories/pet-pack?confirm=false`, { method: "DELETE" }),
			fetch(`${base}/ai/behavior/decisions?confirm=false`, { method: "DELETE" }),
			fetch(`${base}/ai/hatch/start?dryRun=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: "run-query-1" }) }),
			fetch(`${base}/ai/hatch/config?preview=true`),
			fetch(`${base}/ai/hatch/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: "run-query-1", dryRun: true }) }),
		])
		assert.deepEqual(responses.map((response) => response.status), [400, 400, 400, 400, 400])
	}, { jobs: { insert: (job) => { jobs.push(job); return { id: job.id } } } })
	assert.deepEqual(calls, [])
	assert.deepEqual(jobs, [])
})

test("AI routes reject duplicate allowed query keys before domain dispatch", async () => {
	const calls = []
	const talk = {
		getPersona: async () => ({}),
		getTrace: async (conversationId) => { calls.push(["trace", conversationId]); return {} },
		listConversations: async (filters) => { calls.push(["conversations", filters]); return [] },
		getHatchBudget: async (runId) => { calls.push(["budget", runId]); return {} },
	}
	await withAiTalkServer(talk, async (base) => {
		const urls = [
			"/ai/traces?conversationId=first&conversationId=second",
			"/ai/conversations?entrypoint=control-center&entrypoint=pet-window",
			"/ai/hatch/budget?runId=run-first&runId=run-second",
		]
		const responses = await Promise.all(urls.map((url) => fetch(base + url)))
		assert.deepEqual(responses.map((response) => response.status), [400, 400, 400])
		for (const response of responses) assert.equal((await response.json()).error.code, "VALIDATION_FAILED")
	})
	assert.deepEqual(calls, [])
})
test("AI memory delete rejects empty and oversized IDs before Shell dispatch", async () => {
  const calls = []
  await withAiTalkServer({
    getPersona: async () => ({}),
    deleteMemory: async (memoryId) => { calls.push(memoryId); return {} },
  }, async (base) => {
    const responses = await Promise.all([
      fetch(base + "/ai/memories/" + "x".repeat(161), { method: "DELETE" }),
      fetch(base + "/ai/memories/%20%20", { method: "DELETE" }),
      fetch(base + "/ai/memories/" + "x".repeat(160), { method: "DELETE" }),
    ])
    assert.deepEqual(responses.map((response) => response.status), [400, 400, 200])
  })
  assert.deepEqual(calls, ["x".repeat(160)])
})
