import { ApiError } from "../../http/middleware.js"

export const HTTP_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000
export const HTTP_LOG_MAX_ROWS = 10_000
export const PLUGIN_LOG_MAX_PER_PLUGIN = 5_000
const PLUGIN_LOG_LEVELS = new Set(["info", "warn", "error"])

function assertDb(db) {
	if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function") {
		throw new TypeError("createLogsRepository 需要数据库 driver")
	}
}

function normalizeAt(value, now) {
	const at = value === undefined ? now() : value
	if (!Number.isFinite(at)) throw new ApiError("VALIDATION_FAILED", "日志时间必须是有限数字")
	return Math.trunc(at)
}

export function createLogsRepository({ db, now = Date.now } = {}) {
	assertDb(db)
	if (typeof now !== "function") throw new TypeError("createLogsRepository 需要 now 函数")

	const appendHttpStatement = db.prepare(
		"INSERT INTO http_access_logs (at, method, path, status, elapsed_ms, authorized, client, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
	)
	const appendPluginStatement = db.prepare(
		"INSERT INTO plugin_logs (plugin_id, level, message, at) VALUES (?, ?, ?, ?)",
	)
	const trimPluginStatement = db.prepare(
		"DELETE FROM plugin_logs WHERE plugin_id = ? AND id NOT IN (SELECT id FROM plugin_logs WHERE plugin_id = ? ORDER BY at DESC, id DESC LIMIT ?)",
	)

	const appendHttp = (entry = {}) => {
		const method = String(entry.method ?? "")
		const path = String(entry.path ?? "")
		const status = Number(entry.status)
		if (!method || !path || !Number.isInteger(status)) {
			throw new ApiError("VALIDATION_FAILED", "HTTP 日志字段无效")
		}
		appendHttpStatement.run(
			normalizeAt(entry.at, now),
			method,
			path,
			status,
			entry.elapsedMs === null || entry.elapsedMs === undefined ? null : Math.trunc(Number(entry.elapsedMs)),
			entry.authorized ? 1 : 0,
			entry.client ?? null,
			entry.requestId ?? null,
		)
	}

	const listHttp = ({ limit = 200, before } = {}) => {
		const boundedLimit = Math.max(1, Math.min(HTTP_LOG_MAX_ROWS, Math.trunc(Number(limit) || 200)))
		if (before === undefined) {
			return db.prepare("SELECT id, at, method, path, status, elapsed_ms AS elapsedMs, authorized, client, request_id AS requestId FROM http_access_logs ORDER BY at DESC, id DESC LIMIT ?").all(boundedLimit)
		}
		return db.prepare("SELECT id, at, method, path, status, elapsed_ms AS elapsedMs, authorized, client, request_id AS requestId FROM http_access_logs WHERE at < ? ORDER BY at DESC, id DESC LIMIT ?").all(Number(before), boundedLimit)
	}

	const appendPlugin = (entry = {}) => {
		const pluginId = String(entry.pluginId ?? "")
		const level = String(entry.level ?? "")
		const message = String(entry.message ?? "")
		if (!pluginId || !level || !message) throw new ApiError("VALIDATION_FAILED", "插件日志字段无效")
		const at = normalizeAt(entry.at, now)
		return db.transaction(() => {
			appendPluginStatement.run(pluginId, level, message, at)
			const trimmed = trimPluginStatement.run(pluginId, pluginId, PLUGIN_LOG_MAX_PER_PLUGIN).changes ?? 0
			return { pluginId, level, message, at, trimmed }
		})
	}

	const listPlugin = ({ pluginId, limit, page = 1, pageSize, before, level, query } = {}) => {
		if (typeof pluginId !== "string" || pluginId.length === 0) throw new ApiError("VALIDATION_FAILED", "pluginId 不能为空")
		if (level !== undefined && (typeof level !== "string" || !PLUGIN_LOG_LEVELS.has(level))) {
			throw new ApiError("VALIDATION_FAILED", "日志级别无效")
		}
		if (query !== undefined && (typeof query !== "string" || query.length > 200)) {
			throw new ApiError("VALIDATION_FAILED", "日志查询条件无效")
		}
		const requestedLimit = pageSize ?? limit ?? 200
		const boundedLimit = Math.max(1, Math.min(PLUGIN_LOG_MAX_PER_PLUGIN, Math.trunc(Number(requestedLimit) || 200)))
		const normalizedPage = Math.trunc(Number(page) || 1)
		if (!Number.isSafeInteger(normalizedPage) || normalizedPage < 1) throw new ApiError("VALIDATION_FAILED", "日志页码无效")
		const offset = (normalizedPage - 1) * boundedLimit
		if (!Number.isSafeInteger(offset)) throw new ApiError("VALIDATION_FAILED", "日志页码超出范围")
		const clauses = ["plugin_id = ?"]
		const parameters = [pluginId]
		if (level !== undefined) {
			clauses.push("level = ?")
			parameters.push(level)
		}
		if (query !== undefined && query.length > 0) {
			const escaped = query.toLowerCase().replace(/[\\%_]/g, "\\$&")
			clauses.push("(LOWER(plugin_id) LIKE ? ESCAPE '\\' OR LOWER(message) LIKE ? ESCAPE '\\')")
			parameters.push(`%${escaped}%`, `%${escaped}%`)
		}
		if (before !== undefined) {
			if (!Number.isFinite(Number(before))) throw new ApiError("VALIDATION_FAILED", "日志游标无效")
			clauses.push("at < ?")
			parameters.push(Number(before))
		}
		if (before !== undefined && normalizedPage > 1) throw new ApiError("VALIDATION_FAILED", "日志游标不能与页码同时使用")
		parameters.push(boundedLimit)
		if (before === undefined) parameters.push(offset)
		const pagination = before === undefined ? "LIMIT ? OFFSET ?" : "LIMIT ?"
		return db.prepare(`SELECT id, plugin_id AS pluginId, level, message, at FROM plugin_logs WHERE ${clauses.join(" AND ")} ORDER BY at DESC, id DESC ${pagination}`).all(...parameters)
	}

	const cleanup = ({ at = now() } = {}) => {
		const cutoff = normalizeAt(at, now) - HTTP_LOG_RETENTION_MS
		return db.transaction(() => {
			const httpAge = db.prepare("DELETE FROM http_access_logs WHERE at < ?").run(cutoff).changes ?? 0
			const httpCount = db.prepare("DELETE FROM http_access_logs WHERE id NOT IN (SELECT id FROM http_access_logs ORDER BY at DESC, id DESC LIMIT ?)").run(HTTP_LOG_MAX_ROWS).changes ?? 0
			const pluginIds = db.prepare("SELECT DISTINCT plugin_id AS pluginId FROM plugin_logs").all()
			let pluginCount = 0
			const deletePlugin = db.prepare("DELETE FROM plugin_logs WHERE plugin_id = ? AND id NOT IN (SELECT id FROM plugin_logs WHERE plugin_id = ? ORDER BY at DESC, id DESC LIMIT ?)")
			for (const { pluginId } of pluginIds) pluginCount += deletePlugin.run(pluginId, pluginId, PLUGIN_LOG_MAX_PER_PLUGIN).changes ?? 0
			return { httpAge, httpCount, pluginCount, total: httpAge + httpCount + pluginCount }
		})
	}

	return { appendHttp, listHttp, appendPlugin, listPlugin, cleanup }
}
