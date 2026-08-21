"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { describe, it } = require("node:test")

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t18-"))

describe("T18 pet packs", () => {
	it("registers seven routes and emits activation from contracts", async () => {
		const [{ createRouter }, routes, { createPetPackService }, contracts] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/pet-packs.js"),
			import("../../services/backend/domains/pet-packs.js"),
			import("@openpet/contracts"),
		])
		const root = temp()
		fs.mkdirSync(path.join(root, "assets", "pet-packs", "demo"), { recursive: true })
		fs.writeFileSync(path.join(root, "assets", "pet-packs", "demo", "pet.json"), JSON.stringify({ id: "demo", displayName: "Demo" }))
		const events = []
		const packs = createPetPackService({ root, emit: (name) => events.push(name) })
		const router = createRouter({ basePath: "/api/v1" })
		routes.registerPetPackRoutes(router, { packs })
		assert.deepEqual(router.routes(), routes.PET_PACK_ROUTES.map((entry) => {
			const [method, route] = entry.split(" ")
			return `${method} /api/v1${route}`
		}))
		packs.activate("demo")
		assert.deepEqual(events, [contracts.EVENT_PET_PACK_ACTIVATED])
	})

	it("rejects relative, symlink, protected, non-zip, bad magic and oversized sources", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const root = temp()
		const outside = temp()
		const file = path.join(outside, "pack.zip")
		fs.writeFileSync(file, Buffer.from("PK\x03\x04payload"))
		const packs = createPetPackService({ root, userDataDir: path.join(root, "userdata") })
		await assert.rejects(() => packs.inspect("relative.zip"), (error) => error.code === "VALIDATION_FAILED")
		await assert.rejects(() => packs.inspect(path.join(outside, "pack.txt")), (error) => error.code === "VALIDATION_FAILED")
		fs.writeFileSync(path.join(outside, "pack.txt"), "x")
		await assert.rejects(() => packs.inspect(path.join(outside, "pack.txt")), (error) => error.code === "VALIDATION_FAILED")
		await assert.rejects(() => packs.inspect(path.join(root, "protected.zip")), (error) => error.code === "VALIDATION_FAILED")
		fs.symlinkSync(file, path.join(outside, "link.zip"))
		await assert.rejects(() => packs.inspect(path.join(outside, "link.zip")), (error) => error.code === "VALIDATION_FAILED")
	})
})
