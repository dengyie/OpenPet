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

export function createPluginService({ db, jobs, logs, bridge, dialog, root, userDataDir, settings, logger, now = Date.now, emit, processLedger: injectedProcessLedger, processRuntime: injectedProcessRuntime, runtimeBridgeServer } = {}) {
	if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("plugin root must be absolute")
	const settingsStore = settings ?? createSettingsStore({ file: path.join(userDataDir, "backend", "settings.json"), logger })
	const registry = createPluginRegistry({ userDataDir, settings: settingsStore, logger })
	const processLedger = injectedProcessLedger ?? createProcessLedger({ userDataDir, logger, now })
	const processRuntime = injectedProcessRuntime ?? createPluginProcessRuntime({ logger, now, bridgeServer: runtimeBridgeServer })
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
		logs.appendPlugin(entry)
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
	const audit = (level, message, details) => logger?.[level]?.(message, details)
	const lifecycle = createPluginLifecycle({
		registry,
		bridge,
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

	return {
		list,
		get,
		install,
		installGithub,
		inspectInstall,
		inspectGithub,
		commitInstall,
		commitGithubInstall,
		clearInstallSelection: installer.clearPendingSelection,
		remove,
		start: lifecycle.start,
		stop: lifecycle.stop,
		status: lifecycle.status,
		config: registry.config,
		setConfig: registry.setConfig,
		command: lifecycle.command,
		appendLog,
		getLogs,
		clearLogs,
		syncBundled,
		inspectManifest,
		stopAll: lifecycle.stopAll,
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
