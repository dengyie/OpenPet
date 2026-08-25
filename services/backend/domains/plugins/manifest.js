import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

import { ApiError } from "../../http/middleware.js"

const require = createRequire(import.meta.url)
const { normalizePluginManifest } = require("../../../../src/main/plugins/manifest.js")
const { normalizeConfigSchema } = require("../../../../src/main/plugins/config-schema.js")

function invalid(message, cause, details = null) {
	return new ApiError("PLUGIN_MANIFEST_INVALID", message, { status: 400, details, cause })
}

function isInside(candidate, root) {
	return candidate === root || candidate.startsWith(root + path.sep)
}

function resolveExisting(root, relativePath, field) {
	if (!relativePath) return ""
	const target = path.resolve(root, relativePath)
	if (!isInside(target, root)) throw invalid(`Plugin ${field} must stay inside the plugin directory`)
	let real
	try { real = fs.realpathSync(target) } catch (cause) {
		throw invalid(`Plugin ${field} does not exist`, cause, { field, path: relativePath })
	}
	if (!isInside(real, root)) throw invalid(`Plugin ${field} must stay inside the plugin directory`)
	return real
}

function resolveSource(sourcePath) {
	if (typeof sourcePath !== "string" || !path.isAbsolute(sourcePath)) {
		throw invalid("Plugin manifest path must be absolute")
	}
	let real
	try { real = fs.realpathSync(sourcePath) } catch (cause) {
		throw invalid("Plugin manifest path does not exist", cause)
	}
	const stat = fs.statSync(real)
	const manifestPath = stat.isDirectory() ? path.join(real, "plugin.json") : real
	if (path.basename(manifestPath) !== "plugin.json") throw invalid("Plugin manifest file must be named plugin.json")
	if (!fs.existsSync(manifestPath)) throw invalid("Plugin directory must contain plugin.json")
	return { basePath: fs.realpathSync(path.dirname(manifestPath)), manifestPath }
}

function readJson(file, label) {
	try { return JSON.parse(fs.readFileSync(file, "utf8")) } catch (cause) {
		throw invalid(`${label} must be valid JSON`, cause, { file: path.basename(file) })
	}
}

export function inspectPluginManifest(sourcePath, { source = "local" } = {}) {
	try {
		const { basePath, manifestPath } = resolveSource(sourcePath)
		const manifest = normalizePluginManifest(readJson(manifestPath, "Plugin manifest"), { source, basePath })
		const mainPath = resolveExisting(basePath, manifest.main, "main")
		const configSchemaPath = resolveExisting(basePath, manifest.configSchema, "config schema")
		const configSchema = configSchemaPath
			? normalizeConfigSchema(readJson(configSchemaPath, "Plugin config schema"))
			: null
		for (const asset of manifest.assets ?? []) resolveExisting(basePath, asset, "asset")
		return { manifest, configSchema, mainPath, manifestPath }
	} catch (error) {
		if (error instanceof ApiError && error.code === "PLUGIN_MANIFEST_INVALID") throw error
		throw invalid(error?.message || "Plugin manifest is invalid", error)
	}
}

export function publicManifestInspection(definition) {
	return {
		manifest: structuredClone(definition.manifest),
		configSchema: definition.configSchema ? structuredClone(definition.configSchema) : null,
		runnable: Boolean(
			definition.mainPath ||
			definition.manifest.entries?.commands?.length ||
			definition.manifest.entries?.services?.length,
		),
		requiresNativeExecution: Boolean(
			definition.manifest.entries?.commands?.length ||
			definition.manifest.entries?.services?.length ||
			definition.manifest.entries?.setup?.length,
		),
	}
}
