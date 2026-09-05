"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")

test("T46 image route enqueues without awaiting generation", async () => {
	const { registerAiRoutes } = await import("../../services/backend/routes/ai.js")
	let handler
	registerAiRoutes({ post: (_path, next) => { handler = next } }, {
		jobs: { insert: (input) => ({ id: input.id }) },
	})
	const response = { writableEnded: false, writeHead(status) { this.status = status }, end(value) { this.body = JSON.parse(value) } }
	const started = performance.now()
	await handler({ body: { prompt: "a cat", output: { dataDir: "/tmp/openpet", dataRelativeDir: "images" } }, requestId: "t46", startedAt: started, res: response })
	assert.equal(response.status, 202)
	assert.match(response.body.data.jobId, /^image-generate:/)
	assert.ok(performance.now() - started < 3_000)
})

test("T46 image handler makes finalization the cancellation boundary", async () => {
	const { run } = await import("../../services/backend/jobs/handlers/image-generate.js")
	let committed = false
	let finalized = false
	const result = await run({ prompt: "x" }, {
		ai: { prepareGeneratedImage: async () => ({ artifact: true }), commitGeneratedImage: async () => { committed = true; return { ok: true } } },
		signal: new AbortController().signal,
		progress: () => {},
		tmpDir: "/tmp/job",
		finalize: async (writer) => { finalized = true; return writer() },
	})
	assert.deepEqual(result, { ok: true })
	assert.equal(finalized, true)
	assert.equal(committed, true)
})
