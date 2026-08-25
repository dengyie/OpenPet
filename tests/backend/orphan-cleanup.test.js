"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { describe, it } = require("node:test")

const {
	cleanupOrphans,
	createSidecarPidLedger,
	createDefaultSidecarPidLedger,
	inspectProcessIdentity,
	PROCESS_INSPECTION_TIMEOUT_MS,
	PROCESS_INSPECTION_MAX_BUFFER,
} = require("../../apps/desktop/src/sidecar/orphan-cleanup.js")
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
		const live = new Set([11])
		const result = cleanupOrphans({
			file,
			isAlive: (entry) => entry.pid === 10
				? false
				: entry.pid === 11 && live.has(11)
					? { pid: 11, startedAt: 2, processName: "backend" }
					: entry.pid === 12
						? { pid: 12, startedAt: 99, processName: "other" }
						: false,
			kill: (pid) => { killed.push(pid); live.delete(pid) },
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

	it("retains a process when kill does not make it disappear", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t13-ledger-"))
		const file = path.join(dir, "pids.json")
		const entry = { pid: 71, startedAt: 1, processName: "backend" }
		fs.writeFileSync(file, JSON.stringify({ processes: [entry] }))
		const result = cleanupOrphans({
			file,
			isAlive: () => ({ ...entry }),
			kill: () => {},
		})
		assert.deepEqual(result, { checked: 1, killed: 0 })
		assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).processes, [entry])
	})

	it("retains a process when post-kill inspection fails", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t13-ledger-"))
		const file = path.join(dir, "pids.json")
		const entry = { pid: 72, startedAt: 1, processName: "backend" }
		fs.writeFileSync(file, JSON.stringify({ processes: [entry] }))
		let checks = 0
		cleanupOrphans({
			file,
			isAlive: () => {
				checks += 1
				if (checks === 2) throw new Error("inspection unavailable")
				return { ...entry }
			},
			kill: () => {},
		})
		assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).processes, [entry])
	})

	it("bounds process identity inspection commands", () => {
		const optionsSeen = []
		const identity = inspectProcessIdentity(73, {
			platform: "linux",
			execFileSyncImpl: (_file, args, options) => {
				optionsSeen.push(options)
				return args.includes("comm=") ? "backend\n" : "Mon Jan  2 03:04:05 2006\n"
			},
		})
		assert.equal(identity.processName, "backend")
		assert.equal(optionsSeen.length, 2)
		for (const options of optionsSeen) {
			assert.equal(options.timeout, PROCESS_INSPECTION_TIMEOUT_MS)
			assert.equal(options.maxBuffer, PROCESS_INSPECTION_MAX_BUFFER)
		}
	})

	it("uses bounded PowerShell inspection and parses an invariant start timestamp", () => {
		let command
		let optionsSeen
		const identity = inspectProcessIdentity(74, {
			platform: "win32",
			execFileSyncImpl: (_file, args, options) => {
				command = args.at(-1)
				optionsSeen = options
				return "OpenPet.exe|2026-08-25T04:05:06.0000000Z\n"
			},
		})
		assert.match(command, /CreationDate\.ToUniversalTime\(\)\.ToString\('o'\)/)
		assert.equal(optionsSeen.timeout, 1_000)
		assert.equal(optionsSeen.maxBuffer, 64 * 1024)
		assert.deepEqual(identity, {
			processName: "OpenPet.exe",
			startedAt: Date.parse("2026-08-25T04:05:06.0000000Z"),
		})
	})

	it("retains a live default-ledger entry when process inspection times out", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t13-default-ledger-"))
		const file = path.join(dir, "backend", "pids.json")
		const entry = { pid: 75, startedAt: 1, processName: "backend" }
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(file, JSON.stringify({ processes: [entry] }))
		const signals = []
		const ledger = createDefaultSidecarPidLedger({
			app: { getPath: () => dir },
			platform: "linux",
			killProcess: (pid, signal) => signals.push({ pid, signal }),
			execFileSyncImpl: () => { throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }) },
		})
		assert.deepEqual(ledger.sweep(), { checked: 1, killed: 0 })
		assert.deepEqual(signals, [{ pid: 75, signal: 0 }])
		assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).processes, [entry])
	})
})
