"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

let settingsApi

describe("T41 settings HTTP cutover", async () => {
	settingsApi = await import("../../src/control-center/src/features/settings/api.ts")

	it("maps a backend envelope to the existing view model without derived fields", () => {
		const view = settingsApi.settingsEnvelopeToViewModel({
			version: 4,
			values: {
				scale: 1.25,
				walkSpeed: 3,
				petBehavior: { grounded: true, home: { enabled: true, radius: "large", anchor: { x: 1 } } },
				customCursorScope: "openpet",
				customCursor: { enabled: true, assetPath: "/private/cursor.png" },
				systemCursorStatus: { supported: true, active: true },
			},
		})
		assert.equal(view.scale, 1.25)
		assert.deepEqual(view.home, { enabled: true, radius: "large", hasAnchor: true })
		assert.deepEqual(view.systemCursorStatus, { supported: false, platform: 'unknown', active: false, helperPid: 0 })
	})

	it("creates a canonical point-path diff and excludes derived/runtime fields", () => {
		const patch = settingsApi.createCanonicalSettingsPatch(
			{ scale: 1, home: { enabled: false, radius: "medium", hasAnchor: false }, systemCursorStatus: { active: true } },
			{ scale: 2, home: { enabled: true, radius: "large", hasAnchor: true }, systemCursorStatus: { active: false } },
		)
		assert.deepEqual(patch, { scale: 2, "petBehavior.home.enabled": true, "petBehavior.home.radius": "large" })
		assert.equal(Object.keys(patch).some((path) => path.includes("systemCursor") || path.endsWith("hasAnchor")), false)
	})

	it("reloads and replays only the user intent after a version conflict", async () => {
		const calls = []
		let attempt = 0
		const api = {
			get: async () => {
				calls.push(["GET"])
				return { version: 9, values: { scale: 1, walkSpeed: 7 } }
			},
			patch: async (body) => {
				calls.push(["PATCH", body])
				if (attempt++ === 0) throw Object.assign(new Error("conflict"), { code: "CONFLICT", status: 409 })
				return { version: 10, changedPaths: ["scale"] }
			},
		}
		const result = await settingsApi.saveSettingsWithRetry({
			api,
			base: { version: 8, values: { scale: 1 } },
			previousView: { scale: 1 },
			nextView: { scale: 2 },
		})
		assert.deepEqual(calls, [
			["PATCH", { ifVersion: 8, patch: { scale: 2 }}],
			["GET"],
			["PATCH", { ifVersion: 9, patch: { scale: 2 }}],
		])
		assert.equal(result.version, 10)
	})
})
