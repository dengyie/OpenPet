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

async function createDefaultInitBody({ app, getSettings }) {
	const settings = await getSettings?.()
	return {
		userDataDir: app?.getPath?.("userData"),
		secrets: {},
		legacyToken: settings?.localHttp?.token || null,
	}
}

function createSidecarRuntimeCoordinator(options = {}) {
	const spawnSidecar = options.spawnSidecar || defaultSpawnSidecar
	const stopSidecar = options.stopSidecar || defaultStopSidecar
	const createMessageHandler = options.createMessageHandler || defaultCreateMessageHandler
	const pidLedger = options.pidLedger || null
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
				// Sweep before launching a new child so a previous crash cannot leave
				// an older sidecar (or its descendants) running beside this session.
				try {
					await pidLedger?.sweep?.()
				} catch (error) {
					safeLog(options.logger, "warn", "sidecar orphan cleanup failed", { error: String(error) })
				}
				const initBody = typeof options.getInitBody === "function"
					? await options.getInitBody()
					: await createDefaultInitBody(options)
				let messageHandler = null
				let exitedBeforeReady = false
				let earlyExitReason = null
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
						exitedBeforeReady = true
						earlyExitReason = code == null ? "SIDECAR_EXITED" : `SIDECAR_EXIT_${code}`
						if (currentGeneration !== generation || state.status === "stopped") return
						child = null
						degrade(earlyExitReason, currentGeneration)
					},
				})
				if (currentGeneration !== generation) {
					await stopSidecar(result.child)
					return null
				}
				if (exitedBeforeReady) {
					degrade(earlyExitReason, currentGeneration)
					return null
				}
				child = result.child
				const pid = Number(result.pid || result.child?.pid) || 0
				if (pid > 0) {
					try {
						pidLedger?.register?.(pid, {
							startedAt: result.startedAt,
							processName: result.processName,
						})
					} catch (error) {
						safeLog(options.logger, "warn", "sidecar PID ledger register failed", { pid, error: String(error) })
					}
				}
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
		const currentPid = Number(currentChild?.pid) || 0
		generation += 1
		child = null
		publish({ status: "stopped", backend: null, reason: null })
		stopPromise = (async () => {
			await pendingStart?.catch(() => {})
			if (currentChild) {
				await stopSidecar(currentChild)
				if (currentPid > 0) {
					try {
						pidLedger?.unregister?.(currentPid)
					} catch (error) {
						safeLog(options.logger, "warn", "sidecar PID ledger unregister failed", { pid: currentPid, error: String(error) })
					}
				}
			}
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
