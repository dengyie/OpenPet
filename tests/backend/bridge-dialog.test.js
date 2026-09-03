"use strict"

const assert = require("node:assert/strict")
const { before, describe, it } = require("node:test")

let bridge
let shellClient

before(async () => {
	bridge = await import("../../services/backend/bridge/message-schema.js")
	shellClient = await import("../../services/backend/bridge/shell-client.js")
})

function resultEnvelope(id, paths) {
	return bridge.createEnvelope(
		{
			type: "dialog.result",
			requestId: id,
			paths,
		},
		{ id },
	)
}

describe("dialog.request bridge", () => {
	it("backend whitelist contains exactly the 10 contract message types", () => {
		assert.equal(bridge.BACKEND_TO_SHELL_TYPES.length, 10)
		assert.equal(new Set(bridge.BACKEND_TO_SHELL_TYPES).size, 10)
		assert.equal(bridge.BACKEND_TO_SHELL_TYPES.includes("dialog.request"), true)
		assert.equal(bridge.SHELL_TO_BACKEND_TYPES.length, 6, "T12 must not change the reverse whitelist")
	})

	it("request and dialog.result correlate with the same envelope id", async () => {
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })

		const responsePromise = client.request({ type: "dialog.request", mode: "directory" })
		assert.equal(sent.length, 1)
		assert.equal(sent[0].body.requestId, sent[0].id)
		assert.equal(sent[0].body.mode, "directory")

		client.receive(resultEnvelope(sent[0].id, ["/tmp/openpet"]))
		const response = await responsePromise
		assert.equal(response.id, sent[0].id)
		assert.deepEqual(response.body.paths, ["/tmp/openpet"])
		client.dispose()
	})

	it("times out after 60 seconds with PROVIDER_TIMEOUT / 504", async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] })
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })
		const responsePromise = client.request({ type: "dialog.request", mode: "file" })

		t.mock.timers.tick(bridge.DIALOG_RESULT_TIMEOUT_MS)
		await assert.rejects(responsePromise, (error) => {
			assert.equal(error.code, "PROVIDER_TIMEOUT")
			assert.equal(error.status, 504)
			assert.equal(error.retryable, true)
			assert.equal(error.details.envelopeId, sent[0].id)
			return true
		})
		client.dispose()
	})

	it("treats paths: null as a successful cancellation result", async () => {
		const sent = []
		const client = shellClient.createShellClient({ send: (envelope) => sent.push(envelope) })
		const responsePromise = client.request({ type: "dialog.request", mode: "file" })

		client.receive(resultEnvelope(sent[0].id, null))
		const response = await responsePromise
		assert.equal(response.body.requestId, sent[0].id)
		assert.equal(response.body.paths, null)
		client.dispose()
	})
})
