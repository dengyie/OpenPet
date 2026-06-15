# Phase 33 开发文档：TypeScript 迁移框架

> 阶段目标：建立 OpenPet 渐进式 TypeScript 迁移基线，让后续模块可以在不破坏 Electron 运行时和既有测试的前提下逐步 TS 化。
> 范围约束：不切换 `package.json` 的 `"type"`，不引入 Electron 主进程 TS runtime loader，不一次性迁移 service / renderer / Control Center。

## 1. 背景

OpenPet 当前已经是平台型项目：主进程 service、IPC、Control Center、插件 SDK、pet pack schema、catalog 和本地 HTTP/MCP 都依赖稳定的数据契约。继续纯 JS 开发会让字段漂移和 IPC payload 漏改越来越难发现。

本阶段先补迁移框架，而不是直接大面积改业务代码：先让 TypeScript 能被安装、检查、纳入日常命令，再挑一个 shared contract 做最小迁移样板。

## 2. 迁移原则

- JS/TS 共存。
- 先类型化边界，再类型化实现。
- 每个迁移模块必须保留原有 runtime API。
- 每个迁移模块必须有 Node test 或 UI regression 覆盖。
- 主进程 CommonJS 暂不改为 ESM。
- TypeScript 只做 `noEmit` 检查，运行时仍使用现有 JS 文件。

## 3. 实现记录

- 新增 `typescript` dev dependency。
- 新增 `tsconfig.json`：
  - `allowJs: true`
  - `checkJs: false`
  - `strict: true`
  - `noEmit: true`
  - `jsx: react-jsx`
- 新增 `npm run typecheck`。
- 更新 `npm run check:syntax`，串联：
  - `npm run check:node`
  - `npm run typecheck`
  - `npm run build:control-center`
- 新增 `src/shared/ipc-channels.ts`，导出冻结的 IPC contract 和 `IpcChannelName` 类型。
- 保留 `src/shared/ipc-channels.js` 作为 CommonJS runtime bridge，并冻结导出的 `IPC` 对象。
- 新增 `tests/shared/ipc-channels.test.js`，锁定关键通道名和冻结行为。

## 4. 后续迁移顺序

1. `src/shared/`：IPC payload、settings、pet pack、plugin manifest、catalog 类型。
2. `src/control-center/src/api/`：Control Center API facade 和 demo API。
3. `src/control-center/src/hooks/` 与 panes/components：React TSX 迁移。
4. `src/main/pet-pack/` 与 `src/main/services/pet-pack-service.*`。
5. `src/main/services/plugin-*`、`catalog-service`、`settings-service`。
6. scripts/tests 在 runtime contract 稳定后逐步迁移。

## 5. 验证

```bash
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
```

结果将在本阶段完成后补录。

结果：

- `npm run typecheck` 通过。
- `npm run check:syntax` 通过。
- `npm test` 通过，319/319 Node tests pass。
- `npm run test:control-center` 通过，9/9 Playwright tests pass。
- `git diff --check` 通过。
