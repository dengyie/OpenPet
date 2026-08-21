import { SSE_TOPICS } from "@openpet/contracts"

import { ApiError } from "../http/middleware.js"

const TOPICS = new Set(SSE_TOPICS)

function requestedTopics(raw) {
	if (raw === undefined || raw === "") return new Set(SSE_TOPICS)
	const topics = raw.split(",").map((topic) => topic.trim()).filter(Boolean)
	if (topics.length === 0 || topics.some((topic) => !TOPICS.has(topic))) {
		throw new ApiError("VALIDATION_FAILED", "SSE topics 参数无效", { details: { topics: raw } })
	}
	return new Set(topics)
}

export function registerEventRoutes({ router, hub } = {}) {
	if (!router || typeof router.register !== "function") throw new TypeError("registerEventRoutes 需要 router")
	if (!hub || typeof hub.subscribe !== "function") throw new TypeError("registerEventRoutes 需要 event hub")
	router.get("/events", (ctx) => {
		const topics = requestedTopics(ctx.query.topics)
		ctx.res.writeHead(200, {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache, no-store",
			connection: "keep-alive",
			"x-accel-buffering": "no",
		})
		ctx.hijacked = true
		const subscription = hub.subscribe({ topics, sink: ctx.res })
		ctx.req.once("close", subscription.unsubscribe)
	})
}
