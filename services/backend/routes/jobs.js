import { ApiError, sendList, sendSuccess } from "../http/middleware.js"
import { assertRetry, isJobKind, isJobStatus } from "../jobs/state-machine.js"

export const JOB_ROUTES = Object.freeze([
	"GET /jobs",
	"GET /jobs/:id",
	"POST /jobs/:id/cancel",
	"POST /jobs/:id/retry",
	"GET /jobs/:id/events",
	"DELETE /jobs/completed",
])

function integerQuery(value, field, { minimum = 0, maximum = 1_000, fallback } = {}) {
	if (value === undefined) return fallback
	if (!/^\d+$/.test(String(value))) throw new ApiError("VALIDATION_FAILED", `${field} must be an integer`)
	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new ApiError("VALIDATION_FAILED", `${field} is out of range`, { details: { field, minimum, maximum } })
	}
	return parsed
}

export function registerJobRoutes(router, { jobs, runner, dispatcher } = {}) {
	if (!jobs?.byId) throw new TypeError("jobs repository required")
	router.get("/jobs", (ctx) => {
		const status = ctx.query.status
		const kind = ctx.query.kind
		if (status !== undefined && !isJobStatus(status)) throw new ApiError("VALIDATION_FAILED", "Unknown Job status", { details: { status } })
		if (kind !== undefined && !isJobKind(kind)) throw new ApiError("VALIDATION_FAILED", "Unknown Job kind", { details: { kind } })
		const options = {
			...(status === undefined ? {} : { status }),
			...(kind === undefined ? {} : { kind }),
			limit: integerQuery(ctx.query.limit, "limit", { minimum: 1, fallback: 100 }),
			offset: integerQuery(ctx.query.offset, "offset", { maximum: Number.MAX_SAFE_INTEGER, fallback: 0 }),
		}
		return sendList(ctx, jobs.list(options), { total: jobs.count(options) })
	})
	router.get("/jobs/:id", (ctx) => {
		const job = jobs.byId(ctx.params.id)
		if (!job) throw new ApiError("NOT_FOUND", "Job 不存在", { details: { jobId: ctx.params.id } })
		return sendSuccess(ctx, job)
	})
	router.post("/jobs/:id/cancel", async (ctx) => {
		if (!runner?.cancel) throw new ApiError("BACKEND_UNAVAILABLE", "Job runner unavailable")
		const job = await runner.cancel(ctx.params.id)
		return sendSuccess(ctx, job)
	})
	router.post("/jobs/:id/retry", (ctx) => {
		if (!dispatcher?.resume) throw new ApiError("BACKEND_UNAVAILABLE", "Job dispatcher unavailable")
		const current = jobs.byId(ctx.params.id)
		if (!current) throw new ApiError("NOT_FOUND", "Job 不存在", { details: { jobId: ctx.params.id } })
		assertRetry(current)
		jobs.transition(current.id, "queued")
		const job = dispatcher.resume(current.id)
		return sendSuccess(ctx, job, 202)
	})
	router.get("/jobs/:id/events", (ctx) => {
		if (!jobs.byId(ctx.params.id)) throw new ApiError("NOT_FOUND", "Job 不存在", { details: { jobId: ctx.params.id } })
		const limit = integerQuery(ctx.query.limit, "limit", { minimum: 1, fallback: 100 })
		const events = jobs.listEvents(ctx.params.id, { limit })
		return sendList(ctx, events, { total: jobs.countEvents(ctx.params.id) })
	})
	router.delete("/jobs/completed", (ctx) => sendSuccess(ctx, { deleted: jobs.removeCompleted() }))
}
