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
	const router = { post: (path, next) => { if (path === "/ai/images/generate") handler = next }, get() {}, patch() {}, put() {}, delete() {} }
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

test("web image route uses the Backend normalizer and does not accept client model overrides", async (t) => {
	const { registerAiRoutes } = await import("../../services/backend/routes/ai.js")
	let handler
	const inserted = []
	const router = { post: (route, next) => { if (route === "/ai/images/web-generate") handler = next }, get() {}, patch() {}, put() {}, delete() {} }
	const dataDir = tempDir("openpet-web-image-route-")
	t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
	const ai = createAiService({
		settings: { read: () => ({ version: 1, values: { models: { imageGeneration: {} } } }), patch: () => ({}) },
		secrets: { get: () => "" },
		userDataDir: dataDir,
	})
	registerAiRoutes(router, { ai, jobs: { insert: (input) => { inserted.push(input); return { id: input.id } } } })
	const response = { writableEnded: false, writeHead(status) { this.status = status }, end(value) { this.body = JSON.parse(value) } }
	const request = { body: { prompt: "a small fox", referenceImage: { mimeType: "image/png", dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64") } }, requestId: "web-image", startedAt: performance.now(), res: response }
	await handler(request)
	assert.equal(response.status, 202)
	assert.match(inserted[0].id, /^image-generate:/)
	assert.equal(inserted[0].privateInput.output.dataDir, ai.createWebImageInput(request.body, inserted[0].id).output.dataDir)
	assert.equal(inserted[0].privateInput.output.dataRelativeDir, `creator-web/runs/${inserted[0].id}`)
	assert.deepEqual(inserted[0].input, { redacted: true, summary: "Web image generation input withheld" })
	await assert.rejects(() => handler({ ...request, body: { ...request.body, baseUrl: "https://attacker.invalid/v1" }, res: response }), /unsupported fields/)
})

test("web image route queues up to three text-to-image reference candidates", async (t) => {
	const { registerAiRoutes } = await import("../../services/backend/routes/ai.js")
	let handler
	const inserted = []
	const router = { post: (route, next) => { if (route === "/ai/images/web-generate") handler = next }, get() {}, patch() {}, put() {}, delete() {} }
	const dataDir = tempDir("openpet-web-image-candidates-")
	t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
	const ai = createAiService({
		settings: { read: () => ({ version: 1, values: { models: { imageGeneration: {} } } }), patch: () => ({}) },
		secrets: { get: () => "" },
		userDataDir: dataDir,
	})
	registerAiRoutes(router, { ai, jobs: { insert: (input) => { inserted.push(input); return { id: input.id } } } })
	const response = { writableEnded: false, writeHead(status) { this.status = status }, end(value) { this.body = JSON.parse(value) } }
	await handler({ body: { prompt: "a small fox", candidateCount: 3 }, requestId: "web-image-candidates", startedAt: performance.now(), res: response })
	assert.equal(response.status, 202)
	assert.equal(inserted[0].privateInput.textToImage, true)
	assert.equal(inserted[0].privateInput.outputCount, 3)
	assert.equal(inserted[0].privateInput.output.dataRelativeDir, `creator-web/runs/${inserted[0].id}`)
	assert.deepEqual(inserted[0].input, { redacted: true, summary: "Web image generation input withheld" })
})

test("web image input fixes the output root and validates browser references", async () => {
	const dataDir = tempDir("openpet-web-image-input-")
	const ai = createAiService({
		settings: { read: () => ({ version: 1, values: { models: { imageGeneration: {} } } }), patch: () => ({}) },
		secrets: { get: () => "" },
		userDataDir: dataDir,
	})
	try {
		const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64")
		const job = ai.createWebImageInput({ prompt: "a small fox", referenceImage: { mimeType: "image/png", dataBase64: png } }, "image-generate:job-1")
		assert.equal(job.output.dataDir, dataDir)
		assert.equal(job.output.dataRelativeDir, "creator-web/runs/image-generate:job-1")
		assert.equal(job.textToImage, false)
		assert.equal(job.outputCount, 1)
		assert.deepEqual(job.constraints, { width: 1024, height: 1024, transparent: false })
		const generatedCandidates = ai.createWebImageInput({ prompt: "x", candidateCount: 3 }, "image-generate:job-2")
		assert.equal(generatedCandidates.textToImage, true)
		assert.equal(generatedCandidates.outputCount, 3)
		assert.equal(generatedCandidates.referenceImage, undefined)
		assert.throws(() => ai.createWebImageInput({ output: { dataDir: "/tmp" } }, "image-generate:job-2"), /output directory/)
		assert.throws(() => ai.createWebImageInput({ prompt: "x", referenceImage: { mimeType: "image/png", dataBase64: png }, model: "other" }, "image-generate:job-2b"), /unsupported fields/)
		for (const candidateCount of [0, 4, 1.5, "3"]) {
			assert.throws(() => ai.createWebImageInput({ prompt: "x", candidateCount }, "image-generate:job-2c"), /candidateCount must be an integer from 1 to 3/)
		}
		assert.throws(() => ai.createWebImageInput({ prompt: "x", referenceImage: {
			mimeType: "image/png", dataBase64: Buffer.from("not-an-image").toString("base64")
		} }, "image-generate:job-3"), /Reference image/)
	} finally {
		fs.rmSync(dataDir, { recursive: true, force: true })
	}
})

test("web image preview only reads generated files under creator-web", async () => {
	const dataDir = tempDir("openpet-web-image-preview-")
	const outputPath = path.join(dataDir, "creator-web", "runs", "job-1", "0001.png")
	fs.mkdirSync(path.dirname(outputPath), { recursive: true })
	fs.writeFileSync(outputPath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
	const ai = createAiService({
		settings: { read: () => ({ version: 1, values: { models: { imageGeneration: {} } } }), patch: () => ({}) },
		secrets: { get: () => "" },
		userDataDir: dataDir,
	})
	try {
		const preview = ai.previewGeneratedImage("creator-web/runs/job-1/0001.png")
		assert.equal(preview.mimeType, "image/png")
		assert.match(preview.previewDataUrl, /^data:image\/png;base64,/)
		assert.throws(() => ai.previewGeneratedImage("../secrets.json"), /preview path is invalid/)
		const privatePath = path.join(dataDir, "private", "secret.png")
		fs.mkdirSync(path.dirname(privatePath), { recursive: true })
		fs.writeFileSync(privatePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
		const linkedPath = path.join(dataDir, "creator-web", "runs", "job-1", "linked.png")
		fs.symlinkSync(privatePath, linkedPath)
		assert.throws(() => ai.previewGeneratedImage("creator-web/runs/job-1/linked.png"), /preview path is invalid/)
	} finally {
		fs.rmSync(dataDir, { recursive: true, force: true })
	}
})

test("web generated image handoff checks the run path, image signature, and content hash", async () => {
	const dataDir = tempDir("openpet-web-image-handoff-")
	const runId = "image-generate:123e4567-e89b-12d3-a456-426614174000"
	const relativePath = `creator-web/runs/${runId}/0001.png`
	const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
	const outputPath = path.join(dataDir, relativePath)
	fs.mkdirSync(path.dirname(outputPath), { recursive: true })
	fs.writeFileSync(outputPath, bytes)
	const ai = createAiService({
		settings: { read: () => ({ version: 1, values: { models: { imageGeneration: {} } } }), patch: () => ({}) },
		secrets: { get: () => "" },
		userDataDir: dataDir,
	})
	try {
		const sha256 = require("node:crypto").createHash("sha256").update(bytes).digest("hex")
		const generated = ai.readWebGeneratedReference(relativePath, sha256)
		assert.equal(generated.mimeType, "image/png")
		assert.deepEqual(generated.bytes, bytes)
		assert.throws(() => ai.readWebGeneratedReference(relativePath, "0".repeat(64)), /changed after preview/)
		assert.throws(() => ai.readWebGeneratedReference("creator-web/runs/job-1/0001.png", sha256), /reference is invalid/)
		const linkedPath = path.join(path.dirname(outputPath), "linked.png")
		fs.symlinkSync(outputPath, linkedPath)
		assert.throws(() => ai.readWebGeneratedReference(`${path.posix.dirname(relativePath)}/linked.png`, sha256), /Generated image not found/)
	} finally {
		fs.rmSync(dataDir, { recursive: true, force: true })
	}
})

test("web candidate cleanup prunes expired unreferenced images and preserves adopted or out-of-scope files", () => {
	const dataDir = tempDir("openpet-web-image-cleanup-")
	const runsDir = path.join(dataDir, "creator-web", "runs")
	const ai = createAiService({
		settings: { read: () => ({ version: 1, values: { models: { imageGeneration: {} } } }), patch: () => ({}) },
		secrets: { get: () => "" },
		userDataDir: dataDir,
	})
	const oldTime = Date.now() - 31 * 24 * 60 * 60 * 1_000
	const adoptedBytes = Buffer.from("adopted candidate")
	const unusedBytes = Buffer.from("unused candidate")
	const adoptedHash = require("node:crypto").createHash("sha256").update(adoptedBytes).digest("hex")
	const oldJob = "image-generate:123e4567-e89b-42d3-a456-426614174000"
	const unusedJob = "image-generate:123e4567-e89b-42d3-a456-426614174001"
	const freshJob = "image-generate:123e4567-e89b-42d3-a456-426614174002"
	const invalidJob = "image-generate:123e4567-e89b-12d3-a456-426614174003"
	const makeFile = (jobId, name, bytes, mtime = oldTime) => {
		const directory = path.join(runsDir, jobId)
		fs.mkdirSync(directory, { recursive: true })
		const file = path.join(directory, name)
		fs.writeFileSync(file, bytes)
		const date = new Date(mtime)
		fs.utimesSync(file, date, date)
		fs.utimesSync(directory, date, date)
		return { directory, file }
	}
	const adopted = makeFile(oldJob, "0001.png", adoptedBytes)
	const unusedSibling = makeFile(oldJob, "0002.png", unusedBytes)
	const fullyUnused = makeFile(unusedJob, "0001.png", unusedBytes)
	const fresh = makeFile(freshJob, "0001.png", unusedBytes, Date.now())
	const invalid = makeFile(invalidJob, "0001.png", unusedBytes)
	const unrelated = makeFile("creator.workflow:123e4567-e89b-42d3-a456-426614174004", "0001.png", unusedBytes)
	const outsideDir = tempDir("openpet-web-image-cleanup-outside-")
	const linkedJobPath = path.join(runsDir, "image-generate:123e4567-e89b-42d3-a456-426614174005")
	fs.mkdirSync(outsideDir, { recursive: true })
	const outsideImage = path.join(outsideDir, "0001.png")
	fs.writeFileSync(outsideImage, unusedBytes)
	fs.symlinkSync(outsideDir, linkedJobPath, "dir")

	try {
		const cleaned = ai.cleanupExpiredWebImageCandidates({ retainedContentHashes: [adoptedHash] })
		assert.deepEqual(cleaned, { removedFiles: 2, removedDirectories: 1 })
		assert.equal(fs.existsSync(adopted.file), true)
		assert.equal(fs.existsSync(unusedSibling.file), false)
		assert.equal(fs.existsSync(fullyUnused.file), false)
		assert.equal(fs.existsSync(fullyUnused.directory), false)
		assert.equal(fs.existsSync(fresh.file), true)
		assert.equal(fs.existsSync(invalid.file), true)
		assert.equal(fs.existsSync(unrelated.file), true)
		assert.equal(fs.lstatSync(linkedJobPath).isSymbolicLink(), true)
		assert.equal(fs.existsSync(outsideImage), true)
	} finally {
		fs.rmSync(dataDir, { recursive: true, force: true })
		fs.rmSync(outsideDir, { recursive: true, force: true })
	}
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
		const privateInputs = new Map()
		const { createActionService } = await import("../../services/backend/domains/actions.js")
		const actions = createActionService({
			jobs: { insert: (input) => {
				const { privateInput, ...jobInput } = input
				privateInputs.set(jobInput.id, privateInput)
				return repo.insert(jobInput)
			} },
			emit: (name, payload) => events.push({ name, payload }),
			shell: { request: async ({ operation, payload }) => {
				const current = repo.activeByResourceKey("actions:import")
				assert.equal(current.progress.phase, "finalizing")
				await assert.rejects(() => runner.cancel(current.id), (error) => error.code === "JOB_NOT_CANCELABLE" && error.status === 423)
				if (operation === "import-frames") calls.push(payload)
				return { body: { type: "actions.result", operation, ok: true, result: { ok: true, result: { importedAction: { id: payload.actionId } }, animations: { actions: [{ id: payload.actionId }] } } } }
			} },
		})
		const runner = createRunner({
			repo,
			queue,
			progress: ({ onEmit }) => ({ report: onEmit, flush: () => {}, reset: () => {} }),
			emit: (name, payload) => events.push({ name, payload }),
			takePrivateInput: (jobId) => {
				const value = privateInputs.get(jobId)
				privateInputs.delete(jobId)
				return value
			},
			handlers: {
				"actions.import-frames": ({ job, privateInput, report, signal, finalize }) => actions.runImportFrames({ ...(privateInput ?? job.input), report, signal, finalize }),
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
	const tmp = fs.realpathSync.native(tempDir("openpet-t46-tmp-"))
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

test("T46 image commit creates missing nested output parents before staging", async () => {
	const root = tempDir("openpet-t46-nested-data-")
	const tmp = fs.realpathSync.native(tempDir("openpet-t46-nested-tmp-"))
	const ai = createAiService({
		settings: { read: () => ({ version: 1, values: { models: { imageGeneration: {} } } }), patch: () => ({}) },
		secrets: { get: () => "" },
		userDataDir: root,
	})
	const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
	const relativeDir = "creator-web/runs/image-generate:job-1"
	const outputPath = path.join(root, relativeDir, "0001.png")
	try {
		fs.mkdirSync(path.join(tmp, "outputs"), { recursive: true })
		fs.writeFileSync(path.join(tmp, "outputs", "0001.png"), bytes)
		const result = await ai.commitGeneratedImage({
			tmpDir: tmp,
			destination: { dataDir: root, dataRelativeDir: relativeDir },
			result: { outputs: [{ dataRelativePath: "outputs/0001.png" }] },
		})
		assert.equal(result.outputs[0].dataRelativePath, `${relativeDir}/0001.png`)
		assert.deepEqual(fs.readFileSync(outputPath), bytes)
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
		fs.rmSync(tmp, { recursive: true, force: true })
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
