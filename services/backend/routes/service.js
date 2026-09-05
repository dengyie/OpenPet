import { ApiError, sendList, sendSuccess } from "../http/middleware.js"

export const SERVICE_ROUTES = Object.freeze([
	"GET /service/status",
	"POST /service/enable",
	"POST /service/token/rotate",
	"POST /service/token/revoke-sessions",
	"GET /service/logs",
	"DELETE /service/logs",
	"GET /service/config",
	"PUT /service/config",
	"POST /service/diagnostics",
])

export function registerServiceRoutes(router, { manager } = {}) {
	if (!manager) throw new TypeError("service manager required")
	router.get("/service/status", (ctx) => sendSuccess(ctx, manager.status()))
	router.post("/service/enable", async (ctx) => sendSuccess(ctx, ctx.body?.enabled === false ? await manager.stop() : await manager.start(ctx.body ?? {})))
	router.post("/service/token/rotate", async (ctx) => sendSuccess(ctx, await manager.rotateToken(ctx.body?.token)))
	router.post("/service/token/revoke-sessions", (ctx) => sendSuccess(ctx, manager.revokeMcpSessions()))
	router.get("/service/logs", (ctx) => sendSuccess(ctx, ctx.query.operation === "export" ? manager.exportLogs(ctx.query) : manager.getLogs(ctx.query)))
	router.delete("/service/logs", (ctx) => sendSuccess(ctx, manager.clearLogs()))
	router.get("/service/config", (ctx) => sendSuccess(ctx, manager.config()))
	router.put("/service/config", async (ctx) => sendSuccess(ctx, await manager.setConfig(ctx.body ?? {})))
	router.post("/service/diagnostics", (ctx) => {
		const result = manager.diagnostics()
		if (JSON.stringify(result).includes(manager.token ?? "__missing__")) throw new ApiError("INTERNAL", "诊断输出包含敏感信息")
		return sendSuccess(ctx, result)
	})
}
