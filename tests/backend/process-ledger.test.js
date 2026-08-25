"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { EventEmitter } = require("node:events")
const { test } = require("node:test")

test("T29 process ledger persists atomically and unregisters plugin processes", async () => {
	const { createProcessLedger, PID_LEDGER_FILE } = await import("../../services/backend/domains/plugins/process-ledger.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t29-ledger-"))
	const ledger = createProcessLedger({ userDataDir: root, now: () => 1234, isAlive: () => false, kill: () => {} })
	assert.equal(ledger.file, path.join(root, "backend", PID_LEDGER_FILE))
	assert.deepEqual(ledger.register(42, { pluginId: "demo", processName: "node" }), {
		pid: 42,
		pluginId: "demo",
		processName: "node",
		startedAt: 1234,
	})
	assert.deepEqual(ledger.list(), [{ pid: 42, pluginId: "demo", processName: "node", startedAt: 1234 }])
	assert.equal(ledger.unregister(42), true)
	assert.equal(ledger.unregister(42), false)
	assert.deepEqual(JSON.parse(fs.readFileSync(ledger.file, "utf8")), { processes: [] })
	assert.equal(fs.readdirSync(path.dirname(ledger.file)).some((name) => name.includes(".tmp-")), false)
})

test("T29 sweep checks process identity before signalling reused PIDs", async () => {
	const { createProcessLedger } = await import("../../services/backend/domains/plugins/process-ledger.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t29-sweep-"))
	const live = new Set([10, 11])
	const killed = []
	const ledger = createProcessLedger({
		userDataDir: root,
		isAlive: (entry) => {
			if (!live.has(entry.pid)) return false
			return entry.pid === 10
				? { pid: 10, processName: "node", startedAt: 1 }
				: { pid: 11, processName: "other", startedAt: 2 }
		},
		kill: (pid) => { killed.push(pid); live.delete(pid) },
	})
	ledger.register(10, { processName: "node", startedAt: 1 })
	ledger.register(11, { processName: "node", startedAt: 2 })
	assert.deepEqual(ledger.sweep(), { checked: 2, killed: 1 })
	assert.deepEqual(killed, [10])
	assert.deepEqual(ledger.list(), [])
})

test("T29 lifecycle registers bridge child PIDs and removes them after stop", async () => {
	const { createPluginLifecycle } = await import("../../services/backend/domains/plugins/lifecycle.js")
	const calls = []
	const registry = {
		get: (id) => ({ id, enabled: true }),
		definition: (id) => ({ manifest: { id } }),
		requiresNative: () => false,
		isNativeApproved: () => true,
		setEnabled: () => {},
	}
	const processLedger = {
		register: (...args) => calls.push(["register", ...args]),
		unregister: (...args) => calls.push(["unregister", ...args]),
	}
	const lifecycle = createPluginLifecycle({
		registry,
		processLedger,
		bridge: {
			start: async () => ({ pid: 77, processName: "node", startedAt: 9 }),
			stop: async () => {},
		},
		now: () => 10,
	})
	await lifecycle.start("demo")
	await lifecycle.stop("demo")
	assert.deepEqual(calls, [
		["register", 77, { pluginId: "demo", startedAt: 9, processName: "node" }],
		["unregister", 77],
	])
})

test("T29 backend process runtime spawns plugin services and stops through the shared process tree", async () => {
	const { createPluginProcessRuntime } = await import("../../services/backend/domains/plugins/process-runtime.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t29-runtime-"))
	const children = []
	const spawnCalls = []
	const signals = []
	const bridgeCalls = []
	const runtime = createPluginProcessRuntime({
		platform: "linux",
		execPath: "/usr/bin/node",
		electronVersion: undefined,
		processEnv: { PATH: "/usr/bin" },
		now: () => 99,
		bridgeServer: {
			listen: async ({ pluginId, token }) => {
				bridgeCalls.push(["listen", pluginId, token])
				return { url: "http://127.0.0.1:43210", token }
			},
			closePlugin: async (pluginId) => { bridgeCalls.push(["close", pluginId]) },
		},
		spawnProcess: (file, args, options) => {
			const child = new EventEmitter()
			child.pid = 100 + children.length
			children.push(child)
			spawnCalls.push({ file, args, options })
			return child
		},
		signalProcessTree: (pid, signal) => {
			signals.push([pid, signal])
			if (signal === "SIGTERM") children.find((child) => child.pid === pid)?.emit("exit", 0, signal)
			return true
		},
	})
	const definition = {
		manifest: {
			id: "demo",
			basePath: root,
			entries: { services: [
				{ id: "one", command: "node one.js", cwd: ".", platforms: {} },
				{ id: "two", command: "node two.js", cwd: ".", platforms: {} },
			] },
		},
	}
	const started = await runtime.start({ plugin: { id: "demo" }, definition })
	assert.deepEqual(started.processes, [
		{ pid: 100, processName: "node", startedAt: 99, serviceId: "one" },
		{ pid: 101, processName: "node", startedAt: 99, serviceId: "two" },
	])
	assert.equal(spawnCalls.every((call) => call.options.detached === true && call.options.shell === false), true)
	assert.equal(spawnCalls.every((call) => call.options.env.OPENPET_DATA_DIR.endsWith(path.join(".openpet", "demo", "data"))), true)
	assert.equal(spawnCalls.every((call) => call.options.env.OPENPET_SERVICE_BRIDGE_URL === "http://127.0.0.1:43210"), true)
	assert.equal(spawnCalls.every((call) => call.options.env.OPENPET_SERVICE_BRIDGE_TOKEN === bridgeCalls[0][2]), true)
	assert.match(bridgeCalls[0][2], /^[A-Za-z0-9_-]{40,}$/)
	await runtime.stop({ plugin: { id: "demo" } })
	assert.deepEqual(signals, [[100, "SIGTERM"], [101, "SIGTERM"]])
	assert.equal(bridgeCalls.some((call) => call[0] === "close" && call[1] === "demo"), true)
})
