# Phase 48 开发文档：Control Center Pane Prop Surfaces

## 目标

Phase 48 的目标是把 TypeScript 从 Control Center hooks 继续推进到 Pane 组件的 props 边界。范围限制在 renderer 的 Control Center 层和共享 view contracts，不改变 Electron 主进程、插件沙箱、PetService 状态源、pet pack runtime 或 `cat_anime/` 资产结构。

本阶段延续 Phase 47 的迁移节奏：先约束高漂移 UI 数据面，再考虑 main-process JSDoc adapters 或 service boundary。核心判断是 hook 产出的 `paneProps` 必须由 Pane 自己的 props contract 检查，避免 TS 只覆盖取数逻辑而不覆盖组件实际消费面。

## 本阶段完成内容

- 将 7 个 Control Center Pane 从 `.jsx` 迁移为 `.tsx`：
  - `PetPane`
  - `ActionsPane`
  - `AiPane`
  - `PluginsPane`
  - `CatalogPane`
  - `ServicePane`
  - `AboutPane`
- 为每个 Pane 导出 props interface，并让对应 hook 的 `paneProps` 使用 `satisfies XxxPaneProps` 校验。
- 将小型 renderer 依赖迁移为 typed TS：
  - `Toggle`
  - `SegmentedControl`
  - `constants`
- 补齐共享 contracts 中已经由 runtime 返回、但之前未完整声明的字段：
  - action / pet pack preview atlas metadata
  - action `loop` 和 `previewSprite`
  - pet pack inspection `folderName`
  - catalog pet pack `previewImage` 和 `reportUrl`
  - plugin config schema `title` 和 `description`
  - about update `owner` / `repo`
  - update asset `name`
- 为插件配置字段增加 renderer 侧窄守卫，只渲染可显示的 schema 字段，避免未知插件 schema 直接进入表单。
- 收窄 action import inspection 状态，只把未取消且带检查报告的结果交给 `ActionsPane`。
- 保持 Control Center UI 行为不变，继续由 Playwright smoke 覆盖主要 tab workflow。

## Review 结论

production review 没有发现需要修复的 P0/P1/P2 问题。

重点复查项：

- JSX 到 TSX 的迁移没有留下对已删除 `.jsx` Pane/组件路径的运行时代码导入。
- `satisfies XxxPaneProps` 已经把 hook output 和 Pane input 连成同一条 TS 检查链。
- 插件 config schema 仍只在 renderer 做显示守卫，schema 归一化和配置验证继续留在 main-process plugin service。
- 新增 shared contract 字段来自现有 service 或 catalog payload，没有扩大权限、secret、插件执行或本地 HTTP API 边界。

## 验收

- `npm run typecheck` 覆盖 Pane props、hook `paneProps`、共享 payload contract 和 TSX 组件。
- `npm run check:syntax` 完成 Node syntax、typecheck 和 Control Center production build。
- `npm run test:control-center` 保持 10/10。
- `npm test` 保持 394/394。
- `git diff --check` 通过。
- 不改变 API key、插件权限、PetService 单一事实源或 `cat_anime/` 结构。

## 验证

```bash
npm run typecheck
npm run check:syntax
npm run test:control-center
npm test
git diff --check
```

当前结果：

- `npm run typecheck`: pass
- `npm run check:syntax`: pass
- `npm run test:control-center`: 10/10 pass
- `npm test`: 394/394 pass
- `git diff --check`: pass

## 后续约束

1. 下一步 TypeScript 迁移应优先进入 main-process JSDoc adapters 或高漂移 service boundary，而不是一次性主进程 TS/ESM rewrite。
2. Pane props 之后新增的 Control Center state 或 handler 必须先扩展 Pane props interface，再由 hook `satisfies` 对接。
3. 插件 config schema 在 renderer 只做展示守卫；配置合法性和 secret-like 字段拒绝继续由主进程服务负责。
