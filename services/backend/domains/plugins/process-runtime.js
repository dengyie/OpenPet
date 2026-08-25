import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
	createPluginEntryCwdResolver,
	createPluginProcessEnv,
	resolvePluginProcessLaunch,
} = require("../../../../src/main/services/plugin-process-support.js")
const { createServiceProcessTree } = require("../../../../src/main/services/service-process-tree.js")

const STOP_GRACE_MS = 1_500

function serviceEntries(definition) {
	return definition?.manifest?.entries?.services ?? []
}

function processName(file) {
	return path.basename(file || process.execPath)
}

function creatorDirs(manifest) {
	const root = path.join(path.dirname(manifest.basePath), ".openpet", manifest.id)
	const dirs = {
		dataDir: path.join(root, "data"),
		cacheDir: path.join(root, "cache"),
		logDir: path.join(root, "logs"),
	}
	for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true })
	return dirs
}

export function createPluginProcessRuntime({
	spawnProcess = spawn,
	platform = process.platform,
	execPath = process.execPath,
	electronVersion = process.versions.electron,
	processEnv = process.env,
	now = Date.now,
	logger,
	stopGraceMs = STOP_GRACE_MS,
	signalProcessTree,
	setTimeoutImpl = setTimeout,
	clearTimeoutImpl = clearTimeout,
} = {}) {
	const runtimes = new Map()
	const resolveCwd = createPluginEntryCwdResolver()
	const tree = signalProcessTree ? null : createServiceProcessTree({ platform })
	const signalTree = signalProcessTree ?? tree.signalServiceProcessTree

	const start = async ({ plugin, definition }) => {
		const entries = serviceEntries(definition)
		if (entries.length === 0) return { processes: [] }
		const dirs = creatorDirs(definition.manifest)
		const started = []
		try {
			for (const entry of entries) {
				const override = entry.platforms?.[platform] ?? {}
				const launch = resolvePluginProcessLaunch(override.command || entry.command, { platform, execPath, electronVersion })
				const cwd = resolveCwd(definition.manifest, override.cwd || entry.cwd || ".", "service")
				const startedAt = now()
				const child = spawnProcess(launch.file, launch.args, {
					cwd,
					detached: true,
					env: {
						...createPluginProcessEnv({ env: processEnv, platform, runAsNode: launch.runAsNode }),
						OPENPET_DATA_DIR: dirs.dataDir,
						OPENPET_CACHE_DIR: dirs.cacheDir,
						OPENPET_LOG_DIR: dirs.logDir,
					},
					shell: false,
					stdio: ["ignore", "pipe", "pipe"],
					windowsHide: true,
				})
				const runtime = {
					child,
					serviceId: entry.id,
					pid: Number(child.pid) || 0,
					processName: processName(launch.file),
					startedAt,
				}
				started.push(runtime)
				child.once?.("exit", () => {
					const remaining = (runtimes.get(plugin.id) ?? []).filter((item) => item !== runtime)
					if (remaining.length) runtimes.set(plugin.id, remaining)
					else runtimes.delete(plugin.id)
				})
				child.once?.("error", (error) => logger?.error?.("Plugin process failed", {
					pluginId: plugin.id, serviceId: entry.id, error: String(error),
				}))
			}
			runtimes.set(plugin.id, started)
			return { processes: started.map(({ pid, processName, startedAt, serviceId }) => ({ pid, processName, startedAt, serviceId })) }
		} catch (error) {
			for (const runtime of started) {
				try { signalTree(runtime.pid, "SIGKILL") } catch {}
			}
			throw error
		}
	}

	const stop = async ({ plugin }) => {
		const active = runtimes.get(plugin.id) ?? []
		if (active.length === 0) return { ok: true, alreadyStopped: true }
		const pending = active.filter((runtime) => runtime.pid > 0)
		if (pending.length === 0) {
			runtimes.delete(plugin.id)
			return { ok: true, alreadyStopped: true }
		}
		await Promise.all(pending.map((runtime) => new Promise((resolve, reject) => {
			let settled = false
			const finish = (error) => {
				if (settled) return
				settled = true
				clearTimeoutImpl(timer)
				if (error) reject(error)
				else resolve()
			}
			const timer = setTimeoutImpl(() => {
				try { signalTree(runtime.pid, "SIGKILL") } catch (error) { finish(error); return }
				finish()
			}, stopGraceMs)
			timer?.unref?.()
			runtime.child.once?.("exit", () => finish())
			try { signalTree(runtime.pid, "SIGTERM") } catch (error) { finish(error) }
		})))
		runtimes.delete(plugin.id)
		return { ok: true }
	}

	return { start, stop }
}

export const PLUGIN_PROCESS_STOP_GRACE_MS = STOP_GRACE_MS
