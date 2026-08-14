// ADR-013:原生 node:http + 自写 router,不引 Express/Fastify。
//
// 设计取舍:
// - 无参路由走 Map,O(1) 命中。OpenPet 的路由表里绝大多数是无参路由。
// - 带参路由在注册时编译成段匹配器数组,逐请求不跑正则。
// - middleware 是 koa 式 (ctx, next),用函数数组就够,不需要框架。
// - 405 不存在:03 篇 §2.3 的错误码表里没有 METHOD_NOT_ALLOWED,
//   方法不匹配一律 404 NOT_FOUND,以免撑大冻结的错误码面。

import { ApiError, sendError } from "./middleware.js"

export function createRouter({ basePath = "/api/v1" } = {}) {
	const middlewares = []

	// 版本化路由(注册时不带 basePath)
	const exactRoutes = new Map()
	const paramRoutes = []
	// 绝对路由:ADR-009 保留的 /api/pet/* 与 /mcp,不在 /api/v1 下
	const absoluteExactRoutes = new Map()
	const absoluteParamRoutes = []

	const registered = []

	function compile(pattern) {
		const segments = pattern.split("/").filter((segment) => segment.length > 0)
		let dynamic = false
		const matchers = segments.map((segment) => {
			if (segment === "*") {
				dynamic = true
				return { kind: "wildcard" }
			}
			if (segment.startsWith(":")) {
				dynamic = true
				return { kind: "param", name: segment.slice(1) }
			}
			return { kind: "static", value: segment }
		})
		return { matchers, dynamic, normalized: "/" + segments.join("/") }
	}

	function register(method, pattern, handler, options = {}) {
		if (typeof handler !== "function") throw new Error("路由 handler 必须是函数: " + method + " " + pattern)
		const upper = method.toUpperCase()
		const absolute = options.absolute === true
		const compiled = compile(pattern)
		const label = upper + " " + (absolute ? compiled.normalized : basePath + compiled.normalized)

		if (compiled.dynamic) {
			const list = absolute ? absoluteParamRoutes : paramRoutes
			list.push({ method: upper, matchers: compiled.matchers, handler })
		} else {
			const table = absolute ? absoluteExactRoutes : exactRoutes
			const key = upper + " " + compiled.normalized
			if (table.has(key)) throw new Error("重复注册的路由: " + label)
			table.set(key, handler)
		}

		registered.push(label)
		return router
	}

	function matchSegments(matchers, segments) {
		const params = {}
		let index = 0
		for (; index < matchers.length; index += 1) {
			const matcher = matchers[index]
			if (matcher.kind === "wildcard") {
				params["*"] = segments.slice(index).join("/")
				return params
			}
			const segment = segments[index]
			if (segment === undefined) return null
			if (matcher.kind === "static") {
				if (matcher.value !== segment) return null
				continue
			}
			params[matcher.name] = segment
		}
		return index === segments.length ? params : null
	}

	function matchDynamic(list, method, path) {
		const segments = path.split("/").filter((segment) => segment.length > 0)
		for (const route of list) {
			if (route.method !== method) continue
			const params = matchSegments(route.matchers, segments)
			if (params !== null) return { handler: route.handler, params }
		}
		return null
	}

	function resolve(ctx) {
		// HEAD 复用 GET 的处理器,响应体由 Node 自行丢弃。
		const method = ctx.method === "HEAD" ? "GET" : ctx.method

		const absoluteHit = absoluteExactRoutes.get(method + " " + ctx.rawPath)
		if (absoluteHit !== undefined) return { handler: absoluteHit, params: {} }
		const absoluteDynamic = matchDynamic(absoluteParamRoutes, method, ctx.rawPath)
		if (absoluteDynamic !== null) return absoluteDynamic

		if (ctx.routePath === null) return null
		const hit = exactRoutes.get(method + " " + ctx.routePath)
		if (hit !== undefined) return { handler: hit, params: {} }
		return matchDynamic(paramRoutes, method, ctx.routePath)
	}

	async function handle(req, res) {
		const ctx = createContext(req, res, basePath)
		try {
			await runChain(middlewares, ctx, async () => {
				const found = resolve(ctx)
				if (found === null) {
					throw new ApiError("NOT_FOUND", "未注册的路由 " + ctx.method + " " + ctx.rawPath)
				}
				ctx.params = found.params
				await found.handler(ctx)
				if (!res.writableEnded && !ctx.hijacked) {
					// 静默挂起的连接比 500 更难排查,这里主动暴露。
					throw new ApiError("INTERNAL", "路由处理器没有写出响应: " + ctx.method + " " + ctx.rawPath)
				}
			})
		} catch (error) {
			// 兜底:errorBoundary 自身或它之前的 middleware 抛出时走这里。
			sendError(ctx, error)
		}
	}

	const router = {
		use(middleware) {
			if (typeof middleware !== "function") throw new Error("middleware 必须是函数")
			middlewares.push(middleware)
			return router
		},
		register,
		get: (pattern, handler) => register("GET", pattern, handler),
		post: (pattern, handler) => register("POST", pattern, handler),
		put: (pattern, handler) => register("PUT", pattern, handler),
		patch: (pattern, handler) => register("PATCH", pattern, handler),
		delete: (pattern, handler) => register("DELETE", pattern, handler),
		// ADR-009 的兼容入口,路径不加 basePath 前缀。
		absolute: (method, pattern, handler) => register(method, pattern, handler, { absolute: true }),
		// check:api-contract 将来用它清点实际注册的路由数,和 03 篇 §4 的路由表对账。
		routes: () => registered.slice(),
		handle,
	}

	return router
}

function createContext(req, res, basePath) {
	const url = new URL(req.url ?? "/", "http://127.0.0.1")
	const rawPath = normalizePath(url.pathname)
	const underBase = rawPath === basePath || rawPath.startsWith(basePath + "/")

	return {
		req,
		res,
		method: (req.method ?? "GET").toUpperCase(),
		rawPath,
		routePath: underBase ? normalizePath(rawPath.slice(basePath.length)) : null,
		query: Object.fromEntries(url.searchParams.entries()),
		params: {},
		body: null,
		state: {},
		requestId: "",
		client: null,
		// SSE handler 自己接管连接时置 true,handle() 就不再要求已写出响应。
		hijacked: false,
		startedAt: performance.now(),
	}
}

function normalizePath(pathname) {
	let value = pathname
	try {
		value = decodeURIComponent(pathname)
	} catch {
		value = pathname
	}
	if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1)
	return value.length === 0 ? "/" : value
}

async function runChain(list, ctx, terminal) {
	let lastIndex = -1

	async function dispatch(index) {
		if (index <= lastIndex) throw new Error("middleware 的 next() 被重复调用")
		lastIndex = index
		const middleware = list[index]
		if (middleware === undefined) return terminal()
		return middleware(ctx, () => dispatch(index + 1))
	}

	return dispatch(0)
}
