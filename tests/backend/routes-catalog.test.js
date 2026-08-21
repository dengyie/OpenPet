"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

describe("T17 catalog", () => {
	it("registers six catalog routes and emits refreshed from contracts", async () => {
		const [{ createRouter }, { registerCatalogRoutes, CATALOG_ROUTES }, { createCatalogService }, contracts] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/catalog.js"),
			import("../../services/backend/domains/catalog.js"),
			import("@openpet/contracts"),
		])
		const router = createRouter({ basePath: "/api/v1" })
		const events = []
		const catalog = createCatalogService({ root: process.cwd(), emit: (name) => events.push(name) })
		registerCatalogRoutes(router, { catalog, jobs: { insert: ({ id, kind }) => ({ id, kind }) } })
		assert.deepEqual(router.routes(), CATALOG_ROUTES.map((entry) => {
			const [method, route] = entry.split(" ")
			return `${method} /api/v1${route}`
		}))
		catalog.refresh()
		assert.deepEqual(events, [contracts.EVENT_CATALOG_REFRESHED])
	})
})
