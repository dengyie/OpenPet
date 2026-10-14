"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { test } = require("node:test")

async function withImageServer(ai, run, jobs = { insert: ({ id }) => ({ id }) }) {
	const [{ createRouter }, middleware, { registerAiRoutes }] = await Promise.all([
		import("../../services/backend/http/router.js"),
		import("../../services/backend/http/middleware.js"),
		import("../../services/backend/routes/ai.js"),
	])
	const router = createRouter({ basePath: "/api/v1" })
	router.use(middleware.requestId())
	router.use(middleware.errorBoundary())
	router.use(middleware.jsonBody())
	registerAiRoutes(router, { ai, jobs })
	const server = createServer((req, res) => void router.handle(req, res))
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	try {
		return await run(`http://127.0.0.1:${server.address().port}/api/v1`)
	} finally {
		await new Promise((resolve) => server.close(resolve))
	}
}

test("image generation route keeps private request payload transient and returns only a redacted Job", async () => {
	const inserted = []
	const input = {
		prompt: "private character prompt",
		referenceImages: [{ path: "/Users/private/pet/reference.png" }],
		output: { dataDir: "/Users/private/OpenPet", dataRelativeDir: "runs/private/frames" },
	}
	await withImageServer(undefined, async (base) => {
		const response = await fetch(`${base}/ai/images/generate`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		})
		assert.equal(response.status, 202)
		const body = await response.json()
		assert.equal(body.ok, true)
		assert.equal(body.data.jobId, inserted[0].id)
	}, {
		insert: (job) => {
			inserted.push(job)
			return { id: job.id, kind: job.kind, input: job.input }
		},
	})
	assert.equal(inserted[0].kind, "image.generate")
	assert.deepEqual(inserted[0].input, { redacted: true, summary: "Image generation input withheld" })
	assert.deepEqual(inserted[0].privateInput, input)
	assert.equal(JSON.stringify(inserted[0].input).includes(input.prompt), false)
})

function imageServices({ failSecret = false, failSettings = false } = {}) {
	const persisted = {
		version: 1,
		values: {
			models: {
				imageGeneration: {
					provider: "openai-compatible",
					baseUrl: "https://images.example.test/v1",
					model: "gpt-image-1",
					apiKeyRef: "secret:model.image.openai.apiKey",
					timeoutMs: 60000,
					maxConcurrentJobs: 2,
				},
			},
		},
	}
	const secrets = new Map()
	const settings = {
		read: () => structuredClone(persisted),
		patch: ({ ifVersion, patch }) => {
			if (failSettings) throw new Error("settings sidecar disconnected")
			assert.equal(ifVersion, persisted.version)
			persisted.values.models.imageGeneration = {
				...persisted.values.models.imageGeneration,
				...patch["models.imageGeneration"],
			}
			persisted.version += 1
			return { version: persisted.version, changedPaths: ["models.imageGeneration"] }
		},
	}
	const secretStore = {
		get: (id) => secrets.get(id) || "",
		set: async (id, value) => {
			if (failSecret) throw new Error("secret sidecar disconnected")
			secrets.set(id, value)
			return { configured: true, maskedTail: "…" + value.slice(-4) }
		},
		clear: async (id) => {
			if (failSecret) throw new Error("secret sidecar disconnected")
			secrets.delete(id)
			return { configured: false, maskedTail: "" }
		},
	}
	return { settings, secretStore }
}

async function createImageService(options = {}) {
	const { settings, secretStore } = imageServices(options)
	const { createAiService } = await import("../../services/backend/domains/ai/image-generation.js")
	return createAiService({ settings, secrets: secretStore, userDataDir: "/tmp/openpet-image-routes" })
}

test("image configuration and key routes persist through the Backend service without exposing secrets", async () => {
	const ai = await createImageService()
	await withImageServer(ai, async (base) => {
		const json = { "content-type": "application/json" }
		const initial = await fetch(`${base}/ai/images/config`)
		assert.equal(initial.status, 200)
		const initialBody = await initial.json()
		assert.equal(initialBody.ok, true)
		assert.equal(initialBody.data.hasApiKey, false)

		const saved = await fetch(`${base}/ai/images/config`, {
			method: "PATCH",
			headers: json,
			body: JSON.stringify({ config: { model: "gpt-image-2", timeoutMs: 90000, maxConcurrentJobs: 3 } }),
		})
		assert.equal(saved.status, 200)
		assert.equal((await saved.json()).data.model, "gpt-image-2")

		const key = "sk-image-route-secret-1234"
		const stored = await fetch(`${base}/ai/images/key`, { method: "PUT", headers: json, body: JSON.stringify({ apiKey: key }) })
		assert.equal(stored.status, 200)
		const storedBody = await stored.json()
		assert.deepEqual(storedBody.data, { apiKeyRef: "secret:model.image.openai.apiKey", hasApiKey: true, apiKeyPreview: "••••1234" })
		assert.equal(JSON.stringify(storedBody).includes(key), false)

		const readBack = await fetch(`${base}/ai/images/config`)
		const readBackBody = await readBack.json()
		assert.equal(readBackBody.data.hasApiKey, true)
		assert.equal(readBackBody.data.apiKeyPreview, "••••1234")
		assert.equal(JSON.stringify(readBackBody).includes(key), false)

		const cleared = await fetch(`${base}/ai/images/key`, { method: "DELETE" })
		assert.equal(cleared.status, 200)
		assert.deepEqual((await cleared.json()).data, { apiKeyRef: "secret:model.image.openai.apiKey", hasApiKey: false, apiKeyPreview: "" })
	})
})

test("image configuration routes reject owner fields, unknown fields, and out-of-range values", async () => {
	const calls = []
	const ai = {
		getConfig: async () => ({}),
		saveConfig: async (config) => { calls.push(config); return {} },
		saveProviderApiKey: async () => { calls.push("key"); return {} },
		clearProviderApiKey: async () => ({}),
	}
	await withImageServer(ai, async (base) => {
		const headers = { "content-type": "application/json" }
		const invalidBodies = [
			{ config: { apiKeyRef: "ai.default" } },
			{ config: { unknown: true } },
			{ config: { timeoutMs: 999 } },
			{ config: { timeoutMs: 300001 } },
			{ config: { maxConcurrentJobs: 0 } },
			{ config: { maxConcurrentJobs: 9 } },
			{ config: { provider: "attacker" } },
			{ config: { baseUrl: "x".repeat(2001) } },
		]
		for (const body of invalidBodies) {
			const response = await fetch(`${base}/ai/images/config`, { method: "PATCH", headers, body: JSON.stringify(body) })
			assert.equal(response.status, 400)
			assert.equal((await response.json()).error.code, "VALIDATION_FAILED")
		}
		for (const body of [{ apiKey: "   " }, { apiKey: "x".repeat(4097) }, { apiKey: "valid", apiKeyRef: "ai.default" }]) {
			const response = await fetch(`${base}/ai/images/key`, { method: "PUT", headers, body: JSON.stringify(body) })
			assert.equal(response.status, 400)
			assert.equal((await response.json()).error.code, "VALIDATION_FAILED")
		}
	})
	assert.deepEqual(calls, [])
})

test("image routes expose dependency failures as retryable unavailability", async () => {
	await withImageServer(undefined, async (base) => {
		const headers = { "content-type": "application/json" }
		const responses = await Promise.all([
			fetch(`${base}/ai/images/config`),
			fetch(`${base}/ai/images/config`, { method: "PATCH", headers, body: JSON.stringify({ config: { model: "gpt-image-2" } }) }),
			fetch(`${base}/ai/images/key`, { method: "PUT", headers, body: JSON.stringify({ apiKey: "valid" }) }),
			fetch(`${base}/ai/images/key`, { method: "DELETE" }),
		])
		for (const response of responses) {
			assert.equal(response.status, 503)
			const body = await response.json()
			assert.equal(body.error.code, "BACKEND_UNAVAILABLE")
			assert.equal(body.error.retryable, true)
		}
	})
})

test("image key route waits for and reports Shell secret persistence failures", async () => {
	const ai = await createImageService({ failSecret: true })
	await withImageServer(ai, async (base) => {
		const response = await fetch(`${base}/ai/images/key`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ apiKey: "sk-never-persisted" }),
		})
		assert.equal(response.status, 503)
		const body = await response.json()
		assert.equal(body.error.code, "BACKEND_UNAVAILABLE")
		assert.equal(body.error.retryable, true)
		assert.equal(JSON.stringify(body).includes("sk-never-persisted"), false)
	})
})

test("image config route reports Shell settings persistence failures", async () => {
	const ai = await createImageService({ failSettings: true })
	await withImageServer(ai, async (base) => {
		const response = await fetch(`${base}/ai/images/config`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ config: { model: "gpt-image-2" } }),
		})
		assert.equal(response.status, 503)
		const body = await response.json()
		assert.equal(body.error.code, "BACKEND_UNAVAILABLE")
		assert.equal(body.error.retryable, true)
	})
})

test("image config route preserves Provider validation errors as client errors", async () => {
	const ai = await createImageService()
	await withImageServer(ai, async (base) => {
		const response = await fetch(`${base}/ai/images/config`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ config: { model: " " } }),
		})
		assert.equal(response.status, 400)
		const body = await response.json()
		assert.equal(body.error.code, "VALIDATION_FAILED")
		assert.equal(body.error.retryable, false)
	})
})

test("image config writes serialize without losing partial updates or hiding an earlier failure", async () => {
	const persisted = {
		version: 1,
		values: { models: { imageGeneration: { provider: "openai-compatible", baseUrl: "https://images.example.test/v1", model: "gpt-image-1", timeoutMs: 60000, maxConcurrentJobs: 2 } } },
	}
	let failNextWrite = true
	let enteredFirstWrite
	const firstWriteEntered = new Promise((resolve) => { enteredFirstWrite = resolve })
	let releaseFirstWrite
	const firstWriteGate = new Promise((resolve) => { releaseFirstWrite = resolve })
	const settings = {
		read: () => structuredClone(persisted),
		patch: async ({ patch }) => {
			if (failNextWrite) {
				failNextWrite = false
				enteredFirstWrite()
				await firstWriteGate
				throw new Error("first settings write failed")
			}
			persisted.values.models.imageGeneration = { ...persisted.values.models.imageGeneration, ...patch["models.imageGeneration"] }
			persisted.version += 1
			return { version: persisted.version }
		},
	}
	const { createAiService } = await import("../../services/backend/domains/ai/image-generation.js")
	const ai = createAiService({ settings, secrets: { get: () => "" } })
	const failedWrite = ai.saveConfig({ model: "gpt-image-2" })
	await firstWriteEntered
	let secondWriteSettled = false
	const secondWrite = ai.saveConfig({ timeoutMs: 90000 }).finally(() => { secondWriteSettled = true })
	await new Promise((resolve) => setImmediate(resolve))
	assert.equal(secondWriteSettled, false)
	releaseFirstWrite()
	await assert.rejects(failedWrite, (error) => error.code === "BACKEND_UNAVAILABLE" && error.cause?.message === "first settings write failed")
	const saved = await secondWrite
	assert.equal(saved.model, "gpt-image-1")
	assert.equal(saved.timeoutMs, 90000)
	assert.equal(persisted.values.models.imageGeneration.timeoutMs, 90000)
})

test("image key writes serialize without hiding a failed first persistence", async () => {
	const stored = new Map()
	let failNextWrite = true
	let enteredFirstWrite
	const firstWriteEntered = new Promise((resolve) => { enteredFirstWrite = resolve })
	let releaseFirstWrite
	const firstWriteGate = new Promise((resolve) => { releaseFirstWrite = resolve })
	const { createAiService } = await import("../../services/backend/domains/ai/image-generation.js")
	const ai = createAiService({
		settings: {
			read: () => ({ version: 1, values: { models: { imageGeneration: {} } } }),
			patch: () => ({}),
		},
		secrets: {
			get: (id) => stored.get(id) || "",
			set: async (id, value) => {
				if (failNextWrite) {
					failNextWrite = false
					enteredFirstWrite()
					await firstWriteGate
					throw new Error("first key write failed")
				}
				stored.set(id, value)
				return { configured: true }
			},
			clear: async (id) => { stored.delete(id); return { configured: false } },
		},
	})
	const failedWrite = ai.saveProviderApiKey("sk-first-secret")
	await firstWriteEntered
	let secondWriteSettled = false
	const secondWrite = ai.saveProviderApiKey("sk-second-secret").finally(() => { secondWriteSettled = true })
	await new Promise((resolve) => setImmediate(resolve))
	assert.equal(secondWriteSettled, false)
	releaseFirstWrite()
	await assert.rejects(failedWrite, (error) => error.code === "BACKEND_UNAVAILABLE" && error.cause?.message === "first key write failed")
	const saved = await secondWrite
	assert.equal(saved.hasApiKey, true)
	assert.equal(saved.apiKeyPreview, "••••cret")
	assert.equal(stored.get("openai"), "sk-second-secret")
})
