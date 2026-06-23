# OpenPet AI Talk 开发文档

日期：2026-06-24
基线：`main@6f2a5c0` (`fix(window): raise existing settings window`)
状态：基于最新 main 重新整理，作为后续 AI Talk 开发入口文档

## 目标

AI Talk 的目标是把 OpenPet 从“AI 配置 + 简单聊天”升级成可持续演进的宠物对话系统。系统需要支持当前激活 pet-pack 的独立人格、独立主会话、长期记忆、动作建议、可诊断日志，并且为后续桌面浮窗聊天、流式回复、多会话 UI、向量检索和插件扩展预留边界。

当前 main 已经落地核心编排骨架：`AiTalkService`、`AiTalkStore`、`pet.json.persona` schema、Control Center 人格 override UI、人格草稿生成、后台记忆抽取、AI provider 日志。本文档不再把这些写成“计划新建”，而是以它们为当前架构事实继续规划。

## 非目标

- 本阶段不做桌面浮窗聊天入口。
- 本阶段不做流式回复，但 `responseMode` 已在 conversation 数据中预留。
- 本阶段不做多会话列表 UI，内部只使用每个 pet-pack 的 `main` conversation。
- 本阶段不做 embedding 或向量库。
- 本阶段不开放第三方 AI Talk 插件 API。
- 本阶段不做 LLM 历史摘要压缩。
- 本阶段不把本地 persona override 写回 pet-pack 文件。

## AstrBot 参考原则

OpenPet 继续参考 AstrBot 的成熟分层，但不照搬其 Python/DB/多平台复杂度：

- `session` 和 `conversation` 分离：入口场景负责定位会话，conversation 负责历史、persona hash、上下文策略。
- 稳定 persona 和动态上下文分离：pet persona 编译进稳定 system prompt，长期记忆作为动态上下文单独注入。
- 工具是能力边界：模型只建议动作，host 负责校验当前 pet-pack 是否具备动作并执行。
- 请求链路可观测：provider 请求、talk 编排、IPC、memory job 都要有脱敏结构化日志。
- 长期记忆自动抽取但不能阻塞主回复，失败只进入诊断链路。

## 当前主进程架构

`main.js` 现在按以下顺序组装核心依赖：

1. `SettingsService` 持久化普通设置。
2. `PetPackService` 管理 active pet-pack。
3. `ActionService` 和 `PetService` 提供宠物动作与状态唯一入口。
4. `SecretService` 保存 AI/API key。
5. `AppLogService` 写入本地日志。
6. `AiService` 作为 OpenAI-compatible provider client。
7. `AiTalkStore` 使用 `userData/ai-talk-store.json` 保存 talk 数据。
8. `AiTalkService` 编排会话、人格、记忆、provider 请求。
9. `PluginService` 接收 `aiService` 与 `aiTalkService`，但 AI Talk 第三方扩展 API 仍未开放。
10. `registerIpcHandlers()` 注入 `aiTalkService`，AI IPC 优先走 talk 编排。

`PetService` 仍是宠物状态唯一入口。所有 `say`、`playAction`、`setEvent` 都不能绕过它。

## 当前 AI 服务边界

### AiService

文件：`src/main/services/ai-service.js`

职责已经收敛到 provider client：

- 读取 `settings.ai` provider 配置。
- 通过 `SecretService` 读取 API key。
- 发送 `/chat/completions` 非流式请求。
- 解析 assistant reply 和 `openpet_behavior` tool call。
- 记录 `ai-provider`、`ai-settings` 脱敏日志。
- 提供兼容旧路径的 `chat/getConversation/clearConversation`。

注意：`AiService.getConfig()` 返回给 renderer 的 `baseUrl` 是展示安全版本，会去掉用户名、密码、query、hash。保存时通过 `mergeConfigWithoutDisplayDowngrade()` 避免展示安全版本覆盖真实已保存 URL。

### AiTalkService

文件：`src/main/services/ai-talk-service.js`

职责是 AI Talk 主编排：

- 解析当前 active pet-pack。
- 读取并合并 pack persona 与本地 override。
- 编译 persona prompt 和 global system prompt。
- 确保 `control-center:{petPackId}:main` 会话存在。
- 读取最近 `MAX_CONTEXT_MESSAGES = 20` 条历史。
- 读取最多 `MAX_MEMORY_CONTEXT_ITEMS = 8` 条长期记忆作为动态上下文。
- 按配置注入 `openpet_behavior` tool。
- 调用 `AiService.complete()`。
- 将 user/assistant message 写入 `AiTalkStore`。
- 非阻塞调度 memory extraction job。
- 记录 `ai-talk.chat.*` 与 `ai-talk.memory.*` 脱敏日志。

`AiTalkService.chat()` 当前忽略 renderer 传入的普通 `conversationId`，以 active pet-pack 和 entrypoint 自动定位主会话。`getConversation('control-center')` 也会回落到当前 active pet-pack 的 main conversation，这是为了兼容旧 UI 调用。

### AiTalkStore

文件：`src/main/services/ai-talk-store.js`

本地数据文件：`userData/ai-talk-store.json`

当前 schema version 为 `1`，顶层包含：

- `sessions`;
- `conversations`;
- `messages`;
- `personaOverrides`;
- `memories`;
- `memoryJobs`;
- `traces`.

写入采用临时文件 + rename 的原子写入方式。读取到损坏 JSON 时，会备份为 `ai-talk-store.json.corrupt-*` 并返回安全空状态。

## 当前数据模型

### Session

`sessionId = {entrypoint}:{petPackId}`

Phase 1 默认 entrypoint 是 `control-center`。例如：

```text
control-center:legacy-cat
control-center:mochi-cat
```

### Conversation

当前每个 session 只有一个 `main` conversation，完整 key 为：

```text
{sessionId}:main
```

conversation 字段包括：

- `id`;
- `sessionId`;
- `petPackId`;
- `title`;
- `personaPackId`;
- `personaHash`;
- `responseMode`;
- `summary`;
- `summaryUpdatedAt`;
- `contextPolicy`;
- `createdAt`;
- `updatedAt`.

`responseMode` 当前固定为 `complete`，为后续 stream 预留。

### Message

当前只持久化 `user` 和 `assistant` 两类消息。每条 message 最长 8000 字符。system prompt、memory context、tool schema 不进入 transcript。

### Persona

`pet.json.persona` 已成为可选字段。若存在，`src/main/pet-pack/schema.js` 会严格校验：

- `name`;
- `identity`;
- `tone`;
- `coreTraits`;
- `speakingStyle`;
- `relationshipToUser`;
- `actionStyle`;
- `boundaries`.

若 pet-pack 没有 persona，`AiTalkService` 使用内置 `FALLBACK_PERSONA`。

本地 override 按 pet-pack 存在 `AiTalkStore.personaOverrides` 中。合并方式是字段级覆盖，不修改 pet-pack 文件。

### Memory

长期记忆分两类：

- `global`：稳定用户事实和偏好。
- `petPack`：当前宠物与用户的关系记忆。

memory 字段包括：

- `id`;
- `scope`;
- `petPackId`;
- `text`;
- `tags`;
- `confidence`;
- `importance`;
- `sourceConversationId`;
- `sourceMessageIds`;
- `createdAt`;
- `updatedAt`;
- `lastUsedAt`;
- `lastEvidenceAt`;
- `useCount`;
- `status`;
- `supersedes`;
- `reason`.

当前支持的记忆操作：

- `create`;
- `update`;
- `reinforce`;
- `ignore`.

host 不允许模型物理删除记忆。敏感候选会被过滤，只在 `traces.filteredMemoryCandidates` 中记录 operation、scope、reason，不保存原文。

## 当前请求流程

1. Control Center AI 页发送 `IPC.AI_CHAT`。
2. `ipc.js` 记录 `ai-chat.ipc.received`。
3. IPC 调用 `aiTalkService.chat(payload)`，如果服务不存在才 fallback 到旧 `aiService.chat()`。
4. `AiTalkService` 解析 active pet-pack。
5. `AiTalkService` 合并 persona override，计算 `personaHash`。
6. `AiTalkStore.ensureMainConversation()` 创建或更新 `control-center:{petPackId}:main`。
7. `AiTalkService` 读取历史、记忆、behavior 配置，组装 provider messages。
8. `AiService.complete()` 调用 OpenAI-compatible provider。
9. `AiTalkStore.appendMessages()` 保存 user/assistant transcript。
10. `AiTalkService` 立即返回 reply，并后台启动 memory extraction。
11. IPC 调用 `petService.say({ text: result.reply, source: 'ai' })`。
12. 如果 behavior orchestrator 启用，IPC 用 `behaviorOrchestratorService.evaluate()` 校验并执行动作。
13. IPC 记录 `ai-chat.ipc.completed` 或 `ai-chat.ipc.failed`。

## 当前 Control Center 能力

文件：

- `src/control-center/src/hooks/useAiPane.ts`
- `src/control-center/src/panes/AiPane.tsx`
- `src/control-center/src/api/control-center-api.ts`
- `src/shared/openpet-contracts.ts`

已实现能力：

- 聊天 provider 配置保存和连接测试。
- API key 保存。
- `memory.enabled` 开关。
- 图片 provider 配置与健康检查。
- 当前 active pet-pack persona profile 获取。
- persona override 编辑、保存、清空。
- persona generation draft 生成、预览、应用或放弃。
- 编译后 persona prompt 和 system prompt 预览。
- AI 聊天。
- behavior 配置、dry run、replay、诊断导出。

当前限制：

- renderer 仍以兼容方式调用 `getAiConversation('control-center')` 和 `chat({ conversationId: 'control-center' })`；实际会话隔离由主进程根据 active pet-pack 完成。
- AI 页没有长期记忆列表、删除、清空、恢复或导出 UI。
- active pet-pack 切换后的聊天消息刷新仍依赖进入 AI tab 或重新加载相关 profile 的路径，后续应补显式刷新机制。

## 当前日志与诊断

已有日志范围：

- `ai-provider`: provider 请求开始、完成、失败。
- `ai-settings`: provider 连接测试开始、完成、失败。
- `ai-talk`: chat 开始、完成、失败，memory extraction 调度、完成、失败。
- `ai-chat`: IPC 收到、完成、失败。
- `behavior`: behavior orchestrator 已有决策与导出能力。

默认日志不记录完整 prompt、完整用户消息、API key 或 provider 原始错误正文。错误日志会按 `providerStatus/providerCode` 做脱敏分类。

## 当前测试覆盖

已有相关测试：

- `tests/services/ai-service.test.js`
- `tests/services/ai-talk-service.test.js`
- `tests/services/ai-talk-store.test.js`
- `tests/pet-pack/schema.test.js`
- `tests/control-center/control-center-smoke.spec.js`
- `tests/shared/openpet-contracts-type-fixture.ts`

核心覆盖点：

- pet-pack persona 编译进入稳定 system prompt。
- 不同 pet-pack 的 main conversation 隔离。
- AI disabled 时不调用 provider。
- behavior tool 仍可传给 provider。
- talk lifecycle 日志不泄漏用户 prompt。
- persona override 按 pet-pack 保存和合并。
- persona generation 只产出草稿，不直接持久化。
- memory extraction 非阻塞。
- memory 作为动态上下文注入，不污染 persona prompt。
- fenced JSON memory extraction 可解析。
- store 原子持久化、损坏备份、memory upsert、敏感过滤。

推荐验证命令：

```bash
npm run test:core
npm run test:core:all
npm run check:syntax
```

## 已落地但需要继续打磨的点

### 1. Memory Retrieval 仍是排序，不是相关性检索

当前 `AiTalkStore.listMemories()` 按 `importance + confidence` 和 `updatedAt` 排序返回 top N，没有基于当前 user message 或最近对话做关键词打分。后续应在 `AiTalkService.getMemoryContext()` 前加入轻量 scorer。

建议 Phase Next：

- 输入：当前 user message、最近 N 条 history、petPackId。
- 候选：active global memory + active petPack memory。
- 分数：tag 命中、文本 token 命中、scope、importance、confidence、recency、useCount。
- 输出：top 5 到 8 条，并更新 `lastUsedAt/useCount`。

### 2. AI Memory 管理 UI 缺失

当前只有 `memory.enabled` 开关，没有记忆列表和删除能力。

需要补齐 IPC/API：

- list global memories；
- list current pet-pack memories；
- delete memory；
- clear current pet-pack memories；
- optionally export redacted memory diagnostics。

Control Center UI 需要展示：

- 全局用户记忆；
- 当前宠物关系记忆；
- memory job 最近状态；
- 被过滤候选数量；
- 删除/清空操作。

### 3. Action Tool Schema 仍是旧版

当前 `getBehaviorToolDefinition()` 只支持：

- `intent`;
- `actionId`;
- `confidence`;
- `bubbleText`.

旧设计里计划扩展的 `reason`、`displayMode` 尚未实现。当前 provider 也没有拿到当前 pet-pack action 白名单的结构化描述，只能靠 host 后置校验。

后续建议：

- 在 `AiTalkService` 根据 `petService.getAnimations()` 或 `ActionService` 生成 action candidates。
- tool schema 增加 `reason`、`displayMode`。
- system/dynamic context 中明确“只能建议当前候选 actionId”。
- behavior orchestrator 继续作为最终 host validation。

### 4. Pet Bubble 分段未进入 Talk 层

当前 `AiTalkService` 返回完整 reply，IPC 直接调用 `petService.say()`。若要“自动拆分多段气泡”，应在 `AiTalkService` 或单独 display helper 中生成 `bubbleSegments`，但 transcript 仍保存完整 assistant reply。

建议字段：

```text
reply: string
bubbleSegments: string[]
```

IPC 可以按段调用 `PetService.say()`，或由 `PetService` 支持队列显示。

### 5. 旧 `settings.ai.conversations` 迁移未完成

`AiService` 仍保留旧 conversation store 兼容逻辑，但 AI Talk 主链路已经使用 `ai-talk-store.json`。需要决定是否迁移旧 `settings.ai.conversations.control-center` 到 `control-center:{activePackId}:main`。

建议只做一次性保守迁移：

- 仅当 `ai-talk-store.json` 没有任何 messages 时迁移。
- 默认迁移到当前 active pet-pack。
- 迁移后保留旧 settings 字段，暂不删除。
- 记录 `ai-talk.migration.legacy-conversations` 日志。

### 6. Trace Store 未形成可导出诊断

`AiTalkStore.traces` 目前主要用于 filtered memory candidates。完整 AI Talk trace 仍在 app logs 中。后续可以将每次 chat 的 redacted trace 写入 store，供 UI 导出。

建议 trace 字段：

- `traceId`;
- `petPackId`;
- `conversationId`;
- `personaHash`;
- `messagesCount`;
- `memoryIdsInjected`;
- `toolsCount`;
- `provider`;
- `model`;
- `latencyMs`;
- `replyChars`;
- `hasBehaviorIntent`;
- `memoryJobId`;
- `errorCode`.

### 7. Active Pet-Pack 切换刷新需要显式机制

目前 persona profile 会在进入 AI tab 时刷新，但 pet-pack 切换后 AI 页聊天记录和 persona 草稿是否即时切换，依赖当前 hook 生命周期。后续主页面应在 pet-pack activePackId 变化时通知 AI pane 刷新：

- reload persona profile；
- reload current conversation；
- clear expired generated persona draft；
- keep unsaved provider config draft unchanged。

## 下一轮推荐开发阶段

### Phase A: Memory Management Surface

目标：让自动记忆可见、可删、可清空。

范围：

- `AiTalkStore` 增加 list/delete/clear memory API。
- `AiTalkService` 暴露 memory profile。
- IPC 增加 memory 管理 channel。
- Control Center AI 页展示全局记忆与当前宠物记忆。
- 测试覆盖 store/service/ipc/UI 基础路径。

验收：

- 开启 memory 后后台抽取成功，AI 页可见。
- 删除单条记忆后不会再注入 prompt。
- 清空当前宠物记忆不影响 global memory。
- 敏感过滤仍不保存原文。

### Phase B: Relevant Memory Scoring

目标：让注入记忆和当前对话更相关。

范围：

- `AiTalkService` 添加轻量 scorer。
- `AiTalkStore` 支持标记 memory used。
- 日志记录 memory ids 和 score，不记录原文。
- 测试覆盖 tag/text/scope/importance/recency 排序。

验收：

- 当前问题相关记忆优先注入。
- 其他 pet-pack 关系记忆不会串入当前宠物。
- `lastUsedAt/useCount` 正确更新。

### Phase C: Action Tool Upgrade

目标：让模型动作建议更可控，减少无效动作。

范围：

- 扩展 `openpet_behavior` schema。
- 将当前 pet-pack action candidates 注入动态上下文或 tool schema 描述。
- host 继续校验 actionId。
- behavior diagnostics 记录 tool intent、reason、host validation result。

验收：

- 模型只能触发当前 pet-pack 已有动作。
- 无效 actionId 被安全降级为纯回复。
- behavior replay 仍可复现决策。

### Phase D: Bubble Segmentation And UX Polish

目标：让宠物回复更像桌宠，而不是整段 AI 消息。

范围：

- 增加 reply segmentation helper。
- transcript 保存完整 reply。
- UI/IPC/PetService 支持分段气泡显示。
- 增加过长回复保护。

验收：

- 长回复分段显示。
- transcript 不丢内容。
- 动作执行时机不会和多段气泡冲突。

### Phase E: Legacy Migration And Diagnostics Export

目标：稳定升级路径和问题定位能力。

范围：

- 一次性迁移旧 `settings.ai.conversations`。
- AI Talk redacted trace store。
- Control Center 导出 AI Talk 诊断。
- 文档补充 manual smoke checklist。

验收：

- 旧用户升级后不丢早期 control-center 对话。
- 诊断导出不含 API key、完整 prompt、完整 memory text。
- provider/chat/memory/action 关键链路可通过 trace 串起来。

## Backlog

- 桌面浮窗聊天入口。
- 流式回复和取消生成。
- 多 conversation UI。
- LLM 历史摘要压缩。
- embedding/vector memory retrieval。
- AI Talk 插件扩展点。
- 记忆隐私策略高级配置。
- 记忆候选人工确认模式。
- 独立 memory/persona/action planning 模型角色配置。

## 开发约束

- 不绕过 `PetService` 执行宠物状态变更。
- 不把 API key 暴露给 renderer 或普通插件。
- 不把完整 prompt、完整记忆、API key 写入默认日志。
- 不把本地 persona override 写回 pet-pack 文件。
- 不修改现有 `cat_anime/` material 结构。
- 新增设置必须可通过 Control Center 操作。
- 每个阶段至少补 `tests/services` 或 `tests/control-center` 对应回归。

## 快速入口

主要代码：

- `main.js`
- `src/main/services/ai-service.js`
- `src/main/services/ai-talk-service.js`
- `src/main/services/ai-talk-store.js`
- `src/main/pet-pack/schema.js`
- `src/main/ipc.js`
- `src/control-center/src/hooks/useAiPane.ts`
- `src/control-center/src/panes/AiPane.tsx`
- `src/shared/openpet-contracts.ts`

主要测试：

- `tests/services/ai-service.test.js`
- `tests/services/ai-talk-service.test.js`
- `tests/services/ai-talk-store.test.js`
- `tests/pet-pack/schema.test.js`
- `tests/control-center/control-center-smoke.spec.js`
