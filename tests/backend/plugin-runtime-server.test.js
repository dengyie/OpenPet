"use strict"

const assert = require("node:assert/strict")
const http = require("node:http")
const { test } = require("node:test")

let createPluginRuntimeServer

test.before(async () => {
	;({ createPluginRuntimeServer } = await import("../../services/backend/bridge/plugin-runtime-server.js"))
})

function createHarness(permissions) {
	const calls = []
	const plugin = {
		id: "openpet.runtime-test",
		permissions,
		network: { allowlist: ["example.com"] },
	}
	const server = createPluginRuntimeServer({
		shell: { send: (body) => { calls.push(["shell", body]); return body } },
		plugins: {
			get: (id) => {
				assert.equal(id, plugin.id)
				return plugin
			},
			submitTriggerProposal: (id, payload) => {
				calls.push(["proposal", id, payload])
				return { id: "proposal-1", ...payload }
			},
		},
		settings: { read: () => ({ version: 4, values: { pet: { name: "Mimi" } } }) },
		jobs: {
			insert: (job) => {
				calls.push(["job", job])
				return { ...job, id: "job-image-1" }
			},
		},
		network: {
			fetch: async (targetPlugin, payload) => {
				calls.push(["network", targetPlugin.id, payload])
				return new Response("weather-ok", { status: 200, headers: { "content-type": "text/plain" } })
			},
		},
		logs: {
			appendPlugin: (entry) => {
				calls.push(["log", entry])
				return entry
			},
		},
		logger: { warn: () => {}, error: () => {} },
		now: () => 1_723_000_000_000,
	})
	return { calls, plugin, server }
}

function requestJson(url, { token = "secret-token", capability = "pet:say", body = {} } = {}) {
	return new Promise((resolve, reject) => {
		const request = http.request(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"X-OpenPet-Capability": capability,
			},
		}, (response) => {
			let text = ""
			response.on("data", (chunk) => { text += chunk })
			response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(text || "{}") }))
		})
		request.on("error", reject)
		request.end(JSON.stringify(body))
	})
}

test("routes pet:say through the Shell reverse channel", async () => {
	const { calls, plugin, server } = createHarness(["pet:say"])
	const result = await server.handleCapability(plugin.id, "pet:say", { text: "hello", ttlMs: 1200 })
	assert.deepEqual(calls, [["shell", { type: "pet.say", text: "hello", durationMs: 1200 }]])
	assert.deepEqual(result, { ok: true })
})

test("routes pet:play-action through the Shell and honors the current pet:action manifest name", async () => {
	const { calls, plugin, server } = createHarness(["pet:action"])
	await server.handleCapability(plugin.id, "pet:play-action", { actionId: "wave", loop: true })
	assert.deepEqual(calls, [["shell", { type: "pet.playAction", actionId: "wave", loop: true }]])
})

test("routes pet:event through the Shell reverse channel", async () => {
	const { calls, plugin, server } = createHarness(["pet:event"])
	await server.handleCapability(plugin.id, "pet:event", { type: "working", payload: { percent: 25 } })
	assert.deepEqual(calls, [["shell", { type: "pet.event", name: "working", payload: { percent: 25 } }]])
})

test("submits trigger proposals inside the backend", async () => {
	const { calls, plugin, server } = createHarness(["trigger-proposals:write"])
	const result = await server.handleCapability(plugin.id, "trigger-proposals:write", { actionId: "wave" })
	assert.deepEqual(calls, [["proposal", plugin.id, { actionId: "wave" }]])
	assert.equal(result.id, "proposal-1")
})

test("enqueues model:image-generate as an image Job", async () => {
	const { calls, plugin, server } = createHarness(["model:image-generate"])
	const result = await server.handleCapability(plugin.id, "model:image-generate", { prompt: "orange cat" })
	assert.deepEqual(calls, [["job", {
		kind: "image.generate",
		input: { pluginId: plugin.id, prompt: "orange cat" },
		resourceKey: `plugin:${plugin.id}`,
	}]])
	assert.deepEqual(result, { jobId: "job-image-1" })
})

test("reads settings inside the backend", async () => {
	const { plugin, server } = createHarness(["settings:read"])
	assert.deepEqual(await server.handleCapability(plugin.id, "settings:read", {}), {
		version: 4,
		values: { pet: { name: "Mimi" } },
	})
})

test("writes sanitized plugin logs inside the backend", async () => {
	const { calls, plugin, server } = createHarness(["logs:write"])
	const result = await server.handleCapability(plugin.id, "logs:write", {
		level: "warn",
		message: "token=secret-value",
	})
	assert.equal(calls.length, 1)
	assert.equal(calls[0][0], "log")
	assert.equal(calls[0][1].pluginId, plugin.id)
	assert.equal(calls[0][1].level, "warn")
	assert.doesNotMatch(calls[0][1].message, /secret-value/)
	assert.equal(calls[0][1].at, 1_723_000_000_000)
	assert.deepEqual(result, { ok: true })
})

test("uses the bounded response reader for network:fetch", async () => {
	const { calls, plugin, server } = createHarness(["network"])
	const result = await server.handleCapability(plugin.id, "network:fetch", {
		url: "https://example.com/weather",
		options: { method: "GET" },
	})
	assert.deepEqual(calls[0], ["network", plugin.id, {
		url: "https://example.com/weather",
		options: { method: "GET" },
	}])
	assert.equal(result.status, 200)
	assert.equal(result.body, "weather-ok")

	let canceled = false
	const oversized = createPluginRuntimeServer({
		shell: { send: () => {} },
		plugins: { get: () => ({ ...plugin, permissions: ["network"] }) },
		settings: { read: () => ({}) },
		jobs: { insert: () => ({ id: "unused" }) },
		network: {
			fetch: async () => ({
				headers: { get: (name) => name === "content-length" ? String(128 * 1024 + 1) : "" },
				body: { cancel: async () => { canceled = true } },
			}),
		},
		logs: { appendPlugin: () => {} },
	})
	await assert.rejects(
		() => oversized.handleCapability(plugin.id, "network:fetch", { url: "https://example.com/large" }),
		(error) => error?.code === "RESPONSE_BODY_TOO_LARGE",
	)
	await new Promise((resolve) => setImmediate(resolve))
	assert.equal(canceled, true)
})

test("aborts backend network work when the plugin bridge client disconnects", async () => {
	const plugin = { id: "openpet.abort-test", permissions: ["network"], network: { allowlist: ["example.com"] } }
	let observedSignal
	const server = createPluginRuntimeServer({
		plugins: { get: () => plugin },
		network: {
			fetch: (_plugin, _payload, { signal }) => {
				observedSignal = signal
				return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
			},
		},
	})
	const controller = new AbortController()
	const pending = server.handleCapability(plugin.id, "network:fetch", { url: "https://example.com" }, { signal: controller.signal })
	controller.abort(new Error("client disconnected"))
	await assert.rejects(() => pending, /client disconnected/)
	assert.equal(observedSignal.aborted, true)
})

test("rejects unauthorized capabilities in the backend before calling the Shell", async () => {
	const { calls, plugin, server } = createHarness([])
	await assert.rejects(
		() => server.handleCapability(plugin.id, "pet:say", { text: "blocked" }),
		(error) => error?.code === "PERMISSION_DENIED" && error.status === 403,
	)
	assert.deepEqual(calls, [])
})

test("rejects every capability outside the frozen eight-item table", async () => {
	const { calls, plugin, server } = createHarness(["shell:execute"])
	await assert.rejects(
		() => server.handleCapability(plugin.id, "shell:execute", { command: "whoami" }),
		(error) => error?.code === "VALIDATION_FAILED" && error.status === 400,
	)
	assert.deepEqual(calls, [])
})

test("does not accept legacy permission aliases as capability names", async () => {
	const { plugin, server } = createHarness(["pet:action", "network"])
	await assert.rejects(
		() => server.handleCapability(plugin.id, "pet:action", { actionId: "wave" }),
		(error) => error?.code === "VALIDATION_FAILED",
	)
	await assert.rejects(
		() => server.handleCapability(plugin.id, "network", { url: "https://example.com" }),
		(error) => error?.code === "VALIDATION_FAILED",
	)
})

test("listen exposes a token-bound loopback endpoint and close expires it", async () => {
	const { calls, plugin, server } = createHarness(["pet:say"])
	const listening = await server.listen({ pluginId: plugin.id, token: "secret-token" })
	assert.match(listening.url, /^http:\/\/127\.0\.0\.1:\d+$/)
	const response = await requestJson(listening.url, { body: { text: "over-http" } })
	assert.equal(response.status, 200)
	assert.deepEqual(response.body, { ok: true })
	assert.deepEqual(calls, [["shell", { type: "pet.say", text: "over-http" }]])
	await server.close()
	await assert.rejects(() => requestJson(listening.url), /ECONNREFUSED|ECONNRESET|socket hang up/)
})

test("supports concurrent plugin sessions and invalidates only the stopped plugin", async () => {
	const first = createHarness(["pet:say"])
	const second = createHarness(["pet:say"])
	second.plugin.id = "openpet.runtime-test-two"
	const server = createPluginRuntimeServer({
		shell: { send: (body) => { first.calls.push(["shell", body]) } },
		plugins: { get: (id) => id === first.plugin.id ? first.plugin : second.plugin },
		settings: { read: () => ({}) }, jobs: { insert: () => ({ id: "job" }) },
		logs: { appendPlugin: () => {} }, network: { fetch: async () => new Response("ok") },
	})
	const one = await server.listen({ pluginId: first.plugin.id, token: "one-token" })
	const two = await server.listen({ pluginId: second.plugin.id, token: "two-token" })
	assert.equal(one.port, two.port)
	assert.equal((await requestJson(one.url, { token: one.token, body: { text: "one" } })).status, 200)
	await server.closePlugin(first.plugin.id)
	assert.equal((await requestJson(one.url, { token: one.token, body: { text: "expired" } })).status, 401)
	assert.equal((await requestJson(two.url, { token: two.token, body: { text: "two" } })).status, 200)
	await server.close()
})
