"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

describe("T18 pet packs", () => {
	it("uses the Shell PetPackService snapshot as the HTTP source of truth", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const expected = {
			activePackId: "shell-cat",
			packs: [{
				id: "shell-cat",
				displayName: "Shell Cat",
				version: "2.0.0",
				source: "user-installed",
				rootPath: "/shell-owned/pet-packs/shell-cat",
				active: true,
				actionCount: 3,
				valid: true,
				blockStatus: { blocked: false, reasons: [] },
			}],
		}
		const requests = []
		const shell = {
			request: async (body) => {
				requests.push(body)
				return { body: { type: "pet-packs.result", operation: body.operation, ok: true, result: expected } }
			},
		}
		const packs = createPetPackService({ shell })

		assert.deepEqual(await packs.list(), expected)
		assert.deepEqual(requests, [{ type: "pet-packs.request", operation: "list", payload: {} }])
	})

	it("registers seven routes and forwards activation to the Shell authority", async () => {
		const [{ createRouter }, routes, { createPetPackService }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/pet-packs.js"),
			import("../../services/backend/domains/pet-packs.js"),
		])
		const requests = []
		const shell = { request: async (body) => {
			requests.push(body)
			return { body: {
				type: "pet-packs.result", operation: body.operation, ok: true,
				result: { activePackId: "demo", petPacks: { activePackId: "demo", packs: [{ id: "demo", displayName: "Demo", active: true }] } },
			} }
		} }
		const packs = createPetPackService({ shell })
		const router = createRouter({ basePath: "/api/v1" })
		routes.registerPetPackRoutes(router, { packs })
		assert.deepEqual(router.routes(), routes.PET_PACK_ROUTES.map((entry) => {
			const [method, route] = entry.split(" ")
			return `${method} /api/v1${route}`
		}))
		await packs.activate("demo")
		assert.deepEqual(requests, [{ type: "pet-packs.request", operation: "activate", payload: { packId: "demo" } }])
	})

	it("forwards validation to Shell and maps structured authority failures", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const requests = []
		const packs = createPetPackService({ shell: { request: async (body) => {
			requests.push(body)
			return { body: { type: "pet-packs.result", operation: body.operation, ok: false, error: { code: "PET_PACK_INCOMPATIBLE", message: "blocked by Shell policy" } } }
		} } })
		await assert.rejects(() => packs.inspect("/tmp/pack.zip"), (error) => {
			assert.equal(error.code, "PET_PACK_INCOMPATIBLE")
			assert.equal(error.status, 400)
			return true
		})
		assert.deepEqual(requests, [{ type: "pet-packs.request", operation: "validate", payload: { sourcePath: "/tmp/pack.zip" } }])
	})

	it("preserves the reverse-channel timeout code and HTTP status", async () => {
		const [{ createPetPackService }, { ApiError }] = await Promise.all([
			import("../../services/backend/domains/pet-packs.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const packs = createPetPackService({
			shell: {
				request: async () => {
					throw new ApiError("PROVIDER_TIMEOUT", "Shell did not answer Pet Pack request")
				},
			},
		})

		await assert.rejects(() => packs.list(), (error) => {
			assert.equal(error.code, "PROVIDER_TIMEOUT")
			assert.equal(error.status, 504)
			return true
		})
	})
})
