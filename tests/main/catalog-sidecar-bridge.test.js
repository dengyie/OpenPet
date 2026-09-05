"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

const { createCatalogSidecarBridge } = require("../../src/main/catalog-sidecar-bridge.js")

function createHarness() {
	const calls = []
	let localBlocklist = { pluginIds: [], packIds: [], sha256: [] }
	const catalogService = {
		listCatalog: () => ({ schemaVersion: 1, localBlocklist, plugins: [], petPacks: [] }),
		prepareInstall: async (input) => {
			calls.push(["prepare", input])
			return { kind: input.kind, itemId: input.itemId, selectionId: "selection-1" }
		},
		installSelection: (selectionId) => {
			calls.push(["install", selectionId])
			return selectionId === "pet-selection"
				? { ok: true, kind: "pet-pack", itemId: "pixel-cat", petPacks: { activePackId: "pixel-cat" } }
				: { ok: true, kind: "plugin", itemId: "focus-timer", plugins: [{ id: "focus-timer" }] }
		},
		clearSelection: (selectionId) => {
			calls.push(["clear", selectionId])
			return { ok: true }
		},
		addBlocklistEntry: (entry) => {
			calls.push(["add", entry])
			localBlocklist = { ...localBlocklist, pluginIds: [...localBlocklist.pluginIds, entry.value] }
			return localBlocklist
		},
		removeBlocklistEntry: (entry) => {
			calls.push(["remove", entry])
			localBlocklist = { ...localBlocklist, pluginIds: localBlocklist.pluginIds.filter((id) => id !== entry.value) }
			return localBlocklist
		},
	}
	const reloads = []
	let triggerRefreshes = 0
	const bridge = createCatalogSidecarBridge({
		catalogService,
		getPetWindow: () => ({ id: "pet-window" }),
		petService: { getPreviewAnimations: () => ({ actions: [{ id: "idle" }] }) },
		reloadAndSendAnimations: (...args) => reloads.push(args),
		refreshTriggerRuleRuntime: () => { triggerRefreshes += 1 },
		getActionsViewState: () => ({ actions: [{ id: "idle" }], triggerRuntimeDiagnostics: { decisions: [] } }),
		createCatalogView: (catalog) => ({ ...catalog, normalized: true }),
		createCatalogBlocklistResult: (catalog, blocklist) => ({ catalog, blocklist }),
	})
	return { bridge, calls, reloads, triggerRefreshes: () => triggerRefreshes }
}

describe("Catalog Shell owner bridge", () => {
	it("dispatches list, reviewed selection, clear, and blocklist operations to the Shell service", async () => {
		const { bridge, calls } = createHarness()

		assert.equal((await bridge.handle({ operation: "listCatalog" })).normalized, true)
		assert.equal((await bridge.handle({ operation: "prepareInstall", kind: "plugin", itemId: "focus-timer" })).selectionId, "selection-1")
		assert.deepEqual(await bridge.handle({ operation: "clearSelection", selectionId: "selection-1" }), { ok: true })
		const added = await bridge.handle({ operation: "addBlocklistEntry", type: "pluginId", value: "blocked.plugin" })
		assert.deepEqual(added.catalog.localBlocklist.pluginIds, ["blocked.plugin"])
		assert.deepEqual(added.blocklist.pluginIds, ["blocked.plugin"])
		const removed = await bridge.handle({ operation: "removeBlocklistEntry", type: "pluginId", value: "blocked.plugin" })
		assert.deepEqual(removed.catalog.localBlocklist.pluginIds, [])
		assert.deepEqual(calls, [
			["prepare", { kind: "plugin", itemId: "focus-timer" }],
			["clear", "selection-1"],
			["add", { type: "pluginId", value: "blocked.plugin" }],
			["remove", { type: "pluginId", value: "blocked.plugin" }],
		])
	})

	it("preserves the pet-pack animation and trigger side effects when a reviewed selection is installed", async () => {
		const harness = createHarness()

		const result = await harness.bridge.handle({ operation: "installSelection", selectionId: "pet-selection" })

		assert.equal(harness.reloads.length, 1)
		assert.equal(harness.reloads[0][0]().id, "pet-window")
		assert.equal(harness.triggerRefreshes(), 1)
		assert.deepEqual(result.animations.triggerRuntimeDiagnostics, { decisions: [] })
		assert.equal(result.catalog.normalized, true)
	})

	it("does not run pet-pack side effects for plugin installs and rejects unknown operations", async () => {
		const harness = createHarness()
		const result = await harness.bridge.handle({ operation: "installSelection", selectionId: "plugin-selection" })

		assert.equal(result.kind, "plugin")
		assert.equal(harness.reloads.length, 0)
		assert.equal(harness.triggerRefreshes(), 0)
		await assert.rejects(() => harness.bridge.handle({ operation: "executePath", path: "/tmp/owned" }), /Unsupported Catalog bridge operation/)
	})
})
