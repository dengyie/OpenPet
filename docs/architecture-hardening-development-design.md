# OpenPet 架构加固设计开发文档

> 日期：2026-06-25
> 基线：`main@1f01cf2`
> 状态：设计待确认
> 范围：基于整体架构 review 的后续开发设计，优先加固配置状态边界、IPC 契约边界，并为插件服务和 IPC 编排拆分定义分阶段路径。

## 1. 背景

OpenPet 已经从单窗口桌宠演进为 Electron 桌宠平台。当前架构主方向是合理的：

- `main.js` 负责装配服务和生命周期。
- `PetService` 是宠物 `say` / `action` / `event` 的统一入口。
- Control Center 通过 preload IPC 访问主进程能力。
- 插件通过权限、Token bridge、子进程和本地 runner 隔离敏感能力。
- API key 留在主进程服务和 secret 层，不暴露给 renderer 或普通插件。

本次 review 没有发现阻塞级架构问题，但平台继续增长后，以下边界已经开始变脆：

- `SettingsService` 返回浅拷贝，嵌套状态所有权不够硬。
- IPC channel 在 shared 和 preload 中多份手写维护，容易漂移。
- `PluginService` 同时承载权限、bridge、进程生命周期、存储、日志和 Creator 能力，安全审计成本偏高。
- `ipc.js` 仍承载部分业务编排，未来复用时容易复制逻辑。

## 2. 目标

### 2.1 第一阶段目标

第一阶段只做低风险架构加固，不改变用户可见功能：

- `SettingsService.get()`、`save()`、`preview()` 返回和保存的配置快照不共享嵌套引用。
- 开发和测试环境尽早暴露直接修改 settings 快照的错误用法。
- 主进程 shared IPC channel 与 preload 暴露的 channel 保持可测试一致。
- 保持 `npm start`、`npm test`、`npm run check:syntax` 的现有行为。

### 2.2 第二阶段目标

第二阶段开始拆分高风险中心模块，但保持对外 API 稳定：

- 从 `plugin-service.js` 抽出插件能力网关、命令 bridge、运行时管理和存储日志模块。
- 从 `ipc.js` 抽出 AI chat、宠物移动、本地 HTTP 配置等用例编排服务。
- IPC 层逐步退回到参数适配、调用服务、返回 view model。

## 3. 非目标

本设计不做以下事情：

- 不重写主进程为 TypeScript 或 ESM。
- 不改变 `cat_anime/` 资源结构。
- 不放宽插件权限或增加任意 Node/Electron 访问能力。
- 不改变现有 Control Center 用户流程。
- 不一次性拆完所有大文件。
- 不把文档阶段编号继续堆到历史 phase 流水线里。

## 4. 待确认决策

| 决策 | 推荐方案 | 备选方案 | 影响 |
| --- | --- | --- | --- |
| 开发分支 | `codex/architecture-hardening` 或当前文档分支后续改名/延续 | 直接在现有功能分支做 | 推荐独立分支，方便 review 和回滚。 |
| 第一阶段范围 | 只做 `SettingsService` 深拷贝/冻结和 IPC parity test | 同时拆 `plugin-service.js` | 推荐先小步加固，避免行为变更过大。 |
| deep clone 实现 | 优先使用 `structuredClone`，回退 JSON clone | 引入第三方库 | 当前 settings 是 JSON 形态，避免新增依赖。 |
| deep freeze 范围 | 仅测试环境默认启用，开发环境可选启用 | 所有环境启用 | 生产启用 freeze 可能带来兼容和性能风险。 |
| preload 契约策略 | 增加 parity test 解析 preload `IPC` 对象 | 生成 preload 常量 | 先测试守住漂移，后续再生成化。 |

## 5. 第一阶段详细设计

### 5.1 SettingsService 快照边界

当前问题：

- `src/main/services/settings-service.js` 的 `get()` 只做 `{ ...currentSettings }`。
- `currentSettings.plugins`、`currentSettings.ai`、`currentSettings.localHttp` 等嵌套对象仍与返回值共享引用。
- 未来调用方若写 `settingsService.get().plugins.enabled.foo = true`，会绕过 `saveSettings`、`syncSideEffects` 和 `settings:changed`。

设计：

- 新增内部 `cloneSettings(value)` helper。
- `get()` 返回深拷贝。
- `save(settings)` 先深拷贝输入，再持久化和触发事件。
- `preview(partialSettings)` 生成下一份 settings 后返回深拷贝，并向事件总线发送深拷贝。
- 测试环境可对 `get()` 和 `preview()` 返回值做 deep freeze，帮助测试捕获非法嵌套写入。

建议实现形态：

```js
const cloneJson = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}
```

约束：

- settings 当前应保持 JSON serializable。
- 不在 `SettingsService` 内直接做 schema migration，migration 仍属于 `src/main/settings.js`。
- 如果后续 settings 里引入 `Date`、`Map`、函数或 class，需要先重新定义配置持久化契约。

### 5.2 SettingsService 测试

新增测试覆盖：

- `get()` 返回的嵌套对象被修改后，再次 `get()` 不受影响。
- `save()` 后修改传入对象，不会污染内部状态。
- `settings:changed` 事件收到的嵌套对象被修改，不会污染内部状态。
- `preview()` 返回值和事件 payload 不污染内部状态。

建议文件：

- `tests/services/settings-service.test.js`

### 5.3 IPC preload 契约一致性

当前问题：

- `src/shared/ipc-channels.js` 是主进程常量。
- `src/shared/ipc-channels.ts` 是 TS 侧常量。
- `preload.js` 和 `control-center-preload.js` 又各自手写 `IPC` 对象。
- 现有 `tests/shared/ipc-channels.test.js` 只验证 shared 常量，不验证 preload 副本。

设计：

- 增加一个测试 helper，从 preload 文件源码中提取 `const IPC = { ... }` 对象。
- 将 preload 内声明的 channel value 与 `src/shared/ipc-channels.js` 对比。
- pet preload 只需是 shared IPC 的子集。
- control-center preload 只需是 shared IPC 的子集。
- 对每个 preload 暴露 API 使用到的 channel，必须存在于对应 preload `IPC` 对象中。

建议文件：

- 新增 `tests/shared/ipc-preload-contract.test.js`

验收标准：

- shared 中不存在的 preload channel 会测试失败。
- preload channel 拼写漂移会测试失败。
- 删除 shared channel 但忘记改 preload 会测试失败。

## 6. 第二阶段拆分设计

第二阶段需要等第一阶段稳定后再做，避免一次性大改。每一步都应保持现有外部方法名不变，并用现有测试兜住行为。

### 6.1 PluginService 拆分

当前 `plugin-service.js` 主要职责：

- 插件列表和 manifest 读取。
- 插件配置、存储、日志。
- 权限校验。
- 本地插件 SDK。
- declaration command bridge HTTP server。
- setup、command、service runtime 生命周期。
- service health policy。
- Creator action / asset / pet-pack / model bridge 能力。

目标拆分：

| 新模块 | 职责 | 初始依赖 |
| --- | --- | --- |
| `plugin-registry-service.js` | 读取 official/local plugin manifest，合并 view state | `pluginDirs`、`officialPlugins` |
| `plugin-permission-gateway.js` | `assertPermission`、policy block、signature 状态 | settings、catalog policy |
| `plugin-storage-service.js` | plugin config/storage/logs 读写、大小限制 | `settingsService` |
| `plugin-command-bridge-service.js` | bridge server、token、route dispatch、短时 runtime | pet/action/pet-pack/model adapters |
| `plugin-runtime-manager.js` | setup/command/service process lifecycle、stop/cleanup/health timer | spawn/kill/timers |
| `plugin-creator-bridge-adapters.js` | Creator actions/assets/pack/model 能力适配 | action/petPack/image services |

迁移顺序：

1. 先抽纯函数和 storage/log helper，保证行为不变。
2. 再抽 command bridge server，保留 `createPluginService` 对外 facade。
3. 再抽 process runtime manager。
4. 最后把 Creator bridge handler 分到 adapter。

每一步完成后运行：

- `npm run test:core`
- 针对插件变更运行 `node --test tests/services/plugin-service.test.js`
- `npm run check:syntax`

### 6.2 IPC 编排拆分

当前 `ipc.js` 同时做：

- IPC handler 注册。
- view model 转换。
- AI chat 请求日志、气泡派发、行为决策。
- pet drag/home anchor 保存。
- local HTTP start/stop/token rotate 与 settings 保存。
- native picker 调用。

目标拆分：

| 新模块 | 职责 | IPC 保留内容 |
| --- | --- | --- |
| `pet-chat-orchestrator-service.js` | AI chat、bubble、behavior decision、日志 | 调用 service 并返回结果 |
| `pet-movement-service.js` | drag clamp、home anchor、display change normalization | 从 event 取窗口和参数 |
| `local-http-config-service.js` | save config、rotate token、start/stop runtime、revoke sessions | 参数适配和 view adapter |
| `native-picker-service.js` | cursor/action/plugin/pet-pack picker 封装 | 调用 picker service |

迁移顺序：

1. 先抽 `local-http-config-service.js`，因为边界较小且有明确一致性风险。
2. 再抽 `pet-movement-service.js`，保留窗口依赖注入。
3. 最后抽 `pet-chat-orchestrator-service.js`，因为日志和 AI Talk 依赖最多。

每一步完成后运行：

- `npm run test:core`
- `node --test tests/main/ipc-*.test.js tests/main/pet-chat-ipc.test.js`
- `npm run check:syntax`

## 7. 风险与回滚

### 7.1 Settings deep clone 风险

风险：

- 某些调用方可能依赖修改 `get()` 返回值的嵌套对象再交给 `save()` 的隐式共享行为。

缓解：

- 先跑全量 Node 测试。
- 如果发现依赖共享引用的代码，改为显式构造 next settings。
- 保持 `save()` 入参仍接受普通对象，不改变调用签名。

回滚：

- 可以单独回滚 `settings-service.js` 的 clone/freeze helper 和相关测试。

### 7.2 IPC parity test 风险

风险：

- preload 内的 `IPC` 对象格式如果变化，解析测试会误报。

缓解：

- 测试只解析简单对象 literal，不执行 preload。
- 如果后续转为生成常量，测试可改为比较生成源。

回滚：

- 可单独删除 parity test，不影响运行时代码。

### 7.3 PluginService 拆分风险

风险：

- bridge token 生命周期、runtime cleanup、权限校验顺序被拆分时误改。

缓解：

- 每一步只迁移一个职责。
- 保持 `createPluginService` facade 对外 API 不变。
- 每一步都运行 plugin-service 单测和 core 测试。

回滚：

- 每次拆分做独立 commit，异常时回滚单步 commit。

## 8. 验收清单

第一阶段完成标准：

- `SettingsService` 不暴露嵌套可变内部状态。
- settings 相关新增测试通过。
- preload IPC 契约一致性测试通过。
- `npm test` 通过。
- `npm run check:syntax` 通过。
- `npm start` 不受影响。

第二阶段完成标准：

- `createPluginService` 对外 API 不变。
- 插件 bridge、permission、storage、runtime 行为与拆分前一致。
- `registerIpcHandlers` 对外注册行为不变。
- IPC 层业务编排明显减少，核心用例进入 service。
- 对应 core/UI smoke 测试通过。

## 9. 建议实施顺序

推荐下一步按以下提交粒度执行：

1. `docs: add architecture hardening design`
2. `test: cover settings snapshot isolation`
3. `fix: deep clone settings service snapshots`
4. `test: cover preload ipc channel parity`
5. `refactor: extract plugin storage helpers`
6. `refactor: extract plugin command bridge`
7. `refactor: extract local http config service`

前四步可以作为第一批 PR 或一个小分支完成。后续拆分建议每一步单独 review。

