# 11 · M1 任务卡:HTTP、SSE、Shell 侧

> v1.1 · 2026-08-16 · 基线分支 `main`

**前置**:[08 篇 执行手册](./08-agent-guide.md)、[09 篇 仓库现状](./09-repo-state.md)。
**本篇范围**:T09–T13。存储层与 Job 引擎在 [10 篇](./10-tasks-m1.md)。

**依赖图**:T09 是本篇的地基(开库 + 降级模式),它靠 T01、T02、T08;T10、T11 靠 T09;T12 → T13。

---

## T09 · 开库、降级模式与健康路由

**建** `services/backend/routes/health.js` · **改** `services/backend/index.js`(热点文件,只追加) · **依赖** T01 T02 T08

导出:`registerHealthRoutes({ router, runtime, deps })`。

**启动顺序(在 `index.js` 里插入,不要改现有步骤的先后):**

1. 等 `init`(现有)
2. 组装 `userData/backend/settings.json`,构造 `createSettingsStore({ file, logger })` 并注入运行时;`services/backend/domains/settings.js` 已由 T03 完成,本卡不重写它
3. `openDatabase({ file: userDataDir/backend/openpet.db })`
4. `migrate({ db })`
5. `recoverJobs(...)`
6. 绑端口 → 发 `ready`(现有)

**必须:**

- 数据库句柄挂到 `runtime.db`,不要另造全局(09 篇 §2.8)。
- settings 路径组装与 store 注入归 T09;T10 只消费注入后的 `store`,不得自行拼路径或重新实现 T03。
- **降级模式**:第 3 步抛 `MIGRATION_REQUIRED` 时**不要退出进程**。置 `runtime.degraded = true`,继继绑端口,但除 `/health` 与 `/service/*` 以外的路由一律返 `503 MIGRATION_REQUIRED`,并向 Shell 发 `degraded` 消息。理由:用户降版后应用必须能启动到能看见提示的程度,直接退出只会得到一个打不开的应用。
- 开库失败(包括 `NODE_SQLITE_UNAVAILABLE`)同样进降级模式,不要静默继续。
- 路由按 03 篇 §4.1 注册全 **10 条**。已知两个坑:`/health` **需鉴权**(未带 token 返 401,不是 204);§4.1 只映射了 7 个 `SERVICE_*` 通道中的 6 个,`PUT /service/config` 是缺口 —— 先按文档实现 6 个,第 7 个写进 PR 备注并追加到 09 篇 §4。
- 每小时定时器调 T04 的 `cleanup()`;定时器要 `unref()`,否则 sidecar 退不了。

**验收** `tests/backend/health-routes.test.js`:断言 `router.routes()` 恰好覆盖 §4.1 列举的路径(这是把门禁那两项 `todo` 硬化的第一步,见 08 篇 §5);`degraded = true` 时业务路由返 503 而 `/health` 仍可用;无 token 访 `/health` 返 401。

**不要**:不改中间件顺序;不把 `sessionToken` 写进日志或响应体(`ready` 消息除外)。

---

## T10 · 设置路由

**建** `services/backend/routes/settings.js` · **依赖** T03 T09

导出:`registerSettingsRoutes({ router, store, emit })`。按 03 篇 §4.2 的 **5 条**注册。

**必须:**

- `PATCH /api/v1/settings` 体 `{ ifVersion, patch }` → 200 `{ version, changedPaths }`;版本不匹 → 409 `CONFLICT` 且 `details.currentVersion`。
- 写成功后发 `settings.changed`,负载是 `{ paths }` —— 直接用 T03 返回的 `changedPaths`。前端靠它做精确失效(ADR-015:失效的唯一入口是 `useSse`)。
- 写入同值不算变更,不发事件。否则前端会因为一次空保存而全量重拉。

**验收** `tests/backend/settings-routes.test.js`:409 带 `currentVersion`;空 patch 不发事件;非法 patch 路径 → 400 `VALIDATION_FAILED`。

---

## T11 · SSE 推送

**建** `services/backend/events/hub.js` + `services/backend/routes/events.js` · **依赖** T09

导出:`createEventHub({ logger, now })` → `{ subscribe, publish, stats, closeAll }`、`HEARTBEAT_MS = 15_000`、`CLIENT_STALE_MS = 45_000`、`MAX_BUFFERED_FRAMES = 1_000`。

**必须(03 篇 §5):**

- 21 个事件名、8 个 topic。**事件名与 topic 归属一律从 `@openpet/contracts` 取**(`EVENT_NAMES`、`EVENT_TOPIC`、`SSE_TOPICS`),一个字符串也不要在后端重写 —— 重写就是第二份真相(08 篇 H1)。
- 心跳每 15 s 发一行 `: ping`;客户端 45 s 没收到帧就重连(前端侧,05 篇 §2.4 退避 1→2→5→10 s)。
- 背压:单客户端缓冲超 1000 帧 → 丢弃最旧帧并发一条 `system.events-dropped`。**不要无上限缓存** —— 一个卡住的前端能把 sidecar 的内存吐光(R13 预算 < 80 MB)。
- SSE 处理函数要置 `ctx.hijacked = true`,否则 router 会当普通响应收尾(09 篇 §2.2)。
- 按 `topics` 查询参数过滤;未登记的 topic → 400 `VALIDATION_FAILED`。

**验收** `tests/backend/event-hub.test.js`(假 `now` + 假 sink,不起真 HTTP):超过 1000 帧后丢旧帧且发出 `system.events-dropped`;心跳间隔正确;topic 过滤只派发订阅的;断言 21 个事件名全部能查到归属 topic 且 topic 都在 8 个之内。

---

## T12 · 补齐 `dialog.request`(缺口 G2)

**改** `services/backend/bridge/message-schema.js`、`services/backend/bridge/shell-client.js` · **依赖** 无

**背景**:契约 `backendToShellSchema` 有 **9** 类消息,而后端 `BACKEND_TO_SHELL_TYPES` 只有 **8** 类,少 `dialog.request`。后果是后端根本没法请 Shell 弹文件/目录选择框,而插件安装、导入帧、宠物包导入都需要它。

**必须:**

- `BACKEND_TO_SHELL_TYPES` 追加 `dialog.request`,字段形状照契约:`{ requestId, mode: "file" | "directory" }`。
- 走 `shell-client` 的 `request` 分支:相关性**复用同一个 envelope `id`**,没有 `replyTo`(09 篇 §2.4)。
- 超过 `DIALOG_RESULT_TIMEOUT_MS`(60 s)未收到 `dialog.result` → 丢弃并向调用方抛 `PROVIDER_TIMEOUT`(504)。用户可能把对话框摆在那里不理,悬着的 Promise 会泄漏。
- `dialog.result` 的 `paths` 可以是 `null`(用户取消),这不是错误,不要抛异常。

**验收** `tests/backend/bridge-dialog.test.js`:白名单长度为 9 且包含 `dialog.request`;往返拿到同一 `id`;假 `now` 推过 60 s → `PROVIDER_TIMEOUT`/504;`paths: null` 正常返回。

**不要**:不要顺手改 `SHELL_TO_BACKEND_TYPES`(它的 6 类与契约已一致);不要把对话框逻辑写进后端(弹框是 Shell 的事)。

---

## T13 · Shell 侧消息处理与孤儿清理

**建** `apps/desktop/src/sidecar/message-handler.js`、`apps/desktop/src/sidecar/orphan-cleanup.js` · **依赖** T12

两个文件都是 **CJS**(主进程 `require`,同 `spawn.js`)。

导出:`createMessageHandler({ dialog, petService, logger, send })` → `{ handle }`;`cleanupOrphans({ file, isAlive, kill, logger })` → `{ checked, killed }`。

**必须:**

- `handle` 处理后端发来的 9 类消息;`dialog.request` → Electron 对话框 → 回 `dialog.result`(带回同一 `requestId`)。
- 未知 `type` 记 warn 并丢弃,**不要崩** —— 新版后端配旧版 Shell 时这是正常情况(版本不兼容由 `v` 字段和 exit 78 处理,不靠 type)。
- 孤儿清理读写 `userData/backend/pids.json`:启动时先杀上一次没收尾的 sidecar(R2 孤儿进程),再启新的。`isAlive` 与 `kill` 必须**注入**,这样台账逻辑能在裸 node 下测。
- 只杀自己记过的 pid,且杀前比对启动时间/进程名 —— pid 会被系统复用,直接 kill 可能误杀无关进程。

**验收** `tests/backend/orphan-cleanup.test.js`(全注入,不碰真进程):台账里已死的 pid 不被 kill 但被清出台账;活的被 kill;台账文件不存在或是坏 JSON 时不抛异常(启动路径上不能因为一个垃圾文件就启不了)。

**注**:`handle` 里真正调 Electron `dialog` 的部分无法在裸 node 下测,把它隔在注入的 `dialog` 对象后面,测试用假对象;真实路径由 spike 1 覆盖。

---

## 完成 M1 的判定

T01–T13 全部合入基线后,下面三条必须全绿:

```bash
npm run check:node
npm run test:backend
npm run check:api-contract
```

另外两个硬标准(06 篇 §8 门禁矩阵):`router.routes()` 已能与 03 篇 §4.1、§4.2 对账(把门禁里的 `todo` 改成硬检查);降级模式有测试覆盖(`test:degraded` 的雏形)。

M0 六条 spike 已全部实测并回填(09 篇 §5)。T01–T13 的运行时依赖仍须隔在 seam 后面,并在裸 node 下完整验收。

---

## 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-08-15 | 首版:T09–T13(开库与降级模式、设置路由、SSE、dialog.request、Shell 侧消息与孤儿清理) |
