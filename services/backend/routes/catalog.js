import { ApiError, sendSuccess } from "../http/middleware.js"

export const CATALOG_ROUTES = Object.freeze([
	"GET /catalog",
	"POST /catalog/refresh",
	"GET /catalog/:id",
	"POST /catalog/install",
	"GET /catalog/installed",
	"POST /catalog/source",
])

export function registerCatalogRoutes(router, { catalog, jobs } = {}) {
	if (!catalog) throw new TypeError("catalog service required")
	router.get("/catalog", (ctx) => sendSuccess(ctx, catalog.list()))
	router.post("/catalog/refresh", (ctx) => sendSuccess(ctx, catalog.refresh()))
	router.get("/catalog/:id", (ctx) => sendSuccess(ctx, catalog.get(ctx.params.id)))
	router.post("/catalog/install", (ctx) => {
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const id = ctx.body?.id
		const job = jobs.insert({ id: `catalog-install:${id}:${Date.now()}`, kind: "catalog.install", input: { id }, resourceKey: `catalog:${id}` })
		return sendSuccess(ctx, { jobId: job.id }, 202)
	})
	router.get("/catalog/installed", (ctx) => sendSuccess(ctx, { plugins: [], petPacks: [] }))
	router.post("/catalog/source", (ctx) => sendSuccess(ctx, catalog.setSource(ctx.body?.source)))
}
