"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const ROOT = path.resolve(__dirname, "../..")
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8")

test("Service pane uses the HTTP facade for migrated service operations", () => {
	const source = read("apps/control-center/src/hooks/useServicePane.ts")
	assert.match(source, /features\/service\/api/)
	assert.doesNotMatch(source, /controlCenterAPI as api/)
})

test("Service HTTP facade targets the registered Backend routes", () => {
	const source = read("apps/control-center/src/features/service/api.ts")
	for (const route of [
		"/service/status",
		"/service/logs",
		"/service/config",
		"/service/token/rotate",
		"/service/token/revoke-sessions"
	]) assert.match(source, new RegExp(route.replaceAll("/", "\\/")))
})

test("Service HTTP facade preserves query filters and write semantics", async () => {
	const { createServiceHttpApi } = await import("../../apps/control-center/src/features/service/api.ts")
	const calls = []
	const client = {
		request: async (input) => {
			calls.push(input)
			if (input.path.startsWith("/service/logs")) return { entries: [], page: 1, pageSize: 50, total: 0, totalPages: 1 }
			if (input.path === "/service/logs?operation=export&format=json") return "[]"
			return { config: {}, runtime: { mcp: { activeSessions: 0, sessionTtlMs: 0 } } }
		}
	}
	const api = createServiceHttpApi(client)
	await api.getLogs({ page: 2, pageSize: 25, status: "401" })
	await api.revokeMcpSessions()
	await api.exportLogs({ format: "json" })
	assert.equal(calls[0].path, "/service/logs?page=2&pageSize=25&status=401")
	assert.deepEqual({ method: calls[1].method, path: calls[1].path, body: calls[1].body, retry: calls[1].retry }, {
		method: "POST", path: "/service/token/revoke-sessions", body: {}, retry: false
	})
	assert.equal(calls[2].path, "/service/logs?operation=export&format=json")
})

test("MCP revoke service operation has no legacy preload or registrar reachability", () => {
	const preload = read("apps/desktop/control-center-preload.js")
	const channels = read("apps/desktop/src/shared/ipc-channels.ts")
	const registrar = read("apps/desktop/src/ipc/register-service-ipc.js")
	const pane = read("apps/control-center/src/hooks/useServicePane.ts")
	assert.doesNotMatch(preload, /SERVICE_REVOKE_MCP_SESSIONS|revokeMcpSessions.*ipcRenderer/)
	assert.doesNotMatch(channels, /SERVICE_REVOKE_MCP_SESSIONS/)
	assert.doesNotMatch(registrar, /SERVICE_REVOKE_MCP_SESSIONS/)
	assert.match(pane, /serviceHttpApi as api/)
})

