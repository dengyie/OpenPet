# Phase 105 Review：Plugin Community Source Invitation Kit

> Mode: checkpoint
> Date: 2026-06-18
> Branch: `codex/phase105-community-source-invitation-kit`
> Scope: Phase 105 working-tree diff for the invitation kit CLI, targeted tests, generated invitation evidence, npm scripts, and live documentation updates.

## 结论

通过。Phase 105 变更是一个确定性的 draft invitation packet generator，不联网、不发送消息、不下载、不执行、不安装第三方代码。核心风险集中在“是否会把邀请材料误说成已经联系第三方或已经拿到兼容插件”。当前实现、测试和文档都把该边界写清楚。审查中发现的 evidence timestamp 自洽问题已用同一生成器重写修复。

质量评分：92/100

通过状态：通过

## 审查设置

- Base: current working tree against HEAD for Phase 105 files.
- Scope mode: working tree checkpoint.
- Changed files reviewed:
  - `package.json`
  - `scripts/create-plugin-community-source-invitation-kit.js`
  - `tests/scripts/create-plugin-community-source-invitation-kit.test.js`
  - `docs/release-evidence/plugin-community-source-invitation-kit/2026-06-18T23-59-00Z-compatible-author-outreach/`
  - `docs/phases/phase-105-plugin-community-source-invitation-kit.md`
  - `docs/reviews/phase-105-plugin-community-source-invitation-kit-review.md`
  - `docs/superpowers/plans/2026-06-18-community-source-invitation-kit-phase105.md`
  - live docs: `docs/HANDOFF.md`, `docs/development-summary.md`, `docs/project-status-review.md`, `docs/project-context.json`, `docs/productization-v1.1-todo-design.md`, `docs/project-review-todo-design.md`, `docs/plugin-submission-workflow-playbook.md`
- Risk level: low to medium. The command handles untrusted target labels and URLs, but it only writes local Markdown/JSON artifacts.
- Assumption: Phase 105 is outreach preparation after Phase 104 discovery, not a proof of external community adoption.

## 严重问题

无 P0/P1/P2 阻断问题。

已修复：

- `docs/release-evidence/plugin-community-source-invitation-kit/2026-06-18T23-59-00Z-compatible-author-outreach/` 初次重跑后 `generatedAt` 与 session 名称不一致。已用 `createPluginCommunitySourceInvitationKit` 固定 `now()` 重新生成，避免归档读者误解证据时间。

## 改进建议

- 后续如果维护者实际发送邀请并收到回复，应新增独立 “invitation response evidence” 阶段，而不是 retroactively 修改 Phase 105 draft packet 语义。
- 后续如果第三方提供候选包，应从 Phase 104 discovery / Phase 100 intake 重新进入证据链，不能直接把 invitation kit 升级成 compatibility evidence。

## 架构评估

行为放在合适层级：这是 release-evidence / maintainer workflow 脚本，不改变插件运行时、manifest validator、Control Center 或安装流程。

耦合没有变重：脚本复用已有 session id 与安全输出目录 helper；输出 artifact 小而明确。

维护成本可控：两个 npm script 名称指向同一实现，修复了原先存在但无实现的短命令入口。

## 鲁棒性评估

- `targetAuthor` 必填，避免生成无目标邀请。
- `targetUrl` 如存在必须是 HTTPS。
- requested capability slug 只允许小写字母、数字和 hyphen。
- 输出目录通过既有 rehearsal output-dir guard 约束。
- Summary 固定 `contactState: "not-sent"`，避免把草稿材料误解为真实外部联系。

## 测试评估

最强覆盖：

- CLI parsing 覆盖 target author、HTTPS URL、context、capability list、maintainer、output dir 和 JSON mode。
- 错误路径覆盖缺失值、缺少 target author、非 HTTPS URL、非法 capability slug 和未知参数。
- artifact 生成覆盖 README、message、checklist、summary。
- no-target-URL 路径覆盖一般社区邀请草稿，并验证不声称 contact 已发生。

当前测试足够覆盖本阶段的核心风险。真实发送记录、第三方回复、候选包下载和兼容性验证都属于后续阶段。

## 有意义的优点

- 将 Phase 104 的 `find-or-invite` 后续动作变成可归档、可审查的维护者材料。
- 文案欢迎第三方作者提交天气、宠物动作、宠物对话、性格注入、creator-tools 等能力方向，但不放松 OpenPet 的证据链边界。
- 修复了一个已有 npm script 指向不存在脚本的问题。

## 验证

已运行：

```bash
node --test tests/scripts/create-plugin-community-source-invitation-kit.test.js
npm run create-plugin-community-source-invitation -- --help
npm run create-plugin-community-source-invitation-kit -- --target-author "OpenPet-compatible extension authors" --target-url https://github.com/dengyie/OpenPet --candidate-context "Phase 104 discovery currently has no compatible public plugin.json source." --requested-capabilities "weather pet-action pet-dialogue pet-personality creator-tools" --maintainer "OpenPet Maintainer" --output-dir docs/release-evidence/plugin-community-source-invitation-kit/2026-06-18T23-59-00Z-compatible-author-outreach --json
npm run check:syntax
npm test                     # 691/691
npm run test:control-center  # 10/10
npm run typecheck
git diff --check
node -e "const fs=require('node:fs'); for (const file of ['package.json','docs/project-context.json','docs/release-evidence/plugin-community-source-invitation-kit/2026-06-18T23-59-00Z-compatible-author-outreach/plugin-community-source-invitation-summary.json']) JSON.parse(fs.readFileSync(file,'utf8')); console.log('json ok')"
```

## 剩余风险

当前 kit 只证明维护者准备了邀请材料。它不证明邀请已发送、第三方已回复、兼容插件已存在、签名/发布/运行安全已成立，或 release readiness 已提升。

## 最终建议

Safe to merge.
