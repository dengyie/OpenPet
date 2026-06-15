# Phase 24 开发文档：插件提交审核包

> 阶段目标：把插件生态从“提交前可本地校验”推进到“开发者可以生成 reviewer 可读的提交审核包”，让第三方插件提交/审核演练有可归档材料。
> 范围约束：不改变插件权限模型，不安装或启用插件，不运行插件代码，不接入远端 marketplace，不改变签名根信任或 Windows release-ready 口径。

## 1. 背景

Phase 23 已新增 `npm run validate:plugin -- <plugin-dir-or-zip>`，让开发者在提交前复用 `PluginInstallService` package review 规则检查目录或 `.openpet-plugin.zip`。这解决了“能不能过本地预检”的问题，但真实第三方审核还需要一份稳定、可转交、可归档的摘要材料。

Phase 24 不重复实现 package review，也不把本地结果误写成发布批准。它在 Phase 23 结构化结果之上生成提交审核包，帮助 reviewer 看到插件身份、权限、network allowlist、命令、签名 metadata、package hash、风险和人工检查项。

## 2. 目标

- 新增 `npm run create-plugin-submission-report -- <plugin-dir-or-zip>`。
- 报告支持 Markdown 或 `--json` 输出，并可用 `--output <path>` 写入归档文件。
- 复用 Phase 23 的 `validatePluginPackage()`，不重新读取或执行第三方插件代码。
- 报告包含插件 metadata、权限、network allowlist、commands、签名状态、package hash、文件数量、风险、validation warning/error 和 reviewer checklist。
- `--require-signature`、`--installed-dir`、`--block-id`、`--block-sha256` 与 `validate:plugin` 保持一致，支持提交审核演练。
- 新增 Node 测试覆盖参数解析、成功报告、严格签名失败、Markdown 渲染和文件写出。
- 更新插件开发文档和活文档，让第三方提交路径从“只校验”升级为“校验 + 生成审核包”。

## 3. 非目标

- 不新增远端 marketplace、PR 模板、社区 SLA 或自动发布流。
- 不建立公钥根信任、证书链或发布者身份验证。
- 不改变插件安装、启用、更新、disabled-by-default 或 SDK 权限策略。
- 不改变 renderer / API key / ordinary plugin 安全边界。
- 不改变 macOS / Windows 发布支持声明。

## 4. 实现计划

- 新增 `scripts/create-plugin-submission-report.js`，导出 `parseArgs()`、`createPluginSubmissionReport()`、`renderMarkdownSubmissionReport()` 和 `writeReport()`。
- 新增 `package.json` script：`create-plugin-submission-report`。
- 新增 `tests/scripts/create-plugin-submission-report.test.js`，使用真实 Focus Timer 示例插件验证报告内容和严格签名失败路径。
- 更新 `docs/plugin-development.md`，加入 Submission Report 章节和提交前命令。
- 更新 README、HANDOFF、development summary、技术文档、路线图、状态评估和文档治理记录中的阶段/测试数量。

## 5. 验证计划

```bash
node --check scripts/create-plugin-submission-report.js
node --test tests/scripts/create-plugin-submission-report.test.js
npm run create-plugin-submission-report -- examples/plugins/focus-timer --output /tmp/openpet-focus-plugin-submission.md
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

## 6. 残留风险

- 报告只证明本地预检和人工审核材料生成可用，不代表真实社区提交通道、审核 SLA 或远端 catalog 工作流已经产品化。
- 报告中的 signature metadata 仍只表示 hash metadata 状态，不是公钥根信任或发布者身份验证。
- 第三方插件运行时安全仍依赖现有 `PluginService` runner、SDK permission gate、安装 review 和后续真实平台 smoke evidence。
