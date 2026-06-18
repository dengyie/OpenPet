# Phase 105 开发文档：Plugin Community Source Invitation Kit

> Date: 2026-06-18
> Branch: `codex/phase105-community-source-invitation-kit`

## 1. 目标

Phase 105 承接 Phase 104 的 `find-or-invite-compatible-plugin-json-package` next action：当公开 discovery 仍未找到兼容第三方 `plugin.json` package 时，维护者可以生成一份本地邀请材料包，用于邀请第三方作者提交兼容 OpenPet 扩展。

本阶段的可验证结果是：

- `npm run create-plugin-community-source-invitation-kit` 可生成 invitation summary、README、message 和 checklist；
- 既有短命令 `npm run create-plugin-community-source-invitation` 也指向同一实现，不再悬空；
- invitation kit 明确记录 `contactState: "not-sent"`，不声称邀请已发送或被接受；
- 文档明确 invitation kit 不是 compatibility、trust、publication、runtime safety 或 release readiness 证据。

## 2. 范围

已实现：

- 新增 `scripts/create-plugin-community-source-invitation-kit.js`。
- 新增 `tests/scripts/create-plugin-community-source-invitation-kit.test.js`。
- 新增 npm script：`create-plugin-community-source-invitation-kit`。
- 修复 npm script：`create-plugin-community-source-invitation` 指向 invitation kit 实现。
- 生成 Phase 105 证据：
  - `docs/release-evidence/plugin-community-source-invitation-kit/2026-06-18T23-59-00Z-compatible-author-outreach/`
- 同步 live docs、handoff、project context、TODO design、review table 和 submission playbook。

不在本阶段范围：

- 不联网搜索候选人。
- 不发送邀请、不创建 issue、不打开 PR。
- 不记录外部作者回复。
- 不下载或验证第三方源码；这仍属于 Phase 100 intake。
- 不声称已有兼容第三方插件、签名信任、catalog publication、runtime safety 或 release readiness。

## 3. 实现

`create-plugin-community-source-invitation-kit` 接收：

- `--target-author <name>`：必填，社区作者、项目或目标受众标签。
- `--target-url <https-url>`：可选，公开主页、仓库、讨论或资料页。
- `--candidate-context <text>`：可选，为什么邀请该作者或受众。
- `--requested-capabilities <list>`：可选，空格或逗号分隔的小写 capability slug。
- `--maintainer <name>`：可选，准备邀请材料的维护者。
- `--output-dir <dir>`：可选，输出目录。
- `--json`：可选，打印 summary。

生成文件：

- `plugin-community-source-invitation-summary.json`
- `README-community-source-invitation.md`
- `invitation-message.md`
- `invitation-checklist.md`

关键运行边界：

- `targetAuthor` 必填。
- `targetUrl` 如存在必须是 HTTPS。
- capability 只能使用小写字母、数字和 hyphen，避免把自由文本误当成机器字段。
- 输出目录复用 rehearsal 安全边界，避免写到项目根、home 或不安全目录。

## 4. 决策记录

| 问题 | 决策 | 理由 | 风险 |
|------|------|------|------|
| 是否让工具直接发出邀请 | 不发送，只生成 draft packet | 可复现、可审查；避免自动联系第三方或制造外部状态 | 维护者仍需手动发送并记录后续回复 |
| 是否把 invitation kit 视为 community evidence | 不视为 evidence | 它只证明维护者准备了邀请材料，不证明存在兼容插件 | 后续文档必须继续避免夸大生态成熟度 |
| 是否保留已有短 npm script | 保留并指向新实现 | `package.json` 已有该命令名但脚本不存在；修复坏入口可减少维护者困惑 | 两个命令名都需要在 docs 中保持同义 |
| 是否允许无 target URL | 允许 | 可用于一般社区征集、Discord/论坛草稿或尚未锁定目标的公开邀请 | 必须用 `contactState: not-sent` 和 README 边界避免误解 |

## 5. 验收

已完成验证：

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

Checkpoint review 发现 evidence session 目录和 `generatedAt` 初次重跑时间不一致；已用同一生成器按 `2026-06-18T23:59:00.000Z` 重新生成该 evidence，保持归档自洽。

当前验收口径是：维护者可以准备兼容第三方作者邀请材料，但仍未找到或确认兼容第三方 `plugin.json` package。收到候选包后必须重新进入 Phase 104 discovery、Phase 100 intake、Phase 103 bridge 和 Phase 99 community-source evidence。
