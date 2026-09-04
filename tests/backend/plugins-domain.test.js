"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

let createPluginService
let createInitializedPluginService
let createSettingsStore
let ApiError
let initializeBackendRuntime
let createSettingsMutationCoordinator
let createSettingsMutationAuthority

test.before(async () => {
	;({ createPluginService, createInitializedPluginService } = await import("../../services/backend/domains/plugins/index.js"))
	;({ createSettingsStore } = await import("../../services/backend/domains/settings.js"))
	;({ ApiError } = await import("../../services/backend/http/middleware.js"))
	;({ initializeBackendRuntime } = await import("../../services/backend/routes/health.js"))
	;({ createSettingsMutationCoordinator, createSettingsMutationAuthority } = await import("../../services/backend/routes/settings.js"))
})

function fixture(root, manifest) {
	const pluginDir = path.join(root, manifest.id)
	fs.mkdirSync(pluginDir, { recursive: true })
	fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest))
	if (manifest.main) fs.writeFileSync(path.join(pluginDir, manifest.main), "module.exports = {}\n")
	return pluginDir
}

function createHarness(manifest, { mutationAuthority } = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-backend-plugin-"))
	const userDataDir = path.join(root, "user-data")
	fs.mkdirSync(userDataDir, { recursive: true })
	const sourceRoot = path.join(root, "source")
	fs.mkdirSync(sourceRoot, { recursive: true })
	const source = fixture(sourceRoot, manifest)
	const settings = createSettingsStore({ file: path.join(userDataDir, "backend", "settings.json") })
	const events = []
	const logs = []
	const lifecycle = []
	const bridge = {
		start: async ({ plugin }) => lifecycle.push(["start", plugin.id]),
		stop: async ({ plugin }) => lifecycle.push(["stop", plugin.id]),
		command: async ({ plugin, name, args }) => ({ pluginId: plugin.id, name, args }),
	}
	const service = createPluginService({
		root: path.resolve(__dirname, "../.."),
		userDataDir,
		settings,
		mutationAuthority,
		logs: { appendPlugin: () => assert.fail("T24 must not write plugin runtime logs") },
		logger: {
			info: (message, details) => logs.push({ level: "info", message, details }),
			error: (message, details) => logs.push({ level: "error", message, details }),
		},
		bridge,
		emit: (name, payload) => events.push({ name, payload }),
	})
	return { root, userDataDir, source, settings, service, events, logs, lifecycle, bridge }
}

test("plugin settings mutation uses the shared authority during a pending HTTP host apply", async () => {
	const harness = createHarness({
		id: "authority-demo", name: "Authority Demo", version: "1.0.0",
		configSchema: "config.json", main: "index.js",
	}, {})
	fs.writeFileSync(path.join(harness.source, "config.json"), JSON.stringify({ type: "object", properties: { greeting: { type: "string", default: "hi" } } }))
	const coordinator = createSettingsMutationCoordinator({ emit: (name, payload) => harness.events.push({ name, payload }) })
	const authority = createSettingsMutationAuthority({ store: harness.settings, coordinator })
	const service = createPluginService({
		root: path.resolve(__dirname, "../.."), userDataDir: harness.userDataDir,
		settings: harness.settings, mutationAuthority: authority,
		logs: { appendPlugin: () => {} }, logger: {}, bridge: harness.bridge,
		emit: (name, payload) => harness.events.push({ name, payload }),
	})
	await service.install(harness.source)
	harness.events.length = 0
	const initialVersion = harness.settings.read().version
	let releaseHost
	const hostPending = new Promise((resolve) => { releaseHost = resolve })
	const httpApply = coordinator.runHttp(async () => {
		const current = harness.settings.read()
		const httpMutation = authority.patch({ ifVersion: current.version, patch: { scale: 1.5 } }, { publish: false })
		await hostPending
		const deferred = coordinator.consumeDeferredEvents()
		return { httpMutation, deferred }
	})
	await new Promise((resolve) => setImmediate(resolve))
	assert.deepEqual(service.setConfig("authority-demo", { greeting: "hello" }), { greeting: "hello" })
	releaseHost()
	const settled = await httpApply
	const finalVersion = harness.settings.read().version
	assert.equal(finalVersion, initialVersion + 2)
	assert.deepEqual(settled.deferred, [["settings.changed", { paths: ["plugins.config"], version: finalVersion }]])
	assert.equal(settled.httpMutation.version, initialVersion + 1)
	harness.events.push(["settings.changed", { paths: ["scale", "plugins.config"], version: finalVersion }])
	assert.equal(harness.events.at(-1)[1].version, finalVersion)
})

test("plugin domain rejects invalid manifests with the dedicated 400 error", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-plugin-invalid-"))
	const manifestPath = path.join(root, "plugin.json")
	fs.writeFileSync(manifestPath, JSON.stringify({ id: "bad" }))
	const harness = createHarness({ id: "valid", name: "Valid", version: "1.0.0", main: "index.js" })
	assert.throws(
		() => harness.service.inspectManifest(manifestPath),
		(error) => error.code === "PLUGIN_MANIFEST_INVALID" && error.status === 400,
	)
})

test("plugin install normalizes inspection errors as invalid manifests", async () => {
	const harness = createHarness({ id: "valid", name: "Valid", version: "1.0.0", main: "index.js" })
	const invalidSource = {
		get selectionId() {
			throw new ApiError("VALIDATION_FAILED", "invalid plugin source")
		},
	}
	await assert.rejects(
		() => harness.service.install(invalidSource),
		(error) => error.code === "PLUGIN_MANIFEST_INVALID" && error.status === 400,
	)
})

test("plugin initialization failure degrades startup and still binds", async () => {
	const error = Object.assign(new Error("plugin init failed"), { code: "PLUGIN_INIT_FAILED" })
	const runtime = { degraded: false, degradedReason: null, plugins: null }
	const calls = []
	const sent = []
	const result = await initializeBackendRuntime({
		runtime,
		userDataDir: "/tmp/openpet-plugin-init-test",
		shell: { send: (message) => sent.push(message) },
		deps: {
			createSettingsStore: () => ({}),
			openDatabase: async () => ({ driverName: "fake" }),
			migrate: () => {},
			createJobsRepository: () => ({}),
			createLogsRepository: () => ({}),
			recoverJobs: () => ({}),
			initializePlugins: () => {
				calls.push("plugins")
				throw error
			},
		},
		bind: async () => calls.push("bind"),
	})
	assert.deepEqual(calls, ["plugins", "bind"])
	assert.equal(result.degraded, true)
	assert.equal(runtime.degradedReason, "PLUGIN_INIT_FAILED")
	assert.deepEqual(sent, [{ type: "degraded", reason: "PLUGIN_INIT_FAILED" }])
})

test("plugin PID cleanup runs before opening the backend store", async () => {
	const calls = []
	const runtime = { degraded: false, degradedReason: null, plugins: null }
	await initializeBackendRuntime({
		runtime,
		userDataDir: "/tmp/openpet-plugin-order-test",
		shell: { send: () => {} },
		deps: {
			beforeStore: () => calls.push("beforeStore"),
			createSettingsStore: () => { calls.push("settings"); return {} },
			openDatabase: async () => { calls.push("open"); return { driverName: "fake" } },
			migrate: () => calls.push("migrate"),
			createJobsRepository: () => { calls.push("jobs"); return {} },
			createLogsRepository: () => { calls.push("logs"); return {} },
			recoverJobs: () => { calls.push("recover"); return {} },
			initializePlugins: () => { calls.push("plugins"); return {} },
		},
		bind: async () => calls.push("bind"),
	})
	assert.deepEqual(calls, ["beforeStore", "settings", "open", "migrate", "jobs", "logs", "recover", "plugins", "bind"])
})

test("initialized plugin service synchronizes bundled plugins before returning", () => {
	const harness = createHarness({ id: "temporary", name: "Temporary", version: "1.0.0", main: "index.js" })
	const authorityCalls = []
	const mutationAuthority = {
		patch(request) {
			authorityCalls.push(request)
			return harness.settings.patch(request)
		},
	}
	const initialized = createInitializedPluginService({
		root: path.resolve(__dirname, "../.."),
		userDataDir: harness.userDataDir,
		settings: harness.settings,
		mutationAuthority,
		bridge: harness.bridge,
	})
	assert.deepEqual(initialized.list().map((plugin) => plugin.id).sort(), [
		"openpet.agent-awareness",
		"openpet.creator-studio",
		"openpet.im-gateway",
	])
	assert.ok(authorityCalls.length > 0)
	assert.ok(authorityCalls.every((request) => Object.keys(request.patch).every((path) => path.startsWith("plugins."))))
})

test("plugin domain installs, configures, starts, rejects duplicate start, and stops", async () => {
	const harness = createHarness({
		id: "native-demo",
		name: "Native Demo",
		version: "1.0.0",
		configSchema: "config.json",
		entries: { commands: [{ id: "hello", command: "node hello.js" }], services: [], setup: [], dashboards: [] },
	})
	fs.writeFileSync(path.join(harness.source, "config.json"), JSON.stringify({ type: "object", properties: { greeting: { type: "string", default: "hi" } } }))
	fs.writeFileSync(path.join(harness.source, "hello.js"), "")
	const installed = await harness.service.install(harness.source)
	assert.equal(installed.id, "native-demo")
	assert.equal(installed.enabled, false)
	assert.equal(harness.service.config("native-demo").greeting, "hi")
	assert.deepEqual(harness.service.setConfig("native-demo", { greeting: "hello" }), { greeting: "hello" })
	await assert.rejects(
		() => harness.service.start("native-demo"),
		(error) => error.code === "PLUGIN_NATIVE_NOT_APPROVED" && error.status === 403,
	)

	const current = harness.settings.read()
	harness.settings.patch({ ifVersion: current.version, patch: { "plugins.nativeExecutionApproved": { "native-demo": true } } })
	await harness.service.start("native-demo")
	delete harness.bridge.start
	await assert.rejects(
		() => harness.service.start("native-demo"),
		(error) => error.code === "PLUGIN_ALREADY_RUNNING" && error.status === 409,
	)
	assert.equal(harness.service.status("native-demo").status, "running")
	assert.deepEqual(await harness.service.command("native-demo", "hello", { value: 1 }), {
		pluginId: "native-demo", name: "hello", args: { value: 1 },
	})
	await harness.service.stop("native-demo")
	assert.equal(harness.service.status("native-demo").status, "stopped")
	assert.deepEqual(harness.lifecycle, [["start", "native-demo"], ["stop", "native-demo"]])
	assert.ok(harness.events.some((event) => event.name === "plugin.status-changed"))
	assert.ok(harness.logs.some((entry) => entry.message === "Plugin started"))
	assert.deepEqual(await harness.service.remove("native-demo"), {
		ok: true, pluginId: "native-demo", storageRemoved: false,
	})
	assert.equal(harness.service.list().some((plugin) => plugin.id === "native-demo"), false)
})

test("plugin lifecycle serializes concurrent start and stop and continues stopAll after failures", async () => {
	const harness = createHarness({ id: "race", name: "Race", version: "1.0.0", main: "index.js" })
	await harness.service.install(harness.source)
	let releaseStart
	harness.bridge.start = () => new Promise((resolve) => { releaseStart = resolve })
	const starting = harness.service.start("race")
	const duplicate = assert.rejects(() => harness.service.start("race"), (error) => error.code === "PLUGIN_ALREADY_RUNNING")
	await new Promise((resolve) => setImmediate(resolve))
	const stopping = harness.service.stop("race")
	releaseStart()
	await Promise.all([starting, duplicate, stopping])
	assert.equal(harness.service.status("race").status, "stopped")

	const secondSource = fixture(path.join(harness.root, "second-source"), {
		id: "second", name: "Second", version: "1.0.0", main: "index.js",
	})
	await harness.service.install(secondSource)
	harness.bridge.start = async () => {}
	await harness.service.start("race")
	await harness.service.start("second")
	const stopped = []
	harness.bridge.stop = async ({ plugin }) => {
		stopped.push(plugin.id)
		if (plugin.id === "race") throw new Error("stop failed")
	}
	const result = await harness.service.stopAll()
	assert.equal(result.ok, false)
	assert.deepEqual(stopped.sort(), ["race", "second"])
	assert.equal(harness.service.status("second").status, "stopped")
})

test("failed stop disables the plugin and blocks commands", async () => {
	const harness = createHarness({
		id: "failed-stop", name: "Failed Stop", version: "1.0.0", main: "index.js",
	})
	await harness.service.install(harness.source)
	harness.settings.patch({
		ifVersion: harness.settings.read().version,
		patch: { "plugins.nativeExecutionApproved": { "failed-stop": true } },
	})
	await harness.service.start("failed-stop")
	const commandCalls = []
	harness.bridge.command = async (...args) => { commandCalls.push(args); return { ok: true } }
	harness.bridge.stop = async () => { throw new Error("stop failed") }
	await assert.rejects(() => harness.service.stop("failed-stop"), /stop failed/)
	assert.equal(harness.service.status("failed-stop").status, "failed")
	assert.equal(harness.service.get("failed-stop").enabled, false)
	await assert.rejects(
		() => harness.service.command("failed-stop", "hello"),
		(error) => error.code === "CONFLICT" && error.status === 409,
	)
	assert.equal(commandCalls.length, 0)
})

test("failed stop preserves the bridge error when disabling also fails", async () => {
	const harness = createHarness({ id: "double-failure", name: "Double Failure", version: "1.0.0", main: "index.js" })
	await harness.service.install(harness.source)
	await harness.service.start("double-failure")
	const stopError = new Error("primary stop failure")
	harness.bridge.stop = async () => { throw stopError }
	harness.settings.patch = () => { throw new Error("disable failure") }
	await assert.rejects(() => harness.service.stop("double-failure"), (error) => error === stopError)
	assert.equal(harness.service.status("double-failure").status, "failed")
	assert.ok(harness.logs.some((entry) => (
		entry.level === "error" &&
		entry.message === "Plugin disable failed after stop failure" &&
		entry.details.pluginId === "double-failure"
	)))
})

test("missing plugin bridge is reported as backend unavailable", async () => {
	const harness = createHarness({ id: "missing-bridge", name: "Missing Bridge", version: "1.0.0", main: "index.js" })
	await harness.service.install(harness.source)
	delete harness.bridge.start
	await assert.rejects(
		() => harness.service.start("missing-bridge"),
		(error) => error.code === "BACKEND_UNAVAILABLE",
	)
})

test("plugin domain synchronizes every current bundled plugin and preserves dotted ids", async () => {
	const harness = createHarness({ id: "temporary", name: "Temporary", version: "1.0.0", main: "index.js" })
	const result = harness.service.syncBundled()
	assert.deepEqual(result.synced.map((item) => item.pluginId).sort(), [
		"openpet.agent-awareness",
		"openpet.creator-studio",
		"openpet.im-gateway",
	])
	const ids = harness.service.list().map((plugin) => plugin.id)
	for (const id of result.synced.map((item) => item.pluginId)) assert.ok(ids.includes(id))

	const snapshot = harness.settings.read()
	assert.deepEqual(
		Object.keys(snapshot.values.plugins.enabled).sort(),
		["openpet.agent-awareness", "openpet.creator-studio", "openpet.im-gateway"],
	)
	harness.settings.patch({
		ifVersion: snapshot.version,
		patch: {
			"plugins.nativeExecutionApproved": Object.fromEntries(result.synced.map((item) => [item.pluginId, true])),
		},
	})
	for (const { pluginId } of result.synced) {
		await harness.service.start(pluginId)
		assert.equal(harness.service.status(pluginId).status, "running")
		await harness.service.stop(pluginId)
		assert.equal(harness.service.status(pluginId).status, "stopped")
	}
})
