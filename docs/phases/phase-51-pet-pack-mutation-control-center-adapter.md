# Phase 51 开发文档：Pet Pack Mutation Control Center Adapter

## 目标

Phase 51 延续 Phase 49/50 的主进程 `@ts-check` adapter 路线，把 Pet pack import/set-active/remove 的 Control Center 返回结构从 IPC handler 内联拼装迁到 `src/main/control-center-adapters.js`。

本阶段只收敛 renderer-facing payload shape，不改变 Pet pack 导入、启用、删除的业务规则，不改变动画 reload 顺序，不扩大插件权限，不暴露 API key，也不做主进程 TypeScript/ESM 重写。

## 本阶段完成内容

- 扩展 `src/main/control-center-adapters.js`：
  - 新增 `ActionsConfigViewState`、`PetPackMutationResult` 和 `PetPacksViewState` JSDoc contract import。
  - 新增 `createPetPackMutationResult(result, petPacks, animations)`。
  - 只保留已知 mutation metadata：`pack`、`activePackId`。
  - 始终附带刷新后的 `petPacks`。
  - 仅在 set-active 路径传入时附带 `animations`。
- 更新 `src/main/ipc.js`：
  - `PET_PACKS_IMPORT` 使用 adapter 返回 Pet pack mutation result。
  - `PET_PACKS_SET_ACTIVE` 使用 adapter 返回 Pet pack mutation result，并保留动画刷新与 preview 获取顺序。
  - `PET_PACKS_REMOVE` 使用 adapter 返回 Pet pack mutation result。
- 扩展测试：
  - `tests/main/control-center-adapters.test.js` 覆盖 pet pack mutation adapter shape。
  - `tests/main/ipc-plugin-install.test.js` 覆盖 import/set-active/remove IPC handler 返回刷新后的 Pet pack view，并验证 set-active 会通知宠物窗口动画更新。

## Review 结论

production review 没有发现需要修复的 P0/P1/P2 问题。

重点复查项：

- Adapter 只做返回结构收敛，导入、启用、删除仍由 `petPackService` 执行业务校验、文件变更和设置保存。
- `PET_PACKS_EXPORT` 没有迁入 `PetPackMutationResult`，因为它返回的是导出文件结果，属于不同契约。
- set-active 路径仍先调用 `reloadAndSendAnimations`，再获取 preview animations 和刷新后的 Pet pack list。
- 错误路径仍由原 service throw，Control Center hook 的 catch 分支继续显示错误。

## 验收

- `npm run typecheck` 覆盖 `createPetPackMutationResult` 的 JSDoc contract。
- Pet pack import/set-active/remove IPC 返回 `PetPackMutationResult`，并包含刷新后的 `petPacks`。
- set-active 路径保留 `animations`，并继续通知宠物窗口 `PET_ANIMATIONS_CHANGED`。
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
- targeted adapter/IPC tests: 14/14 pass
- `npm run check:syntax`: pass
- `npm run test:control-center`: 10/10 pass
- `npm test`: 403/403 pass
- `git diff --check`: pass

## 后续约束

1. 下一批主进程 adapter 应优先选择 About/update payload 或其他 high-drift service boundary。
2. Adapter 只能做 view-shape 收敛和安全默认值，业务校验继续留在对应 service。
3. 继续用小型 `@ts-check` islands 扩展覆盖面，避免一次性主进程 TS/ESM rewrite。
