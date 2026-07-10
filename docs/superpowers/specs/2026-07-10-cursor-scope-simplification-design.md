# Cursor Scope Simplification Design

> Date: 2026-07-10
> Status: reviewed requirements
> Scope: Control Center 自定义指针页面精简、指针作用范围选择、后续实现边界
> Out of scope: 重新设计宠物动作系统、重写上传链路、替换现有宠物窗口 hitbox/overlay 算法

## 1. 背景

当前 OpenPet 的自定义指针功能已经具备这些能力：

- 在 Control Center 的 Pet 页面选择内置或上传的 cursor card。
- 上传 PNG / WEBP 指针资源。
- 为当前选中的指针独立调整尺寸，并按比例同步 hotspot。
- 在宠物交互区域内显示自定义 cursor overlay。
- 用 `selectedCursorId`、`customCursor`、`customCursors`、`hiddenCursorIds` 持久化当前选择和指针数据。

当前页面的问题是：在顶部 cursor card 区和尺寸调节区下面，又出现了一个“指针库状态 / 管理列表”面板。这个面板和顶部 card 的删除、选择、使用中状态重复，导致 UI 变重，也让用户误以为 cursor 需要进入另一套管理流程。

用户这次的明确目标是：

- 保留顶部自定义 cursor UI。
- 删除下面的管理 cursor UI。
- 增加一个勾选能力，让用户选择自定义 cursor 只作用在 OpenPet 上，还是作用在整个电脑上。

## 2. 需求目标

### 2.1 页面精简

Cursor 设置区域只保留紧凑的顶部能力：

- 标题和说明：`指针选择` 及说明文字。
- 指针 card 横向选择行：内置指针、用户上传指针、添加自定义。
- 当前指针大小调节行：只针对当前选中的非系统 cursor。
- 新增作用范围选择：默认只作用于 OpenPet，可勾选切到整个电脑。

必须移除：

- `指针库状态` 管理面板。
- 下方面板里的上传指针按钮。
- 下方面板里的列表、使用中标签、内置/已上传标签。
- 下方面板里的重命名、删除、恢复按钮。
- 下方面板相关空状态。

删除后，cursor 的主要交互集中在 card 本身：

- 选择：点击 card。
- 上传：点击 `添加自定义` card。
- 删除：继续使用上传 cursor card 右上角删除按钮。
- 缩放：使用当前指针大小行。

### 2.2 指针作用范围

新增一个用户可理解的作用范围开关：

- 默认：只在 OpenPet 宠物交互区域使用自定义 cursor。
- 勾选：尝试让整个电脑都使用当前自定义 cursor。

推荐 UI 文案：

- 控件标题：`作用范围`
- 未勾选状态：`仅 OpenPet`
- 勾选文案：`应用到整个电脑`
- 辅助说明：`关闭时只影响宠物交互区域；开启后会尝试替换系统指针。`

推荐数据模型：

```ts
type CustomCursorScope = 'openpet' | 'system'

interface ControlCenterSettings {
  customCursorScope: CustomCursorScope
}
```

默认值必须是：

```ts
customCursorScope: 'openpet'
```

不要复用 `customCursor.enabled` 表达作用范围。`customCursor.enabled` 只表示当前是否存在可用的 runtime cursor；`customCursorScope` 表示应用范围。

本轮实现只有 `openpet` 是可保存的有效生效状态。`system` 只表达一个后续原生能力方向；在 `SystemCursorService` 未落地前，UI 不得把 `system` 保存进持久化设置，也不得让用户看到一个已经启用但无实际效果的全电脑模式。

## 3. 当前代码事实

当前相关路径：

- UI：`src/control-center/src/panes/PetPane.tsx`
- Pet 设置状态 hook：`src/control-center/src/hooks/usePetSettingsPane.ts`
- Cursor 数据归一化：`src/shared/cursor-library.ts` 与 `src/shared/cursor-library.js`
- Cursor runtime 样式：`src/shared/cursor-style.js`
- 宠物窗口 overlay：`renderer.js`
- 设置持久化适配：`src/main/ipc/pet-settings-adapter.js`
- 主进程默认设置：`src/main/settings.js`
- demo API：`src/control-center/src/api/demo-control-center-api.ts`
- renderer 回归测试：`tests/renderer-cursor-overlay.test.js`
- Control Center 回归测试：`tests/control-center/control-center-smoke.spec.js`

当前实现本质是 OpenPet 局部 cursor：

- renderer 监听宠物窗口内 pointer 位置。
- 当鼠标在宠物有效交互区域内时，显示 `#custom-cursor-overlay`。
- 同时把宠物窗口内 native cursor 设置为 `none`。
- 当宠物窗口没有 focus 时，会先请求 focus，以减少双 cursor。

这套机制不能天然扩展到“整个电脑”：

- CSS cursor 只能影响当前 WebContents / DOM 区域。
- OpenPet 的 DOM overlay 只能画在 OpenPet 的透明窗口里。
- 其他应用里的 native cursor 无法被 OpenPet renderer CSS 隐藏。
- 如果直接用全屏透明 overlay 模拟全局 cursor，很容易造成双 cursor、输入穿透、性能和权限问题。

## 4. 产品决策

### 4.1 OpenPet 作用范围是当前可交付主路径

`customCursorScope: 'openpet'` 是默认且必须稳定的能力。

行为：

- 只在宠物交互区域显示自定义 cursor。
- 不影响设置页、其他 OpenPet 窗口或其他应用。
- 鼠标离开宠物交互区域后恢复系统原生 cursor。
- 当前已有的 overlay、focus、hitbox、passthrough 逻辑继续服务这个模式。

### 4.2 全电脑作用范围必须是原生能力，不允许假实现

`customCursorScope: 'system'` 代表用户希望整个电脑使用当前 cursor。这个能力不能用纯 CSS 或宠物窗口 overlay 假装完成。

实现前必须满足：

- 有主进程侧 `SystemCursorService` 或等价原生适配层。
- 能检测当前平台是否支持系统级替换。
- 能在退出、崩溃恢复、切回 `openpet`、切回系统默认时恢复原系统 cursor。
- 能记录失败原因并回退到 `openpet`。
- 不得让用户看到两个 cursor。
- 不得让透明全屏窗口挡住其他应用点击。

如果平台暂不支持系统级替换：

- UI 可以显示勾选项，但必须 disabled，并显示不可用原因。
- 或者允许用户点击后给出明确状态：`当前系统暂不支持全电脑指针替换，已保持仅 OpenPet 生效。`
- 不允许保存一个看起来启用了但实际无效果的 `system` 状态。
- 在没有 `SystemCursorService` 的 Phase 2 中，settings 内必须保持 `customCursorScope: 'openpet'`。

### 4.3 全电脑模式的推荐阶段边界

第一阶段只交付：

- UI 精简。
- `customCursorScope` 设置字段。
- OpenPet / 全电脑选择控件。
- 当 `system` 不可用时的禁用或回退，且不保存 `system`。
- OpenPet 局部 cursor 不回退、不破坏。

后续阶段再交付：

- macOS 原生 cursor 方案验证。
- Windows 原生 cursor 方案验证。
- 退出和异常恢复策略。
- 系统 cursor 原始状态备份与还原。
- 真机手动验证。

理由：系统级 cursor 替换是 OS 层能力，不是 Control Center UI 能单独保证的能力。先把产品状态和 UI 边界做好，可以避免把“全电脑模式”做成一个没有实际效果的开关。

## 5. UI 规格

### 5.1 保留区域

Cursor 设置区域结构调整为：

1. `cursor-selection-header`
2. `cursor-options-rail`
3. `cursor-size-panel`
4. `cursor-scope-row`

其中 `cursor-scope-row` 应该是紧凑的一行，不再引入大卡片或列表。

建议布局：

- 左侧：`作用范围`
- 左侧说明：`控制自定义指针只作用于宠物，还是尝试替换系统指针。`
- 右侧：一个 checkbox 或 toggle
- 勾选文案：`应用到整个电脑`

### 5.2 删除区域

必须删除以下 class 对应的 UI：

- `.cursor-management-panel`
- `.cursor-management-header`
- `.cursor-management-actions`
- `.cursor-library-list`
- `.cursor-library-row`
- `.cursor-library-preview`
- `.cursor-library-main`
- `.cursor-library-title`
- `.cursor-library-meta`
- `.cursor-library-actions`
- `.cursor-library-empty`

实现时可以同步删除不再使用的样式，避免死 CSS 继续误导后续开发。

### 5.3 Card 删除语义

管理面板删除后，card 右上角删除按钮仍然是唯一删除入口。

必须明确处理旧的 `hiddenCursorIds`：

- 本轮必须暂停内置 cursor card 删除能力，只允许删除上传 cursor。
- `listCursorOptions(...)` 返回的内置 cursor，包括内置尺寸覆盖项，都必须 `canDelete: false`。
- `BUILTIN_CURSORS` 定义本身也必须 `canDelete: false`，避免 view 层误判。
- 如果未来继续允许删除内置 cursor card，必须先设计一个不依赖下方管理面板的恢复路径。
- 已存在的 `hiddenCursorIds` 不能导致内置 cursor 永久消失且无恢复入口。

本轮强制策略：

- 上传 cursor：card 删除按钮删除记录。
- 内置 cursor：本轮不展示删除按钮，避免无恢复路径。
- 内置 cursor 的大小覆盖仍可通过尺寸滑条产生和保存。
- 如历史设置里已有 `hiddenCursorIds`，本轮读取时必须将内置 cursor 重新暴露到 picker，并在下一次保存时清空这些 hidden 内置 id。
- `onDeleteCursor(...)` 必须拒绝 `source === 'builtin'` 的删除请求，即使旧数据或测试 fixture 误传了 `canDelete: true`。

### 5.4 历史隐藏状态迁移

删除管理面板后，不再存在隐藏内置 cursor 的恢复 UI。因此必须在 Phase 2 做一次安全迁移：

- `normalizeCursorSettingsState(...)` 继续接受 `hiddenCursorIds`，保持旧 settings 文件可读。
- `listCursorOptions(...)` 不再因为 `hiddenCursorIds` 隐藏内置 cursor，所有内置 cursor 默认重新出现在顶部 picker。
- `applyCursorState(...)` 或保存路径应把 `hiddenCursorIds` 归一化为空数组，防止旧隐藏状态继续传播。
- 如果用户当前选中的是历史隐藏的内置 cursor，迁移后保持该内置 cursor 选中并显示。
- 删除上传 cursor 时仍不写入 `hiddenCursorIds`。

## 6. 状态与持久化

### 6.1 Settings contract

新增字段：

```ts
customCursorScope: 'openpet' | 'system'
```

需要同步更新：

- `src/shared/openpet-contracts.ts`
- `src/control-center/src/lib/defaults.ts`
- `src/main/settings.js`
- `src/main/ipc/pet-settings-adapter.js`
- `src/control-center/src/api/demo-control-center-api.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`

### 6.2 Normalize 规则

新增 normalize 函数或内联规则：

```ts
const normalizeCustomCursorScope = (value: unknown): CustomCursorScope => (
  value === 'system' ? 'system' : 'openpet'
)
```

规则：

- 缺省值是 `openpet`。
- 非法值回退到 `openpet`。
- 当没有可用自定义 cursor 时，作用范围可以保留用户选择，但 runtime 不应启用 cursor。
- Phase 2 中系统级能力不可用，因此 `system` 输入必须回退到 `openpet`，不允许保存“意图但未生效”的状态。
- 只有 Phase 3 原生 `SystemCursorService` 落地并通过支持检测后，才允许保存 `system`。

### 6.3 Runtime contract

OpenPet 局部模式沿用当前 `customCursor`。

全电脑模式需要额外 runtime 状态，不能只看 `customCursor.enabled`：

```ts
interface CursorRuntimeState {
  customCursor: CustomCursorSettings
  customCursorScope: 'openpet' | 'system'
  systemCursor: {
    supported: boolean
    active: boolean
    reason: string
  }
}
```

本轮如果不实现原生 `SystemCursorService`，`systemCursor.supported` 应为 `false`。

Phase 2 可以不新增完整 `CursorRuntimeState`，但必须做到：

- Control Center settings contract 有 `customCursorScope`。
- renderer 收到的生效设置仍按 `openpet` 处理。
- 未支持 `system` 时，renderer 不需要新增全局 overlay 或任何跨窗口行为。
- 日志或状态反馈要能解释为什么全电脑模式不可用。

## 7. 系统级 cursor 技术边界

### 7.1 macOS

macOS 没有等价于网页 CSS 的全局 cursor 替换能力。可行性需要单独验证原生 API 或 helper 进程。

风险：

- 只能在应用活跃或特定 display 维度隐藏 cursor，未必能跨所有应用稳定替换。
- 强行 overlay 方案无法隐藏其他应用里的原生 cursor。
- 辅助功能权限、屏幕录制权限、输入监控权限都可能影响实现。
- 崩溃后恢复系统 cursor 是硬要求。

### 7.2 Windows

Windows 存在系统 cursor 替换 API 的可能路径，但它是全局副作用，必须非常谨慎。

风险：

- 会影响用户整个系统，不只是 OpenPet。
- 需要保存并恢复原系统 cursor。
- 崩溃、强杀、更新、卸载时必须恢复。
- 可能需要生成 `.cur` 或适配原生 cursor 句柄。
- 不应在没有可靠恢复机制前默认开放。

### 7.3 结论

全电脑模式应作为原生能力门控项，不应在本轮用 renderer overlay 或 CSS 假实现。

## 8. 实现计划

### Phase 1: 文档与产品契约

交付：

- 本文档。
- 明确 UI 删除范围和新增 scope 字段。
- 明确系统级模式暂不假实现。

验收：

- 文档能指导下一轮实现。
- 下方管理 UI 的删除范围明确。
- `openpet` / `system` 两种作用范围语义明确。

### Phase 2: UI 精简与 OpenPet-only scope

交付：

- 删除下方管理面板 JSX、props、状态派生和 CSS。
- 增加 `customCursorScope` 字段及默认值。
- 增加作用范围 checkbox/toggle。
- 默认 `openpet`。
- 如果系统级能力未实现，`system` 选项禁用或点击后回退并提示，且 settings 保持 `openpet`。
- 禁用内置 cursor 删除能力，保留上传 cursor 删除能力。
- 迁移历史 `hiddenCursorIds`，让隐藏过的内置 cursor 重新出现在顶部 picker。
- 更新 Control Center smoke 测试。

验收：

- 页面只剩顶部 cursor card、尺寸调节和作用范围控件。
- 不再出现 `指针库状态`、下方上传、管理列表、重命名、恢复。
- 上传、选择、缩放、删除上传 cursor 仍可用。
- 内置 cursor 不再显示删除按钮。
- 历史隐藏内置 cursor 会重新显示。
- `customCursorScope` 默认和保存结果都是 `openpet`。
- `npm run build:control-center` 通过。
- 相关 cursor smoke 通过。

### Phase 3: SystemCursorService 原生能力验证

交付：

- 主进程服务接口。
- 平台支持检测。
- 启用 / 禁用 / 恢复 API。
- app quit / crash recovery 路径。
- 日志与状态反馈。
- macOS / Windows 分别验证。

验收：

- 支持平台上 `system` 模式确实改变整个系统 cursor。
- 不支持平台不会保存假启用状态。
- 退出 OpenPet 后系统 cursor 被恢复。
- 手动验证记录写入文档。

## 9. 测试要求

### 9.1 Control Center

需要覆盖：

- 管理面板不再渲染。
- 顶部 card 行仍渲染。
- 尺寸调节行仍渲染。
- 作用范围控件默认是 OpenPet-only。
- 系统级能力不可用时无法保存假 `system` 生效状态。
- 上传 cursor 后仍自动选中。
- 删除上传 cursor 后回到系统默认 runtime。
- 内置 cursor card 不显示删除按钮。
- 历史隐藏内置 cursor 重新出现在 picker。

### 9.2 Shared contract

需要覆盖：

- `customCursorScope` 缺省为 `openpet`。
- 非法 scope 值回退到 `openpet`。
- Phase 2 中 `system` scope 输入回退到 `openpet`。
- `hiddenCursorIds` 不再隐藏内置 cursor。
- settings IPC adapter 正确读写 scope。

### 9.3 Renderer

需要覆盖：

- `openpet` scope 下现有 overlay 行为不变。
- `system` scope 不可用时 renderer 不尝试绘制全局 overlay。
- 鼠标离开宠物区域后不残留 custom overlay。

### 9.4 Manual-required

系统级 cursor 属于 Manual-required，至少包括：

- macOS 真机验证。
- Windows 真机验证。
- OpenPet 异常退出后的系统 cursor 恢复验证。
- 多显示器验证。
- 高 DPI / 缩放验证。

## 10. Backlog

以下不进入下一轮 UI 精简实现，除非被证明是当前交付阻塞：

- 内置 cursor 的完整删除 / 恢复管理。
- cursor 重命名。
- cursor 图片替换。
- 批量管理。
- 全系统 cursor 原生模块封装。
- `.cur` / `.ani` 生成与转换工具。
- 系统 cursor 备份导入导出。
- 插件开放 cursor 管理能力。

## 11. 验收标准

文档验收：

- 明确删除下方管理 UI。
- 明确保留顶部 card 选择和尺寸调节。
- 明确新增作用范围选择。
- 明确默认只作用于 OpenPet。
- 明确全电脑 cursor 不能用 CSS/overlay 假实现。
- 明确后续实现需要哪些文件、状态字段和测试。

后续实现验收：

- 设置页不再出现下方管理 cursor 面板。
- 用户能在设置页看到作用范围控件。
- 默认状态是仅 OpenPet。
- 未实现原生系统能力时，用户不能保存一个无效果的全电脑模式。
- 内置 cursor 删除入口消失，上传 cursor 删除入口保留。
- 曾被隐藏的内置 cursor 能重新显示在顶部 picker。
- 现有 OpenPet 局部 cursor 功能不退化。
