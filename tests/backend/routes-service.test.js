"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

describe("T16 service routes", () => {
	it("registers the service contract including PUT config", async () => {
		const [{ createRouter }, { registerServiceRoutes, SERVICE_ROUTES }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/service.js"),
		])
		const router = createRouter({ basePath: "/api/v1" })
		const manager = { status: () => ({}), start: async () => ({}), stop: async () => ({}), rotateToken: async () => ({}), getLogs: () => ({}), clearLogs: () => [], config: () => ({}), setConfig: async () => ({}), diagnostics: () => ({}) }
		registerServiceRoutes(router, { manager })
		assert.deepEqual(router.routes(), SERVICE_ROUTES.map((entry) => {
			const [method, route] = entry.split(" ")
			return `${method} /api/v1${route}`
		}))
	})

	it("manager diagnostics never expose the token", async () => {
		const { createLocalHttpManager } = await import("../../services/backend/domains/local-http.js")
		const manager = createLocalHttpManager({ secrets: { localHttpToken: "secret-token" } })
		assert.equal(JSON.stringify(manager.diagnostics()).includes("secret-token"), false)
		assert.equal(manager.config().tokenConfigured, true)
	})

	it("health registration can leave business paths to their domain modules", async () => {
		const [{ createRouter }, health] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/health.js"),
		])
		const router = createRouter({ basePath: "/api/v1" })
		health.registerHealthRoutes({ router, runtime: { startedAt: 0, degraded: false }, includeBusinessRoutes: false })
		assert.deepEqual(router.routes(), ["GET /api/v1/health"])
	})
})
