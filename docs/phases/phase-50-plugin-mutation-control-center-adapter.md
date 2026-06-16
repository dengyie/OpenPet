# Phase 50 开发文档：Plugin Mutation Control Center Adapter

## 目标

Phase 50 延续 Phase 49 的主进程 `@ts-check` adapter 路线，把插件 install/update/uninstall 的 Control Center 返回结构从 IPC handler 内联拼装迁到 `src/main/control-center-adapters.js`。

本阶段只收敛 renderer-facing payload shape，不改变插件安装、更新、卸载的业务规则，不扩大插件权限，不暴露 API key，也不做主进程 TypeScript/ESM 重写。

## 本阶段完成内容

- 扩展 `src/main/control-center-adapters.js`：
  - 新增 `PluginMutationResult` 和 `PluginViewState` JSDoc contract import。
  - 新增 `createPluginMutationResult(result, plugins)`。
  - 只保留已知 mutation metadata：`pluginId`、`installMode`、`disabled`、`storageRemoved`。
  - 始终附带刷新后的 `plugins` 列表。
- 更新 `src/main/ipc.js`：
  - `PLUGINS_INSTALL` 使用 adapter 返回插件 mutation result。
  - `PLUGINS_UPDATE` 使用 adapter 返回插件 mutation result。
  - `PLUGINS_UNINSTALL` 使用 adapter 返回插件 mutation result。
- 更新 `src/shared/openpet-contracts.ts`：
  - `PluginMutationResult` 补齐既有卸载返回字段 `storageRemoved`。
- 扩展测试：
  - `tests/main/control-center-adapters.test.js` 覆盖 plugin mutation adapter shape。
  - `tests/main/ipc-plugin-install.test.js` 覆盖 install/update/uninstall IPC handler 返回刷新后的插件列表，并验证 `removeStorage` 传递。

## Review 结论

production review 没有发现需要修复的 P0/P1/P2 问题。

重点复查项：

- Adapter 只做返回结构收敛，安装、更新、卸载仍由 `pluginInstallService` 执行业务校验和文件/设置变更。
- `storageRemoved` 是既有 service 返回字段，本阶段只把 shared contract 补齐到真实 payload。
- `PLUGINS_CLEAR_STORAGE` 没有迁入 `PluginMutationResult`，因为它返回的是 `Partial<PluginViewState>`，属于不同契约。
- 错误路径仍由原 service throw，Control Center hook 的 catch 分支继续刷新插件列表。

## 验收

- `npm run typecheck` 覆盖 `createPluginMutationResult` 的 JSDoc contract。
- 插件 install/update/uninstall IPC 返回 `PluginMutationResult`，并包含 mutation metadata 与刷新后的 `plugins`。
- 卸载路径保留 `storageRemoved`。
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
- targeted adapter/IPC tests: 12/12 pass
- `npm run check:syntax`: pass
- `npm run test:control-center`: 10/10 pass
- `npm test`: 401/401 pass
- `git diff --check`: pass

## 后续约束

1. 下一批主进程 adapter 应优先选择 Pet pack mutation result、About/update payload 或其他 high-drift service boundary。
2. Adapter 只能做 view-shape 收敛和安全默认值，业务校验继续留在对应 service。
3. 继续用小型 `@ts-check` islands 扩展覆盖面，避免一次性主进程 TS/ESM rewrite。
