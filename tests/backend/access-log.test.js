"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")

let accessLog

test("HTTP access log persists a finite numeric timestamp", async () => {
	;({ accessLog } = await import("../../services/backend/http/middleware.js"))
	let persistedEntry
	const middleware = accessLog({
		appendHttp(entry) {
			persistedEntry = entry
		},
	})
	const ctx = {
		requestId: "request-1",
		method: "GET",
		rawPath: "/api/v1/health",
		res: { statusCode: 200 },
		client: "control-center",
		startedAt: performance.now(),
	}

	await middleware(ctx, async () => {})

	assert.equal(typeof persistedEntry.at, "number")
	assert.ok(Number.isFinite(persistedEntry.at))
})
