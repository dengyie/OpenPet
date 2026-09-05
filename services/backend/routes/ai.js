import { ApiError, sendSuccess } from "../http/middleware.js"

export const AI_SECRET_ROUTES = Object.freeze([
	"PUT /ai/providers/:id/key",
	"DELETE /ai/providers/:id/key",
])

function apiKey(body) {
	if (body === null || typeof body !== "object" || Array.isArray(body) || typeof body.apiKey !== "string") {
		throw new ApiError("VALIDATION_FAILED", "apiKey is required", { details: { field: "apiKey" } })
	}
	return body.apiKey
}

export function registerAiSecretRoutes(router, { secrets } = {}) {
	if (!router || typeof router.put !== "function" || typeof router.delete !== "function") {
		throw new TypeError("registerAiSecretRoutes requires router")
	}
	if (!secrets || typeof secrets.set !== "function" || typeof secrets.clear !== "function") {
		throw new TypeError("registerAiSecretRoutes requires secrets service")
	}

	router.put("/ai/providers/:id/key", async (ctx) => {
		return sendSuccess(ctx, await secrets.set(ctx.params.id, apiKey(ctx.body)))
	})
	router.delete("/ai/providers/:id/key", async (ctx) => {
		return sendSuccess(ctx, await secrets.clear(ctx.params.id))
	})
}
