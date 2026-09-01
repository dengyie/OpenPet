"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test, before } = require("node:test")

let openDatabase
let migrate
let createLogsRepository
let createPluginService
let createEventHub
let MAX_BUFFERED_FRAMES
let createPluginLogWriter

before(async () => {
	;({ openDatabase } = await import("../../services/backend/store/db.js"))
	;({ migrate } = await import("../../services/backend/store/migrate.js"))
	;({ createLogsRepository } = await import("../../services/backend/store/repositories/logs.js"))
	;({ createPluginService } = await import("../../services/backend/domains/plugins/index.js"))
	;({ createEventHub, MAX_BUFFERED_FRAMES } = await import("../../services/backend/events/hub.js"))
	;({ createPluginLogWriter } = await import("../../services/backend/domains/plugins/plugin-log-writer.js"))
})

async function createHarness({ logs: injectedLogs } = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-plugin-logs-"))
	const userDataDir = path.join(root, "user-data")
	fs.mkdirSync(userDataDir, { recursive: true })
	const db = await openDatabase({ file: path.join(root, "openpet.db") })
	migrate({ db })
	const events = []
	const service = createPluginService({
		root: path.resolve(__dirname, "../.."),
		userDataDir,
		db,
		logs: injectedLogs ?? createLogsRepository({ db, now: () => 1_700_000_000_000 }),
		settings: {
			read: () => ({ version: 0, values: {} }),
			patch: () => ({ version: 1, values: {} }),
		},
		bridge: {},
		emit: (name, payload) => events.push({ name, payload }),
		now: () => 1_700_000_000_000,
	})
	return { db, service, events }
}

test("T30 plugin log ingestion does not synchronously wait for SQLite", async () => {
	let appendCalls = 0
	const { service } = await createHarness({
		logs: {
			appendPlugin() {
				appendCalls += 1
				const end = Date.now() + 40
				while (Date.now() < end) {}
			},
		},
	})
	const started = Date.now()
	service.appendLog({ pluginId: "demo", message: "queued" })
	const elapsed = Date.now() - started

	assert.equal(appendCalls, 0)
	assert.ok(elapsed < 20, `appendLog synchronously blocked for ${elapsed}ms`)
	await service.closeLogs()
})

test("T30 appends sanitized plugin logs to SQLite and emits plugin.log", async () => {
	const { db, service, events } = await createHarness()
	try {
		assert.equal(typeof service.appendLog, "function")

		const entry = service.appendLog({
			pluginId: "demo",
			level: "warn",
			message: "token=super-secret at /Users/mango/private.txt via http://127.0.0.1:8787",
		})

		assert.equal(entry.pluginId, "demo")
		assert.equal(entry.level, "warn")
		assert.match(entry.message, /\[redacted-token\]=\[redacted-secret\]/)
		assert.doesNotMatch(entry.message, /super-secret|\/Users\/mango|127\.0\.0\.1/)
		await service.flushLogs()
		assert.deepEqual(JSON.parse(JSON.stringify(db.prepare("SELECT plugin_id, level, message, at FROM plugin_logs").all())), [{
			plugin_id: "demo",
			level: "warn",
			message: entry.message,
			at: 1_700_000_000_000,
		}])
		assert.deepEqual(events, [{
			name: "plugin.log",
			payload: {
				pluginId: "demo",
				level: "warn",
				message: entry.message,
				at: 1_700_000_000_000,
			},
		}])
	} finally {
		await service.closeLogs()
		db.close()
	}
})

test("T30 bounds each plugin log stream to 5000 rows", async () => {
	const { db, service } = await createHarness()
	try {
		for (let index = 0; index < 5_001; index += 1) {
			service.appendLog({ pluginId: "demo", message: `line-${index}` })
		}
		await service.flushLogs()
		assert.equal(db.prepare("SELECT COUNT(*) AS count FROM plugin_logs WHERE plugin_id = 'demo'").get().count, 5_000)
		assert.equal(db.prepare("SELECT message FROM plugin_logs WHERE plugin_id = 'demo' ORDER BY at ASC, id ASC LIMIT 1").get().message, "line-1")
	} finally {
		await service.closeLogs()
		db.close()
	}
})

test("T30 lists and clears logs through the plugin domain", async () => {
	const { db, service } = await createHarness()
	try {
		service.appendLog({ pluginId: "demo", message: "first", at: 1 })
		service.appendLog({ pluginId: "demo", level: "error", message: "second", at: 2 })
		service.appendLog({ pluginId: "other", message: "keep", at: 3 })
		await service.flushLogs()
		assert.deepEqual(JSON.parse(JSON.stringify(service.getLogs("demo"))), [
			{ id: 2, pluginId: "demo", level: "error", message: "second", at: 2 },
			{ id: 1, pluginId: "demo", level: "info", message: "first", at: 1 },
		])
		assert.deepEqual(service.clearLogs("demo"), { ok: true, pluginId: "demo", deleted: 2 })
		assert.deepEqual(service.getLogs("demo"), [])
		assert.equal(service.getLogs("other").length, 1)
	} finally {
		await service.closeLogs()
		db.close()
	}
})

test("T30 plugin.log bursts stay behind the T11 buffer and report dropped events", async () => {
	const hub = createEventHub({ heartbeatMs: 60_000 })
	let drain
	const sink = {
		writes: [],
		blocked: true,
		write(value) { this.writes.push(value); return !this.blocked },
		once(event, callback) { if (event === "drain") drain = callback },
		end() {},
	}
	const subscription = hub.subscribe({ topics: ["plugins"], sink })
	for (let index = 0; index < MAX_BUFFERED_FRAMES + 5; index += 1) {
		hub.publish("plugin.log", { pluginId: "demo", message: `line-${index}` })
	}
	assert.ok(subscription.stats().queued <= MAX_BUFFERED_FRAMES)
	sink.blocked = false
	drain()
	assert.match(sink.writes.join(""), /event: system\.events-dropped/)
	assert.match(sink.writes.join(""), /"topic":"plugins"/)
	subscription.unsubscribe()
})

test("T30 async plugin log writer bounds overflow, preserves order, flushes, and reports errors", async () => {
	const persisted = []
	const errors = []
	const writer = createPluginLogWriter({
		maxQueue: 2,
		append: (entry) => {
			if (entry.message === "bad") throw new Error("sqlite unavailable")
			persisted.push(entry.message)
		},
		logger: { error: (_message, details) => errors.push(details) },
	})

	assert.deepEqual(writer.append({ message: "first" }), { accepted: true })
	assert.deepEqual(writer.append({ message: "second" }), { accepted: true })
	assert.deepEqual(writer.append({ message: "third" }), { accepted: false, reason: "queue-full" })
	await writer.flush()
	assert.deepEqual(persisted, ["first", "second"])
	assert.equal(writer.stats().dropped, 1)

	writer.append({ message: "bad" })
	await assert.rejects(writer.flush(), /sqlite unavailable/)
	assert.equal(writer.stats().failed, 1)
	assert.equal(errors.length, 1)
	await writer.close().catch(() => {})
	assert.deepEqual(writer.append({ message: "after-close" }), { accepted: false, reason: "closed" })
})
