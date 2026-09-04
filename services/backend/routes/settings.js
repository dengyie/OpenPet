import { EVENT_SETTINGS_CHANGED, SETTINGS_CANONICAL_PATHS, SETTINGS_TRUSTED_PATHS, settingsPatchRequestSchema } from "@openpet/contracts"

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
	if (/api.?key|password|secret|token/i.test(key) && !/ref$/i.test(key)) return undefined
	if (Array.isArray(value)) return value.map((entry) => sanitizeValues(entry)).filter((entry) => entry !== undefined)
	if (!value || typeof value !== "object") return value
	return Object.fromEntries(Object.entries(value).flatMap(([entryKey, entryValue]) => {
		const sanitized = sanitizeValues(entryValue, entryKey)
		return sanitized === undefined ? [] : [[entryKey, sanitized]]
	}))
}

export function parsePatch(body, { trusted = false } = {}) {
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
		if (SETTINGS_TRUSTED_PATHS.includes(path) && !trusted) {
			throw new ApiError("PERMISSION_DENIED", "home anchor 只能由 Shell 进程持久化", { details: { path } })
		}
	}
	return parsed.data
}

function readPath(value, path) {
	let current = value
	for (const segment of path.split(".")) {
		if (!current || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, segment)) return undefined
		current = current[segment]
	}
	return current
}

function sameValue(left, right) {
	if (Object.is(left, right)) return true
	if (Array.isArray(left) || Array.isArray(right)) {
		return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameValue(value, right[index]))
	}
	if (!left || !right || typeof left !== "object" || typeof right !== "object") return false
	const keys = new Set([...Object.keys(left), ...Object.keys(right)])
	return [...keys].every((key) => sameValue(left[key], right[key]))
}

export function createSettingsMutationCoordinator({ emit } = {}) {
	let queue = Promise.resolve()
	let trustedQueue = Promise.resolve()
	let activeHttp = null

	const enqueue = (task) => {
		const run = queue.then(task)
		queue = run.catch(() => {})
		return run
	}

	return {
		runHttp(task) {
			return enqueue(async () => {
				const previous = activeHttp
				activeHttp = { deferredEvents: [] }
				try {
					return await task()
				} finally {
					activeHttp = previous
				}
			})
		},
		runTrusted(task) {
			if (!activeHttp) return enqueue(task)
			const run = trustedQueue.then(task)
			trustedQueue = run.catch(() => {})
			return run
		},
		runRead(task) {
			return enqueue(task)
		},
		waitForTrusted() {
			return trustedQueue
		},
		publish(name, payload) {
			if (activeHttp) activeHttp.deferredEvents.push([name, payload])
			else emit?.(name, payload)
		},
		consumeDeferredEvents() {
			const events = activeHttp?.deferredEvents ?? []
			if (activeHttp) activeHttp.deferredEvents = []
			return events
		},
	}
}

export function createSettingsMutationAuthority({ store, coordinator } = {}) {
	if (!store || typeof store.patch !== "function") throw new TypeError("settings authority 需要 settings store")
	if (!coordinator || typeof coordinator.publish !== "function") throw new TypeError("settings authority 需要 mutation coordinator")
	return {
		patch(request, { publish = true } = {}) {
			const result = store.patch(request)
			if (publish && result.changedPaths.length > 0) {
				coordinator.publish(EVENT_SETTINGS_CHANGED, { paths: result.changedPaths, version: result.version })
			}
			return result
		},
	}
}

export function registerSettingsRoutes({ router, store, emit, awaitHostApply, mutationCoordinator, mutationAuthority, handlers = {} } = {}) {
	if (!router || typeof router.register !== "function") throw new TypeError("registerSettingsRoutes 需要 router")
	if (!store || typeof store.read !== "function" || typeof store.patch !== "function") {
		throw new TypeError("registerSettingsRoutes 需要 settings store")
	}
	if (typeof emit !== "undefined" && typeof emit !== "function") throw new TypeError("emit 必须是函数")

	const coordinator = mutationCoordinator ?? createSettingsMutationCoordinator({ emit })
	const authority = mutationAuthority ?? createSettingsMutationAuthority({ store, coordinator })
	if (!authority || typeof authority.patch !== "function") throw new TypeError("mutationAuthority 必须提供 patch")
	if (!coordinator || typeof coordinator.runHttp !== "function" || typeof coordinator.runTrusted !== "function") {
		throw new TypeError("mutationCoordinator 必须提供 runHttp/runTrusted")
	}
	const routeHandlers = {
		[label("GET", "/settings")]: (ctx) => coordinator.runRead(() => {
			const snapshot = store.read()
			sendSuccess(ctx, { version: snapshot.version, values: sanitizeValues(snapshot.values) })
		}),
		[label("PATCH", "/settings")]: (ctx) => {
			const run = coordinator.runHttp(async () => {
				const request = parsePatch(ctx.body)
				const before = store.read()
				// HTTP publishes once, after host settlement, with the final canonical
				// version. The authority still owns the write, but defers this event.
				const result = authority.patch(request, { publish: false })
				if (result.changedPaths.length > 0 && typeof awaitHostApply === "function") {
					try {
						await awaitHostApply({ paths: result.changedPaths, version: result.version })
					} catch (error) {
						await coordinator.waitForTrusted()
						const current = store.read()
						const rollbackPatch = Object.fromEntries(result.changedPaths
							.filter((path) => sameValue(readPath(current.values, path), request.patch[path]))
							.map((path) => [path, readPath(before.values, path)]))
						try {
							if (Object.keys(rollbackPatch).length > 0) authority.patch({ ifVersion: current.version, patch: rollbackPatch }, { publish: false })
						} catch (rollbackError) {
							error.rollbackError = rollbackError
						}
						const settled = store.read()
						for (const [name, payload] of coordinator.consumeDeferredEvents()) {
							emit?.(name, { ...payload, version: settled.version })
						}
						throw new ApiError("BACKEND_UNAVAILABLE", "Shell 未能应用设置", { cause: error, details: { version: settled.version } })
					}
				}
				await coordinator.waitForTrusted()
				const settled = store.read()
				const deferred = coordinator.consumeDeferredEvents()
				if (result.changedPaths.length > 0) {
					const paths = [...new Set([
						...result.changedPaths,
						...deferred.flatMap(([, payload]) => payload.paths ?? []),
					])]
					emit?.(EVENT_SETTINGS_CHANGED, { paths, version: settled.version })
				}
				sendSuccess(ctx, { ...result, version: settled.version })
			})
			return run
		},
		...handlers,
	}

	for (const [method, routePath] of SETTINGS_ROUTES) {
		const routeLabel = label(method, routePath)
		router.register(method, routePath, routeHandlers[routeLabel] ?? unavailableHandler(routeLabel))
	}

	return { routes: SETTINGS_ROUTES.map(([method, routePath]) => label(method, routePath)), mutationCoordinator: coordinator }
}

export const SETTINGS_ROUTES_LIST = Object.freeze(SETTINGS_ROUTES.map(([method, routePath]) => label(method, routePath)))
