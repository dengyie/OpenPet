"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { test } = require("node:test")

test("HTTP router preserves scalar query values and records duplicate keys", async () => {
	const { createRouter } = await import("../../services/backend/http/router.js")
	const router = createRouter({ basePath: "" })
	router.get("/query", async (ctx) => {
		const payload = {
			query: ctx.query,
			hasDuplicateQueryKeys: ctx.hasDuplicateQueryKeys,
		}
		ctx.res.writeHead(200, { "content-type": "application/json" })
		ctx.res.end(JSON.stringify(payload))
	})
	const server = createServer((req, res) => void router.handle(req, res))
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	try {
		const base = `http://127.0.0.1:${server.address().port}/query`
		const duplicate = await fetch(`${base}?runId=run-1&runId=run-2&debug=true`)
		assert.deepEqual(await duplicate.json(), {
			query: { runId: "run-2", debug: "true" },
			hasDuplicateQueryKeys: true,
		})

		const unique = await fetch(`${base}?runId=run-1&debug=true`)
		assert.deepEqual(await unique.json(), {
			query: { runId: "run-1", debug: "true" },
			hasDuplicateQueryKeys: false,
		})
	} finally {
		await new Promise((resolve) => server.close(resolve))
	}
})
