# Phase 16 开发文档：Control Center 手动插件安装自动化

> 阶段目标：把 Plugins 页手动插件包安装 review 流程纳入 Control Center Playwright UI 回归基线。
> 范围约束：本阶段只覆盖 React + Vite Control Center 的 demo API 自动化，不改变 Electron 主进程插件安装服务、安全边界、原生文件选择器或真实 zip 包校验逻辑。

## 1. 背景

Phase 11-14 已经逐步把 Control Center 的 app shell、基础交互、保存配置、Catalog 安装/更新和 Service MCP session 管理纳入 Playwright 回归。Phase 15 完成文档设计收口后，live docs 中仍明确记录一个前端自动化缺口：Plugins 页的手动插件包安装 review 流程。

真实插件安装链路已经由主进程 `PluginInstallService` 和 IPC preload 承担，包含 package inspect、权限 diff、签名状态、block status、安装后默认停用等安全约束。Control Center 前端此前在 demo API 模式下无法走出 review 面板，因此 Playwright 无法稳定覆盖这条 UI 路径。

## 2. 目标

- 在 demo API 中提供一个可重复的本地插件包 review fixture。
- 覆盖 Plugins 页从空列表、点击 `Install plugin`、展示 review、取消、再次 inspect、安装、默认停用、日志写入到刷新后持久化的完整 UI 路径。
- 将 Control Center UI 回归基线从 8 个 Playwright 测试扩展到 9 个。
- 同步 README、交接文档、路线图、项目状态 review 和技术文档中的测试数量与剩余风险。

## 3. 实现内容

### 3.1 Demo API 手动插件 review fixture

`src/control-center/src/api/control-center-api.js` 新增 `demoManualPluginReview`，模拟真实手动插件包 inspect 结果：

- `selectionId`：稳定选择 ID，用于 install 阶段校验。
- `sourceType: zip` 和 `installMode: install`：与真实安装 review 语义一致。
- `plugin`：包含 id、name、version、description、permissions、commands、main 与 configSchema。
- `permissionDiff`：展示新增 `pet:say` 和 `storage` 权限。
- `signature`：展示 unsigned 状态。
- `blockStatus`：明确未被拦截。
- `fileCount`、`byteSize`、`packageHash`：供 review 面板展示。

### 3.2 Demo API 插件与日志状态

demo state 新增：

- `plugins`：存放安装后的 demo local plugin。
- `pluginLogs`：存放安装、启用/停用、命令运行日志。

新增 clone helpers 确保 UI 获取的是不可变副本，避免测试路径意外修改共享对象。

`inspectPluginPackage()` 现在返回真实 review payload；`clearPluginSelection()` 清除当前 selection；`installPlugin(selectionId)` 校验 selection 后写入一个 local 插件并默认保持 disabled，同时记录 `Plugin installed` 日志。

`setPluginEnabled()`、`runPluginCommand()`、`getPluginLogs()`、`exportPluginLogs()` 和 `clearPluginLogs()` 也开始使用 demo log state，使 Plugins 页后续交互更接近真实应用行为。

### 3.3 Playwright UI 回归

`tests/control-center/control-center-smoke.spec.js` 新增测试：

```text
installs manual plugin packages from the Plugins review panel with the demo API
```

覆盖断言：

- Plugins tab 初始展示空状态。
- 点击 `Install plugin` 后出现 `Demo Manual Review` review panel。
- review panel 展示安装版本、权限 diff、签名状态、文件数量和命令。
- 点击取消后 review panel 消失，插件列表保持空状态。
- 再次 inspect 后点击安装，状态行显示“插件已安装，默认保持停用”。
- 插件行展示 id、local source、unsigned signature、permissions，开关 `aria-checked=false`。
- 插件日志出现 `Plugin installed`。
- 刷新页面后插件和日志仍通过 demo session state 保留。

## 4. 文档同步

本阶段同步更新 live docs：

- `README.md` / `README.zh-CN.md`：测试徽章与测试覆盖改为 `236 node + 9 ui`，Phase 列表新增 Phase 16，v1.1 剩余项改为 Electron 宿主真实插件包烟测。
- `docs/HANDOFF.md`：最新阶段、测试数量、Control Center 覆盖范围更新。
- `docs/productization-roadmap.md`：当前基线、UI 策略、阶段表、剩余增强项更新。
- `docs/project-status-review.md`：状态、测试数量、阶段文档数量、残留风险和发布建议更新。
- `docs/project-documentation-design.md`：Phase 16 治理记录和下一文档优先级更新。
- `docs/jishuwendang.md`：Playwright 测试数量和覆盖范围更新。

## 5. 验证

本阶段已运行：

```bash
npm run test:control-center -- --grep "manual plugin packages" # 1/1 targeted Playwright test pass
npm run test:control-center                                    # 9/9 Control Center Playwright UI tests pass
npm run check:syntax                                           # node --check + Vite build pass
npm test                                                       # 236/236 Node tests pass
git diff --check                                               # no whitespace errors
```

## 6. 边界与残留风险

- 本阶段没有改变主进程插件安装服务、插件 runner、权限白名单、Node permission model 或 SDK 暴露面。
- 本阶段没有新增 API key 路径，也没有把 secret 暴露给 renderer 或插件。
- demo API 自动化不等同于真实 Electron 原生文件选择器验证。
- demo API 自动化不替代真实 `.openpet-plugin.zip` / `.ibot-plugin.zip` package inspect、hash、blocklist、路径安全和 zip 校验测试。
- Windows release-ready 状态没有变化；仍需要签名产物证据和真实 Windows 冒烟验证。

## 7. 结果

Phase 16 将手动插件包安装 review 从文档中的 UI 自动化缺口转为项目自带的 Playwright 回归覆盖。后续更深验证应聚焦 Electron 宿主下真实文件选择器、真实插件包校验和跨平台安装包烟测，而不是重复 demo API 层的 review panel 覆盖。
