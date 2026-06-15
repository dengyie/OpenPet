# Phase 25 开发文档：插件提交 PR 模板

> 阶段目标：把插件生态从“可生成 reviewer 审核包”推进到“第三方插件提交可以形成一致的 PR 正文和 GitHub 模板”，让真实社区提交流程有可执行入口。
> 范围约束：不改变插件权限模型，不安装或启用插件，不运行插件代码，不接入远端 marketplace，不改变签名根信任或 Windows release-ready 口径。

## 1. 背景

Phase 23 提供了提交前 package validation，Phase 24 提供了 reviewer Markdown/JSON 审核包。下一步缺口是文档中反复提到的 PR 模板和社区提交流程：开发者仍需要知道 PR 正文要包含哪些字段，reviewer 也需要稳定的检查项。

Phase 25 不替代人工 review，也不把本地审核包升级为发布批准。它在 Phase 24 report 基础上生成 PR packet，并提供 GitHub PR template，把插件身份、权限、network allowlist、签名状态、package hash、review checklist 和边界声明固定下来。

## 2. 目标

- 新增 `npm run create-plugin-submission-pr -- <plugin-dir-or-zip>`。
- PR packet 支持 Markdown 或 `--json` 输出，并可用 `--output <path>` 写入归档文件。
- 复用 Phase 24 的 `createPluginSubmissionReport()`，不重新实现 package review，不安装或运行插件代码。
- 新增 `.github/PULL_REQUEST_TEMPLATE/plugin-submission.md`，提供手工 PR 提交流程和 reviewer checklist。
- `--require-signature`、`--installed-dir`、`--block-id`、`--block-sha256` 与前置 CLI 保持一致。
- 新增 Node 测试覆盖参数解析、成功 PR、严格签名失败、Markdown 渲染、checklist 和文件写出。
- 更新插件开发文档和活文档，让第三方提交路径从“校验 + 审核包”升级为“校验 + 审核包 + PR packet/template”。

## 3. 非目标

- 不建立真实远端 marketplace、自动发布流、社区 SLA 或机器人审核。
- 不建立公钥根信任、证书链或发布者身份验证。
- 不改变插件安装、启用、更新、disabled-by-default 或 SDK 权限策略。
- 不改变 renderer / API key / ordinary plugin 安全边界。
- 不改变 macOS / Windows 发布支持声明。

## 4. 实现计划

- 新增 `scripts/create-plugin-submission-pr.js`，导出 `parseArgs()`、`createPluginSubmissionPr()`、`renderMarkdownPr()`、`buildChecklist()` 和 `writePr()`。
- 新增 `package.json` script：`create-plugin-submission-pr`。
- 新增 `tests/scripts/create-plugin-submission-pr.test.js`，使用真实 Focus Timer 示例插件验证 PR packet 内容和严格签名失败路径。
- 新增 `.github/PULL_REQUEST_TEMPLATE/plugin-submission.md`。
- 更新 `docs/plugin-development.md`，加入 PR packet 命令和提交步骤。
- 更新 README、HANDOFF、development summary、技术文档、路线图、状态评估和文档治理记录中的阶段/测试数量。

## 5. 验证计划

```bash
node --check scripts/create-plugin-submission-pr.js
node --test tests/scripts/create-plugin-submission-pr.test.js
npm run create-plugin-submission-pr -- examples/plugins/focus-timer --output /tmp/openpet-focus-plugin-submission-pr.md
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

## 6. 残留风险

- PR packet 和模板只证明本地提交材料可生成，不代表真实社区审核 SLA、远端 catalog 工作流或机器人自动审核已经产品化。
- 模板仍要求人工 reviewer 记录批准；本阶段不把本地 checklist 视为 merge approval。
- 签名仍只停留在 hash metadata 和人工说明层面，不是公钥根信任或发布者身份验证。
