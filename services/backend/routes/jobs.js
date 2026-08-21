import { ApiError, sendSuccess } from "../http/middleware.js"

export const JOB_ROUTES = Object.freeze([
	"GET /jobs/:id",
	"POST /jobs/:id/cancel",
])

export function registerJobRoutes(router, { jobs, runner } = {}) {
	if (!jobs?.byId) throw new TypeError("jobs repository required")
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
}
