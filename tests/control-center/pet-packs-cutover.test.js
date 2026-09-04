"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { describe, it } = require("node:test")

const read = (file) => fs.readFileSync(file, "utf8")

describe("T42 Pet Packs cutover boundary", () => {
	it("proves the Backend list is not a Shell-equivalent Pet Pack snapshot", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t42-pet-packs-"))
		try {
			const packRoot = path.join(root, "assets", "pet-packs", "doro")
			fs.mkdirSync(packRoot, { recursive: true })
			fs.writeFileSync(path.join(packRoot, "pet.json"), JSON.stringify({
				id: "doro",
				displayName: "Doro",
				version: "2.0.0",
			}))

			const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
			const backendPacks = createPetPackService({
				root,
				userDataDir: path.join(root, "user-data"),
			}).list()

			assert.equal(backendPacks.activePackId, "legacy-cat")
			assert.deepEqual(backendPacks.packs, [{
				id: "doro",
				displayName: "Doro",
				version: "2.0.0",
				source: "bundled",
				active: false,
			}])
			for (const field of ["rootPath", "provenance", "packageHash", "actionCount"]) {
				assert.equal(Object.hasOwn(backendPacks.packs[0], field), false, field)
			}
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	})

	it("keeps the Control Center on the Shell PetPackService snapshot", () => {
		const hook = read("src/control-center/src/hooks/useActionsPane.ts")
		assert.match(hook, /api\.listPetPacks\(\)/)
		assert.doesNotMatch(hook, /petPackHttpApi|useSse\(/)

		for (const call of [
			"inspectPetPackDirectory",
			"clearPetPackSelection",
			"importPetPack",
			"exportPetPack",
			"setActivePetPack",
			"removePetPack",
		]) assert.match(hook, new RegExp(`api\\.${call}\\(`), call)
	})

	it("retains every Pet Packs IPC and preload bridge until parity exists", () => {
		const channels = [
			"PET_PACKS_LIST",
			"PET_PACKS_INSPECT_DIRECTORY",
			"PET_PACKS_CLEAR_SELECTION",
			"PET_PACKS_IMPORT",
			"PET_PACKS_EXPORT",
			"PET_PACKS_SET_ACTIVE",
			"PET_PACKS_ACTIVE_CHANGED",
			"PET_PACKS_REMOVE",
			"CONTROL_CENTER_ACTIVE_PET_PACK_CHANGED",
		]
		const preload = read("control-center-preload.js")
		const shared = read("src/shared/ipc-channels.js") + read("src/shared/ipc-channels.ts")
		for (const channel of channels) {
			assert.match(preload, new RegExp(`\\b${channel}\\b`), channel)
			assert.match(shared, new RegExp(`\\b${channel}\\b`), channel)
		}

		for (const method of [
			"listPetPacks",
			"inspectPetPackDirectory",
			"clearPetPackSelection",
			"importPetPack",
			"exportPetPack",
			"setActivePetPack",
			"onActivePetPackChanged",
			"removePetPack",
		]) assert.match(preload, new RegExp(`${method}:`), method)

		const mainIpc = read("src/main/ipc.js")
		for (const channel of [
			"PET_PACKS_LIST",
			"PET_PACKS_INSPECT_DIRECTORY",
			"PET_PACKS_CLEAR_SELECTION",
			"PET_PACKS_IMPORT",
			"PET_PACKS_EXPORT",
			"PET_PACKS_SET_ACTIVE",
			"PET_PACKS_REMOVE",
		]) assert.match(mainIpc, new RegExp(`handle\\(IPC\\.${channel}`), channel)
	})

	it("records every non-equivalent business and event path as blocked", () => {
		const ledger = read("docs/refactor/15-channel-retirement.md")
		for (const channel of [
			"pet-packs:list",
			"pet-packs:clear-selection",
			"pet-packs:import",
			"pet-packs:export",
			"pet-packs:set-active",
			"pet-packs:active-changed",
			"pet-packs:remove",
			"control-center:active-pet-pack-changed",
		]) {
			const row = ledger.split(/\r?\n/).find((line) => line.startsWith(`| \`${channel}\` |`))
			assert.ok(row, channel)
			assert.equal(row.split("|")[2].trim(), "`blocked:T42`", channel)
		}
		assert.match(ledger, /\| `pet-packs:inspect-directory` \| `keep` \|/)
	})
})
