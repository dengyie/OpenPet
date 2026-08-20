# 09 · 仓库现状快照

> v1.3 · 2026-08-16 · 基线分支 `main` · M0 E1–E10 已回填

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

⚠️ `BACKEND_TO_SHELL_TYPES` 只有 8 项,而契约 `backendToShellSchema` 有 9 项 —— 少 `dialog.request`。见 §4 缺口 G2。

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

要点:内部用 `await import("node:sqlite")`,拿不到就抛 `NODE_SQLITE_UNAVAILABLE`;E3 已确认 Electron 42.4.0 / Node 24.16.0 无需 flag,但 `:memory:` 探针返回 `journal_mode='memory'`,未验证 file-backed WAL(见 [07 篇](./07-spike.md) §7 第 6 行与缺口 G11)。模块级 `openFiles` 集合强制同一文件只开一次(ADR-007);**`transaction(fn)` 拒绝 async 回调**。

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

按 M1 归组;编号见 [10 篇](./10-tasks-m1.md)、[11 篇](./11-tasks-m1-http.md)、[12 篇](./12-tasks-m2.md)、[13 篇](./13-tasks-m3.md) 的任务卡(M1 = T01–T14、M2 = T15–T23、M3 = T24–T33)。

| 组 | 待建 |
| --- | --- |
| 迁移与仓储 | `store/migrate.js`(运行器 + 校验和 + 版本降级保护)、`store/repositories/*.js`、`store/migrate-from-json.js`(T14) |
| Job 引擎 | `jobs/queue.js`、`jobs/runner.js`、`jobs/progress.js`、`jobs/recovery.js`、`jobs/handlers/*.js`(T31) |
| HTTP | `routes/*.js`(§4.1–§4.10 共 10 组)、`domains/*.js`、SSE 推送 |
| 密钥 | `secrets/*.js` |
| 反向通道 | `dialog.request` 补齐、`apps/desktop/src/sidecar/message-handler.js`、`orphan-cleanup.js`、`domains/plugins/process-ledger.js`(T29) |
| 兼容层 | `mcp/*.js`、`/api/pet/*` 与 `/mcp` 的保留实现(ADR-009) |

> ⚠️ **`conversations` 仓储要到 M4 才建。** T14 的 JSON 导入直接用 `db.prepare(...)` 写入,不要为它提前造仓库层 —— 见 [12 篇 T14](./12-tasks-m2.md)。

---

## 4. 缺口清单

本节的 G1–G12 是**缺口编号**,与 [README §三](./README.md) 的目标 G1–G8 是两套互不相干的编号;本篇正文统一写作「缺口 G1」至「缺口 G12」。

每条都是**已知**的,不要重复发现。已关闭的条目保留在表里并标 ✅,这样你既不会重复修,也不会以为它从来没存在过。

| 编号 | 状态 | 现象 | 影响 / 去向 |
| --- | --- | --- | --- |
| 缺口 G1 | ⏳ | `@openpet/contracts` 的 `main` 指向未生成的 `dist/` | `build:contracts` 是孤儿脚本:`.github/workflows/ci.yml` 没有步骤调用它,`packages/contracts/` 下也没有 `dist/`。「能构建」不等于「被构建」;由 T34(卡面 [#41 §5](https://github.com/dengyie/OpenPet/issues/41),进度 [#41 §4](https://github.com/dengyie/OpenPet/issues/41)) 修复 |
| 缺口 G2 | ⏳ | 后端 `BACKEND_TO_SHELL_TYPES` 8 项,契约 9 项,少 `dialog.request` | 选目录/文件对话框走不通;由 **T12** 修,要同时加白名单、`shell-client` 的 request 分支、60s 超时返 504。**T18/T19 强依赖它** |
| 缺口 G3 | ⏳ | 13 个通用码的状态映射在 `middleware.js` 和契约 `envelope.ts` **各有一份** | 需要 gate 检查这层重复;不要再复制第三处 |
| 缺口 G4 | ✅ | R20:ESM 入口在 `app.asar` 内可能解析失败 | E6 命中 `spawn ENOTDIR`;已用 `asarUnpack` + unpacked resolver 缓解并收到打包 sidecar ready |
| 缺口 G5 | ✅ | `package-lock.json` 未与 workspaces 同步 | E1 `npm install` 已确认 workspaces 和 lockfile 解析正常;本次 lockfile 无额外变化 |
| 缺口 G6 | ✅ | M0 六条 spike 结果未回填 | E3–E8 已全部实测并回填;唯一权威结果见 [07 篇](./07-spike.md) §7 |
| 缺口 G7 | ✅ | 04 篇 §2.6 的 ⚠️ 待补登记 注记已过期 | 已关闭:注记改为「已补登(v1.3)」,并说明 `system` topic 现列四个事件、已纳入 `check:api-contract` 的 `EVENT_NAMES` 对账范围 |
| 缺口 G8 | ✅ | 06 篇 §9 风险表缺 R20 | 已关闭:R20 已补入风险登记册,并同步收紧 §2 spike 第 5 条的判定标准 |
| 缺口 G9 | ⏳ | 门禁两项仍是 `todo`(路由表、通道盘点) | M1 起硬化;路由表用 `router.routes()` 对 03 篇 §4,通道盘点对 154。**它打印 `todo` 不算门禁红** |
| 缺口 G10 | ✅ | `tests/backend/state-machine.test.js` 有一处 `it()` 标题笔误 | E9 已改为「6 个状态,17 个 kind」 |
| 缺口 G11 | ⏳ | E3 的 `:memory:` SQLite 探针返回 `journal_mode='memory'` | 由 T35(卡面 [#41 §5](https://github.com/dengyie/OpenPet/issues/41),进度 [#41 §4](https://github.com/dengyie/OpenPet/issues/41)) 用 file-backed WAL 复验并新增 `tests/backend/sqlite-driver.test.js` |
| 缺口 G12 | ⏳ | 03 篇 §3 盘点 7 个 `SERVICE_*` 写通道,§4.1 仅列 6 个对应入口 | 缺少服务配置写入端点 `PUT /service/config`;T09 先按 §4.1 注册现有 10 条健康/服务路由,由 T16 补齐端点与实现后同步契约表 |

---

## 5. 六条 spike 的已完成结果

**E3–E8 已于 macOS / Electron 42.4.0 / Node 24.16.0 实测。** 结果见 [07 篇](./07-spike.md) §7:fork、端口、打包 sidecar 与 safeStorage 通过;前端闸门为预期的 3/4;SQLite WAL 仍由缺口 G11 追踪。

> 📌 **执行细节仍见 [14 交接单](./14-handoff.md) 的 E3–E8 卡**,但本节是状态索引而非待执行清单。完整实测值只维护在 [07 篇](./07-spike.md) §7。

| spike | 结果 | 后续归属 |
| --- | --- | --- |
| 6 `node:sqlite` | [07 篇 §7 第 6 行](./07-spike.md):模块、部分唯一索引与事务通过;`:memory:` 未证明 WAL | 缺口 G11 / T35(卡面 [#41 §5](https://github.com/dengyie/OpenPet/issues/41),进度 [#41 §4](https://github.com/dengyie/OpenPet/issues/41)) |
| 1 fork sidecar | [07 篇 §7 第 1 行](./07-spike.md):ready +145 ms,双向消息与 clean exit 通过 | D1 保持 fork |
| 2 端口与 ready | [07 篇 §7 第 2 行](./07-spike.md):单跑首行 +569 ms;共享 T0 首行 +779 ms;完整链路 ready +86 ms | 窗口创建前并行启动 |
| 5 打包 | [07 篇 §7 第 5 行](./07-spike.md):初始 `spawn ENOTDIR`;`asarUnpack` + unpacked resolver 后 ready、clean exit 0 | R20 已缓解;后端 JS 明文可读 |
| 3 前端闸门 | [07 篇 §7 第 3 行](./07-spike.md):3/4,第 2 条按预期红 | T20(#41 §4) |
| 4 safeStorage | [07 篇 §7 第 4 行](./07-spike.md):sidecar 无 safeStorage;Shell encryption available | ADR-010 保留 |

🚨 **除 spike 1 外,命令前面那个 `ELECTRON_RUN_AS_NODE=1` 不能省。** spike 1 不带是故意的 —— `shell.js` 本身就是 Electron 主进程,由它给子进程设这个变量。

**spike 4 尤其要命**:不带这个变量,你跑的是 Electron 主进程,`require("electron")` 当然拿得到 `safeStorage` —— 你会得到与事实**完全相反**的结论,进而错误地删掉 ADR-010 的 `init` 注入。本表在 v1.1 及以前的版本里,spike 3 与 spike 4 两行漏了这个变量,v1.2 已修。

**维护边界**:结果已经闭环;只有打包、Electron 或协议边界变化时才重跑受影响的 spike。M1–M3 仍按任务卡依赖推进,不能把 M0 证据解读为功能完成。

---

## 6. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-08-15 | 首版:已落地文件的对外接口、待建清单、10 条缺口、spike 状态 |
| v1.1 | 2026-08-15 | 缺口表新增「状态」列,**关闭 G7 与 G8**(04 篇 §2.6 注记已清、06 篇 §9 已补 R20);G4 的去向改为已登记的 R20;G2 补注由 T12 修且 T18/T19 强依赖;§3 待建清单接上 12/13 篇的卡号(T14、T29、T31),并注明 `conversations` 仓储要到 M4 才建 |
| v1.2 | 2026-08-15 | **修掉 §5 命令表里 spike 3、spike 4 缺 `ELECTRON_RUN_AS_NODE=1` 的两行**(这是 [14 篇](./14-handoff.md) §5 登记的第 1 条文档债,危险度高:spike 4 用错解释器会得出相反结论);§5 补执行卡与唯一权威结果表的指针;§4 给 G1/G4/G5/G6/G10 标注对应的 E 卡,G9 补注「打印 `todo` 不算红」 |
| v1.3 | 2026-08-16 | 以 `main` 为基线回填 E1–E10;缺口 G1/G11 改由 T34/T35 对接 #41 §5 卡面与 #41 §4 进度;完成结果替代待执行表,并区分目标 G1–G8 与缺口 G1–G11 |
