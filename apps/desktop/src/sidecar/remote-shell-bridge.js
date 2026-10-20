"use strict"

const { createServer } = require("node:http")
const { timingSafeEqual } = require("node:crypto")

function equalSecret(left, right) {
	if (typeof left !== "string" || typeof right !== "string") return false
	const a = Buffer.from(left)
	const b = Buffer.from(right)
	return a.length === b.length && timingSafeEqual(a, b)
}

async function readJson(request, maxBytes) {
	const chunks = []
	let size = 0
	for await (const chunk of request) {
		size += chunk.length
		if (size > maxBytes) throw Object.assign(new Error("bridge request too large"), { statusCode: 413 })
		chunks.push(chunk)
	}
	try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch {
		throw Object.assign(new Error("bridge request is not JSON"), { statusCode: 400 })
	}
}

function createRemoteShellBridge({ token, handler, host = "127.0.0.1", port = 0, maxBytes = 2 * 1024 * 1024, logger } = {}) {
	if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new TypeError("remote Shell bridge token must be 64 hex characters")
	if (typeof handler !== "function") throw new TypeError("remote Shell bridge requires a message handler")
	let currentHandler = handler
	let server = null

	const log = (level, message, fields) => {
		try { logger?.[level]?.(message, fields) } catch {}
	}

	const handle = async (request, response) => {
		if (request.method !== "POST" || request.url !== "/message") {
			response.writeHead(404).end()
			return
		}
		const auth = request.headers.authorization || ""
		if (!equalSecret(auth.startsWith("Bearer ") ? auth.slice(7) : "", token)) {
			response.writeHead(401).end()
			return
		}
		try {
			const body = await readJson(request, maxBytes)
			if (!body || body.envelope === undefined) throw Object.assign(new Error("bridge envelope is required"), { statusCode: 400 })
			const result = await currentHandler(body.envelope)
			const payload = result && typeof result === "object" ? JSON.stringify({ ok: true, envelope: result }) : JSON.stringify({ ok: true })
			response.writeHead(200, {
				"content-type": "application/json; charset=utf-8",
				"content-length": Buffer.byteLength(payload),
				"cache-control": "no-store",
			}).end(payload)
		} catch (error) {
			log("warn", "remote Shell bridge rejected Backend message", { reason: error?.message || "invalid-message" })
			response.writeHead(error?.statusCode || 400, { "cache-control": "no-store" }).end()
		}
	}

	return {
		setHandler(next) {
			if (typeof next !== "function") throw new TypeError("remote Shell bridge handler must be a function")
			currentHandler = next
		},
		listen() {
			if (server) return Promise.reject(new Error("remote Shell bridge already listening"))
			server = createServer((request, response) => { void handle(request, response) })
			return new Promise((resolve, reject) => {
				server.once("error", reject)
				server.listen(port, host, () => {
					server.removeListener("error", reject)
					resolve({ host, port: server.address().port })
				})
			})
		},
		close() {
			if (!server) return Promise.resolve()
			const active = server
			server = null
			return new Promise((resolve) => active.close(resolve))
		},
		address: () => server?.address() || null,
	}
}

module.exports = { createRemoteShellBridge }
