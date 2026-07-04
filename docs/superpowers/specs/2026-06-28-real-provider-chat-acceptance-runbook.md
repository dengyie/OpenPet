# Real Provider Chat Acceptance Runbook

日期：2026-06-28
适用 Milestone：真实 provider 聊天体验 + 人工交互验收
适用分支：`codex/bubble-chat-runtime-verify`

## 目标

本 runbook 用于验收透明 BubbleChatWindow 在真实 provider 下的轻聊天体验，重点覆盖以下问题：

- 迷你输入是否可用
- 回复节奏是否正常
- 气泡停留时间是否足够阅读
- 日志与 requestId 是否足够定位问题
- 桌面体感是否符合“轻提示 + 可继续对话”的目标

## 范围

本次只验收当前 milestone 的 P0/P1：

- 真实 provider 的 bubble chat 请求链路
- `requestId` / `providerLatencyMs` / bubble 展示证据
- 迷你输入发送和桌面可读性
- 人工交互记录模板

不包含：

- 流式回复
- 新窗口形态
- 插件 / HTTP / MCP 的 `intent` 扩展
- 长期记忆或 persona 新能力

## 前置条件

1. 本地 AI provider 已在设置中配置完成。
2. 当前 active pet-pack 可正常加载。
3. 当前分支代码已通过本 milestone 相关测试。
4. 用户机器允许启动 Electron 应用并进行桌面交互。

## 自动化验证

### 1. 定向测试

```bash
node --test tests/scripts/run-ai-talk-local-smoke.test.js
npm run check:syntax
```

通过标准：

- smoke 脚本测试通过
- 语法检查通过

### 2. 真实 provider 烟测

执行：

```bash
node scripts/run-ai-talk-local-smoke.js \
  --message "你好，请用一句简短中文回复，用于 bubble chat 验收" \
  --output-dir tmp/real-provider-chat-acceptance
```

通过标准：

- 返回 `ok: true`
- `bubbleAcceptance.requestId` 非空
- `bubbleAcceptance.providerLatencyMs` 大于 0
- `bubbleDispatch.petSayReceived === true`
- `bubbleDispatch.bubbleStateVisible === true`
- 日志中包含 `pet-bubble-chat.message.displayed`

重点检查输出文件 `ai-talk-local-smoke-result.json` 中以下字段：

```json
{
  "bubbleAcceptance": {
    "requestId": "chat-...",
    "providerLatencyMs": 1934,
    "bubbleSegmentCount": 1,
    "replyChars": 20
  },
  "manualAcceptanceTemplate": {
    "bubbleVisibleLongEnough": null,
    "inputUsable": null,
    "desktopFeelNotes": "",
    "requestId": "chat-..."
  }
}
```

## 人工交互验收

### 1. 启动应用

```bash
npm start
```

### 2. 操作路径

1. 等待宠物出现，确认桌面上只看到头顶的透明气泡聊天层，不应再有下方第二个聊天框。
2. 双击宠物，确认默认打开的是 BubbleChatWindow。
3. 在默认折叠状态下展开迷你输入框。
4. 输入一条短消息，例如：`你好，今天状态怎么样？`
5. 发送后观察：
   - 发送态是否明确
   - 回复是否成功回到头顶透明气泡
   - 回复展示期间是否足够阅读
   - 用户 hover / 点击 / 选中文本时是否会定格
6. 在回复出现后尝试复制文本，确认不会立即消失。
7. 停止操作，确认 TTL 到期后气泡会自动消失。

### 3. 失败路径

如果发送失败，记录：

- 是否仍能看到失败态
- 输入内容是否保留
- 是否能重试
- 日志中是否能通过 `requestId` 找到对应失败记录

## 人工记录模板

把下面字段填回 smoke 结果里的 `manualAcceptanceTemplate`。推荐直接使用更新命令，而不是手改 JSON：

```bash
npm run update-ai-talk-local-smoke-report -- \
  docs/release-evidence/ai-talk-local-smoke/<session>/ai-talk-local-smoke-result.json \
  --bubble-visible-long-enough true \
  --input-usable true \
  --desktop-feel-notes "回复停留时间足够，hover 后不会消失；输入区点击命中正常。" \
  --validate-complete
```

然后结果会同时写回：

- `ai-talk-local-smoke-result.json`
- 同目录 `README.md`
- 如已存在，同目录 `ai-talk-local-smoke-archive-result.json`

CLI 会拒绝包含 raw path、Authorization/Bearer 文本、或 secret-like token 的备注，避免人工回填把归档边界写穿。

示例：

```json
{
  "bubbleVisibleLongEnough": true,
  "inputUsable": true,
  "desktopFeelNotes": "回复停留时间足够，hover 后不会消失；输入区点击命中正常。",
  "requestId": "chat-..."
}
```

字段含义：

- `bubbleVisibleLongEnough`
  - `true`：回复停留时间足够读完
  - `false`：仍然过短
- `inputUsable`
  - `true`：输入、发送、失败提示、继续操作正常
  - `false`：输入链路仍有阻塞
- `desktopFeelNotes`
  - 简要记录体感，例如遮挡、抖动、焦点抢占、自动消失太快、复制困难
- `requestId`
  - 必须使用本次真实请求对应的 requestId

## 判定标准

本 milestone 在人工验收层面的通过标准：

- 真实 provider 至少完成一次成功回复
- 迷你输入可发送
- 透明气泡停留时间足够阅读
- 用户交互时不会被过早自动隐藏
- 失败时可以从日志和 `requestId` 回溯

如果自动化通过，但人工体感仍存在明显问题，应归类为：

- 遮挡 / 定位问题
- 停留时长问题
- 输入交互问题
- provider 节奏问题

这些问题可以作为下一 milestone 输入，但不在本轮自动扩范围处理。
