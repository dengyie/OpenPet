const test = require("node:test")
const assert = require("node:assert/strict")
const { createSidecarRuntimeCoordinator } = require("../../apps/desktop/src/sidecar/runtime-coordinator")
const { spawnSidecar } = require("../../apps/desktop/src/sidecar/spawn")

function createHarness({ spawnError, getInitBody } = {}) {
	const child = { send() {} }
	const calls = { initBodies: [], handled: [], stopped: [] }
	let spawnOptions
	const coordinator = createSidecarRuntimeCoordinator({
		app: { getPath: () => "/tmp/openpet-user-data" },
		secretService: {
			listSecretRefs: () => [{ id: "ai.default", hasValue: true }, { id: "empty", hasValue: false }],
			getSecretValue: (id) => id === "ai.default" ? "existing-secret" : "",
		},
		getSettings: () => ({ localHttp: { token: "legacy-token" } }),
		getInitBody,
		spawnSidecar: async (options) => {
			spawnOptions = options
			calls.initBodies.push(options.initBody)
			if (spawnError) throw spawnError
			return { child, baseUrl: "http://127.0.0.1:3210/api/v1", sessionToken: "session-token" }
		},
		stopSidecar: async (target) => calls.stopped.push(target),
		createMessageHandler: () => ({ handle: async (message) => calls.handled.push(message) }),
	})
	return { coordinator, child, calls, getSpawnOptions: () => spawnOptions }
}

test("starts without reading or injecting secrets and exposes connection", async () => {
	const harness = createHarness()
	const backend = await harness.coordinator.start()
	assert.deepEqual(harness.calls.initBodies, [{ userDataDir: "/tmp/openpet-user-data", secrets: {}, legacyToken: "legacy-token" }])
	assert.deepEqual(backend, { baseUrl: "http://127.0.0.1:3210/api/v1", sessionToken: "session-token" })
	assert.equal(harness.coordinator.getState().status, "ready")
})

test("uses caller-provided init body including explicitly selected secrets", async () => {
	const harness = createHarness({ getInitBody: async () => ({ custom: true, secrets: { "ai.default": "selected-secret" } }) })
	await harness.coordinator.start()
	assert.deepEqual(harness.calls.initBodies, [{ custom: true, secrets: { "ai.default": "selected-secret" } }])
})

test("startup failure becomes degraded without rejecting", async () => {
	const error = Object.assign(new Error("fork failed"), { code: "SIDECAR_EARLY_EXIT" })
	const harness = createHarness({ spawnError: error })
	assert.equal(await harness.coordinator.start(), null)
	assert.deepEqual(harness.coordinator.getState(), { status: "degraded", backend: null, reason: "SIDECAR_EARLY_EXIT" })
})

test("degraded message and unexpected exit clear backend", async () => {
	const harness = createHarness()
	await harness.coordinator.start()
	const message = { body: { type: "degraded", reason: "MIGRATION_REQUIRED" } }
	harness.getSpawnOptions().onMessage(message)
	await new Promise((resolve) => setImmediate(resolve))
	assert.deepEqual(harness.calls.handled, [message])
	assert.equal(harness.coordinator.getState().reason, "MIGRATION_REQUIRED")
	harness.getSpawnOptions().onExit(9)
	assert.equal(harness.coordinator.getState().reason, "SIDECAR_EXIT_9")
})

test("stop is idempotent and unsubscribe removes listener", async () => {
	const harness = createHarness()
	const changes = []
	const unsubscribe = harness.coordinator.onChanged((backend) => changes.push(backend))
	await harness.coordinator.start()
	unsubscribe()
	const first = harness.coordinator.stop()
	const second = harness.coordinator.stop()
	assert.equal(first, second)
	await first
	assert.deepEqual(harness.calls.stopped, [harness.child])
	assert.equal(changes.length, 2)
	assert.deepEqual(harness.coordinator.getState(), { status: "stopped", backend: null, reason: null })
})

test("sweeps before spawn, registers ready PID, and unregisters after normal stop", async () => {
	const calls = []
	const child = { pid: 4321, send() {} }
	const coordinator = createSidecarRuntimeCoordinator({
		pidLedger: {
			sweep: () => calls.push("sweep"),
			register: (pid, metadata) => calls.push(["register", pid, metadata]),
			unregister: (pid) => calls.push(["unregister", pid]),
		},
		spawnSidecar: async () => {
			calls.push("spawn")
			return { child, pid: child.pid, baseUrl: "http://127.0.0.1:3210/api/v1", sessionToken: "token" }
		},
		stopSidecar: async () => calls.push("stop"),
		createMessageHandler: () => ({ handle: async () => {} }),
	})
	await coordinator.start()
	assert.equal(calls[0], "sweep")
	assert.equal(calls[1], "spawn")
	assert.deepEqual(calls[2].slice(0, 2), ["register", 4321])
	await coordinator.stop()
	assert.deepEqual(calls.slice(-2), ["stop", ["unregister", 4321]])
})

test("unexpected exit retains PID ledger entry for the next startup sweep", async () => {
	const calls = []
	const children = [{ pid: 5001, send() {} }, { pid: 5002, send() {} }]
	let spawnIndex = 0
	let exitHandler
	const coordinator = createSidecarRuntimeCoordinator({
		pidLedger: {
			sweep: () => calls.push("sweep"),
			register: (pid) => calls.push(["register", pid]),
			unregister: (pid) => calls.push(["unregister", pid]),
		},
		spawnSidecar: async (options) => {
			calls.push("spawn")
			exitHandler = options.onExit
			return { child: children[spawnIndex++], pid: children[spawnIndex - 1].pid, baseUrl: "http://127.0.0.1:3210/api/v1", sessionToken: "token" }
		},
		stopSidecar: async () => calls.push("stop"),
		createMessageHandler: () => ({ handle: async () => {} }),
	})
	await coordinator.start()
	exitHandler(9)
	assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === "unregister" && entry[1] === 5001), false)
	await coordinator.start()
	assert.deepEqual(calls.filter((entry) => entry === "sweep"), ["sweep", "sweep"])
	assert.deepEqual(calls.slice(-2), ["spawn", ["register", 5002]])
})

test("cleanup failure degrades only the ledger path and stop failure retains the PID", async () => {
	const calls = []
	const child = { pid: 6001, send() {} }
	const coordinator = createSidecarRuntimeCoordinator({
		pidLedger: {
			sweep: async () => { throw new Error("ledger read failed") },
			register: (pid) => calls.push(["register", pid]),
			unregister: (pid) => calls.push(["unregister", pid]),
		},
		spawnSidecar: async () => ({ child, pid: child.pid, baseUrl: "http://127.0.0.1:3210/api/v1", sessionToken: "token" }),
		stopSidecar: async () => { throw new Error("stop failed") },
		createMessageHandler: () => ({ handle: async () => {} }),
	})
	await coordinator.start()
	await assert.rejects(coordinator.stop(), /stop failed/)
	assert.deepEqual(calls, [["register", 6001]])
})

test("does not register or publish ready when the child exits before coordinator registration", async () => {
	const calls = []
	let notifyExit
	const coordinator = createSidecarRuntimeCoordinator({
		pidLedger: {
			sweep: () => {},
			register: (pid) => calls.push(["register", pid]),
		},
		spawnSidecar: async (options) => {
			notifyExit = options.onExit
			const child = { pid: 7001, send() {} }
			queueMicrotask(() => notifyExit(9))
			return { child, pid: child.pid, baseUrl: "http://127.0.0.1:3210/api/v1", sessionToken: "token" }
		},
		createMessageHandler: () => ({ handle: async () => {} }),
	})
	assert.equal(await coordinator.start(), null)
	assert.deepEqual(calls, [])
	assert.deepEqual(coordinator.getState(), { status: "degraded", backend: null, reason: "SIDECAR_EXIT_9" })
})

test("version-mismatch retry does not forward the discarded child's exit", async () => {
	const exits = []
	const attemptExitHandlers = []
	let attempts = 0
	const child = { pid: 8002 }
	const result = await spawnSidecar({
		entry: "/tmp/backend.js",
		onExit: (code) => exits.push(code),
		launch: async (options) => {
			attempts += 1
			attemptExitHandlers.push(options.onExit)
			if (attempts === 1) {
				options.onExit(78)
				throw Object.assign(new Error("mismatch"), { code: "SIDECAR_VERSION_MISMATCH" })
			}
			return {
				child,
				ready: { port: 3210, pid: child.pid, apiVersion: "v1", sessionToken: "token", startupMs: 1 },
			}
		},
	})
	assert.equal(result.pid, child.pid)
	assert.deepEqual(exits, [])
	attemptExitHandlers[1](9)
	assert.deepEqual(exits, [9])
})
