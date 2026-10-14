"use strict"

const assert = require("node:assert/strict")
const { before, describe, it } = require("node:test")

let bridge
let shellClient
const shellMessageHandler = require("../../apps/desktop/src/sidecar/message-handler")

before(async () => {
	bridge = await import("../../services/backend/bridge/message-schema.js")
	shellClient = await import("../../services/backend/bridge/shell-client.js")
})

function resultEnvelope(id, paths) {
	return bridge.createEnvelope(
		{
			type: "dialog.result",
			requestId: id,
			paths,
		},
		{ id },
	)
}

describe("dialog.request bridge", () => {
	it("backend whitelist contains exactly the 20 contract message types", () => {
		assert.equal(bridge.BACKEND_TO_SHELL_TYPES.length, 20)
		assert.equal(new Set(bridge.BACKEND_TO_SHELL_TYPES).size, 20)
		assert.equal(bridge.BACKEND_TO_SHELL_TYPES.includes("dialog.request"), true)
		assert.equal(bridge.BACKEND_TO_SHELL_TYPES.includes("catalog.request"), true)
		assert.equal(bridge.BACKEND_TO_SHELL_TYPES.includes("pet-packs.request"), true)
		assert.equal(bridge.SHELL_TO_BACKEND_TYPES.length, 16, "settings, secrets, Catalog, Pet Pack, Creator, Actions, AI and pet command host results are part of the bridge contract")
	})

	it("request and dialog.result correlate with the same envelope id", async () => {
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })

		const responsePromise = client.request({ type: "dialog.request", mode: "directory" })
		assert.equal(sent.length, 1)
		assert.equal(sent[0].body.requestId, sent[0].id)
		assert.equal(sent[0].body.mode, "directory")

		client.receive(resultEnvelope(sent[0].id, ["/tmp/openpet"]))
		const response = await responsePromise
		assert.equal(response.id, sent[0].id)
		assert.deepEqual(response.body.paths, ["/tmp/openpet"])
		client.dispose()
	})

	it("round-trips plugin production requests through the typed reverse channel", async () => {
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })
		const responsePromise = client.request({
			type: "plugin.production.request",
			operation: "storage.clear",
			pluginId: "demo.plugin",
		})
		assert.equal(sent[0].body.type, "plugin.production.request")
		client.receive(bridge.createEnvelope({
			type: "plugin.production.result",
			requestId: sent[0].id,
			ok: true,
			result: { ok: true, pluginId: "demo.plugin" },
		}, { id: sent[0].id }))
		const response = await responsePromise
		assert.deepEqual(response.body.result, { ok: true, pluginId: "demo.plugin" })
		client.dispose()
	})

	it("keeps plugin production success and failure payloads mutually exclusive", async () => {
		const contracts = await import("@openpet/contracts")
		const validSuccess = contracts.backendToShellEnvelopeSchema.safeParse(bridge.createEnvelope({
			type: "plugin.production.request", operation: "secret.state",
		}, { id: "request-1" }))
		assert.equal(validSuccess.success, true)
		const resultSchema = contracts.shellToBackendEnvelopeSchema
		assert.equal(resultSchema.safeParse(bridge.createEnvelope({
			type: "plugin.production.result", requestId: "request-1", ok: true, result: { configured: false },
		}, { id: "request-1" })).success, true)
		assert.equal(resultSchema.safeParse(bridge.createEnvelope({
			type: "plugin.production.result", requestId: "request-1", ok: true,
		}, { id: "request-1" })).success, false)
		assert.equal(resultSchema.safeParse(bridge.createEnvelope({
			type: "plugin.production.result", requestId: "request-1", ok: false, error: "failed", result: { leaked: true },
		}, { id: "request-1" })).success, false)
	})

	it("requires strict Pet Pack reverse response branches", async () => {
		const contracts = await import("@openpet/contracts")
		const responseSchema = contracts.shellToBackendEnvelopeSchema
		const valid = (body) => responseSchema.safeParse(bridge.createEnvelope(body, { id: "pet-pack-request" }))

		assert.equal(valid({
			type: "pet-packs.result", operation: "list", ok: true, result: { activePackId: "legacy-cat", packs: [] },
		}).success, true)
		assert.equal(valid({ type: "pet-packs.result", operation: "list", ok: true }).success, false)
		assert.equal(valid({
			type: "pet-packs.result", operation: "list", ok: false,
			error: { code: "NOT_FOUND", message: "missing" }, result: {},
		}).success, false)
		assert.equal(valid({
			type: "pet-packs.result", operation: "list", ok: false,
			error: { code: "NOT_FOUND", message: "missing", debugPath: "/private/path" },
		}).success, false)

		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })
		const pending = client.request({ type: "pet-packs.request", operation: "list", payload: {} })
		client.receive(bridge.createEnvelope({
			type: "pet-packs.result", operation: "list", ok: true,
		}, { id: sent[0].id }))
		await assert.rejects(pending, /pet-packs\.result has no result/)
		client.dispose()
	})

	it("validates AI reverse requests against operation fields and rejects empty success results", async () => {
		const contracts = await import("@openpet/contracts")
		const request = (operation, payload) => bridge.createEnvelope({ type: "ai.talk.request", operation, payload }, { id: "ai-request" })
		const response = (body) => bridge.createEnvelope({ type: "ai.talk.result", operation: "persona.get", ...body }, { id: "ai-request" })
		const requestSchema = contracts.backendToShellEnvelopeSchema
		const responseSchema = contracts.shellToBackendEnvelopeSchema

		assert.equal(requestSchema.safeParse(request("config.save", { config: { enabled: true } })).success, true)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { provider: "openai-compatible", vision: { provider: "openai-compatible" } } })).success, true)
		assert.equal(requestSchema.safeParse(request("config.save", {
			config: {
				provider: "openai-compatible",
				baseUrl: "https://" + "x".repeat(1992),
				model: "x".repeat(2000),
				systemPrompt: "x".repeat(12000),
				vision: { provider: "openai-compatible", baseUrl: "https://" + "x".repeat(1992), model: "x".repeat(2000) },
			},
		})).success, true)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { provider: "custom-provider" } })).success, false)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { vision: { provider: "custom-provider" } } })).success, false)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { baseUrl: "file:///tmp/provider" } })).success, false)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { vision: { baseUrl: "https://user:pass@example.test/v1" } } })).success, false)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { model: "   " } })).success, false)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { baseUrl: "x".repeat(2001) } })).success, false)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { vision: { model: "x".repeat(2001) } } })).success, false)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { memory: {} } })).success, false)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { apiKeyRef: "ai.default" } })).success, false)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { memory: { enabled: true, extra: true } } })).success, false)
		assert.equal(requestSchema.safeParse(request("config.save", { config: { vision: { mode: "override", apiKeyRef: "ai.vision" } } })).success, false)
		assert.equal(requestSchema.safeParse(request("persona.save", { override: { coreTraits: ["calm", 1] } })).success, false)
		assert.equal(requestSchema.safeParse(request("memory.create", { memory: { text: "remember", tags: ["safe", 7] } })).success, false)
		assert.equal(requestSchema.safeParse(request("memory.create", { memory: { text: "remember", confidence: Number.NaN } })).success, false)
		assert.equal(requestSchema.safeParse(request("memory.create", { memory: { text: "remember", petPackId: 42 } })).success, false)
		assert.equal(requestSchema.safeParse(request("conversation.get", { conversationId: "chat-1", path: "/tmp/owned" })).success, false)
		for (const operation of ["chat", "talk.start"]) {
			for (const field of ["conversationId", "entrypoint", "requestId"]) {
				assert.equal(requestSchema.safeParse(request(operation, { message: "hello", [field]: 42 })).success, false, `${operation}.${field} must be a string`)
				assert.equal(requestSchema.safeParse(request(operation, { message: "hello", [field]: "x".repeat(161) })).success, false, `${operation}.${field} must be bounded`)
			}
		}
		assert.equal(requestSchema.safeParse(request("persona.draft", { instruction: 42 })).success, false)
		assert.equal(requestSchema.safeParse(request("persona.draft", { instruction: "x".repeat(2001) })).success, false)
		assert.equal(requestSchema.safeParse(request("provider.models", { providerId: "unknown" })).success, false)
		assert.equal(requestSchema.safeParse(request("trace.get", { conversationId: 42 })).success, false)
		assert.equal(requestSchema.safeParse(request("trace.get", {})).success, false)
		assert.equal(requestSchema.safeParse(request("memory.delete", { memoryId: 42 })).success, false)
		assert.equal(requestSchema.safeParse(request("conversation.list", { entrypoint: 42 })).success, false)
		assert.equal(requestSchema.safeParse(request("hatch.start", { runId: "run-1", mode: { nested: true } })).success, false)
		assert.equal(requestSchema.safeParse(request("hatch.start", { runId: "run-1", stage: "x".repeat(81) })).success, false)
		assert.equal(requestSchema.safeParse(request("hatch.key.save", { apiKey: "host-owned-secret" })).success, true)
		assert.equal(requestSchema.safeParse(request("hatch.key.save", { apiKey: "" })).success, false)
		assert.equal(requestSchema.safeParse(request("hatch.config.save", { config: { enabled: true, budgets: { maxProviderCalls: 20 } } })).success, true)
		assert.equal(requestSchema.safeParse(request("hatch.config.save", { config: { apiKeyRef: "forged" } })).success, false)
		assert.equal(requestSchema.safeParse(request("behavior.decision.replay", { decisionId: 3 })).success, true)
		assert.equal(requestSchema.safeParse(request("behavior.decision.replay", { decisionId: 0 })).success, false)
		assert.equal(responseSchema.safeParse(response({ ok: true })).success, false)
		assert.equal(responseSchema.safeParse(response({ ok: true, result: { persona: null } })).success, false)
		const connectionResult = (result) => contracts.parseAiTalkResult("provider.test", result).success
		const connectionBase = { ok: true, provider: "openai-compatible", baseUrl: "https://api.example.test/v1", model: "example-model", hasApiKey: true, elapsedMs: 1 }
		assert.equal(contracts.parseAiTalkResult("provider.test", { ...connectionBase, modelsProbe: "ok", modelsProbeMessage: "safe bounded probe message" }).success, true)
		for (const modelsProbe of ["ok", "unavailable", "failed", "timed_out", "rate_limited", "provider_unavailable"]) {
			assert.equal(connectionResult({ ...connectionBase, modelsProbe }), true, modelsProbe)
		}
		assert.equal(connectionResult({ ...connectionBase, modelsProbe: "other" }), false)
		assert.equal(connectionResult({ ...connectionBase, modelsProbeMessage: "x".repeat(241) }), false)
	})

	it("times out after 60 seconds with PROVIDER_TIMEOUT / 504", async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] })
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })
		const responsePromise = client.request({ type: "dialog.request", mode: "file" })

		t.mock.timers.tick(bridge.DIALOG_RESULT_TIMEOUT_MS)
		await assert.rejects(responsePromise, (error) => {
			assert.equal(error.code, "PROVIDER_TIMEOUT")
			assert.equal(error.status, 504)
			assert.equal(error.retryable, true)
			assert.equal(error.details.envelopeId, sent[0].id)
			return true
		})
		client.dispose()
	})

	it("treats paths: null as a successful cancellation result", async () => {
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })
		const responsePromise = client.request({ type: "dialog.request", mode: "file" })

		client.receive(resultEnvelope(sent[0].id, null))
		const response = await responsePromise
		assert.equal(response.body.requestId, sent[0].id)
		assert.equal(response.body.paths, null)
		client.dispose()
	})

	it("rejects a same-id response with the wrong type for settings host effects", async () => {
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })
		const responsePromise = client.request({ type: "settings.apply.request", paths: ["scale"], version: 4, values: { scale: 1.2 } })

		client.receive(resultEnvelope(sent[0].id, null))
		await assert.rejects(responsePromise, /unexpected Shell response type: expected settings\.apply\.result, got dialog\.result/)
		client.dispose()
	})

	it("accepts a valid settings host-effect response with the correlated id", async () => {
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })
		const responsePromise = client.request({ type: "settings.apply.request", paths: ["scale"], version: 4, values: { scale: 1.2 } })

		client.receive(bridge.createEnvelope({ type: "settings.apply.result", version: 4, ok: true }, { id: sent[0].id }))
		const response = await responsePromise
		assert.equal(response.id, sent[0].id)
		assert.deepEqual(response.body, { type: "settings.apply.result", version: 4, ok: true })
		client.dispose()
	})

	it("binds secret persistence to a strict response that cannot echo plaintext", async () => {
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })
		const responsePromise = client.request({ type: "secrets.persist.request", providerId: "openai", value: "provider-secret" })

		client.receive(bridge.createEnvelope({
			type: "secrets.persist.result",
			providerId: "openai",
			ok: true,
			value: "provider-secret",
		}, { id: sent[0].id }))

		await assert.rejects(responsePromise, /unexpected fields/)
		client.dispose()
	})

	it("binds catalog requests to catalog.result and rejects an invalid success body", async () => {
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })
		const responsePromise = client.request({ type: "catalog.request", request: { operation: "listCatalog" } })

		client.receive(bridge.createEnvelope({ type: "catalog.result", ok: true }, { id: sent[0].id }))
		await assert.rejects(responsePromise, /catalog\.result has no result/)
		client.dispose()
	})

	it("requires envelope at to be a positive integer in backend and Shell parsers", () => {
		for (const at of [0, -1, 1.5]) {
			const raw = bridge.createEnvelope({ type: "ready", port: 3210, apiVersion: "v1", pid: 42, sessionToken: "s".repeat(32), startupMs: 1 }, { at })
			assert.equal(bridge.parseEnvelope(raw).ok, false, `backend accepted at=${at}`)
			assert.equal(shellMessageHandler.parseEnvelope(raw).ok, false, `Shell accepted at=${at}`)
		}
	})

	it("keeps Shell allowlist mechanically aligned with the contract", async () => {
		const contracts = await import("@openpet/contracts")
		assert.deepEqual(bridge.BACKEND_TO_SHELL_TYPES, contracts.backendToShellSchema.options.map((option) => option.shape.type.value))
	})

	it("rejects in-flight requests when the Shell client is disposed", async () => {
		const client = shellClient.createShellClient({ send: () => {} })
		const pending = client.request({ type: "dialog.request", mode: "file" })
		client.dispose()
		const settled = await Promise.race([
			pending.then(() => false, () => true),
			new Promise((resolve) => setTimeout(() => resolve(false), 25)),
		])
		assert.equal(settled, true)
	})

	it("rejects waiters when the Shell client is disposed", async () => {
		const client = shellClient.createShellClient({ send: () => {} })
		const waiting = client.waitFor("dialog.result", { timeoutMs: 60_000 })
		client.dispose()
		await assert.rejects(waiting, /shellClient 已销毁/)
		await assert.rejects(client.waitFor("dialog.result"), /shellClient 已销毁/)
	})
})
