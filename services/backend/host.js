import { fork as nodeFork } from "node:child_process"
import { createServer } from "node:http"
import { mkdir, realpath } from "node:fs/promises"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { backendToShellEnvelopeSchema, shellToBackendEnvelopeSchema } from "@openpet/contracts"

const BRIDGE_VERSION = 1
const DEFAULT_BIND_HOST = "127.0.0.1"
const DEFAULT_PORT = 48_330
const DEFAULT_BRIDGE_PORT = 48_331
const DEFAULT_BACKEND_PORT = 48_332
const DEFAULT_STARTUP_TIMEOUT_MS = 20_000
const DEFAULT_SESSION_TTL_MS = 30_000
const MAX_REQUEST_BYTES = 2 * 1024 * 1024
const MAX_SESSION_BYTES = 1024 * 1024
const REQUEST_TYPES = new Set([
	"pet.command.request", "plugin.production.request", "dialog.request",
	"settings.apply.request", "settings.command.request", "secrets.persist.request",
	"catalog.request", "pet-packs.request", "ai.talk.request", "actions.request",
])

function safeEqual(left, right) {
	if (typeof left !== "string" || typeof right !== "string") return false
	const a = Buffer.from(left)
	const b = Buffer.from(right)
	return a.length === b.length && timingSafeEqual(a, b)
}

function readBearer(request) {
	const value = request.headers.authorization
	return typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7) : ""
}

function sendJson(response, status, value) {
	const body = JSON.stringify(value)
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(body),
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
	})
	response.end(body)
}

async function readJson(request, limit) {
	const chunks = []
	let size = 0
	for await (const chunk of request) {
		size += chunk.length
		if (size > limit) {
			const error = new Error("request body too large")
			error.statusCode = 413
			throw error
		}
		chunks.push(chunk)
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"))
	} catch {
		const error = new Error("request body must be valid JSON")
		error.statusCode = 400
		throw error
	}
}

function validateHostOptions(options) {
	const bindHost = options.bindHost ?? DEFAULT_BIND_HOST
	const port = options.port ?? DEFAULT_PORT
	const bridgePort = options.bridgePort ?? DEFAULT_BRIDGE_PORT
	const backendPort = options.backendPort ?? DEFAULT_BACKEND_PORT
	const dataDir = resolve(options.dataDir ?? "/var/lib/openpet")
	const entry = resolve(options.entry ?? new URL("./index.js", import.meta.url).pathname)
	if (bindHost !== DEFAULT_BIND_HOST) throw new TypeError("remote Backend host must bind to 127.0.0.1")
	for (const [name, value] of [["port", port], ["bridgePort", bridgePort], ["backendPort", backendPort]]) {
		const minimum = name === "port" ? 0 : 1
		if (!Number.isInteger(value) || value < minimum || value > 65_535) throw new TypeError(`${name} must be a valid TCP port`)
	}
	if (new Set([port, bridgePort, backendPort]).size !== 3) throw new TypeError("host, reverse bridge, and child Backend ports must be different")
	return {
		bindHost,
		port,
		bridgePort,
		backendPort,
		dataDir,
		entry,
		rootDir: resolve(options.rootDir ?? join(entry, "..", "..", "..")),
		startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
		sessionTtlMs: options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS,
		bridgeRequestTimeoutMs: options.bridgeRequestTimeoutMs ?? 65_000,
		fork: options.fork ?? nodeFork,
		fetchImpl: options.fetchImpl ?? globalThis.fetch,
		logger: options.logger ?? null,
	}
}

export function createBackendHost(options = {}) {
	const config = validateHostOptions(options)
	if (typeof config.fetchImpl !== "function") throw new TypeError("host requires fetch")
	let server = null
	let session = null
	let closing = false
	let idleTimer = null

	function log(level, message, fields = {}) {
		try {
			config.logger?.[level]?.(message, fields)
		} catch {}
	}

	function touch(active = session) {
		if (!active || active !== session) return
		active.lastSeenAt = Date.now()
		clearTimeout(idleTimer)
		idleTimer = setTimeout(() => {
			if (session === active && Date.now() - active.lastSeenAt >= config.sessionTtlMs) {
				log("warn", "remote desktop session expired")
				void endSession(active, "heartbeat-timeout")
			}
		}, config.sessionTtlMs + 25)
		idleTimer.unref?.()
	}

	function failPending(active, reason) {
		for (const pending of [...active.pendingShell.values(), ...active.pendingBackend.values()]) {
			clearTimeout(pending.timer)
			pending.reject(new Error(reason))
		}
		active.pendingShell.clear()
		active.pendingBackend.clear()
	}

	function stopChild(child, graceMs = 5_000) {
		if (!child || child.exitCode !== null) return Promise.resolve()
		return new Promise((resolveStop) => {
			const timer = setTimeout(() => {
				try { child.kill("SIGKILL") } catch {}
			}, graceMs)
			timer.unref?.()
			child.once("exit", () => {
				clearTimeout(timer)
				resolveStop()
			})
			try {
				child.send?.({ v: BRIDGE_VERSION, id: `host-shutdown-${Date.now()}`, at: Date.now(), body: { type: "shutdown" } })
				child.kill?.("SIGTERM")
			} catch {
				try { child.kill?.("SIGTERM") } catch {}
			}
		})
	}

	async function endSession(active = session, reason = "client-request") {
		if (!active || active !== session || active.closing) return
		active.closing = true
		clearTimeout(idleTimer)
		failPending(active, "remote Backend session ended")
		session = null
		await stopChild(active.child)
		log("info", "remote Backend session stopped", { reason })
	}

	async function requestShell(active, envelope, waitForReply = true) {
		if (!active.bridgeReady || !active.bridgeToken) throw new Error("desktop Shell bridge is not connected")
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(new Error("Shell bridge request timed out")), config.bridgeRequestTimeoutMs)
		timer.unref?.()
		const reply = waitForReply ? new Promise((resolveReply, rejectReply) => {
			active.pendingShell.set(envelope.id, { resolve: resolveReply, reject: rejectReply, timer })
		}) : null
		try {
			const response = await config.fetchImpl(`http://127.0.0.1:${config.bridgePort}/message`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${active.bridgeToken}`,
				},
				body: JSON.stringify({ envelope }),
				signal: controller.signal,
			})
			if (!response.ok) throw new Error(`Shell bridge returned ${response.status}`)
			const payload = await response.json().catch(() => null)
			if (reply) {
				const direct = payload?.envelope
				if (direct !== undefined) {
					const parsed = shellToBackendEnvelopeSchema.safeParse(direct)
					if (!parsed.success || parsed.data.id !== envelope.id) throw new Error("Shell bridge returned an invalid response")
					active.pendingShell.delete(envelope.id)
					return parsed.data
				}
				return await reply
			}
			return null
		} catch (error) {
			active.pendingShell.delete(envelope.id)
			throw error
		} finally {
			clearTimeout(timer)
		}
	}

	function validateInit(body) {
		if (!body || typeof body !== "object" || Array.isArray(body)) return "session body must be an object"
		if (!body.providerKeys || typeof body.providerKeys !== "object" || Array.isArray(body.providerKeys)) return "providerKeys must be an object"
		if (Object.keys(body.providerKeys).length > 100) return "too many provider keys"
		for (const [id, value] of Object.entries(body.providerKeys)) {
			if (!id || id.length > 160 || typeof value !== "string" || !value.trim() || value.length > 8192) return "invalid provider key entry"
		}
		if (typeof body.bridgeToken !== "string" || !/^[a-f0-9]{64}$/.test(body.bridgeToken)) return "invalid Shell bridge token"
		if (body.legacyToken !== null && body.legacyToken !== undefined && typeof body.legacyToken !== "string") return "invalid local HTTP token"
		if (body.localHttpConfig !== undefined) {
			const local = body.localHttpConfig
			if (!local || typeof local !== "object" || typeof local.enabled !== "boolean" || typeof local.host !== "string" || !Number.isInteger(local.port)) return "invalid local HTTP config"
		}
		if (body.appInfo !== undefined && (!body.appInfo || typeof body.appInfo !== "object" || Array.isArray(body.appInfo))) return "invalid app info"
		return null
	}

	async function startSession(body) {
		const validationError = validateInit(body)
		if (validationError) return { status: 400, value: { ok: false, error: validationError } }
		if (session) return { status: 409, value: { ok: false, error: "a remote Backend session is already active" } }
		const active = {
			bridgeToken: body.bridgeToken,
			bridgeReady: false,
			child: null,
			ready: null,
			pendingShell: new Map(),
			pendingBackend: new Map(),
			lastSeenAt: Date.now(),
			closing: false,
		}
		session = active
		active.bridgeReady = true
		try {
			await mkdir(config.dataDir, { recursive: true, mode: 0o700 })
			const normalizedDataDir = await realpath(config.dataDir)
			const child = config.fork(config.entry, [], {
				cwd: config.rootDir,
				env: { ...process.env, OPENPET_REMOTE_BACKEND: "1" },
				stdio: ["ignore", "inherit", "inherit", "ipc"],
				serialization: "advanced",
			})
			active.child = child
			let startupSettled = false
			let startupCleanup = () => {}
			let rejectStartup = () => {}
			const startup = new Promise((resolveReady, rejectReady) => {
				rejectStartup = rejectReady
				const timer = setTimeout(() => {
					if (startupSettled) return
					startupSettled = true
					rejectReady(new Error("remote Backend startup timed out"))
				}, config.startupTimeoutMs)
				timer.unref?.()
				const cleanup = () => clearTimeout(timer)
				startupCleanup = cleanup
				active.onChildMessage = async (raw) => {
					if (!startupSettled && raw?.body?.type === "ready") {
						const parsed = backendToShellEnvelopeSchema.safeParse(raw)
						startupSettled = true
						cleanup()
						if (!parsed.success) rejectReady(new Error("remote Backend sent an invalid ready envelope"))
						else {
							active.ready = parsed.data.body
							resolveReady(parsed.data.body)
						}
						return
					}
					if (!startupSettled || session !== active) return
					const shellReply = shellToBackendEnvelopeSchema.safeParse(raw)
					if (shellReply.success) {
						const backendPending = active.pendingBackend.get(shellReply.data.id)
						if (backendPending) {
							active.pendingBackend.delete(shellReply.data.id)
							clearTimeout(backendPending.timer)
							backendPending.resolve(shellReply.data)
						}
						return
					}
					const parsed = backendToShellEnvelopeSchema.safeParse(raw)
					if (!parsed.success) {
						log("warn", "discarded invalid Backend bridge envelope")
						return
					}
					const envelope = parsed.data
					const pending = active.pendingShell.get(envelope.id)
					if (pending) {
						active.pendingShell.delete(envelope.id)
						clearTimeout(pending.timer)
						pending.resolve(envelope)
						return
					}
					const wantsReply = REQUEST_TYPES.has(envelope.body.type)
					try {
						active.bridgeReady = true
						const reply = await requestShell(active, envelope, wantsReply)
						if (wantsReply && reply) child.send(reply)
					} catch (error) {
						active.bridgeReady = false
						if (wantsReply) {
							log("warn", "Shell bridge request failed", { type: envelope.body.type, error: error.message })
							child.send({ v: BRIDGE_VERSION, id: envelope.id, at: Date.now(), body: { type: "bridge.error", code: "BACKEND_UNAVAILABLE" } })
						}
					}
				}
			})
			child.on("message", (raw) => { void active.onChildMessage?.(raw) })
			child.once("error", (error) => {
				if (!startupSettled) {
					startupSettled = true
					startupCleanup()
					rejectStartup(error)
				}
			})
			child.once("exit", (code) => {
				if (!startupSettled) {
					startupSettled = true
					startupCleanup()
					rejectStartup(new Error(`remote Backend exited before ready (${code ?? "signal"})`))
				}
				if (session === active) {
					failPending(active, "remote Backend exited")
					session = null
					active.closing = true
					clearTimeout(idleTimer)
					log("warn", "remote Backend process exited", { code: code ?? null })
				}
			})
			const initEnvelope = {
				v: BRIDGE_VERSION,
				id: `host-init-${randomBytes(12).toString("hex")}`,
				at: Date.now(),
				body: {
					type: "init",
					userDataDir: normalizedDataDir,
					providerKeys: body.providerKeys,
					legacyToken: body.legacyToken ?? null,
					localHttpConfig: body.localHttpConfig ?? { enabled: false, host: "127.0.0.1", port: 0 },
					httpPort: config.backendPort,
					appInfo: body.appInfo ?? { name: "OpenPet Remote", version: "0.0.0", packaged: true, platform: process.platform, arch: process.arch },
				},
			}
			const initParsed = shellToBackendEnvelopeSchema.safeParse(initEnvelope)
			if (!initParsed.success) throw new Error("remote Backend init data is invalid")
			child.send(initParsed.data)
			// Do not keep an extra host-side reference to cleartext credentials.
			for (const key of Object.keys(body.providerKeys)) delete body.providerKeys[key]
			const ready = await startup
			touch(active)
			return { status: 200, value: { ok: true, data: { apiVersion: ready.apiVersion, sessionToken: ready.sessionToken, port: config.port } } }
		} catch (error) {
			log("error", "remote Backend startup failed", { reason: error?.message || "startup-failed" })
			await endSession(active, "startup-failed")
			return { status: 503, value: { ok: false, error: "remote Backend startup failed" } }
		}
	}

	async function handleControl(request, response, pathname) {
		if (request.method === "GET" && pathname === "/__openpet/health") {
			sendJson(response, 200, { ok: true, status: session ? "ready" : "idle", apiVersion: "v1" })
			return true
		}
		if (request.method === "POST" && pathname === "/__openpet/session") {
			let body
			try { body = await readJson(request, MAX_SESSION_BYTES) } catch (error) {
				sendJson(response, error.statusCode || 400, { ok: false, error: error.message })
				return true
			}
			const result = await startSession(body)
			sendJson(response, result.status, result.value)
			return true
		}
		const active = session
		if (!active || !safeEqual(readBearer(request), active.ready?.sessionToken)) {
			sendJson(response, 401, { ok: false, error: "unauthorized" })
			return true
		}
		touch(active)
		if (request.method === "POST" && pathname === "/__openpet/heartbeat") {
			sendJson(response, 200, { ok: true })
			return true
		}
		if (request.method === "POST" && pathname === "/__openpet/session/end") {
			sendJson(response, 202, { ok: true })
			void endSession(active)
			return true
		}
		if (request.method === "POST" && pathname === "/__openpet/shell") {
			let envelope
			try { envelope = await readJson(request, MAX_REQUEST_BYTES) } catch (error) {
				sendJson(response, error.statusCode || 400, { ok: false, error: error.message })
				return true
			}
			const parsed = shellToBackendEnvelopeSchema.safeParse(envelope)
			if (!parsed.success || parsed.data.body.type === "init" || parsed.data.body.type === "shutdown") {
				sendJson(response, 400, { ok: false, error: "invalid Shell message" })
				return true
			}
			const message = parsed.data
			if (!active.child || active.closing) {
				sendJson(response, 503, { ok: false, error: "remote Backend is unavailable" })
				return true
			}
			const waiting = active.pendingShell.get(message.id)
			if (waiting) {
				active.pendingShell.delete(message.id)
				clearTimeout(waiting.timer)
				waiting.resolve(message)
				sendJson(response, 200, { ok: true })
				return true
			}
			if (message.body.type === "settings.persist.request") {
				const reply = new Promise((resolveReply, rejectReply) => {
					const timer = setTimeout(() => {
						active.pendingBackend.delete(message.id)
						rejectReply(new Error("Backend message timed out"))
					}, 60_000)
					timer.unref?.()
					active.pendingBackend.set(message.id, { resolve: resolveReply, reject: rejectReply, timer })
				})
				try {
					active.child.send(message)
					const result = await reply
					sendJson(response, 200, { ok: true, envelope: result })
				} catch {
					sendJson(response, 504, { ok: false, error: "Backend message failed" })
				}
				return true
			}
			active.child.send(message, (error) => {
				if (error) sendJson(response, 503, { ok: false, error: "remote Backend is unavailable" })
				else sendJson(response, 202, { ok: true })
			})
			return true
		}
		return false
	}

	async function handleProxy(request, response, pathname, search) {
		const active = session
		if (!active || !active.ready || active.closing) {
			sendJson(response, 503, { ok: false, error: "remote Backend session is not ready" })
			return
		}
		const bearer = readBearer(request)
		if (!safeEqual(bearer, active.ready.sessionToken)) {
			sendJson(response, 401, { ok: false, error: "unauthorized" })
			return
		}
		touch(active)
		const headers = new Headers()
		for (const [name, value] of Object.entries(request.headers)) {
			if (typeof value === "string" && !["host", "connection", "content-length", "transfer-encoding"].includes(name.toLowerCase())) headers.set(name, value)
		}
		let body
		if (!new Set(["GET", "HEAD"]).has(request.method || "GET")) {
			try {
				body = await readJson(request, MAX_REQUEST_BYTES)
			} catch (error) {
				sendJson(response, error.statusCode || 400, { ok: false, error: error.message })
				return
			}
		}
		try {
			const upstream = await config.fetchImpl(`http://127.0.0.1:${active.ready.port}${pathname}${search}`, {
				method: request.method,
				headers,
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				signal: request.signal,
			})
			response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()))
			if (!upstream.body) {
				response.end()
				return
			}
			const { Readable } = await import("node:stream")
			Readable.fromWeb(upstream.body).pipe(response)
		} catch (error) {
			if (!response.headersSent) sendJson(response, 502, { ok: false, error: "remote Backend proxy failed" })
			else response.destroy(error)
		}
	}

	async function handle(request, response) {
		if (request.socket.remoteAddress !== "127.0.0.1" && request.socket.remoteAddress !== "::ffff:127.0.0.1") {
			sendJson(response, 403, { ok: false, error: "loopback clients only" })
			return
		}
		const url = new URL(request.url ?? "/", "http://127.0.0.1")
		try {
			if (await handleControl(request, response, url.pathname)) return
			await handleProxy(request, response, url.pathname, url.search)
		} catch (error) {
			if (!response.headersSent) sendJson(response, 500, { ok: false, error: "remote Backend host error" })
			else response.destroy(error)
			log("error", "remote Backend host request failed", { path: url.pathname, reason: error?.message || "request-failed" })
		}
	}

	return {
		listen() {
			if (server) return Promise.reject(new Error("Backend host already listening"))
			server = createServer((request, response) => { void handle(request, response) })
			server.requestTimeout = 70_000
			server.headersTimeout = 75_000
			return new Promise((resolveListen, rejectListen) => {
				server.once("error", rejectListen)
				server.listen(config.port, config.bindHost, () => {
					server.removeListener("error", rejectListen)
					resolveListen({ host: config.bindHost, port: server.address().port })
				})
			})
		},
		async close() {
			if (closing) return
			closing = true
			clearTimeout(idleTimer)
			await endSession(session, "host-shutdown")
			if (server) await new Promise((resolveClose) => server.close(resolveClose))
			server = null
		},
		getState: () => ({ status: session ? "ready" : "idle", port: config.port, bindHost: config.bindHost }),
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const host = createBackendHost({
		rootDir: resolve(process.env.OPENPET_ROOT_DIR ?? process.cwd()),
		dataDir: resolve(process.env.OPENPET_DATA_DIR ?? "/var/lib/openpet"),
		port: Number(process.env.OPENPET_HOST_PORT ?? DEFAULT_PORT),
		bridgePort: Number(process.env.OPENPET_BRIDGE_PORT ?? DEFAULT_BRIDGE_PORT),
		backendPort: Number(process.env.OPENPET_BACKEND_PORT ?? DEFAULT_BACKEND_PORT),
		logger: console,
	})
	host.listen().then(({ host: bindHost, port }) => {
		console.info("OpenPet remote Backend host listening", { host: bindHost, port })
	}).catch((error) => {
		console.error("OpenPet remote Backend host failed to start", { reason: error?.message || "listen-failed" })
		process.exitCode = 1
	})
	const close = () => { void host.close().finally(() => process.exit(0)) }
	process.once("SIGTERM", close)
	process.once("SIGINT", close)
}
