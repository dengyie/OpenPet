import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { ApiError, sendList, sendSuccess } from "../http/middleware.js"

export const PLUGIN_ROUTES = Object.freeze([
	"GET /plugins",
	"GET /plugins/:id",
	"POST /plugins/install",
	"POST /plugins/install/github",
	"DELETE /plugins/:id",
	"POST /plugins/:id/enable",
	"POST /plugins/:id/start",
	"POST /plugins/:id/stop",
	"POST /plugins/:id/restart",
	"GET /plugins/:id/status",
	"GET /plugins/:id/logs",
	"DELETE /plugins/:id/logs",
	"POST /plugins/:id/commands/:cmd",
	"GET /plugins/:id/permissions",
	"PUT /plugins/:id/permissions",
	"POST /plugins/:id/native-approval",
	"POST /plugins/validate",
	"POST /plugins/sync-bundled",
	"GET /plugins/:id/config",
	"PUT /plugins/:id/config",
])

function requireMethod(plugins, name) {
	if (typeof plugins?.[name] !== "function") {
		throw new ApiError("BACKEND_UNAVAILABLE", `Plugin ${name} service is unavailable`)
	}
	return plugins[name].bind(plugins)
}

function requiredString(value, field) {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ApiError("VALIDATION_FAILED", `${field} is required`, { details: { field } })
	}
	return value.trim()
}

function requiredBoolean(value, field) {
	if (typeof value !== "boolean") {
		throw new ApiError("VALIDATION_FAILED", `${field} must be a boolean`, { details: { field } })
	}
	return value
}

function objectBody(body, field = "body") {
	if (body === null || typeof body !== "object" || Array.isArray(body)) {
		throw new ApiError("VALIDATION_FAILED", `${field} must be an object`, { details: { field } })
	}
	return body
}

function logsFor(plugins, pluginId, query) {
	if (typeof plugins?.getLogs === "function") return plugins.getLogs(pluginId, query)
	if (typeof plugins?.logs?.listPlugin === "function") {
		return plugins.logs.listPlugin({ pluginId, ...query })
	}
	throw new ApiError("BACKEND_UNAVAILABLE", "Plugin logs service is unavailable")
}

function clearLogsFor(plugins, pluginId) {
	if (typeof plugins?.clearLogs === "function") return plugins.clearLogs(pluginId)
	throw new ApiError("BACKEND_UNAVAILABLE", "Plugin logs service is unavailable")
}

function enqueue(plugins, kind, input, resourceKey = null) {
	const dispatch = requireMethod(plugins, "enqueueJob")
	const job = dispatch({ id: `${kind}:${randomUUID()}`, kind, input, resourceKey })
	return { jobId: job.id }
}

function inspectLocalPluginId(plugins, sourcePath) {
	const inspection = requireMethod(plugins, "inspectManifest")(sourcePath)
	const pluginId = inspection?.manifest?.id
	if (typeof pluginId !== "string" || pluginId.trim().length === 0) {
		throw new ApiError("PLUGIN_MANIFEST_INVALID", "Plugin manifest id is required", { status: 400 })
	}
	return pluginId.trim()
}

function sourceSupportsManifestPreflight(sourcePath) {
	try {
		const stats = fs.statSync(sourcePath)
		if (stats.isDirectory()) return true
		return stats.isFile() && path.basename(sourcePath) === "plugin.json"
	} catch {
		return false
	}
}

export function registerPluginRoutes(router, { plugins } = {}) {
	if (!router || typeof router.register !== "function") throw new TypeError("registerPluginRoutes requires router")
	if (!plugins || typeof plugins !== "object") throw new TypeError("registerPluginRoutes requires plugins service")

	router.get("/plugins", (ctx) => {
		const items = requireMethod(plugins, "list")()
		return sendList(ctx, items)
	})
	router.get("/plugins/:id", (ctx) => sendSuccess(ctx, requireMethod(plugins, "get")(ctx.params.id)))
	router.post("/plugins/install", (ctx) => {
		const body = objectBody(ctx.body)
		if (body.selectionId !== undefined) {
			const selectionId = requiredString(body.selectionId, "selectionId")
			return sendSuccess(ctx, enqueue(plugins, "plugin.install", { selectionId, update: body.update === true }, null), 202)
		}
		const sourcePath = requiredString(body.path, "path")
		if (!sourceSupportsManifestPreflight(sourcePath)) {
			return sendSuccess(ctx, enqueue(plugins, "plugin.install", { path: sourcePath }), 202)
		}
		const pluginId = inspectLocalPluginId(plugins, sourcePath)
		return sendSuccess(ctx, enqueue(plugins, "plugin.install", { path: sourcePath, pluginId }, `plugin:${pluginId}`), 202)
	})
	router.post("/plugins/install/github", (ctx) => {
		const body = objectBody(ctx.body)
		return sendSuccess(ctx, enqueue(plugins, "plugin.install.github", {
			repositoryUrl: requiredString(body.repositoryUrl, "repositoryUrl"),
		}), 202)
	})
	router.delete("/plugins/:id", async (ctx) => sendSuccess(ctx, await requireMethod(plugins, "remove")(
		ctx.params.id,
		{ removeStorage: ctx.query.removeStorage === "true" },
	)))
	router.post("/plugins/:id/enable", async (ctx) => {
		const body = objectBody(ctx.body)
		return sendSuccess(ctx, await requireMethod(plugins, "setEnabled")(
			ctx.params.id,
			requiredBoolean(body.enabled, "enabled"),
		))
	})
	router.post("/plugins/:id/start", async (ctx) => sendSuccess(ctx, await requireMethod(plugins, "start")(ctx.params.id)))
	router.post("/plugins/:id/stop", async (ctx) => sendSuccess(ctx, await requireMethod(plugins, "stop")(ctx.params.id)))
	router.post("/plugins/:id/restart", async (ctx) => {
		if (typeof plugins.restart === "function") return sendSuccess(ctx, await plugins.restart(ctx.params.id))
		const current = requireMethod(plugins, "status")(ctx.params.id)
		if (["starting", "running", "stopping"].includes(current?.status)) {
			await requireMethod(plugins, "stop")(ctx.params.id)
		}
		return sendSuccess(ctx, await requireMethod(plugins, "start")(ctx.params.id))
	})
	router.get("/plugins/:id/status", (ctx) => sendSuccess(ctx, requireMethod(plugins, "status")(ctx.params.id)))
	router.get("/plugins/:id/logs", (ctx) => {
		const items = logsFor(plugins, ctx.params.id, ctx.query)
		return sendList(ctx, items)
	})
	router.delete("/plugins/:id/logs", (ctx) => sendSuccess(ctx, clearLogsFor(plugins, ctx.params.id)))
	router.post("/plugins/:id/commands/:cmd", (ctx) => sendSuccess(ctx, enqueue(
		plugins,
		"plugin.command",
		{ pluginId: ctx.params.id, command: ctx.params.cmd, args: ctx.body === null ? {} : objectBody(ctx.body) },
		`plugin:${ctx.params.id}`,
	), 202))
	router.get("/plugins/:id/permissions", (ctx) => {
		if (typeof plugins.permissions === "function") return sendSuccess(ctx, plugins.permissions(ctx.params.id))
		return sendSuccess(ctx, requireMethod(plugins, "get")(ctx.params.id).permissions ?? [])
	})
	router.put("/plugins/:id/permissions", (ctx) => {
		const body = objectBody(ctx.body)
		if (!Array.isArray(body.permissions) || body.permissions.some((item) => typeof item !== "string" || !item)) {
			throw new ApiError("VALIDATION_FAILED", "permissions must be an array of non-empty strings")
		}
		return sendSuccess(ctx, requireMethod(plugins, "setPermissions")(ctx.params.id, body.permissions))
	})
	router.post("/plugins/:id/native-approval", async (ctx) => {
		const body = objectBody(ctx.body)
		return sendSuccess(ctx, await requireMethod(plugins, "setNativeExecutionApproved")(
			ctx.params.id,
			requiredBoolean(body.approved, "approved"),
		))
	})
	router.post("/plugins/validate", (ctx) => {
		const body = objectBody(ctx.body)
		if (body.repositoryUrl !== undefined) {
			return sendSuccess(ctx, requireMethod(plugins, "inspectGithub")(requiredString(body.repositoryUrl, "repositoryUrl")))
		}
		return sendSuccess(ctx, requireMethod(plugins, "inspectManifest")(requiredString(body.path, "path")))
	})
	router.post("/plugins/sync-bundled", (ctx) => sendSuccess(ctx, enqueue(plugins, "plugin.sync-bundled", {}), 202))
	router.get("/plugins/:id/config", (ctx) => sendSuccess(ctx, requireMethod(plugins, "config")(ctx.params.id)))
	router.put("/plugins/:id/config", (ctx) => sendSuccess(ctx, requireMethod(plugins, "setConfig")(
		ctx.params.id,
		objectBody(ctx.body),
	)))
}
