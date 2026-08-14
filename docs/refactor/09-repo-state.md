# 09 · 仓库现状快照

> v1.0 · 2026-08-15 · 基线分支 `refactor/frontend-backend-split`

**读者**:领到任务卡准备写代码的 agent。前置阅读 [08 篇 执行手册](./08-agent-guide.md)。

---

## 0. 怎么用这一篇

领卡之前在这里确认两件事:

1. 你要建的文件**是不是已经存在**;
2. 你要调的函数**签名长什么样**。

> **已存在的文件按现状用 —— 不要重写,不要改签名。** 它们是样板,后面所有模块照这个形状写。

如果你认为某个已有文件的设计不对:写进 §4 缺口清单并在 PR 里说明,**不要直接改**。已有文件的每一处形状都有理由,理由写在文件顶部的注释里,先读它。

---

## 1. 重构已经落地的部分

```plain text
apps/desktop/src/sidecar/spawn.js      ✅ CJS,主进程用来拉起 sidecar
packages/contracts/                    ✅ 契约唯一来源(ESM + zod)
  package.json  tsconfig.json  README.md
  src/index.ts  envelope.ts  jobs.ts  events.ts  bridge.ts  settings.ts
services/backend/                      ✅ 骨架已通,业务为空
  package.json  README.md  index.js
  http/router.js  http/middleware.js
  bridge/message-schema.js  bridge/shell-client.js
  store/db.js  store/migrations/001_init.sql
  jobs/state-machine.js
scripts/check-api-contract.mjs          ✅ M0 门禁
tests/backend/state-machine.test.js     ✅ 测试样板
```

根 `package.json` 已开启 workspaces(`apps/*`、`services/*`、`packages/*`),`check:node` 已覆盖 `apps` 与 `services`。

**当前后端只注册了 `GET /health` 一条路由,没有打开数据库。** 其余全部待建,见 §3。

---

## 2. 已存在文件的对外接口

### 2.1 `services/backend/http/middleware.js`

全局约定的落点。**改它等于改全局**,见 08 篇 §6。

常量:`GENERIC_ERROR_HTTP_STATUS`(13 个通用码 → HTTP 状态)、`RETRYABLE_ERROR_CODES`(5 个)、`MAX_BODY_BYTES = 1024 * 1024`、`DEFAULT_MAX_ACCESS_LOGS = 200`。

导出:`ApiError`、`elapsedMs`、`sendSuccess`、`sendList`、`sendError`、`requestId`、`errorBoundary`、`loopbackOnly`、`bearerAuth`、`jsonBody`、`createAccessLogBuffer`、`accessLog`。

```js
new ApiError(code, message, { status, details, retryable, cause })
// status 默认 GENERIC_ERROR_HTTP_STATUS[code] ?? 500
// retryable 默认 RETRYABLE_ERROR_CODES.has(code)

bearerAuth({ getSessionToken, legacyPathPrefixes, getLegacyToken })
jsonBody({ maxBytes })            // 超限中途即断,返 413
createAccessLogBuffer({ max })    // 环形缓冲,给 /service/logs 用
accessLog({ buffer, logger })
```

要点:token 比对是 sha256 后 `timingSafeEqual`,不要改成 `===`;`GET/HEAD/DELETE/OPTIONS` 不读 body;回包统一走 `sendSuccess`/`sendList`/`sendError`,不要自己 `res.end(JSON.stringify(...))`。

### 2.2 `services/backend/http/router.js`

```js
const router = createRouter({ basePath: "/api/v1" })
// → { use, register, get, post, put, patch, delete, absolute, routes, handle }
```

处理函数拿到的 `ctx`:

```js
{ req, res, method, rawPath, routePath, query, params, body,
  state, requestId, client, hijacked, startedAt }
```

要点:`HEAD` 自动走 `GET`;路径匹配但方法不对返 **404 `NOT_FOUND`**(没有 `METHOD_NOT_ALLOWED` 这个码);SSE 之类要接管响应流的,把 `ctx.hijacked` 置 true;`routes()` 返回已注册路由表,M1 的门禁硬化要用它对 03 篇 §4。

### 2.3 `services/backend/bridge/message-schema.js`

常量:`BRIDGE_PROTOCOL_VERSION = 1`、`EXIT_CODE_VERSION_MISMATCH = 78`、`MAX_VERSION_MISMATCH_RELAUNCHES = 2`、`DIALOG_RESULT_TIMEOUT_MS = 60_000`、`BACKEND_TO_SHELL_TYPES`、`SHELL_TO_BACKEND_TYPES`。

函数:`nextEnvelopeId()`(形如 `b<pid>-<seq>`)、`createEnvelope`、`parseEnvelope`。

`parseEnvelope` 的 6 种失败原因:`not-object` / `version-mismatch` / `bad-id` / `bad-at` / `bad-body` / `unknown-type`。**`version-mismatch` 必须走「退出 78 由 Shell 重拉」,不能当普通错误吞掉**(ADR-011)。

⚠️ `BACKEND_TO_SHELL_TYPES` 只有 8 项,而契约 `backendToShellSchema` 有 9 项 —— 少 `dialog.request`。见 §4 G2。

### 2.4 `services/backend/bridge/shell-client.js`

```js
const shell = createShellClient({ send, exit, logger })
// → { receive, send, request, waitFor, on, dispose }
```

`request` 的相关性靠**复用同一个 envelope `id`**,没有 `replyTo` 字段。`waitFor("init")` 必须在开始排空 inbox **之前**注册,否则丢首帧 —— `index.js` 里已经是正确顺序,照抄。

### 2.5 `services/backend/store/db.js`

```js
const db = await openDatabase({ file, pragmas, logger })
// → { driverName: "node:sqlite", file, exec, prepare, transaction, pragma, close }
// prepare(sql) → { get, all, run }
```

`DEFAULT_PRAGMAS`:`journal_mode = WAL`、`synchronous = NORMAL`、`foreign_keys = ON`、`busy_timeout = 5000`。

要点:内部用 `await import("node:sqlite")`,拿不到就抛 `NODE_SQLITE_UNAVAILABLE`(spike 6 未跑,这是唯一的逃生口,见 08 篇 H4);模块级 `openFiles` 集合强制同一文件只开一次(ADR-007);**`transaction(fn)` 拒绝 async 回调**。

### 2.6 `services/backend/store/migrations/001_init.sql` —— 已冻结

9 张表:`ai_conversations`、`ai_messages`、`ai_memories`、`jobs`、`job_events`、`plugin_logs`、`http_access_logs`、`traces`、`schema_migrations`(后者带 `IF NOT EXISTS`,因为迁移运行器要先建它)。

⚠️ `idx_jobs_resource_active` 是**部分唯一索引**,`WHERE status IN ('queued','running')` 与 `state-machine.js` 的 `ACTIVE_STATUSES` 绑定。两处不同步的后果是代码以为锁已释放、索引仍拦 INSERT,表现为莫名的 `SQLITE_CONSTRAINT`。`tests/backend/state-machine.test.js` 已经把这条写成断言。

时间列一律 `INTEGER` Unix 毫秒。保留策略:`http_access_logs` 7 天或 1 万行;`job_events` 随 job 级联;`plugin_logs` 每插件 5000 条;每小时清理一次。

### 2.7 `services/backend/jobs/state-machine.js`

集合:`JOB_STATUSES`(6)、`ACTIVE_STATUSES`、`TERMINAL_STATUSES`、`RETRYABLE_STATUSES`、`JOB_KINDS`(17)、`UNCANCELABLE_PHASES`(`{"finalizing"}`)、`MAX_ATTEMPTS_BY_KIND`(9 个键,值都是 2)、`DEFAULT_MAX_ATTEMPTS = 1`、`INTERRUPTED_ERROR_CODE = "BACKEND_RESTARTED"`。

函数:`isJobStatus`、`isJobKind`、`isActive`、`isTerminal`、`maxAttemptsFor`、`nextStatuses`、`canTransition`、`assertTransition(from, to, { jobId })`、`isCancelable({ status, phase })`、`assertCancelable`、`canRetry`、`assertRetry`、`interruptionError(reason)`。

要点:合法边**恰好 9 条**,非法流转抛 `CONFLICT`/409(是并发,不是输入错误);取消判定看 **phase 不看 kind** —— 运行器在写最终文件前必须把 phase 置为 `finalizing`,否则「正在落盘时被取消」这个约束形同虚设;`assertCancelable` 抛 `JOB_NOT_CANCELABLE` 时**显式带 423**(业务码不在默认状态表里)。

### 2.8 `services/backend/index.js`

退出码:`64` 无 IPC 通道、`65` init 超时、`66` HTTP 启动失败、`70` 未捕获异常、`78`(在 bridge 里)版本不兼容。超时常量 `INIT_TIMEOUT_MS = 10_000`、`SHUTDOWN_GRACE_MS = 5_000`。

`runtime` 对象:`{ sessionToken, startedAt, secrets, userDataDir, legacyToken, petState, degraded, db }` —— 新模块需要运行期状态就挂在这里,不要另造全局。

中间件顺序(**不要改**):`requestId → errorBoundary → accessLog → loopbackOnly → bearerAuth → jsonBody`。

启动顺序刻意与 07 篇 spike 1 不同:先 `init` 再监听端口再发 `ready`,只有一个就绪点。`ready` 消息体 `{ type, port, apiVersion: "v1", pid, sessionToken, startupMs }`。

### 2.9 `apps/desktop/src/sidecar/spawn.js`(CJS)

导出 `spawnSidecar`、`stopSidecar`、`resolveSidecarEntry`、`SIDECAR_RELATIVE_ENTRY = "services/backend/index.js"`、`READY_TIMEOUT_MS = 10000`、`EXIT_CODE_VERSION_MISMATCH = 78`、`MAX_VERSION_MISMATCH_RELAUNCHES = 2`。

抛 `SIDECAR_READY_TIMEOUT`、`SIDECAR_VERSION_MISMATCH`、`SIDECAR_EARLY_EXIT`、`SIDECAR_SPAWN_FAILED`。成功返回 `{ child, port, sessionToken, apiVersion, pid, startupMs, attempt, baseUrl }`。重拉预算只对 `SIDECAR_VERSION_MISMATCH` 生效。

### 2.10 `packages/contracts/src/*.ts`

`index.ts` 只做 re-export,新增契约文件要在这里追加一行(热点文件,只追加)。**缩进是 2 空格,不是 tab。**

`bridge.ts` 已导出:`BRIDGE_PROTOCOL_VERSION`、`EXIT_CODE_VERSION_MISMATCH`、`MAX_VERSION_MISMATCH_RELAUNCHES`、`DIALOG_RESULT_TIMEOUT_MS`、`SIDECAR_READY_TIMEOUT_MS`、`envelopeSchema`、`Envelope<T>`、`backendToShellSchema`(9 项)、`shellToBackendSchema`(6 项)、两个信封 schema、`inspectEnvelope`。

`init` 消息是唯一允许携带敏感数据(`providerKeys`)的地方,ADR-010;后端只留内存,不落盘。

### 2.11 门禁与测试

`scripts/check-api-contract.mjs` 对账六项并重算 03 篇 §3 的算术,格式硬要求见 08 篇 §5。
`tests/backend/state-machine.test.js` 是测试样板 —— 新测试照抄它的 CJS + `await import()` 开头。

---

## 3. 还不存在的文件

按 M1 归组;编号见 10 篇任务卡。

| 组 | 待建 |
| --- | --- |
| 迁移与仓储 | `store/migrate.js`(运行器 + 校验和 + 版本降级保护)、`store/repositories/*.js`、`store/migrate-from-json.js` |
| Job 引擎 | `jobs/queue.js`、`jobs/runner.js`、`jobs/progress.js`、`jobs/recovery.js` |
| HTTP | `routes/*.js`(§4.1–§4.10 共 10 组)、`domains/*.js`、SSE 推送 |
| 密钥 | `secrets/*.js` |
| 反向通道 | `dialog.request` 补齐、`apps/desktop/src/sidecar/message-handler.js`、`orphan-cleanup.js` |
| 兼容层 | `mcp/*.js`、`/api/pet/*` 与 `/mcp` 的保留实现(ADR-009) |

---

## 4. 缺口清单

每条都是**已知**的,不要重复发现;修它的时候在对应任务卡里勾掉。

| 编号 | 现象 | 影响 |
| --- | --- | --- |
| G1 | `@openpet/contracts` 的 `main` 指向未生成的 `dist/` | 先 `npm run build:contracts`;TS 侧可走 `@openpet/contracts/src/*` |
| G2 | 后端 `BACKEND_TO_SHELL_TYPES` 8 项,契约 9 项,少 `dialog.request` | 选目录/文件对话框走不通;修的时候要同时加白名单、`shell-client` 的 request 分支、60s 超时返 504 |
| G3 | 13 个通用码的状态映射在 `middleware.js` 和契约 `envelope.ts` **各有一份** | 需要 gate 检查这层重复;不要再复制第三处 |
| G4 | R20:ESM 入口在 `app.asar` 内可能解析失败 | 只在打包后暴露;退路是 `build.asarUnpack` 或降级 CJS。06 篇 §9 还没登记这条 |
| G5 | `package-lock.json` 未与 workspaces 同步 | 首次 `npm install` 会大改 lockfile,正常 |
| G6 | 六条 spike 全部未跑 | 见 §5 |
| G7 | 04 篇 §2.6 的 ⚠️ 待补登记 注记已过期 | `system.jobs-recovered`、`system.events-dropped` 已补进 03 篇 §5,注记该清 |
| G8 | 06 篇 §9 风险表缺 R20 | 补一行 |
| G9 | 门禁两项仍是 `todo`(路由表、通道盘点) | M1 起硬化 |
| G10 | `tests/backend/state-machine.test.js` 有一处 `it()` 标题笔误 | 纯文案,下次动该文件时一并改 |

---

## 5. 六条 spike 的状态

**全部未跑。** 它们需要真实 Electron / 打包环境,是目前唯一必须由人在本机执行的部分。建议顺序 `6 → 1 → 2 → 5 → 3 → 4`。

| spike | 命令 | 未跑意味着 |
| --- | --- | --- |
| 6 `node:sqlite` | `ELECTRON_RUN_AS_NODE=1 npx electron spike/06-node-sqlite/probe-sqlite.js` | 存储层的地基未证实;所有 DB 相关卡都建立在 `store/db.js` 这个 seam 上 |
| 1 fork sidecar | `npx electron spike/01-fork-sidecar/shell.js` | 进程模型未证实 |
| 2 端口与 ready | `ELECTRON_RUN_AS_NODE=1 npx electron spike/02-port-ready/sidecar-http.js` | 启动握手未证实 |
| 5 打包 | `npm run pack` + 手验安装包 | R20 就在这里暴露 |
| 3 前端闸门 | `npx electron spike/03-frontend-gate/run.js` | 已知 case 2 为红,修法在 05 篇 §2.2 + F14 |
| 4 safeStorage | `npx electron spike/04-safe-storage/probe.js` | 密钥方案未证实 |

**未跑期间怎么办**:照 08 篇 H4/H8 —— 把运行时依赖藏在 seam 后面,业务逻辑写成纯函数并配裸 `node` 能跑的测试。`jobs/state-machine.js` 与它的测试就是这个做法的样板:六条 spike 全红也不影响它跑绿。

---

## 6. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-08-15 | 首版:已落地文件的对外接口、待建清单、10 条缺口、spike 状态 |
