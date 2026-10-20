"use strict"

const { spawn } = require("node:child_process")
const { randomBytes } = require("node:crypto")
const { createRemoteShellBridge } = require("./remote-shell-bridge")

const DEFAULT_HOST_PORT = 48330
const DEFAULT_BRIDGE_REMOTE_PORT = 48331
const DEFAULT_LOCAL_BRIDGE_PORT = 0
const DEFAULT_CONNECT_TIMEOUT_MS = 20_000
const MAX_HEARTBEAT_FAILURES = 3

function validateAlias(value) {
	const alias = String(value || "").trim()
	if (!/^[A-Za-z0-9][A-Za-z0-9_.@-]{0,63}$/.test(alias)) throw new Error("invalid SSH alias")
	return alias
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

function waitForExit(exitPromise, timeoutMs) {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(false), timeoutMs)
		exitPromise.then(() => {
			clearTimeout(timer)
			resolve(true)
		}, () => {
			clearTimeout(timer)
			resolve(true)
		})
	})
}

async function fetchJson(fetchImpl, url, options = {}, timeoutMs = 5_000) {
	const requestOptions = options.signal ? options : { ...options, signal: AbortSignal.timeout(timeoutMs) }
	const response = await fetchImpl(url, requestOptions)
	const text = await response.text()
	let body = null
	try { body = JSON.parse(text) } catch {}
	if (!response.ok) throw Object.assign(new Error(body?.error || `remote request failed (${response.status})`), { statusCode: response.status })
	return body
}

async function connectRemoteBackend({
	sshAlias = "gz-cvm",
	hostPort = DEFAULT_HOST_PORT,
	bridgeRemotePort = DEFAULT_BRIDGE_REMOTE_PORT,
	localBridgePort = DEFAULT_LOCAL_BRIDGE_PORT,
	providerKeys = {},
	legacyToken = null,
	localHttpConfig = { enabled: false, host: "127.0.0.1", port: 0 },
	appInfo = {},
	spawnImpl = spawn,
	fetchImpl = globalThis.fetch,
	logger,
	onMessage,
	onExit,
	timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
} = {}) {
	if (typeof fetchImpl !== "function") throw new TypeError("remote Backend connector requires fetch")
	const alias = validateAlias(sshAlias)
	for (const [name, value] of [["hostPort", hostPort], ["bridgeRemotePort", bridgeRemotePort]]) {
		if (!Number.isInteger(value) || value < 1 || value > 65535) throw new TypeError(`${name} must be a valid port`)
	}
	if (!Number.isInteger(localBridgePort) || localBridgePort < 0 || localBridgePort > 65535) throw new TypeError("localBridgePort must be a valid port")
	const bridgeToken = randomBytes(32).toString("hex")
	const bridge = createRemoteShellBridge({
		token: bridgeToken,
		handler: async (raw) => onMessage?.(raw),
		port: localBridgePort,
		logger,
	})
	const bridgeAddress = await bridge.listen()
	const localPort = hostPort
	let heartbeat = null
	let heartbeatFailures = 0
	let bridgeClosed = false
	let exitNotified = false
	const closeBridge = async () => {
		if (bridgeClosed) return
		bridgeClosed = true
		await bridge.close()
	}
	const clearHeartbeat = () => {
		if (!heartbeat) return
		clearInterval(heartbeat)
		heartbeat = null
	}
	const notifyExit = (code, signal) => {
		if (exitNotified) return
		exitNotified = true
		clearHeartbeat()
		void closeBridge()
		onExit?.(code, signal)
	}
	const args = [
		"-o", "BatchMode=yes",
		"-o", "ExitOnForwardFailure=yes",
		"-o", "StrictHostKeyChecking=yes",
		"-o", "ServerAliveInterval=15",
		"-o", "ServerAliveCountMax=3",
		"-N",
		"-L", `127.0.0.1:${localPort}:127.0.0.1:${hostPort}`,
		"-R", `127.0.0.1:${bridgeRemotePort}:127.0.0.1:${bridgeAddress.port}`,
		alias,
	]
	let ssh
	try {
		ssh = spawnImpl("ssh", args, { stdio: ["ignore", "ignore", "ignore"], shell: false })
	} catch (error) {
		await bridge.close()
		throw error
	}
	let exited = false
	let spawnError = null
	const exitPromise = new Promise((resolve) => {
		let settled = false
		const finish = (result) => {
			if (settled) return
			settled = true
			resolve(result)
		}
		ssh.once("exit", (code, signal) => {
			exited = true
			notifyExit(code, signal)
			finish({ code, signal })
		})
		ssh.once("error", (error) => {
			exited = true
			spawnError = error
			notifyExit(null, null)
			finish({ error })
		})
	})
	const startedAt = Date.now()
	try {
		let healthy = false
		while (!healthy && !exited && Date.now() - startedAt < timeoutMs) {
			try {
				const result = await fetchJson(fetchImpl, `http://127.0.0.1:${localPort}/__openpet/health`, {}, Math.min(1_500, Math.max(1, timeoutMs - (Date.now() - startedAt))))
				healthy = result?.ok === true
			} catch {}
			if (!healthy) await sleep(100)
		}
		if (!healthy) {
			if (spawnError) throw spawnError
			throw new Error(exited ? "SSH tunnel exited before remote host became ready" : "remote Backend host health timeout")
		}
		const session = await fetchJson(fetchImpl, `http://127.0.0.1:${localPort}/__openpet/session`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ bridgeToken, providerKeys, legacyToken, localHttpConfig, appInfo }),
		}, Math.max(1, timeoutMs - (Date.now() - startedAt)))
		const data = session?.data
		if (!data?.sessionToken || typeof data.sessionToken !== "string") throw new Error("remote Backend session did not return a token")
		if (exited) throw new Error("SSH tunnel exited during remote session bootstrap")
		heartbeat = setInterval(() => {
			return fetchJson(fetchImpl, `http://127.0.0.1:${localPort}/__openpet/heartbeat`, { method: "POST", headers: { authorization: `Bearer ${data.sessionToken}` } }, 3_000)
				.then((result) => {
					if (result?.ok !== true) throw new Error("remote Backend heartbeat response is invalid")
					heartbeatFailures = 0
				})
				.catch((error) => {
					heartbeatFailures += 1
					const sessionRejected = [401, 403, 404].includes(error?.statusCode)
					if (!sessionRejected && heartbeatFailures < MAX_HEARTBEAT_FAILURES) return
					notifyExit(null, null)
					if (!exited) {
						try { ssh.kill("SIGTERM") } catch {}
					}
				})
		}, 10_000)
		heartbeat.unref?.()
		const child = {
			pid: ssh.pid,
			send(envelope, callback) {
				request(envelope).then((payload) => {
					if (payload?.envelope) void onMessage?.(payload.envelope)
					callback?.()
				}).catch((error) => callback?.(error))
			},
			on(event, listener) {
				if (event === "exit") exitPromise.then(({ code, signal }) => listener(code, signal))
				return this
			},
			once(event, listener) { return this.on(event, listener) },
			kill(signal = "SIGTERM") { try { ssh.kill(signal) } catch {} },
		}
		async function request(envelope) {
			return fetchJson(fetchImpl, `http://127.0.0.1:${localPort}/__openpet/shell`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${data.sessionToken}` },
				body: JSON.stringify(envelope),
			}, 70_000)
		}
		return {
			child,
			baseUrl: `http://127.0.0.1:${localPort}/api/v1`,
			sessionToken: data.sessionToken,
			apiVersion: data.apiVersion || "v1",
			pid: ssh.pid,
			startupMs: Date.now() - startedAt,
			processName: process.platform === "win32" ? "ssh.exe" : "ssh",
			request,
			close: async () => {
				clearHeartbeat()
				try {
					await fetchJson(fetchImpl, `http://127.0.0.1:${localPort}/__openpet/session/end`, { method: "POST", headers: { authorization: `Bearer ${data.sessionToken}` } }, 2_000)
				} catch {}
				if (!exited) {
					try { ssh.kill("SIGTERM") } catch {}
					const stopped = await waitForExit(exitPromise, 2_000)
					if (!stopped) {
						try { ssh.kill("SIGKILL") } catch {}
						await waitForExit(exitPromise, 1_000)
					}
				}
				await closeBridge()
			},
		}
	} catch (error) {
		try { ssh.kill("SIGTERM") } catch {}
		await closeBridge()
		throw error
	}
}

module.exports = { connectRemoteBackend, validateAlias, DEFAULT_HOST_PORT, DEFAULT_BRIDGE_REMOTE_PORT }
