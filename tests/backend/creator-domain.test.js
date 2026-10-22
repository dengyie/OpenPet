"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

async function fixture() {
	const [{ openDatabase }, { migrate }, { createCreatorDomain }] = await Promise.all([
		import("../../services/backend/store/db.js"),
		import("../../services/backend/store/migrate.js"),
		import("../../services/backend/domains/creator/index.js"),
	])
	const db = await openDatabase({ file: ":memory:" })
	migrate({ db })
	const requests = []
	const queued = []
	const shell = {
		request: async (request) => {
			requests.push(request)
			return {
				body: {
					type: "creator.result",
					operation: request.operation,
					ok: true,
					result: request.operation === "bind-reference"
						? { reference: { fileName: "front.png", relativePath: "runs/run-1/inputs/front.png", contentHash: "a".repeat(64), width: 128, height: 128 } }
						: { run: { runId: "run-1", mode: "single-action", status: "completed", sourcePath: "/private/secret.png" } },
			},
			}
		},
	}
	const creator = createCreatorDomain({ db, shell, enqueueJob: (input) => { queued.push(input); return { id: input.id } } })
	return { db, creator, requests, queued }
}

test("Creator domain persists flow/reference metadata without absolute paths or tokens", async (t) => {
	const ctx = await fixture()
	t.after(() => ctx.db.close())
	const flow = ctx.creator.createFlow({ name: "default", config: { apiKey: "sk-secret", prompt: "front" } })
	assert.equal(flow.config.apiKey, "[redacted]")
	assert.equal(ctx.creator.listFlows()[0].config.apiKey, "[redacted]")
	const bound = await ctx.creator.bindReference({ targetType: "editable-action-host", targetId: "legacy-editable-host", referenceToken: "opaque-token" })
	assert.equal(bound.reference.relativePath, "runs/run-1/inputs/front.png")
	assert.equal(ctx.requests[0].payload.referenceToken, "opaque-token")
	const persisted = ctx.db.prepare("SELECT token_hash, relative_path, metadata_json FROM creator_references").get()
	assert.equal(persisted.token_hash, require("node:crypto").createHash("sha256").update("opaque-token").digest("hex"))
	assert.equal(persisted.relative_path.includes("/"), true)
	assert.equal(persisted.metadata_json.includes("/private"), false)
})

test("Creator jobs keep secret input in memory and persist only redacted payload", async (t) => {
	const ctx = await fixture()
	t.after(() => ctx.db.close())
	const queued = ctx.creator.enqueueCharacter({ characterName: "Cat", stylePrompt: "clean", referenceImageToken: "opaque-token" })
	assert.equal(queued.jobId, ctx.queued[0].id)
	assert.deepEqual(ctx.queued[0].input, {
		operation: "creator.character",
		flowId: "",
		characterName: "Cat",
		stylePrompt: "clean",
	})
	assert.equal(ctx.creator.getJobInput(queued.jobId).referenceImageToken, "opaque-token")
})

test("Creator result serialization strips absolute paths from public run state", async (t) => {
	const ctx = await fixture()
	t.after(() => ctx.db.close())
	const state = await ctx.creator.getState()
	assert.equal(JSON.stringify(state).includes("/private/secret.png"), false)
})

test("Creator reference deletion is delegated to Shell before metadata removal", async (t) => {
	const ctx = await fixture()
	t.after(() => ctx.db.close())
	ctx.db.prepare("INSERT INTO creator_references (id, owner, target_type, target_id, token_hash, file_name, width, height, content_hash, relative_path, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
		.run("ref-1", "desktop", "editable-action-host", "legacy-editable-host", "hash", "front.png", 1, 1, "", "runs/front.png", "{}", 1, 1)
	const result = await ctx.creator.deleteReference({ targetType: "editable-action-host", targetId: "legacy-editable-host" })
	assert.deepEqual(result, { deleted: true, targetType: "editable-action-host", targetId: "legacy-editable-host" })
	assert.equal(ctx.requests.at(-1).operation, "delete-reference")
	assert.equal(ctx.db.prepare("SELECT COUNT(*) AS count FROM creator_references").get().count, 0)
})

test("Creator backend image mode owns generation and persists a reviewable image artifact", async (t) => {
	const ctx = await fixture()
	t.after(() => ctx.db.close())
	const calls = []
	const ai = {
		createWebImageInput: (input, jobId) => {
			calls.push(["input", input, jobId])
			return { ...input, output: { dataDir: "/data", dataRelativeDir: `creator-web/runs/${jobId}` } }
		},
		prepareGeneratedImage: async (input, options) => {
			calls.push(["prepare", input, options])
			return { result: { ok: true, outputs: [{ dataRelativePath: "creator-web/runs/job-1/0001.png", mimeType: "image/png", sha256: "b".repeat(64) }] }, tmpDir: "/tmp/job-1", destination: input.output }
		},
		commitGeneratedImage: async (prepared) => {
			calls.push(["commit", prepared])
			return prepared.result
		},
	}
	const creator = (await import("../../services/backend/domains/creator/index.js")).createCreatorDomain({
		db: ctx.db,
		shell: ctx.creator ? { request: ctx.creator.authority } : null,
		ai,
		enqueueJob: (input) => { ctx.queued.push(input); return { id: input.id } },
	})
	const result = await creator.runCharacter({
		backend: "web",
		jobId: "job-1",
		characterName: "Mango Fox",
		stylePrompt: "orange fox",
		referenceImage: { mimeType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3egAAAAASUVORK5CYII=" },
	}, { job: { id: "job-1" }, tmpDir: "/tmp/job-1", report() {}, finalize: async (fn) => fn() })
	assert.equal(result.run.status, "ready_for_review")
	assert.equal(result.run.mode, "web-image")
	assert.equal(result.run.state.generatedImage.outputs[0].dataRelativePath, "creator-web/runs/job-1/0001.png")
	assert.equal(calls[0][0], "input")
	assert.equal(calls.at(-1)[0], "commit")
})

test("Backend web Creator submits a retained reference and the complete quality-first pet task", async (t) => {
	const ctx = await fixture()
	t.after(() => ctx.db.close())
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-creator-backend-flow-"))
	t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
	const calls = []
	const shellCalls = []
	const creator = (await import("../../services/backend/domains/creator/index.js")).createCreatorDomain({
		db: ctx.db,
		shell: { request: async (request) => {
			shellCalls.push(request)
			return { body: { type: "creator.result", operation: request.operation, ok: true, result: { run: { runId: "run-web-1", mode: "full-pet", status: "imported" } } } }
		} },
		creatorDataDir: () => dataDir,
		runPluginCommand: async (command, payload) => {
			calls.push({ command, payload })
			return command === "create-run"
				? { run: { runId: "run-web-1", status: "draft" } }
				: { run: { runId: "run-web-1", status: "awaiting_identity_review", creatorExecution: "backend" }, message: "Identity candidates ready" }
		},
	})
	const result = await creator.runCharacter({
		backend: "web",
		characterName: "Mango Fox",
		stylePrompt: "orange fox",
		referenceImage: { mimeType: "image/png", fileName: "fox.png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3egAAAAASUVORK5CYII=" },
	})
	assert.deepEqual(calls.map(({ command }) => command), ["create-run", "run-step"])
	assert.equal(calls[0].payload.creatorExecution, "backend")
	assert.equal(calls[0].payload.generationTask.mode, "full-pet")
	assert.equal(calls[0].payload.generationTask.pipeline, "quality-first-v1")
	assert.deepEqual(calls[0].payload.generationTask.actions.map(({ actionId }) => actionId), ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"])
	const referencePath = path.join(dataDir, calls[0].payload.referenceImage.relativePath)
	assert.equal(fs.existsSync(referencePath), true)
	assert.equal(result.run.id, "run-web-1")
	assert.equal(result.run.state.creatorExecution, "backend")
	await creator.runWorkflow({ runId: "run-web-1", operation: "import-actions", activate: true })
	assert.equal(shellCalls.at(-1).operation, "import-actions")
	const persistedLastRun = await creator.getLastRun()
	assert.equal(persistedLastRun.backendLastRun.id, "run-web-1")
	assert.equal(persistedLastRun.backendLastRun.state.creatorExecution, "backend")
})

test("Backend web Creator can continue from a hash-verified generated image artifact", async (t) => {
	const ctx = await fixture()
	t.after(() => ctx.db.close())
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-creator-generated-reference-"))
	const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-creator-generated-reference-plugin-"))
	t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
	t.after(() => fs.rmSync(pluginDataDir, { recursive: true, force: true }))
	const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
	const relativePath = "creator-web/runs/image-generate:123e4567-e89b-12d3-a456-426614174000/0001.png"
	const outputPath = path.join(dataDir, relativePath)
	fs.mkdirSync(path.dirname(outputPath), { recursive: true })
	fs.writeFileSync(outputPath, bytes)
	const { createAiService } = require("../../services/backend/domains/ai/image-generation.js")
	const ai = createAiService({
		settings: { read: () => ({ version: 1, values: { models: { imageGeneration: {} } } }), patch: () => ({}) },
		secrets: { get: () => "" },
		userDataDir: dataDir,
	})
	const calls = []
	const creator = (await import("../../services/backend/domains/creator/index.js")).createCreatorDomain({
		db: ctx.db,
		ai,
		creatorDataDir: () => pluginDataDir,
		runPluginCommand: async (command, payload) => {
			calls.push({ command, payload })
			return command === "create-run"
				? { run: { runId: "run-generated-1", status: "draft" } }
				: { run: { runId: "run-generated-1", status: "awaiting_identity_review", creatorExecution: "backend" } }
		},
	})
	const sha256 = require("node:crypto").createHash("sha256").update(bytes).digest("hex")
	assert.deepEqual([...creator.referencedImageContentHashes()], [])
	const result = await creator.runCharacter({
		backend: "web",
		characterName: "Mango Fox",
		stylePrompt: "orange fox",
		generatedImage: { relativePath, sha256 },
	})
	assert.deepEqual(calls.map(({ command }) => command), ["create-run", "run-step"])
	assert.equal(result.run.id, "run-generated-1")
	assert.deepEqual([...creator.referencedImageContentHashes()], [sha256])
	const reference = calls[0].payload.referenceImage
	assert.equal(reference.fileName, "0001.png")
	assert.deepEqual(fs.readFileSync(path.join(pluginDataDir, reference.relativePath)), bytes)
	await assert.rejects(() => creator.runCharacter({
		backend: "web",
		characterName: "Mango Fox",
		stylePrompt: "orange fox",
		generatedImage: { relativePath, sha256: "0".repeat(64) },
	}), /changed after preview/)
})

test("Backend Creator refuses to stage browser references through a symlink", async (t) => {
	const ctx = await fixture()
	t.after(() => ctx.db.close())
	const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-creator-reference-symlink-plugin-"))
	const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-creator-reference-symlink-outside-"))
	t.after(() => fs.rmSync(pluginDataDir, { recursive: true, force: true }))
	t.after(() => fs.rmSync(outsideDir, { recursive: true, force: true }))
	fs.symlinkSync(outsideDir, path.join(pluginDataDir, "incoming"), "dir")
	let pluginCalls = 0
	const creator = (await import("../../services/backend/domains/creator/index.js")).createCreatorDomain({
		db: ctx.db,
		creatorDataDir: () => pluginDataDir,
		runPluginCommand: async () => { pluginCalls += 1; return { run: { runId: "unexpected", status: "draft" } } },
	})
	await assert.rejects(() => creator.runCharacter({
		backend: "web",
		characterName: "Mango Fox",
		stylePrompt: "orange fox",
		referenceImage: { mimeType: "image/png", dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64") },
	}), /staging directory is invalid/)
	assert.equal(pluginCalls, 0)
	assert.deepEqual(fs.readdirSync(outsideDir), [])
})

test("Backend Creator verifies retained recovery bundles without calling a nonexistent plugin command", async (t) => {
	const ctx = await fixture()
	t.after(() => ctx.db.close())
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-creator-recovery-"))
	t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
	const calls = []
	const runId = "run-web-recovery"
	const recoveryRelativePath = `runs/${runId}/recovery/recovery.json`
	const recoveryBody = JSON.stringify({ version: 1, runId, files: [] })
	const recoveryHash = require("node:crypto").createHash("sha256").update(recoveryBody).digest("hex")
	const recoveryPath = path.join(dataDir, recoveryRelativePath)
	fs.mkdirSync(path.dirname(recoveryPath), { recursive: true })
	fs.writeFileSync(recoveryPath, recoveryBody)
	fs.writeFileSync(path.join(dataDir, "runs", runId, "run.json"), JSON.stringify({
		runId,
		qualityFirst: { recovery: { relativePath: recoveryRelativePath, sha256: recoveryHash } },
	}))
	const creator = (await import("../../services/backend/domains/creator/index.js")).createCreatorDomain({
		db: ctx.db,
		creatorDataDir: () => dataDir,
		runPluginCommand: async (command) => {
			calls.push(command)
			if (command === "create-run") return { run: { runId, status: "draft" } }
			if (command === "run-step") return { run: { runId, status: "recovery-required", creatorExecution: "backend" } }
			throw new Error(`Creator Studio command is not declared: ${command}`)
		},
	})
	await creator.runCharacter({
		backend: "web",
		characterName: "Mango Fox",
		stylePrompt: "orange fox",
		referenceImage: { mimeType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3egAAAAASUVORK5CYII=" },
	})
	const result = await creator.runExport({ runId }, { finalize: async (commit) => commit() })
	assert.deepEqual(calls, ["create-run", "run-step"])
	assert.equal(result.ok, true)
	assert.equal(result.code, "recovery_bundle_ready")
	assert.equal(result.runId, runId)
	assert.equal(result.relativePath, recoveryRelativePath)
	assert.equal(result.sha256, recoveryHash)
	assert.equal(result.byteSize, Buffer.byteLength(recoveryBody))
	assert.equal(result.run.state.creatorExecution, "backend")
})
