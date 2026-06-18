# Phase 106 开发文档：Plugin Community Source Invitation Contracts

> Date: 2026-06-18
> Branch: `codex/phase106-invitation-evidence-contracts`

## 1. 目标

Phase 106 把 Phase 105 invitation kit 的 summary JSON 纳入 shared TypeScript evidence contract 边界。目标是减少后续 invitation evidence、文档和脚本之间的字段漂移，同时保持 Phase 105 的保守口径：invitation kit 只是 draft outreach，不是兼容性、信任、发布或运行安全证据。

本阶段可验证结果：

- `PluginCommunitySourceInvitationSummary` 描述 Phase 105 summary 输出；
- representative type fixture 使用该 contract；
- invitation-kit targeted test 覆盖 `status`、`contactState`、`nextAction` 和边界文案；
- `npm run typecheck` 能证明该边界未漂移。

## 2. 范围

已实现：

- 新增 shared TypeScript 类型：
  - `PluginCommunitySourceInvitationStatus`
  - `PluginCommunitySourceInvitationContactState`
  - `PluginCommunitySourceInvitationTarget`
  - `PluginCommunitySourceInvitationFiles`
  - `PluginCommunitySourceInvitationSummary`
- 在 `tests/shared/openpet-contracts-type-fixture.ts` 增加 invitation summary fixture。
- 扩展 `tests/scripts/create-plugin-community-source-invitation-kit.test.js`，验证持久化 summary 的 draft/contact/boundary 字段。

不在本阶段范围：

- 不把 invitation kit 脚本迁移到 TypeScript。
- 不新增 runtime validator。
- 不联网、不发送邀请、不下载候选源码。
- 不改变 community-source submission evidence、Phase 100 intake 或 Phase 99 evidence 流程。
- 不更新签名、公证、Windows 真机 smoke 或真实第三方来源状态。

## 3. 决策记录

| 问题 | 决策 | 理由 | 风险 |
|------|------|------|------|
| 是否增加 runtime JSON validator | 不增加 | 当前 milestone 是 TypeScript 边界，生成器已有 targeted tests；runtime validator 会扩大范围 | 后续如果多个入口消费 summary，可再独立纳入验证器 |
| 是否把 invitation 状态做成开放 string | 使用 literal union | 当前只有 `invitation-draft-ready` 和 `not-sent` 是有证据支持的状态，避免误写已发送/已接受 | 后续真实发送或回复需要新阶段扩展 contract |
| 是否更新全部 live docs | 不做 | 本阶段改变的是内部 type boundary，不改变用户能力或发布事实 | HANDOFF 仍以 Phase 105 当前事实为准 |

## 4. 验收

已运行：

```bash
node --test tests/scripts/create-plugin-community-source-invitation-kit.test.js
npm run typecheck
npm run check:syntax
npm test                     # 691/691
npm run test:control-center  # 10/10
git diff --check
```

当前验收口径：Phase 106 只证明 invitation summary 已进入 shared TypeScript contract 边界；它仍不证明邀请已发送、第三方已回复、兼容插件存在、签名信任、catalog publication、runtime safety 或 release readiness。
