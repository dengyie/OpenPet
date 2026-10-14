"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { test } = require("node:test")

async function withAiRuntimeServer(t, { domain, image, shell, secrets, jobs } = {}, run) {
	const [{ createRouter }, middleware, { registerAiRuntimeRoutes }, { registerAiRoutes }] = await Promise.all([
		import("../../services/backend/http/router.js"),
		import("../../services/backend/http/middleware.js"),
		import("../../services/backend/routes/ai-runtime.js"),
		import("../../services/backend/routes/ai.js"),
	])
	const router = createRouter({ basePath: "/api/v1" })
	router.use(middleware.requestId())
	router.use(middleware.errorBoundary())
	router.use(middleware.bearerAuth({ getSessionToken: () => "session" }))
	router.use(middleware.jsonBody())
	registerAiRuntimeRoutes(router, {
		getDomain: () => domain,
		getImageDomain: () => image,
		shell,
		secrets,
		jobs,
	})
	registerAiRoutes(router, { ai: image, jobs })
	const server = createServer((req, res) => void router.handle(req, res))
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }))
	const base = `http://127.0.0.1:${server.address().port}/api/v1`
	const request = (path, { method = "GET", body } = {}) => fetch(`${base}${path}`, {
		method,
		headers: { authorization: "Bearer session", ...(body === undefined ? {} : { "content-type": "application/json" }) },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	return run({ base, request })
}

function aiRuntimeFixture() {
	const calls = []
	const jobs = []
	const keys = new Map()
	const hatchConfig = {
		enabled: false,
		executionMode: "shadow",
		configMode: "follow-chat",
		provider: "openai-compatible",
		baseUrl: "https://api.openai.com/v1",
		model: "gpt-4o-mini",
		apiKeyRef: "ai.default",
		systemPromptVersion: 1,
		requireIdentityReviewBeforeActions: true,
		budgets: {
			maxIdentityRegenerations: 1,
			maxActionAttemptsPerAction: 3,
			maxEvaluationAttemptsPerArtifact: 2,
			maxPlannerCalls: 34,
			maxEvaluatorCalls: 68,
			maxProviderCalls: 20,
			maxElapsedMs: 43200000,
			maxEstimatedCost: null,
		},
		hasApiKey: false,
		configSource: "chat-provider",
		effectiveProvider: "openai-compatible",
		effectiveBaseUrl: "https://api.openai.com/v1",
		effectiveModel: "gpt-4o-mini",
	}
	const hostResults = {
		"hatch.agents": { config: {}, readiness: null, capability: null },
		"hatch.capability.check": { ok: true, code: "ready", message: "ready", provider: "openai-compatible", model: "gpt-4o-mini", elapsedMs: 1 },
		"hatch.run.status": { ok: true, runId: "run-1", state: null, decisions: [] },
		"hatch.budget": { runId: "run-1", budget: null },
	}
	const domain = {
		getHatchConfig: () => structuredClone(hatchConfig),
		saveConfig: (input) => { Object.assign(hatchConfig, input.hatchPet); return structuredClone(hatchConfig) },
		publishSnapshot: () => {},
	}
	const image = {
		getConfig: () => ({ provider: "openai-compatible" }),
		saveConfig: async (config) => config,
		saveProviderApiKey: async () => ({ apiKeyRef: "image.default", hasApiKey: true, apiKeyPreview: "…1234" }),
		clearProviderApiKey: async () => ({ apiKeyRef: "image.default", hasApiKey: false, apiKeyPreview: "" }),
		checkHealth: async () => ({ ok: true, provider: "openai-compatible", code: "provider_healthy", message: "healthy", modelsProbe: "ok", availableModels: ["image-model"] }),
		discoverModels: async () => ({ ok: true, provider: "openai-compatible", baseUrl: "https://images.example/v1", model: "image-model", hasApiKey: true, models: ["image-model"], code: "ok", message: "Models discovered" }),
	}
	const shell = {
		request: async (body, options) => {
			calls.push({ body, options })
			const result = hostResults[body.operation]
			if (!result) throw new Error(`Unexpected Shell operation ${body.operation}`)
			return { body: { type: "ai.talk.result", operation: body.operation, ok: true, result } }
		},
	}
	const secrets = {
		set: async (id, value) => { keys.set(id, value); return { configured: true } },
		clear: async (id) => { keys.delete(id); return { configured: false } },
	}
	const jobDispatcher = { insert: (job) => { jobs.push(job); return { id: job.id, kind: job.kind, input: job.input } } }
	return { calls, domain, image, shell, secrets, jobs, jobDispatcher, keys }
}

test("AI runtime exposes Hatch and image diagnostics through their owning services", async (t) => {
	const fixture = aiRuntimeFixture()
	await withAiRuntimeServer(t, { ...fixture, jobs: fixture.jobDispatcher }, async ({ request }) => {
		const agents = await request("/ai/hatch/agents")
		const config = await request("/ai/hatch/config")
		const saved = await request("/ai/hatch/config", { method: "PATCH", body: { config: { enabled: true, configMode: "override", model: "hatch-model" } } })
		const key = await request("/ai/hatch/key", { method: "PUT", body: { apiKey: "hatch-secret-value" } })
		const capability = await request("/ai/hatch/capability", { method: "POST", body: {} })
		const status = await request("/ai/hatch/runs/run-1")
		const budget = await request("/ai/hatch/budget?runId=run-1")
		const health = await request("/ai/images/health")
		const models = await request("/ai/images/models")
		assert.deepEqual([agents.status, config.status, saved.status, key.status, capability.status, status.status, budget.status, health.status, models.status], Array(9).fill(200))
		assert.deepEqual((await agents.json()).data, { config: {}, readiness: null, capability: null })
		assert.equal((await saved.json()).data.model, "hatch-model")
		assert.equal(JSON.stringify(await key.json()).includes("hatch-secret-value"), false)
		assert.equal((await capability.json()).data.code, "ready")
		assert.equal((await status.json()).data.runId, "run-1")
		assert.equal((await budget.json()).data.runId, "run-1")
		assert.equal((await health.json()).data.ok, true)
		assert.deepEqual((await models.json()).data.models, ["image-model"])
	})
	assert.deepEqual(fixture.calls.map(({ body }) => body.operation), ["hatch.agents", "hatch.capability.check", "hatch.run.status", "hatch.budget"])
	assert.equal(fixture.keys.get("ai.hatch-pet"), "hatch-secret-value")
})

test("Hatch start validates before enqueue and creates a run-scoped Job", async (t) => {
	const fixture = aiRuntimeFixture()
	await withAiRuntimeServer(t, { ...fixture, jobs: fixture.jobDispatcher }, async ({ request }) => {
		const accepted = await request("/ai/hatch/start", { method: "POST", body: { runId: "run-1", mode: "full-pet", stage: "planning" } })
		assert.equal(accepted.status, 202)
		assert.match((await accepted.json()).data.jobId, /^hatch-start:/)
		for (const body of [
			{ runId: "run-1", mode: { nested: true } },
			{ runId: "run-1", workflowEvidence: { provider: { apiKey: "secret" } } },
			{ runId: "run-1", unsupported: true },
		]) {
			const rejected = await request("/ai/hatch/start", { method: "POST", body })
			assert.equal(rejected.status, 400)
		}
	})
	assert.equal(fixture.jobs.length, 1)
	assert.equal(fixture.jobs[0].kind, "hatch.run")
	assert.equal(fixture.jobs[0].resourceKey, "hatch:run-1")
	assert.deepEqual(fixture.jobs[0].input, { runId: "run-1", mode: "full-pet", stage: "planning", scope: {}, workflowEvidence: { provider: {} } })
})

test("Hatch Job cancellation sends hatch.stop and cannot report success", async () => {
	const { createHatchJobHandlers } = await import("../../services/backend/jobs/handlers/hatch.js")
	const startSeen = Promise.withResolvers()
	const stopped = Promise.withResolvers()
	const requests = []
	const shell = {
		request: async (body, options) => {
			requests.push({ body, options })
			if (body.operation === "hatch.stop") {
				stopped.resolve()
				return { body: { type: "ai.talk.result", operation: "hatch.stop", ok: true, result: { canceled: true } } }
			}
			startSeen.resolve()
			return stopped.promise.then(() => ({ body: {
				type: "ai.talk.result", operation: "hatch.start", ok: true,
				result: { status: "planned", code: "ok", message: "done", decision: null },
			} }))
		},
	}
	const controller = new AbortController()
	const handler = createHatchJobHandlers({ shell })["hatch.run"]
	const run = handler({ job: { input: { runId: "run-cancel", mode: "full-pet", scope: {}, workflowEvidence: { provider: {} } } }, signal: controller.signal, report() {} })
	await startSeen.promise
	controller.abort()
	await assert.rejects(run, /canceled/i)
	assert.equal(requests[0].body.operation, "hatch.start")
	assert.deepEqual(requests[1].body, { type: "ai.talk.request", operation: "hatch.stop", payload: { runId: "run-cancel" } })
	assert.equal(requests[0].options.expectedType, "ai.talk.result")
})
