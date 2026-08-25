"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const PROCESS_INSPECTION_TIMEOUT_MS = 1_000
const PROCESS_INSPECTION_MAX_BUFFER = 64 * 1024

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
	if (entry.startedAt !== undefined && entry.startedAt !== null) {
		if (!Number.isFinite(observed.startedAt)) return false
		const exact = observed.startedAt === entry.startedAt
		const processStartTolerance = Number.isFinite(entry.startedAt) && entry.startedAt > 100000000000
		if (!exact && (!processStartTolerance || Math.abs(observed.startedAt - entry.startedAt) > 15_000)) return false
	}
	if (entry.processName && observed.processName !== entry.processName) return false
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
		} catch (error) {
			logger?.warn?.("清理 sidecar 孤儿失败", { pid: entry.pid, error: String(error) })
			remaining.push(entry)
			continue
		}
		try {
			const afterKill = isAlive(entry)
			if (afterKill && sameProcess(entry, afterKill)) {
				logger?.warn?.("sidecar 孤儿在终止后仍存活", { pid: entry.pid })
				remaining.push(entry)
				continue
			}
			killed += 1
		} catch (error) {
			logger?.warn?.("复核 sidecar 孤儿状态失败", { pid: entry.pid, error: String(error) })
			remaining.push(entry)
		}
	}

	try {
		writeEntries(file, remaining, writeFile)
	} catch (error) {
		logger?.warn?.("写入 sidecar 孤儿台账失败", { file, error: String(error) })
	}
	return { checked, killed }
}

function writeEntries(file, entries, writeFile = fs.writeFileSync) {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	const temporary = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
	try {
		writeFile(temporary, JSON.stringify({ processes: entries }, null, 2) + "\n", "utf8")
		fs.renameSync(temporary, file)
	} catch (error) {
		try { fs.rmSync(temporary, { force: true }) } catch {}
		throw error
	}
}

/**
 * Owns the sidecar PID ledger. Process inspection and signalling remain
 * injected so startup cleanup can be tested without touching real processes.
 */
function createSidecarPidLedger({ file, isAlive, kill, logger, now = Date.now, writeFile = fs.writeFileSync } = {}) {
	if (typeof file !== "string" || file.length === 0) throw new TypeError("createSidecarPidLedger 需要 file")
	if (typeof isAlive !== "function" || typeof kill !== "function") {
		throw new TypeError("createSidecarPidLedger 需要 isAlive 与 kill")
	}

	const read = () => readEntries(file, logger)
	const persist = (entries) => writeEntries(file, entries, writeFile)

	return {
		sweep() {
			return cleanupOrphans({ file, isAlive, kill, logger, writeFile })
		},
		register(pid, metadata = {}) {
			const normalizedPid = Number(pid)
			if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) return null
			const entries = read().filter((entry) => entry.pid !== normalizedPid)
			const entry = {
				...metadata,
				pid: normalizedPid,
				startedAt: metadata.startedAt === undefined ? now() : metadata.startedAt,
				processName: metadata.processName || "openpet-sidecar",
			}
			persist(entries.concat(entry))
			return { ...entry }
		},
		unregister(pid) {
			const normalizedPid = Number(pid)
			if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) return false
			const entries = read()
			const remaining = entries.filter((entry) => entry.pid !== normalizedPid)
			if (remaining.length === entries.length) return false
			persist(remaining)
			return true
		},
		list() {
			return read().map((entry) => ({ ...entry }))
		},
	}
}

function inspectProcessIdentity(pid) {
	try {
		if (process.platform === "win32") {
			const output = execFileSync("powershell.exe", [
				"-NoProfile", "-Command",
				`$p = Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; if ($p) { \"$($p.Name)|$($p.CreationDate)\" }`,
			], { encoding: "utf8", windowsHide: true }).trim()
			if (!output) return null
			const [name, creationDate] = output.split("|")
			const startedAt = creationDate ? Date.parse(creationDate) : NaN
			return { processName: path.basename(name), ...(Number.isFinite(startedAt) ? { startedAt } : {}) }
		}
		const name = execFileSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" }).trim()
		const startText = execFileSync("ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8" }).trim()
		if (!name) return null
		const startedAt = Date.parse(startText)
		return { processName: path.basename(name), ...(Number.isFinite(startedAt) ? { startedAt } : {}) }
	} catch {
		return null
	}
}

function createDefaultSidecarPidLedger({ app, logger, now = Date.now } = {}) {
	const userDataDir = app?.getPath?.("userData")
	if (typeof userDataDir !== "string" || userDataDir.length === 0) return null
	return createSidecarPidLedger({
		file: path.join(userDataDir, "backend", "pids.json"),
		logger,
		now,
		isAlive(entry) {
			try { process.kill(entry.pid, 0) } catch (error) {
				if (error?.code === "EPERM") {
					const identity = inspectProcessIdentity(entry.pid)
					return identity ? { pid: entry.pid, ...identity } : false
				}
				return false
			}
			const identity = inspectProcessIdentity(entry.pid)
			return identity ? { pid: entry.pid, ...identity } : false
		},
		kill(pid) {
			process.kill(pid, "SIGTERM")
		},
	})
}

module.exports = { cleanupOrphans, createSidecarPidLedger, createDefaultSidecarPidLedger }
