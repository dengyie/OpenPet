import { ApiError } from "../../http/middleware.js"
import { PLUGIN_RUNTIME_PERMISSIONS } from "../../bridge/plugin-runtime-server.js"

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

function isDeclarationOnly(definition) {
	return !definition?.mainPath &&
		(definition?.manifest?.entries?.commands?.length ?? 0) > 0 &&
		(definition?.manifest?.entries?.services?.length ?? 0) === 0
}

function commandRunsInBackend(definition) {
	if ((definition?.manifest?.entries?.commands?.length ?? 0) === 0) return false
	const supported = new Set(PLUGIN_RUNTIME_PERMISSIONS)
	return (definition.manifest.permissions ?? []).every((permission) => supported.has(permission))
}

export function createPluginLifecycle({ registry, bridge, commandServer, processRuntime, processLedger, now = Date.now, onStatus, audit } = {}) {
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
		const invoke = isDeclarationOnly(definition) && typeof commandServer?.execute === "function"
			? async () => ({ processes: [] })
			: processRuntime?.start && definition.manifest?.entries?.services?.length
				? processRuntime.start.bind(processRuntime)
				: requireBridge(bridge, "start")
		registry.setEnabled(id, true)
		publish(id, { ...current, status: "starting", error: null })
		try {
			const started = await invoke({ plugin: registry.get(id), definition })
			const processes = Array.isArray(started?.processes)
				? started.processes
				: [started?.process ?? started?.child ?? started]
			const pids = []
			try {
				for (const process of processes) {
					const pid = Number(process?.pid) || 0
					if (pid <= 0) continue
					const metadata = { pluginId: id }
					if (process.serviceId !== undefined) metadata.serviceId = process.serviceId
					if (process.startedAt !== undefined) metadata.startedAt = process.startedAt
					if (process.processName !== undefined) metadata.processName = process.processName
					processLedger?.register?.(pid, metadata)
					pids.push(pid)
				}
			} catch (error) {
				await processRuntime?.stop?.({ plugin: registry.get(id), definition }).catch?.(() => {})
				for (const pid of pids) processLedger?.unregister?.(pid)
				throw error
			}
			audit?.("info", "Plugin started", { pluginId: id })
			return publish(id, { pluginId: id, status: "running", startedAt: now(), stoppedAt: null, error: null, pids })
		} catch (error) {
			disableAfterFailure(id, "Plugin disable failed after start failure")
			publish(id, { pluginId: id, status: "failed", startedAt: null, stoppedAt: now(), error: error?.message || "Plugin start failed" })
			throw error
		}
	})
	const stop = (id) => serialize(id, async () => {
		const current = status(id)
		if (!ACTIVE.has(current.status)) throw new ApiError("CONFLICT", "Plugin is not running", { details: { pluginId: id } })
		const definition = registry.definition(id)
		const invoke = isDeclarationOnly(definition) && typeof commandServer?.execute === "function"
			? null
			: processRuntime?.stop && definition.manifest?.entries?.services?.length
				? processRuntime.stop.bind(processRuntime)
				: requireBridge(bridge, "stop")
		publish(id, { ...current, status: "stopping" })
		try {
			const operations = []
			if (invoke) operations.push(invoke({ plugin: registry.get(id), definition }))
			if (typeof commandServer?.stopPlugin === "function") operations.push(commandServer.stopPlugin(id))
			const results = await Promise.allSettled(operations)
			const failure = results.find((result) => result.status === "rejected")
			if (failure) throw failure.reason
			for (const pid of current.pids ?? []) processLedger?.unregister?.(pid)
			registry.setEnabled(id, false)
			audit?.("info", "Plugin stopped", { pluginId: id })
			return publish(id, { ...current, status: "stopped", stoppedAt: now(), error: null })
		} catch (error) {
			disableAfterFailure(id, "Plugin disable failed after stop failure")
			publish(id, { ...current, status: "failed", stoppedAt: now(), error: error?.message || "Plugin stop failed" })
			throw error
		}
	})
	const command = async (id, name, args = {}, context = {}) => {
		const definition = registry.definition(id)
		assertNativeApproval(id, definition)
		if (status(id).status !== "running" || !registry.get(id).enabled) {
			throw new ApiError("CONFLICT", "Plugin is not running", { details: { pluginId: id } })
		}
		audit?.("info", "Plugin command requested", { pluginId: id, command: name })
		if (commandRunsInBackend(definition) && typeof commandServer?.execute === "function") {
			return commandServer.execute(id, name, args, context)
		}
		return requireBridge(bridge, "command")({
			plugin: registry.get(id),
			definition,
			name,
			args,
			signal: context.signal,
			tmpDir: context.tmpDir,
			registerProcess: context.registerProcess,
		})
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
