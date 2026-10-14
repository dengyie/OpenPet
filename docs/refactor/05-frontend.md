# 05 · 前端改造方案

> 🎨 前端的目标是变轻:从「抽主进程能力的 UI」变成「消费 HTTP 契约的 UI」。量化目标:preload 从 19 KB 降到 5 KB 以下,删除 181 KB 的 demo 后端。
>
> **状态：目标方案 + 当前实现对照。** 本篇的目标形态不能当作已交付清单；当前入口以 `src/control-center/src/api/transport.ts`、`api/client.ts`、`api/backend-client.ts`、`hooks/useSse.ts`、`hooks/useJob.ts` 和各 feature API 为准。任何“已完成”结论都必须有对应测试或门禁证据。

## 1. 前端职责边界

| 保留 | 移除 |
| --- | --- |
| 宠物精灵图渲染与帧调度 | 插件安装与校验逻辑 |
| 拖拽、hitbox、鼠标穿透 | provider 请求与重试策略 |
| 动作列表展示与本地缓存 | 任何密钥相关处理 |
| 表单 UX 校验(即时反馈) | 文件系统读写 |
| 任务进度与日志展示 | 子进程管理 |
| 乐观更新与回滚 | 业务规则判定(如宠物包兼容性) |
| 降级 UI | 存储格式转换 |

> ⚠️ **表单校验可以保留,但后端必须重复校验。** 前端校验仅为了 UX(即时反馈),不能作为安全边界 —— 因为后端现在是一个本机其他进程也能请求的端点。

## 2. API Client 设计

### 2.1 分层

```text
组件 / hooks
   ▼
 features/*/api.ts        ← 域级封装(getPlugins / installPlugin …)
   ▼
 api/client.ts            ← 鉴权、错误解包、重试、超时
   ▼
 api/transport.ts         ← 可插拔:http | mock | ipc-fallback
```

### 2.2 transport 抽象

```ts
// 当前实现（src/control-center/src/api/transport.ts）
export type Transport = {
  request<T>(input: RequestInput): Promise<T>
  stream(topic: string, onEvent: (event: SseEvent) => void): Unsubscribe
  readonly state: 'pending' | 'ready' | 'unavailable'
}

createHttpTransport   // 生产：fetch → 127.0.0.1:<port>，后端未就绪时排队
createMockTransport   // Node 测试/受控 mock；不是完整业务后端
createIpcTransport    // 迁移工具层保留的通用适配器，不代表当前 pane 都有 IPC fallback

// 目标方案（尚未完成）
MSW handlers            // 目标：替换浏览器 dev 运行中的 demo-control-center-api.ts
```

当前 `npm run dev:control-center` 在没有 Electron preload 时仍由各 feature 的
`import.meta.env.DEV` 分支使用 `src/control-center/src/api/demo-control-center-api.ts`
或 feature 内存 adapter；MSW 尚未接管这条路径。不能把 MSW 目标写成当前开发环境的
真实依赖，也不能因为 `createMockTransport()` 存在就宣称 demo API 已删除。

#### 后端未就绪时的排队(必须实现)

后端端口由 `listen(0)` 分配,**首帧渲染时 `openpetShell.getBackend()` 必然返回 `null`**。`httpTransport` 必须把此时的请求排队而不是抛错:

```ts
// httpTransport 内部
let backend = shell.getBackend()          // 可能为 null
const pending: QueuedRequest[] = []       // 上限 50 条 / 10 秒
let timeoutTimer = null                   // 关键:超时靠定时器,不靠下一次请求

function enqueue(req) {
  pending.push(req)
  if (!timeoutTimer) {
    timeoutTimer = setTimeout(rejectAll, MAX_WAIT_MS)   // 首条入队时就启动
  }
}

shell.onBackendChanged((next) => {
  backend = next
  clearTimeout(timeoutTimer); timeoutTimer = null
  flush(pending)                          // 就绪后统一冲刷
})
```

> 🔴 **排队超时必须由定时器驱动,不能只在新请求到达时检查。** [07 篇 §3](./07-spike.md) 的 spike 第 3 条 case 2 已经证实了这个坑:如果只在 `enqueue` 时比较 `Date.now() - firstQueuedAt > MAX_WAIT_MS`,那么当后端一直不就绪、且前端不再发新请求时,队列里的 promise **永远不会 resolve 也不会 reject**,界面卡在 loading 不进降级模式。验收用例:入队 1 条后不再发请求,10 秒后必须自行报 `BACKEND_UNAVAILABLE`。

完整规则见 [03 篇 §1.2](./03-api-contract.md):`null` 是正常初始态而非错误;超过 10 秒未就绪则丢弃队列并进入 `degraded`。这是**每次冷启动都会走到**的路径,不是边缘情况。

> 💡 `createIpcTransport()` 只提供通用适配器。当前已迁移域的生产 caller 直接使用
> `backendClient`；仍保留的 Shell/native 能力通过明确的 preload API 调用。新增域必须
> 先完成 route/domain/bridge 证据，不能把通用 IPC transport 当成未验证的业务兜底。

### 2.3 client 能力

| 能力 | 实现 |
| --- | --- |
| 鉴权 | 自动注入 `Authorization`,token 从 preload 取,不入 localStorage |
| 错误解包 | `{ ok: false }` → throw `ApiError`(带 `code`、`retryable`) |
| 超时 | 默认 15s;Job 创建类 30s;SSE 不设 |
| 重试 | 仅 `retryable: true` 且幂等方法,指数退避最多 2 次 |
| 幂等键 | 写操作自动生成 `Idempotency-Key` |
| requestId | 自动生成并在错误提示里展示(方便用户报障) |
| 401 处理 | 当前 `api/client.ts` 不自动刷新 token；由 Shell/backend 生命周期重新发布 backend 信息，调用方处理 `ApiError` |
| 503 处理 | 当前转换为 `ApiError`/transport state；健康轮询与统一降级横幅仍是目标验收项 |
| 后端未就绪 | `getBackend()` 返 `null` 时请求入队(50 条 / 10 秒上限),`onBackendChanged` 后冲刷;超时则丢弃并进降级 |
| 后端换端口 | `backendTransport` 与 `SseManager` 监听 backend changed；重建连接的代码已存在，具体 pane 是否全量重拉仍需逐域验收 |
| 性能预算 | 切 tab 低于 150 ms、`GET /settings` 低于 30 ms(见 [03 篇 §10](./03-api-contract.md));超标时按该表加缓存或预取 |
| 响应校验 | dev 模式用 `packages/contracts` 的 zod schema 校验响应并在控制台报错;生产构建把 zod tree-shake 掉,前端零体积代价(ADR-016) |

### 2.4 SSE 订阅 hook

```ts
function useSse(topics: string[]) {
  // 1. EventSource 不支持自定义 header,改用 fetch + ReadableStream
  // 2. 断线自动重连,携带 Last-Event-ID
  // 3. 45s 无帧(含心跳)则主动重连
  // 4. 重连退避:1s → 2s → 5s → 10s(上限)
  // 5. 页面隐藏时降频、可见时立即重连并全量重拉：目标行为，当前 SseManager 尚未实现页面可见性策略
}
```

> ⚠️ **不能用浏览器原生 `EventSource`**,因为它不支持自定义请求头,而我们需要 `Authorization: Bearer`。把 token 放 URL query 是不可接受的(会进访问日志)。必须用 `fetch` + `ReadableStream` 自己解 SSE 帧。

### 2.5 `useJob` hook

```ts
const { job, start, cancel, retry } = useJob("image.generate")

// 行为:
// 1. start() → POST 拿 jobId,立即写入本地状态
// 2. 优先听 SSE job.progress
// 3. 当前 useJob 在 SSE 事件到达时重新 GET /jobs/{id}；没有 2s 定时轮询 fallback。
//    “断线后定时轮询”仍是目标验收项，不能写成现状。
// 4. 组件卸载不取消 Job(后端继续跑)
// 5. 重新进入页面 → GET /jobs?status=running 恢复展示
// 6. 刷新页面不丢进度(关键验收点)
```

**全局任务中心**:新增一个常驻的任务面板(右下角或侧边抽屉),展示所有进行中 Job。这是分离后的必需功能 —— 以前任务绑定在面板上,现在任务比页面活得长。

## 3. preload 清零计划

`control-center-preload.js` 从 19 KB 降到 5 KB 以下。最终只保留:

```ts
contextBridge.exposeInMainWorld("openpetShell", {
  // 1. 后端连接信息(唯一获取途径)
  getBackend: () => ({ baseUrl, sessionToken }),
  onBackendChanged: (cb) => …,   // 重启后推新端口/token

  // 2. 原生弹框
  pickFiles: (opts) => Promise<string[] | null>,
  pickDirectory: (opts) => Promise<string | null>,
  showItemInFolder: (path) => void,
  openExternal: (url) => Promise<void>,

  // 3. 窗口控制
  closeWindow: () => void,
  minimizeWindow: () => void,
  openPluginDashboard: (pluginId) => void,

  // 4. 宠物直控(低延迟路径,不经后端)
  pet: { say, playAction, getState, onStateChanged },
})
```

**删除的内容**:所有 `plugins:*`、`ai:*`、`creator:*`、`catalog:*`、`settings:save`、`pet-packs:*`、`actions:*`(除 inspect 弹框)的 invoke 封装。

**验收方式**:新增 `npm run check:preload-size`,超过 5 KB 则 CI 失败。

## 4. Pane 拆分计划

### 4.1 AiPane(110 KB → 5 个文件)

```text
features/ai/
├─ ProviderConfigPanel.tsx      # provider 列表、密钥录入、连接测试
├─ PersonaPanel.tsx             # 人设与记忆
├─ ConversationPanel.tsx        # 对话列表与消息流
├─ BehaviorRulesPanel.tsx       # 行为规则与干跑
├─ ImageGenerationPanel.tsx     # 图像生成(接 useJob)
├─ api.ts                       # 域级 API 封装
└─ AiPane.tsx                   # 仅 tab 导航,目标 < 5 KB
```

### 4.2 其余 pane

| 文件 | 现体积 | 拆分目标 |
| --- | --- | --- |
| `CreatorPane.tsx` | 67 KB | `FlowEditor` + `ReferenceLibrary` + `GenerationQueue` + `ArtifactViewer` |
| `ActionsPane.tsx` | 48.5 KB | `ActionList` + `FrameImporter` + `TriggerRuleEditor` + `ProposalReview` |
| `PluginsPane.tsx` | 46.5 KB | `PluginList` + `PluginDetail` + `PermissionEditor` + `LogViewer` + `Installer` |
| `PetPane.tsx` | 16.3 KB | `PackList` + `PackDetail`(小改) |
| `CatalogPane.tsx` | 12.3 KB | 保持 |
| `ServicePane.tsx` | 5.4 KB | 保持(新增连接状态区) |
| `AboutPane.tsx` | 2.5 KB | 保持 |

**约束**:拆分后单文件不超 400 行。新增 `npm run check:file-size` 守住。

> 📌 **拆分与迁移必须分两步做,不要同时改。** 先在不改数据源的前提下纯拆文件(可用现有测试验证行为不变),再换 transport。两事并行会让 bug 无法定位。

## 5. 删除 demo-control-center-api.ts

### 5.1 为什么不能保留

181 KB 的 mock 会形成第二套业务语义,且不受契约约束。契约变了 mock 不会报错,于是 `dev:control-center` 里能跑通、真环境里坏。

### 5.2 替代方案:MSW + 契约生成

```text
packages/contracts/
├─ api/*.ts              # 请求/响应 schema(唯一真相)
├─ fixtures/*.ts         # 手写的少量真实样本数据
└─ generated/
   ├─ client.ts          # 前端类型安全 client
   └─ msw-handlers.ts    # 自动生成的 mock handler
```

| 对比项 | 旧 demo-api | 新 MSW |
| --- | --- | --- |
| 体积 | 181 KB | 预估 < 15 KB(生成) + fixtures |
| 与契约同步 | 手动,必漂移 | 自动,契约变则重生 |
| 业务逻辑 | 含大量真逻辑 | 仅固定响应 + 少量状态机 |
| 测试可用 | 仅 dev | dev + 单测 + Playwright |
| 错误场景 | 很难造 | `msw` 可一行切 500/503/超时 |

### 5.3 删除时机

**M4 阶段,且必须一次性删完**。不得保留「暂时两边都在」的中间态超过一个迭代。

## 6. 降级 UI 规范

### 6.1 三种连接状态

| 状态 | 触发条件 | UI 表现 |
| --- | --- | --- |
| `connected` | health 正常 + SSE 已连 | 无提示 |
| `connecting` | 启动中或重连中 | 顶部细进度条 + 「正在连接本地服务」 |
| `degraded` | 连续失败或 5xx | 横幅 + 写操作按钮全置灰 |

### 6.2 降级时的组件行为

| 组件类型 | 行为 |
| --- | --- |
| 列表 | 展示最后缓存 + 右上角「数据可能过时」徽标 |
| 写按钮 | `disabled` + tooltip 「本地服务未运行」 |
| 输入表单 | 可编辑但不可提交,不丢用户已输入内容 |
| Job 面板 | 展示「无法获取任务状态」,不清空列表 |
| 宠物相关按钮 | ✅ 仍可用(走 IPC) |

> ✅ **降级时不丢用户输入**。这是容易被忽视的细节:用户可能已经写了一段很长的 prompt,后端此时崩了。表单内容必须保留在本地(sessionStorage),连回来后可直接提交。

## 7. 状态管理与缓存

| 项 | 方案 |
| --- | --- |
| 服务端数据 | `QueryClient` 已在 `app/queryClient.ts` 配置；现有 pane 大量仍用 `useState` + 显式 API reload，尚未全部迁移到 `useQuery` |
| 缓存失效 | `useSse` 会调用 `queryClient.invalidateQueries`，同时现有 pane 自己消费 `lastEventId` 或 Job 结果；因此当前不是单一失效入口，逐域迁移后才可收敛 |
| 乐观更新 | 仅用于开关类(enable/disable),失败回滚 |
| 本地 UI 状态 | 保持现有 `useState`,不引入全局 store |
| 宠物帧缓存 | 内存 + `pet.actions-changed` 失效 |
| 设置 | 单一来源为后端,本地仅做表单草稿 |

> 💡 **不要为了分离引入 Redux/Zustand 等全局 store。** 当前 pane 之间几乎无共享状态,真正需要的是「服务端数据缓存 + SSE 失效」,一个数据获取库就够。引入全局 store 只会多一层造价。

### 7.1 TanStack Query 使用约束(ADR-015)

目标采用 TanStack Query 而不是继续扩展 pane 自己的请求状态，理由是请求去重、乱序响应丢弃、卸载取消和缓存回收都应由一套数据层处理。当前 `QueryClient` 已落地，但迁移尚未完成；不要把目标约束当成所有 pane 的当前实现。

为了不让它退化成第二套状态模型(见 [06 篇](./06-roadmap.md) R19),硬约束四条:

1. `staleTime: Infinity` —— 永不自动过期,什么时候失效完全由 SSE 事件决定。
2. 关闭 `refetchOnWindowFocus` 与 `refetchOnReconnect` —— 桌面应用切窗口极频繁,聚焦重取会反复打后端;且后端就在本机,网络事件没有意义。
3. `retry: false` —— 重试策略统一留在 `api/client.ts`(仅 `retryable` 且幂等方法,指数退避 2 次),不在缓存层再重复一套。
4. 迁移完成后，`useQuery` 只允许出现在 `features/*/` 的 pane 级 hook 中；当前静态验收仍是目标项。

```ts
// app/queryClient.ts —— 全局唯一配置
export const queryClient = new QueryClient({
  defaultOptions: { queries: {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  } },
})

// hooks/useSse.ts —— 目标方案中的统一失效入口（当前仍有 pane 自行 reload）
onEvent((e) => queryClient.invalidateQueries({ queryKey: [e.topic] }))
```

> 💡 目标可以让 `queryKey` 对齐 SSE topic，但现有 pane 仍有本地状态和事件后显式 reload。
> 在某个域完成 Query 迁移并有回归测试前，不能删除该域的显式刷新逻辑。

## 8. 样式与 design-system

| 项 | 现状 | 目标 |
| --- | --- | --- |
| `styles.css` | 58.8 KB 单文件 | 按 feature 拆为 CSS Module |
| `design-system/` | 已存在但未充分使用 | 沉淀 token(颜色、间距、字号、圆角) |
| 降级样式 | 无 | 新增 `.is-degraded` 统一规范 |
| 加载态 | 各自实现 | 统一 `Skeleton` 与 `ProgressBar` 组件 |

样式拆分可以放到 M5,不阻塞分离主线。

## 9. 前端验收清单

| # | 验收项 | 验证方式 |
| --- | --- | --- |
| F1 | `control-center-preload.js` < 5 KB | `check:preload-size` |
| F2 | **目标**：`demo-control-center-api.ts` 已删除 | 文件不存在；当前仍由 dev fallback 使用，删除前必须完成 MSW、真实 dev 启动验证和测试 |
| F3 | 无单文件 > 400 行 | `check:file-size` |
| F4 | 前端代码零 `ipcRenderer` 业务调用 | 静态扫描 |
| F5 | 刷新页面不丢 Job 进度 | Playwright |
| F6 | 后端 kill 后宠物正常 | 手工 + Playwright |
| F7 | 后端重启后前端自动恢复 | Playwright |
| F8 | 降级模式不丢表单输入 | Playwright |
| F9 | SSE 断线自动重连且不丢事件 | 集成测试(Last-Event-ID) |
| F10 | `dev:control-center` 仍可脱离 Electron 运行 | 当前由 demo API/内存 adapter 提供；MSW 替换仍未完成 |
| F11 | 冷启动时后端未就绪,首屏不报错且请求被正确排队后冲刷 | Playwright(人为延迟 sidecar 启动 3 秒) |
| F12 | 后端崩溃重拉换端口后,前端无需刷新即自动恢复 | Playwright(kill 后端) |
| F13 | **目标**：`useQuery` 仅出现在 `features/*/` 的 hook 文件中,组件文件内为零 | 静态扫描；当前 Query 迁移未闭合 |
| F14 | 排队超时由定时器触发:入队 1 条后不再发请求,10 秒必须 reject | 单测(假时钟) |

> 📌 F10 目前证明的是 dev fallback 仍可用，不是 MSW 已交付。删除
> `demo-control-center-api.ts` 前必须先落地契约驱动的 MSW handlers、真实 dev 启动验证和
> 对应测试；在此之前该文件不是可确认的废弃内容。
