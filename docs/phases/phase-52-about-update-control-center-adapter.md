# Phase 52 开发文档：About Update Control Center Adapter

## 目标

Phase 52 延续 Phase 49-51 的主进程 `@ts-check` adapter 路线，把 About 信息和更新检查 payload 的 Control Center 返回结构从 IPC handler 直返 service payload 迁到 `src/main/control-center-adapters.js`。

本阶段只收敛 renderer-facing payload shape，不改变 GitHub release 检查逻辑，不改变 release readiness 口径，不新增网络能力，不暴露 secret，也不做主进程 TypeScript/ESM 重写。

## 本阶段完成内容

- 扩展 `src/main/control-center-adapters.js`：
  - 新增 `AboutInfoViewState`、`AboutUpdateInfo` 和 `UpdateCheckViewState` JSDoc contract import。
  - 新增 `createAboutUpdateInfo(update)`。
  - 新增 `createAboutInfoView(info)`。
  - 新增 `createUpdateCheckView(result)`。
  - 为未配置、错误、timeout 等 update-check payload 补齐 `prerelease`、`releaseUrl`、`assets` 等 shared contract 字段。
  - 对 `owner` 和 `repo` optional 字段做 string-only 透传。
- 更新 `src/main/ipc.js`：
  - `ABOUT_GET_INFO` 使用 adapter 返回 About view。
  - `ABOUT_CHECK_UPDATES` await service result 后使用 adapter 返回 update-check view。
- 扩展测试：
  - `tests/main/control-center-adapters.test.js` 覆盖 About 和 update-check adapter 默认值。
  - `tests/main/ipc-plugin-install.test.js` 覆盖 About IPC handler 返回稳定 view shape。

## Review 结论

production review 没有发现需要修复的 P0/P1/P2 问题。

Review 中做了一处优化：

- `createAboutUpdateInfo` 对 `owner` / `repo` 只透传 string，避免异常 service payload 让 IPC view contract 漂移。

重点复查项：

- Adapter 只做 view-shape 收敛；GitHub release fetch、timeout、平台资产筛选和错误消息仍由 `aboutService` 负责。
- `ABOUT_CHECK_UPDATES` 仍传播 service rejection；正常 service 分支继续返回 status/message，而不是吞掉错误。
- release readiness 文档口径未改变，Windows 仍不是 release-ready。

## 验收

- `npm run typecheck` 覆盖 About/update adapter 的 JSDoc contract。
- `ABOUT_GET_INFO` 返回完整 `AboutInfoViewState`。
- `ABOUT_CHECK_UPDATES` 返回完整 `UpdateCheckViewState`，包括未配置路径的默认字段。
- `npm run check:syntax`、`npm run test:control-center`、`npm test` 和 `git diff --check` 通过。
- 不改变 API key、插件权限、PetService 单一事实源或 `cat_anime/` 结构。

## 验证

```bash
npm run typecheck
node --test tests/main/control-center-adapters.test.js tests/main/ipc-plugin-install.test.js
npm run check:syntax
npm run test:control-center
npm test
git diff --check
```

当前结果：

- `npm run typecheck`: pass
- targeted adapter/IPC tests: 16/16 pass
- `npm run check:syntax`: pass
- `npm run test:control-center`: 10/10 pass
- `npm test`: 405/405 pass
- `git diff --check`: pass

## 后续约束

1. 下一批 TypeScript 边界应从新的 high-drift service payload 或 evidence/report payload 中选择。
2. Adapter 只能做 view-shape 收敛和安全默认值，业务校验继续留在对应 service。
3. 继续用小型 `@ts-check` islands 扩展覆盖面，避免一次性主进程 TS/ESM rewrite。
