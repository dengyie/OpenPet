# Phase 23 开发文档：插件提交校验入口

> 阶段目标：把插件生态从“有示例可参考”推进到“开发者提交前有本地校验入口”，让第三方插件包能在进入人工 review 前先通过与应用安装路径一致的基础检查。
> 范围约束：不改变插件权限模型，不安装或启用插件，不接入远端 marketplace，不改变 Windows release-ready 口径。

## 1. 背景

Phase 20-22 已补齐 Focus Timer、Weather Status 和 RSS Reader 三个示例插件，覆盖 `storage`、`pet:say`、`network` allowlist、JSON 数据源和公开 feed 数据源。开发者已经能参考真实包结构，但真实第三方提交仍缺少一个稳定的本地预检命令。

当前 Control Center 安装路径已经由 `PluginInstallService` 负责 package review、manifest 归一化、路径安全、symlink 拒绝、hash、签名 metadata、权限 diff 和 blocklist。Phase 23 不重新实现这些规则，而是暴露一个 CLI，让提交前校验复用同一套 service 逻辑。

## 2. 目标

- 新增 `npm run validate:plugin -- <path>`，支持目录或 `.openpet-plugin.zip`。
- CLI 输出插件 id、版本、权限、network allowlist、签名状态、package hash、文件数和 review 风险。
- 默认允许 unsigned 插件通过结构校验，但明确给出 warning；`--require-signature` 可用于更严格的 catalog/release 预检。
- 校验签名 hash metadata 错误、blocklist 命中和严格签名要求时以非零状态失败。
- 新增 Node 测试覆盖成功、严格签名失败和签名 metadata 错误。
- 更新插件开发文档和活文档，让开发者知道提交前检查入口。

## 3. 非目标

- 不新增插件权限或放宽 `network.allowlist` 规则。
- 不执行插件代码，不运行命令 handler，不安装插件。
- 不替代人工权限 review、签名根信任、远端 catalog 审核或社区提交流程。
- 不改变第三方插件默认 disabled 的安装策略。
- 不改变 macOS / Windows 发布支持声明。

## 4. 实现计划

- 新增 `scripts/validate-plugin-package.js`，内部创建临时 installed plugin dir 和轻量 settings service，调用 `PluginInstallService.inspectPluginPackage()`。
- 新增 `package.json` script：`validate:plugin`。
- 新增 `tests/scripts/validate-plugin-package.test.js`，使用真实示例插件和临时坏签名插件验证 CLI/service 结果。
- 更新 `docs/plugin-development.md`，在打包和测试章节加入提交前校验命令。
- 更新 README、HANDOFF、development summary、技术文档、路线图、状态评估和文档治理记录中的阶段/测试数量。

## 5. 验证计划

```bash
node --check scripts/validate-plugin-package.js
node --test tests/scripts/validate-plugin-package.test.js
npm run validate:plugin -- examples/plugins/focus-timer
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

## 6. 残留风险

- 本阶段只提供本地预检入口，不证明真实社区提交、人工审核 SLA、签名根信任或远端 marketplace 已经形成。
- `--require-signature` 只要求当前 hash metadata verified；它不是公钥信任链或证书验证。
- 插件执行时安全仍依赖现有 `PluginService` runner、SDK permission gate 和后续真实平台 smoke。
