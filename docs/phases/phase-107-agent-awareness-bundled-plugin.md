# Phase 107 开发文档：Agent Awareness Bundled Plugin

> Date: 2026-07-02
> Branch: `codex/agent-awareness-bundled-plugin`

## 1. 目标

Phase 107 在不继续改动底层 plugin runtime 架构的前提下，交付官方 bundled
`openpet.agent-awareness` 插件最小闭环。核心目标是让 OpenPet 能通过通用
service bridge 接收本地 agent 的 sanitized 状态事件，并由宠物表达状态。

## 2. 已实现

- 新增 `examples/plugins/agent-awareness/` 官方插件包。
- 插件声明 `pet:say` / `pet:event`，不声明未使用的 `pet:action`。
- 新增长运行 service：
  - `GET /health`
  - `GET /api/sessions`
  - `POST /api/events`
  - dashboard `/`
- `POST /api/events` 使用 `OPENPET_DATA_DIR/ingest-token.txt` bearer token，缺 token 时 fail closed。
- 新增 Codex adapter normalizer，丢弃 raw prompt/tool/stdout/stderr/full path。
- 新增 session store，原子写入 `sessions.json`，最多 100 个 session，每个 session 最多 20 条历史。
- 新增 state mapper，通过 service bridge 调用 `pet.event` 和 rate-limited `pet.say`。
- 新增 dashboard，使用 DOM text node 渲染，避免事件文本 XSS。
- 新增显式命令：
  - `install-codex-hooks`：生成 token 和手动 hook 指令，不写 `~/.codex`。
  - `uninstall-codex-hooks`：生成移除说明，不改外部配置。
  - `doctor`：检查本地 setup 状态。
- 将插件加入 bundled sync 和 electron-builder 打包文件列表。
- 更新 `docs/agent-awareness-plugin-design.md` 为当前事实文档。

## 3. 不在本阶段范围

- 不实现核心 `AgentRuntimeService`。
- 不自动修改 `~/.codex` / `~/.claude` / `~/.gemini`。
- 不实现真实 Codex hook schema 写入。
- 不加入 Claude/Gemini adapter。
- 不为 service 增加 config 注入能力。
- 不启用 `pet:action` 映射。
- 不做真实桌面体验验收。

## 4. 关键决策

| 问题 | 决策 | 理由 |
| --- | --- | --- |
| service config | 首版不提供 config schema | 当前 host 不注入 service config，避免 UI 可配但运行时不生效 |
| ingestion 鉴权 | 使用 plugin data dir 中的 bearer token | loopback 裸写入口会允许任意本地进程驱动宠物状态 |
| Codex setup | 只生成手动说明 | hook schema 未在本阶段固定，不能安全自动改外部配置 |
| pet action | 暂不声明/调用 `pet:action` | 没有稳定 action id，默认调用会造成跨 pet-pack 行为不确定 |

## 5. 验收

本阶段应通过：

```bash
node --test tests/examples/agent-awareness-plugin.test.js
node --test tests/main/main-scale-injection.test.js tests/services/bundled-plugin-sync-service.test.js
node --test tests/services/plugin-service.test.js tests/services/plugin-command-bridge-server.test.js tests/services/plugin-command-runner.test.js tests/plugins/plugin-bridge-docs.test.js
npm run check:syntax
git diff --check
```

Manual-required：

- 用户真实 Codex hook 接入。
- 桌面宠物状态表达和 dashboard 体验验收。
