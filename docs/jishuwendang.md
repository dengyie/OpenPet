# OpenPet Pet Platform — 技术文档

> Electron 桌面宠物平台，支持精灵图动画、AI 聊天、可扩展的 plugin/pet-pack 系统与本地 HTTP API  
> **项目状态：v1.0 产品化基线完成；当前版本 v1.0.1-rc.1 用于 OpenPet 改名与升级兼容验证；macOS 分发基线已完成，Windows 打包/CI/签名策略/冒烟证据、报告、runbook 与 collector/证据包校验/summary/archive-manifest、desktop picker smoke evidence 工具基线已落地但尚未 release-ready**

---

## 1. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | ^42.4.0 | 桌面窗口框架 |
| React + Vite | ^19.2 / ^8.0 | Control Center UI |
| sharp | ^0.34.5 | 精灵图合成（开发时） |
| Node 原生 test runner | — | Service / release / IPC / example plugin / plugin submission / desktop picker evidence 测试框架（282 个测试） |
| Playwright | ^1.60 | Control Center UI 回归测试（9 个测试） |
| HTML / CSS / JS | — | 宠物窗口渲染层 UI 与动画 |

### 核心能力总览

**平台特性**：
- ✅ Service 层架构：19 个 service，职责清晰，EventBus 协调
- ✅ Pet pack 运行时：manifest schema + loader + importer + catalog
- ✅ Control Center：Vite + React，7 个 Tab（从 1364 行重构为 62 行），并有 Playwright UI 回归基线
- ✅ AI 集成：OpenAI-compatible，API Key 隔离，结构化行为编排
- ✅ 插件系统：权限白名单 + 隔离 runner + SDK + catalog + blocklist
- ✅ HTTP API + MCP：loopback only，token-gated，默认关闭
- ✅ macOS 分发流程：electron-builder + GitHub Actions + 更新检查；Windows 打包/CI/平台化更新资产/签名策略护栏/冒烟证据门禁、pending 报告/runbook/collector 产物、证据包校验、summary/archive-manifest、报告填写工具和 desktop picker smoke evidence 工具链已完成，真实签名产物验证、packaged picker 真实证据与 Windows 冒烟待补齐

**质量指标**：
- ✅ 282/282 Node 测试通过（service / release / 示例插件 / 插件提交校验、审核包与 PR packet 门禁覆盖）
- ✅ 9/9 Control Center Playwright UI 测试通过（shell / tab / Pet / About 基础交互，Pet / AI / Service 保存配置流程，Catalog 安装/更新流程，Service MCP session 管理，手动插件包安装 review）
- ✅ 41 个测试文件（恶意输入、示例插件、插件提交校验、审核包与 PR packet、主进程 IPC 与 release 证据门禁/报告生成/填写/runbook、collector、证据包校验、summary、archive-manifest 与 desktop picker smoke evidence 工具测试完整）
- ✅ 架构质量：依赖注入 + 事件驱动 + 不可变状态 + 安全默认

详见 [project-status-review.md](./project-status-review.md) 全面评估报告。

---

## 2. 项目结构

```
openpet/
├── main.js                        # Electron 主进程入口,组装所有 service
├── preload.js                     # 宠物窗口预加载脚本（contextBridge）
├── renderer.js                    # 宠物窗口渲染逻辑（动画、拖拽、散步）
├── index.html                     # 宠物窗口 HTML
├── control-center-preload.js      # Control Center 预加载脚本
├── .github/workflows/ci.yml       # CI 验证工作流
├── scripts/
│   ├── generate-sprites.js        # 精灵图生成脚本（CLI 入口）
│   └── validate-plugin-package.js # 插件包提交前校验 CLI
├── src/
│   ├── main/
│   │   ├── ipc.js                 # 所有 IPC handler 注册（依赖注入）
│   │   ├── window.js              # 窗口创建（宠物窗口 + Control Center）
│   │   ├── screen.js              # 屏幕工作区边界钳制与状态检测
│   │   ├── settings.js            # 设置磁盘读写 + 默认值 + macOS 登录项
│   │   ├── runtime/
│   │   │   └── runtime-state.js   # 不可变 snapshot + 订阅
│   │   ├── pet-pack/
│   │   │   ├── schema.js          # pet.json manifest 归一化
│   │   │   ├── loader.js          # 从目录加载 pet pack / 包装 legacy 配置
│   │   │   └── importer.js        # 从 actions 创建 pet pack manifest
│   │   ├── plugins/
│   │   │   ├── manifest.js        # 插件 manifest 归一化 + 权限白名单
│   │   │   └── official/
│   │   │       └── basic-behavior.js  # 官方 Basic Behavior 插件
│   │   └── services/
│   │       ├── event-bus.js       # 进程内 pub/sub 事件总线
│   │       ├── settings-service.js    # 设置读写 + 预览 + 变更通知
│   │       ├── pet-service.js     # 唯一宠物状态源（say/playAction/setEvent）
│   │       ├── action-service.js  # 动作配置读取,封装 pet pack 转换
│   │       ├── pet-pack-service.js # Pet pack 检查、导入、启用、删除
│   │       ├── action-import-service.js  # 动作帧文件夹导入、配置更新、删除
│   │       ├── sprite-generator.js    # 精灵图生成 + 帧文件夹检验
│   │       ├── ai-service.js      # provider-agnostic AI 聊天与持久会话
│   │       ├── ai-action-orchestrator.js # AI 回复语义匹配动作
│   │       ├── behavior-orchestrator-service.js # 结构化 AI 行为规则与 dry-run
│   │       ├── secret-service.js  # API Key 安全存储（0600 权限）
│   │       ├── plugin-install-service.js # 插件安装审查、签名/hash、更新/卸载
│   │       ├── plugin-service.js  # 插件发现、启用/禁用、配置保存、私有存储、命令运行、隔离 runner、运行日志
│   │       ├── local-http-service.js  # 本地 loopback HTTP API
│   │       ├── mcp-transport-service.js # MCP session、schema 与 stream handshake
│   │       ├── catalog-service.js # 生态 catalog 下载、hash 校验、安装桥接
│   │       ├── ecosystem-policy.js # pluginId / packId / sha256 blocklist 策略
│   │       └── about-service.js    # 版本与更新检查状态
│   ├── control-center/
│   │   ├── index.html
│   │   ├── vite.config.js
│   │   └── src/
│   │       ├── main.jsx           # React root 挂载
│   │       ├── App.jsx            # Control Center shell / tabs
│   │       ├── api/               # preload API facade + demo fallback
│   │       ├── components/        # 共享 UI 控件
│   │       ├── hooks/             # 各 pane 数据加载与操作逻辑
│   │       ├── lib/               # 默认值、格式化、下载 helper
│   │       ├── panes/             # Pet / Actions / AI / Plugins / Catalog / Service / About
│   │       └── styles.css         # 样式
│   └── shared/
│       └── ipc-channels.js        # 所有 IPC 通道名常量（主进程侧）
├── tests/                         # Node 原生 test runner 测试
│   ├── services/                  # 18 个 service 测试文件
│   ├── pet-pack/                  # 3 个 pet-pack 测试文件
│   ├── plugins/                   # 1 个 plugin 测试文件
│   ├── examples/                  # 示例插件 install/run 覆盖
│   ├── scripts/                   # CLI 工具测试
│   └── release/                   # Windows release evidence / report 工具测试
├── examples/
│   └── plugins/
│       ├── focus-timer/           # Focus Timer 本地插件示例（manifest/config/schema/entry/README）
│       ├── weather-status/        # Weather Status 本地插件示例（network allowlist/storage/pet speech）
│       └── rss-reader/            # RSS Reader 本地插件示例（public feed/network/storage/pet speech）
├── cat_anime/
│   ├── flames/                    # 原始帧图片（按动作分文件夹）
│   │   ├── bai_no_bg/             # 待机动作（16 帧）
│   │   └── eat_no_bg/             # 喂食动作（16 帧）
│   ├── sprites/                   # 生成的精灵图 PNG
│   │   ├── bai_no_bg.png
│   │   └── eat_no_bg.png
│   └── animations.json            # 动作配置（自动生成）
├── dist/control-center/           # Control Center 构建产物（由 vite build 生成）
├── docs/
│   ├── jishuwendang.md            # 本文件
│   ├── plugin-development.md      # 插件开发指南
│   ├── pet-platform-development-plan.md  # 平台开发计划（6 个 Phase，已基本完成）
│   └── HANDOFF.md                 # 项目交接文档
└── package.json
```

---

## 3. 架构设计

### 3.1 进程模型

```
┌──────────────────────────────────────────────────────┐
│                     Main Process                     │
│  main.js 组装所有 service                            │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │  Service Layer                              │     │
│  │  EventBus → SettingsService → ActionService │     │
│  │       ↓                                    │     │
│  │  PetService (唯一状态源)                    │     │
│  │       ↓           ↓          ↓              │     │
│  │  AiService    PluginService  LocalHttpService│    │
│  │  SecretService  CatalogService  PetPackService│   │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  ┌────────────┐         ┌────────────────────────┐   │
│  │ Window Mgmt │         │ IPC Handlers           │   │
│  │ - petWindow │         │ (ipc.js, 共享通道常量) │   │
│  │ - Control   │         │ 依赖注入各 service     │   │
│  │   Center    │         └────────────────────────┘   │
│  └────────────┘                                      │
└──────────────┬───────────────────────────────────────┘
               │ contextBridge / IPC
    ┌──────────┴──────────┐
    │                     │
┌───┴──────────────┐ ┌───┴──────────────────────┐
│ Renderer Process │ │ Control Center           │
│ (宠物窗口)        │ │ (React WebView)          │
│                  │ │                          │
│ renderer.js      │ │ main.jsx + styles.css    │
│ index.html       │ │ Vite build → dist/       │
│ preload.js       │ │ control-center-preload.js│
│                  │ │                          │
│ Pet API: say /   │ │ Pet / Actions / AI /     │
│ playAction /     │ │ Plugins / Catalog /      │
│ onSettingsChanged│ │ Service / About 页面     │
└──────────────────┘ └──────────────────────────┘
```

### 3.2 数据流规则

1. **PetService 是唯一状态源** — 所有 pet 操作（say/action/event）必须经过 PetService，渲染层只负责显示
2. **API Key 隔离** — 存储在 secrets.json（0600 权限），renderer 和插件不可见明文
3. **Control Center 内置** — 通过 Electron IPC 调用主进程 service，不通过网络暴露
4. **插件权限白名单** — 第三方 JS 只通过隔离 runner 与受限 SDK 执行，不能访问 Node/Electron
5. **精灵图自动生成** — `npm run generate-sprites` 或通过 action-import-service 在 UI 中导入新动作帧文件夹

---

## 4. 核心模块详解

### 4.1 主进程 `main.js`

**职责：** 应用生命周期（启动、退出、单实例锁、macOS Dock 激活）+ 组装所有 service 并注入依赖。

**组装顺序：**
```
EventBus → SettingsService → ActionService → PetService
    → SecretService → AiService
    → LocalHttpService
    → ActionImportService
    → PluginService
    → IPC Handlers
    → Window Creation
```

**单实例锁：** 确保同一时间只有一个桌面宠物在运行。

**屏幕边界限制：** 拖拽和散步时,窗口坐标被限制在当前屏幕工作区内。

**设置持久化：** OpenPet 启动时会将 Electron `userData` 固定到旧版 `app.getPath('appData')/ibot` 目录，确保改名升级后继续读取原有数据。设置保存在该目录下的 `settings.json`，包含 scale、walkSpeed、walkDuration、bubbleDuration、autoStart、ai、plugins、localHttp 配置。此兼容策略由 `src/main/user-data-path.js` 在 service 初始化前执行。

### 4.2 IPC 通道一览

**宠物窗口通道：**

| 通道 | 方向 | 类型 | 说明 |
|------|------|------|------|
| `pet:get-animations` | 渲染→主 | invoke | 返回动作配置 |
| `pet:animations-changed` | 主→渲染 | send | 推送动作变更 |
| `pet:get-bounds` | 渲染→主 | invoke | 返回窗口位置/尺寸 |
| `pet:get-movement-state` | 渲染→主 | invoke | 返回是否贴近左右边界 |
| `pet:set-position` | 渲染→主 | send | 拖拽时设置窗口位置 |
| `pet:move-by` | 渲染→主 | invoke | 散步增量移动 |
| `pet:say` | 主→渲染 | send | 推送气泡消息 |
| `pet:play-action` | 主→渲染 | send | 推送动作播放指令 |
| `pet:quit` | 渲染→主 | send | 退出应用 |

**设置通道：**

| 通道 | 方向 | 类型 | 说明 |
|------|------|------|------|
| `settings:open` | 渲染→主 | send | 打开 Control Center |
| `settings:get` | CC→主 | invoke | 读取当前设置 |
| `settings:save` | CC→主 | invoke | 保存设置 |
| `settings:preview-scale` | CC→主 | send | 实时预览缩放 |
| `settings:close` | CC→主 | send | 关闭 Control Center |
| `settings:changed` | 主→渲染 | send | 推送设置变更 |

**动作管理通道：**

| 通道 | 方向 | 类型 | 说明 |
|------|------|------|------|
| `actions:get` | CC→主 | invoke | 获取动作列表（含预览） |
| `actions:inspect-frames` | CC→主 | invoke | 选择并检查动作帧文件夹，renderer 只拿 selectionId 和检查报告 |
| `actions:reinspect-frames` | CC→主 | invoke | 用 selectionId 重新检查当前帧文件夹 |
| `actions:clear-frame-selection` | CC→主 | invoke | 清除主进程里的待导入文件夹选择 |
| `actions:import-frames` | CC→主 | invoke | 确认导入已检查通过的动作帧文件夹 |
| `actions:save-config` | CC→主 | invoke | 保存动作配置 |
| `actions:delete` | CC→主 | invoke | 删除动作 |
| `pet-packs:list` | CC→主 | invoke | 列出内置和已安装 Pet pack |
| `pet-packs:inspect-directory` | CC→主 | invoke | 选择并检查 Pet pack 目录 |
| `pet-packs:clear-selection` | CC→主 | invoke | 清除待导入 Pet pack 选择 |
| `pet-packs:import` | CC→主 | invoke | 导入已检查通过的 Pet pack |
| `pet-packs:set-active` | CC→主 | invoke | 启用指定 Pet pack 并刷新宠物动作 |
| `pet-packs:remove` | CC→主 | invoke | 删除非 active 用户 Pet pack |

**AI 通道：**

| 通道 | 方向 | 类型 | 说明 |
|------|------|------|------|
| `ai:get-config` | CC→主 | invoke | 获取 AI 配置（不含明文 key） |
| `ai:save-config` | CC→主 | invoke | 保存 AI 配置 |
| `ai:save-api-key` | CC→主 | invoke | 保存 API Key 到 secret store |
| `ai:test-connection` | CC→主 | invoke | 测试 AI provider 连接 |
| `ai:get-conversation` | CC→主 | invoke | 读取指定 AI 会话历史 |
| `ai:chat` | CC→主 | invoke | 发送聊天消息 |

**插件 & 服务通道：**

| 通道 | 方向 | 类型 | 说明 |
|------|------|------|------|
| `plugins:list` | CC→主 | invoke | 列出所有插件 |
| `plugins:set-enabled` | CC→主 | invoke | 启用/禁用插件 |
| `plugins:save-config` | CC→主 | invoke | 保存插件 schema 配置 |
| `plugins:run-command` | CC→主 | invoke | 运行插件命令 |
| `plugins:get-logs` | CC→主 | invoke | 获取插件运行日志 |
| `plugins:clear-logs` | CC→主 | invoke | 清空插件运行日志 |
| `service:get-status` | CC→主 | invoke | 获取本地 HTTP 服务状态与访问令牌配置 |
| `service:save-config` | CC→主 | invoke | 保存本地 HTTP 服务配置；运行时启动/停止成功后才持久化 |
| `service:get-logs` | CC→主 | invoke | 获取本地 HTTP 访问日志 |
| `service:export-logs` | CC→主 | invoke | 导出本地 HTTP 访问日志 |
| `service:clear-logs` | CC→主 | invoke | 清空本地 HTTP 访问日志 |
| `service:rotate-token` | CC→主 | invoke | 轮换本地 HTTP 访问令牌 |

### 4.3 预加载脚本 `preload.js`

通过 `contextBridge.exposeInMainWorld` 暴露安全的 `window.petAPI` 接口，支持：
- 动画：`getAnimations()`、`playAction()`
- 移动：`getBounds()`、`getMovementState()`、`setPosition()`、`moveBy()`
- 设置：`onSettingsChanged()`、`onSay()`、`onPlayAction()`
- 控制：`quit()`、`openSettings()`

### 4.4 宠物渲染进程 `renderer.js`

**状态管理：** 所有动画、散步、拖拽状态集中在 `state` 对象中，通过定时器驱动更新。

**精灵图动画：**
- 使用 CSS `background-image` + `background-position-x` 偏移实现逐帧播放
- `setAction(action)` 切换动作时，根据帧宽计算显示尺寸
- 帧显示最大尺寸 260×260px，超出按比例缩放

**散步系统：** 每 40ms tick，1.2% 概率随机掉头，自动停止定时器。

**交互：** pointer 事件驱动拖拽（区分拖拽/点击），双击切换散步，`pet:say` / `pet:play-action` 监听实现外部触发的动作和气泡。

### 4.5 Control Center

React + Vite 构建的 Web 应用，嵌入 Electron BrowserWindow（900×640px, 可调整大小）。入口 `main.jsx` 只挂载 root，`App.jsx` 管 shell/tab，各页面在 `panes/` 中，数据加载和保存动作在 `hooks/` 中。包含 7 个 Tab 页面：
- **Pet**：缩放、散步速度、散步时长、气泡时长、开机自启
- **Actions**：动作列表、导入帧文件夹、删除、设置默认/点击动作、Pet pack 导入/启用/删除
- **AI**：provider 配置、API Key、连接测试、聊天窗口
- **Plugins**：插件列表、启用/禁用、运行命令、运行日志/错误面板
- **Catalog**：插件 / pet pack 目录浏览、安装/更新、权限审查、blocklist 管理
- **Service**：本地 HTTP 服务启停、端口配置、访问令牌、MCP endpoint、访问日志
- **About**：版本信息、运行环境、更新检查

### 4.6 Service 层

**EventBus（23 行）：** 进程内 pub/sub，所有 service 通过它解耦通信。

**SettingsService：** 设置读写 + 预览 + 变更通知，并通过注入的 side effects 同步 macOS 登录项等宿主状态。

**PetService（68 行）：** 唯一宠物状态源，提供 `say()`、`playAction()`、`setEvent()` 统一接口，AI 和插件通过它触发气泡和动作。

**ActionService：** 动作配置读取，封装 pet pack 到旧动画配置的转换。接入 `PetPackService` 后会优先读取 active pack，并按 pack root 生成预览 URL。

**PetPackService：** 管理内置 legacy pack 与用户安装 pack。用户包安装在 `userData/pet-packs/<pack-id>/`，导入前校验 `pet.json`、safe id、safe relative sprite path 和 sprite 文件存在性；禁止覆盖/删除内置 `legacy-cat`，禁止删除 active pack。

**AiService：** provider-agnostic AI 聊天，OpenAI-compatible 实现。请求带 timeout，conversation history 持久化在 `settings.ai.conversations`，并限制单会话历史与总会话数。AI 配置接口不返回 conversation history。

**AI Action Orchestrator：** 对 AI 回复做轻量语义匹配，按动作 id/label/kind 触发 `PetService.playAction()`；默认忽略 idle，避免普通回复误触发待机动作。

**SecretService（58 行）：** API Key 安全存储（0600 权限），renderer 不可见明文。

**PluginService：** 插件发现、启用/禁用、配置保存、私有存储、命令运行。本地插件通过短生命周期子进程 runner 执行，runner 启用 Node permission model，只放行 runner 与插件入口文件读取；入口 `main` 必须是插件目录内的安全相对 JS 路径。`configSchema` 支持 string/number/boolean/enum/default 动态表单并保存到 `settings.plugins.config`；声明 `storage` 权限的插件可通过 `ctx.storage.get/set/remove/clear()` 使用 `settings.plugins.storage` 中的插件私有 JSON 数据，storage key 受限且写入前校验 64KB/插件与 16KB/value 配额；SDK 还暴露只读 `ctx.config.get()`，以及带权限校验的 `ctx.pet.say()`、`ctx.pet.playAction()`、`ctx.pet.setEvent()`、`ctx.ai.chat()`、`ctx.network.fetch()` 和 `ctx.commands.register()`。AI 调用只走主进程 `AiService`，API Key 不进入插件进程；网络调用只允许 manifest `network.allowlist` 中的 HTTPS host，并拒绝敏感 header。`examples/plugins/focus-timer/` 提供已纳入测试的本地插件示例，覆盖 manifest、config schema、私有 storage 和 `ctx.pet.say()` 的基础开发路径。服务维护最多 200 条持久运行日志供 Control Center 筛选、导出和清空；插件列表只展示私有存储用量，并提供清理入口，不暴露存储内容。

**LocalHttpService：** 本地 loopback HTTP API（status/say/action/event）与 `POST /mcp` JSON-RPC bridge。服务默认关闭，只允许 loopback；mutating endpoint 必须带 `Authorization: Bearer <token>` 或 `X-OpenPet-Token`，未鉴权 status 只返回 runtime 状态。同 host/port 保存时原地更新 token/config，换端口失败时保留旧 server。访问日志持久化在 `settings.localHttp.logs` 且不记录 token；Control Center 支持刷新、JSON/CSV 导出和清空。MCP bridge 支持 `openpet.status`、`openpet.say`、`openpet.play_action`、`openpet.set_event`，必须先用 token initialize 获取 `Mcp-Session-Id`，token 轮换会清空 session。为升级兼容，旧 `X-ibot-token` header 与 `ibot.*` MCP tool 名仍可使用。

**ActionImportService：** 动作帧文件夹导入、配置更新、删除。删除动作时服务层禁止删除最后一个有效动作，并在 regenerate 周围使用备份/恢复流程。

**SpriteGenerator：** 精灵图生成 + 帧文件夹检验（`inspectFrameFolder` + `readFrameMetadata`）。

### 4.7 Control Center 构建产物

Control Center 构建产物位于 `dist/control-center/index.html`；`npm start` 会先构建它。缺构建产物时，`src/main/window.js` 会显示明确错误页。

---

## 5. 关键设计决策

| 决策 | 原因 |
|------|------|
| 精灵图而非逐帧图片替换 | 避免频繁触发图片解码，background-position 偏移性能更好 |
| CSS transform 翻转而非 `scale` | 保持 transform 单一来源，减少透明窗口绘制异常 |
| 拖拽与散步的并发锁 (`walkMoving`) | 防止 IPC 移动请求堆积 |
| 主进程做边界限制而非渲染进程 | 保证窗口不会因时序问题越界 |
| 设置保存在 `userData` | 应用卸载重装后仍保留，不受项目目录影响 |
| `contextIsolation: true` | 安全最佳实践，防止渲染进程直接访问 Node API |
| PetService 是唯一状态源 | 渲染层只负责显示，AI/插件/HTTP 都通过 PetService 操作宠物 |
| API Key 存储在 secrets.json（0600） | renderer 和插件不可见明文 |
| 插件权限白名单 | 第三方 JS 只通过隔离 runner 与受限 SDK 执行，不能访问 Node/Electron |
| Control Center 内置而非独立进程 | UI 操作通过 Electron IPC 走主进程 service，不经过网络 |

---

## 6. 添加新动作指南

1. 在 `cat_anime/flames/` 下新建文件夹，例如 `sleep/`
2. 放入按顺序命名的帧图片：`01_no_bg.png` ~ `NN_no_bg.png`（需有 alpha 通道）
3. 运行 `npm run generate-sprites`
4. 重启应用，新动作会自动出现在右键菜单和 Control Center Actions 页中

也可以通过 Control Center → Actions → 导入帧文件夹 在 UI 中操作。

---

## 7. Pet Pack 契约

- `pet.json` 是 runtime-ready manifest，动作必须包含安全相对路径 `sprite`，以及有效的 `frameCount`、`frameMs`、`frameWidth`、`frameHeight`。
- `frameMs` 限制在合理正整数范围内，避免 renderer 收到异常定时器参数。
- legacy `cat_anime/animations.json` 会在 `loadLegacyPetPack()` 中补默认帧字段后再进入严格 schema；这是兼容路径，不建议作为长期素材格式。
- 旧动作如果被补成 `1x1` fallback 尺寸，应通过 `npm run generate-sprites` 或 Control Center 导入流程重新生成准确尺寸。

---

## 8. 开发命令

```bash
npm start                     # 构建 Control Center + 启动 Electron
npm run dev:control-center    # 仅启动 Control Center dev server（热更新）
npm run build:control-center  # 仅构建 Control Center
npm run pack                  # electron-builder macOS 目录打包验证
npm run generate-sprites      # 重新生成精灵图
npm test                      # 运行 Node 测试（282 个测试）
npm run test:control-center   # 运行 Control Center Playwright UI 回归测试（9 个测试）
npm run check:node            # 逐个 node --check 主进程 / service / test JS 文件
npm run check:syntax          # check:node + Vite 构建校验 Control Center JSX
```
