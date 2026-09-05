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
	it("reads the complete Shell-owned CatalogState through the Backend bridge", async () => {
		const root = createCatalogRoot()
		try {
			const { createCatalogService } = await import("../../services/backend/domains/catalog.js")
			const expected = {
				schemaVersion: 1,
				updatedAt: "2026-09-05T00:00:00.000Z",
				feedbackUrl: "https://example.com/feedback",
				localBlocklist: { pluginIds: [], packIds: ["local-pack"], sha256: [] },
				catalogBlocklist: { pluginIds: ["catalog-plugin"], packIds: [], sha256: [] },
				blocklist: { pluginIds: ["catalog-plugin"], packIds: ["local-pack"], sha256: [] },
				plugins: [{
					id: "demo.plugin",
					name: "Demo Plugin",
					version: "1.0.0",
					installed: true,
					installedVersion: "0.9.0",
					updateAvailable: true,
					downloadable: true,
					blockStatus: { blocked: false, reasons: [] },
				}],
				petPacks: [],
			}
			const calls = []
			const shell = {
				request: async (body, options) => {
					calls.push({ body, options })
					return { body: { type: "catalog.result", ok: true, result: expected } }
				},
			}
			const backendCatalog = await createCatalogService({ root, shell }).list()

			assert.deepEqual(backendCatalog, expected)
			assert.deepEqual(calls, [{
				body: { type: "catalog.request", request: { operation: "listCatalog" } },
				options: { expectedType: "catalog.result" },
			}])
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	})

	it("bridges reviewed selections and exposes prepare, clear, and blocklist routes", async () => {
		const root = createCatalogRoot()
		try {
			const [{ createCatalogService }, { CATALOG_ROUTES }] = await Promise.all([
				import("../../services/backend/domains/catalog.js"),
				import("../../services/backend/routes/catalog.js"),
			])
			const requests = []
			const backendCatalog = createCatalogService({
				root,
				shell: {
					request: async (body) => {
						requests.push(body.request)
						return { body: { type: "catalog.result", ok: true, result: { ok: true } } }
					},
				},
			})

			assert.deepEqual(await backendCatalog.prepareInstall({ kind: "plugin", itemId: "demo.plugin" }), { ok: true })
			assert.deepEqual(await backendCatalog.installSelection("selection-1"), { ok: true })
			assert.deepEqual(await backendCatalog.clearSelection("selection-1"), { ok: true })
			assert.deepEqual(await backendCatalog.addBlocklistEntry({ type: "pluginId", value: "demo.plugin" }), { ok: true })
			assert.deepEqual(await backendCatalog.removeBlocklistEntry({ type: "pluginId", value: "demo.plugin" }), { ok: true })
			assert.deepEqual(requests, [
				{ operation: "prepareInstall", kind: "plugin", itemId: "demo.plugin" },
				{ operation: "installSelection", selectionId: "selection-1" },
				{ operation: "clearSelection", selectionId: "selection-1" },
				{ operation: "addBlocklistEntry", type: "pluginId", value: "demo.plugin" },
				{ operation: "removeBlocklistEntry", type: "pluginId", value: "demo.plugin" },
			])
			assert.equal(CATALOG_ROUTES.includes("POST /catalog/install"), true)
			for (const route of [
				"POST /catalog/prepare",
				"POST /catalog/clear-selection",
				"POST /catalog/blocklist",
				"DELETE /catalog/blocklist/:id",
			]) assert.equal(CATALOG_ROUTES.includes(route), true, route)
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	})

	it("uses Backend HTTP for every Catalog operation and waits for the install Job result", async () => {
		const { createCatalogHttpApi, resolveCatalogInstallJob } = await import("../../src/control-center/src/features/catalog/api.ts")
		const calls = []
		const client = {
			request: async (input) => {
				calls.push(input)
				if (input.path === "/catalog") return { schemaVersion: 1, updatedAt: "", feedbackUrl: "", localBlocklist: { pluginIds: [], packIds: [], sha256: [] }, catalogBlocklist: { pluginIds: [], packIds: [], sha256: [] }, blocklist: { pluginIds: [], packIds: [], sha256: [] }, plugins: [], petPacks: [] }
				if (input.path === "/catalog/prepare") return { kind: "plugin", itemId: "demo.plugin", selectionId: "selection-1", sourcePackageHash: "a".repeat(64), pluginReview: {} }
				if (input.path === "/catalog/install") return { jobId: "catalog-install:1" }
				return { ok: true }
			},
		}
		const api = createCatalogHttpApi(client)

		await api.list()
		await api.prepare({ kind: "plugin", itemId: "demo.plugin" })
		await api.clearSelection("selection-1")
		await api.addBlocklistEntry({ type: "pluginId", value: "demo.plugin" })
		await api.removeBlocklistEntry({ type: "pluginId", value: "demo.plugin" })
		assert.deepEqual(await api.install("selection-1"), { jobId: "catalog-install:1" })

		assert.deepEqual(calls.map(({ method, path }) => ({ method, path })), [
			{ method: "GET", path: "/catalog" },
			{ method: "POST", path: "/catalog/prepare" },
			{ method: "POST", path: "/catalog/clear-selection" },
			{ method: "POST", path: "/catalog/blocklist" },
			{ method: "DELETE", path: "/catalog/blocklist/demo.plugin?type=pluginId" },
			{ method: "POST", path: "/catalog/install" },
		])
		assert.deepEqual(calls.at(-1).body, { selectionId: "selection-1" })
		assert.equal(calls.at(-1).job, true)
		assert.equal(calls.at(-1).retry, false)

		const succeeded = {
			jobId: "catalog-install:1",
			kind: "catalog.install",
			status: "succeeded",
			result: { ok: true, kind: "plugin", itemId: "demo.plugin", catalog: await api.list() },
		}
		assert.equal(resolveCatalogInstallJob(null).kind, "pending")
		assert.equal(resolveCatalogInstallJob({ ...succeeded, status: "running" }).kind, "pending")
		assert.equal(resolveCatalogInstallJob(succeeded).kind, "succeeded")
		assert.deepEqual(resolveCatalogInstallJob({ ...succeeded, status: "failed", error: { message: "install failed" } }), { kind: "failed", message: "install failed" })
	})

	it("retires every Catalog hook call, IPC registration, and preload bridge after parity exists", () => {
		const hook = read("src/control-center/src/hooks/useCatalogPane.ts")
		const mainIpc = read("src/main/ipc.js")
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
			assert.doesNotMatch(sharedJs, new RegExp(`\\b${channel}\\b`), channel)
			assert.doesNotMatch(sharedTs, new RegExp(`\\b${channel}\\b`), channel)
			assert.doesNotMatch(preload, new RegExp(`\\b${channel}\\b`), channel)
			assert.doesNotMatch(preload, new RegExp(`${method}:.*IPC\\.${channel}`), method)
			assert.doesNotMatch(mainIpc, /registerCatalogIpc/, "Catalog IPC registrar")
			assert.doesNotMatch(hook, new RegExp(`api\\.${method}\\(`), method)
		}
		assert.match(hook, /catalogApi\./)
	})

	it("locks selection-changing Catalog controls while an install Job is active", () => {
		const hook = read("src/control-center/src/hooks/useCatalogPane.ts")
		const pane = read("src/control-center/src/panes/CatalogPane.tsx")

		assert.match(hook, /if \(installing \|\| preparing\) return/)
		assert.match(hook, /const onClearSelection = async \(\) => \{\n\s*if \(installing\) return/)
		assert.match(pane, /disabled=\{installing \|\| Boolean\(preparing\) \|\| !item\.downloadable/)
		assert.match(pane, /disabled=\{installing \|\| Boolean\(preparing\) \|\| !blocklistDraft\.value\.trim\(\)\}/)
	})

	it("records all six Catalog paths as retired after the T42 cutover", () => {
		const ledger = read("docs/refactor/15-channel-retirement.md")
		for (const channel of [
			"catalog:get",
			"catalog:prepare-install",
			"catalog:install-selection",
			"catalog:clear-selection",
			"catalog:add-blocklist",
			"catalog:remove-blocklist",
		]) assert.match(ledger, new RegExp("\\| `" + channel + "` \\| `retired` \\|"), channel)
	})
})
