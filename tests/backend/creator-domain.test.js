"use strict"

const assert = require("node:assert/strict")
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
