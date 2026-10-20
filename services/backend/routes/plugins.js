import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { ApiError, sendList, sendSuccess } from "../http/middleware.js"
import { normalizePluginGithubRepositoryUrl, pluginGithubResourceKey } from "../jobs/handlers/common.js"

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

export const PLUGIN_CHANNEL_ROUTES = Object.freeze({
	PLUGINS_LIST: "GET /plugins",
	PLUGINS_SET_ENABLED: "POST /plugins/:id/enable",
	PLUGINS_SET_NATIVE_EXECUTION_APPROVED: "POST /plugins/:id/native-approval",
	PLUGINS_SAVE_CONFIG: "PUT /plugins/:id/config",
	PLUGINS_GET_IM_GATEWAY_SECRET_STATE: "GET /plugins/:id/config",
	PLUGINS_SAVE_IM_GATEWAY_TELEGRAM_TOKEN: "PUT /plugins/:id/config",
	PLUGINS_CLEAR_IM_GATEWAY_TELEGRAM_TOKEN: "PUT /plugins/:id/config",
	PLUGINS_RUN_CREATOR_STUDIO_DEFAULT_FLOW: "POST /plugins/:id/commands/:cmd",
	PLUGINS_RUN_COMMAND: "POST /plugins/:id/commands/:cmd",
	PLUGINS_RUN_SETUP: "POST /plugins/:id/commands/:cmd",
	PLUGINS_START_SERVICE: "POST /plugins/:id/start",
	PLUGINS_STOP_SERVICE: "POST /plugins/:id/stop",
	PLUGINS_CHECK_SERVICE_HEALTH: "POST /plugins/:id/start",
	PLUGINS_SAVE_SERVICE_HEALTH_POLICY: "PUT /plugins/:id/config",
	PLUGINS_INSPECT_GITHUB_REPOSITORY: "POST /plugins/validate",
	PLUGINS_CLEAR_SELECTION: "POST /plugins/install",
	PLUGINS_INSTALL: "POST /plugins/install",
	PLUGINS_UPDATE: "POST /plugins/install",
	PLUGINS_UNINSTALL: "DELETE /plugins/:id",
	PLUGINS_GET_LOGS: "GET /plugins/:id/logs",
	PLUGINS_EXPORT_LOGS: "GET /plugins/:id/logs",
	PLUGINS_CLEAR_LOGS: "DELETE /plugins/:id/logs",
	PLUGINS_CLEAR_STORAGE: "POST /plugins/:id/enable",
})

export const PLUGIN_IPC_CHANNELS = Object.freeze([
	"PLUGINS_OPEN_DASHBOARD",
	"PLUGINS_INSPECT_PACKAGE",
	"PLUGINS_SAVE_IM_GATEWAY_QQ_CREDENTIALS",
	"PLUGINS_CLEAR_IM_GATEWAY_QQ_CREDENTIALS",
	"PLUGINS_SAVE_IM_GATEWAY_WECOM_CREDENTIALS",
	"PLUGINS_CLEAR_IM_GATEWAY_WECOM_CREDENTIALS",
])

const IM_GATEWAY_PLUGIN_ID = "openpet.im-gateway"

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

function assertImGatewayPluginId(pluginId) {
	if (pluginId !== IM_GATEWAY_PLUGIN_ID) {
		throw new ApiError("VALIDATION_FAILED", "Telegram secret operations require the IM Gateway plugin", {
			details: { field: "pluginId" },
		})
	}
}

function optionalBooleanQuery(value, field) {
	if (value === undefined) return false
	if (value === "true") return true
	if (value === "false") return false
	throw new ApiError("VALIDATION_FAILED", `${field} must be true or false`, { details: { field } })
}

function pluginLogQuery(query, { exportMode = false } = {}) {
	const allowed = new Set(exportMode
		? ["operation", "pluginId", "level", "query", "limit", "before", "format", "page", "pageSize"]
		: ["level", "query", "limit", "before", "page", "pageSize"])
	if (Object.keys(query).some((key) => !allowed.has(key))) throw new ApiError("VALIDATION_FAILED", "Plugin log query contains unsupported fields")
	const normalized = {}
	if (query.level !== undefined) {
		if (!["info", "warn", "error"].includes(query.level)) throw new ApiError("VALIDATION_FAILED", "level must be info, warn, or error")
		normalized.level = query.level
	}
	if (query.query !== undefined) {
		if (typeof query.query !== "string" || query.query.length > 200) throw new ApiError("VALIDATION_FAILED", "query must be at most 200 characters")
		normalized.query = query.query
	}
	for (const field of ["limit", "before", "page", "pageSize"]) {
		if (query[field] === undefined) continue
		if (!/^\d+$/.test(query[field])) throw new ApiError("VALIDATION_FAILED", `${field} must be an integer`)
		const value = Number(query[field])
		if (!Number.isSafeInteger(value) || (field === "limit" && (value < 1 || value > 5_000)) || (field === "before" && value < 0) || (["page", "pageSize"].includes(field) && (value < 1 || value > 5_000))) {
			throw new ApiError("VALIDATION_FAILED", `${field} is out of range`)
		}
		normalized[field] = value
	}
	if (query.pluginId !== undefined && exportMode && typeof query.pluginId !== "string") {
		throw new ApiError("VALIDATION_FAILED", "pluginId must be a string")
	}
	if (exportMode) {
		if (query.format !== undefined && !["json", "csv"].includes(query.format)) throw new ApiError("VALIDATION_FAILED", "format must be json or csv")
		normalized.format = query.format ?? "json"
	}
	return normalized
}

function objectBody(body, field = "body") {
	if (body === null || typeof body !== "object" || Array.isArray(body)) {
		throw new ApiError("VALIDATION_FAILED", `${field} must be an object`, { details: { field } })
	}
	return body
}

function assertOnlyKeys(body, allowed, label) {
	if (Object.keys(body).some((key) => !allowed.includes(key))) {
		throw new ApiError("VALIDATION_FAILED", `${label} contains unsupported fields`)
	}
}

function assertOnlyQueryKeys(query, allowed, label) {
	if (Object.keys(query).some((key) => !allowed.includes(key))) {
		throw new ApiError("VALIDATION_FAILED", `${label} contains unsupported query fields`)
	}
}

function assertOperation(operation, allowed, label = "plugin route") {
	if (operation !== undefined && !allowed.includes(operation)) {
		throw new ApiError("VALIDATION_FAILED", `Unsupported ${label} operation`, { details: { operation } })
	}
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

function enqueue(plugins, kind, input, resourceKey = null, privateInput = undefined) {
	if (kind === "plugin.command" && typeof plugins?.dispatchCommand === "function") {
		const job = plugins.dispatchCommand(input.pluginId, input.command, input.args ?? {})
		return { jobId: job.id }
	}
	const dispatch = requireMethod(plugins, "enqueueJob")
	const job = dispatch({ id: `${kind}:${randomUUID()}`, kind, input, resourceKey, privateInput })
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

function githubInstallInput(repositoryUrl) {
	try {
		const canonicalUrl = normalizePluginGithubRepositoryUrl(repositoryUrl)
		return { repositoryUrl: canonicalUrl, resourceKey: pluginGithubResourceKey({ repositoryUrl: canonicalUrl }) }
	} catch (error) {
		throw new ApiError("VALIDATION_FAILED", error?.message || "repositoryUrl must be a GitHub repository homepage URL", {
			details: { field: "repositoryUrl" },
			cause: error,
		})
	}
}

export function registerPluginRoutes(router, { plugins } = {}) {
	if (!router || typeof router.register !== "function") throw new TypeError("registerPluginRoutes requires router")
	if (!plugins || typeof plugins !== "object") throw new TypeError("registerPluginRoutes requires plugins service")
	router.use(async (ctx, next) => {
		if ((ctx.routePath === "/plugins" || ctx.routePath?.startsWith("/plugins/")) && ctx.hasDuplicateQueryKeys) {
			throw new ApiError("VALIDATION_FAILED", "Plugin routes do not allow duplicate query fields")
		}
		return next()
	})

	router.get("/plugins", (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin list")
		const items = requireMethod(plugins, "list")()
		return sendList(ctx, items)
	})
	router.get("/plugins/:id", (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin detail")
		return sendSuccess(ctx, requireMethod(plugins, "get")(ctx.params.id))
	})
	router.post("/plugins/install", (ctx) => {
		assertOnlyQueryKeys(ctx.query, ["operation"], "plugin install")
		assertOperation(ctx.query.operation, ["clear-selection"], "plugin install")
		const body = objectBody(ctx.body)
		if (ctx.query.operation === "clear-selection") {
			assertOnlyKeys(body, ["selectionId"], "clear-selection request")
			return sendSuccess(ctx, requireMethod(plugins, "clearInstallSelection")(
				requiredString(body.selectionId, "selectionId"),
			))
		}
		if (body.selectionId !== undefined) {
			assertOnlyKeys(body, ["selectionId", "update"], "plugin install selection")
			if (body.update !== undefined && typeof body.update !== "boolean") {
				throw new ApiError("VALIDATION_FAILED", "update must be a boolean")
			}
			const selectionId = requiredString(body.selectionId, "selectionId")
			const input = { selectionId, update: body.update === true }
			return sendSuccess(ctx, enqueue(plugins, "plugin.install", input, null, input), 202)
		}
		assertOnlyKeys(body, ["path"], "plugin install path")
		const sourcePath = requiredString(body.path, "path")
		if (!sourceSupportsManifestPreflight(sourcePath)) {
			const input = { path: sourcePath }
			return sendSuccess(ctx, enqueue(plugins, "plugin.install", input, null, input), 202)
		}
		const pluginId = inspectLocalPluginId(plugins, sourcePath)
		const input = { path: sourcePath, pluginId }
		return sendSuccess(ctx, enqueue(plugins, "plugin.install", input, `plugin:${pluginId}`, input), 202)
	})
	router.post("/plugins/install/github", (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "GitHub plugin install")
		const body = objectBody(ctx.body)
		assertOnlyKeys(body, ["repositoryUrl"], "GitHub plugin install")
		const input = githubInstallInput(requiredString(body.repositoryUrl, "repositoryUrl"))
		const jobInput = {
			repositoryUrl: input.repositoryUrl,
		}
		return sendSuccess(ctx, enqueue(plugins, "plugin.install.github", jobInput, input.resourceKey, jobInput), 202)
	})
	router.delete("/plugins/:id", async (ctx) => {
		assertOnlyQueryKeys(ctx.query, ["removeStorage"], "plugin uninstall")
		return sendSuccess(ctx, await requireMethod(plugins, "remove")(
			ctx.params.id,
			{ removeStorage: optionalBooleanQuery(ctx.query.removeStorage, "removeStorage") },
		))
	})
	router.post("/plugins/:id/enable", async (ctx) => {
		assertOnlyQueryKeys(ctx.query, ["operation"], "plugin enable")
		assertOperation(ctx.query.operation, ["storage-clear"], "plugin enable")
		const body = objectBody(ctx.body)
		if (ctx.query.operation === "storage-clear") {
			assertOnlyKeys(body, [], "plugin storage-clear")
			return sendSuccess(ctx, await requireMethod(plugins, "clearStorage")(ctx.params.id))
		}
		assertOnlyKeys(body, ["enabled"], "plugin enable")
		return sendSuccess(ctx, await requireMethod(plugins, "setEnabled")(
			ctx.params.id,
			requiredBoolean(body.enabled, "enabled"),
		))
	})
	router.post("/plugins/:id/start", async (ctx) => {
		assertOnlyQueryKeys(ctx.query, ["operation"], "plugin start")
		assertOperation(ctx.query.operation, ["health"], "plugin start")
		const body = ctx.body == null ? {} : objectBody(ctx.body)
		if (ctx.query.operation === "health") {
			assertOnlyKeys(body, ["serviceId"], "plugin service health")
			return sendSuccess(ctx, await requireMethod(plugins, "serviceHealth")(
				ctx.params.id,
				requiredString(body.serviceId, "serviceId"),
			))
		}
		if (body.serviceId !== undefined) {
			assertOnlyKeys(body, ["serviceId"], "plugin service start")
			return sendSuccess(ctx, await requireMethod(plugins, "serviceStart")(ctx.params.id, requiredString(body.serviceId, "serviceId")))
		}
		assertOnlyKeys(body, [], "plugin start")
		return sendSuccess(ctx, await requireMethod(plugins, "start")(ctx.params.id))
	})
	router.post("/plugins/:id/stop", async (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin stop")
		const body = ctx.body == null ? {} : objectBody(ctx.body)
		if (body.serviceId !== undefined) {
			assertOnlyKeys(body, ["serviceId"], "plugin service stop")
			return sendSuccess(ctx, await requireMethod(plugins, "serviceStop")(ctx.params.id, requiredString(body.serviceId, "serviceId")))
		}
		assertOnlyKeys(body, [], "plugin stop")
		return sendSuccess(ctx, await requireMethod(plugins, "stop")(ctx.params.id))
	})
	router.post("/plugins/:id/restart", async (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin restart")
		const body = ctx.body == null ? {} : objectBody(ctx.body)
		assertOnlyKeys(body, [], "plugin restart")
		if (typeof plugins.restart === "function") return sendSuccess(ctx, await plugins.restart(ctx.params.id))
		const current = requireMethod(plugins, "status")(ctx.params.id)
		if (["starting", "running", "stopping"].includes(current?.status)) {
			await requireMethod(plugins, "stop")(ctx.params.id)
		}
		return sendSuccess(ctx, await requireMethod(plugins, "start")(ctx.params.id))
	})
	router.get("/plugins/:id/status", (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin status")
		return sendSuccess(ctx, requireMethod(plugins, "status")(ctx.params.id))
	})
	router.get("/plugins/:id/logs", (ctx) => {
		assertOperation(ctx.query.operation, ["export"], "plugin logs")
		if (ctx.query.operation === "export") {
			return sendSuccess(ctx, requireMethod(plugins, "exportLogs")({ ...pluginLogQuery(ctx.query, { exportMode: true }), pluginId: ctx.params.id }))
		}
		const items = logsFor(plugins, ctx.params.id, pluginLogQuery(ctx.query))
		return sendList(ctx, items)
	})
	router.delete("/plugins/:id/logs", (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin log clear")
		return sendSuccess(ctx, clearLogsFor(plugins, ctx.params.id))
	})
	router.post("/plugins/:id/commands/:cmd", async (ctx) => {
		assertOnlyQueryKeys(ctx.query, ["operation"], "plugin command")
		assertOperation(ctx.query.operation, ["setup", "creator-default-flow"], "plugin command")
		const body = ctx.body == null ? {} : objectBody(ctx.body)
		if (ctx.query.operation === "setup") {
			assertOnlyKeys(body, [], "plugin setup")
			return sendSuccess(ctx, await requireMethod(plugins, "runSetup")(ctx.params.id, ctx.params.cmd))
		}
		if (ctx.query.operation === "creator-default-flow") {
			assertOnlyKeys(body, ["prompt"], "Creator Studio default flow")
			return sendSuccess(ctx, await requireMethod(plugins, "creatorDefaultFlow")(
				ctx.params.id,
				requiredString(body.prompt, "prompt"),
			))
		}
		return sendSuccess(ctx, enqueue(
			plugins,
			"plugin.command",
			{ pluginId: ctx.params.id, command: ctx.params.cmd, args: body },
			`plugin:${ctx.params.id}`,
		), 202)
	})
	router.get("/plugins/:id/permissions", (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin permissions")
		if (typeof plugins.permissions === "function") return sendSuccess(ctx, plugins.permissions(ctx.params.id))
		return sendSuccess(ctx, requireMethod(plugins, "get")(ctx.params.id).permissions ?? [])
	})
	router.put("/plugins/:id/permissions", (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin permissions")
		const body = objectBody(ctx.body)
		assertOnlyKeys(body, ["permissions"], "plugin permissions")
		if (!Array.isArray(body.permissions) || body.permissions.some((item) => typeof item !== "string" || !item)) {
			throw new ApiError("VALIDATION_FAILED", "permissions must be an array of non-empty strings")
		}
		return sendSuccess(ctx, requireMethod(plugins, "setPermissions")(ctx.params.id, body.permissions))
	})
	router.post("/plugins/:id/native-approval", async (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin native approval")
		const body = objectBody(ctx.body)
		assertOnlyKeys(body, ["approved"], "plugin native approval")
		return sendSuccess(ctx, await requireMethod(plugins, "setNativeExecutionApproved")(
			ctx.params.id,
			requiredBoolean(body.approved, "approved"),
		))
	})
	router.post("/plugins/validate", async (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin validation")
		const body = objectBody(ctx.body)
		const keys = Object.keys(body)
		if (keys.length === 1 && keys[0] === "repositoryUrl") {
			return sendSuccess(ctx, await requireMethod(plugins, "inspectGithub")(requiredString(body.repositoryUrl, "repositoryUrl")))
		}
		if (keys.length === 1 && keys[0] === "path") {
			return sendSuccess(ctx, requireMethod(plugins, "inspectManifest")(requiredString(body.path, "path")))
		}
		throw new ApiError("VALIDATION_FAILED", "plugin validation requires exactly one path or repositoryUrl")
	})
	router.post("/plugins/sync-bundled", (ctx) => {
		assertOnlyQueryKeys(ctx.query, [], "plugin sync-bundled")
		const body = ctx.body == null ? {} : objectBody(ctx.body)
		assertOnlyKeys(body, [], "plugin sync-bundled")
		return sendSuccess(ctx, enqueue(plugins, "plugin.sync-bundled", {}), 202)
	})
	router.get("/plugins/:id/config", async (ctx) => {
		assertOnlyQueryKeys(ctx.query, ["operation"], "plugin config")
		if (ctx.query.operation === "secret-state") {
			assertImGatewayPluginId(ctx.params.id)
			return sendSuccess(ctx, await requireMethod(plugins, "getSecretState")(ctx.params.id))
		}
		if (ctx.query.operation !== undefined) throw new ApiError("VALIDATION_FAILED", "Unsupported plugin config operation", { details: { operation: ctx.query.operation } })
		return sendSuccess(ctx, requireMethod(plugins, "config")(ctx.params.id))
	})
	router.put("/plugins/:id/config", async (ctx) => {
		assertOnlyQueryKeys(ctx.query, ["operation"], "plugin config")
		const body = objectBody(ctx.body)
		switch (ctx.query.operation) {
			case "secret-save":
				assertOnlyKeys(body, ["token"], "plugin secret-save")
				assertImGatewayPluginId(ctx.params.id)
				return sendSuccess(ctx, await requireMethod(plugins, "saveSecret")(ctx.params.id, requiredString(body.token, "token")))
			case "secret-clear":
				assertOnlyKeys(body, [], "plugin secret-clear")
				assertImGatewayPluginId(ctx.params.id)
				return sendSuccess(ctx, await requireMethod(plugins, "clearSecret")(ctx.params.id))
			case "storage-clear":
				assertOnlyKeys(body, [], "plugin storage-clear")
				return sendSuccess(ctx, await requireMethod(plugins, "clearStorage")(ctx.params.id))
			case "health-policy":
				assertOnlyKeys(body, ["serviceId", "policy"], "plugin health-policy")
				return sendSuccess(ctx, await requireMethod(plugins, "saveServiceHealthPolicy")(
				ctx.params.id,
				requiredString(body.serviceId, "serviceId"),
				objectBody(body.policy, "policy"),
				))
			case undefined: return sendSuccess(ctx, requireMethod(plugins, "setConfig")(ctx.params.id, body))
			default: throw new ApiError("VALIDATION_FAILED", "Unsupported plugin config operation", { details: { operation: ctx.query.operation } })
		}
	})
}
