# Phase 26 插件提交工作流包 Review

## Findings

- No blocking issues found.

## Notes

- `create-plugin-submission-bundle` 复用 Phase 24/25 的 report 和 PR packet 生成函数，因此 package review 规则仍来自前置 `validatePluginPackage()` / `PluginInstallService`。
- Bundle 只写出 Markdown/JSON 提交材料，不调用 install、enable、update 或 command runner，因此不会执行第三方插件代码。
- Bundle 明确包含 summary JSON，方便记录 `readyForHumanReview`、decision、package hash、signature status 和生成文件路径。
- `--require-signature`、`--installed-dir`、`--block-id`、`--block-sha256` 与前置 CLI 对齐，可用于本地审核演练和 update diff 检查。
- 本阶段没有改动插件权限模型、renderer 暴露面、API key 管理或 Windows release-ready 支持声明。

## Verification

Review 后已通过：

```bash
node --check scripts/create-plugin-submission-bundle.js
node --test tests/scripts/create-plugin-submission-bundle.test.js
npm run create-plugin-submission-bundle -- examples/plugins/focus-timer --output-dir /tmp/openpet-focus-plugin-submission-bundle
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

结果：

- `node --check scripts/create-plugin-submission-bundle.js` 通过。
- `node --test tests/scripts/create-plugin-submission-bundle.test.js` 通过，6/6 tests pass。
- `npm run create-plugin-submission-bundle -- examples/plugins/focus-timer --output-dir /tmp/openpet-focus-plugin-submission-bundle` 通过，并生成 report、PR packet 与 summary 三个文件。
- `npm test` 通过，288/288 Node tests pass。
- `npm run test:control-center` 通过，9/9 Playwright UI tests pass。
- `npm run check:syntax` 通过，Node syntax check 与 Control Center Vite build 均通过。
- `git diff --check` 通过。

## Residual Risk

- 本阶段只证明本地 workflow bundle 可生成，不代表真实第三方提交通道、审核 SLA、远端 catalog 工作流或社区运营流程已经产品化。
- `--require-signature` 仍只要求当前 hash metadata verified；它不是公钥根信任、证书链或发布者身份验证。
- 插件运行时隔离仍依赖现有 `PluginService` runner、SDK permission gate 和后续真实平台 smoke evidence。
