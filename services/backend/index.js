// OpenPet 后端 sidecar 入口
//
// 由 Shell(Electron 主进程)通过 child_process.fork 启动 —— ADR-002 / ADR-004。
// 启动顺序见 README「启动顺序(与 spike 1 有意不同)」。
//
// 本文件只做编排。业务路由从 M2 起注册在 routes/ 下,现在只有 /health。

import { createServer } from "node:http"
import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { EVENT_BACKEND_SHUTTING_DOWN } from "@openpet/contracts"

import { createRouter } from "./http/router.js"
import {
	accessLog,
	bearerAuth,
	cors,
	createAccessLogBuffer,
	errorBoundary,
	jsonBody,
	loopbackOnly,
	requestId,
} from "./http/middleware.js"
import { createShellClient } from "./bridge/shell-client.js"
import { createPluginRuntimeServer } from "./bridge/plugin-runtime-server.js"
import { createPluginCommandServer } from "./bridge/plugin-command-server.js"
import { createSettingsStore } from "./domains/settings.js"
import { createAboutService } from "./domains/about.js"
import { createLocalHttpManager } from "./domains/local-http.js"
import { createPetPackService } from "./domains/pet-packs.js"
import { createActionService } from "./domains/actions.js"
import { createCatalogService } from "./domains/catalog.js"
import { createInitializedPluginService } from "./domains/plugins/index.js"
import { createProcessLedger } from "./domains/plugins/process-ledger.js"
import { createEventHub } from "./events/hub.js"
import { recoverJobs } from "./jobs/recovery.js"
import { createQueue } from "./jobs/queue.js"
import { createRunner } from "./jobs/runner.js"
import { createJobDispatcher } from "./jobs/dispatcher.js"
import { registerEventRoutes } from "./routes/events.js"
import { initializeBackendRuntime, registerHealthRoutes } from "./routes/health.js"
import { registerSettingsRoutes } from "./routes/settings.js"
import { registerAboutRoutes } from "./routes/about.js"
import { registerServiceRoutes } from "./routes/service.js"
import { registerPetPackRoutes } from "./routes/pet-packs.js"
import { registerActionRoutes } from "./routes/actions.js"
import { registerCatalogRoutes } from "./routes/catalog.js"
import { registerJobRoutes } from "./routes/jobs.js"
import { registerPluginRoutes } from "./routes/plugins.js"
import { openDatabase } from "./store/db.js"
import { migrate } from "./store/migrate.js"
import { migrateFromJson, needsJsonImport } from "./store/migrate-from-json.js"
import { createJobsRepository } from "./store/repositories/jobs.js"
import { createLogsRepository } from "./store/repositories/logs.js"
import { createPluginJobHandlers } from "./jobs/handlers/index.js"
const require = createRequire(import.meta.url)
const { normalizeNetworkRequest, requestPluginNetwork } = require("../../src/main/services/plugin-network-client.js")

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
	actions: null,
	plugins: null,
	commandServer: null,
	about: null,
	queue: null,
	runner: null,
	enqueueJob: null,
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
router.use(cors())
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

// Routes are assembled before storage initialization, so resolve the store
// from runtime when each request runs.
const runtimeSettingsStore = {
	read: (...args) => runtime.settings.read(...args),
	patch: (...args) => runtime.settings.patch(...args),
}
registerSettingsRoutes({
	router,
	store: runtimeSettingsStore,
	 emit: (name, payload) => {
			eventHub.publish(name, payload)
			if (name === "settings.changed") shell.send({ type: "settings.changed", paths: payload.paths, version: payload.version })
		},
})
runtime.about = createAboutService({ pkg: packageJson, runtime })
registerAboutRoutes(router, {
	about: runtime.about,
	jobs: { insert: (input) => {
		if (!runtime.enqueueJob) throw new Error("Job service unavailable")
		return runtime.enqueueJob(input)
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
	jobs: { insert: (input) => runtime.enqueueJob?.(input) },
})
runtime.petPacks = createPetPackService({
	root: join(dirname(fileURLToPath(import.meta.url)), "../.."),
	userDataDir: runtime.userDataDir,
	db: runtime.db,
	jobs: { insert: (input) => runtime.enqueueJob?.(input) },
	dialog: shell,
	logger,
	emit: (name, payload) => eventHub.publish(name, payload),
})
registerPetPackRoutes(router, { packs: runtime.petPacks })
runtime.actions = createActionService({
	root: join(dirname(fileURLToPath(import.meta.url)), "../.."),
	db: runtime.db,
	jobs: { insert: (input) => runtime.enqueueJob?.(input) },
	dialog: shell,
	logger,
	emit: (name, payload) => eventHub.publish(name, payload),
})
registerActionRoutes(router, { actions: runtime.actions })

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
	deps: {
		beforeStore: () => createProcessLedger({ userDataDir: runtime.userDataDir, logger }).sweep(),
		createSettingsStore,
		openDatabase,
		migrate,
		migrateFromJson,
		needsJsonImport,
		createJobsRepository,
		createLogsRepository,
		recoverJobs: (options) => recoverJobs({ ...options, requeueRecovered: false }),
		initializePlugins: () => {
			let runtimeBridgeServer
			const processLedger = createProcessLedger({ userDataDir: runtime.userDataDir, logger })
			const pluginFacade = {
				get: (id) => runtime.plugins?.get?.(id),
				definition: (id) => runtime.plugins?.definition?.(id),
				config: (id) => runtime.plugins?.config?.(id),
				runtimeDirs: (id) => runtime.plugins?.runtimeDirs?.(id),
				appendLog: (entry) => runtime.plugins?.appendLog?.(entry),
				submitTriggerProposal: (pluginId, payload) => runtime.actions.submitProposal({ ...payload, sourcePluginId: pluginId }),
				handleCommandCapability: (pluginId, capability, payload, options) => runtimeBridgeServer.handleCapability(pluginId, capability, payload, options),
			}
			runtimeBridgeServer = createPluginRuntimeServer({
				shell,
				plugins: pluginFacade,
				settings: runtime.settings,
				jobs: { insert: (input) => runtime.enqueueJob(input) },
				logs: { appendPlugin: (entry) => runtime.plugins.appendLog(entry) },
				network: {
					fetch: (plugin, payload, { signal } = {}) => {
						const manifest = plugin?.manifest ?? plugin
						const { url, request } = normalizeNetworkRequest(manifest, payload)
						return requestPluginNetwork({ manifest, url, request, signal })
					},
				},
				logger,
			})
			const commandServer = createPluginCommandServer({
				plugins: pluginFacade,
				jobs: { insert: (input) => runtime.enqueueJob(input) },
				processLedger,
				logger,
			})
			runtime.commandServer = commandServer
			return createInitializedPluginService({
				db: runtime.db,
				jobs: runtime.jobs,
				logs: runtime.logs,
				bridge: shell,
				dialog: shell,
				root: join(dirname(fileURLToPath(import.meta.url)), "../.."),
				userDataDir: runtime.userDataDir,
				settings: runtime.settings,
				logger,
				emit: (name, payload) => eventHub.publish(name, payload),
				runtimeBridgeServer,
				commandServer,
				processLedger,
			})
		},
	},
	bind: () => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)),
})

if (!runtime.degraded && runtime.jobs) {
	runtime.queue = createQueue({ repo: runtime.jobs, logger })
	runtime.runner = createRunner({
		repo: runtime.jobs,
		queue: runtime.queue,
		logger,
		emit: (name, payload) => eventHub.publish(name, payload),
		tmpRoot: runtime.tmpDir ?? join(runtime.userDataDir, "backend", "tmp"),
		handlers: {
			"about.check-updates": async ({ report }) => { report({ phase: "checking", percent: 25 }); return runtime.about.checkUpdates() },
			"catalog.install": async ({ job, report, signal }) => { report({ phase: "installing", percent: 25 }); if (signal.aborted) throw signal.reason ?? new Error("Job canceled"); return runtime.catalog.install(job.input?.id) },
			"pet-pack.import": async ({ job, report, signal }) => runtime.petPacks.runImport({ ...job.input, signal, report }),
			"pet-pack.export": async ({ job, report, signal }) => runtime.petPacks.runExport({ ...job.input, signal, report }),
			"actions.import-frames": async ({ job, report, signal }) => runtime.actions.runImportFrames({ ...job.input, signal, report }),
			...createPluginJobHandlers({
				db: runtime.db,
				plugins: runtime.plugins,
				logger,
			}),
		},
	})
	runtime.enqueueJob = createJobDispatcher({
		queue: runtime.queue,
		runner: runtime.runner,
		publish: (name, payload) => eventHub.publish(name, payload),
		logger,
	})
	// Recovery already persisted queued jobs. Enqueue by id so the queue does
	// not attempt to insert an existing SQLite row a second time.
	for (const job of runtime.jobs.list({ status: "queued", limit: 1_000 })) runtime.queue.enqueue(job.id)
	while (true) {
		const next = runtime.queue.next()
		if (!next) break
		void runtime.runner.run(next).catch((error) => logger.error("恢复 Job 执行失败", { jobId: next.id, error: String(error) }))
	}
} else {
	runtime.enqueueJob = () => { throw new Error("Job service unavailable") }
}

registerJobRoutes(router, { jobs: runtime.jobs ?? { byId: () => null }, runner: runtime.runner, dispatcher: runtime.enqueueJob })
// Plugin domain initializes after the HTTP listener is assembled. Keep route
// handlers bound to the current runtime service instead of the initial null.
const pluginRouteFacade = new Proxy({}, {
	get: (_target, property) => {
		if (property === "enqueueJob") return runtime.enqueueJob
		const service = runtime.plugins
		const value = service?.[property]
		return typeof value === "function" ? value.bind(service) : value
	},
})
registerPluginRoutes(router, { plugins: pluginRouteFacade })

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
	await runtime.plugins?.stopAll?.()
	try {
		await runtime.plugins?.closeLogs?.()
	} catch (error) {
		logger.error("插件日志关闭失败", { error: String(error) })
	}
	await runtime.plugins?.runtimeBridgeServer?.close?.()
	await runtime.commandServer?.close?.()
	await runtime.runner?.shutdown?.()
	runtime.queue?.stop?.()
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
