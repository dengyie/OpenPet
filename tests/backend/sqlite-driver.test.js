"use strict"

const assert = require("node:assert/strict")
const { existsSync, mkdtempSync, rmSync } = require("node:fs")
const { tmpdir } = require("node:os")
const { join } = require("node:path")
const { before, describe, it } = require("node:test")

let dbModule

before(async () => {
	dbModule = await import("../../services/backend/store/db.js")
})

function createTempDatabasePath() {
	const directory = mkdtempSync(join(tmpdir(), "openpet-sqlite-driver-"))
	return { directory, file: join(directory, "backend", "openpet.db") }
}

describe("SQLite driver · file-backed defaults", () => {
	it("启用落盘 WAL 与四项 DEFAULT_PRAGMAS,且数据可跨连接持久化", async () => {
		const { directory, file } = createTempDatabasePath()
		let db
		try {
			db = await dbModule.openDatabase({ file })

			assert.equal(db.driverName, "node:sqlite")
			assert.equal(existsSync(file), true, "openDatabase 应创建落盘文件")
			assert.equal(db.pragma("journal_mode").journal_mode, "wal")
			assert.equal(db.pragma("synchronous").synchronous, 1, "NORMAL = 1")
			assert.equal(db.pragma("foreign_keys").foreign_keys, 1, "ON = 1")
			assert.equal(db.pragma("busy_timeout").timeout, 5_000)

			db.exec("CREATE TABLE probe (value TEXT NOT NULL);")
			db.prepare("INSERT INTO probe (value) VALUES (?)").run("file-backed")
			db.close()
			db = null

			db = await dbModule.openDatabase({ file })
			assert.equal(db.prepare("SELECT value FROM probe").get().value, "file-backed")
		} finally {
			db?.close()
			rmSync(directory, { recursive: true, force: true })
		}
	})
})
