"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

let createSettingsCommands
let ApiError

describe("Settings Shell command domain", () => {
	it("correlates preview and cursor import requests to their strict results", async () => {
		const commandsModule = await import("../../services/backend/domains/settings-commands.js")
		const middleware = await import("../../services/backend/http/middleware.js")
		createSettingsCommands = commandsModule.createSettingsCommands
		ApiError = middleware.ApiError
		const calls = []
		const commands = createSettingsCommands({ shell: {
			request: async (request, options) => {
				calls.push({ request, options })
				return { body: { type: "settings.command.result", operation: request.operation, ok: true, result: request.operation === "preview-scale" ? { scale: 1.2 } : { canceled: true } } }
			},
		} })
		assert.deepEqual(await commands.previewScale(1.2), { scale: 1.2 })
		assert.deepEqual(await commands.importCursor(), { canceled: true })
		assert.deepEqual(calls.map(({ request }) => request), [
			{ type: "settings.command.request", operation: "preview-scale", payload: { scale: 1.2 } },
			{ type: "settings.command.request", operation: "import-cursor", payload: {} },
		])
		assert.equal(calls[1].options.timeoutMs, 180_000)
	})

	it("maps Shell failures and outages without exposing arbitrary response fields", async () => {
		const unavailable = createSettingsCommands({ shell: { request: async () => { throw new Error("transport down") } } })
		await assert.rejects(unavailable.previewScale(1), (error) => error instanceof ApiError && error.code === "BACKEND_UNAVAILABLE")
		const rejected = createSettingsCommands({ shell: { request: async () => ({ body: {
			type: "settings.command.result", operation: "import-cursor", ok: false,
			error: { code: "VALIDATION_FAILED", message: "invalid image", rawPath: "/private/user/image.png" },
		} }) } })
		await assert.rejects(rejected.importCursor(), (error) => error instanceof ApiError && error.code === "INTERNAL")
	})
})
