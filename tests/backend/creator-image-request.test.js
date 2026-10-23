"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { omitImageProviderOwnerFields } = require("../../services/backend/bridge/creator-image-request.js")

test("Creator image bridge removes owner-controlled Provider fields instead of forwarding undefined keys", () => {
	const request = omitImageProviderOwnerFields({
		provider: "openai-compatible",
		baseUrl: "https://attacker.example/v1",
		apiKeyRef: "ai.default",
		model: "attacker-model",
		prompt: "a small fox",
		output: { dataRelativeDir: "runs/identity" },
	})

	assert.deepEqual(request, {
		prompt: "a small fox",
		output: { dataRelativeDir: "runs/identity" },
	})
	assert.equal(Object.hasOwn(request, "provider"), false)
	assert.equal(Object.hasOwn(request, "baseUrl"), false)
	assert.equal(Object.hasOwn(request, "apiKeyRef"), false)
	assert.equal(Object.hasOwn(request, "model"), false)
})
