# Phase 107 Review：Agent Awareness Bundled Plugin

> Mode: checkpoint
> Date: 2026-07-02
> Branch: `codex/agent-awareness-bundled-plugin`
> Scope: service bridge hardening plus bundled `openpet.agent-awareness` plugin.

## 结论

通过。实现把 agent-specific 行为放在 bundled plugin 内，核心只增加 bundled
sync / package inclusion 和 service bridge 生命周期硬化，没有引入核心
AgentRuntimeService。

质量评分：91/100

通过状态：通过

## 严重问题

无 P0/P1 阻断问题。

## 中等问题

无当前阶段必须修复的问题。

## 非阻塞建议

- 后续如果要让端口、speech policy 可配置，应先设计通用 service config 注入，不要让插件直接读取 renderer 配置。
- 真实 Codex hook schema 固定后，再把当前 manual instruction 升级为 fixture-tested 安装/卸载逻辑。
- 如果需要 `pet:action`，应先提供 action id 映射配置或从 host context 获得可用 action 列表。

## 安全风险

低到中。`POST /api/events` 已从裸 loopback 写入口改为 bearer-token gated，dashboard 使用 text node 渲染，service bridge token 不暴露给 dashboard。剩余风险是能读取插件 data dir token 的本地进程仍可提交 sanitized 事件。

## 稳定性风险

低。service 本身 dependency-free，session store 原子写入并限制 session/history 数量。真实 Codex hook 仍是 Manual-required，不计入自动化通过结论。

## 可维护性风险

中低。Agent adapter、state mapper、store、bridge client 已拆成 plugin-local 模块；未继续扩大 `plugin-service.js`。未来多 adapter 时应保持插件内模块化，不回流到 core。

## 测试覆盖

- Manifest、adapter sanitization、session store、state mapper、service ingest、HTTP token gate、manual hook plan 都有 `tests/examples/agent-awareness-plugin.test.js` 覆盖。
- Main bootstrap bundled sync 路径更新由 `tests/main/main-scale-injection.test.js` 覆盖。
- Service bridge lifecycle hardening 由 `tests/services/plugin-service.test.js` 覆盖。

## 最终建议

Safe to merge with Manual-required follow-up for real Codex hook wiring and desktop feel validation.
