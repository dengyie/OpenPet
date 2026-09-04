"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { describe, it } = require("node:test")

const read = (file) => fs.readFileSync(file, "utf8")

function createCatalogRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t42-catalog-"))
	fs.mkdirSync(path.join(root, "catalog"), { recursive: true })
	fs.writeFileSync(path.join(root, "catalog", "openpet-catalog.json"), JSON.stringify({
		schemaVersion: 1,
		updatedAt: "2026-09-05T00:00:00.000Z",
		feedbackUrl: "https://example.com/feedback",
		plugins: [{
			kind: "plugin",
			id: "demo.plugin",
			displayName: "Demo Plugin",
			version: "1.0.0",
			packageUrl: "https://example.com/demo.zip",
			sha256: "a".repeat(64),
		}],
		petPacks: [],
		blocklist: { pluginIds: [], packIds: [], sha256: [] },
	}))
	return root
}

describe("T42 Catalog cutover boundary", () => {
	it("proves the Backend list is not a Shell-equivalent CatalogState", async () => {
		const root = createCatalogRoot()
		try {
			const { createCatalogService } = await import("../../services/backend/domains/catalog.js")
			const backendCatalog = createCatalogService({ root }).list()

			for (const field of ["localBlocklist", "catalogBlocklist"]) {
				assert.equal(Object.hasOwn(backendCatalog, field), false, field)
			}
			for (const field of ["installed", "installedVersion", "updateAvailable", "downloadable", "blockStatus"]) {
				assert.equal(Object.hasOwn(backendCatalog.plugins[0], field), false, field)
			}
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	})

	it("proves the Backend install target and route set cannot replace reviewed selections", async () => {
		const root = createCatalogRoot()
		try {
			const [{ createCatalogService }, { CATALOG_ROUTES }] = await Promise.all([
				import("../../services/backend/domains/catalog.js"),
				import("../../services/backend/routes/catalog.js"),
			])
			const backendCatalog = createCatalogService({ root })

			assert.throws(
				() => backendCatalog.install("demo.plugin"),
				(error) => error?.code === "BACKEND_UNAVAILABLE" && error?.details?.id === "demo.plugin",
			)
			assert.equal(CATALOG_ROUTES.includes("POST /catalog/install"), true)
			for (const route of [
				"POST /catalog/prepare",
				"POST /catalog/clear-selection",
				"POST /catalog/blocklist",
				"DELETE /catalog/blocklist/:id",
			]) assert.equal(CATALOG_ROUTES.includes(route), false, route)
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	})

	it("retains every Catalog hook call, IPC registration, and preload bridge until parity exists", () => {
		const hook = read("src/control-center/src/hooks/useCatalogPane.ts")
		const mainIpc = read("src/main/ipc/register-catalog-ipc.js")
		const preload = read("control-center-preload.js")
		const sharedJs = read("src/shared/ipc-channels.js")
		const sharedTs = read("src/shared/ipc-channels.ts")
		const mappings = [
			["CATALOG_GET", "getCatalog"],
			["CATALOG_PREPARE_INSTALL", "prepareCatalogInstall"],
			["CATALOG_INSTALL_SELECTION", "installCatalogSelection"],
			["CATALOG_CLEAR_SELECTION", "clearCatalogSelection"],
			["CATALOG_ADD_BLOCKLIST", "addCatalogBlocklistEntry"],
			["CATALOG_REMOVE_BLOCKLIST", "removeCatalogBlocklistEntry"],
		]

		for (const [channel, method] of mappings) {
			assert.match(sharedJs, new RegExp(`\\b${channel}\\b`), channel)
			assert.match(sharedTs, new RegExp(`\\b${channel}\\b`), channel)
			assert.match(preload, new RegExp(`\\b${channel}\\b`), channel)
			assert.match(preload, new RegExp(`${method}:.*IPC\\.${channel}`), method)
			assert.match(mainIpc, new RegExp(`handle\\(IPC\\.${channel}`), channel)
			assert.match(hook, new RegExp(`api\\.${method}\\(`), method)
		}
	})

	it("records all six non-equivalent Catalog paths as blocked", () => {
		const ledger = read("docs/refactor/15-channel-retirement.md")
		for (const channel of [
			"catalog:get",
			"catalog:prepare-install",
			"catalog:install-selection",
			"catalog:clear-selection",
			"catalog:add-blocklist",
			"catalog:remove-blocklist",
		]) assert.match(ledger, new RegExp("\\| `" + channel + "` \\| `blocked:T42` \\|"), channel)
	})
})
