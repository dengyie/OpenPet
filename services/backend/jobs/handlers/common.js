import { ApiError } from "../../http/middleware.js"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { githubRepositoryResourceKey, validateRepositoryUrl } = require("../../../../src/main/services/plugin-github-import-service.js")

export function requirePluginMethod(plugins, name) {
	if (typeof plugins?.[name] !== "function") {
		throw new ApiError("BACKEND_UNAVAILABLE", `Plugin ${name} service is unavailable`)
	}
	return plugins[name].bind(plugins)
}

export function pluginResourceKey(input = {}) {
	const id = typeof input.pluginId === "string" && input.pluginId.trim()
		? input.pluginId.trim()
		: typeof input.id === "string" && input.id.trim()
			? input.id.trim()
			: ""
	return id ? `plugin:${id}` : null
}

export function pluginGithubResourceKey(input = {}) {
	const pluginKey = pluginResourceKey(input)
	if (pluginKey) return pluginKey
	if (typeof input.repositoryUrl !== "string" || input.repositoryUrl.trim().length === 0) return null
	return githubRepositoryResourceKey(input.repositoryUrl)
}

export function resolvePrivatePluginInput(input, ctx = {}) {
	if (input?.redacted !== true) return input
	if (ctx.privateInput && typeof ctx.privateInput === "object") return ctx.privateInput
	throw new ApiError("CONFLICT", "Plugin Job 的临时输入已不可用", { status: 409, retryable: false })
}

export function normalizePluginGithubRepositoryUrl(repositoryUrl) {
	return validateRepositoryUrl(repositoryUrl).repositoryUrl
}

export function report(ctx, frame) {
	if (typeof ctx?.progress === "function") ctx.progress(frame)
}

export function throwIfAborted(signal) {
	if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
}

export async function finalizing(ctx, operation) {
	throwIfAborted(ctx?.signal)
	if (typeof ctx?.finalize === "function") return ctx.finalize(operation)
	report(ctx, { phase: "finalizing", percent: 100 })
	return operation()
}

export function operationContext(ctx = {}) {
	return {
		db: ctx.db,
		logger: ctx.logger,
		signal: ctx.signal,
		tmpDir: ctx.tmpDir,
		progress: ctx.progress,
		registerProcess: ctx.registerProcess,
		commandInput: ctx.commandInput,
	}
}
