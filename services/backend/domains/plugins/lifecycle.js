import { ApiError } from "../../http/middleware.js"

const ACTIVE = new Set(["starting", "running", "stopping"])

function nativeApprovalError(pluginId) {
	return new ApiError("PLUGIN_NATIVE_NOT_APPROVED", "Plugin native execution is not approved", {
		status: 403,
		details: { pluginId },
	})
}

function requireBridge(bridge, method) {
	if (typeof bridge?.[method] !== "function") {
		throw new ApiError("BACKEND_UNAVAILABLE", `Plugin ${method} bridge is unavailable`)
	}
	return bridge[method].bind(bridge)
}

export function createPluginLifecycle({ registry, bridge, now = Date.now, onStatus, audit } = {}) {
	if (!registry?.get || !registry?.definition) throw new TypeError("plugin lifecycle requires registry")
	const states = new Map()
	const operations = new Map()
	const serialize = (id, task) => {
		const previous = operations.get(id) ?? Promise.resolve()
		const current = previous.catch(() => {}).then(task)
		operations.set(id, current)
		void current.then(() => {
			if (operations.get(id) === current) operations.delete(id)
		}, () => {
			if (operations.get(id) === current) operations.delete(id)
		})
		return current
	}
	const status = (id) => {
		registry.get(id)
		return structuredClone(states.get(id) ?? { pluginId: id, status: "stopped", startedAt: null, stoppedAt: null, error: null })
	}
	const publish = (id, next) => {
		states.set(id, next)
		onStatus?.(structuredClone(next))
		return structuredClone(next)
	}
	const assertNativeApproval = (id, definition) => {
		if (registry.requiresNative(definition) && !registry.isNativeApproved(id)) throw nativeApprovalError(id)
	}
	const disableAfterFailure = (id, message) => {
		try {
			registry.setEnabled(id, false)
		} catch (error) {
			audit?.("error", message, { pluginId: id, error: String(error) })
		}
	}
	const start = (id) => serialize(id, async () => {
		const definition = registry.definition(id)
		assertNativeApproval(id, definition)
		const current = status(id)
		if (ACTIVE.has(current.status)) {
			throw new ApiError("PLUGIN_ALREADY_RUNNING", "Plugin is already running", { status: 409, details: { pluginId: id } })
		}
		const invoke = requireBridge(bridge, "start")
		registry.setEnabled(id, true)
		publish(id, { ...current, status: "starting", error: null })
		try {
			await invoke({ plugin: registry.get(id), definition })
			audit?.("info", "Plugin started", { pluginId: id })
			return publish(id, { pluginId: id, status: "running", startedAt: now(), stoppedAt: null, error: null })
		} catch (error) {
			disableAfterFailure(id, "Plugin disable failed after start failure")
			publish(id, { pluginId: id, status: "failed", startedAt: null, stoppedAt: now(), error: error?.message || "Plugin start failed" })
			throw error
		}
	})
	const stop = (id) => serialize(id, async () => {
		const current = status(id)
		if (!ACTIVE.has(current.status)) throw new ApiError("CONFLICT", "Plugin is not running", { details: { pluginId: id } })
		const invoke = requireBridge(bridge, "stop")
		publish(id, { ...current, status: "stopping" })
		try {
			await invoke({ plugin: registry.get(id), definition: registry.definition(id) })
			registry.setEnabled(id, false)
			audit?.("info", "Plugin stopped", { pluginId: id })
			return publish(id, { ...current, status: "stopped", stoppedAt: now(), error: null })
		} catch (error) {
			disableAfterFailure(id, "Plugin disable failed after stop failure")
			publish(id, { ...current, status: "failed", stoppedAt: now(), error: error?.message || "Plugin stop failed" })
			throw error
		}
	})
	const command = async (id, name, args = {}) => {
		const definition = registry.definition(id)
		assertNativeApproval(id, definition)
		if (status(id).status !== "running" || !registry.get(id).enabled) {
			throw new ApiError("CONFLICT", "Plugin is not running", { details: { pluginId: id } })
		}
		audit?.("info", "Plugin command requested", { pluginId: id, command: name })
		return requireBridge(bridge, "command")({ plugin: registry.get(id), definition, name, args })
	}
	const stopAll = async () => {
		const pending = [...states].filter(([, state]) => ACTIVE.has(state.status)).map(([id]) => [id, stop(id)])
		const results = await Promise.allSettled(pending.map(([, operation]) => operation))
		results.forEach((result, index) => {
			if (result.status === "rejected") audit?.("error", "Plugin stop failed during shutdown", {
				pluginId: pending[index][0], error: String(result.reason),
			})
		})
		return { ok: results.every((result) => result.status === "fulfilled"), results }
	}
	return { start, stop, status, command, stopAll }
}
