"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

const {
	BACKEND_TO_SHELL_TYPES: SHELL_BACKEND_TO_SHELL_TYPES,
	createMessageHandler,
} = require("../../apps/desktop/src/sidecar/message-handler.js")

const EXPECTED_BACKEND_TO_SHELL_TYPES = [
	"pet.command.request",
	"plugin.production.request",
	"pet.say",
	"pet.playAction",
	"pet.event",
	"pet.attention",
	"window.openPluginDashboard",
	"notify",
	"tray.setBadge",
	"ready",
	"degraded",
	"dialog.request",
	"settings.changed",
	"settings.apply.request",
	"settings.command.request",
	"settings.persist.result",
	"secrets.persist.request",
	"catalog.request",
	"pet-packs.request",
	"creator.request",
	"ai.state",
	"ai.host.request",
	"ai.talk.request",
	"actions.request",
]

function envelope(type, body = {}) {
	return {
		v: 1,
		id: `test-${type}`,
		at: Date.now(),
		body: { type, ...body },
	}
}

async function contractBackendToShellTypes() {
	const { backendToShellSchema } = await import("@openpet/contracts")
	return backendToShellSchema.options.map((option) => option.shape.type.value)
}

	describe("T28 reverse-channel allowlist", () => {
	it("keeps the Backend and Shell allowlists exactly aligned with the contract types", async () => {
		const backendSchema = await import("../../services/backend/bridge/message-schema.js")

		assert.deepEqual(await contractBackendToShellTypes(), EXPECTED_BACKEND_TO_SHELL_TYPES)
		assert.deepEqual(backendSchema.BACKEND_TO_SHELL_TYPES, EXPECTED_BACKEND_TO_SHELL_TYPES)
		assert.deepEqual(SHELL_BACKEND_TO_SHELL_TYPES, EXPECTED_BACKEND_TO_SHELL_TYPES)
	assert.equal(new Set(SHELL_BACKEND_TO_SHELL_TYPES).size, 24)
	})

	it("drops malformed and non-allowlisted envelopes and logs each rejection", async () => {
		const warnings = []
		const calls = []
		const handler = createMessageHandler({
			send() {},
			petService: { say: (...args) => calls.push(args) },
			logger: { warn: (message, fields) => warnings.push({ message, fields }) },
		})

		assert.equal(await handler.handle(envelope("shell.executePath", { path: "/tmp/owned" })), false)
		assert.equal(await handler.handle({ ...envelope("pet.say", { text: "ignored" }), v: 2 }), false)
		assert.equal(await handler.handle({ ...envelope("pet.say", { text: "ignored" }), id: "" }), false)
		assert.equal(await handler.handle({ ...envelope("pet.say", { text: "ignored" }), at: "now" }), false)
		assert.deepEqual(calls, [])
		assert.equal(warnings.length, 4)
		assert.deepEqual(warnings.map((entry) => entry.fields?.reason), [
			"unknown-type",
			"version-mismatch",
			"bad-id",
			"bad-at",
		])
	})

	it("executes only the three allowlisted pet commands and returns their exact result", async () => {
		const replies = []
		const calls = []
		const handler = createMessageHandler({
			send: (reply) => replies.push(reply),
			petService: {
				say: (payload) => { calls.push(["say", payload]); return payload },
				playAction: (payload) => { calls.push(["playAction", payload]); return payload },
				setEvent: (payload) => { calls.push(["setEvent", payload]); return payload },
			},
		})
		assert.equal(await handler.handle(envelope("pet.command.request", {
			operation: "setEvent",
			payload: { type: "status", message: "working", ttlMs: 900, source: "http" },
		})), true)
		assert.deepEqual(calls, [["setEvent", { type: "status", message: "working", ttlMs: 900, source: "http" }]])
		assert.deepEqual(replies[0].body, {
			type: "pet.command.result",
			ok: true,
			result: { type: "status", message: "working", ttlMs: 900, source: "http" },
		})
	})

	it("passes only pluginId to the dashboard opener and ignores all backend window parameters", async () => {
		const dashboards = []
		const handler = createMessageHandler({
			send() {},
			onDashboard: (request) => dashboards.push(request),
		})

		assert.equal(await handler.handle(envelope("window.openPluginDashboard", {
			pluginId: "focus-timer",
			url: "file:///tmp/owned.html",
			preload: "/tmp/owned-preload.js",
			webPreferences: { nodeIntegration: true, sandbox: false },
			path: "/tmp/owned.html",
		})), true)

		assert.deepEqual(dashboards, [{ pluginId: "focus-timer" }])
	})

	it("handles Creator authority requests with correlated strict result envelopes", async () => {
		const replies = []
		const handler = createMessageHandler({
			send: (reply) => replies.push(reply),
			onCreatorRequest: async ({ operation, payload }) => ({ operation, payload, ok: true }),
		})
		assert.equal(await handler.handle(envelope("creator.request", { operation: "get-state", payload: {} })), true)
		assert.equal(replies[0].id, "test-creator.request")
		assert.deepEqual(replies[0].body, { type: "creator.result", operation: "get-state", ok: true, result: { operation: "get-state", payload: {}, ok: true } })
		const failed = []
		const failingHandler = createMessageHandler({
			send: (reply) => failed.push(reply),
			onCreatorRequest: () => { throw Object.assign(new Error("provider failed"), { code: "BACKEND_UNAVAILABLE" }) },
		})
		assert.equal(await failingHandler.handle(envelope("creator.request", { operation: "get-state", payload: {} })), true)
		assert.deepEqual(failed[0].body, { type: "creator.result", operation: "get-state", ok: false, error: { code: "BACKEND_UNAVAILABLE", message: "provider failed" } })
	})

	it("delivers settings.changed as paths and version only", async () => {
		const notifications = []
		const handler = createMessageHandler({ send() {}, onSettingsChanged: (payload) => notifications.push(payload) })
		assert.equal(await handler.handle(envelope("settings.changed", { paths: ["scale"], version: 4, values: { apiKey: "secret" } })), true)
		assert.deepEqual(notifications, [{ paths: ["scale"], version: 4 }])
	})

	it("answers settings.apply.request with the same envelope id after Shell effects settle", async () => {
		const replies = []
		const applied = []
		const handler = createMessageHandler({
			send: (reply) => replies.push(reply),
			onSettingsApplyRequest: async (payload) => { applied.push(payload) }
		})
		assert.equal(await handler.handle(envelope("settings.apply.request", { paths: ["scale"], version: 4, values: { scale: 1.2 } })), true)
		assert.equal(applied.length, 1)
		assert.deepEqual(applied[0].body, { type: "settings.apply.request", paths: ["scale"], version: 4, values: { scale: 1.2 } })
		assert.equal(applied[0].id, "test-settings.apply.request")
		assert.deepEqual(replies, [{ v: 1, id: "test-settings.apply.request", body: { type: "settings.apply.result", version: 4, ok: true } }].map((reply) => ({ ...reply, at: replies[0]?.at })))
	})

	it("fails closed when no settings host-effect handler is wired", async () => {
		const replies = []
		const handler = createMessageHandler({ send: (reply) => replies.push(reply) })
		assert.equal(await handler.handle(envelope("settings.apply.request", { paths: ["scale"], version: 4 })), true)
		assert.equal(replies[0].body.ok, false)
		assert.match(replies[0].body.error, /host effect unavailable/)
	})

	it("accepts only bounded Settings commands and returns the correlated result", async () => {
		const replies = []
		const commands = []
		const handler = createMessageHandler({
			send: (reply) => replies.push(reply),
			onSettingsCommandRequest: async (request) => { commands.push(request); return { scale: request.payload.scale } },
		})
		assert.equal(await handler.handle(envelope("settings.command.request", { operation: "preview-scale", payload: { scale: 1.2 } })), true)
		assert.deepEqual(commands, [{ operation: "preview-scale", payload: { scale: 1.2 } }])
		assert.equal(replies[0].id, "test-settings.command.request")
		assert.deepEqual(replies[0].body, { type: "settings.command.result", operation: "preview-scale", ok: true, result: { scale: 1.2 } })
		assert.equal(await handler.handle(envelope("settings.command.request", { operation: "preview-scale", payload: { scale: 2 } })), false)
		assert.equal(await handler.handle(envelope("settings.command.request", { operation: "import-cursor", payload: { sourcePath: "/tmp/file.png" } })), false)
		assert.equal(commands.length, 1)
	})

	it("persists provider-key writes in the Shell and replies without echoing plaintext", async () => {
		const replies = []
		const writes = []
		const secretService = {
			setSecret: (entry) => writes.push(entry),
			deleteSecret: (id) => writes.push({ deleted: id }),
		}
		const handler = createMessageHandler({ send: (reply) => replies.push(reply), secretService })
		const plaintext = "bridge-provider-secret-123456"

		assert.equal(await handler.handle(envelope("secrets.persist.request", { providerId: "openai", value: plaintext })), true)
		assert.deepEqual(writes, [{ id: "openai", value: plaintext, label: "openai", kind: "provider" }])
		assert.deepEqual(replies[0].body, { type: "secrets.persist.result", providerId: "openai", ok: true })
		assert.doesNotMatch(JSON.stringify(replies), /bridge-provider-secret/)

		assert.equal(await handler.handle(envelope("secrets.persist.request", { providerId: "openai", value: null })), true)
		assert.deepEqual(writes.at(-1), { deleted: "openai" })
		assert.deepEqual(replies.at(-1).body, { type: "secrets.persist.result", providerId: "openai", ok: true })
	})

	it("redacts a provider key when Shell persistence fails and rejects extra request fields", async () => {
		const replies = []
		const errors = []
		const plaintext = "opaque-shell-provider-secret"
		const handler = createMessageHandler({
			send: (reply) => replies.push(reply),
			secretService: { setSecret: () => { throw new Error(`disk failed for ${plaintext}`) } },
			logger: { error: (message, fields) => errors.push({ message, fields }) },
		})

		assert.equal(await handler.handle(envelope("secrets.persist.request", { providerId: "custom", value: plaintext })), true)
		assert.equal(replies[0].body.ok, false)
		assert.doesNotMatch(JSON.stringify({ replies, errors }), /opaque-shell-provider-secret/)
		assert.equal(await handler.handle(envelope("secrets.persist.request", { providerId: "custom", value: plaintext, readBack: true })), false)
	})

	it("answers a validated catalog.request with the correlated catalog.result", async () => {
		const replies = []
		const requests = []
		const handler = createMessageHandler({
			send: (reply) => replies.push(reply),
			onCatalogRequest: async (request) => { requests.push(request); return { selectionId: "selection-1" } },
		})
		assert.equal(await handler.handle(envelope("catalog.request", {
			request: { operation: "prepareInstall", kind: "plugin", itemId: "focus-timer" },
		})), true)
		assert.deepEqual(requests, [{ operation: "prepareInstall", kind: "plugin", itemId: "focus-timer" }])
		assert.equal(replies[0].id, "test-catalog.request")
		assert.deepEqual(replies[0].body, { type: "catalog.result", ok: true, result: { selectionId: "selection-1" } })
	})

	it("rejects malformed pet-pack operation payloads before Shell dispatch", async () => {
		const calls = []
		const handler = createMessageHandler({
			send: (reply) => calls.push(["reply", reply.body]),
			onPetPackRequest: (request) => { calls.push(["request", request]); return { canceled: true } },
		})
		assert.equal(await handler.handle(envelope("pet-packs.request", { operation: "validate", payload: { sourcePath: "/tmp/pack", path: "/tmp/other" } })), false)
		assert.equal(await handler.handle(envelope("pet-packs.request", { operation: "activate", payload: { packId: "demo", sourcePath: "/tmp/owned" } })), false)
		assert.equal(await handler.handle(envelope("pet-packs.request", { operation: "list", payload: { packId: "demo" } })), false)
		assert.equal(await handler.handle(envelope("pet-packs.request", { operation: "pick", payload: { sourcePath: "/tmp/owned" } })), false)
		assert.equal(await handler.handle(envelope("pet-packs.request", { operation: "pick", payload: {} })), true)
		assert.deepEqual(calls, [
			["request", { operation: "pick", payload: {} }],
			["reply", { type: "pet-packs.result", operation: "pick", ok: true, result: { canceled: true } }],
		])
	})

	it("keeps the shared Pet Pack bridge contract operation-specific", async () => {
		const { backendToShellSchema } = await import("@openpet/contracts")
		const valid = (operation, payload) => backendToShellSchema.safeParse({ type: "pet-packs.request", operation, payload }).success
		assert.equal(valid("list", {}), true)
		assert.equal(valid("pick", {}), true)
		assert.equal(valid("pick", { sourcePath: "/tmp/owned" }), false)
		assert.equal(valid("manifest", { packId: "demo_pack" }), true)
		assert.equal(valid("import", { selectionId: "selection-1" }), true)
		assert.equal(valid("export", { packId: "demo_pack", target: "/tmp/export" }), true)
		assert.equal(valid("validate", { sourcePath: "/tmp/pack", path: "/tmp/other" }), false)
		assert.equal(valid("activate", { packId: "demo_pack", sourcePath: "/tmp/owned" }), false)
		assert.equal(valid("list", { packId: "demo_pack" }), false)
		assert.equal(valid("import", { selectionId: "selection-1", sourcePath: "/tmp/pack" }), false)
		assert.equal(valid("remove", { packId: "../outside" }), false)
		assert.equal(valid("validate", { sourcePath: "   " }), false)
		assert.equal(valid("export", { packId: "demo_pack", target: "   " }), false)
	})

	it("keeps behavior dry-run bridge payloads bounded and operation-specific", async () => {
		const { backendToShellSchema } = await import("@openpet/contracts")
		const valid = (payload) => backendToShellSchema.safeParse({ type: "ai.talk.request", operation: "behavior.dry-run", payload }).success
		assert.equal(valid({ reply: "hello", rules: [{ when: { contains: ["hello"] }, then: { type: "say", text: "hi" } }] }), true)
		assert.equal(valid({ reply: "hello", behaviorIntent: { confidence: 0.8, displayMode: "bubble" } }), true)
		assert.equal(valid({ reply: "hello", behaviorIntent: { confidence: "high" } }), false)
		assert.equal(valid({ reply: "hello", behaviorIntent: { unexpected: true } }), false)
		assert.equal(valid({ reply: "hello", rules: [{ then: { type: "shell.execute" } }] }), false)
		assert.equal(valid({ reply: "hello", rules: Array.from({ length: 51 }, () => ({})) }), false)
	})

		it("keeps behavior rule mutations strict while accepting supported rule fields", async () => {
		const { backendToShellSchema } = await import("@openpet/contracts")
		const valid = (operation, payload) => backendToShellSchema.safeParse({ type: "ai.talk.request", operation, payload }).success
		const rule = { id: "greeting", enabled: true, priority: 4, when: { contains: ["hello"], minConfidence: 0.7 }, then: { type: "say", text: "Hi" } }
		assert.equal(valid("behavior.rule.create", { rule }), true)
		assert.equal(valid("behavior.rule.update", { ruleId: "greeting", patch: { when: { intent: "greet" } } }), true)
		assert.equal(valid("behavior.rule.create", { rule: { when: { unsupported: true } } }), false)
		assert.equal(valid("behavior.rule.update", { ruleId: "greeting", patch: { then: { type: "shell.execute" } } }), false)
	})

	it("keeps behavior config writes as strict bounded patches without decisions", async () => {
		const { backendToShellSchema } = await import("@openpet/contracts")
		const valid = (config) => backendToShellSchema.safeParse({ type: "ai.talk.request", operation: "behavior.save", payload: { config } }).success
		assert.equal(valid({ enabled: true }), true)
		assert.equal(valid({ rules: [{ when: { contains: ["hello"] } }] }), true)
		assert.equal(valid({ unsupported: true }), false)
		assert.equal(valid({ decisions: [] }), false)
		assert.equal(valid({ cooldownMs: -1 }), false)
		assert.equal(valid({ rules: Array.from({ length: 51 }, () => ({})) }), false)
	})

	it("answers a validated actions.request and rejects extra payload fields", async () => {
		const replies = []
		const requests = []
		const handler = createMessageHandler({
			send: (reply) => replies.push(reply),
			onActionsRequest: async (request) => { requests.push(request); return { actions: [{ id: "idle" }] } },
		})
		assert.equal(await handler.handle(envelope("actions.request", { operation: "get", payload: {} })), true)
		assert.deepEqual(requests, [{ operation: "get", payload: {} }])
		assert.equal(replies[0].id, "test-actions.request")
		assert.deepEqual(replies[0].body, { type: "actions.result", operation: "get", ok: true, result: { actions: [{ id: "idle" }] } })
		assert.equal(await handler.handle(envelope("actions.request", { operation: "get", payload: { path: "/tmp/owned" } })), false)
	})

		it("answers validated AI talk requests with correlated structured results", async () => {
		const responses = []
		const requests = []
		const handler = createMessageHandler({
			send: (envelope) => responses.push(envelope),
			onAiTalkRequest: async ({ operation, payload }) => {
				requests.push({ operation, payload })
				if (operation === "persona.draft") return { petPackId: "cat", petPackDisplayName: "Cat", draftPersona: { tone: "warm" }, compiledPersonaPrompt: "A warm cat." }
				if (operation === "hatch.stop") return { canceled: false }
				if (operation === "hatch.key.save") return { apiKeyRef: "ai.hatch-pet", hasApiKey: true }
				if (operation === "hatch.config.save") return {
					enabled: true, executionMode: "shadow", configMode: "follow-chat", provider: "openai-compatible",
					baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKeyRef: "ai.hatch-pet",
					systemPromptVersion: 1, requireIdentityReviewBeforeActions: false,
					budgets: {
						maxIdentityRegenerations: 1, maxActionAttemptsPerAction: 3,
						maxEvaluationAttemptsPerArtifact: 3, maxPlannerCalls: 34, maxEvaluatorCalls: 68,
						maxProviderCalls: 20, maxElapsedMs: 43200000, maxEstimatedCost: null,
					},
					hasApiKey: false, configSource: "chat-fallback",
					effectiveProvider: "openai-compatible", effectiveBaseUrl: "https://api.openai.com/v1",
					effectiveModel: "gpt-4o-mini",
				}
				if (operation === "behavior.decision.replay") return { replayOf: 2, matched: false, reason: "no behavior rule matched" }
				return {}
			},
		})
		const accepted = await handler.handle(envelope("ai.talk.request", { operation: "persona.draft", payload: { instruction: "warm" } }))
		assert.equal(accepted, true)
		assert.equal(responses[0].id, "test-ai.talk.request")
		assert.deepEqual(responses[0].body, {
			type: "ai.talk.result", operation: "persona.draft", ok: true,
			result: { petPackId: "cat", petPackDisplayName: "Cat", draftPersona: { tone: "warm" }, compiledPersonaPrompt: "A warm cat." },
		})
		const before = responses.length
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "persona.save", payload: { token: "secret" } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "config.save", payload: { config: { enabled: "yes" } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "config.save", payload: { config: { provider: "custom-provider" } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "config.save", payload: { config: { vision: { provider: "custom-provider" } } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "config.save", payload: { config: { baseUrl: "file:///tmp/provider" } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "config.save", payload: { config: { vision: { baseUrl: "https://user:pass@example.test/v1" } } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "config.save", payload: { config: { model: "   " } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "config.save", payload: { config: { baseUrl: "x".repeat(2001) } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "config.save", payload: { config: { vision: { model: "x".repeat(2001) } } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "config.save", payload: { config: { memory: { enabled: true, extra: true } } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "config.save", payload: { config: { memory: {} } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "memory.create", payload: { memory: {} } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "memory.create", payload: { memory: { text: "remember", confidence: Number.NaN } } })), false)
		assert.equal(responses.length, before)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "hatch.stop", payload: { runId: "run-1" } })), true)
		assert.deepEqual(requests.at(-1), { operation: "hatch.stop", payload: { runId: "run-1" } })
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "hatch.key.save", payload: { apiKey: "host-owned-secret" } })), true)
		assert.deepEqual(requests.at(-1), { operation: "hatch.key.save", payload: { apiKey: "host-owned-secret" } })
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "hatch.config.save", payload: { config: { enabled: true, budgets: { maxProviderCalls: 20 } } } })), true)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.decision.replay", payload: { decisionId: 2 } })), true)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "hatch.key.save", payload: { apiKey: "" } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.decision.replay", payload: { decisionId: 0 } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.dry-run", payload: { reply: "hello", behaviorIntent: { confidence: "high" } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.dry-run", payload: { reply: "hello", behaviorIntent: { unexpected: true } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.dry-run", payload: { reply: "hello", rules: [{ then: { type: "shell.execute" } }] } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.dry-run", payload: { reply: "hello", rules: Array.from({ length: 51 }, () => ({})) } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.rule.create", payload: { rule: { when: { unsupported: true } } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.rule.update", payload: { ruleId: "rule-1", patch: { then: { type: "shell.execute" } } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.save", payload: { config: { unsupported: true } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.save", payload: { config: { rules: [{ when: { unsupported: true } }] } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "behavior.save", payload: { config: { decisions: [] } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "hatch.stop", payload: { runId: "run-1", signal: true } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "hatch.start", payload: { runId: "run-1", mode: { nested: true } } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "hatch.start", payload: { runId: "run-1", stage: "x".repeat(81) } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "trace.get", payload: {} })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "trace.get", payload: { conversationId: 42 } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "memory.delete", payload: { memoryId: 42 } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "memory.delete", payload: { memoryId: "x".repeat(161) } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "conversation.list", payload: { entrypoint: 42 } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "chat", payload: { message: "hello", conversationId: 42 } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "talk.start", payload: { message: "hello", requestId: "x".repeat(161) } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "persona.draft", payload: { instruction: 42 } })), false)
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "persona.draft", payload: { instruction: "x".repeat(2001) } })), false)
		assert.deepEqual(requests.at(-1), { operation: "behavior.decision.replay", payload: { decisionId: 2 } })
	})

	it("classifies AI provider and key failures with safe typed reverse errors", async () => {
		const responses = []
		const cases = [
			{ error: Object.assign(new Error("AI provider request timed out"), { name: "TimeoutError", code: "INTERNAL" }), code: "PROVIDER_TIMEOUT", message: "AI provider request timed out" },
			{ error: Object.assign(new Error("upstream apiKey=sk-provider-secret"), { providerStatus: 401, providerCode: "invalid_api_key" }), code: "PERMISSION_DENIED", message: "AI provider authentication failed" },
			{ error: Object.assign(new Error("upstream rejected credentials"), { providerStatus: 403 }), code: "PERMISSION_DENIED", message: "AI provider authentication failed" },
			{ error: Object.assign(new Error("model missing"), { providerStatus: 404 }), code: "NOT_FOUND", message: "AI provider endpoint or model was not found" },
			{ error: Object.assign(new Error("too many requests"), { providerStatus: 429 }), code: "RATE_LIMITED", message: "AI provider rate limit exceeded" },
			{ error: Object.assign(new Error("upstream closed the request"), { providerStatus: 408 }), code: "PROVIDER_TIMEOUT", message: "AI provider request timed out" },
			{ error: Object.assign(new Error("bad provider request"), { providerStatus: 400 }), code: "VALIDATION_FAILED", message: "AI provider rejected the request" },
			{ error: new Error("AI API key is not configured"), code: "AI_KEY_NOT_CONFIGURED", message: "AI API key is not configured" },
			{ error: Object.assign(new Error("shell unavailable: bearer-secret"), { code: "BACKEND_UNAVAILABLE" }), code: "BACKEND_UNAVAILABLE", message: "AI service temporarily unavailable" },
			{ error: Object.assign(new Error("server error"), { providerStatus: 500 }), code: "PROVIDER_ERROR", message: "AI provider request failed" },
			{ error: Object.assign(new Error("gateway returned an error response"), { providerStatus: 504 }), code: "PROVIDER_TIMEOUT", message: "AI provider request timed out" },
			{ error: new Error("AI provider stream failed"), code: "PROVIDER_ERROR", message: "AI provider request failed" },
			{ error: new Error("AI provider request failed"), code: "PROVIDER_ERROR", message: "AI provider request failed" },
		]
		const handler = createMessageHandler({
			send: (response) => responses.push(response),
			onAiTalkRequest: async () => { throw cases.shift().error },
		})
		const expected = [
			{ code: "PROVIDER_TIMEOUT", message: "AI provider request timed out" },
			{ code: "PERMISSION_DENIED", message: "AI provider authentication failed" },
			{ code: "PERMISSION_DENIED", message: "AI provider authentication failed" },
			{ code: "NOT_FOUND", message: "AI provider endpoint or model was not found" },
			{ code: "RATE_LIMITED", message: "AI provider rate limit exceeded" },
			{ code: "PROVIDER_TIMEOUT", message: "AI provider request timed out" },
			{ code: "VALIDATION_FAILED", message: "AI provider rejected the request" },
			{ code: "AI_KEY_NOT_CONFIGURED", message: "AI API key is not configured" },
			{ code: "BACKEND_UNAVAILABLE", message: "AI service temporarily unavailable" },
			{ code: "PROVIDER_ERROR", message: "AI provider request failed" },
			{ code: "PROVIDER_TIMEOUT", message: "AI provider request timed out" },
			{ code: "PROVIDER_ERROR", message: "AI provider request failed" },
			{ code: "PROVIDER_ERROR", message: "AI provider request failed" },
		]
		for (let index = 0; index < expected.length; index += 1) {
			assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "provider.test", payload: { providerId: "chat" } })), true)
			assert.deepEqual(responses[index].body, {
				type: "ai.talk.result", operation: "provider.test", ok: false, error: expected[index],
			})
		}
		assert.equal(JSON.stringify(responses).includes("sk-provider-secret"), false)
		assert.equal(JSON.stringify(responses).includes("bearer-secret"), false)
	})

	it("preserves non-provider AI operation errors while classifying provider statuses", async () => {
		const responses = []
		const handler = createMessageHandler({
			send: (response) => responses.push(response),
			onAiTalkRequest: async () => { throw Object.assign(new Error("memoryId is invalid"), { code: "VALIDATION_FAILED" }) },
		})
		assert.equal(await handler.handle(envelope("ai.talk.request", { operation: "memory.delete", payload: { memoryId: "m-1" } })), true)
		assert.deepEqual(responses[0].body, {
			type: "ai.talk.result", operation: "memory.delete", ok: false,
			error: { code: "VALIDATION_FAILED", message: "memoryId is invalid" },
		})
	})

	it("rejects catalog bridge operations and fields outside the frozen allowlist", async () => {
		const calls = []
		const warnings = []
		const handler = createMessageHandler({
			send() {},
			onCatalogRequest: (request) => calls.push(request),
			logger: { warn: (_message, fields) => warnings.push(fields) },
		})
		assert.equal(await handler.handle(envelope("catalog.request", { request: { operation: "executePath", path: "/tmp/owned" } })), false)
		assert.equal(await handler.handle(envelope("catalog.request", {
			request: { operation: "installSelection", selectionId: "selection-1", path: "/tmp/owned" },
		})), false)
		assert.deepEqual(calls, [])
		assert.deepEqual(warnings.map(({ reason }) => reason), ["bad-body", "bad-body"])
	})

	it("validates plugin production operations and redacts production failures", async () => {
		const replies = []
		const calls = []
		const secret = "production-secret-123456"
		const handler = createMessageHandler({
			send: (reply) => replies.push(reply),
			productionService: async (request) => {
				calls.push(request)
				throw new Error("host rejected " + secret)
			},
		})
		assert.equal(await handler.handle(envelope("plugin.production.request", { operation: "storage.clear", pluginId: "demo.plugin" })), true)
		assert.deepEqual(calls, [{ type: "plugin.production.request", operation: "storage.clear", pluginId: "demo.plugin" }])
		assert.deepEqual(replies[0].body, {
			type: "plugin.production.result",
			requestId: "test-plugin.production.request",
			ok: false,
			error: "Plugin production request failed",
		})
		assert.doesNotMatch(JSON.stringify(replies), /production-secret-123456/)

		assert.equal(await handler.handle(envelope("plugin.production.request", { operation: "secret.save", token: secret, pluginId: "ignored" })), false)
		assert.equal(await handler.handle(envelope("plugin.production.request", { operation: "secret.state", extra: true })), false)
		assert.equal(await handler.handle(envelope("plugin.production.request", { operation: "service.health", pluginId: "demo.plugin" })), false)
	})
})
