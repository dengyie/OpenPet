"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { createAiService } = require("../../services/backend/domains/ai/image-generation.js")

function tempDir(prefix) {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test("T46 image route enqueues without awaiting generation", async () => {
	const { registerAiRoutes } = await import("../../services/backend/routes/ai.js")
	let handler
	const inserted = []
	const router = { post: (_path, next) => { handler = next }, get() {}, patch() {}, put() {}, delete() {} }
	registerAiRoutes(router, {
		jobs: { insert: (input) => { inserted.push(input); return { id: input.id } } },
	})
	const response = { writableEnded: false, writeHead(status) { this.status = status }, end(value) { this.body = JSON.parse(value) } }
	const started = performance.now()
	const input = { prompt: "a cat", output: { dataDir: "/tmp/openpet", dataRelativeDir: "images" } }
	await handler({ body: input, requestId: "t46", startedAt: started, res: response })
	assert.equal(response.status, 202)
	assert.match(response.body.data.jobId, /^image-generate:/)
	assert.ok(performance.now() - started < 3_000)
	assert.deepEqual(inserted[0].input, { redacted: true, summary: "Image generation input withheld" })
	assert.deepEqual(inserted[0].privateInput, input)
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

test("T46 image dispatcher executes transient input while the Job stays redacted", { timeout: 15_000 }, async () => {
	const [{ createImageJobHandlers }, { createRunner }, { createJobDispatcher }, { createQueue }, { createJobsRepository }, { migrate }, { openDatabase }] = await Promise.all([
		import("../../services/backend/jobs/handlers/index.js"),
		import("../../services/backend/jobs/runner.js"),
		import("../../services/backend/jobs/dispatcher.js"),
		import("../../services/backend/jobs/queue.js"),
		import("../../services/backend/store/repositories/jobs.js"),
		import("../../services/backend/store/migrate.js"),
		import("../../services/backend/store/db.js"),
	])
	const db = await openDatabase({ file: ":memory:" })
	migrate({ db })
	const repo = createJobsRepository({ db })
	const queue = createQueue({ repo, tickMs: 60_000 })
	const privateInputs = new Map()
	const seen = []
	const runner = createRunner({
		repo,
		queue,
		handlers: createImageJobHandlers({ ai: {
			prepareGeneratedImage: async (input) => { seen.push(input); return { result: { outputs: [] }, tmpDir: "/tmp/job", destination: input.output } },
			commitGeneratedImage: async (prepared) => prepared.result,
		} }),
		takePrivateInput: (jobId) => { const input = privateInputs.get(jobId); privateInputs.delete(jobId); return input },
		forgetPrivateInput: (jobId) => privateInputs.delete(jobId),
	})
	const dispatch = createJobDispatcher({
		queue, runner, privateInputs,
		logger: { error: (_message, error) => { throw new Error(String(error?.error)) } },
	})
	const input = { prompt: "private prompt", output: { dataDir: "/private/data", dataRelativeDir: "runs/image" } }
	try {
		const job = dispatch({ id: "image-transient-dispatch", kind: "image.generate", input: { redacted: true, summary: "Image generation input withheld" }, privateInput: input })
		for (let attempt = 0; attempt < 100 && repo.byId(job.id).status !== "succeeded"; attempt += 1) await new Promise((resolve) => setImmediate(resolve))
		assert.equal(repo.byId(job.id).status, "succeeded")
		assert.deepEqual(seen, [input])
		assert.deepEqual(repo.byId(job.id).input, { redacted: true, summary: "Image generation input withheld" })
		assert.equal(privateInputs.has(job.id), false)
	} finally {
		await runner.shutdown()
		queue.stop()
		db.close()
	}
})

test("T46 image handler rejects redacted input without private retry data", async () => {
	const { run } = await import("../../services/backend/jobs/handlers/image-generate.js")
	await assert.rejects(
		() => run({ redacted: true }, { ai: {}, signal: new AbortController().signal }),
		(error) => error.code === "CONFLICT" && error.status === 409 && error.retryable === false,
	)
})

test("T46 image Job cancellation aborts its in-flight Provider request", async () => {
	const dataDir = tempDir("openpet-t46-cancel-data-")
	const tmpDir = tempDir("openpet-t46-cancel-tmp-")
	const referencePath = path.join(dataDir, "reference.png")
	fs.writeFileSync(referencePath, "reference-image")
	let requestSignal
	let resolveRequestStarted
	const requestStarted = new Promise((resolve) => { resolveRequestStarted = resolve })
	const ai = createAiService({
		settings: {
			read: () => ({ version: 1, values: { models: { imageGeneration: {
				provider: "openai-compatible",
				baseUrl: "http://127.0.0.1:8317/v1",
				model: "gpt-image-1",
				apiKeyRef: "secret:model.image.openai.apiKey",
				timeoutMs: 1000,
				maxConcurrentJobs: 1,
			} } } }),
			patch: () => ({}),
		},
		secrets: { get: (id) => id === "openai" ? "sk-image-test" : "" },
		fetchImpl: async (_url, options) => {
			requestSignal = options.signal
			resolveRequestStarted()
			return await new Promise((_resolve, reject) => {
				options.signal.addEventListener("abort", () => {
					const error = new Error("Provider request aborted")
					error.name = "AbortError"
					error.code = "ABORT_ERR"
					reject(error)
				}, { once: true })
			})
		},
	})
	const controller = new AbortController()
	const operation = ai.prepareGeneratedImage({
		prompt: "keep the same character identity",
		referenceImages: [{ path: referencePath, fileName: "reference.png", relativePath: "reference.png" }],
		output: { dataDir, dataRelativeDir: "runs/canceled" },
		constraints: { width: 1024, height: 1024, transparent: true },
	}, { signal: controller.signal, tmpDir })
	try {
		await requestStarted
		controller.abort()
		await assert.rejects(operation, (error) => error.name === "AbortError")
		assert.equal(requestSignal.aborted, true)
	} finally {
		fs.rmSync(dataDir, { recursive: true, force: true })
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
})

test("T46 runner publishes image progress as SSE-compatible job events", async () => {
	const [{ createJobsRepository }, { createQueue }, { createRunner }, { migrate }, { openDatabase }] = await Promise.all([
		import("../../services/backend/store/repositories/jobs.js"),
		import("../../services/backend/jobs/queue.js"),
		import("../../services/backend/jobs/runner.js"),
		import("../../services/backend/store/migrate.js"),
		import("../../services/backend/store/db.js"),
	])
	const db = await openDatabase({ file: ":memory:" })
	try {
		migrate({ db })
		const repo = createJobsRepository({ db })
		const queue = createQueue({ repo, tickMs: 60_000 })
		const frames = []
		const runner = createRunner({
			repo,
			queue,
			progress: ({ onEmit }) => ({ report: onEmit, flush: () => {}, reset: () => {} }),
			emit: (name, payload) => { if (name === "job.progress") frames.push({ name, payload }) },
			handlers: { "image.generate": async ({ report, finalize }) => { report({ phase: "generating", percent: 20 }); return finalize(() => ({ ok: true })) } },
		})
		queue.enqueue({ id: "sse-image", kind: "image.generate", input: {} })
		await runner.run(queue.next())
		assert.deepEqual(frames.map(({ name }) => name), ["job.progress", "job.progress"])
		assert.deepEqual(frames.map(({ payload }) => payload.phase), ["generating", "finalizing"])
		assert.ok(frames.every(({ payload }) => payload.jobId === "sse-image" && payload.kind === "image.generate"))
		queue.stop()
	} finally {
		db.close()
	}
})

test("T42 Actions import uses the real domain and locks cancellation before the host write", async () => {
	const [{ createJobsRepository }, { createQueue }, { createRunner }, { migrate }, { openDatabase }] = await Promise.all([
		import("../../services/backend/store/repositories/jobs.js"),
		import("../../services/backend/jobs/queue.js"),
		import("../../services/backend/jobs/runner.js"),
		import("../../services/backend/store/migrate.js"),
		import("../../services/backend/store/db.js"),
	])
	const db = await openDatabase({ file: ":memory:" })
	try {
		migrate({ db })
		const repo = createJobsRepository({ db })
		const queue = createQueue({ repo, tickMs: 60_000 })
		const events = []
		const calls = []
		const { createActionService } = await import("../../services/backend/domains/actions.js")
		const actions = createActionService({
			jobs: repo,
			emit: (name, payload) => events.push({ name, payload }),
			shell: { request: async ({ operation, payload }) => {
				const current = repo.activeByResourceKey("actions:import")
				assert.equal(current.progress.phase, "finalizing")
				await assert.rejects(() => runner.cancel(current.id), (error) => error.code === "JOB_NOT_CANCELABLE" && error.status === 423)
				calls.push(payload)
				return { body: { type: "actions.result", operation, ok: true, result: { ok: true, result: { importedAction: { id: payload.actionId } }, animations: { actions: [{ id: payload.actionId }] } } } }
			} },
		})
		const runner = createRunner({
			repo,
			queue,
			progress: ({ onEmit }) => ({ report: onEmit, flush: () => {}, reset: () => {} }),
			emit: (name, payload) => events.push({ name, payload }),
			handlers: {
				"actions.import-frames": ({ job, report, signal, finalize }) => actions.runImportFrames({ ...job.input, report, signal, finalize }),
			},
		})
		const { jobId } = actions.importFrames({ selectionId: "native-selection", actionId: "wave", label: "Wave" })
		const inserted = repo.byId(jobId)
		queue.enqueue(inserted.id)
		const finished = await runner.run(queue.next())
		assert.equal(finished.status, "succeeded")
		assert.deepEqual(calls, [{ selectionId: "native-selection", actionId: "wave", label: "Wave" }])
		assert.deepEqual(events.map(({ name }) => name), ["job.progress", "job.progress", "pet.actions-changed", "job.succeeded"])
		assert.equal(events[0].payload.jobId, inserted.id)
		assert.equal(events[0].payload.kind, "actions.import-frames")
		assert.equal(events[0].payload.phase, "importing")
		assert.equal(events[1].payload.phase, "finalizing")
		assert.equal(events[3].payload.result.result.importedAction.id, "wave")
		queue.stop()
	} finally {
		db.close()
	}
})

test("T46 image commit rejects symlink escapes and rolls back partial multi-file staging", async () => {
	const root = tempDir("openpet-t46-data-")
	const tmp = tempDir("openpet-t46-tmp-")
	const outside = tempDir("openpet-t46-outside-")
	const ai = createAiService({
		settings: { read: () => ({ version: 1, values: { models: { imageGeneration: {} } } }), patch: () => ({}) },
		secrets: { get: () => "" },
		userDataDir: root,
	})
	try {
		fs.mkdirSync(path.join(tmp, "outputs"), { recursive: true })
		fs.writeFileSync(path.join(tmp, "outputs", "one.png"), "one")
		await assert.rejects(
			ai.commitGeneratedImage({ tmpDir: tmp, destination: { dataDir: root, dataRelativeDir: "images" }, result: { outputs: [{ dataRelativePath: "outputs/one.png" }, { dataRelativePath: "outputs/missing.png" }] } }),
		)
		assert.equal(fs.existsSync(path.join(root, "images")), false)

		fs.symlinkSync(outside, path.join(root, "escaped"), "dir")
		await assert.rejects(
			ai.commitGeneratedImage({ tmpDir: tmp, destination: { dataDir: root, dataRelativeDir: "escaped" }, result: { outputs: [{ dataRelativePath: "outputs/one.png" }] } }),
		)
		assert.equal(fs.readdirSync(outside).length, 0)
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
		fs.rmSync(tmp, { recursive: true, force: true })
		fs.rmSync(outside, { recursive: true, force: true })
	}
})

test("T46 maps the canonical image secret ref to its provider key without fallback leakage", () => {
	const calls = []
	const ai = createAiService({
		settings: { read: () => ({ version: 1, values: { models: { imageGeneration: { apiKeyRef: "secret:model.image.openai.apiKey" } } } }), patch: () => ({}) },
		secrets: { get: (id) => { calls.push(id); return id === "openai" ? "image-secret" : "wrong-secret" } },
	})
	assert.equal(ai.getConfig().hasApiKey, true)
	assert.ok(calls.length >= 1)
	assert.ok(calls.every((id) => id === "openai"))
})
