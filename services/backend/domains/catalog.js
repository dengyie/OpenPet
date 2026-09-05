import { EVENT_CATALOG_REFRESHED } from "@openpet/contracts"
import { ApiError } from "../http/middleware.js"

const BLOCKLIST_TYPES = new Set(["pluginId", "packId", "sha256"])

function requiredString(value, field) {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ApiError("VALIDATION_FAILED", `${field} is required`, { details: { field } })
	}
	return value
}

function blocklistEntry(entry = {}) {
	if (!BLOCKLIST_TYPES.has(entry.type)) {
		throw new ApiError("VALIDATION_FAILED", "Catalog blocklist type must be pluginId, packId, or sha256", {
			details: { field: "type" },
		})
	}
	return { type: entry.type, value: requiredString(entry.value, "value") }
}

export function createCatalogService({ root, db, logger, now = Date.now, emit, shell } = {}) {
	if (typeof root !== "string" || !root) throw new TypeError("catalog root required")
	let source = "bundled"

	const request = async (catalogRequest) => {
		if (!shell?.request) throw new ApiError("BACKEND_UNAVAILABLE", "Shell Catalog service unavailable")
		let reply
		try {
			reply = await shell.request(
				{ type: "catalog.request", request: catalogRequest },
				{ expectedType: "catalog.result" },
			)
		} catch (cause) {
			logger?.warn?.("Shell Catalog request failed", { operation: catalogRequest.operation, error: String(cause) })
			if (cause instanceof ApiError) throw cause
			throw new ApiError("BACKEND_UNAVAILABLE", "Shell Catalog service unavailable", {
				details: { operation: catalogRequest.operation },
				cause,
			})
		}
		if (reply?.body?.ok !== true) {
			throw new ApiError("INTERNAL", reply?.body?.error || "Shell Catalog operation failed", {
				details: { operation: catalogRequest.operation },
			})
		}
		return reply.body.result
	}

	const list = async () => {
		const catalog = await request({ operation: "listCatalog" })
		if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
			throw new ApiError("INTERNAL", "Shell Catalog returned an invalid state")
		}
		return catalog
	}
	const get = async (id) => {
		const itemId = requiredString(id, "id")
		const catalog = await list()
		const item = [...(catalog.plugins || []), ...(catalog.petPacks || [])].find((entry) => entry?.id === itemId)
		if (!item) throw new ApiError("NOT_FOUND", "Catalog item not found", { details: { id: itemId } })
		return item
	}
	const refresh = async () => {
		const catalog = await list()
		emit?.(EVENT_CATALOG_REFRESHED, { updatedAt: catalog.updatedAt || "", at: now() })
		return catalog
	}
	const prepareInstall = ({ kind, itemId } = {}) => {
		if (!["plugin", "pet-pack"].includes(kind)) {
			throw new ApiError("VALIDATION_FAILED", "Catalog kind must be plugin or pet-pack", { details: { field: "kind" } })
		}
		return request({ operation: "prepareInstall", kind, itemId: requiredString(itemId, "itemId") })
	}
	const installSelection = (selectionId) => request({
		operation: "installSelection",
		selectionId: requiredString(selectionId, "selectionId"),
	})
	const clearSelection = (selectionId) => request({
		operation: "clearSelection",
		selectionId: requiredString(selectionId, "selectionId"),
	})
	const addBlocklistEntry = (entry) => request({ operation: "addBlocklistEntry", ...blocklistEntry(entry) })
	const removeBlocklistEntry = (entry) => request({ operation: "removeBlocklistEntry", ...blocklistEntry(entry) })
	const installed = async () => {
		const catalog = await list()
		return {
			plugins: (catalog.plugins || []).filter((entry) => entry?.installed),
			petPacks: (catalog.petPacks || []).filter((entry) => entry?.installed),
		}
	}
	const status = async () => ({
		source,
		updatedAt: (await list()).updatedAt || "",
		db: db?.driverName ?? null,
	})
	const setSource = async (next) => {
		source = typeof next === "string" && next.trim() ? next.trim() : "bundled"
		return status()
	}

	return {
		list,
		get,
		refresh,
		prepareInstall,
		installSelection,
		clearSelection,
		addBlocklistEntry,
		removeBlocklistEntry,
		installed,
		status,
		setSource,
	}
}
