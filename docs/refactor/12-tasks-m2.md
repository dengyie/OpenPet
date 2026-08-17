# 12 · M1 补卡与 M2 任务卡(轻域切换)

> v1.1 · 2026-08-16 · 基线分支 `main`
>
> 🤖 **受众:实现 agent。** 先读 [08 篇](./08-agent-guide.md)(硬规则)与 [09 篇](./09-repo-state.md)(仓库现状),再回来领卡。
>
> **卡号连续编在 [10 篇](./10-tasks-m1.md)、[11 篇](./11-tasks-m1-http.md) 之后:** T01–T13 是 M1,本篇是 T14–T23。

## 0. 先读这一条:不要把路由表抄进代码或卡里

[03 篇 §4](./03-api-contract.md) 的路由表是**唯一真相源**。本篇每张卡只写「实现哪一节」+「怎么对账」,不重复表格内容。

理由不是嫌麻烦,是已经吃过一次:13 个通用错误码的 HTTP 状态映射同时存在于 `packages/contracts` 与 `http/middleware.js`,两份就是 09 篇里的缺口 **G3**。**任何一份契约信息在仓库里出现第二次,它就已经开始漂了。**

所以每张卡的验收断言统一长这样:

```js
// tests/backend/routes-<域>.test.js
// 拿 router.routes() 的实际注册结果,与 03 篇 §4.x 表逐行对账
// 多一条、少一条、method 不符、路径参数名不符 —— 都算失败
```

## 1. M1 补卡

> ⚠️ **T14 属于 M1,不属于 M2。** 它在写 10/11 篇时被漏掉了(设计写在 [04 篇 §3.5](./04-subsystems.md),但没落成卡)。**M1 收尾前必须做完**,否则 M2 一发版就踩 R16。

### T14 · JSON → SQLite 迁移

**目标**

把现有 `settings.json` 与 `ai-talk-store.js` 的数据搬进 SQLite,并保证**失败可回滚、回退安装包不丢数据**。这是整个重构里唯一不可逆的一步(风险 R1)。

**依赖与阻塞**

- 依赖 **T01**(`store/migrate.js`,DDL 必须先跑完)。
- 依赖 **T09** 的启动顺序:本模块在 `migrate()` 之后、`bind()` 之前调用。
- 不依赖 conversations 仓库 —— **它到 M4 才建**。本卡直接用 `db.prepare(...)` 写入,不要为此提前造仓库层。

**建哪个文件**

- `services/backend/store/migrate-from-json.js`(新建)
- `tests/backend/migrate-from-json.test.js`(新建)

**精确导出签名**

```js
export const BACKUP_DIR_PREFIX = "backup-"
export const DUAL_WRITE_KINDS = ["conversations", "settings"]

// 判断是否需要迁移:schema_migrations 为空即为首次
export function needsJsonImport(db)

// 六步流程,失败必须整体回滚
export async function migrateFromJson({ db, userDataDir, now, logger, onProgress })
// → { imported: { conversations, messages, settings }, backupDir, skipped }

// 双写:入 SQLite 的同时继续追加写旧 JSON
export function createDualWriter({ userDataDir, logger })
// → { writeConversation, writeSettings, disable, stats }
```

**六步严格按 [04 篇 §3.5](./04-subsystems.md) 实现**:

1. 检测 `schema_migrations` 为空
2. 备份到 `userData/backup-<timestamp>/`,拷入 `settings.json` + ai-talk-store 数据
3. 跑 migration `001..N`,单事务
4. 导入现有对话(ai-talk-store 的现有格式)
5. 验证:**记录数对账** → 写入完成标记
6. 失败:回滚事务 → 删除 db 文件 → **保留备份** → 降级模式 + 弹窗

**验收断言**

- 造一份含 N 条对话、M 条消息的假 ai-talk-store,跑完后 `SELECT count(*)` 必须精确等于 N 与 M。条数不等就抛,不允许「大致导入成功」。
- 第 4 步中途抛错 → db 文件不存在、备份目录完整、`needsJsonImport` 下次仍返 true(可重跑)。
- `migrateFromJson` 幂等:连跑两次,第二次 `skipped: true` 且不产生第二份备份。
- 备份目录用真实文件系统建,不许 mock 掉 —— 这一步的价值全在真落盘。
- `createDualWriter` 写入后,旧 JSON 与 SQLite 两侧读出的内容一致。

**不要做什么**

- **不要删除旧 JSON**,保留一个大版本(R16)。
- 不要把双写做成「开发期一个迭代」—— 必须持续到下一个大版本才关。这是 04 篇 §3.5 里 🚨 那段的全部意思。
- 不要实现 `store.migrate` 这个 Job kind。它保留给 M2 的「手动重跑」入口,本卡只做启动时自动迁移。
- 不要在这里处理密钥。密钥搬迁是 ADR-010 的独立路径,与 JSON 无关。

## 2. M2 任务卡

> 🚦 **进入条件:M1 的 T01–T14 全部落地,`test:backend` 与 `check:api-contract` 全绿。** M2 的每张卡都要用到 M1 的仓库层、事件总线、Job 引擎。

### 2.0 先核对一件事:`SETTINGS_*` 已经做完了

[06 篇 §4](./06-roadmap.md) 把 `SETTINGS_*`(5 个)列为 M2 第 4 项,**但它在 M1 已经完成**:

| 06 篇 §4 的说法 | 实际落在哪 |
| --- | --- |
| 设置存储 + `PATCH` 乐观锁改造 | **T03**(`domains/settings.js`) |
| 5 条设置路由 | **T10**(`routes/settings.js`) |
| `settings.changed { paths }` 事件 | **T10** |

所以 M2 的设置部分**只剩前端切换**(T20–T22 覆盖)。**不要重新实现一遍后端设置域。** 发现 T03/T10 有缺口就改它们,不要另起一个模块。

### T15 · about 域(2 通道)

**目标** 打通「前端 → HTTP → 后端」的第一条真实业务链路。零风险,专门用来暴露鉴权/错误/CORS/编码这类基础问题。

**依赖与阻塞** 依赖 T09(路由注册)。无其他前置,**可与 T16/T17 并行**。

**建哪个文件** `services/backend/routes/about.js`、`services/backend/domains/about.js`、`tests/backend/routes-about.test.js`

**精确导出签名**

```js
// domains/about.js
export function createAboutService({ pkg, runtime, now })
// → { info(), checkUpdates() }

// routes/about.js
export function registerAboutRoutes(router, { about })
```

**验收断言**

- `router.routes()` 与 03 篇 §4.1 中 `ABOUT_*` 对应的行逐行相等。
- `about.check-updates` 是 Job kind(`maxAttempts: 2`),必须返 `202` + `jobId`,不是同步结果。
- 版本号从根 `package.json` 读,**不许硬编码字符串**。

**不要做什么** 不要在这里做自动更新下载。不要新增错误码 —— 这个域只会用到 `NOT_FOUND` 与 `INTERNAL`。

### T16 · service 域(7 通道)

**目标** 把本地 HTTP / MCP 服务的管理搬到后端。**注意这是嵌套结构:后端在管理另一个 HTTP 服务。**

**依赖与阻塞** 依赖 T09。**先读 `src/main/services/local-http-service.js`(14.9 KB)**,它导出 `createLocalHttpService`、`createLocalHttpToken`、`MCP_PROTOCOL_VERSION`,已具备 loopback 校验、Bearer 常量时间比较、1 MB body 上限、MCP session 管理。**照抄它的方法签名,不要重新设计。**

**建哪个文件** `services/backend/routes/service.js`、`services/backend/domains/local-http.js`、`services/backend/mcp/`(搬迁目标目录)、`tests/backend/routes-service.test.js`

**精确导出签名**

```js
export function createLocalHttpManager({ settings, logger, now, secrets })
// → { status(), start(), stop(), rotateToken(), config(), setConfig(patch), diagnostics() }
```

**验收断言**

- `router.routes()` 与 03 篇 §4.1 的 `SERVICE_*` 行对账。09 篇记着这里有个已知缺口:**`PUT /service/config` 在表里存在但没有对应实现,本卡负责补上**。
- 按 **ADR-009 / D7**:对外端口与路径必须**继承原值**。写一个断言把 `/api/pet/say` 与 `/mcp` 的路径字符串钉死 —— 改动它等于违反「不改 MCP 对外行为」这条非目标。
- `POST /service/diagnostics` 的输出里搜不到任何密钥明文(04 篇 §4.1 硬性约束)。

**不要做什么** 不要改 MCP 协议版本。不要把外部 token 与会话 token 合并 —— 双 token 是 M1 的设计,两者用途不同。

### T17 · catalog 域(6 通道)

**目标** 只读为主的目录域,顺带验证 SSE 的第一个非设置类事件 `catalog.refreshed`。

**依赖与阻塞** 依赖 T09、**T11**(事件总线)。

**建哪个文件** `services/backend/routes/catalog.js`、`services/backend/domains/catalog.js`、`tests/backend/routes-catalog.test.js`

**精确导出签名**

```js
export function createCatalogService({ root, db, logger, now, emit })
// → { list(), get(id), refresh(), install(id), status() }
```

**验收断言**

- `router.routes()` 与 03 篇 §4.9 的 6 行对账。
- `catalog.install` 是 Job kind(`maxAttempts: 2`),返 `202`。
- `refresh()` 必须发 `catalog.refreshed`,事件名从 `@openpet/contracts` 取,**不许写字面量**。

**不要做什么** 不要在 catalog 里做插件安装的实质逻辑 —— 那是 M3 的 T24/T25。这里只负责目录元数据。

### T18 · pet-packs 域(8 通道)

**目标** 宠物包的增删查与导入导出。**这是两段式文件选择第一次真正落地。**

**依赖与阻塞**

- 依赖 T09、T11。
- **强依赖 T12**(`dialog.request` 加入 `BACKEND_TO_SHELL_TYPES`,即缺口 G2)。**T12 没落地,本卡做不了** —— 文件选择必须由 Shell 弹框。
- 依赖 T06/T07(队列与执行器):`pet-pack.import` / `pet-pack.export` 是 Job。
- 先读 `src/main/services/pet-pack-service.js`(32 KB),照抄现有方法签名。

**建哪个文件** `services/backend/routes/pet-packs.js`、`services/backend/domains/pet-packs.js`、`tests/backend/routes-pet-packs.test.js`

**精确导出签名**

```js
export function createPetPackService({ root, db, jobs, dialog, logger, now, emit })
// → { list(), get(id), activate(id), remove(id), inspect(path), import(path), export(id, target) }
```

**验收断言**

- `router.routes()` 与 03 篇 §4.5 的 7 行对账(通道数 8 与路由数 7 不等是正常的,表里有说明)。
- 路径安全四条必须逐条有断言,**按 [04 篇 §1.3](./04-subsystems.md) 的规则**:只接受绝对路径且先 `fs.realpath`、拒绝写入 `userData` 与应用目录内部、校验后缀与 zip 魔术字、单文件上限 200 MB、解压防 zip slip(复用 `zip-archive-utils.js`)。
- 传相对路径、符号链接、`../` 逃逸、非 zip 文件 —— 四种输入都必须返 `VALIDATION_FAILED` 400,**且拒绝发生在后端**。
- 同一个包并发导入两次 → 第二次 `423 LOCKED` 且带占用的 `jobId`(`resourceKey = "pet-pack:{id}"`)。
- `dialog.request` 超时 60 s → `PROVIDER_TIMEOUT` 504;**用户取消返回的 `paths: null` 是合法值,不是错误**。
- `pet.pack-activated` 事件发出。

**不要做什么** 不要在后端调 `showOpenDialog` —— sidecar 里没有这个 API,这正是 T12 存在的原因。不要放宽 200 MB 上限。不要改 pet-pack 磁盘格式(非目标)。

### T19 · actions 域(12 通道)

**目标** 动作管理与帧导入。**这是 Job 引擎第一次接真实业务负载。**

**依赖与阻塞** 依赖 T09、T11、T06/T07(`actions.import-frames` 是 Job)、T12(帧导入要弹框)。先读 `src/main/services/action-service.js`(36 KB)。

**建哪个文件** `services/backend/routes/actions.js`、`services/backend/domains/actions.js`、`tests/backend/routes-actions.test.js`

**精确导出签名**

```js
export function createActionService({ root, db, jobs, dialog, logger, now, emit })
// → { list(), get(id), create(input), update(id, patch), remove(id),
//     play(id), submitProposal(input), listProposals(), importFrames(path) }
```

**验收断言**

- `router.routes()` 与 03 篇 §4.4 对账。**注意该表里有一行带 † 脚注,实现前先读表确认它算不算独立路由** —— 别按 13 这个数字硬凑。
- 帧缺失必须返业务码 `ACTION_FRAMES_MISSING` 400,**不是 `VALIDATION_FAILED`**。业务码的 status 必须显式给,不走通用映射。
- `actions.changed` 事件发出(契约里的准确名字从 `@openpet/contracts` 取)。
- 帧导入 Job 的进度必须走 T05 的节流器:`phase` 变化立即发,`percent` 变化 < 1 且 phase 未变则丢弃。

**不要做什么** 不要在动作域里播动画 —— `PetService` 留在 Shell(ADR-003),后端只发反向通道消息。不要动 `cat_anime/` 目录结构(非目标)。

### T20 · 前端 transport 层

**目标** 前端唯一的出网口。所有请求经它,**就绪门禁与请求排队只在这一层实现一次**。

**依赖与阻塞** 无后端依赖,**可与 T15–T19 完全并行**。按 [05 篇 §2.2](./05-frontend.md) 实现。

**建哪个文件** `apps/control-center/src/api/transport.ts`(+ `httpTransport.ts`、`mockTransport.ts`、`ipcTransport.ts`)、`apps/control-center/src/api/__tests__/transport.test.ts`

**精确导出签名**

```ts
export const MAX_QUEUE = 50
export const MAX_WAIT_MS = 10_000

export type Transport = {
  request<T>(input: RequestInput): Promise<T>
  stream(topic: string, onEvent: (e: SseEvent) => void): () => void
  readonly state: "pending" | "ready" | "unavailable"
}

export function createHttpTransport(opts: { getBackend: () => BackendInfo | null }): Transport
export function createMockTransport(opts?: { handlers?: unknown[] }): Transport
export function createIpcTransport(opts: { invoke: IpcInvoke }): Transport
```

**验收断言**

- `getBackend()` 返 `null` 时,请求**入队而不报错**(R12 是「必然发生」级风险)。
- 队列满 50 条 → 最早的请求以 `BACKEND_UNAVAILABLE` 拒绝。
- 首个入队请求等待超过 10 s(`firstQueuedAt` 计时)→ 全队列以 `BACKEND_UNAVAILABLE` 拒绝。
- `ready` 后队列按**入队顺序**冲刷,不许乱序。
- 三个 transport 的对外行为在同一组测试上全部通过 —— 这是 `mockTransport` 能替掉 demo-api 的前提。

**不要做什么** 不要在组件里直接 `fetch`。不要在这一层做缓存 —— 缓存是 T21 的 TanStack Query,两套缓存就是 R19。

### T21 · api client + queryClient

**目标** 契约类型化的 client,以及 TanStack Query 的**全局唯一**配置点。

**依赖与阻塞** 依赖 T20。按 **ADR-015** 的四条硬约束。

**建哪个文件** `apps/control-center/src/api/client.ts`、`apps/control-center/src/app/queryClient.ts`、`apps/control-center/src/features/*/api.ts`

**精确导出签名**

```ts
export function createQueryClient(): QueryClient  // staleTime: Infinity, refetchOnWindowFocus: false
export function createApiClient(transport: Transport): ApiClient
```

**验收断言**

- `createQueryClient()` 的配置里 `staleTime === Infinity` 且 `refetchOnWindowFocus === false`,**写成断言**。
- 请求与响应类型全部来自 `@openpet/contracts` 的 `z.infer`,**前端不许手写 DTO 接口**。
- 加一条 lint 或测试:`useQuery` 只允许出现在 pane 级 hook 文件里(ADR-015 第四条,防 R19)。

**不要做什么** 不要在多处 `new QueryClient()`。不要给 `useQuery` 加 `refetchInterval` —— 数据新鲜度由 SSE 负责,轮询会把 §10 的性能预算吃掉。

### T22 · useSse + useJob

**目标** 缓存失效的**唯一入口**,以及 Job 进度的统一订阅。

**依赖与阻塞** 依赖 T21、**T11**(后端 SSE 端点)。按 [05 篇 §2.4/§2.5](./05-frontend.md)。

**建哪个文件** `apps/control-center/src/hooks/useSse.ts`、`apps/control-center/src/hooks/useJob.ts`

**精确导出签名**

```ts
export function useSse(topics: string[]): { state: SseState; lastEventId: string | null }
export function useJob(jobId: string | null): { job: Job | null; progress: JobProgress | null; cancel: () => void }
```

**验收断言**

- 收到事件后**唯一**的动作是 `invalidateQueries({ queryKey: [e.topic] })`。事件处理里不许直接写缓存。
- 重连退避严格 `1 → 2 → 5 → 10` 秒;45 s 无帧视为断开(心跳 15 s)。
- 订阅的 topic 只能来自契约的 8 个;`system` topic **不受订阅过滤**,始终收。
- 收到 `system.events-dropped` 时必须全量失效 —— 背压丢帧后增量失效是不安全的。
- 页面刷新后 `useJob` 能从 `GET /jobs/{id}` 恢复进度(B6:刷新不丢进度)。

**不要做什么** 不要用 `EventSource` —— 它不能带 `Authorization` 头,必须用 `fetch` + `ReadableStream`。不要在多个组件里各自开 SSE 连接。

### T23 · M2 的两个新门禁

**目标** 把 M2 的两条行为约束变成会报错的脚本。

**依赖与阻塞** 依赖 T20–T22。

**建哪个文件** `tests/backend/degraded.test.js`、`scripts/check-preload-size.mjs`,并在根 `package.json` 加 `test:degraded`、`check:preload-size`

**验收断言**

- `test:degraded`:后端不可用时,`/health` 与 `/service/*` 仍活,其余全部 503;前端降级横幅出现;宠物行为零影响(G5)。**degraded 模式下进程不许退出** —— 这条在 T09 已经定了,这里是把它钉成回归测试。
- `check:preload-size`:读 `control-center-preload.js` 的字节数与阈值比较。M2 阶段**先设宽松阈值**(如 15 KB)并在脚本里写明「M5 收紧到 5 KB」,不要一上来就设 5 KB 让门禁长期红着。
- 两个脚本都必须 `process.exitCode = 1` 而不是抛异常退出,与 `check-api-contract.mjs` 保持一致。

**不要做什么** 不要把阈值写进文档而不写进脚本 —— 只有会报错的检查才是门禁。

## 3. M2 完成判定

全部为真才算 M2 完成:

- [ ] T14–T23 全部落地
- [ ] `check:node`、`test:backend`、`check:api-contract`、`test:degraded`、`check:preload-size` 全绿
- [ ] `router.routes()` 与 03 篇 §4.1、§4.4、§4.5、§4.9 逐行对账通过
- [ ] 40 个通道在前端已无 `ipcRenderer.invoke`(逐个 grep 确认)
- [ ] 每个域的 `transport: "http" | "ipc"` 开关都能切回 `ipc` 并恢复(**IPC 处理器在 M5 前不许删**)
- [ ] 两段式文件导入在 mac 与 Windows 都通过手验
- [ ] 迁移(T14)已用真实数据跑过,且 04 篇 §3.5 的双写仍开着

> ⚠️ **M2 是第一个用户可感知的阶段。** 前面 M0/M1 都是「用户零感知」,M2 一发版,回退路径就受 R16 约束了。发版前确认 T14 的双写真的在写旧 JSON。

## 4. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-08-15 | 首版:T14(M1 补卡,JSON → SQLite 迁移)+ T15–T23(M2 轻域切换与前端数据层);标注 `SETTINGS_*` 已由 T03/T10 完成,避免重复实现 |
