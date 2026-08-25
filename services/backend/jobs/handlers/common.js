import { ApiError } from "../../http/middleware.js"

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
	}
}
