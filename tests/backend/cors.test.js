"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { before, describe, it } = require("node:test")

let createRouter
let middleware

before(async () => {
	;({ createRouter } = await import("../../services/backend/http/router.js"))
	middleware = await import("../../services/backend/http/middleware.js")
})

async function withServer(run) {
	const router = createRouter({ basePath: "/api/v1" })
	router.use(middleware.requestId())
	router.use(middleware.errorBoundary())
	router.use(middleware.loopbackOnly())
	router.use(middleware.cors())
	router.use(middleware.bearerAuth({ getSessionToken: () => "test-session-token" }))
	router.use(middleware.jsonBody())
	router.post("/commands", (ctx) => middleware.sendSuccess(ctx, { accepted: ctx.body }))
	router.get("/events", (ctx) => {
		ctx.res.writeHead(200, {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache, no-store",
		})
		ctx.res.end("event: system.ready\ndata: {}\n\n")
	})

	const server = createServer((req, res) => void router.handle(req, res))
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	try {
		const { port } = server.address()
		await run(`http://127.0.0.1:${port}/api/v1`)
	} finally {
		await new Promise((resolve) => server.close(resolve))
	}
}

describe("backend renderer CORS", () => {
	it("accepts Electron file renderer preflight and preserves bearer auth on the command", async () => {
		await withServer(async (url) => {
			const requestedHeaders = "authorization, content-type, idempotency-key, x-client, x-request-id"
			const preflight = await fetch(url + "/commands", {
				method: "OPTIONS",
				headers: {
					origin: "null",
					"access-control-request-method": "POST",
					"access-control-request-headers": requestedHeaders,
				},
			})

			assert.equal(preflight.status, 204)
			assert.equal(preflight.headers.get("access-control-allow-origin"), "null")
			assert.equal(
				preflight.headers.get("access-control-allow-methods"),
				"GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
			)
			for (const header of requestedHeaders.split(", ")) {
				assert.match(preflight.headers.get("access-control-allow-headers"), new RegExp(`(?:^|,\\s*)${header}(?:,|$)`, "i"))
			}

			const unauthorized = await fetch(url + "/commands", {
				method: "POST",
				headers: { origin: "null", "content-type": "application/json" },
				body: "{}",
			})
			assert.equal(unauthorized.status, 401)
			assert.equal(unauthorized.headers.get("access-control-allow-origin"), "null")

			const response = await fetch(url + "/commands", {
				method: "POST",
				headers: {
					origin: "null",
					authorization: "Bearer test-session-token",
					"content-type": "application/json",
					"idempotency-key": "i_test",
					"x-client": "control-center",
					"x-request-id": "r_test",
				},
				body: JSON.stringify({ action: "say" }),
			})
			assert.equal(response.status, 200)
			assert.equal(response.headers.get("access-control-allow-origin"), "null")
			assert.deepEqual((await response.json()).data, { accepted: { action: "say" } })
		})
	})

	it("supports the 127.0.0.1 dev renderer SSE preflight and authorized stream", async () => {
		await withServer(async (url) => {
			const origin = "http://127.0.0.1:5173"
			const preflight = await fetch(url + "/events?topics=system", {
				method: "OPTIONS",
				headers: {
					origin,
					"access-control-request-method": "GET",
					"access-control-request-headers": "accept, authorization, last-event-id",
				},
			})
			assert.equal(preflight.status, 204)
			assert.equal(preflight.headers.get("access-control-allow-origin"), origin)

			const response = await fetch(url + "/events?topics=system", {
				headers: {
					origin,
					accept: "text/event-stream",
					authorization: "Bearer test-session-token",
					"last-event-id": "evt_1",
				},
			})
			assert.equal(response.status, 200)
			assert.equal(response.headers.get("access-control-allow-origin"), origin)
			assert.match(response.headers.get("content-type"), /^text\/event-stream/)
			assert.match(await response.text(), /event: system\.ready/)
		})
	})

	it("does not grant CORS access to untrusted web origins", async () => {
		await withServer(async (url) => {
			const response = await fetch(url + "/commands", {
				method: "OPTIONS",
				headers: {
					origin: "https://attacker.example",
					"access-control-request-method": "POST",
					"access-control-request-headers": "authorization, content-type",
				},
			})
			assert.equal(response.status, 401)
			assert.equal(response.headers.get("access-control-allow-origin"), null)
		})
	})

	it("rejects unsupported preflight headers without bypassing the allowlist", async () => {
		await withServer(async (url) => {
			const response = await fetch(url + "/commands", {
				method: "OPTIONS",
				headers: {
					origin: "null",
					"access-control-request-method": "POST",
					"access-control-request-headers": "authorization, x-not-allowed",
				},
			})
			assert.equal(response.status, 403)
			assert.equal((await response.json()).error.code, "PERMISSION_DENIED")
		})
	})
})
