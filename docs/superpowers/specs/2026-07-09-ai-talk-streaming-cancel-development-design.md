# AI Talk Streaming And Cancel 开发文档

日期：2026-07-09
适用范围：AI Talk 下一阶段开发入口
当前基线：`dev6` / local `main@b557fd4f`
状态：设计与实施计划完成，等待 milestone 执行

## 背景

OpenPet 的 AI Talk 核心已经完成第一阶段产品闭环：

- `AiTalkService` / `AiTalkStore` 是唯一聊天脑。
- 每个 pet-pack 使用独立主会话：`control-center:{petPackId}:main`。
- pet-pack 默认人格 + 用户本地 override 会编译成 system prompt。
- 长期记忆已支持后台抽取、相关性注入、useCount/lastUsedAt 更新。
- Bubble Chat 是默认轻量对话面，PetChatWindow 是扩展面板。
- `PetService.say()` 是宠物发声唯一入口。
- 真实 provider Bubble Chat smoke 已经能证明 request correlation 和 popup dispatch。

当前剩余 AI Talk TODO 中，最值得作为下一阶段进入 P1 的能力是：

- Streaming replies。
- Cancel generation。
- Streaming 期间保持 trace / memory / bubble / desktop chat 一致。

其它能力，如多会话、历史摘要、向量记忆、插件扩展点和手动记忆审批，继续留在 P2/P3 backlog。

## 设计目标

本阶段目标不是重写 AI Talk，也不是做新的聊天产品形态，而是在现有“一脑两面”的基础上，把 AI 回复从一次性返回升级为可流式展示、可取消、可诊断的生产级链路。

核心目标：

1. 用户发送消息后，Bubble Chat 和 PetChatWindow 能尽快显示 streaming token / partial text。
2. 用户可以取消当前生成；取消后不会污染最终 transcript、memory extraction 或行为决策。
3. AI Talk trace 能记录 streaming lifecycle，便于排查慢 provider、断流、取消和失败。
4. 仍然保持 API key、完整 prompt、raw provider chunk、raw memory 不进入 renderer 或默认日志。
5. 现有非 streaming provider 路径继续可用，作为 fallback。

## Milestone 执行契约

```text
Milestone：AI Talk Streaming + Cancel v1
目标：在不改变 AI Talk 单脑架构的前提下，为 Bubble Chat 和 PetChatWindow 接入同一条主进程 streaming 生成链路，并支持用户取消当前生成。
P0/P1 范围：AiService streaming adapter；AiTalkService streaming orchestration；IPC streaming event contract；Bubble Chat partial reply rendering；PetChatWindow partial reply rendering；cancel request；trace/log redaction；fallback to non-streaming；必要测试和 smoke。
不做的 P2/P3：多会话 UI；embedding/vector memory；LLM history summarization；AI Talk plugin extension；手动记忆审批；Markdown 富文本 streaming；跨 provider 自动路由。
Manual-required：真实 provider streaming 行为差异；真实桌面长回复阅读/取消体感；慢网/断网情况下 provider 断流表现。
阶段上限：4
阶段拆分：Phase 1 streaming provider/AI Talk core；Phase 2 IPC 与窗口状态；Phase 3 cancel 与失败恢复；Phase 4 smoke/runbook/trace closeout。
验收标准：非 streaming chat 不回归；支持 streaming 的 provider 能产生 partial reply；Bubble Chat 与 PetChatWindow 显示同一 requestId 的 partial/final 状态；cancel 后 UI 进入 canceled 状态且不触发 memory extraction；日志和 trace 可用 requestId/conversationId 串联；测试和语法检查通过。
停止条件：P0/P1 完成并通过必要验证；阶段数量达到 4；真实 provider streaming 能力成为唯一剩余验收项。
```

## 范围分级

### P0

- 不破坏 `npm start`、Control Center AI 页、Bubble Chat、PetChatWindow 和现有一次性 chat。
- API key、完整 prompt、raw provider chunks、完整用户输入、完整 memory 不得进入 renderer、普通插件或默认日志。
- Cancel 必须是幂等的；重复 cancel 或 late chunk 不得导致崩溃、重复写入 transcript 或重复触发 `PetService.say()`。
- Streaming 失败不能丢失用户消息；必须能显示错误并允许下一次输入继续。

### P1

- `AiService` 增加 OpenAI-compatible streaming adapter，并能在 provider 不支持 streaming 时回退到一次性 completion。
- `AiTalkService` 增加 request lifecycle：`started`、`delta`、`completed`、`canceled`、`failed`。
- 主进程维护 request registry，支持按 `requestId` cancel。
- Bubble Chat 显示 partial pet reply，并在 final 后转换为正式 dialogue item。
- PetChatWindow 显示同一条 partial/final message，不引入第二套聊天状态。
- Memory extraction 只在 successful final reply 后后台触发；canceled/failed 不触发。
- Behavior decision 只基于 final reply 执行；partial reply 不触发动作。
- Trace diagnostics 记录 streaming 摘要：chunkCount、partialChars、elapsedMs、cancelReason、finishReason。

### P2/P3 Backlog

- 多会话 per pet-pack。
- LLM history summarization。
- Embedding/vector memory retrieval。
- AI Talk plugin extension points。
- 用户手动审批记忆、隐私模式、记忆规则编辑器。
- Markdown/rich content streaming。
- 多 provider failover / routing。
- Token usage 实时估算和成本面板。

### Manual-required

- 真实 OpenPet gateway / OpenAI-compatible provider streaming 能力确认。
- 长回复在 Bubble Chat 的阅读体验、自动隐藏策略和 cancel 按钮位置体验。
- 断网、provider 限流、provider 中途断流下的人工体感。

## 当前架构边界

### AI provider

Owner：

- `src/main/services/ai-service.js`
- `src/main/services/secret-service.js`
- `src/main/services/app-log-service.js`

职责：

- 保持 secret 只在 main process。
- 提供非 streaming `complete()` 和 streaming `streamComplete()` 能力。
- 统一 provider error 分类。
- 默认日志只记录模型、耗时、chunk 数、字符数和错误类型。

禁止：

- 把 Authorization header、raw API key、完整 prompt、raw chunk 写入日志。
- 让 renderer 直接访问 provider。

### AI Talk core

Owner：

- `src/main/services/ai-talk-service.js`
- `src/main/services/ai-talk-store.js`

职责：

- 组装 persona、history、memory context、action candidates。
- 管理 request lifecycle。
- 决定 transcript 何时追加 assistant final message。
- 决定 memory extraction 和 behavior decision 何时触发。
- 写入 redacted trace。

关键原则：

- User message 可以在 request started 时进入 transcript。
- Assistant message 只有 final success 后进入 transcript。
- Partial text 只属于 transient runtime state，不直接进入 durable transcript。
- Cancel 后保留 user message，但 assistant message 标记为 canceled transient，不进入 memory extraction。

### Desktop surfaces

Owner：

- `src/main/pet-bubble-chat-window.js`
- `src/main/pet-bubble-chat/renderer.js`
- `src/main/pet-chat-window.js`
- `src/main/pet-chat/renderer.js`

职责：

- 展示 request state，而不是实现 provider 逻辑。
- Bubble Chat 显示短 partial/final 栈。
- PetChatWindow 显示更完整 transcript 和 streaming 状态。
- Cancel 控件通过 IPC 回到 main process。

### IPC contract

Owner：

- `src/shared/ipc-channels.ts`
- `src/shared/ipc-channels.js`
- `src/main/ipc.js` 或后续拆分出的 chat coordinator/facade

职责：

- 定义 renderer 可见的安全事件形状。
- 保证 JS/TS channel 同步。
- 不暴露 secret、raw prompt、raw memory。

## 数据模型

### Streaming request state

主进程内部状态建议：

```ts
interface AiTalkStreamingRequest {
  requestId: string
  conversationId: string
  petPackId: string
  entrypoint: 'bubble-chat' | 'pet-chat' | 'control-center'
  status: 'started' | 'streaming' | 'canceling' | 'completed' | 'canceled' | 'failed'
  startedAt: string
  updatedAt: string
  messageChars: number
  partialReply: string
  partialReplyChars: number
  chunkCount: number
  cancelReason?: string
  errorCode?: string
}
```

Renderer 可见状态建议：

```ts
interface AiTalkStreamingViewState {
  requestId: string
  conversationId: string
  petPackId: string
  status: 'streaming' | 'completed' | 'canceled' | 'failed'
  partialReply: string
  partialReplyChars: number
  canCancel: boolean
  errorMessage?: string
}
```

注意：

- `partialReply` 是 assistant 生成内容，允许 renderer 展示。
- 不允许 renderer 得到 prompt、memoryContext、provider raw chunk、tool hints raw payload。

### Trace summary

`AiTalkStore.recordTrace()` / `updateTrace()` 需要保留摘要字段：

```ts
interface AiTalkStreamingTraceSummary {
  requestId: string
  conversationId: string
  petPackId: string
  streaming: boolean
  status: 'completed' | 'canceled' | 'failed'
  chunkCount: number
  partialReplyChars: number
  replyChars: number
  elapsedMs: number
  providerLatencyMs: number
  finishReason?: string
  cancelReason?: string
  errorCode?: string
  memoryExtractionScheduled: boolean
  behaviorDecisionScheduled: boolean
}
```

## Provider streaming adapter

### `AiService.streamComplete()`

建议新增接口：

```js
const streamComplete = async ({
  messages,
  model,
  requestId,
  signal,
  onDelta
} = {}) => {
  // returns final response summary
}
```

要求：

- 支持 `AbortController.signal`。
- `onDelta` 只接收已归一化的文本 delta。
- provider 不支持 streaming 时返回 `{ streaming: false, fallback: true }` 并走现有 `complete()`。
- stream parser 不把 raw event 直接上传给上层。
- 错误分类复用现有 provider diagnostics。

### Provider fallback

Fallback 规则：

- 如果 provider config 明确不支持 streaming：直接走 non-streaming。
- 如果 streaming HTTP 返回 400/404/unsupported stream：记录 `fallbackReason`，可选降级一次 non-streaming。
- 如果 streaming 已经开始输出 chunk 后断流：不能再透明 fallback，因为可能产生重复回复；应进入 `failed`，保留 partial 作为 transient error context。

## AI Talk lifecycle

### Start

1. 生成 `requestId`。
2. 获取 active pet-pack 和 main conversation。
3. 编译 persona/system prompt。
4. 选择 relevant memories。
5. append user message。
6. 创建 streaming trace。
7. 广播 `ai-talk.streaming.started`。

### Delta

1. Provider chunk 归一化为 text delta。
2. 累加 partial reply。
3. 节流广播到 windows，避免每个 token 都 IPC storm。
4. 更新 trace summary 的 chunk count / partial chars。

建议节流：

- 最小间隔 50ms。
- 或累计 16-32 字符再发。
- final delta 必须 flush。

### Completed

1. 将 final assistant reply append 到 transcript。
2. 调用 `PetService.say({ source: 'ai' })` 进入统一发声。
3. 触发 behavior decision。
4. 后台触发 memory extraction。
5. 更新 trace：completed、replyChars、elapsedMs、memoryExtractionScheduled。
6. 广播 final state。

### Canceled

1. Abort provider request。
2. 停止接收 late chunk；late chunk 按 requestId/status 丢弃。
3. 不 append assistant final message。
4. 不触发 memory extraction。
5. 不触发 behavior decision。
6. 广播 canceled state。
7. 允许用户下一次继续输入。

### Failed

1. 保存安全错误摘要。
2. 不 append assistant final message。
3. 不触发 memory extraction。
4. 不触发 behavior decision。
5. Bubble Chat / PetChatWindow 显示可恢复错误。

## UI 行为

### Bubble Chat

Streaming 状态：

- 用户气泡进入 history。
- 宠物侧出现 partial reply bubble。
- partial bubble 可以显示轻量状态，如 `正在回复...`。
- 输入框仍允许继续输入；如果当前实现已有 queued follow-up，则复用 queued/pending-merge 机制。
- Cancel 按钮只在 current request `canCancel === true` 时显示。

Cancel 后：

- partial bubble 标记为 `已取消` 或轻提示，不进入正式 dialogue history。
- 用户消息保留。
- 输入框恢复可编辑。
- 下一次输入可继续正常发起请求。

自动隐藏：

- streaming / canceling / error 时保持 visible。
- 用户 hover/focus/selection/draft 时继续冻结 auto-hide。
- completed 后按现有 TTL 规则。

### PetChatWindow

Streaming 状态：

- 当前 assistant message 以 `streaming` status 渲染。
- completed 后 status 改为 `sent`。
- canceled 后 status 改为 `canceled`，不写入 durable assistant transcript。
- failed 后展示错误状态。

与 Bubble Chat 同步：

- 两个窗口接收同一个 requestId 的 state。
- 任一窗口触发 cancel，都取消同一个 main-process request。

### Control Center AI Pane

一期不要求做完整 streaming UI。

最低要求：

- 如果从 AI Pane 发送消息，仍可走现有 non-streaming 或复用 streaming 但不展示 token-by-token。
- Trace summary 能显示 streaming/canceled/failed 摘要。
- 不阻塞 Bubble Chat / PetChatWindow streaming。

## IPC 设计

建议新增或扩展：

```ts
AI_TALK_STREAM_STATE_CHANGED: 'ai-talk:stream-state-changed'
AI_TALK_CANCEL_REQUEST: 'ai-talk:cancel-request'
PET_BUBBLE_CHAT_CANCEL_MESSAGE: 'pet-bubble-chat:cancel-message'
PET_CHAT_CANCEL_MESSAGE: 'pet-chat:cancel-message'
```

事件 payload：

```ts
interface AiTalkStreamStateChangedPayload {
  requestId: string
  conversationId: string
  petPackId: string
  sourceSurface: 'bubble-chat' | 'pet-chat' | 'control-center'
  status: 'started' | 'streaming' | 'completed' | 'canceled' | 'failed'
  partialReply?: string
  partialReplyChars: number
  canCancel: boolean
  errorMessage?: string
}
```

Cancel payload：

```ts
interface AiTalkCancelRequestPayload {
  requestId: string
  sourceSurface: 'bubble-chat' | 'pet-chat' | 'control-center'
  reason?: 'user-cancel' | 'window-close' | 'new-request' | 'shutdown'
}
```

## 日志设计

Scope：`ai-talk`

新增事件：

- `ai-talk.stream.started`
- `ai-talk.stream.delta`
- `ai-talk.stream.completed`
- `ai-talk.stream.canceled`
- `ai-talk.stream.failed`
- `ai-talk.stream.cancel-requested`
- `ai-talk.stream.late-chunk-ignored`

字段：

- `requestId`
- `conversationId`
- `petPackId`
- `entrypoint`
- `provider`
- `model`
- `chunkCount`
- `partialReplyChars`
- `replyChars`
- `elapsedMs`
- `providerLatencyMs`
- `status`
- `finishReason`
- `cancelReason`
- `errorCode`

禁止字段：

- `apiKey`
- `authorization`
- `prompt`
- `compiledSystemPrompt`
- `memoryText`
- `rawChunk`
- `rawProviderReply`
- `fullUserMessage`

## 测试策略

### Unit / service

新增或扩展：

- `tests/services/ai-service.test.js`
  - streaming parser yields normalized deltas。
  - Abort signal cancels request。
  - unsupported streaming can fallback safely。

- `tests/services/ai-talk-service.test.js`
  - streaming completed appends assistant final message。
  - streaming delta does not persist partial assistant message。
  - cancel does not trigger memory extraction。
  - cancel does not trigger behavior decision。
  - late chunks after cancel are ignored。
  - failed stream keeps user message and records redacted trace。

- `tests/services/ai-talk-store.test.js`
  - trace export includes streaming summary without raw text。
  - canceled trace filters by petPackId/conversationId。

### IPC / windows

新增或扩展：

- `tests/main/pet-chat-ipc.test.js`
  - cancel IPC calls main request registry。
  - state broadcast includes requestId and status。

- `tests/main/pet-bubble-chat-window.test.js`
  - streaming state keeps bubble visible。
  - partial reply item is transient。
  - cancel clears pending streaming state without hiding immediately。

- `tests/main/pet-bubble-chat-renderer.test.js`
  - streaming partial renders。
  - cancel button invokes cancel API。
  - completed converts to final display.

- `tests/main/pet-chat-renderer.test.js`
  - streaming message renders with status。
  - cancel button disabled after terminal state。

### Smoke

新增脚本或扩展：

```bash
npm run run-ai-talk-local-smoke -- \
  --message "请用三句话慢慢回复，用于 streaming 验收" \
  --stream \
  --output-dir ai-talk-streaming-smoke
```

输出字段：

```json
{
  "streamingAcceptance": {
    "requestId": "chat-...",
    "chunkCount": 12,
    "firstDeltaLatencyMs": 420,
    "providerLatencyMs": 2340,
    "completed": true,
    "canceled": false,
    "bubbleStateVisible": true,
    "petChatStateUpdated": true
  }
}
```

Cancel smoke：

```bash
npm run run-ai-talk-local-smoke -- \
  --message "请生成一段较长回复，用于 cancel 验收" \
  --stream \
  --cancel-after-ms 500 \
  --output-dir ai-talk-streaming-cancel-smoke
```

通过标准：

- `canceled === true`
- `memoryExtractionScheduled === false`
- `behaviorDecisionScheduled === false`
- 日志存在 `ai-talk.stream.cancel-requested` 和 `ai-talk.stream.canceled`

## 阶段拆分

实施计划：

- `docs/superpowers/plans/2026-07-09-ai-talk-streaming-cancel.md`

该计划把本设计拆成 5 个可验证任务：provider streaming adapter、AI Talk lifecycle、trace/store redaction、IPC/window surfaces、smoke/runbook closeout。执行时仍受本设计的 4 个 milestone phase 上限约束；计划任务是开发工作包，phase 是交付门禁。

### Phase 1：Provider 与 AI Talk streaming core

目标：

- 在 main process 内实现 streaming provider adapter 和 AI Talk streaming lifecycle。

预计修改：

- `src/main/services/ai-service.js`
- `src/main/services/ai-talk-service.js`
- `src/main/services/ai-talk-store.js`
- `tests/services/ai-service.test.js`
- `tests/services/ai-talk-service.test.js`
- `tests/services/ai-talk-store.test.js`

验收：

- Service tests 通过。
- Non-streaming chat tests 不回归。
- Trace 不泄露 raw prompt/chunk/memory。

### Phase 2：IPC 与 Bubble/PetChat streaming surface

目标：

- 将 streaming state 安全广播给 Bubble Chat 和 PetChatWindow。

预计修改：

- `src/shared/ipc-channels.ts`
- `src/shared/ipc-channels.js`
- `src/main/ipc.js` 或 chat coordinator/facade
- `src/main/pet-bubble-chat-window.js`
- `src/main/pet-bubble-chat/renderer.js`
- `src/main/pet-chat-window.js`
- `src/main/pet-chat/renderer.js`
- `tests/main/*chat*.test.js`

验收：

- Bubble Chat 显示 partial/final。
- PetChatWindow 显示同 requestId 的 partial/final。
- 两个 surface 不分叉 transcript。

### Phase 3：Cancel、失败恢复和 late event hardening

目标：

- 完成 cancel IPC、request registry、late chunk ignore、失败状态恢复。

预计修改：

- `src/main/services/ai-talk-service.js`
- `src/main/ipc.js` 或 chat coordinator/facade
- `src/main/pet-bubble-chat-window.js`
- `src/main/pet-chat-window.js`
- 相关 renderer tests

验收：

- Cancel 幂等。
- Cancel 不触发 memory extraction / behavior decision。
- Late chunk 不污染 UI 和 transcript。
- 失败后用户能继续输入。

### Phase 4：Smoke、runbook 和 release evidence

目标：

- 形成真实 provider streaming/cancel 验收入口。

预计修改：

- `scripts/run-ai-talk-local-smoke.js`
- `tests/scripts/run-ai-talk-local-smoke.test.js`
- 新增 streaming/cancel runbook 或更新现有 runbook。
- 可选 release evidence archive helper 扩展。

验收：

- 定向 smoke tests 通过。
- `npm run check:syntax` 通过。
- 真实 provider 验收剩余项明确进入 Manual-required。

## 验收命令建议

自动化：

```bash
node --test tests/services/ai-service.test.js tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js
node --test tests/main/pet-chat-ipc.test.js tests/main/pet-bubble-chat-window.test.js tests/main/pet-bubble-chat-renderer.test.js tests/main/pet-chat-renderer.test.js
node --test tests/scripts/run-ai-talk-local-smoke.test.js
npm run check:syntax
```

真实 provider：

```bash
npm run run-ai-talk-local-smoke -- \
  --message "请用三句话慢慢回复，用于 streaming 验收" \
  --stream \
  --output-dir ai-talk-streaming-smoke
```

Cancel：

```bash
npm run run-ai-talk-local-smoke -- \
  --message "请生成一段较长回复，用于 cancel 验收" \
  --stream \
  --cancel-after-ms 500 \
  --output-dir ai-talk-streaming-cancel-smoke
```

## 人工验收清单

- Bubble Chat streaming 时是否能快速看到第一段回复。
- 长回复是否会过早 auto-hide。
- Cancel 按钮是否容易发现但不打扰日常阅读。
- Cancel 后 UI 是否清楚表达“已取消”。
- Cancel 后再次输入是否正常。
- PetChatWindow 与 Bubble Chat 是否显示同一轮状态。
- 真实 provider 断流时错误是否可理解。
- 日志是否能通过 `requestId` 串起 provider、AI Talk、Bubble Chat、PetChatWindow。

## 后续 Backlog 关联

Streaming + Cancel 完成后，后续最自然的 AI Talk roadmap：

1. LLM history summarization：解决 streaming 后长对话增长更快的问题。
2. Multiple conversations per pet-pack：让 PetChatWindow 承担真正扩展面板能力。
3. Embedding/vector memory retrieval：提升长期记忆命中质量。
4. AI Talk plugin extension points：允许插件以受控方式提供上下文、工具或行为建议。
5. Advanced memory privacy controls：把自动记忆升级为可审计、可审批、可禁用的产品能力。

## 风险与决策

### 风险：Streaming chunk 太频繁导致 IPC storm

决策：

- 主进程节流广播。
- Trace 记录 chunkCount，但 renderer 不需要接收每个 raw chunk。

### 风险：Cancel 后 provider 仍返回 late chunk

决策：

- request registry 以 terminal status 为准。
- terminal 后 late chunk 丢弃并记录摘要日志。

### 风险：Partial reply 污染 memory

决策：

- Memory extraction 只在 final success 后触发。
- Canceled/failed trace 不进入 extraction job。

### 风险：不支持 streaming 的 provider 回归

决策：

- `streamComplete()` 必须支持 fallback。
- Provider capability 不确定时先尝试安全探测或配置禁用。

### 风险：Bubble Chat 变成长篇阅读器

决策：

- Bubble Chat 只显示短 partial/final 体验。
- 长历史、完整内容、后续 streaming 控制主要由 PetChatWindow 承担。

## 与现有 TODO 的关系

本设计承接 `docs/openpet-current-todo-architecture.md` 中 AI Talk P2/P3 的第一项：

- Streaming replies and cancel generation。

本设计不处理以下 TODO：

- Multiple conversations per pet-pack。
- LLM history summarization。
- Embedding/vector memory retrieval。
- AI Talk plugin extension points。
- Advanced memory privacy controls and manual memory approval mode。

这些能力在 streaming/cancel 稳定后再进入新的 bounded milestone。
