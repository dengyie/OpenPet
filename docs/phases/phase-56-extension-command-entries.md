# Phase 56 开发文档：Extension Command Entries

## 目标

Phase 56 将 Phase 55 的 extension 生态语言推进到第一块 runtime-backed 能力：OpenPet 能规范化并审查 `plugin.json` 中的 `entries.commands`、`entries.services`、`entries.dashboards`、`manifest`、`config` 和 `assets` 声明，并允许仍提供 JavaScript `main` 的兼容包通过现有 runner 执行 `entries.commands` 中的 command id。

本阶段不执行 shell command 字符串，不启动长期 service，不打开 dashboard，不运行 setup，不新增 bridge，也不升级 sandbox 声明。

## 本阶段完成内容

- 扩展 `src/main/plugins/manifest.js`：
  - 规范化 `entries.commands`、`entries.services` 和 `entries.dashboards`。
  - 当 legacy 顶层 `commands` 缺失时，从 `entries.commands` 派生可见 command list。
  - 当 legacy 顶层 `commands` 存在时，继续以它作为兼容 command list。
  - 支持 `config` 作为 `configSchema` 的 extension-first 别名，并要求两者同时出现时指向同一文件。
  - 保留 `manifest` disclosure object 和 `assets` package-relative path 列表。
- 扩展 `src/main/services/plugin-install-service.js`：
  - 安装审查可以接受 declaration-only extension 包，不再强制要求 legacy `main`，但包必须有 `main` 或至少一个 extension entry。
  - 审查阶段验证 `config` / `configSchema` 和 `assets` 路径存在且保持在包内。
  - Review payload 暴露 `entries`、`manifest`、`assets` 和 `config`。
- 扩展 `src/shared/openpet-contracts.ts` 与 demo fixture：
  - 增加 command/service/dashboard entry view contracts。
  - `PluginManifestViewState` 和 `PluginViewState` 包含 `entries`。
- 补充测试：
  - Manifest normalization、unsafe declaration rejection、legacy command precedence。
  - Install review 接受无 legacy `main` 的 declaration package，并拒绝缺失 asset。
  - PluginService 可通过现有 JavaScript compatibility runner 执行 `main` + `entries.commands` 包。
  - PluginService 会展示 declaration-only extension entries，但保持 `runnable: false` 并拒绝执行其 command。
  - Shared type fixture 覆盖 entries view shape。

## 边界

本阶段只让 extension entry 声明进入 host contract 和现有 JS runner 兼容路径。

仍未实现：

- shell command execution；
- service start/stop/process health；
- dashboard open action；
- setup status / cleanup command；
- local bridge token / endpoint；
- 更强 sandbox 或权限代理。

## 验收

- `normalizePluginManifest()` 总是返回稳定 `entries` 对象。
- Existing legacy plugin manifests 继续保留顶层 `commands` 行为。
- `entries.commands` 可在顶层 `commands` 缺失时成为可见 command list。
- JavaScript compatibility 包如果声明 `main`，可用 `entries.commands` id 通过 `PluginService.runCommand()` 运行。
- Service/dashboard entries 只作为可见声明，不会自动运行或打开。
- Declaration-only extension 包可以被列出和审查，但没有 `main` 时不可运行。
- Production Code Quality Review 完成并记录。
- `npm run check:syntax`、`npm run test:control-center`、`npm test`、`git diff --check` 通过。

## 验证

```bash
node --test tests/plugins/manifest.test.js tests/services/plugin-install-service.test.js tests/services/plugin-service.test.js
npm run typecheck
npm run check:syntax
npm run test:control-center
npm test
git diff --check
```

当前结果：

- `node --test tests/plugins/manifest.test.js tests/services/plugin-install-service.test.js tests/services/plugin-service.test.js`: pass
- `npm run typecheck`: pass
- `npm run check:syntax`: pass
- `npm run test:control-center`: 10/10 pass
- `npm test`: 418/418 pass
- `git diff --check`: pass
- `node -e "JSON.parse(...)"`: project-context ok

## 后续约束

1. 后续 service/dashboard runtime 阶段必须继续避免把 source labels 写成能力隔离或安全保证。
2. 真正执行 shell commands 前必须设计 stdout/stderr、result file、env、stdin JSON、timeout、stop/cleanup 和 user confirmation。
3. Dashboard 打开前必须定义 URL 展示、local service readiness、用户确认和失败日志。
