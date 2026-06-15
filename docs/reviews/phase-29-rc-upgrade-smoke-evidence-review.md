# Phase 29 RC 升级兼容 smoke 证据 Review

## Findings

- No blocking issues found.

## Notes

- 本阶段新增的 RC upgrade smoke 工具只读取本地 legacy `ibot` userData 证据，不改变运行时代码的升级逻辑。
- 报告把 legacy 目录、observed userData 目录、settings / secrets / plugins / pet-packs / localHttp logs 是否保留等关键信息串起来，便于本地 RC 验证者判断升级兼容是否成立。
- `--allow-pending` 只是结构检查，不把模板报告误写成升级通过。
- 本阶段没有改动插件权限模型、renderer 暴露面、API key 管理、runtime sandbox 或 Windows release-ready 支持声明。

## Verification

Review 后通过：

```bash
node --check scripts/create-rc-upgrade-smoke-report.js
node --check scripts/validate-rc-upgrade-smoke-report.js
node --test tests/scripts/validate-rc-upgrade-smoke-report.test.js
npm test
npm run check:syntax
npm run test:control-center
```

结果：

- `node --check scripts/create-rc-upgrade-smoke-report.js` 通过。
- `node --check scripts/validate-rc-upgrade-smoke-report.js` 通过。
- `node --test tests/scripts/validate-rc-upgrade-smoke-report.test.js` 通过，6/6 断言通过。
- `npm test` 通过，300/300 Node tests pass。
- `npm run check:syntax` 通过。
- `npm run test:control-center` 通过，9/9 Playwright tests pass。

## Residual Risk

- 这仍然只是本地 RC upgrade smoke 证据，不是真实发布包、签名产物或正式 GitHub Release 验证。
- 真正的升级 smoke 仍需要在打包后的 OpenPet RC 上跑一次带真实 legacy 数据的验证。
