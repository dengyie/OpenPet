# OpenPet 项目交接文档

> 最后更新：2026-06-16 | 分支：`main`
> 当前状态：v1.0 产品化基线已完成；v1.0.1-rc.1 完成 OpenPet 改名、GitHub 仓库迁移与升级兼容；Control Center Playwright UI 回归基线已扩展至 Phase 16；Phase 17 已补主进程插件包 IPC + 真实 zip fixture 烟测；Phase 18 已补 macOS / Windows packaged app 原生文件选择器烟测证据工具链；Phase 19 已把项目文档设计完善为可执行的阶段闭环、生命周期、完成标准和决策记录；Phase 20 已补 Focus Timer 示例插件、插件开发文档与真实本地插件服务测试；Phase 21 已补 Weather Status 示例插件、network allowlist 开发者路径与真实本地插件服务测试；Phase 22 已补 RSS Reader 示例插件、公开 feed 开发者路径与真实本地插件服务测试；Phase 23 已补插件提交前校验 CLI；Phase 24 已补插件提交审核包生成 CLI；macOS 分发基线已完成，Windows 打包/CI/签名策略/冒烟证据、报告、runbook 与 collector/证据包校验/summary/archive-manifest、packaged native picker smoke evidence 工具基线已落地但尚未 release-ready
> **项目评估：95/100 分，建议发布 v1.0.1 RC 后提升正式版**（详见 [project-status-review.md](./project-status-review.md)）

---

## 项目概述

**OpenPet** 是一个 Electron 桌面宠物平台。一只透明背景的猫咪站在桌面上，支持拖拽、散步、动作播放、右键设置面板。

经过平台重构与 7 个产品化阶段，已转型为可扩展、可分发、可运营的 pet runtime 平台：

- ✅ 底层 Service 层（19 个 service，EventBus → SettingsService → ActionService → PetService）
- ✅ Pet pack 运行时契约（schema / loader / importer）
- ✅ Vite + React Control Center（7 个 Tab：Pet/Actions/AI/Plugins/Catalog/Service/About）
- ✅ Control Center Playwright UI 回归基线（demo API 模式覆盖 shell、全部 tab、Pet/About 关键交互、Pet/AI/Service 保存配置流程、Catalog 安装/更新流程、Service MCP session 管理，以及手动插件包安装 review）
- ✅ 主进程插件包 IPC 烟测（真实 `.openpet-plugin.zip` fixture 覆盖 inspect + install，插件默认 disabled）
- ✅ Desktop 原生文件选择器烟测证据工具链（packaged macOS / Windows pending report、runbook、更新命令与 readiness validator）
- ✅ AI 聊天（OpenAI-compatible，API Key 安全存储、持久会话、结构化行为编排）
- ✅ 权限化插件系统（隔离 runner + SDK + catalog + blocklist）
- ✅ 示例插件开发者资产（Focus Timer storage 示例 + Weather Status network allowlist 示例 + RSS Reader public feed 示例 + 插件开发文档 + 插件提交前校验 CLI + 插件提交审核包 CLI + 真实 install/run service 测试）
- ✅ 本地 HTTP API + MCP transport（loopback only，默认关闭）
- ✅ macOS 分发/更新检查、生态 catalog 与本地 blocklist 治理
- 📝 Windows 桌面分发设计已记录在 [`desktop-release-design.md`](./desktop-release-design.md)，当前已补 build config、CI、平台化更新资产、签名策略护栏、冒烟证据门禁、pending 报告/runbook/collector 产物、证据包校验、summary/archive-manifest 和报告填写工具，后续需补真实签名产物证据和冒烟验证

所有配置通过 UI 操作，用户不需要手动编辑 JSON 文件。

### 文档入口顺序

后续接手时建议按这个顺序读文档：

1. [`project-documentation-design.md`](./project-documentation-design.md)：项目目标锚点、文档分层、支持声明规则和阶段治理。
2. 本文件：当前事实状态、文件地图、待办和开发命令。
3. [`development-summary.md`](./development-summary.md)：截至 Phase 24 的阶段开发小结、质量基线和下一步建议。
4. [`desktop-release-design.md`](./desktop-release-design.md) 与 [`release-checklist.md`](./release-checklist.md)：macOS + Windows 桌面发布边界、签名、冒烟证据和验收门槛。
5. 最新的 `docs/phases/phase-*.md` 与 `docs/reviews/phase-*-review.md`：具体阶段的实现记录、review、验证和残留风险。当前最新阶段为 [`phase-24-plugin-submission-review-packet.md`](./phases/phase-24-plugin-submission-review-packet.md) 与 [`phase-24-plugin-submission-review-packet-review.md`](./reviews/phase-24-plugin-submission-review-packet-review.md)。

当前支持口径必须保持为：macOS release baseline complete；Windows desktop build/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest and packaged native picker smoke evidence tooling baselines implemented but not release-ready；移动端不在当前范围。

---

## 核心指标

| 指标 | 结果 | 说明 |
|------|------|------|
| **功能完整性** | 95% | 所有承诺功能已实现 |
| **测试覆盖** | 275 Node + 9 UI ✅ | service / release / 主进程 IPC / 示例插件 / 插件提交校验与审核包 / desktop picker smoke evidence 门禁覆盖；Control Center Playwright UI 回归基线 |
| **架构质量** | ⭐⭐⭐⭐⭐ | 分层清晰、安全可靠 |
| **代码质量** | ⭐⭐⭐⭐⭐ | 模块化彻底、职责单一 |
| **文档完整性** | ⭐⭐⭐⭐⭐ | 双语 README、技术文档、版本记录与发布清单完整 |
| **可发布性** | ✅ macOS RC 可发布 | Windows 打包/CI/签名策略/冒烟证据、报告、runbook 与 collector/证据包校验/summary/archive-manifest、packaged native picker smoke evidence 工具基线已落地，尚未 release-ready |

---

## 测试与验收

```bash
npm test                  # 275 Node tests, all pass
npm run test:control-center # 9 Control Center Playwright UI tests, all pass
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
| `behavior-orchestrator-service.js` | 结构化 AI 行为规则、dry-run、cooldown 与最近决策日志 |
| `plugin-install-service.js` | 插件包/目录 inspect、权限 diff、签名/hash 校验、安装/更新/卸载 |
| `plugin-service.js` | 插件发现、启用/禁用、配置保存、私有存储、命令运行、本地插件隔离 runner、持久运行日志 |
| `local-http-service.js` | 本地 loopback HTTP API（token-gated status/say/action/event） |
| `mcp-transport-service.js` | MCP JSON-RPC / streamable HTTP 握手、session TTL、tool schema 校验 |
| `catalog-service.js` | 静态生态 catalog、下载 hash 校验、安装审查流桥接、本地 blocklist 管理 |
| `ecosystem-policy.js` | pluginId / packId / sha256 blocklist 归一化、合并与拦截判断 |
| `about-service.js` | 应用版本、平台、更新检查状态 |
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
| `user-data-path.js` | OpenPet 改名兼容：在设置与 service 读取前固定使用旧版 `ibot` userData 目录 |
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
    ├── panes/                     # Pet / Actions / AI / Plugins / Catalog / Service / About
    └── styles.css                 # 所有样式
```

Control Center 页面（Tab 式导航）：
- **Pet**：缩放、散步速度、散步时长、气泡时长、开机自启
- **Actions**：动作列表、导入帧文件夹、删除、设置默认/点击动作、Pet pack 导入/启用/删除
- **AI**：provider 配置、API Key、连接测试、聊天窗口
- **Plugins**：插件列表、启用/禁用、运行命令、运行日志/错误面板
- **Catalog**：插件 / pet pack 目录浏览、安装/更新、权限 review、blocklist 管理
- **Service**：本地 HTTP 服务启停、端口配置、MCP endpoint、访问日志
- **About**：版本信息、打包/运行环境、更新检查

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
- 启用本地 HTTP 时会生成 `localHttp.token`；所有 mutating endpoints 必须携带 `Authorization: Bearer <token>` 或 `X-OpenPet-Token`。
- 未带 token 的 `GET /api/status` 只返回 service runtime，不返回完整 pet snapshot。
- 服务切换到新端口时先验证新 server 可监听；失败时保留旧 server。同 host/port 保存时原地更新 token/config，不重启 socket。
- 本地 HTTP 访问日志持久化在 `settings.localHttp.logs`，不记录 token；Control Center 可刷新、导出、清空。
- MCP bridge 暴露在 `POST /mcp`，需 token + `Mcp-Session-Id`；token 轮换会清空 MCP session。
- `pet.json` pet pack 使用严格 schema：sprite path 必须是安全相对路径，frameCount/frameMs/frameWidth/frameHeight 必须是有效正整数。
- OpenPet 改名后仍将 Electron `userData` 固定到旧版 `app.getPath('appData')/ibot` 目录，保证升级用户保留 `settings.json`、`secrets.json`、插件、Pet packs 与本地服务日志。
- 用户安装的 Pet pack 存储在 `app.getPath('userData')/pet-packs/<pack-id>/`；内置 legacy cat 使用保留 id `legacy-cat`，不能删除或覆盖。
- legacy `cat_anime/animations.json` 会先补兼容默认值再进入严格 schema；缺尺寸的旧动作可加载，但应通过 `npm run generate-sprites` 或 Control Center 导入流程恢复准确帧尺寸。

---

## 最近变更

```
src/main/ipc.js                           # IPC handler 注册支持 ipcMain/dialog 注入，生产默认仍用 Electron 对象
tests/main/ipc-plugin-install.test.js     # 插件包 inspect/install 主进程 IPC 烟测，使用真实 .openpet-plugin.zip fixture
scripts/create-desktop-picker-smoke-report.js # 生成 macOS / Windows packaged native picker pending smoke report
scripts/update-desktop-picker-smoke-report.js # 填写 desktop picker smoke report 的环境、产物和检查项证据
scripts/validate-desktop-picker-smoke-report.js # 校验 desktop picker smoke report readiness / signed readiness
scripts/create-desktop-picker-smoke-runbook.js # 从 report 生成 packaged native picker smoke runbook
tests/release/desktop-picker-smoke-report.test.js # desktop picker report / signature / artifact 选择测试
tests/release/desktop-picker-smoke-runbook-update.test.js # desktop picker runbook / update tool 测试
docs/project-documentation-design.md       # 项目目标、文档生命周期、阶段闭环、完成标准与支持声明规则
docs/development-summary.md                # 截至 Phase 24 的阶段开发小结、质量基线与下一步建议
docs/plugin-development.md                 # 插件开发者指南：manifest、config schema、SDK、安装 review 和测试入口
scripts/validate-plugin-package.js         # 插件包提交前校验 CLI，复用 PluginInstallService package review
tests/scripts/validate-plugin-package.test.js # 插件提交校验 CLI 成功、严格签名和坏签名测试
scripts/create-plugin-submission-report.js # 插件提交审核包生成 CLI，输出 reviewer Markdown/JSON
tests/scripts/create-plugin-submission-report.test.js # 插件提交审核包参数、报告、严格签名和写出测试
examples/plugins/focus-timer/              # 已纳入测试的 Focus Timer 本地插件示例
tests/examples/focus-timer-plugin.test.js  # 示例插件 inspect/install/run service 覆盖
examples/plugins/weather-status/           # 已纳入测试的 Weather Status 本地插件示例，覆盖 network allowlist
tests/examples/weather-status-plugin.test.js # Weather 示例插件 inspect/install/network/storage/run service 覆盖
examples/plugins/rss-reader/               # 已纳入测试的 RSS Reader 本地插件示例，覆盖 public feed/network/storage/pet speech
tests/examples/rss-reader-plugin.test.js   # RSS 示例插件 inspect/install/network/storage/run service 覆盖
docs/phases/phase-24-plugin-submission-review-packet.md # Phase 24 插件提交审核包记录
docs/reviews/phase-24-plugin-submission-review-packet-review.md # Phase 24 review 与验证记录
docs/phases/phase-23-plugin-submission-validation.md # Phase 23 插件提交校验入口记录
docs/reviews/phase-23-plugin-submission-validation-review.md # Phase 23 review 与验证记录
docs/phases/phase-22-rss-example-plugin-developer-asset.md # Phase 22 RSS 示例插件开发者资产记录
docs/reviews/phase-22-rss-example-plugin-developer-asset-review.md # Phase 22 review 与验证记录
docs/phases/phase-21-weather-example-plugin-developer-asset.md # Phase 21 Weather 示例插件开发者资产记录
docs/reviews/phase-21-weather-example-plugin-developer-asset-review.md # Phase 21 review 与验证记录
docs/phases/phase-20-example-plugin-developer-asset.md # Phase 20 示例插件开发者资产记录
docs/reviews/phase-20-example-plugin-developer-asset-review.md # Phase 20 review 与验证记录
docs/phases/phase-19-project-documentation-design-completion.md # Phase 19 文档设计完善记录
docs/reviews/phase-19-project-documentation-design-completion-review.md # Phase 19 review 与验证记录
src/control-center/src/api/control-center-api.js # demo API 手动插件包 review fixture 与插件日志持久化
tests/control-center/control-center-smoke.spec.js # Control Center Playwright UI 回归，含手动插件包 review
docs/phases/phase-18-desktop-native-picker-smoke-evidence.md # Phase 18 开发记录
docs/reviews/phase-18-desktop-native-picker-smoke-evidence-review.md # Phase 18 review 与验证记录
docs/phases/phase-17-electron-plugin-package-ipc-smoke.md # Phase 17 开发记录
docs/reviews/phase-17-electron-plugin-package-ipc-smoke-review.md # Phase 17 review 与验证记录
docs/phases/phase-16-control-center-manual-plugin-install-automation.md # Phase 16 UI 自动化记录
docs/reviews/phase-16-control-center-manual-plugin-install-automation-review.md # Phase 16 review
```

---

## 待办清单

### P1 — 下一阶段核心

- [x] **插件安装与权限 review**：
  - 新增 `PluginInstallService`，支持插件目录 / `.openpet-plugin.zip` 检查、安装、更新、卸载。
  - 安装前显示权限 diff、network allowlist diff、签名/hash 状态、包摘要和命令列表。
  - 未签名插件允许安装但显示风险；带 `signature.json` 的插件会做本地 hash metadata 校验。
  - 安装/更新后的第三方插件默认保持 disabled，需用户手动启用。
  - 无效 zip、路径穿越、symlink、未知权限、非 HTTPS allowlist 会被拒绝。
  - 插件卸载可选择保留或删除该插件私有 storage，且不会影响其他插件 storage。
  - Phase 16 已覆盖 Control Center demo API 手动插件包 review UI；Phase 17 已覆盖主进程 IPC 到真实 `.openpet-plugin.zip` inspect/install 服务链路；Phase 18 已提供 packaged app 原生文件选择器烟测报告、runbook、填写和校验工具。

- [ ] **插件后续强化**：
  - 第三方 JS 沙箱强化（当前已有子进程 runner + Node permission model；已新增 `docs/plugin-sandbox-evaluation.md`，后续可评估 SES / Electron utilityProcess）
  - 更完整的插件配置 schema 支持（当前已支持 string/number/boolean/enum/default 动态表单）
  - Focus Timer 示例插件、Weather Status 示例插件、RSS Reader 示例插件、`docs/plugin-development.md`、`npm run validate:plugin` 提交前校验入口与 `npm run create-plugin-submission-report` 审核包入口已完成；后续可继续补真实社区提交流程、PR 模板和教程材料
  - 插件日志持久化/筛选/导出已完成；后续可继续加更细的时间范围过滤
  - 插件私有存储清理 UI 已完成；基础 `ctx.storage`、key 校验、64KB/插件与 16KB/value 配额已完成
  - `ctx.ai.chat()` 与 `ctx.network.fetch()` 已完成；网络仅允许 manifest `network.allowlist` 中的 HTTPS host

- [x] **AI 行为编排**：
  - 语义动作触发（AI 回复匹配动作 id/label/kind → 触发对应动作）
  - 对话历史持久化，Control Center 启动时加载 `control-center` 会话
  - Phase 4 已新增结构化 `openpet_behavior` tool-call intent、可配置规则、actionId 白名单、cooldown、dry-run 和最近决策日志

- [x] **本地 HTTP/MCP**：
  - MCP bridge 实现（`POST /mcp` JSON-RPC tools）
  - Token/session 保护（MCP initialize session，token 轮换清 session）
  - 访问日志（持久化、刷新、JSON/CSV 导出、清空）
  - Phase 5 已拆出 `McpTransportService`，新增 session TTL、Service 页撤销 sessions、tool-call 专用日志路径、`GET /mcp` stream handshake、MCP 使用文档与兼容矩阵

- [x] **生态运营闭环**：
  - 内置静态 catalog 展示官方插件和 legacy pet pack 元数据。
  - Catalog 页支持插件 / pet pack 安装、更新状态、权限/manifest review 和本地 blocklist 管理。
  - catalog 下载强制 HTTPS 与 sha256 校验；插件和 pet pack 仍分别进入原有安装审查流。
  - blocklist 覆盖 catalog 下载、手动安装、插件启用/运行、pet pack 启用路径。

### P2 — 增强与分发

- [x] Electron macOS 打包配置（electron-builder）
- [x] autoStart 打包态同步逻辑迁入 SettingsService side effects，打包配置可用 `npm run pack` 验证
- [x] 动作导入帧检验报告（利用 inspectFrameFolder）
- [x] Pet pack 管理体验：内置/用户包列表、整包检查、导入、启用、删除
- [ ] Windows 桌面分发：`build/win`、`build/icon.ico`、`windows-latest` release job、平台化更新资产、签名策略护栏、冒烟证据门禁、pending 报告/runbook/collector 产物、证据包校验、summary/archive-manifest、报告填写工具和 desktop picker smoke evidence 工具链已完成；仍需签名产物验证、安装/卸载/透明窗口/原生 OS 文件选择器真实冒烟证据

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
npm test                     # 275 Node tests
npm run test:control-center  # 9 Control Center Playwright UI tests

# 精灵图生成
npm run generate-sprites     # 扫描 cat_anime/flames/ 生成 sprites/

# 语法检查
npm run check:syntax

# 打包验证
npm run pack                 # 构建 Control Center 并生成当前 macOS 目录包（常见输出：release/mac-arm64）

# 提交
git add -A
git commit -m "feat: ..."
git push origin main
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
