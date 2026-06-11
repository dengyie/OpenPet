# Phase 4 开发文档：AI 行为编排 v2

> 阶段目标：把 AI 动作触发从回复文本关键词匹配升级为结构化、可配置、可调试的行为编排。  
> 范围约束：AI 不能直接调用插件、HTTP、MCP 或读取敏感配置；最终行为仍必须通过 `PetService`。

## 1. 背景

当前 AI 回复触发动作依赖 `findSemanticAction(reply, actions)`，它能按 action id、label、kind 关键词做轻量匹配。这个路径简单可靠，但缺少：

- 结构化 intent / actionId。
- 可配置规则优先级。
- actionId 白名单。
- cooldown。
- dry-run 调试。
- 编排决策日志。

## 2. 本阶段交付

### 2.1 AiService tool-call intent

OpenAI-compatible provider 在行为编排启用时可发送 `ibot_behavior` tool 定义。Provider 返回 `tool_calls` 时，`AiService.chat()` 返回：

```json
{
  "reply": "bubble text",
  "behaviorIntent": {
    "intent": "success",
    "actionId": "done",
    "confidence": 0.9,
    "bubbleText": "完成了"
  }
}
```

不支持 tool-call 的 provider 继续返回普通文本，后续由规则/fallback 匹配。

### 2.2 BehaviorOrchestratorService

新增 `src/main/services/behavior-orchestrator-service.js`：

- `getConfig()`：返回 enabled、useTools、cooldownMs、rules、recentDecisions。
- `saveConfig(partial)`：保存行为编排配置。
- `evaluate({ reply, behaviorIntent, actions })`：输出将执行的 `say` / `playAction` / `setEvent` 决策。
- `dryRun(payload)`：不触发 cooldown，不执行行为，仅返回解释。

规则模型：

```json
{
  "id": "success-action",
  "enabled": true,
  "priority": 100,
  "when": { "intent": "success", "minConfidence": 0.7 },
  "then": { "type": "playAction", "actionId": "done" }
}
```

支持 `when.intent`、`when.contains`、`when.actionKind`；支持 `then.say`、`then.playAction`、`then.setEvent`。

### 2.3 IPC / Control Center

新增 IPC：

- `ai-behavior:get`
- `ai-behavior:save`
- `ai-behavior:dry-run`

AI 页新增 Behavior 区块：

- 启用结构化行为编排。
- 启用 provider tools。
- cooldownMs。
- 规则 JSON。
- dry-run 输入与决策结果。

## 3. 安全与兼容规则

- AI 只能选择当前 action 列表里的 actionId。
- 规则里的 actionId 也必须经过当前 action 白名单。
- cooldown 防止连续触发同一动作。
- 编排决策日志只保存 intent、ruleId、actionId、reason，不记录 API Key。
- 行为编排关闭时保留现有 `findSemanticAction()` fallback。

## 4. 验收

- 支持 provider tool_call 结构化 intent 触发动作。
- fallback 规则/关键词仍可触发现有动作。
- dry-run 能解释命中规则或失败原因。
- 单元测试覆盖 priority、actionId 白名单、cooldown、tool-call parse、fallback。
- `npm test` 通过。
- `npm run check:syntax` 通过。

## 5. Production Code Quality Review 关注点

- 行为执行是否仍通过 `PetService`。
- actionId 白名单是否覆盖 tool-call 和规则路径。
- cooldown 是否不会影响 dry-run。
- 配置保存是否保留现有 AI conversations。
- 测试是否能证明危险 actionId 不会执行。
