"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

test("AI Talk Control Center API uses the Backend persona and memory routes", async () => {
	const { createAiTalkHttpApi } = await import("../../apps/control-center/src/features/ai/talk-api.ts")
	const calls = []
	const client = { request: async (input) => { calls.push(input); return {} } }
	const api = createAiTalkHttpApi(client)
	await api.getPersona()
	await api.savePersona({ name: "Pet" })
	await api.generatePersonaDraft("brighter")
	await api.getMemoryProfile()
	await api.deleteMemory("memory/one")
	await api.clearPetPackMemories()
	assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
		"GET /ai/persona", "PUT /ai/persona", "POST /ai/persona/draft",
		"GET /ai/memories", "DELETE /ai/memories/memory%2Fone", "DELETE /ai/memories/pet-pack",
	])
	assert.equal(calls[1].body.override.name, "Pet")
	assert.equal(calls[1].retry, false)
	assert.equal(calls[2].timeoutMs, 60_000)
	assert.equal(calls[5].retry, false)
})

test("AI Talk HTTP facade maps conversations and Hatch requests to Backend routes", async () => {
	const { createAiTalkHttpApi } = await import("../../apps/control-center/src/features/ai/talk-api.ts")
	const calls = []
	const client = { request: async (input) => { calls.push(input); return input.path === "/ai/conversations" ? { conversations: [] } : { jobId: "hatch-1" } } }
	const api = createAiTalkHttpApi(client)
	await api.listConversations({ entrypoint: "control-center", petPackId: "cat one" })
	await api.startHatch({ runId: "run-1", mode: "single-action" })
	assert.equal(calls[0].path, "/ai/conversations?entrypoint=control-center&petPackId=cat%20one")
	assert.equal(calls[1].path, "/ai/hatch/start")
	assert.equal(calls[1].retry, false)
})

test("AI Talk HTTP facade owns image configuration and key routes", async () => {
	const { createAiTalkHttpApi } = await import("../../apps/control-center/src/features/ai/talk-api.ts")
	const calls = []
	const client = { request: async (input) => { calls.push(input); return input.method === "DELETE" ? { apiKeyRef: "secret:model.image.openai.apiKey", hasApiKey: false, apiKeyPreview: "" } : {} } }
	const api = createAiTalkHttpApi(client)
	await api.getImageConfig()
	await api.saveImageConfig({ model: "gpt-image-2", timeoutMs: 90000 })
	await api.saveImageApiKey("sk-image-test")
	await api.clearImageApiKey()
	assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
		"GET /ai/images/config",
		"PATCH /ai/images/config",
		"PUT /ai/images/key",
		"DELETE /ai/images/key",
	])
	assert.deepEqual(calls[1].body, { config: { model: "gpt-image-2", timeoutMs: 90000 } })
	assert.equal(calls[1].retry, false)
	assert.equal(calls[2].body.apiKey, "sk-image-test")
	assert.equal(calls[3].retry, false)
})

test("AI Talk facade exposes current conversation list, read, and delete routes", async () => {
	const { createAiTalkHttpApi } = await import("../../apps/control-center/src/features/ai/talk-api.ts")
	const calls = []
	const client = { request: async (input) => { calls.push(input); return input.path.includes("/ai/conversations?") ? { conversations: [] } : { conversationId: "cat:main", messages: [] } } }
	const api = createAiTalkHttpApi(client)
	await api.listConversations({ entrypoint: "control-center", petPackId: "cat" })
	await api.getConversation("control-center:cat:main")
	await api.deleteConversation("control-center:cat:old")
	assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
		"GET /ai/conversations?entrypoint=control-center&petPackId=cat",
		"GET /ai/conversations/control-center%3Acat%3Amain",
		"DELETE /ai/conversations/control-center%3Acat%3Aold",
	])
	assert.equal(calls[2].retry, false)
})

test("AI pane assigns conversation operations to its chat workflow", () => {
	const source = fs.readFileSync(path.resolve(__dirname, "../../apps/control-center/src/hooks/useAiPane.ts"), "utf8")
	assert.match(source, /aiTalkApi\.listConversations/)
	assert.match(source, /aiTalkApi\.getConversation/)
	assert.match(source, /aiTalkApi\.deleteConversation/)
	assert.match(source, /aiTalkApi\.chat\(\{ message, conversationId, entrypoint: 'control-center' \}\)/)
	const pane = fs.readFileSync(path.resolve(__dirname, "../../apps/control-center/src/panes/AiPane.tsx"), "utf8")
	assert.match(pane, /data-testid="ai-conversation-toolbar"/)
	assert.match(pane, /onSelectConversation\(event\.target\.value\)/)
})

test("AI pane uses the Backend image facade in runtime mode", () => {
	const source = fs.readFileSync(path.resolve(__dirname, "../../apps/control-center/src/hooks/useAiPane.ts"), "utf8")
	assert.match(source, /aiTalkApi\.getImageConfig\(\)/)
	assert.match(source, /aiTalkApi\.saveImageConfig\(/)
	assert.match(source, /aiTalkApi\.saveImageApiKey\(/)
	assert.match(source, /aiTalkApi\.clearImageApiKey\(/)
	assert.doesNotMatch(source, /api\.getImageGenerationConfig\(/)
	assert.doesNotMatch(source, /api\.saveImageGenerationConfig\(/)
	assert.doesNotMatch(source, /api\.saveImageGenerationApiKey\(/)
	assert.doesNotMatch(source, /api\.clearImageGenerationApiKey\(/)
})

test("AI pane keeps historical conversation selection separate from the PetService main conversation", () => {
	const source = fs.readFileSync(path.resolve(__dirname, "../../apps/control-center/src/hooks/useAiPane.ts"), "utf8")
	const selection = source.slice(source.indexOf("const selectConversation"), source.indexOf("const deleteConversation"))
	assert.match(selection, /setConversationId\(normalizedId\)/)
	assert.doesNotMatch(selection, /setPetChatState/)
	const send = source.slice(source.indexOf("const onSendChat"), source.indexOf("const onOpenDesktopChat"))
	assert.match(send, /aiTalkApi\.chat\(\{ message, conversationId, entrypoint: 'control-center' \}\)/)
	assert.match(send, /isMainConversation \? \{ conversationId: resolvedConversationId, messages: resolvedMessages \} : \{\}/)
})

test("AI Talk demo facade clears the key for the selected provider", () => {
	const source = fs.readFileSync(path.resolve(__dirname, "../../apps/control-center/src/features/ai/talk-api.ts"), "utf8")
	assert.match(source, /providerId === 'ai\.vision'/)
	assert.match(source, /demoTalkApi\.clearAiApiKey/)
})

test("AI chat SSE parser handles split UTF-8 frames and requires a valid terminal payload", async () => {
	const { configureBackendClient } = await import("../../apps/control-center/src/api/backend-client.ts")
	const { aiTalkApi } = await import("../../apps/control-center/src/features/ai/talk-api.ts")
	const encoder = new TextEncoder()
	const frame = [
		"event: ai.chat-delta\ndata: {\"conversationId\":\"control-center:cat:main\",\"delta\":\"你好\"}\n\n",
		"event: ai.chat-done\ndata: {\"conversationId\":\"control-center:cat:main\",\"reply\":\"你好\"}\n\n",
		": stream complete\n\n",
	].join("")
	const bytes = encoder.encode(frame)
	configureBackendClient({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4000/api/v1", sessionToken: "t".repeat(32) }),
		fetchImpl: async () => new Response(new ReadableStream({
			start(controller) {
				controller.enqueue(bytes.slice(0, bytes.indexOf(0xe4) + 1))
				controller.enqueue(bytes.slice(bytes.indexOf(0xe4) + 1))
				controller.close()
			},
		}), { status: 200, headers: { "content-type": "text/event-stream" } }),
	})
	const deltas = []
	const result = await aiTalkApi.chat({ message: "你好" }, { onDelta: (delta) => deltas.push(delta) })
	assert.deepEqual(deltas, ["你好"])
	assert.equal(result.reply, "你好")

	configureBackendClient({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4000/api/v1", sessionToken: "t".repeat(32) }),
		fetchImpl: async () => new Response("event: ai.chat-done\ndata: {\"conversationId\":\"control-center:cat:main\",\"reply\":\"ok\",\"behavior\":{\"matched\":true}}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }),
	})
	assert.equal((await aiTalkApi.chat({ message: "hello" })).behavior.matched, true)

	configureBackendClient({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4000/api/v1", sessionToken: "t".repeat(32) }),
		fetchImpl: async () => new Response("event: ai.chat-done\ndata: {\"conversationId\":\"control-center:cat:main\",\"reply\":\"ok\",\"leaked\":\"secret\"}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }),
	})
	await assert.rejects(() => aiTalkApi.chat({ message: "hello" }), /invalid terminal response/)
	configureBackendClient({ getBackend: () => null })
})

test("AI chat SSE parser rejects malformed deltas and events after the terminal frame", async () => {
	const { configureBackendClient } = await import("../../apps/control-center/src/api/backend-client.ts")
	const { aiTalkApi } = await import("../../apps/control-center/src/features/ai/talk-api.ts")
	const terminal = "event: ai.chat-done\ndata: {\"conversationId\":\"control-center:cat:main\",\"reply\":\"ok\"}\n\n"
	const cases = [
		{
			body: "event: ai.chat-delta\ndata: {\"conversationId\":\"control-center:cat:main\",\"delta\":\"x\",\"leaked\":\"secret\"}\n\n" + terminal,
			error: /invalid delta/,
		},
		{
			body: terminal + "event: ai.chat-delta\ndata: {\"conversationId\":\"control-center:cat:main\",\"delta\":\"late\"}\n\n",
			error: /after the terminal event/,
		},
		{
			body: "event: ai.chat-delta\ndata: {bad json}\n\n" + terminal,
			error: /invalid JSON in ai.chat-delta/,
		},
		{
			body: "event: ai.chat-delta\ndata: {\"conversationId\":\"control-center:cat:main\",\"delta\":\"partial\"}\n\n",
			error: /ended without a terminal event/,
		},
	]
	try {
		for (const { body, error } of cases) {
			configureBackendClient({
				getBackend: () => ({ baseUrl: "http://127.0.0.1:4000/api/v1", sessionToken: "t".repeat(32) }),
				fetchImpl: async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
			})
			await assert.rejects(() => aiTalkApi.chat({ message: "hello" }), error)
		}
	} finally {
		configureBackendClient({ getBackend: () => null })
	}
})

test("AI chat SSE parser cancels its reader when an invalid frame follows the terminal event", async () => {
	const { configureBackendClient } = await import("../../apps/control-center/src/api/backend-client.ts")
	const { aiTalkApi } = await import("../../apps/control-center/src/features/ai/talk-api.ts")
	const encoder = new TextEncoder()
	const frames = [
		"event: ai.chat-done\ndata: {\"conversationId\":\"control-center:cat:main\",\"reply\":\"ok\"}\n\n",
		"event: ai.chat-delta\ndata: {\"conversationId\":\"control-center:cat:main\",\"delta\":\"late\"}\n\n",
	].join("")
	let canceled = false
	try {
		configureBackendClient({
			getBackend: () => ({ baseUrl: "http://127.0.0.1:4000/api/v1", sessionToken: "t".repeat(32) }),
			fetchImpl: async () => new Response(new ReadableStream({
				start(controller) { controller.enqueue(encoder.encode(frames)) },
				cancel() { canceled = true },
			}), { status: 200, headers: { "content-type": "text/event-stream" } }),
		})
		await assert.rejects(() => aiTalkApi.chat({ message: "hello" }), /after the terminal event/)
		assert.equal(canceled, true)
	} finally {
		configureBackendClient({ getBackend: () => null })
	}
})
