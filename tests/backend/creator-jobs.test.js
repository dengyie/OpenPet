"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")

test("Creator handlers delegate to the domain and leave private input cleanup to the runner", async () => {
	const { createCreatorJobHandlers } = await import("../../services/backend/jobs/handlers/creator.js")
	const calls = []
	const privateInputs = new Map([["job-1", { characterName: "Cat", referenceImageToken: "opaque" }]])
	const creator = {
		getJobInput: (jobId) => privateInputs.get(jobId) || null,
		forgetJobInput: (jobId) => privateInputs.delete(jobId),
		runCharacter: async (input, context) => {
			calls.push(["character", input])
			if (input.fail) throw new Error("creator generation failed")
			return context.finalize(() => ({ ok: true }))
		},
		runWorkflow: async () => ({ ok: true }),
		runExport: async () => ({ ok: true }),
	}
	const handlers = createCreatorJobHandlers({ creator })
	const result = await handlers["creator.character"]({ job: { id: "job-1" }, finalize: async (fn) => fn(), report() {}, signal: new AbortController().signal })
	assert.deepEqual(result, { ok: true })
	assert.equal(calls[0][1].referenceImageToken, "opaque")
	assert.equal(privateInputs.has("job-1"), true)
	privateInputs.set("job-2", { fail: true, referenceImage: { dataBase64: "private" } })
	await assert.rejects(() => handlers["creator.character"]({ job: { id: "job-2" }, finalize: async (fn) => fn() }), /creator generation failed/)
	assert.equal(privateInputs.has("job-2"), true)
	creator.forgetJobInput("job-1")
	creator.forgetJobInput("job-2")
	await assert.rejects(() => handlers["creator.character"]({ job: { id: "job-2", input: { redacted: true } }, finalize: async (fn) => fn() }), /unavailable/)
})
