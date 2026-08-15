# 13 · M3 任务卡(插件与 Job)

> 🤖 **受众:实现 agent。** 先读 [08 篇](./08-agent-guide.md) 与 [09 篇](./09-repo-state.md)。卡号接在 [12 篇](./12-tasks-m2.md) 之后:T24–T33。

## 0. 这一阶段为什么特别危险

M3 同时动三件事:**子进程、权限、窗口**。三者都是跳进程的,集成测试很难盖全。所以本篇的卡比其他篇多一条硬规则:

> 🔒 **反向通道的任何改动都要当安全变更对待。** 风险 R15(反向通道成为提权通道)的影响级别是**极高**,与数据丢失同级。不确定时选择拒绝,不要选择放行。

另外两件事先核清楚,避免重复实现:

| 06 篇 §5 的说法 | 实际落在哪 |
| --- | --- |
| 「Job 引擎完整实现(队列、状态机、进度、取消、恢复)」 | **已在 M1**:T05 进度、T06 队列、T07 执行器、T08 恢复;状态机已入库 |
| 「插件子进程父进程切换 + 孤儿回收」 | **部分已在 M1**:T13 建了 `orphan-cleanup.js` 骨架;M3 的 T29 负责接真子进程 |

所以 M3 的 Job 部分**只剩写 handler**(T31),不要重建引擎。发现 T05–T08 有缺口就改它们。

## 1. 插件域主体

### T24 · 插件域服务(不包含 HTTP)

**目标** 把 `plugin-service.js`(**103 KB,单体第二大**)搬进后端,只改入口与依赖注入。

**依赖与阻塞** 依赖 T02(jobs 仓库)、T04(logs 仓库)、T11(事件总线)。先读 `src/main/services/plugin-service.js` 与 `src/main/bootstrap/create-plugin-services.js`(3.7 KB,里面已经把依赖关系理好了)。

**建哪个文件** `services/backend/domains/plugins/index.js`、`services/backend/domains/plugins/registry.js`、`services/backend/domains/plugins/lifecycle.js`、`services/backend/domains/plugins/manifest.js`

**精确导出签名**

```js
export function createPluginService({ db, jobs, logs, bridge, dialog, root, userDataDir, logger, now, emit })
// → { list(), get(id), install(source), remove(id), start(id), stop(id),
//     status(id), config(id), setConfig(id, patch), command(id, name, args),
//     syncBundled(), inspectManifest(path) }
```

**验收断言**

- 现有内置插件全部能安装、启动、停止(B1)。
- manifest 不合法 → `PLUGIN_MANIFEST_INVALID` 400;重复启动 → `PLUGIN_ALREADY_RUNNING` 409;未批准的 native 插件 → `PLUGIN_NATIVE_NOT_APPROVED` 403。三个业务码各一条断言。
- `validate:plugin` 与全部插件相关测试通过(B10)。
- 单文件不超 400 行 —— 103 KB 的原文件必须拆,但**只按上面四个文件的职责拆,不重写逻辑**。

**不要做什么** 不要重新设计 manifest 格式。不要在这里起 HTTP(T25 的事)。不要对第三方插件宣称完整沙箱 —— 这是项目约束,文案与代码注释都不得这么写。

### T25 · 插件 HTTP 路由(23 通道)

**目标** `PLUGINS_*` 25 个通道中的 23 个转 HTTP。

**依赖与阻塞** 依赖 T24。

**建哪个文件** `services/backend/routes/plugins.js`、`tests/backend/routes-plugins.test.js`

**精确导出签名**

```js
export function registerPluginRoutes(router, { plugins })
```

**验收断言**

- `router.routes()` 与 [03 篇 §4.7](./03-api-contract.md) 逐行对账。
- **两个通道必须留在 IPC,不得建路由**:`PLUGINS_OPEN_DASHBOARD` 与 `PLUGINS_INSPECT_PACKAGE`。写一条反向断言 —— `routes()` 里包含这两个能力就算失败。原因见 [04 篇 §1.3](./04-subsystems.md):一个要开真窗口,一个要弹文件选择框,两者都只能在 Shell 侧做。
- 25 = 2(留 IPC) + 23(转 HTTP),与 03 篇 §3 的表一致。数字对不上就是漏了或多了。

**不要做什么** 不要为了「统一」把那两个通道也搞成 HTTP。它们不是遗留问题,是**有意保留**的。

## 2. 桥与反向通道

### T26 · plugin-runtime 桥搬入后端

**目标** 把 `plugin-runtime-bridge-server.js` 从主进程搬到后端。

**依赖与阻塞** 依赖 T24、T28(白名单先就位)。

**建哪个文件** `services/backend/bridge/plugin-runtime-server.js`、`tests/backend/plugin-runtime-server.test.js`

**精确导出签名**

```js
export function createPluginRuntimeServer({ shell, plugins, settings, jobs, network, logs, logger, now })
// → { listen(), close(), handleCapability(pluginId, capability, payload) }
```

**能力路由严格按 [04 篇 §1.2](./04-subsystems.md) 的 8 行表**。表里的「是否需要反向通道」一列是关键:只有前三项需要回跳 Shell,后五项在后端内部就能完成。

**验收断言**

- 插件调 `pet:say` 能真的让宠物说话(B2)。
- 插件调**未授权**能力被拒,**且拒绝发生在后端**(B3)。不得依赖 Shell 侧兼职把关。
- 每一项能力各一条断言,共 8 条;再加一条「表外能力名一律拒绝」。
- `network:fetch` 必须走 `bounded-response-body.js`,响应体有上限。

**不要做什么** 不要新增表外的能力名。需要新能力时**先改 04 篇 §1.2 的表,再写代码**。

### T27 · plugin-command 桥搬入后端

**目标** 把 `plugin-command-bridge-server.js` 搬入后端,插件命令改走 Job。

**依赖与阻塞** 依赖 T26、T31(`plugin.command` handler)。

**建哪个文件** `services/backend/bridge/plugin-command-server.js`

**精确导出签名**

```js
export function createPluginCommandServer({ plugins, jobs, logger, now })
// → { listen(), close(), dispatch(pluginId, command, args) }
```

**验收断言**

- 命令并发上限走 T06 的 `plugin-command` 分组(**并发 4**),不在这里另造一个限流器。
- 取消命令 Job 能真止住子进程(B8,`ps` 验证)。

**不要做什么** 不要把两个桥合并成一个。它们的生命周期与权限模型不同,合并后回滚会变得更难。

### T28 · 反向通道完整白名单

**目标** 把 M1 只通 `pet.say` 的骨架撑成完整白名单。

**依赖与阻塞** 依赖 **T12**(修 G2,`dialog.request` 入白名单)。

**建哪个文件** 改 `services/backend/bridge/message-schema.js`、`apps/desktop/src/sidecar/message-handler.js`(T13 已建,CJS)

**验收断言**

- 完整白名单 = `pet.say` / `pet.playAction` / `pet.event` / `dialog.request` / `window.openPluginDashboard`,加上基础消息 `notify` / `tray.setBadge` / `ready` / `degraded` —— 共 **9** 项,与 `packages/contracts` 的 `backendToShellSchema` 逐项相等。
- **白名单之外的消息被丢弃并记日志**,单测覆盖。
- 🔒 **`window.openPluginDashboard` 的窗口参数必须在 Shell 侧硬编码**。后端只能传 `pluginId`。写一条断言:后端传任意 `preload` / `webPreferences` / 文件路径时必须被忽略。这是 04 篇 §1.3 的 🔒 红线,也是 R15 的主防线。
- 信封 `v` 不符 → exit 78 → Shell 重拉,最多 2 次后进降级模式(ADR-011)。

**不要做什么** 不要加「执行后端传来的路径」类能力。不要把白名单做成配置项 —— 可配置的白名单等于没有白名单。

## 3. 进程与日志

### T29 · 子进程父进程切换 + pid 台账

**目标** 插件子进程的父进程从主进程改为后端,并保证**杀 sidecar 后不留孤儿**。

**依赖与阻塞** 依赖 T24、T13(`orphan-cleanup.js` 骨架)。先读 `src/main/services/service-process-tree.js`(3.3 KB)。

**建哪个文件** `services/backend/domains/plugins/process-ledger.js`、改 `apps/desktop/src/sidecar/orphan-cleanup.js`

**精确导出签名**

```js
export const PID_LEDGER_FILE = "pids.json"   // 位于 userData/backend/

export function createProcessLedger({ userDataDir, logger, now })
// → { register(pid, meta), unregister(pid), list(), sweep() }
```

**验收断言**

- 台账落盘在 `userData/backend/pids.json`。启动时读台账,**先校验进程名再杀** —— pid 会被操作系统复用,不校验就可能杀错无关进程。这一条必须有单测。
- 终止顺序**沿用 `service-process-tree.js`**,不重写。
- 手工造孤儿(启插件 → `kill -9` sidecar)→ 下次启动被清(A6 / B9)。
- 台账写入必须是原子的(写临时文件 + rename),否则崩溃时会留下残缺 JSON。

**不要做什么** 不要按 pid 直接 `kill` 而不校进程名。不要把台账放到 SQLite —— 它必须在 db 打开前就可读。

### T30 · 插件日志转 SQLite + SSE

**目标** 插件日志入库并实时推送到面板。

**依赖与阻塞** 依赖 T04(logs 仓库,`PLUGIN_LOG_MAX_PER_PLUGIN = 5_000`)、T11(事件总线)。

**建哪个文件** 改 `services/backend/domains/plugins/index.js`,新增 `tests/backend/plugin-logs.test.js`

**验收断言**

- 写入 `plugin_logs` 表,列名严格照 `001_init.sql`:`plugin_id` / `level` / `message` / `at`。**不要发明 `plugin_name` 之类的列** —— migration 是不可变的,需要新列就加 `002_*.sql`。
- 每插件保留 5000 条,超出按 `at` 升序删。
- 每条日志发 `plugin.log` 事件到 `plugins` topic。**高频日志必须受 T11 的背压保护**(1000 帧上限),溢出时发 `system.events-dropped` 而不是阻塞写入。
- 日志内容过 `log-safety.js` 脉敏后才入库。

**不要做什么** 不要把日志写成同步阻塞调用。不要绕过 `log-safety.js`。

## 4. Job handler 与前端

### T31 · 四个插件类 Job handler

**目标** 把插件的长任务接到 M1 已建的 Job 引擎上。

**依赖与阻塞** 依赖 T06/T07/T24。

**建哪个文件** `services/backend/jobs/handlers/plugin-install.js`、`plugin-install-github.js`、`plugin-command.js`、`plugin-sync-bundled.js`

**精确导出签名**(四个文件同形)

```js
export const kind = "plugin.install"          // 必须是 JOB_KINDS 里的字面量
export function resourceKey(input)            // → "plugin:{id}" 或 null
export async function run(input, ctx)         // ctx = { db, plugins, logger, progress, signal, tmpDir }
```

**验收断言**

- 四个 `kind` 字符串必须在 `jobs/state-machine.js` 的 `JOB_KINDS`(17 个)里;`plugin.install.github` 的 `maxAttempts` 是 **2**,其他三个是 **1**。直接断言 `maxAttemptsFor(kind)`。
- 同一插件并发安装 → `423 LOCKED`(`resourceKey` 生效,靠 `idx_jobs_resource_active` 唯一索引)。
- `signal` 被 abort 后必须在 T07 的 `SIGKILL_DELAY_MS = 2_000` 内真止住子进程。
- 临时文件只得写 `ctx.tmpDir`(`userData/tmp/job-<id>/`),Job 结束必须清理。
- 进入 `finalizing` phase 后不可取消(`UNCANCELABLE_PHASES`),写一条断言返 `JOB_NOT_CANCELABLE` 423。

**不要做什么** 不要在 handler 里直接改 `jobs` 表状态 —— 状态变迁只能走 `assertTransition`。不要新增 `JOB_KINDS` 之外的 kind(会被 `check:api-contract` 拦下)。

### T32 · 前端插件面板 + 全局任务面板

**目标** `PluginsPane`(46.5 KB)改走 HTTP,并新增全局任务面板。

**依赖与阻塞** 依赖 T22(`useJob`)、T25。

**建哪个文件** `apps/control-center/src/features/plugins/api.ts`、`apps/control-center/src/features/jobs/JobPanel.tsx`

**验收断言**

- Job 运行中刷新面板,进度不丢(B6)。
- 图像生成 Job 跑满 265 s 不断链,进度正常(B5)。注意现有超时配置是 420 s。
- 杀后端 → Job 标 `interrupted` 且可重试(B7)。
- 插件 dashboard 窗口能开,且插件停止时自动关(B4)。

**不要做什么** 不要在组件里轮询 Job 状态 —— 进度走 SSE。不要删 `PluginsPane` 的 IPC 分支(M5 才删)。

### T33 · `test:resilience` 门禁

**目标** 把 M3 的弹性要求变成会报错的测试。

**依赖与阻塞** 依赖 T24–T32。

**建哪个文件** `tests/integration/resilience.test.js`,根 `package.json` 加 `test:resilience`

**验收断言**(就是 B7、B8、B9 的自动化版)

- 杀进程:Job 运行中 `kill -9` 后端 → 重启后标 `interrupted` 且 `canRetry` 为真。
- 断 SSE:强关连接 → 前端按 `1 → 2 → 5 → 10` 秒退避重连,且重连后全量失效。
- 超时注入:provider 人为卡 → `PROVIDER_TIMEOUT` 504 且 Job 进 `failed` 而不是挂死。
- 孤儿回收:造孤儿 → 下次启动被清且 `pids.json` 干净。

**不要做什么** 不要用 mock 替代真进程 —— 这组测试的全部价值就在真杀真重拉。

## 5. M3 完成判定

- [ ] T24–T33 全部落地
- [ ] B1–B10 十项验收全部为真(见 [06 篇 §5](./06-roadmap.md))
- [ ] `validate:plugin`、`test:resilience`、以及 M0–M2 的全部门禁全绿
- [ ] `routes()` 与 03 篇 §4.7 对账通过,且 `OPEN_DASHBOARD` / `INSPECT_PACKAGE` **不在**路由表里
- [ ] 反向通道 9 项白名单与契约逐项相等,表外消息被丢弃
- [ ] `ps` 确认无残留插件进程

> ⚠️ **M3 完成后不要直接发布。** 建议自己日常用两周再发(06 篇 §5)。且 M3 建议在**单独分支**做 —— 桥一旦搬迁,回滚需同时回滚桥的位置,比其他域复杂得多。

## 6. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-08-15 | 首版:T24–T33。标注 Job 引擎与孤儿清理骨架已在 M1(T05–T08、T13)完成,M3 只写 handler 与接真子进程,避免重建 |
