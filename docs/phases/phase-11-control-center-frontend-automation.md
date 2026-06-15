# Phase 11 开发文档：Control Center 前端自动化基线

> 阶段目标：为 React + Vite Control Center 建立项目自带的 Playwright 冒烟测试基线，让基础 UI 回归不再只依赖构建验证和手动清单。  
> 范围约束：只覆盖 Control Center 的 demo API 浏览器运行模式；不改变 Electron 主进程服务契约；不声称 Windows release-ready。

## 1. 背景

Phase 1 已经把 Control Center 从单体组件拆成 App / pane / hook / api / component 分层。后续插件安装 review、Catalog 安装、AI/MCP session 管理都会继续压到这层 UI 上。此前项目有 `npm run build:control-center`，但没有能实际打开页面并验证交互的前端自动化。

本阶段选择 Playwright 作为第一层 UI 安全网，目标不是一次性覆盖所有业务流程，而是先把最容易漂移的外壳和基础交互纳入仓库验证。

## 2. 交付范围

本阶段交付：

- 新增 `@playwright/test` dev dependency。
- 新增 `playwright.config.js`，由 Playwright 自动启动 `npm run dev:control-center -- --port 5173 --strictPort`。
- 新增 `npm run test:control-center`。
- 新增 `tests/control-center/control-center-smoke.spec.js`，覆盖 Control Center shell、所有 tab、Pet scale / walk speed 交互和 About 更新检查状态。
- `.gitignore` 忽略 Playwright 报告和测试结果目录。
- README、HANDOFF、路线图、状态评估、技术文档、文档设计和 AGENTS 开发命令同步更新。

本阶段不交付：

- 不覆盖真实 Electron BrowserWindow / IPC 运行路径。
- 不覆盖插件安装 review、Catalog 安装/更新、保存配置、AI/MCP session 等深层 UI 流程。
- 不新增截图报告、trace artifact 或 Playwright HTML report 到仓库。
- 不修改 Windows release readiness 口径。

## 3. 设计决策

### 3.1 测试对象

测试运行在 Control Center Vite dev server 的 demo API fallback 模式，而不是启动 Electron 主进程。这让测试稳定、快速，并且不依赖用户本机 `userData`、插件目录、API key 或系统窗口状态。

这也意味着它是 UI 冒烟基线，不是完整端到端测试。真实 IPC 和 service 行为继续由 Node service tests 覆盖。

### 3.2 启动方式

`playwright.config.js` 使用 `webServer` 启动：

```bash
npm run dev:control-center -- --port 5173 --strictPort
```

配置固定 `baseURL` 为 `http://127.0.0.1:5173`，与项目既有开发命令保持一致。CI 环境不复用已存在 server，本地开发可复用。

### 3.3 覆盖路径

首批测试聚焦两个用例：

1. App shell 能加载，标题正确，所有 tab 都能切换并渲染对应 heading。
2. Pet 页 scale range 和 walk speed 控件响应，About 页更新检查按钮能显示 demo API 下的未配置状态。

每个测试收集 `pageerror` 和 console error，结束时断言为空，避免静默 runtime error 被当成通过。

## 4. 实施记录

### 4.1 Playwright 配置

新增 `playwright.config.js`：

- `testDir: './tests/control-center'`。
- `timeout: 30_000`，`expect.timeout: 5_000`。
- `use.baseURL: 'http://127.0.0.1:5173'`。
- Chromium desktop project。
- `webServer` 负责启动 Control Center dev server。

### 4.2 测试脚本

`package.json` 新增：

```json
"test:control-center": "playwright test"
```

`package-lock.json` 随 `npm install --save-dev @playwright/test` 更新。

### 4.3 冒烟用例

新增 `tests/control-center/control-center-smoke.spec.js`：

- `loads the app shell and every tab with the demo API`。
- `keeps key Pet and About interactions responsive`。

Pet scale range 使用原生 `HTMLInputElement.prototype.value` setter 触发 `input` / `change`，避免浏览器对 range 鼠标拖拽坐标的实现差异影响稳定性。

### 4.4 文档同步

同步更新：

- `AGENTS.md`：增加 `npm run test:control-center` 与 Playwright spec 放置规则。
- README 双语：增加命令、测试说明、Phase 11 链接和路线图状态。
- `docs/HANDOFF.md`：增加当前状态、指标和测试命令。
- `docs/productization-roadmap.md`：把 UI 层从“尚未引入前端测试框架”更新为“已有冒烟基线，深层流程仍待扩展”。
- `docs/project-status-review.md`：更新测试指标和残留风险。
- `docs/project-documentation-design.md`：把当前文档状态推进到 Phase 11，并记录 Control Center UI 变更需要运行 Playwright 冒烟。
- `docs/jishuwendang.md`：更新技术栈和开发命令。

## 5. 验收

- `npm run test:control-center` 通过，当前 2/2 Playwright smoke tests pass。
- `node --check playwright.config.js` 通过。
- `node --check tests/control-center/control-center-smoke.spec.js` 通过。
- `npm run check:syntax` 通过。
- `npm test` 通过，当前 236/236 Node tests pass。
- `git diff --check` 通过。

## 6. 残留风险

- 当前 Playwright 测试使用 demo API fallback，不覆盖 Electron IPC、preload bridge 或真实 service 注入。
- 当前只跑 Chromium desktop project，尚未覆盖 WebKit、Firefox 或移动 viewport；移动端仍不在当前产品范围。
- 插件安装 review、Catalog 安装/更新、保存配置、AI/MCP session 仍需要后续 Playwright 用例补齐。
- `npm run test:control-center` 首次运行需要 Playwright 浏览器依赖可用；当前本机验证已通过。
