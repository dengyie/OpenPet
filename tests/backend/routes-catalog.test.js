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
})
