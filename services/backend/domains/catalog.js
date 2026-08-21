import { readFileSync } from "node:fs"
import { join } from "node:path"
import { EVENT_CATALOG_REFRESHED } from "@openpet/contracts"
import { ApiError } from "../http/middleware.js"

function normalize(raw = {}) {
	return {
		schemaVersion: Number(raw.schemaVersion ?? 1),
		updatedAt: String(raw.updatedAt ?? ""),
		feedbackUrl: String(raw.feedbackUrl ?? ""),
		plugins: Array.isArray(raw.plugins) ? raw.plugins : [],
		petPacks: Array.isArray(raw.petPacks) ? raw.petPacks : [],
		blocklist: raw.blocklist ?? { pluginIds: [], packIds: [], sha256: [] },
	}
}

export function createCatalogService({ root, db, logger, now = Date.now, emit } = {}) {
	if (typeof root !== "string" || !root) throw new TypeError("catalog root required")
	const catalogPath = join(root, "catalog", "openpet-catalog.json")
	let source = "bundled"
	const read = () => {
		try { return normalize(JSON.parse(readFileSync(catalogPath, "utf8"))) } catch (error) {
			logger?.warn?.("读取 catalog 失败", { error: String(error) })
			return normalize()
		}
	}
	const list = () => ({ ...read(), source })
	const get = (id) => {
		const catalog = read()
		const item = [...catalog.plugins, ...catalog.petPacks].find((entry) => entry.id === id)
		if (!item) throw new ApiError("NOT_FOUND", "Catalog item not found", { details: { id } })
		return item
	}
	const refresh = () => {
		const catalog = list()
		emit?.(EVENT_CATALOG_REFRESHED, { updatedAt: catalog.updatedAt, at: now() })
		return catalog
	}
	const install = (id) => ({ item: get(id), accepted: true })
	const status = () => ({ source, updatedAt: read().updatedAt, plugins: read().plugins.length, petPacks: read().petPacks.length, db: db?.driverName ?? null })
	const setSource = (next) => { source = typeof next === "string" && next.trim() ? next.trim() : "bundled"; return status() }
	return { list, get, refresh, install, status, setSource }
}
