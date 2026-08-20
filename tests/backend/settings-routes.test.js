"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { before, describe, it } = require("node:test")

let createRouter
let middleware
let settingsRoutes
let ApiError

before(async () => {
	;({ createRouter } = await import("../../services/backend/http/router.js"))
	middleware = await import("../../services/backend/http/middleware.js")
	;({ ApiError } = middleware)
	settingsRoutes = await import("../../services/backend/routes/settings.js")
})

function createStore() {
	let current = { version: 3, values: { "pet.scale": 1 } }
	return {
		read: () => structuredClone(current),
		patch({ ifVersion, patch }) {
			if (ifVersion !== current.version) {
				throw new ApiError("CONFLICT", "版本已变化", {
					details: { currentVersion: current.version },
				})
			}
			const changedPaths = Object.keys(patch).filter((key) => current.values[key] !== patch[key])
			if (changedPaths.length > 0) {
				current = { version: current.version + 1, values: { ...current.values, ...patch } }
			}
			return { version: current.version, changedPaths }
		},
	}
}

async function withServer(run) {
	const router = createRouter({ basePath: "/api/v1" })
	const store = createStore()
	const events = []
	router.use(middleware.requestId())
	router.use(middleware.errorBoundary())
	router.use(middleware.loopbackOnly())
	router.use(middleware.jsonBody())
	settingsRoutes.registerSettingsRoutes({ router, store, emit: (...event) => events.push(event) })
	const server = createServer((req, res) => void router.handle(req, res))
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	try {
		await run({ url: `http://127.0.0.1:${server.address().port}/api/v1`, router, events })
	} finally {
		await new Promise((resolve) => server.close(resolve))
	}
}

function jsonRequest(url, init) {
	return fetch(url, {
		...init,
		headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
	})
}

describe("T10 settings routes", () => {
	it("registers the five canonical routes", () => {
		const router = createRouter({ basePath: "/api/v1" })
		settingsRoutes.registerSettingsRoutes({ router, store: createStore() })
		assert.deepEqual(router.routes(), settingsRoutes.SETTINGS_ROUTES_LIST.map((route) => {
			const [method, path] = route.split(" ")
			return `${method} /api/v1${path}`
		}))
	})

	it("reads and patches with optimistic locking and emits only real changes", async () => {
		await withServer(async ({ url, events }) => {
			const read = await fetch(url + "/settings")
			assert.equal(read.status, 200)
			assert.deepEqual((await read.json()).data, { version: 3, values: { "pet.scale": 1 } })
			const patch = await jsonRequest(url + "/settings", {
				method: "PATCH",
				body: JSON.stringify({ ifVersion: 3, patch: { "pet.scale": 1.25 } }),
			})
			assert.equal(patch.status, 200)
			assert.deepEqual((await patch.json()).data, { version: 4, changedPaths: ["pet.scale"] })
			assert.deepEqual(events, [["settings.changed", { paths: ["pet.scale"], version: 4 }]])
			const noop = await jsonRequest(url + "/settings", {
				method: "PATCH",
				body: JSON.stringify({ ifVersion: 4, patch: { "pet.scale": 1.25 } }),
			})
			assert.deepEqual((await noop.json()).data, { version: 4, changedPaths: [] })
			assert.equal(events.length, 1)
		})
	})

	it("returns conflict details and rejects invalid patch paths", async () => {
		await withServer(async ({ url }) => {
			const conflict = await jsonRequest(url + "/settings", {
				method: "PATCH",
				body: JSON.stringify({ ifVersion: 2, patch: { "pet.scale": 2 } }),
			})
			assert.equal(conflict.status, 409)
			assert.equal((await conflict.json()).error.details.currentVersion, 3)
			const invalid = await jsonRequest(url + "/settings", {
				method: "PATCH",
				body: JSON.stringify({ ifVersion: 3, patch: { "__proto__.polluted": true } }),
			})
			assert.equal(invalid.status, 400)
			assert.equal((await invalid.json()).error.code, "VALIDATION_FAILED")
		})
	})
})
