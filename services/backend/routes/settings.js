import { EVENT_SETTINGS_CHANGED, SETTINGS_CANONICAL_PATHS, settingsPatchRequestSchema } from "@openpet/contracts"

import { ApiError, sendSuccess } from "../http/middleware.js"

const SETTINGS_ROUTES = Object.freeze([
	["GET", "/settings"],
	["PATCH", "/settings"],
	["POST", "/settings/cursor/import"],
	["POST", "/settings/preview-scale"],
	["GET", "/settings/schema"],
])

function label(method, routePath) {
	return method + " " + routePath
}

function unavailableHandler(routeLabel) {
	return () => {
		throw new ApiError("BACKEND_UNAVAILABLE", routeLabel + " 尚未接入对应业务域")
	}
}

function sanitizeValues(value, key = "") {
	if (Array.isArray(value)) return value.map((entry) => sanitizeValues(entry))
	if (/api.?key|password|secret|token/i.test(key) && !/ref$/i.test(key)) return undefined
	if (!value || typeof value !== "object") return value
	return Object.fromEntries(Object.entries(value).flatMap(([entryKey, entryValue]) => {
		const sanitized = sanitizeValues(entryValue, entryKey)
		return sanitized === undefined ? [] : [[entryKey, sanitized]]
	}))
}

function parsePatch(body) {
	const parsed = settingsPatchRequestSchema.safeParse(body)
	if (!parsed.success) {
		throw new ApiError("VALIDATION_FAILED", "设置 patch 参数无效", {
			details: { issues: parsed.error.issues },
		})
	}
	for (const path of Object.keys(parsed.data.patch)) {
		const segments = path.split(".")
		if (
			path.length === 0 ||
			segments.some(
				(segment) =>
					segment.length === 0 ||
					segment === "__proto__" ||
					segment === "constructor" ||
					segment === "prototype"
			)
		) {
			throw new ApiError("VALIDATION_FAILED", "设置路径无效", { details: { path } })
		}
		if (!SETTINGS_CANONICAL_PATHS.includes(path)) {
			throw new ApiError("PERMISSION_DENIED", "设置路径不允许", { details: { path } })
		}
	}
	return parsed.data
}

export function registerSettingsRoutes({ router, store, emit, handlers = {} } = {}) {
	if (!router || typeof router.register !== "function") throw new TypeError("registerSettingsRoutes 需要 router")
	if (!store || typeof store.read !== "function" || typeof store.patch !== "function") {
		throw new TypeError("registerSettingsRoutes 需要 settings store")
	}
	if (typeof emit !== "undefined" && typeof emit !== "function") throw new TypeError("emit 必须是函数")

	const routeHandlers = {
		[label("GET", "/settings")]: (ctx) => {
			const snapshot = store.read()
			sendSuccess(ctx, { version: snapshot.version, values: sanitizeValues(snapshot.values) })
		},
		[label("PATCH", "/settings")]: (ctx) => {
			const result = store.patch(parsePatch(ctx.body))
			if (result.changedPaths.length > 0) {
				emit?.(EVENT_SETTINGS_CHANGED, { paths: result.changedPaths, version: result.version })
			}
			sendSuccess(ctx, result)
		},
		...handlers,
	}

	for (const [method, routePath] of SETTINGS_ROUTES) {
		const routeLabel = label(method, routePath)
		router.register(method, routePath, routeHandlers[routeLabel] ?? unavailableHandler(routeLabel))
	}

	return { routes: SETTINGS_ROUTES.map(([method, routePath]) => label(method, routePath)) }
}

export const SETTINGS_ROUTES_LIST = Object.freeze(SETTINGS_ROUTES.map(([method, routePath]) => label(method, routePath)))
