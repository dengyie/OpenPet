// OpenPet 后端 sidecar 入口
//
// 由 Shell(Electron 主进程)通过 child_process.fork 启动 —— ADR-002 / ADR-004。
// 启动顺序见 README「启动顺序(与 spike 1 有意不同)」。
//
// 本文件只做编排。业务路由从 M2 起注册在 routes/ 下,现在只有 /health。

import { createServer } from "node:http"
import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { EVENT_BACKEND_SHUTTING_DOWN } from "@openpet/contracts"

import { createRouter } from "./http/router.js"
import {
	accessLog,
	bearerAuth,
	createAccessLogBuffer,
	errorBoundary,
	jsonBody,
	loopbackOnly,
	requestId,
} from "./http/middleware.js"
import { createShellClient } from "./bridge/shell-client.js"
import { createSettingsStore } from "./domains/settings.js"
import { createAboutService } from "./domains/about.js"
import { createLocalHttpManager } from "./domains/local-http.js"
import { createPetPackService } from "./domains/pet-packs.js"
import { createCatalogService } from "./domains/catalog.js"
import { createEventHub } from "./events/hub.js"
import { recoverJobs } from "./jobs/recovery.js"
import { registerEventRoutes } from "./routes/events.js"
import { initializeBackendRuntime, registerHealthRoutes } from "./routes/health.js"
import { registerSettingsRoutes } from "./routes/settings.js"
import { registerAboutRoutes } from "./routes/about.js"
import { registerServiceRoutes } from "./routes/service.js"
import { registerPetPackRoutes } from "./routes/pet-packs.js"
import { registerCatalogRoutes } from "./routes/catalog.js"
import { openDatabase } from "./store/db.js"
import { migrate } from "./store/migrate.js"
import { migrateFromJson, needsJsonImport } from "./store/migrate-from-json.js"
import { createJobsRepository } from "./store/repositories/jobs.js"
import { createLogsRepository } from "./store/repositories/logs.js"

const packageJson = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf8"))

const INIT_TIMEOUT_MS = 10_000
const SHUTDOWN_GRACE_MS = 5_000

const EXIT_NO_IPC = 64
const EXIT_INIT_TIMEOUT = 65
const EXIT_HTTP_FAILED = 66
const EXIT_UNCAUGHT = 70

// ⚠️ 这两行必须在任何 await 之前执行。
// ESM 的顶层 await 会推迟模块求值,而 Shell 在 fork 返回后就可能立刻发 init;
// 先挂监听并缓存,才不会丢掉握手的第一条消息。
const inbox = []
let deliver = (raw) => {
	inbox.push(raw)
}
process.on("message", (raw) => deliver(raw))

const logger = createLogger()

function createLogger() {
	// 结构化日志走 stderr,stdout 留给将来可能的二进制/流式输出。
	// Shell 侧把两个流都转发进 app-log-service。
	const write = (level, message, fields) => {
		const line = { at: new Date().toISOString(), level, message, ...(fields ?? {}) }
		process.stderr.write(JSON.stringify(line) + "\n")
	}
	return {
		info: (message, fields) => write("info", message, fields),
		warn: (message, fields) => write("warn", message, fields),
		error: (message, fields) => write("error", message, fields),
	}
}

if (typeof process.send !== "function") {
	logger.error("backend 必须由 Shell fork 启动,当前缺少 IPC 通道", {
		hint: "调试用法见 services/backend/README.md「独立运行」",
	})
	process.exit(EXIT_NO_IPC)
}

const shell = createShellClient({
	send: (envelope) => process.send(envelope),
	exit: (code) => process.exit(code),
	logger,
})

// ⚠️ 顺序敏感,三步不能调:
//   1. 先注册 init 的等待者
//   2. 再把 deliver 指向 shellClient
//   3. 最后排空 inbox
// 若把排空提到注册之前,已经到达的 init 会在 pending/waiters/handlers 都为空时
// 进入 receive(),被静默丢弃,后端随后等 10 秒超时退出。
const initPromise = shell.waitFor("init", { timeoutMs: INIT_TIMEOUT_MS })

deliver = (raw) => shell.receive(raw)
for (const raw of inbox.splice(0)) shell.receive(raw)

const runtime = {
	sessionToken: randomBytes(32).toString("hex"),
	startedAt: Date.now(),
	// ADR-010:密钥由 Shell 在 init 里一次性注入,只存在内存,不落盘、不出响应体。
	secrets: null,
	userDataDir: null,
	// ADR-009:/api/pet/* 与 /mcp 沿用旧 token,由 init 带入;没带就等于关掉这两个入口。
	legacyToken: null,
	petState: null,
	degraded: false,
	degradedReason: null,
	db: null,
	settings: null,
	jobs: null,
	logs: null,
	service: null,
	catalog: null,
	petPacks: null,
}

const initEnvelope = await initPromise.catch((error) => {
	logger.error("等待 Shell 的 init 超时,退出", { timeoutMs: INIT_TIMEOUT_MS, error: String(error) })
	process.exit(EXIT_INIT_TIMEOUT)
	return null
})

runtime.secrets = initEnvelope.body.secrets ?? {}
runtime.userDataDir = initEnvelope.body.userDataDir ?? null
runtime.legacyToken = initEnvelope.body.legacyToken ?? null

const accessLogs = createAccessLogBuffer({ max: 200 })
const router = createRouter({ basePath: "/api/v1" })
// ADR-015:事件总线是唯一的失效通知来源。SSE 订阅、设置变更、Job/恢复钩子都走它。
const eventHub = createEventHub({ logger })
runtime.events = eventHub

router.use(requestId())
router.use(errorBoundary({ logger }))
router.use(accessLog({ buffer: accessLogs, logger, appendHttp: (entry) => runtime.logs?.appendHttp?.(entry) }))
router.use(loopbackOnly())
router.use(
	bearerAuth({
		getSessionToken: () => runtime.sessionToken,
		legacyPathPrefixes: ["/api/pet", "/mcp"],
		getLegacyToken: () => runtime.legacyToken,
	}),
)
router.use(jsonBody())

// 03 篇 §4.1。注意 /health 也在 bearerAuth 之后 —— 未鉴权一律 401,不设例外。
registerHealthRoutes({
	router,
	runtime,
	includeBusinessRoutes: false,
	deps: { logger, cleanup: () => runtime.logs?.cleanup?.() },
})

registerSettingsRoutes({
	router,
	store: runtime.settings ?? { read: () => ({ version: 0, values: {} }), patch: () => { throw new Error("settings 尚未初始化") } },
	emit: (name, payload) => eventHub.publish(name, payload),
})
registerAboutRoutes(router, {
	about: createAboutService({ pkg: packageJson, runtime }),
	jobs: { insert: (input) => {
		if (!runtime.jobs) throw new Error("Job service unavailable")
		return runtime.jobs.insert(input)
	} },
})
runtime.service = createLocalHttpManager({
	settings: runtime.settings,
	secrets: runtime.secrets,
	shell,
	petState: () => runtime.petState,
	logger,
})
registerServiceRoutes(router, { manager: runtime.service })
runtime.catalog = createCatalogService({
	root: join(dirname(fileURLToPath(import.meta.url)), "../.."),
	db: runtime.db,
	logger,
	emit: (name, payload) => eventHub.publish(name, payload),
})
registerCatalogRoutes(router, {
	catalog: runtime.catalog,
	jobs: { insert: (input) => runtime.jobs?.insert(input) },
})
runtime.petPacks = createPetPackService({
	root: join(dirname(fileURLToPath(import.meta.url)), "../.."),
	userDataDir: runtime.userDataDir,
	db: runtime.db,
	jobs: { insert: (input) => runtime.jobs?.insert(input) },
	dialog: shell,
	logger,
	emit: (name, payload) => eventHub.publish(name, payload),
})
registerPetPackRoutes(router, { packs: runtime.petPacks })

registerEventRoutes({ router, hub: eventHub })

const server = createServer((req, res) => {
	void router.handle(req, res)
})

server.keepAliveTimeout = 65_000
server.headersTimeout = 66_000
// SSE 是长连接,不能让 Node 按固定时长掐断请求。
server.requestTimeout = 0

server.on("error", (error) => {
	logger.error("HTTP server 出错", { error: String(error) })
	shell.send({ type: "degraded", reason: "http-server-error" })
	process.exit(EXIT_HTTP_FAILED)
})

await initializeBackendRuntime({
	runtime,
	userDataDir: runtime.userDataDir,
	shell,
	logger,
	deps: { createSettingsStore, openDatabase, migrate, migrateFromJson, needsJsonImport, createJobsRepository, createLogsRepository, recoverJobs },
	bind: () => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)),
})

const address = server.address()

shell.send({
	type: "ready",
	port: address.port,
	// 03 篇 §7 规则 5:apiVersion 是字符串 "v1",不是数字 1。
	apiVersion: "v1",
	pid: process.pid,
	sessionToken: runtime.sessionToken,
	startupMs: Date.now() - runtime.startedAt,
})

logger.info("backend ready", {
	port: address.port,
	pid: process.pid,
	startupMs: Date.now() - runtime.startedAt,
	routes: router.routes().length,
})

shell.on("shutdown", () => {
	void shutdown("shell-request", 0)
})

shell.on("pet.stateSnapshot", (envelope) => {
	// ADR-003:PetService 留在主进程,后端只持有一份只读快照。
	runtime.petState = envelope.body.state ?? null
})

shell.on("power.suspend", () => {
	logger.info("收到 power.suspend")
	// M3:在这里暂停 Job 队列取新任务,已 running 的按 04 篇 §2.6 走 interrupted。
})

shell.on("power.resume", () => {
	logger.info("收到 power.resume")
	// M3:恢复队列并触发一次 system.jobs-recovered。
})

let shuttingDown = false

async function shutdown(reason, code) {
	if (shuttingDown) return
	shuttingDown = true
	logger.info("开始关闭", { reason })

	// 兜底:宽限期内没关干净就硬退,避免 Shell 那边等到超时再 SIGKILL。
	const hardExit = setTimeout(() => process.exit(code), SHUTDOWN_GRACE_MS)
	hardExit.unref()

	// 03 篇 §5:关闭前通知订阅方,让前端切掉本地缓存并准备重连。
	eventHub.publish(EVENT_BACKEND_SHUTTING_DOWN, { reason })
	eventHub.closeAll()
	await new Promise((resolve) => server.close(resolve))
	if (runtime.db !== null) runtime.db.close()
	shell.dispose()

	clearTimeout(hardExit)
	process.exit(code)
}

process.on("SIGTERM", () => void shutdown("SIGTERM", 0))
process.on("SIGINT", () => void shutdown("SIGINT", 0))

process.on("uncaughtException", (error) => {
	logger.error("未捕获异常", { error: String(error), stack: error?.stack })
	void shutdown("uncaughtException", EXIT_UNCAUGHT)
})

process.on("unhandledRejection", (reason) => {
	// 不退进程:单个请求的 promise 崩了不该带走整个后端。
	logger.error("未处理的 rejection", { reason: String(reason) })
})
