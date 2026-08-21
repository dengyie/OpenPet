import {
	copyFileSync,
	 existsSync,
	 mkdirSync,
	 readFileSync,
	 rmSync,
	 unlinkSync,
	writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"

import { migrate } from "./migrate.js"

export const BACKUP_DIR_PREFIX = "backup-"
export const DUAL_WRITE_KINDS = Object.freeze(["conversations", "settings"])

const IMPORT_META_DDL = `
CREATE TABLE IF NOT EXISTS json_import_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  imported_at INTEGER NOT NULL,
  backup_dir TEXT NOT NULL
);`

const SETTINGS_DDL = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  values_json TEXT NOT NULL
);`

function clone(value) {
	return structuredClone(value)
}

function readJson(file, fallback) {
	if (!existsSync(file)) return fallback
	const value = JSON.parse(readFileSync(file, "utf8"))
	return value && typeof value === "object" ? value : fallback
}

function sourcePaths(userDataDir) {
	const rootSettings = join(userDataDir, "settings.json")
	const backendSettings = join(userDataDir, "backend", "settings.json")
	return {
		settings: existsSync(rootSettings) ? rootSettings : backendSettings,
		settingsTarget: backendSettings,
		conversationStore: join(userDataDir, "ai-talk-store.json"),
	}
}

function hasTable(db, table) {
	try {
		return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
	} catch {
		return false
	}
}

/** schema_migrations is intentionally sampled before migrate() during startup. */
export function needsJsonImport(db) {
	if (!db || !hasTable(db, "schema_migrations")) return true
	const count = db.prepare("SELECT count(*) AS count FROM schema_migrations").get()?.count ?? 0
	return Number(count) === 0
}

function timestampValue(now) {
	const value = typeof now === "function" ? now() : now
	const date = value instanceof Date ? value : new Date(value ?? Date.now())
	return Number.isFinite(date.getTime()) ? date.getTime() : Date.now()
}

function isoOrMillis(value, fallback) {
	if (typeof value === "number" && Number.isFinite(value)) return Math.round(value)
	const parsed = Date.parse(String(value ?? ""))
	return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeConversationId(key, conversation, used) {
	const requested = typeof conversation?.id === "string" && conversation.id.trim() ? conversation.id.trim() : key
	let id = requested
	let suffix = 1
	while (used.has(id)) id = `${requested}:${suffix++}`
	used.add(id)
	return id
}

function jsonError(message, details = {}) {
	const error = new Error(message)
	error.code = "JSON_IMPORT_FAILED"
	error.details = details
	return error
}

function backupLegacyFiles({ paths, userDataDir, now }) {
	const timestamp = String(timestampValue(now)).replace(/[^0-9]/g, "")
	let backupDir = join(userDataDir, `${BACKUP_DIR_PREFIX}${timestamp}`)
	let suffix = 1
	while (existsSync(backupDir)) backupDir = join(userDataDir, `${BACKUP_DIR_PREFIX}${timestamp}-${suffix++}`)
	mkdirSync(backupDir, { recursive: false })
	for (const [name, file] of [["settings.json", paths.settings], ["ai-talk-store.json", paths.conversationStore]]) {
		if (existsSync(file)) copyFileSync(file, join(backupDir, name))
	}
	return backupDir
}

function removeDatabaseFiles(db) {
	const file = db?.file
	try { db?.close?.() } catch { /* best effort; the original error is more useful */ }
	if (typeof file !== "string" || file === ":memory:") return
	for (const suffix of ["", "-wal", "-shm"]) {
		try { unlinkSync(file + suffix) } catch (error) { if (error?.code !== "ENOENT") rmSync(file + suffix, { force: true }) }
	}
}

function importRows({ db, settings, store, now, onProgress }) {
	const conversations = store?.conversations && typeof store.conversations === "object" ? store.conversations : {}
	const messages = store?.messages && typeof store.messages === "object" ? store.messages : {}
	const usedIds = new Set()
	const conversationIds = new Map()
	let messageCount = 0
	let settingsCount = 0
	const at = timestampValue(now)

	db.exec(SETTINGS_DDL + IMPORT_META_DDL)
	const insertConversation = db.prepare("INSERT INTO ai_conversations (id, title, persona_id, created_at, updated_at, archived) VALUES (?, ?, ?, ?, ?, ?)")
	const insertMessage = db.prepare("INSERT INTO ai_messages (id, conversation_id, role, content, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?)")
	for (const [key, raw] of Object.entries(conversations)) {
		const conversation = raw && typeof raw === "object" ? raw : {}
		const id = normalizeConversationId(key, conversation, usedIds)
		conversationIds.set(key, id)
		const createdAt = isoOrMillis(conversation.createdAt, at)
		const updatedAt = isoOrMillis(conversation.updatedAt, createdAt)
		insertConversation.run(id, String(conversation.title ?? ""), conversation.personaPackId ?? conversation.personaId ?? null, createdAt, updatedAt, conversation.archived ? 1 : 0)
	}
	for (const [key, rawMessages] of Object.entries(messages)) {
		const conversationId = conversationIds.get(key)
		if (!conversationId) continue
		for (const [index, raw] of (Array.isArray(rawMessages) ? rawMessages : []).entries()) {
			const message = raw && typeof raw === "object" ? raw : {}
			const content = typeof message.content === "string" ? message.content : ""
			if (!content) continue
			const id = typeof message.id === "string" && message.id ? message.id : `${conversationId}:message:${index}`
			insertMessage.run(id, conversationId, String(message.role ?? "user"), content, Number.isFinite(message.tokenCount) ? message.tokenCount : null, isoOrMillis(message.createdAt, at))
			messageCount += 1
		}
	}
	if (settings && typeof settings === "object") {
		const version = Number.isInteger(settings.version) && settings.version >= 0 ? settings.version : 0
		const values = settings.values && typeof settings.values === "object" ? settings.values : {}
		db.prepare("INSERT INTO settings (id, version, values_json) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version, values_json = excluded.values_json").run(version, JSON.stringify(values))
		settingsCount = 1
	}
	onProgress?.({ phase: "imported", percent: 100, message: `导入 ${Object.keys(conversations).length} 个对话` })
	return { conversations: Object.keys(conversations).length, messages: messageCount, settings: settingsCount }
}

export async function migrateFromJson({ db, userDataDir, now = () => Date.now(), logger, onProgress, force = false } = {}) {
	if (!db || typeof userDataDir !== "string" || !userDataDir) throw new TypeError("migrateFromJson 需要 db 与 userDataDir")
	if (!force && !needsJsonImport(db)) return { imported: { conversations: 0, messages: 0, settings: 0 }, backupDir: null, skipped: true }

	const paths = sourcePaths(userDataDir)
	const backupDir = backupLegacyFiles({ paths, userDataDir, now })
	try {
		const store = readJson(paths.conversationStore, {})
		const settings = readJson(paths.settings, null)
		migrate({ db, logger })
		const imported = db.transaction(() => {
			const counts = importRows({ db, settings, store, now, onProgress })
			const actual = {
				conversations: db.prepare("SELECT count(*) AS count FROM ai_conversations").get().count,
				messages: db.prepare("SELECT count(*) AS count FROM ai_messages").get().count,
				settings: db.prepare("SELECT count(*) AS count FROM settings").get().count,
			}
			for (const kind of ["conversations", "messages", "settings"]) {
				if (Number(actual[kind]) !== Number(counts[kind])) throw jsonError("JSON 导入记录数对账失败", { kind, expected: counts[kind], actual: actual[kind] })
			}
			db.prepare("INSERT INTO json_import_meta (id, imported_at, backup_dir) VALUES (1, ?, ?)").run(timestampValue(now), backupDir)
			return counts
		})
		// T10 still reads backend/settings.json. Copy a legacy root settings file
		// into that canonical location only after the SQLite transaction commits.
		if (settings && paths.settings !== paths.settingsTarget) writeJson(paths.settingsTarget, settings)
		logger?.info?.("JSON 数据迁移完成", { backupDir, imported })
		return { imported, backupDir, skipped: false }
	} catch (error) {
		logger?.error?.("JSON 数据迁移失败", { backupDir, error: String(error) })
		removeDatabaseFiles(db)
		throw error
	}
}

function writeJson(file, value) {
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

export function createDualWriter({ userDataDir, logger } = {}) {
	if (typeof userDataDir !== "string" || !userDataDir) throw new TypeError("createDualWriter 需要 userDataDir")
	const storePath = join(userDataDir, "ai-talk-store.json")
	const settingsPath = join(userDataDir, "backend", "settings.json")
	let enabled = true
	const stats = { conversations: 0, settings: 0 }
	const readStore = () => readJson(storePath, { schemaVersion: 1, sessions: {}, conversations: {}, messages: {}, personaOverrides: {}, memories: {}, petUtterances: {}, memoryJobs: {}, traces: {} })
	const writeConversation = (input = {}) => {
		if (!enabled) return false
		const state = readStore()
		const conversation = input.conversation ?? input
		const key = input.key ?? (conversation.sessionId ? `${conversation.sessionId}:${conversation.id}` : conversation.id)
		if (!key) throw new Error("双写对话缺少 key")
		state.conversations[key] = clone(conversation)
		if (Array.isArray(input.messages)) state.messages[key] = clone(input.messages)
		writeJson(storePath, state)
		stats.conversations += 1
		return true
	}
	const writeSettings = (settings) => {
		if (!enabled) return false
		writeJson(settingsPath, clone(settings))
		stats.settings += 1
		return true
	}
	const disable = () => { enabled = false }
	return { writeConversation, writeSettings, disable, stats }
}
