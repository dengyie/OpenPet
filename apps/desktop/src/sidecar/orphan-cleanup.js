"use strict"

const fs = require("node:fs")
const path = require("node:path")

function normalizeEntries(raw) {
	const entries = Array.isArray(raw) ? raw : (Array.isArray(raw?.processes) ? raw.processes : [])
	return entries.filter((entry) => entry && typeof entry === "object" && Number.isInteger(entry.pid) && entry.pid > 0)
}

function readEntries(file, logger) {
	try {
		return normalizeEntries(JSON.parse(fs.readFileSync(file, "utf8")))
	} catch (error) {
		if (error?.code !== "ENOENT") logger?.warn?.("读取 sidecar 孤儿台账失败", { file, error: String(error) })
		return []
	}
}

function sameProcess(entry, observed) {
	if (observed === false || observed === null || observed === undefined) return false
	if (observed === true) return !entry.startedAt && !entry.processName
	if (typeof observed !== "object") return false
	if (Number.isInteger(observed.pid) && observed.pid !== entry.pid) return false
	if (entry.startedAt !== undefined && entry.startedAt !== null && observed.startedAt !== entry.startedAt) return false
	if (entry.processName && observed.processName && observed.processName !== entry.processName) return false
	return true
}

function cleanupOrphans({ file, isAlive, kill, logger, writeFile = fs.writeFileSync } = {}) {
	if (typeof file !== "string" || file.length === 0) throw new TypeError("cleanupOrphans 需要 file")
	if (typeof isAlive !== "function" || typeof kill !== "function") throw new TypeError("cleanupOrphans 需要 isAlive 与 kill")
	const entries = readEntries(file, logger)
	const remaining = []
	let checked = 0
	let killed = 0
	for (const entry of entries) {
		checked += 1
		let observed
		try {
			observed = isAlive(entry)
		} catch (error) {
			logger?.warn?.("检查 sidecar 孤儿失败", { pid: entry.pid, error: String(error) })
			remaining.push(entry)
			continue
		}
		if (!observed) continue
		if (!sameProcess(entry, observed)) {
			logger?.warn?.("跳过疑似 PID 复用的进程", { pid: entry.pid })
			continue
		}
		try {
			kill(entry.pid)
			killed += 1
		} catch (error) {
			logger?.warn?.("清理 sidecar 孤儿失败", { pid: entry.pid, error: String(error) })
			remaining.push(entry)
		}
	}

	try {
		fs.mkdirSync(path.dirname(file), { recursive: true })
		const temporary = `${file}.tmp-${process.pid}`
		writeFile(temporary, JSON.stringify({ processes: remaining }, null, 2) + "\n", "utf8")
		fs.renameSync(temporary, file)
	} catch (error) {
		logger?.warn?.("写入 sidecar 孤儿台账失败", { file, error: String(error) })
	}
	return { checked, killed }
}

module.exports = { cleanupOrphans }
