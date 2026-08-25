"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

describe("T25 plugin routes", () => {
	it("registers the 20 route rows from §4.7 and excludes shell-only capabilities", async () => {
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
			setNativeExecutionApproved: (id, approved) => ({ id, approved }),
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
		assert.equal((await request("POST", "/api/v1/plugins/demo/commands/run", { value: 1 })).status, 202)
		assert.equal((await request("PUT", "/api/v1/plugins/demo/config", { greeting: "hi" })).body.data.config.greeting, "hi")
		assert.deepEqual(calls, [
			["enabled", "demo", true],
			["enqueue", "plugin.command", { pluginId: "demo", command: "run", args: { value: 1 } }],
		])
	})

	it("maps long-running install and bundled-sync operations to the contract Job kinds", async () => {
		const [{ createRouter }, { registerPluginRoutes }, { jsonBody }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/plugins.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const jobs = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(jsonBody())
		registerPluginRoutes(router, { plugins: { enqueueJob: (input) => { jobs.push(input); return { id: input.id } } } })
		const request = async (url, body) => {
			const res = { writableEnded: false, setHeader() {}, writeHead(status) { this.status = status }, end(data) { this.body = JSON.parse(data); this.writableEnded = true } }
			const req = { method: "POST", url, headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) } }
			await router.handle(req, res)
			return res
		}
		assert.equal((await request("/api/v1/plugins/install", { path: "/tmp/plugin" })).status, 202)
		assert.equal((await request("/api/v1/plugins/install/github", { repositoryUrl: "https://github.com/example/plugin" })).status, 202)
		assert.equal((await request("/api/v1/plugins/sync-bundled", {})).status, 202)
		assert.deepEqual(jobs.map(({ kind, input }) => ({ kind, input })), [
			{ kind: "plugin.install", input: { path: "/tmp/plugin" } },
			{ kind: "plugin.install.github", input: { repositoryUrl: "https://github.com/example/plugin" } },
			{ kind: "plugin.sync-bundled", input: {} },
		])
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
})
