# Phase 26 开发文档：插件提交工作流包

> 阶段目标：把插件生态从“可生成审核包和 PR packet”推进到“一条命令生成可归档的第三方插件提交工作流包”，让真实社区提交/审核演练的本地材料更接近一次完整流程。
> 范围约束：不改变插件权限模型，不安装或启用插件，不运行插件代码，不接入远端 marketplace，不改变签名根信任或 Windows release-ready 口径。

## 1. 背景

Phase 23 提供 package validation，Phase 24 提供 reviewer submission report，Phase 25 提供 PR packet 和 GitHub 插件提交模板。开发者已经能逐步生成提交材料，但真实提交演练还缺少一个“交付目录”：一次运行即可产出 report、PR body 和 summary，方便归档和 reviewer 对照。

Phase 26 将这些产物打包为本地 workflow bundle。它继续复用前置 CLI 的结构化结果，不重新实现 package review，不运行第三方插件代码，也不把本地材料误写成社区批准或签名信任。

## 2. 目标

- 新增 `npm run create-plugin-submission-bundle -- <plugin-dir-or-zip>`。
- Bundle 目录包含 `plugin-submission-report.md`、`plugin-submission-pr.md` 和 `plugin-submission-summary.json`。
- 复用 Phase 24/25 的 `createPluginSubmissionReport()` 与 `createPluginSubmissionPr()`。
- `--require-signature`、`--installed-dir`、`--block-id`、`--block-sha256` 与前置 CLI 保持一致。
- 新增 Node 测试覆盖参数解析、默认目录、成功 bundle、严格签名失败和文件写出。
- 更新插件开发文档和活文档，让第三方提交路径有推荐的一条 bundle 命令。

## 3. 非目标

- 不新增远端 marketplace、自动发布流、社区 SLA 或机器人审核。
- 不建立公钥根信任、证书链或发布者身份验证。
- 不改变插件安装、启用、更新、disabled-by-default 或 SDK 权限策略。
- 不改变 renderer / API key / ordinary plugin 安全边界。
- 不改变 macOS / Windows 发布支持声明。

## 4. 实现计划

- 新增 `scripts/create-plugin-submission-bundle.js`，导出 `parseArgs()`、`defaultOutputDir()`、`createPluginSubmissionBundle()` 和 `writeText()`。
- 新增 `package.json` script：`create-plugin-submission-bundle`。
- 新增 `tests/scripts/create-plugin-submission-bundle.test.js`，使用真实 Focus Timer 示例插件验证 bundle 内容和严格签名失败路径。
- 更新 `docs/plugin-development.md`，加入 Submission Workflow Bundle 章节和推荐提交命令。
- 更新 README、HANDOFF、development summary、技术文档、路线图、状态评估和文档治理记录中的阶段/测试数量。

## 5. 验证计划

```bash
node --check scripts/create-plugin-submission-bundle.js
node --test tests/scripts/create-plugin-submission-bundle.test.js
npm run create-plugin-submission-bundle -- examples/plugins/focus-timer --output-dir /tmp/openpet-focus-plugin-submission-bundle
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

## 6. 残留风险

- Bundle 只证明本地提交材料可生成，不代表真实第三方提交通道、审核 SLA、远端 catalog 工作流或社区运营流程已经产品化。
- Bundle 仍要求人工 reviewer 记录批准；本阶段不把本地 checklist 视为 merge approval。
- 签名仍只停留在 hash metadata 和人工说明层面，不是公钥根信任或发布者身份验证。
