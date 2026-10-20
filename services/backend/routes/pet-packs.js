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

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function assertEmptyBody(body, message) {
	const value = body === undefined ? {} : body
	if (!isPlainObject(value) || Object.keys(value).length !== 0) throw new ApiError("VALIDATION_FAILED", message)
}

export function registerPetPackRoutes(router, { packs } = {}) {
	if (!packs) throw new TypeError("pet pack service required")
	router.get("/pet-packs", async (ctx) => sendSuccess(ctx, await packs.list()))
	router.post("/pet-packs/import", (ctx) => {
		const body = ctx.body
		const fields = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : []
		if (fields.length !== 1 || fields[0] !== "selectionId" || typeof body.selectionId !== "string" || !body.selectionId.trim() || body.selectionId.length > 160) {
			throw new ApiError("VALIDATION_FAILED", "pet pack import requires a valid selectionId")
		}
		return sendSuccess(ctx, packs.import(body), 202)
	})
	router.post("/pet-packs/:id/activate", async (ctx) => sendSuccess(ctx, await packs.activate(ctx.params.id)))
	router.delete("/pet-packs/:id", async (ctx) => sendSuccess(ctx, await packs.remove(ctx.params.id)))
	router.post("/pet-packs/:id/export", (ctx) => {
		assertEmptyBody(ctx.body, "pet pack export request is invalid")
		return sendSuccess(ctx, packs.export(ctx.params.id), 202)
	})
	router.get("/pet-packs/:id/manifest", async (ctx) => sendSuccess(ctx, await packs.get(ctx.params.id)))
	router.post("/pet-packs/validate", async (ctx) => {
		const body = ctx.body
		if (body?.operation === "pick") {
			if (!isPlainObject(body) || Object.keys(body).length !== 1) throw new ApiError("VALIDATION_FAILED", "pet pack picker request is invalid")
			return sendSuccess(ctx, await packs.pick())
		}
		if (body?.operation === "clear-selection") {
			if (
				!body
				|| typeof body !== "object"
				|| Array.isArray(body)
				|| Object.keys(body).some((key) => !["operation", "selectionId"].includes(key))
			) {
				throw new ApiError("VALIDATION_FAILED", "clear-selection request is invalid")
			}
			if (typeof body.selectionId !== "string" || !body.selectionId.trim() || body.selectionId.length > 160) {
				throw new ApiError("VALIDATION_FAILED", "selectionId is invalid")
			}
			return sendSuccess(ctx, await packs.clearSelection(body.selectionId))
		}
		throw new ApiError("VALIDATION_FAILED", "pet pack validation request is invalid")
	})
}
