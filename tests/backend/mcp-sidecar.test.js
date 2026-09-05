"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { describe, it } = require("node:test")

const { spawnSidecar, stopSidecar } = require("../../apps/desktop/src/sidecar/spawn.js")

const repoRoot = path.resolve(__dirname, "../..")

async function request(url, options = {}) {
	const response = await fetch(url, options)
	return { status: response.status, headers: response.headers, text: await response.text() }
}

async function availablePort() {
	const server = createServer()
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	const port = server.address().port
	await new Promise((resolve) => server.close(resolve))
	return port
}

describe("T45 MCP sidecar HTTP server", () => {
	it("keeps the MCP server disabled by default and preserves legacy bytes", async () => {
		const { createLocalHttpService } = await import("../../services/backend/mcp/local-http-service.cjs")
		const calls = []
		const service = createLocalHttpService({
			petService: {
				getSnapshot: () => ({ mood: "calm" }),
				say: (payload) => { calls.push(payload); return { accepted: true } },
				playAction: (payload) => { calls.push(payload); return { accepted: true, actionId: payload.actionId } },
				setEvent: (payload) => { calls.push(payload); return { accepted: true, type: payload.type } },
			},
		})

		assert.deepEqual(service.getStatus(), { enabled: false, host: "127.0.0.1", port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } })
		const token = "legacy-token"
		const started = await service.start({ host: "127.0.0.1", port: 0, token })
		const endpoint = `http://${started.host}:${started.port}`
		try {
			const unauthorized = await request(`${endpoint}/api/pet/say`, {
				method: "POST",
				headers: { authorization: "Bearer sidecar-session-token", "content-type": "application/json" },
				body: JSON.stringify({ text: "nope" }),
			})
			assert.equal(unauthorized.status, 401)

			const accepted = await request(`${endpoint}/api/pet/say`, {
				method: "POST",
				headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
				body: JSON.stringify({ text: "hello" }),
			})
			assert.equal(accepted.status, 200)
			assert.equal(accepted.text, JSON.stringify({ ok: true, result: { accepted: true } }))

			const action = await request(`${endpoint}/api/pet/action`, {
				method: "POST",
				headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
				body: JSON.stringify({ actionId: "wave" }),
			})
			assert.equal(action.text, JSON.stringify({ ok: true, result: { accepted: true, actionId: "wave" } }))
			const event = await request(`${endpoint}/api/pet/event`, {
				method: "POST",
				headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
				body: JSON.stringify({ type: "happy", message: "hi" }),
			})
			assert.equal(event.text, JSON.stringify({ ok: true, result: { accepted: true, type: "happy" } }))
			assert.deepEqual(calls, [
				{ text: "hello", ttlMs: undefined, source: "http", sourceSurface: "local-http" },
				{ actionId: "wave", source: "http" },
				{ type: "happy", message: "hi", source: "http" },
			])
		} finally {
			await service.stop()
		}
	})

	it("keeps MCP sessions isolated from the API server and revocable", async () => {
		const { createLocalHttpService } = await import("../../services/backend/mcp/local-http-service.cjs")
		const service = createLocalHttpService({ petService: { getSnapshot: () => ({}) } })
		const api = createServer((_req, response) => {
			response.writeHead(401, { "content-type": "application/json" })
			response.end(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }))
		})
		await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve))
		const started = await service.start({ host: "127.0.0.1", port: 0, token: "mcp-token" })
		const endpoint = `http://${started.host}:${started.port}`
		try {
			const initialized = await request(`${endpoint}/mcp`, {
				method: "POST",
				headers: { authorization: "Bearer mcp-token", "content-type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
			})
			assert.equal(initialized.status, 200)
			assert.equal(initialized.text, JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				result: {
					protocolVersion: "2025-03-26",
					capabilities: { tools: {} },
					serverInfo: { name: "openpet", version: "1.0.0" },
				},
			}))
			const sessionId = initialized.headers.get("mcp-session-id")
			assert.equal(typeof sessionId, "string")
			const streamed = await request(`${endpoint}/mcp`, {
				headers: { authorization: "Bearer mcp-token", "mcp-session-id": sessionId },
			})
			assert.equal(streamed.text, `event: endpoint\ndata: ${JSON.stringify({ protocolVersion: "2025-03-26", endpoint: "/mcp" })}\n\n`)
			assert.equal(service.getStatus().mcp.activeSessions, 1)
			assert.equal(service.revokeMcpSessions().activeSessions, 0)

			const apiPort = api.address().port
			const sessionAttempt = await request(`http://127.0.0.1:${apiPort}/mcp`, {
				headers: { authorization: "Bearer mcp-token", "mcp-session-id": sessionId },
			})
			assert.equal(sessionAttempt.status, 401)
		} finally {
			await service.stop()
			await new Promise((resolve) => api.close(resolve))
		}
	})

	it("runs as a second listener inside the real sidecar process", async () => {
		const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-mcp-sidecar-"))
		const messages = []
		let backend
		try {
			const configuredPort = await availablePort()
			backend = await spawnSidecar({
				entry: path.join(repoRoot, "services/backend/index.js"),
				initBody: {
					userDataDir,
					providerKeys: {},
					legacyToken: "mcp-token",
					localHttpConfig: { enabled: true, host: "127.0.0.1", port: configuredPort },
				},
				onMessage: (message) => {
					messages.push(message)
					if (message?.body?.type === "pet.command.request") {
						backend.child.send({
							v: 1,
							id: message.id,
							at: Date.now(),
							body: { type: "pet.command.result", ok: true, result: message.body.payload },
						})
					}
				},
				logger: { info() {}, warn() {}, error() {} },
			})
			const apiHeaders = {
				authorization: `Bearer ${backend.sessionToken}`,
				"content-type": "application/json",
			}
			const initial = await fetch(`${backend.baseUrl}/service/status`, { headers: apiHeaders })
			assert.equal(initial.status, 200)
			const initialState = (await initial.json()).data
			assert.equal(initialState.enabled, true)
			const mcpPort = initialState.port
			assert.equal(mcpPort, configuredPort)
			const apiPort = Number(new URL(backend.baseUrl).port)
			assert.notEqual(mcpPort, apiPort)

			assert.equal((await fetch(`http://127.0.0.1:${mcpPort}/api/pet/say`, {
				method: "POST",
				headers: { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" },
				body: JSON.stringify({ text: "wrong token" }),
			})).status, 401)
			assert.equal((await fetch(`${backend.baseUrl}/service/status`, {
				headers: { authorization: "Bearer mcp-token" },
			})).status, 401)

			const initialized = await fetch(`http://127.0.0.1:${mcpPort}/mcp`, {
				method: "POST",
				headers: { authorization: "Bearer mcp-token", "content-type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
			})
			assert.equal(initialized.status, 200)
			const sessionId = initialized.headers.get("mcp-session-id")
			const revoked = await fetch(`${backend.baseUrl}/service/token/revoke-sessions`, {
				method: "POST",
				headers: apiHeaders,
				body: "{}",
			})
			assert.equal(revoked.status, 200)
			assert.equal((await revoked.json()).data.activeSessions, 0)
			assert.equal((await fetch(`http://127.0.0.1:${mcpPort}/mcp`, {
				headers: { authorization: "Bearer mcp-token", "mcp-session-id": sessionId },
			})).status, 401)

			const said = await fetch(`http://127.0.0.1:${mcpPort}/api/pet/say`, {
				method: "POST",
				headers: { authorization: "Bearer mcp-token", "content-type": "application/json" },
				body: JSON.stringify({ text: "from sidecar" }),
			})
			assert.equal(said.status, 200)
			assert.equal(await said.text(), JSON.stringify({
				ok: true,
				result: { text: "from sidecar", source: "http", sourceSurface: "local-http" },
			}))
			await new Promise((resolve) => setImmediate(resolve))
			assert.equal(messages.some((message) => message?.body?.type === "pet.command.request" && message.body.operation === "say"), true)
		} finally {
			if (backend) await stopSidecar(backend.child)
			fs.rmSync(userDataDir, { recursive: true, force: true })
		}
	})
})
