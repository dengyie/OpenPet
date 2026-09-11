"use strict"

const assert = require("node:assert/strict")
const http = require("node:http")
const { test } = require("node:test")

test("Creator routes validate inputs and enqueue long operations", async (t) => {
	const [{ createRouter }, { jsonBody }, { registerCreatorRoutes, CREATOR_ROUTES }] = await Promise.all([
		import("../../services/backend/http/router.js"),
		import("../../services/backend/http/middleware.js"),
		import("../../services/backend/routes/creator.js"),
	])
	const queued = []
	const creator = {
		getState: async () => ({ ok: true, state: "ready" }),
		getLastRun: async () => ({ ok: true, run: null }),
		listFlows: () => [], createFlow: (body) => ({ id: "f", ...body }), updateFlow: (id, body) => ({ id, ...body }), deleteFlow: (id) => ({ id, deleted: true }),
		listReferences: () => [], bindReference: async (body) => ({ ok: true, reference: body }), deleteReference: async () => ({ deleted: true }),
		artifacts: () => [], getAssetPreview: async () => ({ ok: true, previewDataUrl: "data:image/png;base64,AA==" }),
		enqueueCharacter: (input) => { queued.push(["character", input]); return { jobId: "creator.character:1" } },
		enqueueAction: (input) => { queued.push(["action", input]); return { jobId: "creator.workflow:1" } },
		enqueueSpriteEvaluation: (input) => { queued.push(["evaluate", input]); return { jobId: "sprite.evaluate:1" } },
		enqueueWorkflow: (input) => { queued.push(["workflow", input]); return { jobId: "creator.workflow:2" } },
		enqueueExport: (input) => { queued.push(["export", input]); return { jobId: "creator.export:1" } },
	}
	const router = createRouter({ basePath: "/api/v1" })
	router.use(jsonBody())
	registerCreatorRoutes(router, { creator })
	assert.deepEqual(router.routes(), CREATOR_ROUTES.map((entry) => { const [method, route] = entry.split(" "); return `${method} /api/v1${route}` }))
	const server = http.createServer(router.handle)
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	t.after(() => new Promise((resolve) => server.close(resolve)))
	const request = async (path, method, body) => {
		const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, {
			method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
		})
		return { status: response.status, body: await response.json() }
	}
	const accepted = await request("/creator/characters/generate", "POST", { characterName: "Cat", stylePrompt: "front" })
	assert.equal(accepted.status, 202)
	assert.deepEqual(queued[0], ["character", { characterName: "Cat", stylePrompt: "front" }])
	const rejected = await request("/creator/characters/generate", "POST", { characterName: "Cat", apiKey: "sk-secret" })
	assert.equal(rejected.status, 400)
	assert.equal(rejected.body.error.code, "VALIDATION_FAILED")
	const action = await request("/creator/sprites/generate", "POST", { actionName: "wave", motionPrompt: "wave" })
	assert.equal(action.status, 202)
	assert.equal(queued[1][1].operation, "generate-action")
	const evaluation = await request("/creator/sprites/evaluate", "POST", { runId: "run-1", board: { relativePath: "runs/run-1/board.png" } })
	assert.equal(evaluation.status, 202)
	assert.deepEqual(queued[2], ["evaluate", { runId: "run-1", board: { relativePath: "runs/run-1/board.png" }, operation: "evaluate-sprite" }])
})
