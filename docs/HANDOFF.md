# ibot 项目交接文档

> 最后更新：2026-06-12 | 分支：`codex/productization-completion`
> 当前状态：平台重构与质量修复已合入主线，产品化补齐从当前分支分阶段推进。

---

## 项目概述

Electron 桌面宠物平台。一只透明背景的猫咪站在桌面上，支持拖拽、散步、动作播放、右键设置面板。

经过 6 个阶段的增量重构，已转型为可扩展的 pet runtime 平台：

- 底层 Service 层（EventBus → SettingsService → ActionService → PetService）
- Pet pack 运行时契约（schema / loader / importer）
- Vite + React Control Center（替代旧设置面板）
- AI 聊天（OpenAI-compatible，API Key 安全存储、持久会话、语义动作触发）
- 权限化插件系统（官方 Basic Behavior 已验证 SDK）
- 本地 HTTP API（loopback only）

所有配置通过 UI 操作，用户不需要手动编辑 JSON 文件。

---

## 测试与验收

```bash
npm test                  # 141 tests, all pass
npm run build:control-center  # Vite build pass
npm run generate-sprites  # CLI works
npm run check:syntax      # all JS syntax pass
npm run pack              # electron-builder directory package pass
```

---

## 文件地图

### 入口点

```
main.js                         # Electron 主进程入口，组装所有 service
preload.js                      # 宠物窗口 preload（contextBridge 暴露 API）
renderer.js                     # 宠物窗口渲染逻辑（动画、拖拽、散步）
index.html                      # 宠物窗口 HTML
control-center-preload.js       # Control Center preload
```

### Service 层 (`src/main/services/`)

| 文件 | 职责 |
|------|------|
| `event-bus.js` | 进程内 pub/sub 事件总线 |
| `settings-service.js` | 设置读写 + 预览 + 变更通知 |
| `action-service.js` | 动作配置读取，封装 pet pack 到旧动画配置的转换 |
| `pet-pack-service.js` | Pet pack 列表、目录检查、导入、启用、删除与 userData 安装目录管理 |
| `pet-service.js` | 唯一宠物状态源：say/playAction/setEvent |
| `secret-service.js` | API Key 安全存储（0600 权限，renderer 不可见明文） |
| `ai-service.js` | provider-agnostic AI 聊天，OpenAI-compatible 实现，持久会话历史 |
| `ai-action-orchestrator.js` | AI 回复到宠物动作的轻量语义匹配 |
| `plugin-service.js` | 插件发现、启用/禁用、配置保存、私有存储、命令运行、本地插件隔离 runner、持久运行日志 |
| `local-http-service.js` | 本地 loopback HTTP API（token-gated status/say/action/event） |
| `action-import-service.js` | 动作帧文件夹导入、配置更新、删除 |
| `sprite-generator.js` | 精灵图生成 + 帧文件夹检验（`inspectFrameFolder` + `readFrameMetadata`） |

### Runtime (`src/main/runtime/`)

| 文件 | 职责 |
|------|------|
| `runtime-state.js` | 不可变 snapshot + 订阅 |

### Pet Pack (`src/main/pet-pack/`)

| 文件 | 职责 |
|------|------|
| `schema.js` | pet.json manifest 归一化（action kind 推导） |
| `loader.js` | 从目录加载 pet pack / 包装 legacy 配置 |
| `importer.js` | 从 actions 创建 pet pack manifest |

### 插件 (`src/main/plugins/`)

| 文件 | 职责 |
|------|------|
| `manifest.js` | 插件 manifest 归一化 + 权限白名单 |
| `official/basic-behavior.js` | 官方 Basic Behavior 插件（验证 SDK） |

### 核心模块 (`src/main/`)

| 文件 | 职责 |
|------|------|
| `ipc.js` | 所有 IPC handler 注册（依赖注入） |
| `window.js` | 窗口创建（宠物窗口 + Control Center） |
| `screen.js` | 屏幕工作区钳制 |
| `settings.js` | 设置默认值、merge、磁盘路径与 macOS 登录项 helper |

### Control Center (`src/control-center/`)

```
src/control-center/
├── index.html                     # 入口 HTML
├── vite.config.js                 # Vite 配置（React + 构建到 dist/）
└── src/
    ├── main.jsx                   # React root 挂载
    ├── App.jsx                    # Control Center shell / tabs
    ├── api/                       # preload API facade + demo fallback
    ├── components/                # 共享 UI 控件
    ├── hooks/                     # 各 pane 数据加载与操作逻辑
    ├── lib/                       # 默认值、格式化、下载 helper
    ├── panes/                     # Pet / Actions / AI / Plugins / Service / About
    └── styles.css                 # 所有样式
```

Control Center 页面（Tab 式导航）：
- **Pet**：缩放、散步速度、散步时长、气泡时长、开机自启
- **Actions**：动作列表、导入帧文件夹、删除、设置默认/点击动作、Pet pack 导入/启用/删除
- **AI**：provider 配置、API Key、连接测试、聊天窗口
- **Plugins**：插件列表、启用/禁用、运行命令、运行日志/错误面板
- **Service**：本地 HTTP 服务启停、端口配置、MCP endpoint、访问日志
- **About**：占位

### 共享模块

| 文件 | 职责 |
|------|------|
| `src/shared/ipc-channels.js` | 所有 IPC 通道名常量 |

---

## 架构设计

### 进程模型

```
┌───────────────────────────────────────────────┐
│                  Main Process                 │
│  main.js 组装所有 service                     │
│                                               │
│  ┌──────────────────────────────────────┐     │
│  │  Service Layer                       │     │
│  │  EventBus → SettingsService          │     │
│  │       ↓                              │     │
│  │  ActionService → PetService          │     │
│  │       ↓           ↓          ↓       │     │
│  │  AiService    PluginService  LocalHttp│    │
│  │  SecretService  ActionImportService  │     │
│  └──────────────────────────────────────┘     │
│                                               │
│  ┌──────────────────────┐                     │
│  │ IPC Handlers         │                     │
│  │ (ipc.js)             │                     │
│  └──────────────────────┘                     │
└──────────────┬────────────────────────────────┘
               │ contextBridge / IPC
    ┌──────────┴──────────┐
    │                     │
┌───┴──────────────┐ ┌───┴──────────────┐
│ Renderer Process │ │ Control Center   │
│ (宠物窗口)        │ │ (React WebView)  │
└──────────────────┘ └──────────────────┘
```

### 数据流规则

1. **PetService 是唯一状态源** — 所有 pet 操作（say/action/event）必须经过 PetService
2. **API Key 隔离** — 存储在 secrets.json（0600 权限），renderer 和普通插件不可见明文
3. **Control Center 内置** — 通过 Electron IPC 调用主进程 service，不通过网络暴露
4. **插件权限白名单** — 第三方 JS 只通过隔离 runner 与受限 SDK 执行，不能访问 Node/Electron
5. **增量迁移** — 每阶段都保持 `npm start` 可运行

### 当前安全与兼容契约

- 本地 HTTP 服务默认关闭，只允许 loopback host。
- 启用本地 HTTP 时会生成 `localHttp.token`；所有 mutating endpoints 必须携带 `Authorization: Bearer <token>` 或 `X-ibot-Token`。
- 未带 token 的 `GET /api/status` 只返回 service runtime，不返回完整 pet snapshot。
- 服务切换到新端口时先验证新 server 可监听；失败时保留旧 server。同 host/port 保存时原地更新 token/config，不重启 socket。
- 本地 HTTP 访问日志持久化在 `settings.localHttp.logs`，不记录 token；Control Center 可刷新、导出、清空。
- MCP bridge 暴露在 `POST /mcp`，需 token + `Mcp-Session-Id`；token 轮换会清空 MCP session。
- `pet.json` pet pack 使用严格 schema：sprite path 必须是安全相对路径，frameCount/frameMs/frameWidth/frameHeight 必须是有效正整数。
- 用户安装的 Pet pack 存储在 `app.getPath('userData')/pet-packs/<pack-id>/`；内置 legacy cat 使用保留 id `legacy-cat`，不能删除或覆盖。
- legacy `cat_anime/animations.json` 会先补兼容默认值再进入严格 schema；缺尺寸的旧动作可加载，但应通过 `npm run generate-sprites` 或 Control Center 导入流程恢复准确帧尺寸。

---

## 最近变更

```
src/main/plugins/manifest.js             # 插件 main 入口安全相对路径校验
src/main/services/plugin-service.js      # 本地插件隔离 runner、受限 SDK、配置 schema、私有存储、运行日志
src/main/services/ai-service.js          # AI 配置、OpenAI-compatible chat、持久 conversation history
src/main/services/ai-action-orchestrator.js # AI 回复语义匹配动作
src/main/services/local-http-service.js  # 本地 HTTP API、访问日志、MCP bridge/session
src/main/plugins/local-plugin-runner.js  # 第三方插件短生命周期子进程执行器
src/control-center/src/main.jsx          # Plugins/Service 页配置表单与日志面板
src/control-center/src/styles.css        # 插件/服务日志面板样式
src/main/ipc.js                          # 插件日志/存储管理、本地服务管理 IPC handler
control-center-preload.js                # 暴露插件日志/存储管理、本地服务管理 API
tests/plugins/manifest.test.js           # 插件 main 路径校验测试
tests/services/plugin-service.test.js    # 本地插件沙箱与插件日志回归测试
tests/services/ai-service.test.js        # AI 配置、对话持久化与 provider 调用测试
tests/services/ai-action-orchestrator.test.js # AI 语义动作匹配测试
tests/services/local-http-service.test.js # HTTP token、安全日志与 MCP session 测试
```

---

## 待办清单

### P1 — 下一阶段核心

- [x] **插件安装与权限 review**：
  - 新增 `PluginInstallService`，支持插件目录 / `.ibot-plugin.zip` 检查、安装、更新、卸载。
  - 安装前显示权限 diff、network allowlist diff、签名/hash 状态、包摘要和命令列表。
  - 未签名插件允许安装但显示风险；带 `signature.json` 的插件会做本地 hash metadata 校验。
  - 安装/更新后的第三方插件默认保持 disabled，需用户手动启用。
  - 无效 zip、路径穿越、symlink、未知权限、非 HTTPS allowlist 会被拒绝。
  - 插件卸载可选择保留或删除该插件私有 storage，且不会影响其他插件 storage。

- [ ] **插件后续强化**：
  - 第三方 JS 沙箱强化（当前已有子进程 runner + Node permission model；已新增 `docs/plugin-sandbox-evaluation.md`，后续可评估 SES / Electron utilityProcess）
  - 更完整的插件配置 schema 支持（当前已支持 string/number/boolean/enum/default 动态表单）
  - 插件日志持久化/筛选/导出已完成；后续可继续加更细的时间范围过滤
  - 插件私有存储清理 UI 已完成；基础 `ctx.storage`、key 校验、64KB/插件与 16KB/value 配额已完成
  - `ctx.ai.chat()` 与 `ctx.network.fetch()` 已完成；网络仅允许 manifest `network.allowlist` 中的 HTTPS host

- [x] **AI 行为编排**：
  - 语义动作触发（AI 回复匹配动作 id/label/kind → 触发对应动作）
  - 对话历史持久化，Control Center 启动时加载 `control-center` 会话
  - Phase 4 已新增结构化 `ibot_behavior` tool-call intent、可配置规则、actionId 白名单、cooldown、dry-run 和最近决策日志

- [x] **本地 HTTP/MCP**：
  - MCP bridge 实现（`POST /mcp` JSON-RPC tools）
  - Token/session 保护（MCP initialize session，token 轮换清 session）
  - 访问日志（持久化、刷新、JSON/CSV 导出、清空）

### P2 — 增强与分发

- [x] Electron 打包配置（electron-builder）
- [x] autoStart 打包态同步逻辑迁入 SettingsService side effects，打包配置可用 `npm run pack` 验证
- [x] 动作导入帧检验报告（利用 inspectFrameFolder）
- [x] Pet pack 管理体验：内置/用户包列表、整包检查、导入、启用、删除

### 技术债

- [x] Control Center 已完成 Phase 1 模块化：`main.jsx` 只负责 root 挂载，pane / hook / api / lib 已拆分
- [x] 旧 settings.html/settings-preload.js/settings-renderer.js 已删除
- [x] `src/main/settings.js` 与 SettingsService 职责已收敛：磁盘写入副作用由 SettingsService 注入协调
- [x] `src/main/animations.js` 已合并到 pet-pack loader

---

## 开发工作流

```bash
# 日常开发
npm start                    # 构建 Control Center + 启动 Electron

# 仅启动 Control Center dev server（热更新）
npm run dev:control-center   # http://127.0.0.1:5173

# 测试
npm test                     # 123 tests

# 精灵图生成
npm run generate-sprites     # 扫描 cat_anime/flames/ 生成 sprites/

# 语法检查
npm run check:syntax

# 打包验证
npm run pack                 # 构建 Control Center 并生成 release/mac-arm64

# 提交
git add -A
git commit -m "feat: ..."
git push origin codex/pet-service-phase-1
```

### 测试添加流程

1. 在 tests/ 对应子目录新建 xxx.test.js
2. 使用 Node 原生 test runner：`const { test } = require('node:test')`
3. 断言用 `const assert = require('node:assert')`
4. 运行 `npm test` 验证

---

## 重要约束

- 每个阶段 `npm start` 必须保持可用
- 不改动现有 cat_anime/ 素材结构（兼容路径保留）
- 插件不开放 Node/Electron 权限
- API Key 不暴露给 renderer 或普通插件
- 所有新配置必须通过 UI 操作
- 不 revert 他人的未提交更改
- 测试先行，再做实现
