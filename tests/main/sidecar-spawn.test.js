"use strict"

const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const { describe, it } = require("node:test")

const { launch, spawnSidecar, stopSidecar } = require("../../apps/desktop/src/sidecar/spawn.js")

function childHarness() {
	const child = new EventEmitter()
	child.exitCode = null
	child.killed = false
	child.sent = []
	child.kill = (signal) => { child.killed = true; child.killSignal = signal }
	child.send = (message) => child.sent.push(message)
	return child
}

function readyEnvelope(overrides = {}) {
	return {
		v: 1,
		id: "ready-1",
		at: Date.now(),
		body: {
			type: "ready",
			port: 3210,
			apiVersion: "v1",
			pid: 1234,
			sessionToken: "s".repeat(32),
			startupMs: 4,
			...overrides,
		},
	}
}

describe("sidecar spawn lifecycle", () => {
	it("sends init before accepting a complete ready envelope", async () => {
		const child = childHarness()
		const promise = launch({ entry: "/tmp/backend.js", initBody: { userDataDir: "/tmp/user" }, forkImpl: () => child })
		assert.deepEqual(child.sent[0].body, { type: "init", userDataDir: "/tmp/user" })
		child.emit("message", readyEnvelope())
		const result = await promise
		assert.equal(result.ready.sessionToken.length, 32)
	})

	it("rejects malformed ready and kills the child", async () => {
		const child = childHarness()
		const promise = launch({ entry: "/tmp/backend.js", forkImpl: () => child })
		child.emit("message", readyEnvelope({ sessionToken: "short" }))
		await assert.rejects(promise, (error) => error.code === "SIDECAR_MALFORMED_READY")
		assert.equal(child.killSignal, "SIGKILL")
	})

	it("rejects ready envelopes with extra fields", async () => {
		const child = childHarness()
		const promise = launch({ entry: "/tmp/backend.js", forkImpl: () => child })
		const envelope = readyEnvelope()
		envelope.body.extra = "unexpected"
		child.emit("message", envelope)
		await assert.rejects(promise, (error) => error.code === "SIDECAR_MALFORMED_READY")
		assert.equal(child.killSignal, "SIGKILL")
	})

	it("retries version mismatch only and preserves the accepted child exit", async () => {
		const exits = []
		let attempt = 0
		const child = { pid: 1234 }
		const result = await spawnSidecar({
			entry: "/tmp/backend.js",
			onExit: (code) => exits.push(code),
			launch: async (options) => {
				attempt += 1
				if (attempt === 1) throw Object.assign(new Error("version mismatch"), { code: "SIDECAR_VERSION_MISMATCH" })
				return { child, ready: readyEnvelope().body }
			},
		})
		assert.equal(result.attempt, 2)
		assert.deepEqual(exits, [])
	})

	it("does not retry malformed ready", async () => {
		let attempts = 0
		await assert.rejects(() => spawnSidecar({
			entry: "/tmp/backend.js",
			launch: async () => { attempts += 1; throw Object.assign(new Error("bad ready"), { code: "SIDECAR_MALFORMED_READY" }) },
		}), (error) => error.code === "SIDECAR_MALFORMED_READY")
		assert.equal(attempts, 1)
	})

	it("sends graceful shutdown and falls back to SIGKILL", async () => {
		const child = childHarness()
		const result = stopSidecar(child, { graceMs: 1 })
		assert.equal(child.sent[0].body.type, "shutdown")
		await new Promise((resolve) => setTimeout(resolve, 5))
		assert.equal(await result, "killed")
		assert.equal(child.killSignal, "SIGKILL")
	})

	it("honors an explicit zero shutdown grace period", async () => {
		const child = childHarness()
		const startedAt = Date.now()
		const result = await stopSidecar(child, { graceMs: 0 })
		assert.equal(result, "killed")
		assert.equal(child.killSignal, "SIGKILL")
		assert.ok(Date.now() - startedAt < 1000)
	})

	it("force-kills immediately when shutdown send reports an asynchronous error", async () => {
		const child = childHarness()
		child.send = (_message, callback) => queueMicrotask(() => callback?.(new Error("channel closed")))
		const result = await stopSidecar(child, { graceMs: 1000 })
		assert.equal(result, "killed")
		assert.equal(child.killSignal, "SIGKILL")
	})

	it("does not force-kill after exit wins the shutdown race", async () => {
		const child = childHarness()
		child.send = (_message, callback) => queueMicrotask(() => {
			child.emit("exit", 0, null)
			callback?.(new Error("channel closed after exit"))
		})
		const result = await stopSidecar(child, { graceMs: 1000 })
		assert.equal(result, "exited")
		assert.equal(child.killSignal, undefined)
	})

	it("rejects and kills when init send reports an asynchronous error", async () => {
		const child = childHarness()
		child.send = (_message, callback) => callback?.(new Error("channel closed"))
		const promise = launch({ entry: "/tmp/backend.js", forkImpl: () => child })
		await assert.rejects(promise, /channel closed/)
		assert.equal(child.killSignal, "SIGKILL")
	})

	it("does not kill an accepted child when a late init callback reports an error", async () => {
		const child = childHarness()
		child.send = (_message, callback) => {
			queueMicrotask(() => {
				child.emit("message", readyEnvelope())
				callback?.(new Error("late channel error"))
			})
		}
		const result = await launch({ entry: "/tmp/backend.js", forkImpl: () => child })
		assert.equal(result.ready.apiVersion, "v1")
		assert.equal(child.killSignal, undefined)
	})
})
