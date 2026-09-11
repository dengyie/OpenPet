import { randomUUID } from "node:crypto"

import { ApiError, sendList, sendSuccess } from "../http/middleware.js"

export const CREATOR_ROUTES = Object.freeze([
	"GET /creator/state",
	"GET /creator/last-run",
	"GET /creator/flows",
	"POST /creator/flows",
	"PATCH /creator/flows/:id",
	"DELETE /creator/flows/:id",
	"GET /creator/references",
	"POST /creator/references",
	"DELETE /creator/references",
	"POST /creator/characters/generate",
	"POST /creator/sprites/generate",
	"POST /creator/sprites/evaluate",
	"POST /creator/workflows/:id/run",
	"GET /creator/workflows/:id/artifacts",
	"POST /creator/export",
	"GET /creator/assets/preview",
	"POST /creator/runs/:id/retry-action",
	"POST /creator/runs/:id/retry-identity",
	"POST /creator/runs/:id/accept-identity",
	"POST /creator/runs/:id/accept-action-candidate",
	"POST /creator/runs/:id/import-actions",
])

const CREDENTIAL_KEY = /api.?key|password|secret|credential|authorization|cookie/i

function object(value, field = "body") {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new ApiError("VALIDATION_FAILED", `${field} must be an object`, { details: { field } })
	}
	return value
}

function required(value, field, max = 8_000) {
	if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
		throw new ApiError("VALIDATION_FAILED", `${field} is required`, { details: { field, max } })
	}
	return value.trim()
}

function containsCredential(value, key = "") {
	if (CREDENTIAL_KEY.test(key)) return true
	if (Array.isArray(value)) return value.some((entry) => containsCredential(entry))
	if (!value || typeof value !== "object") return false
	return Object.entries(value).some(([entryKey, entry]) => containsCredential(entry, entryKey))
}

function bodyWithoutControlFields(body, fields = []) {
	const input = { ...object(body) }
	for (const field of fields) delete input[field]
	return input
}

export function registerCreatorRoutes(router, { creator } = {}) {
	if (!router || typeof router.register !== "function") throw new TypeError("registerCreatorRoutes requires router")
	if (!creator) throw new TypeError("registerCreatorRoutes requires creator domain")

	router.get("/creator/state", async (ctx) => sendSuccess(ctx, await creator.getState()))
	router.get("/creator/last-run", async (ctx) => sendSuccess(ctx, await creator.getLastRun()))
	router.get("/creator/flows", (ctx) => sendList(ctx, creator.listFlows()))
	router.post("/creator/flows", (ctx) => sendSuccess(ctx, creator.createFlow(object(ctx.body))))
	router.patch("/creator/flows/:id", (ctx) => sendSuccess(ctx, creator.updateFlow(ctx.params.id, object(ctx.body))))
	router.delete("/creator/flows/:id", (ctx) => sendSuccess(ctx, creator.deleteFlow(ctx.params.id)))

	router.get("/creator/references", (ctx) => sendList(ctx, creator.listReferences()))
	router.post("/creator/references", async (ctx) => sendSuccess(ctx, await creator.bindReference(object(ctx.body))))
	router.delete("/creator/references", async (ctx) => sendSuccess(ctx, await creator.deleteReference({
		targetType: ctx.query.targetType,
		targetId: ctx.query.targetId,
	})))

	const enqueue = (ctx, factory, input) => {
		if (containsCredential(input)) throw new ApiError("VALIDATION_FAILED", "Creator credentials are host-managed")
		return sendSuccess(ctx, factory(input), 202)
	}
	router.post("/creator/characters/generate", (ctx) => {
		const payload = object(ctx.body)
		return enqueue(ctx, creator.enqueueCharacter, payload)
	})
	router.post("/creator/sprites/generate", (ctx) => {
		const payload = object(ctx.body)
		return enqueue(ctx, creator.enqueueAction, { ...payload, operation: "generate-action" })
	})
	router.post("/creator/sprites/evaluate", (ctx) => {
		const payload = object(ctx.body)
		return enqueue(ctx, creator.enqueueSpriteEvaluation, { ...payload, operation: "evaluate-sprite" })
	})
	router.post("/creator/workflows/:id/run", (ctx) => {
		const payload = object(ctx.body)
		return enqueue(ctx, creator.enqueueWorkflow, { ...payload, flowId: ctx.params.id, operation: payload.operation || "run" })
	})
	router.get("/creator/workflows/:id/artifacts", (ctx) => sendList(ctx, creator.artifacts(ctx.params.id)))
	router.post("/creator/export", (ctx) => {
		const payload = object(ctx.body)
		const runId = required(payload.runId, "runId", 128)
		return enqueue(ctx, creator.enqueueExport, { runId })
	})
	router.get("/creator/assets/preview", async (ctx) => sendSuccess(ctx, await creator.getAssetPreview({ runId: ctx.query.runId, relativePath: ctx.query.relativePath })))

	router.post("/creator/runs/:id/retry-action", (ctx) => enqueue(ctx, creator.enqueueWorkflow, { ...bodyWithoutControlFields(ctx.body || {}, []), runId: ctx.params.id, operation: "retry-action" }))
	router.post("/creator/runs/:id/retry-identity", (ctx) => enqueue(ctx, creator.enqueueWorkflow, { ...bodyWithoutControlFields(ctx.body || {}, []), runId: ctx.params.id, operation: "retry-identity" }))
	router.post("/creator/runs/:id/accept-identity", (ctx) => enqueue(ctx, creator.enqueueWorkflow, { ...object(ctx.body), runId: ctx.params.id, operation: "accept-identity" }))
	router.post("/creator/runs/:id/accept-action-candidate", (ctx) => enqueue(ctx, creator.enqueueWorkflow, { ...object(ctx.body), runId: ctx.params.id, operation: "accept-action-candidate" }))
	router.post("/creator/runs/:id/import-actions", (ctx) => enqueue(ctx, creator.enqueueWorkflow, { ...object(ctx.body), runId: ctx.params.id, operation: "import-actions" }))
}
