# Phase 14 开发文档：Control Center MCP Session 自动化

> 阶段目标：把 Control Center 前端自动化继续推进到 Service 页 MCP session 管理，覆盖 active session 展示、撤销全部 sessions、令牌轮换后 session 清零的用户可见闭环。  
> 范围约束：仍运行在 React + Vite demo API 模式；不改变 Electron IPC、`LocalHttpService`、`McpTransportService` 或真实 MCP transport 行为；不改变 Windows release-ready 口径。

## 1. 背景

Phase 13 已覆盖 Catalog 安装/更新 UI 回归。路线图中剩余的 Control Center 深层自动化缺口主要是手动插件包安装 review 和 AI/MCP session 管理。

本阶段选择先覆盖 MCP session 管理，因为 Service 页已有稳定 UI 控件，真实主进程也已有明确行为：MCP session 必须通过 token 初始化，撤销 sessions 会清空 active session，token 原地轮换也会撤销旧 sessions。相比手动插件包安装 review，MCP session 管理不依赖系统文件选择器或真实 zip fixture，适合继续扩展 demo API 前端回归。

## 2. 交付范围

本阶段交付：

- 扩展 Control Center demo API 的 Service 状态，使 demo 模式默认提供一个已启动本地服务：
  - `http://127.0.0.1:4317/api/status`
  - `http://127.0.0.1:4317/mcp`
  - `MCP Sessions = 2`
  - `token = demo-token`
- demo API 的 `rotateServiceToken()` 现在模拟真实服务约束：令牌轮换后 active MCP sessions 清零。
- 新增 1 个 Playwright 用例：
  - Service 页显示 active sessions。
  - 点击“撤销全部”后 session 计数变为 0，按钮 disabled，reload 后仍保留。
  - 重置 demo state 后验证“轮换令牌”会更新 token 并清空 MCP sessions。
- 将 `npm run test:control-center` 当前基线从 7 个 UI 测试扩展到 8 个 UI 测试。
- 同步 README、HANDOFF、路线图、状态评估、技术文档和文档设计中的测试口径与剩余自动化缺口。

本阶段不交付：

- 不启动 Electron BrowserWindow，不验证 preload IPC 或真实主进程 service 注入。
- 不发起真实 HTTP/MCP 请求，不验证 JSON-RPC initialize、`Mcp-Session-Id` header、session TTL 或 streaming handshake。
- 不覆盖手动插件包安装 review。
- 不改变 Windows 分发支持声明。

## 3. 设计决策

### 3.1 demo Service 默认状态

Phase 12 的 demo Service 状态从 `defaultServiceStatus` 开始，适合保存配置验证，但无法覆盖“已有 MCP sessions”的管理路径。本阶段新增 `createDemoServiceStatus()`，使 demo 模式进入 Service 页时就有可操作的 session 计数。

这个状态只服务于前端 UI 回归，不代表真实服务已经启动，也不会打开端口。

### 3.2 token 轮换清 session

真实 `LocalHttpService.start()` 在同 host/port 更新 token 时会调用 `active.mcp.revokeSessions()`。本阶段让 demo API 的 `rotateServiceToken()` 同步清零 `runtime.mcp.activeSessions`，避免 UI 回归验证一个与真实约束不一致的状态模型。

### 3.3 测试状态隔离

新增用例先验证撤销 sessions 的持久状态，再通过 `window.sessionStorage.removeItem('openpet.controlCenter.demoState')` 重置 demo API 状态，以同一个用例覆盖 token 轮换清 session 的独立初始条件。

## 4. 实施记录

### 4.1 demo API Service 状态

更新 `src/control-center/src/api/control-center-api.js`：

- 新增 `createDemoServiceStatus()`。
- `createDefaultDemoState()` 使用该状态初始化 `serviceStatus`。
- `rotateServiceToken()` 设置 `demo-token-rotated`，并同步把 `runtime.mcp.activeSessions` 置为 `0`。

### 4.2 Playwright 用例扩展

更新 `tests/control-center/control-center-smoke.spec.js`：

- 既有 Service 保存配置用例改为在已启动 demo 服务上修改端口并保存。
- 新增 Service MCP session 管理用例，覆盖 session 展示、撤销、reload 保留、token 轮换清 session。
- 保留既有 page error / console error 断言。

### 4.3 文档同步

同步更新：

- README 双语：Phase 14 链接、测试数量、覆盖说明、v1.1 剩余自动化项。
- `docs/HANDOFF.md`：当前最新阶段、指标和命令更新为 8 UI 测试。
- `docs/productization-roadmap.md`：AI/MCP session 管理从缺口移动到已覆盖范围。
- `docs/project-status-review.md`：测试指标和剩余风险同步。
- `docs/project-documentation-design.md`：阶段治理推进到 Phase 14。
- `docs/jishuwendang.md`：技术栈与开发命令同步。

## 5. 验收

- `npm run test:control-center` 通过，当前 8/8 Playwright UI tests pass。
- `npm run check:syntax` 通过。
- `npm test` 通过，当前 236/236 Node tests pass。
- `git diff --check` 通过。

## 6. 残留风险

- 测试仍运行在 Vite demo API 模式，不覆盖 Electron IPC、真实 `LocalHttpService` 端口、MCP JSON-RPC initialize、session TTL、streaming handshake 或真实请求日志。
- demo API 使用 `sessionStorage`，适合前端回归，不代表真实 service 持久化机制。
- 当前 Playwright 仍只跑 Chromium desktop project。
- 手动插件包安装 review 仍需后续阶段补齐。
