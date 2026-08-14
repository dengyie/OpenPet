# 01 · 现状盘点与问题诊断

> 🔍 本篇是分离方案的事实基础。所有体积数据均来自 `dengyie/OpenPet@c56a3f1`(main / v1.0.1-rc.3)真实读取,非估算。

## 1. 代码基线

| 项 | 值 |
| --- | --- |
| 仓库 | `dengyie/OpenPet` |
| 默认分支 | `main` |
| HEAD | `c56a3f1d4736c6dc4960842e447c901299645790` |
| 版本 | 1.0.1(发布通道 v1.0.1-rc.3) |
| 运行时 | Node ≥ 22.12.0、Electron 42、Vite 8、React 19、TypeScript 6 |
| 生产依赖 | 仅 4 个:`grammy`、`sharp`、`yauzl`、`yazl` |

## 2. 体积盘点

### 2.1 根目录入口文件

| 文件 | 体积 | 角色 | 评估 |
| --- | --- | --- | --- |
| `main.js` | 7.3 KB | 主进程入口 | 健康,已下沉到 bootstrap |
| `renderer.js` | 38 KB | 宠物窗口渲染 | 单文件过大,需拆分 |
| `preload.js` | 3.1 KB | 宠物窗口桥 | 合理 |
| `control-center-preload.js` | 19 KB | Control Center 桥 | **过重**,说明前端大量能力靠 preload 直通 |
| `index.html` | 小 | 宠物窗口宿主 | — |
| `package.json` | 10.8 KB | 90+ 个 script | 脚本臃肿,多数为发布证据工具 |

### 2.2 主进程服务层(`src/main/services/`,58 个文件,约 1.1 MB)

这层就是事实上的「后端」。按体积降序(仅列 ≥ 10 KB):

| 文件 | 体积 | 域 | 迁移去向 |
| --- | --- | --- | --- |
| `creator-workflow-service.js` | 165 KB | Creator Studio | 后端 |
| `plugin-service.js` | 103 KB | 插件 | 后端 |
| `ai-talk-service.js` | 80 KB | AI 对话 | 后端 |
| `ai-service.js` | 77 KB | AI Provider | 后端 |
| `image-generation-model-service.js` | 74 KB | 图像生成 | 后端 |
| `ai-talk-store.js` | 56 KB | 对话持久化 | 后端(重写 SQLite) |
| `hatch-pet-agent-service.js` | 42 KB | 孵化 Agent | 后端 |
| `action-service.js` | 36 KB | 动作配置 | 后端(读路径缓存到前端) |
| `pet-pack-service.js` | 32 KB | 宠物包 | 后端 |
| `hatch-pet-sprite-evaluator.js` | 22 KB | 精灵图评估 | 后端 |
| `plugin-install-service.js` | 20 KB | 插件安装 | 后端 |
| `catalog-service.js` | 17 KB | 商店目录 | 后端 |
| `creator-reference-service.js` | 17 KB | 参考图 | 后端 |
| `system-cursor-service.js` | 15 KB | 系统光标 | **主进程**(原生能力) |
| `local-http-service.js` | 14.9 KB | 本地 HTTP | 后端(升级为主服务) |
| `plugin-network-client.js` | 14.2 KB | 插件网络 | 后端 |
| `action-import-service.js` | 13.5 KB | 动作导入 | 后端 |
| `behavior-orchestrator-service.js` | 13.5 KB | 行为编排 | 后端 |
| `zip-archive-utils.js` | 11.8 KB | 归档 | 后端 |
| `hatch-pet-agent-contracts.js` | 10.7 KB | 契约 | `packages/contracts` |
| `creator-studio-default-flow-service.js` | 10.4 KB | 默认流 | 后端 |

关键对比:**`pet-service.js` 仅 3.8 KB**,却是宠物状态的唯一来源。真正「前端需要的东西」很轻,「后端应该拿走的东西」很重。这正是分离成立的根本依据。

### 2.3 IPC 与适配层

| 文件 | 体积 | 评估 |
| --- | --- | --- |
| `src/main/control-center-adapters.js` | **73 KB** | 翻译层而非边界层,职责模糊 |
| `src/main/ipc.js` | 41 KB | 总装配,已部分下沉 |
| `src/main/ipc/` | 13 个注册器 | **已按域切分,可直接映射为路由** |

`src/main/ipc/` 明细:`register-settings-ipc.js` 14 KB、`register-pet-runtime-ipc.js` 11.5 KB、`register-ai-ipc.js` 6.9 KB、`pet-chat-facade.js` 6.5 KB、`register-plugin-ipc.js` 5.3 KB、`pet-settings-adapter.js` 4.9 KB、`pet-chat-state.js` 4.4 KB、`pet-bubble-chat-coordinator.js` 4 KB、`register-creator-ipc.js` 3.6 KB、`register-service-ipc.js` 2.2 KB、`register-catalog-ipc.js` 1.6 KB、`pet-utterance-recorder.js` 1.2 KB、`register-system-ipc.js` 0.4 KB。

### 2.4 前端(`src/control-center/src/`)

| 文件 | 体积 | 评估 |
| --- | --- | --- |
| `api/demo-control-center-api.ts` | **181 KB** | 影子后端,最大架构债 |
| `panes/AiPane.tsx` | **110 KB** | 单文件承担 provider 配置/对话/图像/连接测试 |
| `panes/CreatorPane.tsx` | 67 KB | 需拆分 |
| `styles.css` | 58.8 KB | 未模块化 |
| `panes/ActionsPane.tsx` | 48.5 KB | 需拆分 |
| `panes/PluginsPane.tsx` | 46.5 KB | 需拆分 |
| `panes/PetPane.tsx` | 16.3 KB | 可接受 |
| `panes/CatalogPane.tsx` | 12.3 KB | 可接受 |
| `panes/ServicePane.tsx` | 5.4 KB | 健康 |
| `panes/AboutPane.tsx` | 2.5 KB | 健康 |
| `api/control-center-api.ts` | 4.1 KB | 真正的 API 门面,很薄 —— 好信号 |

### 2.5 共享层(`src/shared/`)

| 文件 | 体积 | 评估 |
| --- | --- | --- |
| `openpet-contracts.ts` | **96.6 KB** | 完整类型契约,分离的最大资产 |
| `cursor-library.ts` / `.js` | 17.8 / 16.6 KB | 存在 JS+TS 双版本,需收拢 |
| `ipc-channels.ts` / `.js` | 8.0 / 8.4 KB | 154 个通道常量,双版本 |
| `pet-hitbox.js` | 2.0 KB | 前端共享 |
| `cursor-style.js` | 1.3 KB | 前端共享 |

> ⚠️ `cursor-library` 与 `ipc-channels` 同时存在 `.js` 和 `.ts` 两份,且体积不一致(17.8 vs 16.6 KB、8.0 vs 8.4 KB)。这是潜在的双源头漂移风险,迁移前必须先收拢为单一源。

## 3. 现状调用链路

```text
渲染进程 (renderer.js / Control Center)
        │  contextBridge
        ▼
 preload.js (3 KB) / control-center-preload.js (19 KB)
        │  ipcRenderer.invoke  × 154 个通道
        ▼
 src/main/ipc.js (41 KB) + src/main/ipc/register-*-ipc.js × 13
        │  直接函数调用
        ▼
 src/main/control-center-adapters.js (73 KB)  ← 参数规整 / 视图拼装
        │
        ▼
 src/main/services/*.js (58 个文件 / 1.1 MB)
        │
        ├─→ provider HTTP (OpenAI 等)
        ├─→ child_process.spawn (插件命令 / 服务)
        ├─→ fs (settings.json / pet-packs / plugins)
        └─→ local-http-service (:port) ← 外部 MCP 客户端
```

**问题:所有重负载都跑在 Electron 主进程。** 主进程同时要负责窗口合成、光标命中测试、宠物位置计算(高频),又要跑 265 秒的图像生成与插件子进程管理。这是宠物卡顿与拖拽不跟手的结构性原因。

## 4. IPC 通道盘点(154 个)

| 域 | 通道数 | 典型通道 | 分离后去向 |
| --- | --- | --- | --- |
| 宠物运行时 `PET_*` | 16 | `pet:get-animations`、`pet:set-position`、`pet:move-by` | 留在 IPC |
| 聊天窗 `PET_CHAT_*` | 8 | `pet-chat:send-message` | 留 IPC(转发后端) |
| 气泡 `PET_BUBBLE_CHAT_*` | 11 | `pet-bubble-chat:drag-to` | 留在 IPC |
| 设置 `SETTINGS_*` | 7 | `settings:get`、`settings:save` | 拆分(下详) |
| 动作 `ACTIONS_*` | 13 | `actions:import-frames`、`actions:update-trigger-rule` | 后端 |
| 宠物包 `PET_PACKS_*` | 9 | `pet-packs:import`、`pet-packs:set-active` | 后端 |
| AI(含 talk/behavior/image/hatch) | 37 | `ai:chat`、`image-generation:check-health` | 后端 |
| 插件 `PLUGINS_*` | 25 | `plugins:install`、`plugins:start-service` | 后端 |
| Creator `CREATOR_*` | 13 | `creator:generate-new-character` | 后端 |
| 本地服务 `SERVICE_*` | 7 | `service:rotate-token` | 后端 |
| 关于 `ABOUT_*` | 2 | `about:check-updates` | 后端 |
| 商店 `CATALOG_*` | 6 | `catalog:install-selection` | 后端 |

**结论:41 个通道属于窗口/原生能力,必须保留 Electron IPC;113 个属于业务管理面,应该迁到 HTTP。** 逐通道的去向明细见 [03 篇 §3](./03-api-contract.md)。

## 5. 五个真实阻碍

### 阻碍一:`demo-control-center-api.ts` 是 181 KB 的影子后端

为了让 Control Center 能脱离 Electron 在浏览器里跑(`npm run dev:control-center`),前端内部模拟了整个后端行为。分离后会形成 **三份业务语义**:真后端、demo mock、组件内隐含假设。任何契约变更要改三处,且三处不一致时测试不会报错。

> 处置:不得保留。改用契约生成的 MSW handler,详见 [05 篇 · 前端改造方案](./05-frontend.md)。

### 阻碍二:`control-center-adapters.js`(73 KB)职责模糊

它在同时做三件事:参数规整(属后端入参校验)、payload 归一化(属后端 DTO)、视图字段拼装(属前端 ViewModel)。从 `register-plugin-ipc.js` 可以看到它导出的 `createPluginListView`、`createPluginViewState`、`createPluginMutationResult`、`createPluginCommandRunResult` 等工厂函数被 IPC 层直接消费。

> 处置:必须先拆分才能迁移。`create*View` → 前端 `packages/contracts` 的 ViewModel 层;入参校验/归一 → 后端中间件。否则整块跟着前端走,前端仍然依赖 Electron 语义。

### 阻碍三:密钥边界从「进程隔离」变成「网络隔离」

现状靠 IPC + 主进程 `secret-service.js`(4.5 KB)保证 API key 不入渲染进程。从 `register-ai-ipc.js` 可见已经做得很对:`AI_SAVE_API_KEY` 只写不读,没有对应的 `GET_API_KEY`。

但分离后多了一个 **本机其他进程可探测的 socket**。现有 `local-http-service.js` 的鉴权已经不错(`crypto.timingSafeEqual` 常量时间比较、强制 loopback 绑定、Bearer + 两个自定义 header),但有两个缺口:

1. `GET /api/status` 在**未鉴权**时仍返回 `service` 状态(host/port/enabled),等于对本机其他进程暴露探测面。
2. token 存在 `settings.json` 里,且 `SERVICE_ROTATE_TOKEN` 靠用户手动触发,没有启动自动轮换。

> 处置:分离后全端点强制鉴权;前后端之间的 token 改为启动时随机生成、仅驻内存、经 Electron IPC 一次性注入,与用户可见的 MCP token 分离。

### 阻碍四:AI 生成是长任务,同步请求模型撑不住

`docs/project-context.json` 记录单次图像生成约 **265 秒**(超时阀值 420 秒)。当前 `CREATOR_GENERATE_NEW_CHARACTER` 等通道是 `ipcMain.handle` 的 await 模式,分离后直接换成 HTTP 会碰到:

- 代理/网关默认超时(多数 60–120 秒)
- 前端刷新即丢失进度
- 无法取消、无法断点继续
- sidecar 重启后任务无痕迹

> 处置:必须任务化重写,不是平移。详见 [04 篇 · 关键子系统改造](./04-subsystems.md) 的 Job 引擎设计。

### 阻碍五:插件运行时深度绑定 Electron

相关文件:`plugin-runtime-bridge-server.js`(8.8 KB)、`plugin-command-bridge-server.js`(3.3 KB)、`plugin-command-runner.js`(7.9 KB)、`local-plugin-runner-client.js`(5.8 KB)、`service-process-tree.js`(3.3 KB)、`plugin-runtime-registry/control/safety/status`。

依赖链是环形的:**插件 → 桥 → PetService → 渲染进程**。桥权限中已包含 `trigger-proposals:write` 与 `model:image-generate`,说明插件可以反向驱动宠物与模型。后端独立后这条链被进程边界切断。

另外,`PLUGINS_OPEN_DASHBOARD` 需要开 Electron 窗口,`PLUGINS_INSPECT_PACKAGE` 需要 `dialog.showOpenDialog`(从 `register-plugin-ipc.js` 可直接看到)—— 这两类能力无法迁到纯 Node 后端。

> 处置:建立双向通道 + 两段式文件选择(主进程弹框拿路径 → 路径 POST 给后端)。详见 [04 篇](./04-subsystems.md)。

## 6. 其他发现的问题

| # | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| I1 | 访问日志写入 settings | `local-http-service.js` 把 logs 存在 `settings.localHttp.logs` | 日志独立存储,否则每条请求触发一次全量设置写盘 |
| I2 | `settings-service.js` 仅 1.6 KB 但是全局写入口 | 全量 `get()` → spread → `save()` | 天然不支持并发,分离前必须定单写者 |
| I3 | `grammy`(Telegram 框架)在主 `dependencies` | `package.json` | 属于 `examples/plugins/im-gateway`,应下沉到插件侧或后端包 |
| I4 | 气泡窗口 54 KB 单文件 | `pet-bubble-chat-window.js` | 与分离无直接关系,但建议同期拆分 |
| I5 | `test:core` 未覆盖 sidecar | `package.json` scripts | 需新增 `tests/backend/` 与进程集成测试 |
| I6 | `build.files` 白名单式打包 | `package.json` | 新增 `services/backend/**` 必须同步进白名单,否则打包后缺文件 |
| I7 | 双版本共享文件 | `cursor-library.js/.ts`、`ipc-channels.js/.ts` | 收拢为单一源并由构建生成 |

## 7. 可复用资产清单

以下现有产物在分离中 **直接复用,不重写**:

- `src/shared/openpet-contracts.ts` —— 抽取为 `packages/contracts` 基底
- `src/main/ipc/register-*-ipc.js` —— 逐个改写为 HTTP 路由模块,结构不变
- `local-http-service.js` 的鉴权/限流/日志/loopback 校验 —— 升级为后端中间件
- `mcp-transport-service.js`(7.2 KB)—— 原封不动搬入后端
- `src/main/bootstrap/create-*-services.js` —— 已有完整 DI,拆分时只需拆工厂集合
- `plugin-runtime-safety.js` / `provider-owner-policy.js` / `ecosystem-policy.js` / `log-safety.js` —— 策略模块无状态,直接搬
- 现有测试与证据脚本体系(`test:core`、`check:docs-drift`、各类 smoke)—— 作为迁移门禁

> ✅ **本篇结论**:分离的工作量集中在三处 —— 拆 `control-center-adapters.js`、建 Job 引擎、做插件反向通道。其余约 70% 是目录平移与路由改写,风险可控。
