# Phase 57 开发文档：Plugin Dashboard Opening

## 目标

Phase 57 在 Phase 56 的 extension entries 基础上补齐一个安全的小 runtime 切片：Control Center 可以展示 extension entry 声明，并允许用户对已启用插件显式打开声明的 HTTP/HTTPS dashboard。

本阶段不启动长期 service，不运行 setup，不执行 shell command 字符串，不托管或 iframe dashboard 内容，也不扩大 sandbox 声明。

## 本阶段完成内容

- `PluginService` 增加 `openDashboard(pluginId, dashboardId)`：
  - 要求插件存在且未被生态 blocklist 拦截。
  - 要求插件已启用。
  - 要求 dashboard id 存在于 `manifest.entries.dashboards`。
  - 只允许 `http:` 和 `https:` URL。
  - 通过注入的 `openExternal()` 打开外部 URL。
  - 成功和失败都会写入 plugin logs，`commandId` 使用 `dashboard:<id>`。
- IPC / preload / shared contracts 增加 `plugins:open-dashboard` 与 `openPluginDashboard()`。
- Control Center Plugins pane：
  - 在安装审查和已安装插件卡片中展示 command/service/dashboard/config/assets/manifest 声明。
  - 对已安装插件展示 dashboard 按钮。
  - 插件未启用时 dashboard 按钮禁用。
  - 打开成功后刷新日志并显示 `Dashboard 已打开`。
- Catalog plugin review 同样展示 extension entry 声明，帮助用户在安装前理解 package 行为。
- Demo API fixture 覆盖 command/service/dashboard/config/assets/manifest 声明和 dashboard open 日志。

## 边界

仍未实现：

- service start/stop/process health；
- setup status / cleanup command；
- shell command execution；
- local bridge token / endpoint；
- dashboard 托管、iframe、内容检查或主题注入；
- 更强 sandbox 或权限代理。

Dashboard opening 是用户显式触发的外部打开动作，不代表 OpenPet 启动了对应 local service，也不代表 OpenPet 审计或控制 dashboard 内容。

## 验收

- PluginService dashboard tests 覆盖成功打开、插件停用、生态 block、未知 dashboard id、非 HTTP(S) URL。
- IPC tests 覆盖 `plugins:open-dashboard` 透传。
- Control Center smoke 覆盖安装审查声明展示、已安装插件声明展示、停用状态按钮禁用、启用后打开 dashboard、日志刷新。
- Shared contracts 通过 `npm run typecheck` 验证。
- Production Code Quality Review 完成并记录。
- `npm run check:syntax`、`npm run test:control-center`、`npm test`、`git diff --check` 通过。

## 验证

```bash
node --test tests/services/plugin-service.test.js tests/main/ipc-plugin-install.test.js
npm run typecheck
npm run test:control-center
npm test
npm run check:syntax
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json', 'utf8')); console.log('project-context ok')"
```

当前结果：

- `node --test tests/services/plugin-service.test.js tests/main/ipc-plugin-install.test.js`: pass
- `npm run typecheck`: pass
- `npm run test:control-center`: 10/10 pass
- `npm test`: 424/424 pass
- `npm run check:syntax`: pass
- `git diff --check`: pass
- `node -e "JSON.parse(...)"`: project-context ok

## 后续约束

1. 后续 service lifecycle 阶段必须显式设计 start/stop、health、logs、disable/uninstall cleanup 和 failure state。
2. 真正执行 shell commands 前必须设计 stdout/stderr、result file、env、stdin JSON、timeout、stop/cleanup 和 user confirmation。
3. Dashboard opening 只应继续作为用户显式动作，不能自动打开，也不能暗示 OpenPet 托管或审计第三方页面。
