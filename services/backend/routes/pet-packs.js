import { ApiError, sendSuccess } from "../http/middleware.js"

export const PET_PACK_ROUTES = Object.freeze([
	"GET /pet-packs",
	"POST /pet-packs/import",
	"POST /pet-packs/:id/activate",
	"DELETE /pet-packs/:id",
	"POST /pet-packs/:id/export",
	"GET /pet-packs/:id/manifest",
	"POST /pet-packs/validate",
])

export function registerPetPackRoutes(router, { packs } = {}) {
	if (!packs) throw new TypeError("pet pack service required")
	router.get("/pet-packs", async (ctx) => sendSuccess(ctx, await packs.list()))
	router.post("/pet-packs/import", (ctx) => sendSuccess(ctx, packs.import(ctx.body || {}), 202))
	router.post("/pet-packs/:id/activate", async (ctx) => sendSuccess(ctx, await packs.activate(ctx.params.id)))
	router.delete("/pet-packs/:id", async (ctx) => sendSuccess(ctx, await packs.remove(ctx.params.id)))
	router.post("/pet-packs/:id/export", (ctx) => sendSuccess(ctx, packs.export(ctx.params.id, ctx.body?.target), 202))
	router.get("/pet-packs/:id/manifest", async (ctx) => sendSuccess(ctx, await packs.get(ctx.params.id)))
	router.post("/pet-packs/validate", async (ctx) => {
		if (ctx.body?.operation === "clear-selection") {
			return sendSuccess(ctx, await packs.clearSelection(ctx.body?.selectionId))
		}
		const source = ctx.body?.path
		if (!source) throw new ApiError("VALIDATION_FAILED", "pet pack path is required")
		return sendSuccess(ctx, await packs.inspect(source))
	})
}
