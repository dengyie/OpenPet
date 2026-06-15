# Phase 23 插件提交校验入口 Review

## Findings

- No blocking issues found.

## Notes

- `validate:plugin` 复用 `PluginInstallService.inspectPluginPackage()`，因此目录/zip 结构、manifest 归一化、路径安全、symlink 拒绝、package hash、签名 metadata、权限 diff 和 blocklist 规则与 Control Center 安装 review 路径保持一致。
- CLI 只创建临时 installed plugin dir 用于 review diff，不调用 install、enable 或 command runner，因此不会执行第三方插件代码。
- 默认 unsigned 插件可通过本地结构校验并输出 warning；`--require-signature` 会把未达到 `hash-verified` 的包升级为失败，适合作为 catalog/release 前置门禁。
- `--block-id` 与 `--block-sha256` 为本地审核演练提供了可重复的 blocklist 输入，但真实远端 blocklist 分发和社区提交流程仍不在本阶段范围内。
- 本阶段没有改动插件权限模型、renderer 暴露面、API key 管理或 Windows release-ready 支持声明。

## Verification

Review 后已通过：

```bash
node --check scripts/validate-plugin-package.js
node --test tests/scripts/validate-plugin-package.test.js
npm run validate:plugin -- examples/plugins/focus-timer
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

结果：

- `node --check scripts/validate-plugin-package.js` 通过。
- `node --test tests/scripts/validate-plugin-package.test.js` 通过，3/3 tests passed。
- `npm run validate:plugin -- examples/plugins/focus-timer` 通过，并输出 unsigned 与 human review warnings。
- `npm test` 通过，269/269 Node tests passed。
- `npm run test:control-center` 通过，9/9 Playwright UI tests passed。
- `npm run check:syntax` 通过，包含 Node syntax check 与 Control Center Vite build。
- `git diff --check` 通过。

## Residual Risk

- 本阶段只证明本地提交前预检入口可用，不代表真实第三方提交通道、审核 SLA、远端 catalog 工作流或社区运营流程已经产品化。
- `--require-signature` 只要求当前 hash metadata verified；它不是公钥根信任、证书链或发布者身份验证。
- 插件运行时隔离仍依赖现有 `PluginService` runner、SDK permission gate 和后续真实平台 smoke evidence。
