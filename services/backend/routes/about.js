import { randomUUID } from "node:crypto"

import { ApiError, sendSuccess } from "../http/middleware.js"

export function registerAboutRoutes(router, { about, jobs } = {}) {
	if (!about) throw new TypeError("about service required")
	router.get("/about", (ctx) => sendSuccess(ctx, about.info()))
	router.post("/about/check-updates", (ctx) => {
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const id = `about-check:${randomUUID()}`
		const job = jobs.insert({ id, kind: "about.check-updates", input: {} })
		return sendSuccess(ctx, { jobId: job.id }, 202)
	})
}

export const ABOUT_ROUTES = Object.freeze(["GET /about", "POST /about/check-updates"])
