"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { describe, it } = require("node:test")

const { cleanupOrphans, createSidecarPidLedger } = require("../../apps/desktop/src/sidecar/orphan-cleanup.js")
const { createMessageHandler } = require("../../apps/desktop/src/sidecar/message-handler.js")

describe("T13 Shell sidecar seams", () => {
	it("handles dialog requests with correlated response and unknown types", async () => {
		const sent = []
		const warnings = []
		const handler = createMessageHandler({
			dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ["/tmp/example.zip"] }) },
			send: (message) => sent.push(message),
			logger: { warn: (...args) => warnings.push(args) },
		})
		assert.equal(await handler.handle({ v: 1, id: "bridge-1", body: { type: "dialog.request", requestId: "req-1", mode: "file" } }), true)
		assert.equal(sent[0].id, "bridge-1")
		assert.deepEqual(sent[0].body, { type: "dialog.result", requestId: "req-1", paths: ["/tmp/example.zip"] })
		assert.equal(await handler.handle({ v: 1, id: "bridge-2", body: { type: "future.message" } }), false)
		assert.equal(warnings.length, 1)
	})

	it("removes dead processes, kills matching live processes, and ignores PID reuse", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t13-"))
		const file = path.join(dir, "backend", "pids.json")
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(file, JSON.stringify({ processes: [
			{ pid: 10, startedAt: 1, processName: "backend" },
			{ pid: 11, startedAt: 2, processName: "backend" },
			{ pid: 12, startedAt: 3, processName: "backend" },
		] }))
		const killed = []
		const result = cleanupOrphans({
			file,
			isAlive: (entry) => entry.pid === 10 ? false : entry.pid === 11 ? { pid: 11, startedAt: 2, processName: "backend" } : { pid: 12, startedAt: 99, processName: "other" },
			kill: (pid) => killed.push(pid),
		})
		assert.deepEqual(result, { checked: 3, killed: 1 })
		assert.deepEqual(killed, [11])
		assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { processes: [] })
	})

	it("ignores missing and corrupt ledgers", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t13-"))
		const file = path.join(dir, "pids.json")
		assert.deepEqual(cleanupOrphans({ file, isAlive: () => false, kill: () => {} }), { checked: 0, killed: 0 })
		fs.writeFileSync(file, "not-json")
		assert.doesNotThrow(() => cleanupOrphans({ file, isAlive: () => false, kill: () => {} }))
	})

	it("registers ready sidecars atomically and unregisters only the requested PID", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t13-ledger-"))
		const file = path.join(dir, "backend", "pids.json")
		const ledger = createSidecarPidLedger({
			file,
			isAlive: () => false,
			kill: () => {},
			now: () => 1234,
		})
		assert.deepEqual(ledger.register(41), { pid: 41, startedAt: 1234, processName: "openpet-sidecar" })
		assert.deepEqual(ledger.register(42, { startedAt: 5678, processName: "OpenPet Backend" }), {
			pid: 42,
			startedAt: 5678,
			processName: "OpenPet Backend",
		})
		assert.deepEqual(ledger.list(), [
			{ pid: 41, startedAt: 1234, processName: "openpet-sidecar" },
			{ pid: 42, startedAt: 5678, processName: "OpenPet Backend" },
		])
		assert.equal(ledger.unregister(41), true)
		assert.equal(ledger.unregister(99), false)
		assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
			processes: [{ pid: 42, startedAt: 5678, processName: "OpenPet Backend" }],
		})
		assert.equal(fs.readdirSync(path.dirname(file)).some((name) => name.includes(".tmp-")), false)
	})

	it("retains entries when inspection or termination fails", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t13-ledger-"))
		const file = path.join(dir, "pids.json")
		fs.writeFileSync(file, JSON.stringify({ processes: [
			{ pid: 51, startedAt: 1, processName: "backend" },
			{ pid: 52, startedAt: 2, processName: "backend" },
		] }))
		cleanupOrphans({
			file,
			isAlive: (entry) => {
				if (entry.pid === 51) throw new Error("inspect failed")
				return { pid: entry.pid, startedAt: entry.startedAt, processName: entry.processName }
			},
			kill: () => { throw new Error("kill failed") },
		})
		assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).processes.map((entry) => entry.pid), [51, 52])
	})

	it("requires observed process metadata before killing a ledger entry", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t13-ledger-"))
		const file = path.join(dir, "pids.json")
		fs.writeFileSync(file, JSON.stringify({ processes: [
			{ pid: 61, startedAt: 1, processName: "backend" },
		] }))
		const killed = []
		cleanupOrphans({ file, isAlive: () => ({ pid: 61, startedAt: 1 }), kill: (pid) => killed.push(pid) })
		assert.deepEqual(killed, [])
	})
})
