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
	let current = { version: 3, values: { "pet.scale": 1, apiKey: "sk-plain", apiKeyRef: "ai.default", localHttp: { token: "secret-token" }, secretTokens: ["array-secret"] } }
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
			assert.deepEqual((await read.json()).data, { version: 3, values: { "pet.scale": 1, apiKeyRef: "ai.default", localHttp: {} } })
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

	it("rejects home-anchor persistence from every HTTP client", async () => {
		const router = createRouter({ basePath: "/api/v1" })
		const store = createStore()
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.loopbackOnly())
		router.use(middleware.bearerAuth({ getSessionToken: () => "session" }))
		router.use(middleware.jsonBody())
		settingsRoutes.registerSettingsRoutes({ router, store })
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const url = `http://127.0.0.1:${server.address().port}/api/v1/settings`
			const init = { method: "PATCH", headers: { authorization: "Bearer session", "content-type": "application/json" }, body: JSON.stringify({ ifVersion: 3, patch: { "petBehavior.home.anchor": { displayId: "display", x: 1, y: 2 } } }) }
			const untrusted = await fetch(url, init)
			assert.equal(untrusted.status, 403)
			const forged = await fetch(url, { ...init, headers: { ...init.headers, "x-client": "pet-window" } })
			assert.equal(forged.status, 403)
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
	})

	it("awaits the Shell host result before publishing a settled settings event and rolls back new paths", async () => {
		const router = createRouter({ basePath: "/api/v1" })
		const store = createStore()
		const events = []
		let releaseHost
		const hostStarted = new Promise((resolve) => { releaseHost = resolve })
		let hostCalls = 0
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.loopbackOnly())
		router.use(middleware.bearerAuth({ getSessionToken: () => "session" }))
		router.use(middleware.jsonBody())
		settingsRoutes.registerSettingsRoutes({
			router, store, emit: (...event) => events.push(event),
			awaitHostApply: async () => { hostCalls += 1; await hostStarted; throw new Error("native helper failed") }
		})
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const url = `http://127.0.0.1:${server.address().port}/api/v1/settings`
			const responsePromise = fetch(url, { method: "PATCH", headers: { authorization: "Bearer session", "content-type": "application/json" }, body: JSON.stringify({ ifVersion: 3, patch: { scale: 1.5, walkSpeed: 4 } }) })
			await new Promise((resolve) => setTimeout(resolve, 10))
			assert.equal(hostCalls, 1)
			assert.equal(events.length, 0)
			releaseHost()
			const response = await responsePromise
			assert.equal(response.status, 503)
			assert.equal(events.length, 0)
			const restored = store.read().values
			assert.equal(restored.scale, undefined)
			assert.equal(restored.walkSpeed, undefined)
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
	})

	it("serializes HTTP settlement with trusted normalization and publishes only the final version", async () => {
		const router = createRouter({ basePath: "/api/v1" })
		const store = createStore()
		const events = []
		const coordinator = settingsRoutes.createSettingsMutationCoordinator({ emit: (...event) => events.push(event) })
		let hostDone
		const hostStarted = new Promise((resolve) => { hostDone = resolve })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.loopbackOnly())
		router.use(middleware.bearerAuth({ getSessionToken: () => "session" }))
		router.use(middleware.jsonBody())
		settingsRoutes.registerSettingsRoutes({
			router, store, emit: (...event) => events.push(event), mutationCoordinator: coordinator,
			awaitHostApply: async ({ version }) => {
				await coordinator.runTrusted(async () => {
					const trusted = store.patch({ ifVersion: version, patch: { "petBehavior.home.anchor": { displayId: "display", x: 1, y: 2 } } })
					coordinator.publish("settings.changed", { paths: trusted.changedPaths, version: trusted.version })
				})
				await hostStarted
			}
		})
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const url = `http://127.0.0.1:${server.address().port}/api/v1/settings`
			const responsePromise = fetch(url, { method: "PATCH", headers: { authorization: "Bearer session", "content-type": "application/json" }, body: JSON.stringify({ ifVersion: 3, patch: { scale: 1.5 } }) })
			await new Promise((resolve) => setTimeout(resolve, 10))
			assert.equal(events.length, 0)
			hostDone()
			const response = await responsePromise
			assert.equal(response.status, 200)
			assert.deepEqual((await response.json()).data, { version: 5, changedPaths: ["scale"] })
			assert.deepEqual(events, [["settings.changed", { paths: ["scale", "petBehavior.home.anchor"], version: 5 }]])
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
	})

	it("rolls back the HTTP change after a trusted mutation during a rejected host apply", async () => {
		const router = createRouter({ basePath: "/api/v1" })
		const store = createStore()
		const events = []
		const coordinator = settingsRoutes.createSettingsMutationCoordinator({ emit: (...event) => events.push(event) })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.loopbackOnly())
		router.use(middleware.bearerAuth({ getSessionToken: () => "session" }))
		router.use(middleware.jsonBody())
		settingsRoutes.registerSettingsRoutes({
			router, store, emit: (...event) => events.push(event), mutationCoordinator: coordinator,
			awaitHostApply: async ({ version }) => {
				await coordinator.runTrusted(async () => {
					const trusted = store.patch({ ifVersion: version, patch: { "petBehavior.home.anchor": { displayId: "display", x: 1, y: 2 } } })
					coordinator.publish("settings.changed", { paths: trusted.changedPaths, version: trusted.version })
				})
				throw new Error("native helper failed")
			}
		})
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const url = `http://127.0.0.1:${server.address().port}/api/v1/settings`
			const response = await fetch(url, { method: "PATCH", headers: { authorization: "Bearer session", "content-type": "application/json" }, body: JSON.stringify({ ifVersion: 3, patch: { scale: 1.5 } }) })
			assert.equal(response.status, 503)
			assert.equal(store.read().values.scale, undefined)
			assert.deepEqual(store.read().values["petBehavior.home.anchor"], { displayId: "display", x: 1, y: 2 })
			assert.deepEqual(events, [["settings.changed", { paths: ["petBehavior.home.anchor"], version: 6 }]])
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
	})

	it("does not expose an HTTP transient value to GET while host apply is pending", async () => {
		const router = createRouter({ basePath: "/api/v1" })
		const store = createStore()
		let releaseHost
		const hostStarted = new Promise((resolve) => { releaseHost = resolve })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.loopbackOnly())
		router.use(middleware.bearerAuth({ getSessionToken: () => "session" }))
		router.use(middleware.jsonBody())
		settingsRoutes.registerSettingsRoutes({
			router, store,
			awaitHostApply: async () => hostStarted,
		})
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const url = `http://127.0.0.1:${server.address().port}/api/v1/settings`
			const patchPromise = jsonRequest(url, {
				method: "PATCH", headers: { authorization: "Bearer session" },
				body: JSON.stringify({ ifVersion: 3, patch: { scale: 1.5 } }),
			})
			await new Promise((resolve) => setTimeout(resolve, 10))
			const getPromise = fetch(url, { headers: { authorization: "Bearer session" } })
			const pending = await Promise.race([
				getPromise.then(() => false),
				new Promise((resolve) => setTimeout(() => resolve(true), 10)),
			])
			assert.equal(pending, true)
			releaseHost()
			assert.equal((await patchPromise).status, 200)
			assert.deepEqual((await (await getPromise).json()).data.values, {
				"pet.scale": 1, scale: 1.5, apiKeyRef: "ai.default", localHttp: {},
			})
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
	})

	it("returns a restored snapshot to GET after host apply rejects", async () => {
		const router = createRouter({ basePath: "/api/v1" })
		const store = createStore()
		let releaseHost
		const hostStarted = new Promise((resolve) => { releaseHost = resolve })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.loopbackOnly())
		router.use(middleware.bearerAuth({ getSessionToken: () => "session" }))
		router.use(middleware.jsonBody())
		settingsRoutes.registerSettingsRoutes({
			router, store,
			awaitHostApply: async () => { await hostStarted; throw new Error("native helper failed") },
		})
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const url = `http://127.0.0.1:${server.address().port}/api/v1/settings`
			const patchPromise = jsonRequest(url, {
				method: "PATCH", headers: { authorization: "Bearer session" },
				body: JSON.stringify({ ifVersion: 3, patch: { scale: 1.5 } }),
			})
			await new Promise((resolve) => setTimeout(resolve, 10))
			const getPromise = fetch(url, { headers: { authorization: "Bearer session" } })
			const pending = await Promise.race([
				getPromise.then(() => false),
				new Promise((resolve) => setTimeout(() => resolve(true), 10)),
			])
			assert.equal(pending, true)
			releaseHost()
			assert.equal((await patchPromise).status, 503)
			assert.deepEqual((await (await getPromise).json()).data.values, { "pet.scale": 1, apiKeyRef: "ai.default", localHttp: {} })
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
	})
})
