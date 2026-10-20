"use strict"

const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { describe, it } = require("node:test")

describe("T17 catalog", () => {
	it("registers ten catalog routes and emits refreshed from contracts", async () => {
		const [{ createRouter }, { registerCatalogRoutes, CATALOG_ROUTES }, { createCatalogService }, contracts] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/catalog.js"),
			import("../../services/backend/domains/catalog.js"),
			import("@openpet/contracts"),
		])
		const router = createRouter({ basePath: "/api/v1" })
		const events = []
		const catalog = createCatalogService({
			root: process.cwd(),
			emit: (name) => events.push(name),
			shell: {
				request: async () => ({ body: { type: "catalog.result", ok: true, result: { updatedAt: "2026-09-05T00:00:00.000Z", plugins: [], petPacks: [] } } }),
			},
		})
		registerCatalogRoutes(router, { catalog, jobs: { insert: ({ id, kind }) => ({ id, kind }) } })
		assert.deepEqual(router.routes(), CATALOG_ROUTES.map((entry) => {
			const [method, route] = entry.split(" ")
			return `${method} /api/v1${route}`
		}))
		await catalog.refresh()
		assert.deepEqual(events, [contracts.EVENT_CATALOG_REFRESHED])
	})

	it("emits catalog.refreshed only after catalog mutations, not selection bookkeeping", async () => {
		const [{ createCatalogService }, contracts] = await Promise.all([
			import("../../services/backend/domains/catalog.js"),
			import("@openpet/contracts"),
		])
		const events = []
		const snapshot = { updatedAt: "2026-09-05T00:00:00.000Z", plugins: [], petPacks: [] }
		const catalog = createCatalogService({
			root: process.cwd(),
			emit: (name, payload) => events.push({ name, payload }),
			shell: {
				request: async ({ request }) => ({
					body: {
						type: "catalog.result",
						ok: true,
						result: request.operation === "addBlocklistEntry"
							? { catalog: snapshot, blocklist: { pluginIds: ["blocked.plugin"] } }
							: { catalog: snapshot, blocklist: { pluginIds: [] } },
					},
				}),
			},
		})

		await catalog.prepareInstall({ kind: "plugin", itemId: "focus-timer" }).catch(() => {})
		await catalog.clearSelection("selection-1")
		await catalog.installSelection("selection-1")
		await catalog.addBlocklistEntry({ type: "pluginId", value: "blocked.plugin" })
		await catalog.removeBlocklistEntry({ type: "pluginId", value: "blocked.plugin" })

		assert.deepEqual(events.map(({ name }) => name), [
			contracts.EVENT_CATALOG_REFRESHED,
			contracts.EVENT_CATALOG_REFRESHED,
			contracts.EVENT_CATALOG_REFRESHED,
		])
		assert.deepEqual(events[0].payload, { updatedAt: snapshot.updatedAt, at: events[0].payload.at })
		assert.equal(Number.isInteger(events[0].payload.at), true)
	})

	it("rejects a successful mutation without a Catalog snapshot and emits no refresh event", async () => {
		const { createCatalogService } = await import("../../services/backend/domains/catalog.js")
		const events = []
		const catalog = createCatalogService({
			root: process.cwd(),
			emit: (name) => events.push(name),
			shell: {
				request: async () => ({ body: { type: "catalog.result", ok: true, result: { blocklist: {} } } }),
			},
		})

		await assert.rejects(
			catalog.addBlocklistEntry({ type: "pluginId", value: "blocked.plugin" }),
			(error) => error?.code === "INTERNAL",
		)
		assert.deepEqual(events, [])
	})

	it("maps a Shell Catalog outage to BACKEND_UNAVAILABLE without publishing a refresh event", async () => {
		const { createCatalogService } = await import("../../services/backend/domains/catalog.js")
		const events = []
		const catalog = createCatalogService({
			root: process.cwd(),
			emit: (name) => events.push(name),
			shell: { request: async () => { throw new Error("sidecar disconnected") } },
		})

		await assert.rejects(
			catalog.refresh(),
			(error) => error?.code === "BACKEND_UNAVAILABLE" && error.status === 503,
		)
		assert.deepEqual(events, [])
	})

	it("maps prepare, clear, blocklist and reviewed install requests without replacing the Shell selection", async () => {
		const [{ createRouter }, middleware, { registerCatalogRoutes }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/http/middleware.js"),
			import("../../services/backend/routes/catalog.js"),
		])
		const calls = []
		const inserted = []
		const catalog = {
			prepareInstall: async (input) => { calls.push(["prepare", input]); return { selectionId: "selection-1" } },
			clearSelection: async (selectionId) => { calls.push(["clear", selectionId]); return { ok: true } },
			addBlocklistEntry: async (entry) => { calls.push(["add", entry]); return { blocklist: { pluginIds: [entry.value] } } },
			removeBlocklistEntry: async (entry) => { calls.push(["remove", entry]); return { blocklist: { pluginIds: [] } } },
			list: async () => ({ plugins: [], petPacks: [] }),
			refresh: async () => ({ plugins: [], petPacks: [] }),
			get: async (id) => ({ id }),
			installed: async () => ({ plugins: [], petPacks: [] }),
			setSource: () => ({ source: "bundled" }),
		}
		const router = createRouter({ basePath: "/api/v1" })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.jsonBody())
		registerCatalogRoutes(router, {
			catalog,
			jobs: { insert: (input) => { inserted.push(input); return { id: input.id } } },
		})
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/catalog`
			const json = { "content-type": "application/json" }
			const responses = []
			responses.push(await fetch(`${baseUrl}/prepare`, { method: "POST", headers: json, body: JSON.stringify({ kind: "plugin", itemId: "focus-timer" }) }))
			responses.push(await fetch(`${baseUrl}/clear-selection`, { method: "POST", headers: json, body: JSON.stringify({ selectionId: "selection-1" }) }))
			responses.push(await fetch(`${baseUrl}/blocklist`, { method: "POST", headers: json, body: JSON.stringify({ type: "pluginId", value: "blocked.plugin" }) }))
			responses.push(await fetch(`${baseUrl}/blocklist/${encodeURIComponent("blocked.plugin")}?type=pluginId`, { method: "DELETE" }))
			responses.push(await fetch(`${baseUrl}/install`, { method: "POST", headers: json, body: JSON.stringify({ selectionId: "selection-1" }) }))
			assert.deepEqual(responses.map(({ status }) => status), [200, 200, 200, 200, 202])
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
		assert.deepEqual(calls, [
			["prepare", { kind: "plugin", itemId: "focus-timer" }],
			["clear", "selection-1"],
			["add", { type: "pluginId", value: "blocked.plugin" }],
			["remove", { type: "pluginId", value: "blocked.plugin" }],
		])
		assert.equal(inserted.length, 1)
		assert.equal(inserted[0].kind, "catalog.install")
		assert.deepEqual(inserted[0].input, { selectionId: "selection-1" })
		assert.equal(inserted[0].resourceKey, "catalog-selection:selection-1")
		assert.match(inserted[0].id, /^catalog-install:[0-9a-f-]{36}$/)
	})

	it("rejects a duplicate catalog selection Job through the real resourceKey constraint", async () => {
		const [{ createRouter }, middleware, { registerCatalogRoutes }, { createJobsRepository }, { createQueue }, { migrate }, { openDatabase }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/http/middleware.js"),
			import("../../services/backend/routes/catalog.js"),
			import("../../services/backend/store/repositories/jobs.js"),
			import("../../services/backend/jobs/queue.js"),
			import("../../services/backend/store/migrate.js"),
			import("../../services/backend/store/db.js"),
		])
		const db = await openDatabase({ file: ":memory:" })
		migrate({ db })
		const repo = createJobsRepository({ db })
		const queue = createQueue({ repo, tickMs: 60_000 })
		const router = createRouter({ basePath: "/api/v1" })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.jsonBody())
		registerCatalogRoutes(router, {
			catalog: { list: async () => ({ plugins: [], petPacks: [] }) },
			jobs: { insert: (input) => queue.enqueue(input) },
		})
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const url = `http://127.0.0.1:${server.address().port}/api/v1/catalog/install`
			const headers = { "content-type": "application/json" }
			const first = await fetch(url, { method: "POST", headers, body: JSON.stringify({ selectionId: "selection-1" }) })
			const second = await fetch(url, { method: "POST", headers, body: JSON.stringify({ selectionId: "selection-1" }) })
			assert.equal(first.status, 202)
			assert.equal(second.status, 423)
			assert.equal((await second.json()).error.code, "LOCKED")
		} finally {
			queue.stop()
			await new Promise((resolve) => server.close(resolve))
			db.close()
		}
	})
})
