"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { describe, it } = require("node:test")

describe("T25 plugin routes", () => {
	it("registers every production route row and excludes shell-only capabilities", async () => {
		const [{ createRouter }, routes] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
		])
		const router = createRouter({ basePath: "/api/v1" })
		const plugins = new Proxy({}, { get: () => () => ({}) })
		routes.registerPluginRoutes(router, { plugins })
		assert.deepEqual(router.routes(), routes.PLUGIN_ROUTES.map((entry) => {
			const [method, route] = entry.split(" ")
			return `${method} /api/v1${route}`
		}))
		assert.equal(routes.PLUGIN_ROUTES.length, 20)
		assert.equal(router.routes().some((route) => route.includes("open-dashboard")), false)
		assert.equal(router.routes().some((route) => route.includes("inspect-package")), false)
	})

	it("mechanically covers all 29 real plugin channels: 23 HTTP and 6 IPC", async () => {
		const [{ IPC }, routes] = await Promise.all([
			import("../../apps/desktop/src/shared/ipc-channels.js"),
			import("../../services/backend/routes/plugins.js"),
		])
		const channels = Object.keys(IPC).filter((key) => key.startsWith("PLUGINS_"))
		assert.equal(channels.length, 29)
		assert.deepEqual(routes.PLUGIN_IPC_CHANNELS.slice().sort(), [
			"PLUGINS_CLEAR_IM_GATEWAY_QQ_CREDENTIALS",
			"PLUGINS_CLEAR_IM_GATEWAY_WECOM_CREDENTIALS",
			"PLUGINS_INSPECT_PACKAGE",
			"PLUGINS_OPEN_DASHBOARD",
			"PLUGINS_SAVE_IM_GATEWAY_QQ_CREDENTIALS",
			"PLUGINS_SAVE_IM_GATEWAY_WECOM_CREDENTIALS",
		])
		assert.deepEqual(Object.keys(routes.PLUGIN_CHANNEL_ROUTES).slice().sort(), channels.filter((key) => !routes.PLUGIN_IPC_CHANNELS.includes(key)).sort())
		for (const route of Object.values(routes.PLUGIN_CHANNEL_ROUTES)) assert.ok(routes.PLUGIN_ROUTES.includes(route), route)
	})

	it("dispatches plugin reads, mutations, commands, logs and config through the domain service", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const plugins = {
			list: () => [{ id: "demo" }],
			get: (id) => ({ id, permissions: ["pet:say"] }),
			enqueueJob: (input) => { calls.push(["enqueue", input.kind, input.input]); return { id: "job-1" } },
			remove: async (id, options) => { calls.push(["remove", id, options]); return { ok: true } },
			setEnabled: (id, enabled) => { calls.push(["enabled", id, enabled]); return { id, enabled } },
			start: async (id) => { calls.push(["start", id]); return { id, status: "running" } },
			stop: async (id) => { calls.push(["stop", id]); return { id, status: "stopped" } },
			status: (id) => ({ id, status: "running" }),
			command: async (id, cmd, args) => { calls.push(["command", id, cmd, args]); return { id, cmd } },
			setPermissions: (id, permissions) => { calls.push(["permissions", id, permissions]); return { id, permissions } },
			setNativeExecutionApproved: (id, approved) => { calls.push(["native-approval", id, approved]); return { id, approved } },
			inspectManifest: (source) => ({ source }),
			syncBundled: async () => ({ synced: [] }),
			config: (id) => ({ id, greeting: "hello" }),
			setConfig: (id, config) => ({ id, config }),
			getLogs: (id, query) => [{ id, query }],
			clearLogs: (id) => ({ pluginId: id, deleted: 2 }),
		}
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins })
		const response = (body = {}) => ({ writableEnded: false, setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } })
		const request = async (method, path, body) => {
			const req = { method, url: path, headers: body === undefined ? {} : { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)) } }
			const res = response()
			await router.handle(req, res)
			return res
		}
		assert.equal((await request("GET", "/api/v1/plugins")).body.data.items.length, 1)
		assert.equal((await request("GET", "/api/v1/plugins/demo/status")).body.data.status, "running")
		assert.equal((await request("POST", "/api/v1/plugins/demo/enable", { enabled: true })).body.data.enabled, true)
		assert.equal((await request("POST", "/api/v1/plugins/demo/native-approval", { approved: true })).body.data.approved, true)
		assert.equal((await request("POST", "/api/v1/plugins/demo/commands/run", { value: 1 })).status, 202)
		assert.equal((await request("PUT", "/api/v1/plugins/demo/config", { greeting: "hi" })).body.data.config.greeting, "hi")
		assert.deepEqual(calls, [
			["enabled", "demo", true],
			["native-approval", "demo", true],
			["enqueue", "plugin.command", { pluginId: "demo", command: "run", args: { value: 1 } }],
		])
	})

	it("rejects QQ and WeCom host-secret operations that are intentionally IPC-only", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, {
			plugins: {
				config: (pluginId) => ({ pluginId }),
				setConfig: (pluginId, config) => { calls.push([pluginId, config]); return { pluginId, config } },
			},
		})
		const request = async (method, url, body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method, url, headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		const save = await request("PUT", "/api/v1/plugins/openpet.im-gateway/config?operation=secret-save-wecom", { corpSecret: "secret" })
		const clear = await request("PUT", "/api/v1/plugins/openpet.im-gateway/config?operation=secret-clear-wecom", {})
		const read = await request("GET", "/api/v1/plugins/openpet.im-gateway/config?operation=secret-save-wecom", {})
		const qqSave = await request("PUT", "/api/v1/plugins/openpet.im-gateway/config?operation=secret-qq-save", { appId: "app", clientSecret: "secret" })
		const qqClear = await request("PUT", "/api/v1/plugins/openpet.im-gateway/config?operation=secret-qq-clear", {})
		for (const response of [save, clear, read, qqSave, qqClear]) {
			assert.equal(response.status, 400)
			assert.equal(response.body.error.code, "VALIDATION_FAILED")
		}
		assert.deepEqual(calls, [])
	})

	it("rejects Telegram secret operations addressed to a non-gateway plugin", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			getSecretState: () => { calls.push("state"); return { configured: false } },
			saveSecret: () => { calls.push("save"); return { ok: true } },
			clearSecret: () => { calls.push("clear"); return { ok: true } },
		} })
		const request = async (method, url, body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method, url, headers: body === undefined ? {} : { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		const responses = await Promise.all([
			request("GET", "/api/v1/plugins/demo/config?operation=secret-state"),
			request("PUT", "/api/v1/plugins/demo/config?operation=secret-save", { token: "bot-token" }),
			request("PUT", "/api/v1/plugins/demo/config?operation=secret-clear", {}),
		])
		for (const response of responses) {
			assert.equal(response.status, 400)
			assert.equal(response.body.error.code, "VALIDATION_FAILED")
		}
		assert.deepEqual(calls, [])
	})

	it("rejects unsupported operation queries before dispatching plugin handlers", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			enqueueJob: (input) => { calls.push(["job", input.kind]); return { id: "job" } },
			clearInstallSelection: (selectionId) => { calls.push(["clear-selection", selectionId]); return { ok: true } },
			setEnabled: (pluginId, enabled) => { calls.push(["enabled", pluginId, enabled]); return { pluginId, enabled } },
			start: (pluginId) => { calls.push(["start", pluginId]); return { pluginId } },
			serviceHealth: (pluginId, serviceId) => { calls.push(["health", pluginId, serviceId]); return { pluginId } },
			getLogs: (pluginId) => { calls.push(["logs", pluginId]); return [] },
			exportLogs: (query) => { calls.push(["export-logs", query.pluginId]); return { ok: true } },
			runSetup: (pluginId, setupId) => { calls.push(["setup", pluginId, setupId]); return { ok: true } },
			creatorDefaultFlow: (pluginId) => { calls.push(["creator", pluginId]); return { ok: true } },
		} })
		const request = async (method, url, body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method, url, headers: body === undefined ? {} : { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		const responses = [
			await request("POST", "/api/v1/plugins/install?operation=unsupported", { path: "/missing/plugin" }),
			await request("POST", "/api/v1/plugins/demo/enable?operation=unsupported", { enabled: true }),
			await request("POST", "/api/v1/plugins/demo/start?operation=unsupported"),
			await request("GET", "/api/v1/plugins/demo/logs?operation=unsupported"),
			await request("POST", "/api/v1/plugins/demo/commands/run?operation=unsupported", { value: 1 }),
		]
		for (const response of responses) {
			assert.equal(response.status, 400)
			assert.equal(response.body.error.code, "VALIDATION_FAILED")
		}
		assert.deepEqual(calls, [])
	})

	it("rejects mixed and extra plugin validation fields before inspection", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			inspectGithub: (repositoryUrl) => { calls.push(["github", repositoryUrl]); return { repositoryUrl } },
			inspectManifest: (sourcePath) => { calls.push(["manifest", sourcePath]); return { sourcePath } },
		} })
		const request = async (body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method: "POST", url: "/api/v1/plugins/validate", headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		const responses = await Promise.all([
			request({ path: "/tmp/plugin", repositoryUrl: "https://github.com/example/plugin" }),
			request({ path: "/tmp/plugin", unexpected: true }),
			request({ repositoryUrl: "https://github.com/example/plugin", unexpected: true }),
		])
		for (const response of responses) {
			assert.equal(response.status, 400)
			assert.equal(response.body.error.code, "VALIDATION_FAILED")
		}
		assert.deepEqual(calls, [])
	})

	it("rejects mixed or malformed plugin install input before enqueue", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: { enqueueJob: (input) => { calls.push(input); return { id: "job" } } } })
		const request = async (body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method: "POST", url: "/api/v1/plugins/install", headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		const responses = await Promise.all([
			request({ selectionId: "selection-1", path: "/tmp/plugin" }),
			request({ selectionId: "selection-1", update: "yes" }),
			request({ path: "/tmp/plugin", unexpected: true }),
		])
		for (const response of responses) {
			assert.equal(response.status, 400)
			assert.equal(response.body.error.code, "VALIDATION_FAILED")
		}
		assert.deepEqual(calls, [])
	})

	it("rejects extra GitHub install fields before enqueue", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: { enqueueJob: (input) => { calls.push(input); return { id: "job" } } } })
		const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
		const req = { method: "POST", url: "/api/v1/plugins/install/github", headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ repositoryUrl: "https://github.com/example/plugin", unexpected: true })) } }
		await router.handle(req, res)
		assert.equal(res.status, 400)
		assert.equal(res.body.error.code, "VALIDATION_FAILED")
		assert.deepEqual(calls, [])
	})

	it("rejects extra native approval fields before changing plugin authority", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			setNativeExecutionApproved: (pluginId, approved) => { calls.push([pluginId, approved]); return { pluginId, approved } },
		} })
		const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
		const req = { method: "POST", url: "/api/v1/plugins/demo/native-approval", headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ approved: true, unexpected: "value" })) } }
		await router.handle(req, res)
		assert.equal(res.status, 400)
		assert.equal(res.body.error.code, "VALIDATION_FAILED")
		assert.deepEqual(calls, [])
	})

	it("rejects malformed uninstall removeStorage query values before removal", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			remove: async (...args) => { calls.push(args); return { ok: true } },
		} })
		const request = async (url) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method: "DELETE", url, headers: {}, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() {} }
			await router.handle(req, res)
			return res
		}
		const malformed = await request("/api/v1/plugins/demo?removeStorage=yes")
		assert.equal(malformed.status, 400)
		assert.equal(malformed.body.error.code, "VALIDATION_FAILED")
		assert.deepEqual(calls, [])
		const extra = await request("/api/v1/plugins/demo?removeStorage=false&unexpected=true")
		assert.equal(extra.status, 400)
		assert.equal(extra.body.error.code, "VALIDATION_FAILED")
		assert.deepEqual(calls, [])
		const absent = await request("/api/v1/plugins/demo")
		assert.equal(absent.status, 200)
		assert.deepEqual(calls, [["demo", { removeStorage: false }]])
		const explicit = await request("/api/v1/plugins/demo?removeStorage=true")
		assert.equal(explicit.status, 200)
		assert.deepEqual(calls.at(-1), ["demo", { removeStorage: true }])
	})

	it("validates and forwards plugin log filters without dispatching malformed queries", async () => {
		const [{ createRouter }, { registerPluginRoutes }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		registerPluginRoutes(router, { plugins: {
			getLogs: (pluginId, query) => { calls.push([pluginId, query]); return [] },
			exportLogs: (query) => { calls.push(["export", query]); return "[]" },
		} })
		const request = async (url) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method: "GET", url, headers: {}, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() {} }
			await router.handle(req, res)
			return res
		}
		const invalidLevel = await request("/api/v1/plugins/demo/logs?level=debug")
		const invalidFormat = await request("/api/v1/plugins/demo/logs?operation=export&format=xml")
		const duplicateLevel = await request("/api/v1/plugins/demo/logs?level=info&level=error")
		assert.equal(invalidLevel.status, 400)
		assert.equal(invalidFormat.status, 400)
		assert.equal(duplicateLevel.status, 400)
		assert.equal(duplicateLevel.body.error.code, "VALIDATION_FAILED")
		assert.equal(Object.hasOwn(invalidLevel.body.error, "details"), false)
		assert.deepEqual(calls, [])
		const valid = await request("/api/v1/plugins/demo/logs?level=error&query=network&page=1&pageSize=1000")
		assert.equal(valid.status, 200)
		assert.deepEqual(calls, [["demo", { level: "error", query: "network", page: 1, pageSize: 1000 }]])
	})

	it("rejects undeclared query fields before clearing plugin logs", async () => {
		const [{ createRouter }, { registerPluginRoutes }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		registerPluginRoutes(router, { plugins: { clearLogs: (pluginId) => { calls.push(pluginId); return { deleted: 1 } } } })
		const request = async (url) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method: "DELETE", url, headers: {}, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() {} }
			await router.handle(req, res)
			return res
		}
		const invalid = await request("/api/v1/plugins/demo/logs?unexpected=true")
		assert.equal(invalid.status, 400)
		assert.equal(invalid.body.error.code, "VALIDATION_FAILED")
		assert.deepEqual(calls, [])
		const valid = await request("/api/v1/plugins/demo/logs")
		assert.equal(valid.status, 200)
		assert.deepEqual(calls, ["demo"])
	})

	it("accepts bodyless restart and command calls while rejecting sync payload fields", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			restart: async (pluginId) => { calls.push(["restart", pluginId]); return { pluginId, status: "running" } },
			enqueueJob: (input) => { calls.push(["job", input]); return { id: "job-1" } },
		} })
		const request = async (method, url, body, hasBody = body !== undefined) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method, url, headers: hasBody ? { "content-type": "application/json" } : {}, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { if (hasBody) yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		const restart = await request("POST", "/api/v1/plugins/demo/restart", undefined, false)
		const command = await request("POST", "/api/v1/plugins/demo/commands/ping", undefined, false)
		const invalidSync = await request("POST", "/api/v1/plugins/sync-bundled", { unexpected: true })
		assert.equal(restart.status, 200)
		assert.equal(command.status, 202)
		assert.equal(invalidSync.status, 400)
		assert.deepEqual(calls[0], ["restart", "demo"])
		assert.equal(calls[1][0], "job")
		assert.equal(calls[1][1].kind, "plugin.command")
		assert.deepEqual(calls[1][1].input, { pluginId: "demo", command: "ping", args: {} })
		assert.equal(calls[1][1].resourceKey, "plugin:demo")
	})

	it("rejects extra fields on plugin secret and service policy operations", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			saveSecret: (...args) => { calls.push(["secret-save", args]); return { ok: true } },
			clearSecret: (...args) => { calls.push(["secret-clear", args]); return { ok: true } },
			clearStorage: (...args) => { calls.push(["storage-clear", args]); return { ok: true } },
			saveServiceHealthPolicy: (...args) => { calls.push(["health-policy", args]); return { ok: true } },
		} })
		const request = async (method, url, body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method, url, headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		const responses = await Promise.all([
			request("PUT", "/api/v1/plugins/demo/config?operation=secret-save", { token: "secret", unexpected: true }),
			request("PUT", "/api/v1/plugins/demo/config?operation=secret-clear", { unexpected: true }),
			request("PUT", "/api/v1/plugins/demo/config?operation=storage-clear", { unexpected: true }),
			request("PUT", "/api/v1/plugins/demo/config?operation=health-policy", { serviceId: "svc", policy: { enabled: true }, unexpected: true }),
		])
		for (const response of responses) {
			assert.equal(response.status, 400)
			assert.equal(response.body.error.code, "VALIDATION_FAILED")
		}
		assert.deepEqual(calls, [])
		const validResponses = await Promise.all([
			request("PUT", "/api/v1/plugins/openpet.im-gateway/config?operation=secret-save", { token: "secret" }),
			request("PUT", "/api/v1/plugins/openpet.im-gateway/config?operation=secret-clear", {}),
			request("PUT", "/api/v1/plugins/demo/config?operation=storage-clear", {}),
			request("PUT", "/api/v1/plugins/demo/config?operation=health-policy", { serviceId: "svc", policy: { enabled: true } }),
		])
		assert.ok(validResponses.every((response) => response.status === 200))
		assert.deepEqual(calls, [
			["secret-save", ["openpet.im-gateway", "secret"]],
			["secret-clear", ["openpet.im-gateway"]],
			["storage-clear", ["demo"]],
			["health-policy", ["demo", "svc", { enabled: true }]],
		])
	})

	it("awaits reverse-channel production operations before serializing HTTP responses", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const plugins = {
			runSetup: async (pluginId, setupId) => { calls.push(["setup", pluginId, setupId]); return { ok: true, setupId } },
			creatorDefaultFlow: async (pluginId, prompt) => { calls.push(["creator", pluginId, prompt]); return { ok: true, prompt } },
			getSecretState: async () => ({ configured: true }),
			saveSecret: async (pluginId, token) => ({ ok: true, pluginId, tokenChars: token.length }),
			clearSecret: async () => ({ ok: true }),
			saveQqCredentials: async (pluginId, credentials) => ({ ok: true, pluginId, credentialKeys: Object.keys(credentials).sort() }),
			clearQqCredentials: async () => ({ ok: true }),
			clearStorage: async (pluginId) => ({ ok: true, pluginId }),
			saveServiceHealthPolicy: async (pluginId, serviceId, policy) => ({ ok: true, pluginId, serviceId, policy }),
			config: (id) => ({ id }),
			setConfig: (id, config) => ({ id, config }),
		}
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins })
		const request = async (method, url, body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method, url, headers: body === undefined ? {} : { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		assert.deepEqual((await request("POST", "/api/v1/plugins/demo/commands/install?operation=setup", {})).body.data, { ok: true, setupId: "install" })
		assert.deepEqual((await request("POST", "/api/v1/plugins/demo/commands/run?operation=creator-default-flow", { prompt: "hello" })).body.data, { ok: true, prompt: "hello" })
		assert.deepEqual((await request("GET", "/api/v1/plugins/openpet.im-gateway/config?operation=secret-state")).body.data, { configured: true })
		assert.deepEqual((await request("PUT", "/api/v1/plugins/openpet.im-gateway/config?operation=secret-save", { token: "secret" })).body.data, { ok: true, pluginId: "openpet.im-gateway", tokenChars: 6 })
		assert.deepEqual((await request("PUT", "/api/v1/plugins/demo/config?operation=storage-clear", {})).body.data, { ok: true, pluginId: "demo" })
		assert.deepEqual(calls, [["setup", "demo", "install"], ["creator", "demo", "hello"]])
	})

	it("awaits GitHub repository inspection before serializing validation response", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const expected = { selectionId: "github-selection", manifest: { id: "remote-demo" }, canceled: false }
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: { inspectGithub: async () => {
			await new Promise((resolve) => setImmediate(resolve))
			return expected
		} } })
		const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
		const req = { method: "POST", url: "/api/v1/plugins/validate", headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ repositoryUrl: "https://github.com/example/plugin" })) } }
		await router.handle(req, res)
		assert.equal(res.status, 200)
		assert.deepEqual(res.body.data, expected)
	})

	it("maps long-running install and bundled-sync operations to the contract Job kinds", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const jobs = []
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t31-route-"))
		const localPath = path.join(root, "plugin")
		fs.mkdirSync(localPath)
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			inspectManifest: () => ({ manifest: { id: "local-demo" } }),
			enqueueJob: (input) => { jobs.push(input); return { id: input.id } },
		} })
		const request = async (url, body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method: "POST", url, headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		try {
			assert.equal((await request("/api/v1/plugins/install", { path: localPath })).status, 202)
			assert.equal((await request("/api/v1/plugins/install", { selectionId: "install-selection" })).status, 202)
			assert.equal((await request("/api/v1/plugins/install", { selectionId: "update-selection", update: true })).status, 202)
			assert.equal((await request("/api/v1/plugins/install/github", { repositoryUrl: "https://github.com/example/plugin" })).status, 202)
			assert.equal((await request("/api/v1/plugins/sync-bundled", {})).status, 202)
			assert.deepEqual(jobs.map(({ kind, input, privateInput }) => ({ kind, input, privateInput })), [
				{
					kind: "plugin.install",
					input: { path: localPath, pluginId: "local-demo" },
					privateInput: { path: localPath, pluginId: "local-demo" },
				},
				{
					kind: "plugin.install",
					input: { selectionId: "install-selection", update: false },
					privateInput: { selectionId: "install-selection", update: false },
				},
				{
					kind: "plugin.install",
					input: { selectionId: "update-selection", update: true },
					privateInput: { selectionId: "update-selection", update: true },
				},
				{
					kind: "plugin.install.github",
					input: { repositoryUrl: "https://github.com/example/plugin" },
					privateInput: { repositoryUrl: "https://github.com/example/plugin" },
				},
				{ kind: "plugin.sync-bundled", input: {}, privateInput: undefined },
			])
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	})

	it("defers ZIP package inspection to the Job and leaves resource locking unset", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t31-route-zip-"))
		const archivePath = path.join(root, "plugin.openpet-plugin.zip")
		fs.writeFileSync(archivePath, "zip payload")
		const jobs = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			enqueueJob: (input) => { jobs.push(input); return { id: input.id } },
		} })
		const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
		const req = { method: "POST", url: "/api/v1/plugins/install", headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ path: archivePath })) } }
		try {
			await router.handle(req, res)
			assert.equal(res.status, 202)
			assert.deepEqual(jobs.map(({ kind, input, resourceKey, privateInput }) => ({ kind, input, resourceKey, privateInput })), [
				{ kind: "plugin.install", input: { path: archivePath }, resourceKey: null, privateInput: { path: archivePath } },
			])
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	})

	it("locks duplicate local installs through the real route, queue, and repository", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }, { inspectPluginManifest, publicManifestInspection }, { openDatabase }, { migrate }, { createJobsRepository }, { createQueue }, { createJobDispatcher }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
			import("../../services/backend/domains/plugins/manifest.js"),
			import("../../services/backend/store/db.js"),
			import("../../services/backend/store/migrate.js"),
			import("../../services/backend/store/repositories/jobs.js"),
			import("../../services/backend/jobs/queue.js"),
			import("../../services/backend/jobs/dispatcher.js"),
		])
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t31-route-lock-"))
		const pluginPath = path.join(root, "plugin")
		fs.mkdirSync(pluginPath)
		fs.writeFileSync(path.join(pluginPath, "plugin.json"), JSON.stringify({ id: "route-demo", name: "Route Demo", version: "1.0.0", main: "index.js" }))
		fs.writeFileSync(path.join(pluginPath, "index.js"), "module.exports = {}\n")
		const db = await openDatabase({ file: ":memory:" })
		migrate({ db })
		const jobs = createJobsRepository({ db })
		const queue = createQueue({ repo: jobs, tickMs: 60_000 })
		const runner = { run: () => Promise.resolve() }
		const dispatcher = createJobDispatcher({ queue, runner })
		const plugins = {
			inspectManifest: (source) => publicManifestInspection(inspectPluginManifest(source)),
			enqueueJob: dispatcher,
		}
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins })
		const request = async () => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method: "POST", url: "/api/v1/plugins/install", headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ path: pluginPath })) } }
			await router.handle(req, res)
			return res
		}
		try {
			const first = await request()
			assert.equal(first.status, 202)
			const second = await request()
			assert.equal(second.status, 423)
			assert.equal(second.body.error.code, "LOCKED")
			assert.equal(second.body.error.details.resourceKey, "plugin:route-demo")
		} finally {
			queue.stop()
			db.close()
			fs.rmSync(root, { recursive: true, force: true })
		}
	})

	it("canonicalizes GitHub installs and locks equivalent repository URLs", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }, { openDatabase }, { migrate }, { createJobsRepository }, { createQueue }, { createJobDispatcher }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
			import("../../services/backend/store/db.js"),
			import("../../services/backend/store/migrate.js"),
			import("../../services/backend/store/repositories/jobs.js"),
			import("../../services/backend/jobs/queue.js"),
			import("../../services/backend/jobs/dispatcher.js"),
		])
		const db = await openDatabase({ file: ":memory:" })
		migrate({ db })
		const jobs = createJobsRepository({ db })
		const queue = createQueue({ repo: jobs, tickMs: 60_000 })
		const dispatcher = createJobDispatcher({ queue, runner: { run: () => Promise.resolve() } })
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: { enqueueJob: dispatcher } })
		const request = async (repositoryUrl) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method: "POST", url: "/api/v1/plugins/install/github", headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ repositoryUrl })) } }
			await router.handle(req, res)
			return res
		}
		try {
			const first = await request("https://github.com/OpenPet/Demo/")
			assert.equal(first.status, 202)
			const firstJob = jobs.byId(first.body.data.jobId)
			assert.equal(firstJob.resourceKey, "github:openpet/demo")
			assert.deepEqual(firstJob.input, { redacted: true, summary: "plugin.install.github" })
			const second = await request("https://github.com/openpet/demo")
			assert.equal(second.status, 423)
			assert.equal(second.body.error.code, "LOCKED")
			assert.equal(second.body.error.details.resourceKey, "github:openpet/demo")
			const invalid = await request("https://github.com/openpet/demo/tree/main")
			assert.equal(invalid.status, 400)
			assert.equal(invalid.body.error.code, "VALIDATION_FAILED")
		} finally {
			queue.stop()
			db.close()
		}
	})

	it("rejects unsafe dashboard/window and filesystem-shaped route arguments", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		const plugins = { install: () => { throw new Error("must not be called") } }
		registerPluginRoutes(router, { plugins })
		const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
		const req = { method: "POST", url: "/api/v1/plugins/install", headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ preload: "/tmp/x", webPreferences: { nodeIntegration: true } })) } }
		await router.handle(req, res)
		assert.equal(res.status, 400)
		assert.equal(res.body.error.code, "VALIDATION_FAILED")
	})

	it("preserves plugin manifest and native-approval business errors", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { ApiError, jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			inspectManifest: () => { throw new ApiError("PLUGIN_MANIFEST_INVALID", "invalid manifest", { status: 400 }) },
			start: () => { throw new ApiError("PLUGIN_NATIVE_NOT_APPROVED", "native approval required", { status: 403 }) },
		} })
		const request = async (url, body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method: "POST", url, headers: body === undefined ? {} : { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		const manifest = await request("/api/v1/plugins/validate", { path: "/tmp/plugin" })
		assert.equal(manifest.status, 400)
		assert.equal(manifest.body.error.code, "PLUGIN_MANIFEST_INVALID")
		const native = await request("/api/v1/plugins/demo/start")
		assert.equal(native.status, 403)
		assert.equal(native.body.error.code, "PLUGIN_NATIVE_NOT_APPROVED")
	})

	it("covers every accepted plugin operation branch and maps missing services", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: {
			get: (id) => ({ id, permissions: ["pet:say"] }),
			setEnabled: async (...args) => { calls.push(["enabled", ...args]); return { ok: true } },
			clearStorage: async (...args) => { calls.push(["storage", ...args]); return { ok: true } },
			serviceStart: async (...args) => { calls.push(["service-start", ...args]); return { ok: true } },
			serviceStop: async (...args) => { calls.push(["service-stop", ...args]); return { ok: true } },
			serviceHealth: async (...args) => { calls.push(["health", ...args]); return { ok: true } },
			status: () => ({ status: "running" }),
			stop: async (id) => { calls.push(["stop", id]); return { ok: true } },
			start: async (id) => { calls.push(["start", id]); return { ok: true } },
			exportLogs: (query) => { calls.push(["export", query]); return "id,pluginId\n" },
			runSetup: async (...args) => { calls.push(["setup", ...args]); return { ok: true } },
			creatorDefaultFlow: async (...args) => { calls.push(["creator", ...args]); return { ok: true } },
			permissions: (id) => { calls.push(["permissions-get", id]); return ["pet:say"] },
			setPermissions: (id, permissions) => { calls.push(["permissions-set", id, permissions]); return { permissions } },
			enqueueJob: (input) => { calls.push(["job", input.kind]); return { id: `job-${input.kind}` } },
			config: (id) => { calls.push(["config-get", id]); return { id } },
			setConfig: (id, config) => { calls.push(["config-set", id, config]); return { id, config } },
		} })
		const request = async (method, url, body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = data ? JSON.parse(data) : null; this.writableEnded = true } }
			const hasBody = body !== undefined
			const req = { method, url, headers: hasBody ? { "content-type": "application/json" } : {}, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { if (hasBody) yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		assert.equal((await request("POST", "/api/v1/plugins/demo/enable?operation=storage-clear", {})).status, 200)
		assert.equal((await request("POST", "/api/v1/plugins/demo/start", { serviceId: "svc" })).status, 200)
		assert.equal((await request("POST", "/api/v1/plugins/demo/start?operation=health", { serviceId: "svc" })).status, 200)
		assert.equal((await request("POST", "/api/v1/plugins/demo/stop", { serviceId: "svc" })).status, 200)
		assert.equal((await request("POST", "/api/v1/plugins/demo/restart")).status, 200)
		assert.equal((await request("GET", "/api/v1/plugins/demo/logs?operation=export&format=csv")).status, 200)
		assert.equal((await request("POST", "/api/v1/plugins/demo/commands/setup?operation=setup", {})).status, 200)
		assert.equal((await request("POST", "/api/v1/plugins/demo/commands/create?operation=creator-default-flow", { prompt: "hello" })).status, 200)
		assert.equal((await request("GET", "/api/v1/plugins/demo/permissions")).status, 200)
		assert.equal((await request("PUT", "/api/v1/plugins/demo/permissions", { permissions: ["pet:say"] })).status, 200)
		assert.equal((await request("POST", "/api/v1/plugins/sync-bundled", {})).status, 202)
		assert.equal((await request("GET", "/api/v1/plugins/demo/config")).status, 200)
		assert.equal((await request("PUT", "/api/v1/plugins/demo/config", { greeting: "hello" })).status, 200)
		assert.deepEqual(calls, [
			["storage", "demo"],
			["service-start", "demo", "svc"],
			["health", "demo", "svc"],
			["service-stop", "demo", "svc"],
			["stop", "demo"], ["start", "demo"],
			["export", { format: "csv", pluginId: "demo" }],
			["setup", "demo", "setup"],
			["creator", "demo", "hello"],
			["permissions-get", "demo"],
			["permissions-set", "demo", ["pet:say"]],
			["job", "plugin.sync-bundled"],
			["config-get", "demo"],
			["config-set", "demo", { greeting: "hello" }],
		])

		const unavailableRouter = createRouter({ basePath: "/api/v1" })
		registerPluginRoutes(unavailableRouter, { plugins: {} })
		const unavailable = await new Promise(async (resolve) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); resolve(this) } }
			const req = { method: "GET", url: "/api/v1/plugins", headers: {}, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() {} }
			await unavailableRouter.handle(req, res)
		})
		assert.equal(unavailable.status, 503)
		assert.equal(unavailable.body.error.code, "BACKEND_UNAVAILABLE")
		assert.equal(unavailable.body.error.retryable, true)
	})
})
