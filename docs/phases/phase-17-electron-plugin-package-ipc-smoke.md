# Phase 17 开发文档：Electron 插件包 IPC 安装烟测

> 阶段目标：把 Electron 主进程 `plugins:inspect-package` / `plugins:install` 通道到真实 `.openpet-plugin.zip` 校验服务的链路纳入 Node 回归。
> 范围约束：本阶段不改变插件安全策略、runner 权限、SDK 暴露面或 Control Center UI；不声明 Windows release-ready，也不替代真实 macOS/Windows 原生弹窗视觉与安装包烟测。

## 1. 背景

Phase 16 已经把 Control Center Plugins 页的手动插件包 review 面板纳入 Playwright demo API 回归，证明前端能展示权限 diff、签名状态、安装后默认停用和日志持久化。

但 live docs 中仍保留一个桌面端验证缺口：Electron 宿主下的原生文件选择器和真实插件包校验。真实插件包校验本身已有 `PluginInstallService` 覆盖，包括目录 / zip inspect、签名 hash metadata、路径穿越拒绝、安装后默认 disabled、更新权限 diff 等。缺少的是主进程 IPC glue 的烟测：从 `plugins:inspect-package` 选择真实 zip 路径，到 `PluginInstallService.inspectPluginPackage()` 生成 review，再通过 `plugins:install` 安装并刷新插件列表。

## 2. 目标

- 保持生产行为不变：Electron 运行时仍默认使用真实 `ipcMain` 和 `dialog`。
- 让 `registerIpcHandlers()` 支持注入 `ipcMainService` 与 `dialogService`，便于 Node 测试捕获 IPC handler 并模拟文件选择结果。
- 新增 IPC 级测试，覆盖取消选择和真实 `.openpet-plugin.zip` 安装链路。
- 将 Node 回归基线从 236 个测试扩展到 238 个。
- 同步 README、HANDOFF、路线图、状态评审和技术文档里的测试数量与剩余风险。

## 3. 实现内容

### 3.1 IPC 依赖注入

`src/main/ipc.js` 的 `registerIpcHandlers()` 新增两个可选依赖：

- `ipcMainService = ipcMain`
- `dialogService = dialog`

所有 IPC handler 注册改为使用 `ipcMainService.handle()` / `ipcMainService.on()`。动作帧导入、Pet pack 导入和插件包导入的文件选择器统一改为 `dialogService.showOpenDialog()`。

这使测试可以在不启动 Electron app 的情况下注册和调用主进程 handler；生产路径仍使用 Electron 模块导出的真实对象。

### 3.2 插件包 IPC 烟测

新增 `tests/main/ipc-plugin-install.test.js`，覆盖两条路径：

1. 取消选择插件包：
   - 注入 fake dialog 返回 `{ canceled: true, filePaths: [] }`。
   - 断言返回 `{ canceled: true }`。
   - 断言不会调用 `inspectPluginPackage()`。
   - 断言 dialog options 仍包含插件目录 / zip 选择能力。

2. 选择真实 `.openpet-plugin.zip` 并安装：
   - 在临时目录创建带 `plugin.json`、`index.js`、`signature.json` 的插件包。
   - 使用系统 `zip` 生成 `focus-timer.openpet-plugin.zip`。
   - 注入真实 `PluginInstallService` 和 fake `pluginService.listPlugins()`。
   - 调用 `plugins:inspect-package` handler，断言 `sourceType: zip`、`installMode: install`、插件 id、签名 `hash-verified`、权限 diff 和 selection id。
   - 调用 `plugins:install` handler，断言安装成功、默认 disabled、插件列表刷新、安装目录存在、settings 记录签名状态。

## 4. 文档同步

本阶段同步更新 live docs：

- `README.md` / `README.zh-CN.md`：测试数量改为 `238 node + 9 ui`，Phase 列表新增 Phase 17，v1.1 剩余项收窄为真实 OS 原生文件选择器 / Windows 验证。
- `docs/HANDOFF.md`：最新阶段、测试数量、Control Center 与 IPC 覆盖边界更新。
- `docs/productization-roadmap.md`：当前基线、UI / IPC 测试策略、阶段表和剩余增强项更新。
- `docs/project-status-review.md`：状态、测试数量、阶段文档数量、残留风险和发布建议更新。
- `docs/project-documentation-design.md`：Phase 17 治理记录和下一文档优先级更新。
- `docs/jishuwendang.md`：Node 测试数量和插件包 IPC 覆盖范围更新。

## 5. 验证

本阶段计划并执行以下验证：

```bash
node --test tests/main/ipc-plugin-install.test.js
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

最终结果记录在 paired review 文档中。

## 6. 边界与残留风险

- 本阶段没有改变插件 manifest 权限白名单、第三方 runner、Node permission model、SDK 或插件启用策略。
- 本阶段没有新增 API key 路径，也没有把 secret 暴露给 renderer 或插件。
- 本阶段证明主进程 IPC 可以把真实 `.openpet-plugin.zip` 交给安装服务并完成安装；它不证明 macOS / Windows 原生文件选择器 UI 在真实 Electron 窗口中的视觉与交互表现。
- 本阶段不运行 Windows installer、不验证 Authenticode 签名、不产生 Windows smoke report 的真实通过证据。
- Windows release-ready 状态没有变化；仍需要签名产物证据和真实 Windows 冒烟验证。

## 7. 结果

Phase 17 将插件包安装链路从 demo UI 覆盖推进到主进程 IPC + 真实 zip fixture 覆盖。后续同一主题的剩余工作应聚焦真实 Electron 宿主窗口和 OS 级验证：原生弹窗可用性、macOS/Windows packaged app 行为、Windows 签名产物与 clean-machine smoke evidence。
