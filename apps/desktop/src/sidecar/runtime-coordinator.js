"use strict"

const { spawnSidecar: defaultSpawnSidecar, stopSidecar: defaultStopSidecar } = require("./spawn")
const { createMessageHandler: defaultCreateMessageHandler } = require("./message-handler")

function safeLog(logger, level, message, fields) {
	try {
		logger?.[level]?.(message, fields)
	} catch {
		// Logging must not affect sidecar lifecycle.
	}
}

function failureReason(error) {
	return error?.code || error?.message || "SIDECAR_UNAVAILABLE"
}

async function createDefaultInitBody({ app, secretService, getSettings }) {
	const secrets = {}
	const refs = await secretService?.listSecretRefs?.() || []
	for (const ref of refs) {
		if (!ref?.id || !ref.hasValue) continue
		const value = await secretService?.getSecretValue?.(ref.id)
		if (value) secrets[ref.id] = value
	}
	const settings = await getSettings?.()
	return {
		userDataDir: app?.getPath?.("userData"),
		secrets,
		legacyToken: settings?.localHttp?.token || null,
	}
}

function createSidecarRuntimeCoordinator(options = {}) {
	const spawnSidecar = options.spawnSidecar || defaultSpawnSidecar
	const stopSidecar = options.stopSidecar || defaultStopSidecar
	const createMessageHandler = options.createMessageHandler || defaultCreateMessageHandler
	const listeners = new Set()
	let state = { status: "stopped", backend: null, reason: null }
	let child = null
	let startPromise = null
	let stopPromise = null
	let generation = 0

	function publish(nextState) {
		state = nextState
		const backend = nextState.status === "ready" ? nextState.backend : null
		for (const listener of [...listeners]) {
			try { listener(backend) } catch (error) {
				safeLog(options.logger, "warn", "sidecar state listener failed", { error: String(error) })
			}
		}
	}

	function degrade(reason, expectedGeneration) {
		if (expectedGeneration !== generation || state.status === "stopped") return
		publish({ status: "degraded", backend: null, reason: reason || "SIDECAR_UNAVAILABLE" })
	}

	function start() {
		if (state.status === "ready") return Promise.resolve(state.backend)
		if (startPromise) return startPromise
		stopPromise = null
		const currentGeneration = ++generation
		publish({ status: "starting", backend: null, reason: null })
		startPromise = (async () => {
			try {
				const initBody = typeof options.getInitBody === "function"
					? await options.getInitBody()
					: await createDefaultInitBody(options)
				let messageHandler = null
				const result = await spawnSidecar({
					initBody,
					logger: options.logger,
					onMessage(raw) {
						if (raw?.body?.type === "degraded") degrade(raw.body.reason, currentGeneration)
						Promise.resolve(messageHandler?.handle?.(raw)).catch((error) => {
							safeLog(options.logger, "error", "sidecar message handling failed", { error: String(error) })
						})
					},
					onExit(code) {
						if (currentGeneration !== generation || state.status === "stopped") return
						child = null
						degrade(code == null ? "SIDECAR_EXITED" : `SIDECAR_EXIT_${code}`, currentGeneration)
					},
				})
				if (currentGeneration !== generation) {
					await stopSidecar(result.child)
					return null
				}
				child = result.child
				messageHandler = createMessageHandler({
					dialog: options.dialog,
					petService: options.petService,
					logger: options.logger,
					send: (message) => child?.send?.(message),
					onNotify: options.onNotify,
					onBadge: options.onBadge,
					onDashboard: options.onDashboard,
				})
				const backend = { baseUrl: result.baseUrl, sessionToken: result.sessionToken }
				publish({ status: "ready", backend, reason: null })
				return backend
			} catch (error) {
				safeLog(options.logger, "error", "sidecar startup failed", { error: String(error) })
				degrade(failureReason(error), currentGeneration)
				return null
			} finally {
				startPromise = null
			}
		})()
		return startPromise
	}

	function stop() {
		if (stopPromise) return stopPromise
		const pendingStart = startPromise
		const currentChild = child
		generation += 1
		child = null
		publish({ status: "stopped", backend: null, reason: null })
		stopPromise = (async () => {
			await pendingStart?.catch(() => {})
			if (currentChild) await stopSidecar(currentChild)
		})()
		return stopPromise
	}

	return {
		start,
		stop,
		getBackend: () => state.status === "ready" ? { ...state.backend } : null,
		getState: () => ({ ...state, backend: state.backend ? { ...state.backend } : null }),
		onChanged(listener) {
			if (typeof listener !== "function") throw new TypeError("listener must be a function")
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}

module.exports = { createSidecarRuntimeCoordinator }
