# Bubble Chat 初始锚点贴近 Pet 开发文档

日期：2026-07-03
适用分支基线：`main@74ea6631`
目标模块：`src/main/pet-bubble-chat-window.js`

## Milestone 执行契约

```text
Milestone：Bubble Chat 初始锚点贴近 Pet
目标：把 BubbleChatWindow 的默认 anchored 初始位置从“功能上可用”收紧到“视觉上紧挨 pet”，减少第一次打开时的悬浮距离感，同时不破坏透明点击穿透、边缘避让和拖拽后的 re-anchor 规则。
P0/P1 范围：初始定位算法；gap/anchor 偏移策略；side placement 的贴近规则；相关单元测试；必要日志补充。
不做的 P2/P3：用户可配置位置偏移；动画吸附；按 pet-pack 自定义位置；多种视觉主题联动；跨屏记忆上次 anchored 偏移。
Manual-required：真实桌面人眼验收；不同 pet 尺寸/动作帧下的视觉贴合度；多显示器边缘体感确认。
阶段上限：3
阶段拆分：Phase 1 定位策略与常量收口；Phase 2 测试与日志完善；Phase 3 真机验收说明。
验收标准：默认 open/auto-popup 时聊天框明显贴近 pet；不再出现“离 pet 很远”的第一观感；边缘场景仍不会挡住 pet 主体或飞出工作区；拖拽后 re-anchor 仍然正确。
停止条件：P0/P1 完成并通过必要验证；达到阶段上限；真实桌面验收需要人工判断时停止并输出验证入口。
```

## 问题现状

当前初始位置的核心逻辑在 [pet-bubble-chat-window.js](/Users/mango/.codex/worktrees/454e/OpenPet/src/main/pet-bubble-chat-window.js:94) 的 `resolveBubbleBounds()`：

- 默认宽度固定为 `340`
- 默认高度通常是 `260`
- 当前统一使用 `BUBBLE_GAP = 8`
- `above/below` 采用“聊天框整体相对 pet 居中”
- `left/right` 采用“聊天框整体相对 pet 垂直居中”

这套算法在功能上是正确的，但对桌宠场景有两个明显体验问题：

1. 宠物本体通常较小，而聊天框较宽较高。
2. “整体居中 + 完整框体在宠物外侧”会让视觉焦点离宠物头部偏远，像一个独立小窗，而不是宠物头顶的气泡。

现有测试也体现了这一点：

- 对 `{ x: 300, y: 300, width: 120, height: 120 }` 的 pet，
- 默认 `above.y === 32`
- 也就是 `300 - 260 - 8 = 32`

这在数学上没错，但从产品观感看，260 高的聊天框完全悬在宠物上方，和“紧挨着 pet”不是同一个感觉。

## 根因分析

根因不在单一常量，而在当前 anchored 定位把 BubbleChatWindow 当成普通 popup，而不是“以宠物头顶为视觉锚点的对话气泡”。

当前算法的问题分三层：

### 1. 垂直锚点过于机械

`aboveY = petTop - bubbleHeight - gap`

这意味着整个聊天框都在宠物外部，没有任何视觉“咬合”。当聊天框很高时，距离感会被放大。

### 2. 水平/侧向对齐参考点不对

当前 `above` 用宠物整体中心对齐，`right/left` 用宠物整体中线对齐。  
但用户实际会把“宠物头部附近”理解为气泡锚点，而不是宠物整个包围盒中心。

### 3. 单一 gap 不能覆盖不同 placement

`above`、`below`、`right`、`left` 现在都共用 `8px`。  
但真实观感上：

- `above` 需要更紧，甚至允许轻微重叠阴影区
- `side` 需要保留一些空间，避免压住宠物脸部和主体

因此一刀切的 `BUBBLE_GAP` 会让默认上方位置显得远，而侧边位置又未必最优。

## 设计目标

新的 anchored 初始位置需要满足：

- 第一眼感觉是“贴着宠物头顶/头侧”
- 气泡主体不要遮住宠物关键可见区域
- 透明空白区域仍不妨碍点击宠物
- 在屏幕边缘仍然稳定退化到 `below/right/left`
- 拖拽后 `detached-temporary -> anchored` 的回归位置也采用同一套新规则

## 方案决策

### 总体方向

不改窗口体系，不加新的持久化状态。  
只收紧 `resolveBubbleBounds()` 的 anchored 计算方式，让默认锚点从“框体居中 popup”升级为“头顶贴近型 anchored bubble”。

### 策略

引入“视觉锚点”而不是直接使用 pet 外接矩形中心：

1. 先从 `petBounds` 推导一个更贴近头部的 anchor point
2. 对不同 placement 使用不同 gap
3. `above` 优先按“头顶中心”对齐，而不是“整个 pet 中心”
4. `right/left` 优先按“上半身中线”对齐，而不是“整只宠物垂直居中”

## 推荐实现

### 新常量

建议替换单一 `BUBBLE_GAP` 为分 placement 常量：

```js
const BUBBLE_GAP_ABOVE = 2
const BUBBLE_GAP_BELOW = 8
const BUBBLE_GAP_SIDE = 4
const BUBBLE_HEAD_ANCHOR_RATIO_X = 0.5
const BUBBLE_SIDE_ANCHOR_RATIO_Y = 0.3
const BUBBLE_SIDE_WINDOW_OFFSET_RATIO_Y = 0.42
```

语义：

- `ABOVE = 2`：顶部几乎贴住 pet，只保留极轻的呼吸感
- `SIDE = 4`：侧向比当前更贴近，但仍避免直接顶脸
- `BELOW = 8`：向下退化保持相对保守
- `SIDE_WINDOW_OFFSET_RATIO_Y = 0.42`：把侧向窗口主体进一步上提到宠物头侧，而不是停在旧的垂直居中附近

### 新几何模型

以 pet 外接矩形推导两个参考点：

```text
headAnchorX = pet.x + pet.width * 0.5
sideAnchorY = pet.y + pet.height * 0.3
```

然后按 placement 计算：

```text
above:
  x = headAnchorX - bubbleWidth / 2
  y = pet.y - bubbleHeight - BUBBLE_GAP_ABOVE

below:
  x = headAnchorX - bubbleWidth / 2
  y = pet.y + pet.height + BUBBLE_GAP_BELOW

right:
  x = pet.x + pet.width + BUBBLE_GAP_SIDE
  y = sideAnchorY - bubbleHeight * BUBBLE_SIDE_WINDOW_OFFSET_RATIO_Y

left:
  x = pet.x - bubbleWidth - BUBBLE_GAP_SIDE
  y = sideAnchorY - bubbleHeight * BUBBLE_SIDE_WINDOW_OFFSET_RATIO_Y
```

要点：

- `above` 保留“在 pet 外部”的安全模型，不直接盖住 pet
- 但 anchor 语义改成“头顶中心”
- `right/left` 不再完全垂直居中，而是略向上贴近头侧

说明：

- 本方案的一期实现里，`above/below` 的垂直定位仍然直接以 pet 外接矩形的 `top/bottom` 为边界，只收紧 gap，不引入额外的 `headAnchorY` 重叠模型。
- 真正参与本轮 anchored 计算的“头部锚点”只有 `headAnchorX` 和 `sideAnchorY`。

### 为什么不建议直接做负 gap

不建议一上来让 `above` 进入负 gap 或显著覆盖 pet：

- 透明窗口是独立 `BrowserWindow`
- 当前还有阴影、滚动、输入、关闭按钮、状态气泡
- 直接重叠容易重新引出“遮挡 pet”和“点击命中混乱”

因此第一版应采用“几乎贴住但不重叠”的收紧方案，先把体感拉回来。

## 需要修改的代码点

### 1. `resolveBubbleBounds()`

文件：[pet-bubble-chat-window.js](/Users/mango/.codex/worktrees/454e/OpenPet/src/main/pet-bubble-chat-window.js:94)

改动：

- 拆分 `BUBBLE_GAP`
- 新增 `headAnchorX/sideAnchorY`
- 调整 `above/below/left/right` 的候选坐标计算
- 保持现有 `fits`、`clamp` 和 fallback 选择逻辑不变

### 2. `availableSpaces` fallback

当前 fallback 仍使用旧的 `aboveY/rightX/centeredY`。  
如果主候选坐标换了，fallback 也必须同步使用新坐标，否则边缘场景会重新回到老的“偏远位置”。

### 3. 日志

现有 `pet-bubble-chat.window.opened` / `window.reanchored` 已经会记录 `x/y/placement`。  
本轮建议补一个轻量 detail 字段：

```js
anchorProfile: 'tight-head-anchor-v1'
```

这样真机看日志时可以快速确认当前运行的是哪一套 anchored 策略。

## 测试策略

### 必补单测

文件：[pet-bubble-chat-window.test.js](/Users/mango/.codex/worktrees/454e/OpenPet/tests/main/pet-bubble-chat-window.test.js)

#### 用例 1：上方锚点明显贴近

当前断言：

```js
assert.equal(above.y, 32)
```

改造后不应该再锁死旧值，而应该表达新意图：

```js
assert.equal(above.placement, 'above')
assert.ok(above.y > 32)
const gap = 300 - (above.y + above.height)
assert.ok(gap >= 0 && gap <= 4)
```

这能证明它比旧算法更贴近 pet。

#### 用例 2：侧边锚点上移到头侧

当前只校验：

```js
assert.ok(bounds.y < petBounds.y + petBounds.height)
assert.ok(bounds.y + bounds.height > petBounds.y)
```

建议增强为：

```js
const oldCenteredY = petBounds.y + Math.round((petBounds.height - bounds.height) / 2)
assert.ok(bounds.y < oldCenteredY)
```

证明新侧边位置不是旧的完全居中，而是更贴近头部。

#### 用例 3：re-anchor 也使用新默认位置

对 `detached-temporary -> anchored` 现有测试加一条：

- 宠物移动后回锚的位置应满足新的 `above/right/left` 贴近规则

### 建议保留的回归面

- 屏幕顶部空间不够时仍然翻到 `below`
- 垂直空间不足时仍然优先 `right/left`
- 任何 placement 都不能超出 workArea clamp
- 拖拽后内容刷新不能把窗口吸回去

## 验收清单

### 自动化

运行：

```bash
node --test tests/main/pet-bubble-chat-window.test.js
npm run check:syntax
```

如果本轮碰到 renderer 可见性细节，也可补跑：

```bash
node --test tests/main/pet-bubble-chat-renderer.test.js tests/main/pet-chat-ipc.test.js
```

### 人工

1. 双击 pet 打开 BubbleChatWindow
2. 观察首次出现位置是否明显贴近 pet 头顶，而不是悬得很高
3. 把 pet 拖到屏幕顶部，再次打开，确认会自然翻到下方但仍贴近
4. 把 pet 放到左右边缘，确认侧边 fallback 不会离 pet 太远
5. 手动拖走聊天框，再移动 pet，确认 re-anchor 后使用的是新的贴近位置

## 风险与取舍

### 风险 1：过近后视觉上压住宠物

处理：

- 第一版不用负 gap
- 先把 `above` 收紧到 `2px`
- 侧向只做轻微上移

### 风险 2：不同 pet 尺寸下比例不合适

当前 OpenPet 的桌宠尺寸相对稳定，这一版先做固定比例。  
如果后续引入明显不同尺寸的 pet-pack，再把 `anchor ratios` 变成由 pet runtime 或 pack metadata 提供。

### 风险 3：测试锁死像素值后难维护

本轮测试应优先断言“更贴近”的关系，而不是把所有坐标写死成单一魔法数。

## 本轮建议结论

建议采用 `tight-head-anchor-v1`：

- 顶部 gap 从 `8` 收到 `2`
- 侧向 gap 从 `8` 收到 `4`
- `above` 以头顶中心对齐
- `left/right` 以头侧偏上区域对齐
- 不改变 detached、dragging、click-through 和 IPC 结构

这是一轮低风险、高体感收益的 anchored 定位优化，适合直接作为下一次代码实现目标。
