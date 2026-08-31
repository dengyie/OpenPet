import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

import { ApiError } from "../../http/middleware.js"
import { inspectPluginManifest, publicManifestInspection } from "./manifest.js"

const require = createRequire(import.meta.url)
const { coerceConfigValue } = require("../../../../src/main/plugins/config-schema.js")

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function equal(left, right) {
	return JSON.stringify(left) === JSON.stringify(right)
}

function changedEntries(previous, next) {
	if (!isRecord(previous) || !isRecord(next)) return null
	const changes = new Map()
	for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
		if (!equal(previous[key], next[key])) changes.set(key, Object.hasOwn(next, key) ? structuredClone(next[key]) : undefined)
	}
	return changes
}

function pluginSettingChanges(previous, next) {
	const changes = new Map()
	for (const section of new Set([...Object.keys(previous), ...Object.keys(next)])) {
		if (equal(previous[section], next[section])) continue
		changes.set(section, changedEntries(previous[section], next[section]) ?? structuredClone(next[section]))
	}
	return changes
}

function buildPluginPatch(currentPlugins, changes) {
	const patch = {}
	for (const [section, change] of changes) {
		if (!(change instanceof Map)) {
			patch[`plugins.${section}`] = structuredClone(change)
			continue
		}
		const merged = { ...(isRecord(currentPlugins[section]) ? currentPlugins[section] : {}) }
		for (const [key, value] of change) {
			if (value === undefined) delete merged[key]
			else merged[key] = structuredClone(value)
		}
		patch[`plugins.${section}`] = merged
	}
	return patch
}

export function createLegacyPluginSettingsAdapter(store) {
	if (!store?.read || !store?.patch) throw new TypeError("plugin settings store requires read/patch")
	let baseline = store.read()
	return {
		get() {
			baseline = store.read()
			return structuredClone(baseline.values)
		},
		save(nextValues = {}) {
			const changes = pluginSettingChanges(baseline.values.plugins ?? {}, nextValues.plugins ?? {})
			if (changes.size === 0) return structuredClone(nextValues)
			for (let attempt = 0; attempt < 4; attempt += 1) {
				const current = store.read()
				try {
					store.patch({
						ifVersion: current.version,
						patch: buildPluginPatch(current.values.plugins ?? {}, changes),
					})
					baseline = store.read()
					return structuredClone(baseline.values)
				} catch (error) {
					if (error?.code !== "CONFLICT" || attempt === 3) throw error
				}
			}
			return structuredClone(nextValues)
		},
	}
}

function normalizeConfig(schema, value = {}) {
	if (!schema) return {}
	return Object.fromEntries(schema.properties.map((field) => [field.key, coerceConfigValue(value[field.key], field)]))
}

export function createPluginRegistry({ userDataDir, settings, logger } = {}) {
	if (typeof userDataDir !== "string" || !path.isAbsolute(userDataDir)) throw new TypeError("plugin userDataDir must be absolute")
	const pluginDir = path.join(userDataDir, "plugins")
	const settingsService = createLegacyPluginSettingsAdapter(settings)
	fs.mkdirSync(pluginDir, { recursive: true })

	const definitions = () => {
		const found = []
		for (const entry of fs.readdirSync(pluginDir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) continue
			try { found.push(inspectPluginManifest(path.join(pluginDir, entry.name))) } catch (error) {
				logger?.warn?.("忽略无效插件清单", { pluginDir: entry.name, error: String(error) })
			}
		}
		return found.sort((left, right) => left.manifest.id.localeCompare(right.manifest.id))
	}
	const definition = (id) => definitions().find((item) => item.manifest.id === id) ?? null
	const requireDefinition = (id) => {
		const found = definition(id)
		if (!found) throw new ApiError("NOT_FOUND", "Plugin not found", { details: { pluginId: id } })
		return found
	}
	const pluginSettings = () => settings.read().values.plugins ?? {}
	const requiresNative = (item) => publicManifestInspection(item).requiresNativeExecution
	const isNativeApproved = (id) => pluginSettings().nativeExecutionApproved?.[id] === true
	const config = (id) => {
		const item = requireDefinition(id)
		return normalizeConfig(item.configSchema, pluginSettings().config?.[id] ?? {})
	}
	const view = (item) => ({
		...publicManifestInspection(item).manifest,
		configSchema: item.configSchema ? structuredClone(item.configSchema) : null,
		config: config(item.manifest.id),
		enabled: pluginSettings().enabled?.[item.manifest.id] === true,
		requiresNativeExecution: requiresNative(item),
		nativeExecutionApproved: requiresNative(item) ? isNativeApproved(item.manifest.id) : false,
	})
	const updateSection = (section, mutate) => {
		for (let attempt = 0; attempt < 4; attempt += 1) {
			const current = settings.read()
			const previous = isRecord(current.values.plugins?.[section]) ? current.values.plugins[section] : {}
			const next = mutate(structuredClone(previous))
			try {
				settings.patch({ ifVersion: current.version, patch: { [`plugins.${section}`]: next } })
				return settings.read()
			} catch (error) {
				if (error?.code !== "CONFLICT" || attempt === 3) throw error
			}
		}
		return settings.read()
	}
	const setEnabled = (id, enabled) => {
		requireDefinition(id)
		updateSection("enabled", (current) => ({ ...current, [id]: Boolean(enabled) }))
		return get(id)
	}
	const setNativeExecutionApproved = (id, approved) => {
		requireDefinition(id)
		updateSection("nativeExecutionApproved", (current) => ({ ...current, [id]: Boolean(approved) }))
		return get(id)
	}
	const get = (id) => view(requireDefinition(id))
	const list = () => definitions().map(view)
	const setConfig = (id, patch = {}) => {
		const item = requireDefinition(id)
		if (!item.configSchema) throw new ApiError("VALIDATION_FAILED", "Plugin does not declare a config schema")
		if (!isRecord(patch)) throw new ApiError("VALIDATION_FAILED", "Plugin config patch must be an object")
		let normalized
		updateSection("config", (current) => {
			normalized = normalizeConfig(item.configSchema, {
				...normalizeConfig(item.configSchema, current[id] ?? {}),
				...patch,
			})
			return { ...current, [id]: normalized }
		})
		return normalized
	}

	return { pluginDir, settingsService, list, get, definition: requireDefinition, config, setConfig, setEnabled, setNativeExecutionApproved, isNativeApproved, requiresNative }
}
