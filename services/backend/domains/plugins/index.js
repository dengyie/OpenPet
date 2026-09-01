import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import {
	EVENT_NAMES,
} from "@openpet/contracts"

import { ApiError } from "../../http/middleware.js"
import { createSettingsStore } from "../settings.js"
import { createPluginLifecycle } from "./lifecycle.js"
import { inspectPluginManifest, publicManifestInspection } from "./manifest.js"
import { createPluginRegistry } from "./registry.js"
import { createProcessLedger } from "./process-ledger.js"
import { createPluginProcessRuntime } from "./process-runtime.js"
import { createPluginLogWriter } from "./plugin-log-writer.js"

const require = createRequire(import.meta.url)
const { createPluginInstallService } = require("../../../../src/main/services/plugin-install-service.js")
const { createPluginGithubImportService } = require("../../../../src/main/services/plugin-github-import-service.js")
const { syncBundledPlugins } = require("../../../../src/main/services/bundled-plugin-sync-service.js")
const { sanitizeLogText } = require("../../../../src/main/services/log-safety.js")

const PLUGIN_EVENTS = new Set(EVENT_NAMES.filter((name) => name.startsWith("plugin.")))

function manifestError(error) {
	if (error instanceof ApiError && error.code === "PLUGIN_MANIFEST_INVALID") return error
	return new ApiError("PLUGIN_MANIFEST_INVALID", error?.message || "Plugin manifest is invalid", { status: 400, cause: error })
}

function installError(error) {
	if (error instanceof ApiError) return error
	const message = error?.message || "Plugin installation failed"
	if (/no longer available|signature|package changed|source cannot/i.test(message)) return manifestError(error)
	if (/already installed/i.test(message)) return new ApiError("CONFLICT", message, { cause: error })
	if (/plugin is blocked/i.test(message)) return new ApiError("PERMISSION_DENIED", message, { cause: error })
	return new ApiError("INTERNAL", "Plugin installation failed", { cause: error })
}

export function createPluginService({ db, jobs, logs, bridge, commandServer, dialog, root, userDataDir, settings, logger, now = Date.now, emit, processLedger: injectedProcessLedger, processRuntime: injectedProcessRuntime, runtimeBridgeServer, logWriter: injectedLogWriter } = {}) {
	if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("plugin root must be absolute")
	const settingsStore = settings ?? createSettingsStore({ file: path.join(userDataDir, "backend", "settings.json"), logger })
	const registry = createPluginRegistry({ userDataDir, settings: settingsStore, logger })
	const processLedger = injectedProcessLedger ?? createProcessLedger({ userDataDir, logger, now })
	const processRuntime = injectedProcessRuntime ?? createPluginProcessRuntime({ logger, now, bridgeServer: runtimeBridgeServer })
	const logWriter = injectedLogWriter ?? createPluginLogWriter({ append: (entry) => logs.appendPlugin(entry), logger })
	const publish = (name, payload) => {
		if (!PLUGIN_EVENTS.has(name)) throw new TypeError(`Unknown plugin event: ${name}`)
		emit?.(name, payload)
	}
	const appendLog = ({ pluginId, level = "info", message, at = now() } = {}) => {
		const normalizedPluginId = String(pluginId ?? "")
		const normalizedLevel = ["error", "warn"].includes(level) ? level : "info"
		const normalizedMessage = sanitizeLogText(message, { maxChars: 240 })
		if (!normalizedPluginId || !normalizedMessage) {
			throw new ApiError("VALIDATION_FAILED", "插件日志字段无效")
		}
		const entry = {
			pluginId: normalizedPluginId,
			level: normalizedLevel,
			message: normalizedMessage,
			at: Number.isFinite(Number(at)) ? Math.trunc(Number(at)) : now(),
		}
		if (typeof logs?.appendPlugin !== "function") {
			throw new ApiError("BACKEND_UNAVAILABLE", "Plugin logs repository is unavailable")
		}
		const queued = logWriter.append(entry)
		if (!queued.accepted) {
			const rejected = { ...structuredClone(entry), accepted: false, reason: queued.reason }
			publish("plugin.log", rejected)
			return rejected
		}
		publish("plugin.log", entry)
		return structuredClone(entry)
	}
	const getLogs = (pluginId, query = {}) => {
		if (typeof logs?.listPlugin !== "function") {
			throw new ApiError("BACKEND_UNAVAILABLE", "Plugin logs repository is unavailable")
		}
		return logs.listPlugin({ pluginId, ...query })
	}
	const clearLogs = (pluginId) => {
		if (typeof db?.prepare !== "function" || typeof db?.transaction !== "function") {
			throw new ApiError("BACKEND_UNAVAILABLE", "Plugin logs repository is unavailable")
		}
		const normalizedPluginId = String(pluginId ?? "")
		if (!normalizedPluginId) throw new ApiError("VALIDATION_FAILED", "pluginId 不能为空")
		const result = db.transaction(() => db.prepare("DELETE FROM plugin_logs WHERE plugin_id = ?").run(normalizedPluginId))
		return { ok: true, pluginId: normalizedPluginId, deleted: result.changes ?? 0 }
	}
	let logsClosed = false
	let logsClosePromise
	const closeLogs = () => {
		if (logsClosed) return logsClosePromise ?? Promise.resolve()
		logsClosed = true
		logsClosePromise = Promise.resolve().then(() => logWriter.close())
		return logsClosePromise
	}
	const exportLogs = (filters = {}) => {
		const requested = String(filters.format || "json").toLowerCase()
		const entries = filters.pluginId ? getLogs(filters.pluginId, filters) : []
		if (requested === "csv") {
			return ["id,pluginId,level,message,at", ...entries.map((entry) => [entry.id, entry.pluginId, entry.level, entry.message, entry.at].map((value) => JSON.stringify(value ?? "")).join(","))].join("\n")
		}
		return JSON.stringify(entries)
	}
	const audit = (level, message, details) => logger?.[level]?.(message, details)
	const lifecycle = createPluginLifecycle({
		registry,
		bridge,
		commandServer,
		processRuntime,
		processLedger,
		now,
		audit,
		onStatus: (state) => publish("plugin.status-changed", state),
	})
	const installer = createPluginInstallService({
		settingsService: registry.settingsService,
		pluginDir: registry.pluginDir,
	})
	const bundledPluginDirs = ["creator-studio", "agent-awareness", "im-gateway"]
		.map((name) => path.join(root, "examples", "plugins", name))
	const runtimeDirs = (id) => {
		registry.definition(id)
		const runtimeRoot = path.join(registry.pluginDir, ".openpet", id)
		const dirs = { dataDir: path.join(runtimeRoot, "data"), cacheDir: path.join(runtimeRoot, "cache"), logDir: path.join(runtimeRoot, "logs") }
		for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true })
		return dirs
	}
	const productionRequest = (operation, payload) => {
		if (typeof bridge?.request !== "function") throw new ApiError("BACKEND_UNAVAILABLE", "Plugin production service is unavailable")
		return bridge.request({ type: "plugin.production.request", operation, ...payload })
	}
	const clearStorage = (id) => productionRequest("storage.clear", { pluginId: id })

	const list = () => registry.list().map((plugin) => ({ ...plugin, runtime: lifecycle.status(plugin.id) }))
	const get = (id) => ({ ...registry.get(id), runtime: lifecycle.status(id) })
	const inspectManifest = (sourcePath) => publicManifestInspection(inspectPluginManifest(sourcePath))
	const inspectInstall = async (source, context = {}) => {
		let selectionId
		try {
			return await installer.inspectPluginPackage(String(source), { tempRoot: context.tmpDir })
		} catch (error) {
			throw manifestError(error)
		}
	}
	const commitInstall = (selectionId) => {
		let result
		try { result = installer.installPlugin(selectionId) } catch (error) { throw installError(error) }
		const plugin = get(result.pluginId)
		audit("info", "Plugin installed", { pluginId: result.pluginId })
		publish("plugin.installed", { pluginId: result.pluginId, at: now() })
		return plugin
	}
	const commitUpdate = (selectionId) => {
		let result
		try { result = installer.updatePlugin(selectionId) } catch (error) { throw installError(error) }
		const plugin = get(result.pluginId)
		audit("info", "Plugin updated", { pluginId: result.pluginId })
		publish("plugin.updated", { pluginId: result.pluginId, at: now() })
		return plugin
	}
	const install = async (source, context = {}) => {
		let selectionId
		try {
			selectionId = typeof source === "object" && source?.selectionId
				? source.selectionId
				: (await inspectInstall(source, context)).selectionId
		} catch (error) {
			throw manifestError(error)
		}
		return commitInstall(selectionId)
	}
	const inspectGithub = async (repositoryUrl, context = {}) => {
		let review
		try {
			const githubImporter = createPluginGithubImportService({
				pluginInstallService: installer,
				tempRoot: context.tmpDir,
			})
			review = await githubImporter.inspectRepositoryUrl(repositoryUrl, { signal: context.signal })
			return review
		} catch (error) {
			throw installError(error)
		}
	}
	const commitGithubInstall = (selectionId) => {
		const plugin = commitInstall(selectionId)
		audit("info", "Plugin installed from GitHub", { pluginId: plugin.id })
		return plugin
	}
	const installGithub = async (repositoryUrl, context = {}) => {
		const review = await inspectGithub(repositoryUrl, context)
		return commitGithubInstall(review.selectionId)
	}
	const remove = async (id, options = {}) => {
		const current = lifecycle.status(id)
		if (["starting", "running", "stopping"].includes(current.status)) await lifecycle.stop(id)
		const result = installer.uninstallPlugin(id, options)
		audit("info", "Plugin removed", { pluginId: id })
		publish("plugin.removed", { pluginId: id, at: now() })
		return result
	}
	const syncBundled = () => {
		const result = syncBundledPlugins({
			pluginDir: registry.pluginDir,
			bundledPluginDirs,
			settingsService: registry.settingsService,
		})
		for (const item of result.synced) {
			audit("info", "Bundled plugin synchronized", { pluginId: item.pluginId })
			publish("plugin.installed", { pluginId: item.pluginId, at: now(), bundled: true })
		}
		return result
	}
	const stopAll = async () => {
		const result = await lifecycle.stopAll()
		try {
			await closeLogs()
		} catch (error) {
			audit("error", "Plugin log writer failed during shutdown", { error: String(error) })
			return { ...result, ok: false, logError: error }
		}
		return result
	}

	return {
		list,
		get,
		install,
		installGithub,
		inspectInstall,
		inspectGithub,
		commitInstall,
		commitUpdate,
		commitGithubInstall,
		clearInstallSelection: installer.clearPendingSelection,
		remove,
		start: lifecycle.start,
		stop: lifecycle.stop,
		status: lifecycle.status,
		setEnabled: lifecycle.setEnabled,
		setNativeExecutionApproved: lifecycle.setNativeExecutionApproved,
		commandInput: commandServer?.takeInput,
		config: registry.config,
		setConfig: registry.setConfig,
		permissions: (id) => registry.definition(id).manifest.permissions ?? [],
		setPermissions: (id, permissions) => {
			if (!Array.isArray(permissions)) throw new ApiError("VALIDATION_FAILED", "permissions must be an array")
			const definition = registry.definition(id)
			if (!definition.manifest.permissions) throw new ApiError("VALIDATION_FAILED", "Plugin permissions are immutable")
			if (JSON.stringify([...permissions].sort()) !== JSON.stringify([...definition.manifest.permissions].sort())) {
				throw new ApiError("VALIDATION_FAILED", "Plugin permissions must match its signed manifest")
			}
			return get(id)
		},
		definition: registry.definition,
		runtimeDirs,
		clearStorage,
		runSetup: (pluginId, setupId) => productionRequest("setup", { pluginId, setupId }),
		serviceStart: (pluginId, serviceId) => productionRequest("service.start", { pluginId, serviceId }),
		serviceStop: (pluginId, serviceId) => productionRequest("service.stop", { pluginId, serviceId }),
		serviceHealth: (pluginId, serviceId) => productionRequest("service.health", { pluginId, serviceId }),
		saveServiceHealthPolicy: (pluginId, serviceId, policy) => productionRequest("service.health-policy", { pluginId, serviceId, policy }),
		getSecretState: () => productionRequest("secret.state", {}),
		saveSecret: (_id, token) => productionRequest("secret.save", { token }),
		clearSecret: () => productionRequest("secret.clear", {}),
		creatorDefaultFlow: (_id, prompt) => productionRequest("creator.default-flow", { prompt }),
		clearInstallSelection: installer.clearPendingSelection,
		command: lifecycle.command,
		dispatchCommand: commandServer?.dispatch,
		appendLog,
		flushLogs: logWriter.flush,
		closeLogs,
		logWriter,
		getLogs,
		clearLogs,
		exportLogs,
		syncBundled,
		inspectManifest,
		stopAll,
		processLedger,
		runtimeBridgeServer,
		db,
		jobs,
		dialog,
	}
}

export function createInitializedPluginService(options = {}) {
	const service = createPluginService(options)
	service.syncBundled()
	return service
}
