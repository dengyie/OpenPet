import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"

const require = createRequire(import.meta.url)
const { createServiceProcessTree } = require("../../../../src/main/services/service-process-tree.js")

export const PID_LEDGER_FILE = "pids.json"

const INSPECTION_TIMEOUT_MS = 1_000
const INSPECTION_MAX_BUFFER = 64 * 1024

function clone(value) {
	return structuredClone(value)
}

function normalizePid(value) {
	const pid = Number(value)
	return Number.isInteger(pid) && pid > 0 ? pid : 0
}

function normalizeEntries(raw) {
	const entries = Array.isArray(raw) ? raw : (Array.isArray(raw?.processes) ? raw.processes : [])
	return entries.filter((entry) => entry && typeof entry === "object" && normalizePid(entry.pid) > 0)
}

function readEntries(file, logger) {
	try {
		return normalizeEntries(JSON.parse(fs.readFileSync(file, "utf8")))
	} catch (error) {
		if (error?.code !== "ENOENT") logger?.warn?.("读取插件 PID 台账失败", { file, error: String(error) })
		return []
	}
}

function writeEntries(file, entries) {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	const temporary = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
	try {
		fs.writeFileSync(temporary, JSON.stringify({ processes: entries }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 })
		fs.renameSync(temporary, file)
	} catch (error) {
		try { fs.rmSync(temporary, { force: true }) } catch {}
		throw error
	}
}

function basename(value) {
	return typeof value === "string" && value ? path.basename(value).toLowerCase() : ""
}

function sameProcess(entry, observed) {
	if (!observed || observed === false || typeof observed !== "object") return false
	if (normalizePid(observed.pid) !== normalizePid(entry.pid)) return false
	if (entry.processName && basename(observed.processName) !== basename(entry.processName)) return false
	if (entry.startedAt !== undefined && entry.startedAt !== null) {
		if (!Number.isFinite(observed.startedAt)) return false
		if (observed.startedAt !== entry.startedAt) {
			const unixTimestamp = Number(entry.startedAt) > 100_000_000_000
			if (!unixTimestamp || Math.abs(observed.startedAt - entry.startedAt) > 15_000) return false
		}
	}
	return true
}

function inspectProcessIdentity(pid, {
	platform = process.platform,
	execFileSyncImpl = execFileSync,
} = {}) {
	const options = { encoding: "utf8", timeout: INSPECTION_TIMEOUT_MS, maxBuffer: INSPECTION_MAX_BUFFER }
	try {
		if (platform === "win32") {
			const output = execFileSyncImpl("powershell.exe", [
				"-NoProfile", "-Command",
				`$p = Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; if ($p) { $started = $p.CreationDate.ToUniversalTime().ToString('o'); \"$($p.Name)|$started\" }`,
			], { ...options, windowsHide: true }).trim()
			if (!output) return null
			const [processName, startedText] = output.split("|")
			const startedAt = Date.parse(startedText || "")
			return processName && Number.isFinite(startedAt) ? { pid, processName: path.basename(processName), startedAt } : null
		}
		const processName = execFileSyncImpl("ps", ["-p", String(pid), "-o", "comm="], options).trim()
		const startedAt = Date.parse(execFileSyncImpl("ps", ["-p", String(pid), "-o", "lstart="], options).trim())
		return processName && Number.isFinite(startedAt) ? { pid, processName: path.basename(processName), startedAt } : null
	} catch {
		return null
	}
}

export function createProcessLedger({
	userDataDir,
	logger,
	now = Date.now,
	platform = process.platform,
	execFileSyncImpl = execFileSync,
	killProcess = process.kill,
	signalProcessTree,
	isAlive,
	kill,
} = {}) {
	if (typeof userDataDir !== "string" || !path.isAbsolute(userDataDir)) throw new TypeError("process ledger userDataDir must be absolute")
	const file = path.join(userDataDir, "backend", PID_LEDGER_FILE)
	const tree = signalProcessTree ? null : createServiceProcessTree({ platform, execFileSyncImpl, killProcessImpl: killProcess })
	const inspect = (pid) => inspectProcessIdentity(pid, { platform, execFileSyncImpl })
	const alive = isAlive || ((entry) => {
		try { killProcess(entry.pid, 0) } catch (error) {
			if (error?.code === "ESRCH") return false
			if (error?.code !== "EPERM") throw error
		}
		return inspect(entry.pid)
	})
	const terminate = kill || ((pid) => {
		if (typeof signalProcessTree === "function") return signalProcessTree(pid, "SIGTERM")
		return tree.signalServiceProcessTree(pid, "SIGTERM")
	})
	const read = () => readEntries(file, logger)
	const persist = (entries) => writeEntries(file, entries)

	return {
		file,
		register(pid, meta = {}) {
			const normalizedPid = normalizePid(pid)
			if (!normalizedPid) return null
			const entries = read().filter((entry) => normalizePid(entry.pid) !== normalizedPid)
			const entry = {
				...clone(meta),
				pid: normalizedPid,
				startedAt: meta.startedAt === undefined ? now() : meta.startedAt,
				processName: meta.processName || "openpet-plugin",
			}
			persist(entries.concat(entry))
			return clone(entry)
		},
		unregister(pid) {
			const normalizedPid = normalizePid(pid)
			if (!normalizedPid) return false
			const entries = read()
			const remaining = entries.filter((entry) => normalizePid(entry.pid) !== normalizedPid)
			if (remaining.length === entries.length) return false
			persist(remaining)
			return true
		},
		list() {
			return read().map(clone)
		},
		sweep() {
			const remaining = []
			let checked = 0
			let killed = 0
			for (const entry of read()) {
				checked += 1
				let observed
				try { observed = alive(entry) } catch (error) {
					logger?.warn?.("检查插件孤儿进程失败", { pid: entry.pid, error: String(error) })
					remaining.push(entry)
					continue
				}
				if (!observed) continue
				if (!sameProcess(entry, observed)) {
					logger?.warn?.("跳过疑似 PID 复用的插件进程", { pid: entry.pid })
					continue
				}
				try { terminate(entry.pid) } catch (error) {
					logger?.warn?.("清理插件孤儿进程失败", { pid: entry.pid, error: String(error) })
					remaining.push(entry)
					continue
				}
				let after
				try { after = alive(entry) } catch (error) {
					logger?.warn?.("复核插件孤儿进程失败", { pid: entry.pid, error: String(error) })
					remaining.push(entry)
					continue
				}
				if (after && sameProcess(entry, after)) remaining.push(entry)
				else killed += 1
			}
			persist(remaining)
			return { checked, killed }
		},
	}
}

export const PROCESS_INSPECTION_TIMEOUT_MS = INSPECTION_TIMEOUT_MS
export const PROCESS_INSPECTION_MAX_BUFFER = INSPECTION_MAX_BUFFER
