# Phase 29 开发文档：RC 升级兼容 smoke 证据

> 阶段目标：把 OpenPet 的 RC 升级兼容验证从手工说明推进到本地可生成、可校验的 smoke 证据工具。
> 范围约束：不改变运行时代码行为，不改变插件权限模型，不接入远端 release，不把本地 smoke 工具误写成正式发布或签名信任。

## 1. 背景

`docs/release-checklist.md` 和 `docs/project-status-review.md` 都把“旧 `ibot` userData 升级兼容”列为 RC 验证重点，但当前仓库只有测试层面的 `configureUserDataPath()` 覆盖，还没有一个面向本地验证的报告工具把 legacy 目录、关键持久化文件和 observed userData 目录是否误变成 OpenPet 新目录这几件事串起来。

Phase 29 补一个本地 RC upgrade smoke 路径，让验证者可以先生成一份结构化报告，再用校验命令确认 legacy 目录、settings / secrets / plugins / pet-packs / localHttp logs 以及 observed userData 目录都符合升级兼容预期。

## 2. 目标

- 新增 `npm run create-rc-upgrade-smoke-report -- ...`。
- 新增 `npm run validate-rc-upgrade-smoke-report -- ...`。
- 让报告能够记录 legacy `ibot` userData 目录、observed userData 目录、settings / secrets / plugins / pet-packs / localHttp logs preserved 状态。
- 提供 `--allow-pending` 以支持模板/结构检查，不把未填证据的报告误写成升级通过。
- 新增 Node 测试覆盖 pending、ready、路径误指向和输出写出。
- 同步 live docs，明确 Phase 29 只是本地升级 smoke 证据，不是正式 release-ready 声明。

## 3. 非目标

- 不修改 `src/main/user-data-path.js` 的兼容逻辑。
- 不改动 `SettingsService`、`AboutService` 或任何运行时代码路径。
- 不假装本地报告等同于真实签名 release、GitHub Release 或正式 RC 发布。
- 不把 Windows release-ready、SmartScreen trust 或 packaged picker evidence 归档推进到本阶段。

## 4. 实现记录

- 新增 `scripts/create-rc-upgrade-smoke-report.js`，用于基于 legacy `ibot` userData fixture 生成本地 RC upgrade smoke 报告。
- 新增 `scripts/validate-rc-upgrade-smoke-report.js`，用于校验 report 结构、证据完整性和 observed userData 结果。
- 新增 `tests/scripts/validate-rc-upgrade-smoke-report.test.js`，覆盖 ready report、pending report、active OpenPet data source 回归和 CLI 参数解析。
- 在 `package.json` 中新增 `create-rc-upgrade-smoke-report` 与 `validate-rc-upgrade-smoke-report` 命令。

## 5. 验证

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

## 6. 残留风险

- 这只是本地 smoke 证据工具，不代表真实用户升级路径已经在所有平台和发布包上都完成 smoke 验证。
- 报告需要真实 seeded legacy data 和真实 observed userData 结果，才能从 pending 升到可用证据。
- 真正的 RC 发布还要和 GitHub Release、签名产物和 release checklist 一起完成。
