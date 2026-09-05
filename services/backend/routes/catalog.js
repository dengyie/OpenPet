import { randomUUID } from "node:crypto"

import { ApiError, sendSuccess } from "../http/middleware.js"

export const CATALOG_ROUTES = Object.freeze([
	"GET /catalog",
	"POST /catalog/refresh",
	"GET /catalog/:id",
	"POST /catalog/prepare",
	"POST /catalog/install",
	"POST /catalog/clear-selection",
	"POST /catalog/blocklist",
	"DELETE /catalog/blocklist/:id",
	"GET /catalog/installed",
	"POST /catalog/source",
])

function requiredString(value, field) {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ApiError("VALIDATION_FAILED", `${field} is required`, { details: { field } })
	}
	return value
}

export function registerCatalogRoutes(router, { catalog, jobs } = {}) {
	if (!catalog) throw new TypeError("catalog service required")
	router.get("/catalog", async (ctx) => sendSuccess(ctx, await catalog.list()))
	router.post("/catalog/refresh", async (ctx) => sendSuccess(ctx, await catalog.refresh()))
	router.get("/catalog/:id", async (ctx) => sendSuccess(ctx, await catalog.get(ctx.params.id)))
	router.post("/catalog/prepare", async (ctx) => sendSuccess(ctx, await catalog.prepareInstall({
		kind: ctx.body?.kind,
		itemId: ctx.body?.itemId,
	})))
	router.post("/catalog/install", (ctx) => {
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const selectionId = requiredString(ctx.body?.selectionId, "selectionId")
		const job = jobs.insert({
			id: `catalog-install:${randomUUID()}`,
			kind: "catalog.install",
			input: { selectionId },
			resourceKey: `catalog-selection:${selectionId}`,
		})
		return sendSuccess(ctx, { jobId: job.id }, 202)
	})
	router.post("/catalog/clear-selection", async (ctx) => sendSuccess(
		ctx,
		await catalog.clearSelection(requiredString(ctx.body?.selectionId, "selectionId")),
	))
	router.post("/catalog/blocklist", async (ctx) => sendSuccess(ctx, await catalog.addBlocklistEntry({
		type: ctx.body?.type,
		value: ctx.body?.value,
	})))
	router.delete("/catalog/blocklist/:id", async (ctx) => sendSuccess(ctx, await catalog.removeBlocklistEntry({
		type: ctx.query.type,
		value: ctx.params.id,
	})))
	router.get("/catalog/installed", async (ctx) => sendSuccess(ctx, await catalog.installed()))
	router.post("/catalog/source", async (ctx) => sendSuccess(ctx, await catalog.setSource(ctx.body?.source)))
}
