"use strict"
const assert = require("node:assert/strict")
const { describe, it } = require("node:test")
describe("T15 about", () => {
	it("exports the canonical route list", async () => {
		const { createRouter } = await import("../../services/backend/http/router.js")
		const { registerAboutRoutes, ABOUT_ROUTES } = await import("../../services/backend/routes/about.js")
		const router = createRouter({ basePath: "/api/v1" })
		registerAboutRoutes(router, { about: { info: () => ({ version: "1.0.1" }) }, jobs: { insert: ({ id, kind }) => ({ id, kind }) } })
		assert.deepEqual(router.routes(), ABOUT_ROUTES.map((x) => {
			const [method, route] = x.split(" ")
			return `${method} /api/v1${route}`
		}))
	})
})
