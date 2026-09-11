"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")

test("Creator Control Center API uses backend routes and Job timeouts for long operations", async () => {
	const { createCreatorHttpApi } = await import("../../src/control-center/src/features/creator/api.ts")
	const requests = []
	const responses = [
		{ ok: true, provider: {}, hatchPetAgent: {}, editableTarget: {}, dashboard: {} },
		{ ok: true, run: null },
		{ jobId: "creator.character:1" },
		{ jobId: "sprite.generate:1" },
		{ jobId: "creator.workflow:1" },
		{ ok: true, relativePath: "runs/run-1/asset.png", previewDataUrl: "data:image/png;base64,AA==" },
	]
	const api = createCreatorHttpApi({ request: async (request) => { requests.push(request); return responses.shift() } })
	await api.getState()
	await api.getLastRun()
	await api.generateNewCharacter({ characterName: "Cat", referenceImageToken: "opaque" })
	await api.generateExistingAction({ actionName: "wave", motionPrompt: "wave" })
	await api.retryAction({ runId: "run-1", actionId: "wave" })
	await api.getAssetPreview({ runId: "run-1", relativePath: "runs/run-1/asset.png" })
	assert.deepEqual(requests.map(({ method, path, job }) => ({ method, path, job })), [
		{ method: "GET", path: "/creator/state", job: undefined },
		{ method: "GET", path: "/creator/last-run", job: undefined },
		{ method: "POST", path: "/creator/characters/generate", job: true },
		{ method: "POST", path: "/creator/sprites/generate", job: true },
		{ method: "POST", path: "/creator/runs/run-1/retry-action", job: true },
		{ method: "GET", path: "/creator/assets/preview?runId=run-1&relativePath=runs%2Frun-1%2Fasset.png", job: undefined },
	])
})

test("Creator Job resolution rejects restart failures and accepts workflow/export results", async () => {
	const { resolveCreatorJob } = await import("../../src/control-center/src/features/creator/api.ts")
	assert.deepEqual(resolveCreatorJob(null), { kind: "pending" })
	assert.deepEqual(resolveCreatorJob({ status: "running" }), { kind: "pending" })
	assert.deepEqual(resolveCreatorJob({ status: "failed", error: { message: "Creator Job input is unavailable after restart" } }), {
		kind: "failed", message: "Creator Job input is unavailable after restart"
	})
	assert.equal(resolveCreatorJob({ status: "succeeded", result: { ok: true, state: "completed", code: "done", message: "ok" } }).kind, "succeeded")
	assert.equal(resolveCreatorJob({ status: "succeeded", result: { ok: true, runId: "run-1", relativePath: "recovery.zip", sha256: "a".repeat(64), byteSize: 12 } }).kind, "succeeded")
	assert.deepEqual(resolveCreatorJob({ status: "succeeded", result: { arbitrary: true } }), {
		kind: "failed", message: "Creator Job returned an invalid result."
	})
})
