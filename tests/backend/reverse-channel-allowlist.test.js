"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { describe, it } = require("node:test")

const {
	BACKEND_TO_SHELL_TYPES: SHELL_BACKEND_TO_SHELL_TYPES,
	createMessageHandler,
} = require("../../apps/desktop/src/sidecar/message-handler.js")

const EXPECTED_BACKEND_TO_SHELL_TYPES = [
	"pet.say",
	"pet.playAction",
	"pet.event",
	"window.openPluginDashboard",
	"notify",
	"tray.setBadge",
	"ready",
	"degraded",
	"dialog.request",
]

function envelope(type, body = {}) {
	return {
		v: 1,
		id: `test-${type}`,
		at: Date.now(),
		body: { type, ...body },
	}
}

function contractBackendToShellTypes() {
	const source = fs.readFileSync(path.join(__dirname, "../../packages/contracts/src/bridge.ts"), "utf8")
	const start = source.indexOf("export const backendToShellSchema")
	const end = source.indexOf("export type BackendToShell", start)
	assert.notEqual(start, -1, "backendToShellSchema must exist in packages/contracts")
	assert.notEqual(end, -1, "BackendToShell type must follow backendToShellSchema")
	return [...source.slice(start, end).matchAll(/type: z\.literal\("([^"]+)"\)/g)].map((match) => match[1])
}

describe("T28 reverse-channel allowlist", () => {
	it("keeps the Backend and Shell allowlists exactly aligned with the 9 contract types", async () => {
		const backendSchema = await import("../../services/backend/bridge/message-schema.js")

		assert.deepEqual(contractBackendToShellTypes(), EXPECTED_BACKEND_TO_SHELL_TYPES)
		assert.deepEqual(backendSchema.BACKEND_TO_SHELL_TYPES, EXPECTED_BACKEND_TO_SHELL_TYPES)
		assert.deepEqual(SHELL_BACKEND_TO_SHELL_TYPES, EXPECTED_BACKEND_TO_SHELL_TYPES)
		assert.equal(new Set(SHELL_BACKEND_TO_SHELL_TYPES).size, 9)
	})

	it("drops malformed and non-allowlisted envelopes and logs each rejection", async () => {
		const warnings = []
		const calls = []
		const handler = createMessageHandler({
			send() {},
			petService: { say: (...args) => calls.push(args) },
			logger: { warn: (message, fields) => warnings.push({ message, fields }) },
		})

		assert.equal(await handler.handle(envelope("shell.executePath", { path: "/tmp/owned" })), false)
		assert.equal(await handler.handle({ ...envelope("pet.say", { text: "ignored" }), v: 2 }), false)
		assert.equal(await handler.handle({ ...envelope("pet.say", { text: "ignored" }), id: "" }), false)
		assert.equal(await handler.handle({ ...envelope("pet.say", { text: "ignored" }), at: "now" }), false)
		assert.deepEqual(calls, [])
		assert.equal(warnings.length, 4)
		assert.deepEqual(warnings.map((entry) => entry.fields?.reason), [
			"unknown-type",
			"version-mismatch",
			"bad-id",
			"bad-at",
		])
	})

	it("passes only pluginId to the dashboard opener and ignores all backend window parameters", async () => {
		const dashboards = []
		const handler = createMessageHandler({
			send() {},
			onDashboard: (request) => dashboards.push(request),
		})

		assert.equal(await handler.handle(envelope("window.openPluginDashboard", {
			pluginId: "focus-timer",
			url: "file:///tmp/owned.html",
			preload: "/tmp/owned-preload.js",
			webPreferences: { nodeIntegration: true, sandbox: false },
			path: "/tmp/owned.html",
		})), true)

		assert.deepEqual(dashboards, [{ pluginId: "focus-timer" }])
	})
})
