# Agent Awareness Real Codex Acceptance Runbook

日期：2026-07-03  
适用 Milestone：bundled `openpet.agent-awareness` real-session acceptance  
适用分支：`codex/dev7`

## 目标

本 runbook 用于把 agent-awareness 当前仍需要人工判断的部分收敛成一条可重复执行的验收链，重点覆盖：

- 本机真实 Codex 会话是否能被插件以脱敏方式发现
- `doctor` / `/health` / dashboard 是否持续保持隐私边界
- 宠物提示是否足够有用且不过度打扰
- 自动化与人工验收之间的边界是否清晰

## 范围

本次验收覆盖：

- `npm run run-agent-awareness-local-smoke` 的本地真实会话烟测
- 脱敏后的 session 摘要、统计与 hook-plan 资产
- Control Center Plugins pane / dashboard 的人工可用性检查

不包含：

- 自动安装或卸载 Codex hooks
- 永久噪声控制配置
- semantic pet action host contract
- 多 session 焦点/置顶策略

## 前置条件

1. 本机存在至少一个真实 Codex 会话目录，默认位于 `~/.codex/sessions` 或 `~/.codex/archived_sessions`。
2. 当前分支相关测试已通过。
3. 如需进行桌面验收，用户机器允许启动 Electron 应用。

## 自动化验证

### 1. 定向测试

```bash
node --test tests/scripts/run-agent-awareness-local-smoke.test.js
node --test tests/examples/agent-awareness-plugin.test.js tests/examples/agent-awareness-dashboard.test.js tests/examples/agent-awareness-dashboard-browser.test.js
npm run check:docs-drift
```

通过标准：

- 本地 smoke 脚本测试通过
- 现有 agent-awareness 运行时 / dashboard 回归通过
- 文档漂移检查通过

### 2. 真实 Codex 会话烟测

执行：

```bash
npm run run-agent-awareness-local-smoke -- \
  --codex-home ~/.codex \
  --output-dir tmp/agent-awareness-real-codex-acceptance
```

可选参数：

- `--scan-timeout-ms 20000`：等待本地 rollout 信号更久
- `--sample-limit 8`：保留更多脱敏 session 样本

通过标准：

- 命令退出码为 `0`
- `ok === true`
- `sanitizedSignalDetected === true`
- `health.diagnostics.sessionCount > 0`
- `redactionChecks.sessionIdsHashed === true`
- `redactionChecks.projectLabelsRedacted === true`
- `redactionChecks.noRawPaths === true`
- `redactionChecks.noLoopbackUrls === true`
- `redactionChecks.noSecrets === true`

重点检查结果文件 `agent-awareness-local-smoke-result.json` 中以下字段：

```json
{
  "ok": true,
  "sanitizedSignalDetected": true,
  "hookPlan": {
    "authFile": "plugin-auth-file",
    "instructionsFile": "codex-hook-plan.md"
  },
  "health": {
    "service": "agent-awareness",
    "diagnostics": {
      "sessionCount": 1,
      "activeSessionCount": 0,
      "totalEvents": 3
    }
  },
  "manualAcceptanceTemplate": {
    "dashboardUseful": null,
    "petSpeechNoiseAcceptable": null,
    "redactionLooksSafe": true,
    "notes": ""
  }
}
```

如果没有本地真实 Codex 会话信号，命令会返回非零并把 `timedOut` 或诊断信息写入结果文件。这应视为“未通过”，而不是“插件没问题”。

## 人工桌面验收

### 1. 启动应用

```bash
npm start
```

### 2. 操作路径

1. 打开 `Control Center -> Plugins`。
2. 找到同步后的 `openpet.agent-awareness` 插件。
3. 确认插件启用，如未启用则显式启用。
4. 如当前宿主要求审批，授予 native execution approval。
5. 启动 `agent-awareness` service。
6. 打开 dashboard。
7. 同时在本机触发一段真实 Codex 会话，观察：
   - dashboard 中 session 是否以脱敏 label 出现
   - Plugins pane 是否显示 `X active · Y sessions · Z events`
   - 宠物提示是否只在状态变化时出现，而不是持续刷屏
   - `doctor` 输出是否仍只包含安全标签，不暴露本机路径

### 3. 人工记录模板

把下面字段填回 smoke 结果里的 `manualAcceptanceTemplate`。推荐直接使用更新命令，而不是手改 JSON：

```bash
npm run update-agent-awareness-local-smoke-report -- \
  docs/release-evidence/agent-awareness-local-smoke/<session>/agent-awareness-local-smoke-result.json \
  --dashboard-useful true \
  --pet-speech-noise-acceptable true \
  --redaction-looks-safe true \
  --notes "Dashboard 能区分 thinking/working/completed，宠物只在明显状态变化时发声。" \
  --validate-complete
```

然后结果会同时写回：

- `agent-awareness-local-smoke-result.json`
- 同目录 `README.md`
- 如已存在，同目录 `agent-awareness-local-smoke-archive-result.json`

CLI 会拒绝包含 raw path、loopback URL、Authorization/Bearer 文本、或 secret-like token 的备注，避免人工回填把归档边界写穿。

示例：

```json
{
  "dashboardUseful": true,
  "petSpeechNoiseAcceptable": true,
  "redactionLooksSafe": true,
  "notes": "Dashboard 能区分 thinking/working/completed，宠物只在明显状态变化时发声。"
}
```

字段含义：

- `dashboardUseful`
  - `true`：session 状态和统计足够帮助定位当前工作态
  - `false`：状态过少、过慢或不够可读
- `petSpeechNoiseAcceptable`
  - `true`：宠物提示频率可接受
  - `false`：提示过多、重复或打断感明显
- `redactionLooksSafe`
  - `true`：未观察到 raw path / raw session id / prompt / stdout/stderr 泄露
  - `false`：任一敏感信息暴露
- `notes`
  - 简要记录可读性、噪声、延迟、异常或后续建议

## 判定标准

当前 milestone 的通过标准：

- 自动化烟测能从真实 Codex home 检测到脱敏 session 信号
- Smoke 报告明确保留 hook-plan 和诊断边界
- 人工桌面验收确认 dashboard 有用、宠物提示不过噪、脱敏边界可信

如果自动化通过，但人工体感仍存在明显问题，应归类为：

- 状态摘要不足
- speech 频率偏高
- dashboard 可读性不足
- 脱敏边界异常

这些问题应进入下一 milestone，而不是在验收记录里被模糊带过。
