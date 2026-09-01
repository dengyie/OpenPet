import { randomBytes, timingSafeEqual } from "node:crypto"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import path from "node:path"

import { ApiError } from "../http/middleware.js"
import { signalProcessTree } from "../jobs/runner.js"

const require = createRequire(import.meta.url)
const {
	createPluginEntryCwdResolver,
	createPluginProcessEnv,
	resolvePluginProcessLaunch,
} = require("../../../src/main/services/plugin-process-support.js")
const {
	sanitizePluginCommandResultValue,
	sanitizePluginCommandText,
} = require("../../../src/main/services/plugin-runtime-safety.js")

const HOST = "127.0.0.1"
const MAX_BODY_BYTES = 1024 * 1024
const MAX_OUTPUT_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 420_000
const AGENT_AWARENESS_PLUGIN_ID = "openpet.agent-awareness"

const CAPABILITY_BY_PATH = Object.freeze({
	"/pet/say": "pet:say",
	"/pet/action": "pet:play-action",
	"/pet/play-action": "pet:play-action",
	"/pet/event": "pet:event",
	"/trigger-proposals/write": "trigger-proposals:write",
	"/model/image-generate": "model:image-generate",
	"/settings/read": "settings:read",
	"/logs/write": "logs:write",
	"/network/fetch": "network:fetch",
})

function requiredString(value, field) {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ApiError("VALIDATION_FAILED", `${field} is required`, { details: { field } })
	}
	return value.trim()
}

function objectArgs(value) {
	if (value === undefined || value === null) return {}
	if (typeof value !== "object" || Array.isArray(value)) {
		throw new ApiError("VALIDATION_FAILED", "Plugin command args must be an object")
	}
	return structuredClone(value)
}

function token() {
	return randomBytes(24).toString("base64url")
}

function appendOutput(current, chunk) {
	const next = current + String(chunk ?? "")
	return Buffer.byteLength(next) <= MAX_OUTPUT_BYTES
		? next
		: Buffer.from(next).subarray(0, MAX_OUTPUT_BYTES).toString("utf8")
}

function parseResult(stdout) {
	const lines = String(stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		try {
			const result = JSON.parse(lines[index])
			if (result && typeof result === "object") return sanitizePluginCommandResultValue(result)
		} catch {}
	}
	return null
}

function tokensEqual(candidate, expected) {
	const left = Buffer.from(String(candidate ?? ""))
	const right = Buffer.from(String(expected ?? ""))
	return left.length === right.length && timingSafeEqual(left, right)
}

function readJson(request) {
	return new Promise((resolve, reject) => {
		const chunks = []
		let bytes = 0
		request.on("data", (chunk) => {
			bytes += Buffer.byteLength(chunk)
			if (bytes > MAX_BODY_BYTES) {
				reject(new ApiError("PAYLOAD_TOO_LARGE", "Plugin command bridge request is too large", { status: 413 }))
				request.destroy()
				return
			}
			chunks.push(Buffer.from(chunk))
		})
		request.on("end", () => {
			try {
				const body = Buffer.concat(chunks).toString("utf8")
				resolve(body ? JSON.parse(body) : {})
			} catch (cause) {
				reject(new ApiError("VALIDATION_FAILED", "Plugin command bridge body must be valid JSON", { cause }))
			}
		})
		request.on("error", reject)
	})
}

function sendJson(response, status, body) {
	if (response.writableEnded || response.destroyed) return
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	})
	response.end(JSON.stringify(body))
}

function errorStatus(error) {
	return Number(error?.status) || (error?.code === "PERMISSION_DENIED" ? 403 : 400)
}

function killProcessTree(child) {
	if (process.platform !== "win32" && Number(child?.pid) > 0) {
		try { process.kill(-Number(child.pid), "SIGKILL") } catch {}
	}
	try { signalProcessTree(child, "SIGKILL") } catch {
		try { child.kill("SIGKILL") } catch {}
	}
}

function processGroupExists(pid) {
	if (process.platform === "win32" || !Number.isInteger(Number(pid)) || Number(pid) <= 0) return false
	try { process.kill(-Number(pid), 0); return true } catch (error) { return error?.code !== "ESRCH" }
}

async function waitForProcessBoundary(child, maxMs = 2_000) {
	if (process.platform === "win32") return
	const deadline = Date.now() + maxMs
	while (processGroupExists(child?.pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
}

export function createPluginCommandServer({ plugins, jobs, logger, processLedger, now = Date.now } = {}) {
	if (!plugins || typeof plugins !== "object") throw new TypeError("plugin command server requires plugins")
	if (typeof jobs?.insert !== "function") throw new TypeError("plugin command server requires jobs.insert")
	const resolveCwd = createPluginEntryCwdResolver()
	const runtimes = new Map()
	const runsByPlugin = new Map()
	const transientInputs = new Map()
	const pluginGenerations = new Map()
	let server = null
	let starting = null
	let closing = null
	let closed = false
	let closeGeneration = 0
	let sequence = 0
	const appendLog = (entry) => {
		try { plugins.appendLog?.(entry) } catch (error) {
			logger?.warn?.("Plugin command log append failed", { pluginId: entry.pluginId, error: String(error) })
		}
	}

	const handleRequest = async (request, response) => {
		const controller = new AbortController()
		const abort = () => {
			if (!controller.signal.aborted) controller.abort(new Error("Plugin command bridge client disconnected"))
		}
		const closed = () => { if (!response.writableEnded) abort() }
		request.once("aborted", abort)
		response.once("close", closed)
		try {
			if (request.method !== "POST") {
				sendJson(response, 404, { ok: false, error: "Not found" })
				return
			}
			const url = new URL(request.url, `http://${HOST}`)
			const match = url.pathname.match(/^\/commands\/([^/]+)\/([^/]+)\/([^/]+)(\/.*)$/)
			if (!match) {
				sendJson(response, 404, { ok: false, error: "Not found" })
				return
			}
			const [, pluginId, command, runId, pathname] = match
			const runtime = runtimes.get(runId)
			const bearer = String(request.headers.authorization ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? ""
			if (!runtime || runtime.pluginId !== pluginId || runtime.command !== command || !tokensEqual(bearer, runtime.token)) {
				sendJson(response, 401, { ok: false, error: "Unauthorized" })
				return
			}
			const capability = CAPABILITY_BY_PATH[pathname]
			if (!capability || typeof plugins.handleCommandCapability !== "function") {
				sendJson(response, 404, { ok: false, error: "Not found" })
				return
			}
			const result = await plugins.handleCommandCapability(pluginId, capability, await readJson(request), {
				signal: controller.signal,
			})
			sendJson(response, 200, result)
		} catch (error) {
			logger?.warn?.("Plugin command bridge request failed", { error: String(error) })
			sendJson(response, errorStatus(error), { ok: false, code: error?.code ?? "VALIDATION_FAILED", error: error?.message ?? "Plugin command bridge request failed" })
		} finally {
			request.off("aborted", abort)
			response.off("close", closed)
		}
	}

	async function listen() {
		if (closed || closing) throw new ApiError("BACKEND_UNAVAILABLE", "Plugin command server is closed")
		if (server?.listening) {
			const address = server.address()
			return { host: HOST, port: address.port, url: `http://${HOST}:${address.port}` }
		}
		if (starting) return starting
		starting = new Promise((resolve, reject) => {
			const next = createServer((request, response) => void handleRequest(request, response))
			next.requestTimeout = 0
			next.once("error", reject)
			next.listen(0, HOST, () => {
				next.removeAllListeners("error")
				server = next
				server.unref?.()
				const address = server.address()
				resolve({ host: HOST, port: address.port, url: `http://${HOST}:${address.port}` })
			})
		}).finally(() => { starting = null })
		return starting
	}

	function close() {
		if (closing) return closing
		if (closed) return Promise.resolve()
		closed = true
		closeGeneration += 1
		closing = (async () => {
			const activeRuns = [...runsByPlugin.values()].flatMap((runs) => [...runs])
			runtimes.clear()
			transientInputs.clear()
			for (const run of activeRuns) killProcessTree(run.child)
			await Promise.allSettled(activeRuns.map(async (run) => { await run.done; await waitForProcessBoundary(run.child) }))
			const pending = starting
			if (pending) {
				try { await pending } catch {}
			}
			const current = server
			server = null
			starting = null
			if (!current) return
			current.closeAllConnections?.()
			await new Promise((resolve) => current.close(() => resolve()))
		})().finally(() => { closing = null })
		return closing
	}

	async function stopPlugin(pluginId) {
		const normalizedPluginId = requiredString(pluginId, "pluginId")
		pluginGenerations.set(normalizedPluginId, (pluginGenerations.get(normalizedPluginId) ?? 0) + 1)
		const activeRuns = [...(runsByPlugin.get(normalizedPluginId) ?? [])]
		for (const run of activeRuns) runtimes.delete(run.runId)
		for (const run of activeRuns) killProcessTree(run.child)
		await Promise.allSettled(activeRuns.map(async (run) => { await run.done; await waitForProcessBoundary(run.child) }))
		return { ok: true, pluginId: normalizedPluginId }
	}

	function dispatch(pluginId, command, args = {}) {
		const normalizedPluginId = requiredString(pluginId, "pluginId")
		const normalizedCommand = requiredString(command, "command")
		plugins.get?.(normalizedPluginId)
		const createdAt = now()
		sequence += 1
		const id = `plugin.command:${normalizedPluginId}:${createdAt}:${sequence}`
		transientInputs.set(id, { pluginId: normalizedPluginId, command: normalizedCommand, args: objectArgs(args) })
		try {
			return jobs.insert({
			id,
			kind: "plugin.command",
			input: { pluginId: normalizedPluginId, command: normalizedCommand, args: objectArgs(args) },
			resourceKey: `plugin:${normalizedPluginId}`,
			createdAt,
			})
		} catch (error) {
			transientInputs.delete(id)
			throw error
		}
	}

	function takeInput(jobId) {
		const value = transientInputs.get(jobId)
		transientInputs.delete(jobId)
		return value
	}

	async function execute(pluginId, command, args = {}, context = {}) {
		if (context.signal?.aborted) throw context.signal.reason ?? new Error("Job canceled")
		if (closed || closing) throw new ApiError("BACKEND_UNAVAILABLE", "Plugin command server is closed")
		const executeGeneration = closeGeneration
		const normalizedPluginId = requiredString(pluginId, "pluginId")
		const pluginGeneration = pluginGenerations.get(normalizedPluginId) ?? 0
		const normalizedCommand = requiredString(command, "command")
		const definition = plugins.definition?.(normalizedPluginId)
		if (!definition?.manifest) throw new ApiError("NOT_FOUND", "Plugin not found", { details: { pluginId: normalizedPluginId } })
		const commandEntry = definition.manifest.entries?.commands?.find((entry) => entry.id === normalizedCommand)
		if (!commandEntry) throw new ApiError("NOT_FOUND", "Plugin command not found", { details: { pluginId: normalizedPluginId, command: normalizedCommand } })
		const launch = resolvePluginProcessLaunch(commandEntry.command)
		const cwd = resolveCwd(definition.manifest, commandEntry.cwd || ".", "command")
		if (typeof plugins.runtimeDirs !== "function") {
			throw new ApiError("BACKEND_UNAVAILABLE", "Plugin runtime directories are unavailable")
		}
		const dirs = plugins.runtimeDirs(normalizedPluginId)
		const plugin = normalizedPluginId === AGENT_AWARENESS_PLUGIN_ID ? plugins.get?.(normalizedPluginId) : null
		const commandContext = {
			pluginId: normalizedPluginId,
			commandId: normalizedCommand,
			payload: objectArgs(args),
			config: plugins.config?.(normalizedPluginId) ?? {},
			...(normalizedPluginId === AGENT_AWARENESS_PLUGIN_ID ? {
				runtime: { nativeExecutionApproved: plugin?.nativeExecutionApproved === true },
			} : {}),
			paths: { extensionDir: cwd },
		}
		let commandInput
		try { commandInput = `${JSON.stringify(commandContext)}\n` } catch (cause) {
			throw new ApiError("VALIDATION_FAILED", "Plugin command context must be JSON serializable", { cause })
		}
		const address = await listen()
		if (context.signal?.aborted) throw context.signal.reason ?? new Error("Job canceled")
		if (closed || executeGeneration !== closeGeneration) throw new ApiError("BACKEND_UNAVAILABLE", "Plugin command server closed before launch")
		if (pluginGeneration !== (pluginGenerations.get(normalizedPluginId) ?? 0)) {
			throw new ApiError("CONFLICT", "Plugin stopped before command launch", { details: { pluginId: normalizedPluginId } })
		}
		const runId = token()
		const bridgeToken = token()
		const child = spawn(launch.file, launch.args, {
			cwd,
			detached: process.platform !== "win32",
			env: {
				...createPluginProcessEnv({ runAsNode: launch.runAsNode }),
				OPENPET_DATA_DIR: dirs.dataDir,
				OPENPET_CACHE_DIR: dirs.cacheDir,
				OPENPET_LOG_DIR: dirs.logDir,
				OPENPET_BRIDGE_URL: `${address.url}/commands/${encodeURIComponent(normalizedPluginId)}/${encodeURIComponent(normalizedCommand)}/${runId}`,
				OPENPET_BRIDGE_TOKEN: bridgeToken,
			},
			shell: false,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		})
		let ledgerRegistered = false
		try {
			if (typeof processLedger?.register === "function") {
				processLedger.register(child.pid, {
					pluginId: normalizedPluginId,
					commandId: normalizedCommand,
					startedAt: now(),
					processName: path.basename(launch.file),
				})
				ledgerRegistered = true
			}
			context.registerProcess?.(child)
		} catch (error) {
			if (ledgerRegistered) {
				try { processLedger.unregister(child.pid) } catch (unregisterError) {
					logger?.warn?.("Plugin command process ledger cleanup failed", { pid: child.pid, error: String(unregisterError) })
				}
			}
			killProcessTree(child)
			throw error
		}
		runtimes.set(runId, { pluginId: normalizedPluginId, command: normalizedCommand, token: bridgeToken })
		appendLog({ pluginId: normalizedPluginId, level: "info", message: `Command ${normalizedCommand} started` })
		const timeoutMs = Number.isFinite(Number(commandEntry.timeoutMs))
			? Math.max(0, Number(commandEntry.timeoutMs))
			: DEFAULT_TIMEOUT_MS

		const run = { pluginId: normalizedPluginId, runId, child, done: null }
		if (!runsByPlugin.has(normalizedPluginId)) runsByPlugin.set(normalizedPluginId, new Set())
		runsByPlugin.get(normalizedPluginId).add(run)
		const execution = new Promise((resolve, reject) => {
			let settled = false
			let stdout = ""
			let stderr = ""
			let timeout = null
			const settle = (callback) => {
				if (settled) return
				settled = true
				clearTimeout(timeout)
				context.signal?.removeEventListener?.("abort", aborted)
					runtimes.delete(runId)
					const pluginRuns = runsByPlugin.get(normalizedPluginId)
					pluginRuns?.delete(run)
					if (pluginRuns?.size === 0) runsByPlugin.delete(normalizedPluginId)
				if (ledgerRegistered) {
					try { processLedger.unregister(child.pid) } catch (error) {
						logger?.warn?.("Plugin command process ledger cleanup failed", { pid: child.pid, error: String(error) })
					}
				}
				callback()
			}
			const aborted = () => {
				killProcessTree(child)
				settle(() => reject(context.signal?.reason ?? new Error("Job canceled")))
			}
			if (context.signal?.aborted) {
				aborted()
				return
			}
			context.signal?.addEventListener?.("abort", aborted, { once: true })
			if (timeoutMs > 0) {
				timeout = setTimeout(() => {
					killProcessTree(child)
					settle(() => reject(new ApiError("PROVIDER_TIMEOUT", `Plugin command timed out after ${timeoutMs}ms`, { status: 504 })))
				}, timeoutMs)
				timeout.unref?.()
			}
			child.stdout.on("data", (chunk) => { stdout = appendOutput(stdout, chunk) })
			child.stderr.on("data", (chunk) => { stderr = appendOutput(stderr, chunk) })
			child.stdin.on("error", (error) => {
				killProcessTree(child)
				settle(() => reject(error))
			})
			child.once("error", (error) => settle(() => reject(error)))
			child.once("exit", (code, signal) => settle(() => {
				if (code !== 0 || signal) {
					const parsed = parseResult(stdout)
					const structuredError = parsed?.ok === false ? parsed : null
					const message = typeof structuredError?.error === "string" && structuredError.error
						? structuredError.error
						: sanitizePluginCommandText(stderr || `Plugin command exited with ${signal || code}`)
					reject(new ApiError("PROVIDER_ERROR", message, { status: 502, details: structuredError }))
					return
				}
				const parsed = parseResult(stdout)
				appendLog({ pluginId: normalizedPluginId, level: "info", message: `Command ${normalizedCommand} completed` })
				resolve({
					ok: true,
					pluginId: normalizedPluginId,
					commandId: normalizedCommand,
					exitCode: code,
					...(parsed ? { result: parsed } : {}),
					...(!parsed && stdout.trim() ? { stdout: sanitizePluginCommandText(stdout.trim()) } : {}),
					...(stderr.trim() ? { stderr: sanitizePluginCommandText(stderr.trim()) } : {}),
				})
			}))
			try {
				child.stdin.end(commandInput)
			} catch (error) {
				killProcessTree(child)
				settle(() => reject(error))
			}
		})
		run.done = execution
		return execution
	}

	return { listen, close, stopPlugin, dispatch, takeInput, execute }
}
