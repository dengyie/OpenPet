# Phase 35 开发文档：TypeScript Control Center 契约迁移

> 阶段目标：把 Phase 33 的 TypeScript 迁移框架推进到真实 Control Center 数据边界，让默认状态、clone helper 和共享视图契约进入 `noEmit` typecheck。
> 范围约束：不改变 Electron 主进程模块系统，不迁移 React panes/hooks 到 TSX，不改变 Control Center UI 行为。

## 1. 背景

Phase 33 已建立 TypeScript scaffold，并用 `src/shared/ipc-channels.ts` 证明 TS shared contract 可以与 CommonJS runtime 共存。下一步需要把类型检查从单一 IPC 常量扩展到真实产品数据形状，否则后续 Control Center API facade、hooks、pet pack、plugin 和 catalog 迁移仍缺少共享契约。

本阶段选择 Control Center 默认状态和 clone helper 作为第二个迁移点，因为它们同时承载 Pet、AI、Service、Actions、Pet Packs、Catalog、About 和 Update Check 的视图数据，是后续 UI/API TS 化的入口。

## 2. 实现记录

- 新增 `src/shared/openpet-contracts.ts`：
  - Control Center settings 类型。
  - AI config / behavior 类型。
  - local service runtime 和 log 类型。
  - actions、pet packs、catalog、blocklist 类型。
  - About / update check / chat message 类型。
- 将 `src/control-center/src/lib/defaults.js` 迁移为 `src/control-center/src/lib/defaults.ts`。
- 使用 `satisfies` 约束默认值，确保默认数据和共享契约同步。
- 为 clone helpers 增加输入/输出类型：
  - `cloneSettings`
  - `cloneAiConfig`
  - `cloneServiceStatus`
  - `cloneActionsConfig`
  - `clonePetPacks`
  - `cloneCatalog`
  - `cloneChatMessages`
  - `cloneAboutInfo`
  - `cloneUpdateCheck`
- 更新 Control Center 内部 imports，从 `../lib/defaults.js` 改为 `../lib/defaults`，让 Vite/TypeScript 解析 `.ts` 源。

## 3. 行为保持

- 默认设置值不变。
- Demo API session storage 行为不变。
- Control Center tab、保存配置、Catalog 安装/更新、Service session 管理和手动插件安装 review 的 UI 路径不变。
- TypeScript 仍为 `noEmit`，运行时继续由 Vite 构建 Control Center，不引入主进程 TS loader。

## 4. 后续迁移顺序

1. 继续把 `src/control-center/src/api/control-center-api.js` 迁移为 TS，让 demo API 和 preload API facade 使用共享契约。
2. 迁移 `src/control-center/src/hooks/` 中的数据 hook。
3. 将 pet pack manifest、plugin manifest 和 catalog service 的类型从 view contract 拆到更靠近 domain 的 shared contract。
4. 在主进程服务逐步补 JSDoc 或 TS helper，先不改 CommonJS runtime。

## 5. 验证

```bash
npm run typecheck                         # PASS
npm run check:syntax                      # PASS
node --test tests/shared/ipc-channels.test.js # PASS, 1/1
npm run test:control-center               # PASS, 9/9
npm test                                  # PASS, 319/319
npm run pack                              # PASS, unsigned macOS directory pack; signing/notarization skipped without local credentials
git diff --check                          # PASS
```

## 6. Review 结论

- 本阶段只迁移共享契约和 Control Center defaults，不改变运行时行为。
- Control Center UI 回归和 Node 全量测试均通过。
- 后续风险集中在 API facade / hooks 仍是 JS，下一阶段需要继续把共享契约接入调用边界。
