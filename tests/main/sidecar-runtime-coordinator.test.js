const test = require("node:test")
const assert = require("node:assert/strict")
const { createSidecarRuntimeCoordinator } = require("../../apps/desktop/src/sidecar/runtime-coordinator")

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
