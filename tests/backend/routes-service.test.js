"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { describe, it } = require("node:test")

async function availablePort() {
	const server = createServer()
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	const port = server.address().port
	await new Promise((resolve) => server.close(resolve))
	return port
}

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

	it("keeps the Shell-provided MCP token authoritative across save and rotation", async () => {
		const { createLocalHttpManager } = await import("../../services/backend/domains/local-http.js")
		const manager = createLocalHttpManager({
			secrets: { localHttpToken: "initial-token" },
			shell: { request: async ({ payload }) => ({ body: { type: "pet.command.result", ok: true, result: payload } }) },
		})
		try {
			await manager.setConfig({ enabled: true, host: "127.0.0.1", port: 0, token: "saved-token" })
			let status = manager.status()
			let response = await fetch(`http://${status.host}:${status.port}/api/pet/say`, {
				method: "POST",
				headers: { authorization: "Bearer saved-token", "content-type": "application/json" },
				body: JSON.stringify({ text: "saved" }),
			})
			assert.equal(response.status, 200)

			await manager.rotateToken("rotated-token")
			status = manager.status()
			response = await fetch(`http://${status.host}:${status.port}/api/pet/say`, {
				method: "POST",
				headers: { authorization: "Bearer saved-token", "content-type": "application/json" },
				body: JSON.stringify({ text: "old" }),
			})
			assert.equal(response.status, 401)
			response = await fetch(`http://${status.host}:${status.port}/api/pet/say`, {
				method: "POST",
				headers: { authorization: "Bearer rotated-token", "content-type": "application/json" },
				body: JSON.stringify({ text: "new" }),
			})
			assert.equal(response.status, 200)
		} finally {
			await manager.stop()
		}
	})

	it("retains the last committed token after a replacement listener fails to bind", async () => {
		const { createLocalHttpManager } = await import("../../services/backend/domains/local-http.js")
		const initialPort = await availablePort()
		const occupied = createServer()
		await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve))
		const occupiedPort = occupied.address().port
		const manager = createLocalHttpManager({
			secrets: { localHttpToken: "initial-token" },
			shell: { request: async ({ payload }) => ({ body: { type: "pet.command.result", ok: true, result: payload } }) },
		})
		const request = (token) => fetch(`http://127.0.0.1:${initialPort}/api/pet/say`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			body: JSON.stringify({ text: "hello" }),
		})

		try {
			await manager.setConfig({ enabled: true, host: "127.0.0.1", port: initialPort, token: "initial-token" })
			await assert.rejects(
				manager.setConfig({ enabled: true, host: "127.0.0.1", port: occupiedPort, token: "uncommitted-token" }),
				/EADDRINUSE/
			)
			await manager.setConfig({ enabled: true, host: "127.0.0.1", port: initialPort })
			assert.equal((await request("initial-token")).status, 200)
			assert.equal((await request("uncommitted-token")).status, 401)
		} finally {
			await manager.stop()
			await new Promise((resolve) => occupied.close(resolve))
		}
	})

	it("keeps the injected legacy token authoritative for local /api/pet mutations", async () => {
		const { createLocalHttpManager } = await import("../../services/backend/domains/local-http.js")
		const sent = []
		const manager = createLocalHttpManager({
			secrets: { localHttpToken: "legacy-local-http-token" },
			shell: { request: async (message) => {
				sent.push(message)
				return { body: { type: "pet.command.result", ok: true, result: message.payload } }
			} },
		})
		const started = await manager.start({ host: "127.0.0.1", port: 0 })
		const url = `http://${started.host}:${started.port}/api/pet/say`
		const request = (token) => fetch(url, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			body: JSON.stringify({ text: "hello" }),
		})

		try {
			assert.equal((await request("wrong-token")).status, 401)
			assert.equal((await request("legacy-local-http-token")).status, 200)
			assert.deepEqual(sent, [{
				type: "pet.command.request",
				operation: "say",
				payload: { text: "hello", ttlMs: undefined, source: "http", sourceSurface: "local-http" },
			}])
		} finally {
			await manager.stop()
		}
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
