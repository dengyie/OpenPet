# Phase 43 开发文档：Signed Release Evidence Closure

## 目标

Phase 43 的目标是把 signed release claim 变成可审计的闭环判断：只有签名、公证、Gatekeeper、Windows Authenticode、clean-machine smoke、desktop picker 和 packaged runtime 证据全部满足时，项目才允许声明 official desktop release readiness。

当前本机没有 Apple Developer ID / notarization / Windows signing 凭据，因此本阶段不伪造 signed-ready。完成结果是新增 closure report 工具，并归档当前真实证据下的 `not-ready` 结论。

## 本阶段完成内容

- 新增 `scripts/create-signed-release-closure-report.js`：
  - 读取现有 release evidence archive manifest，或直接从 archive/report/evidence 文件生成 manifest。
  - 默认用 `requireSigned: true` 评估 signed release closure。
  - 输出 Markdown 与 JSON closure report。
  - 将 release claim 拆成 `officialDesktopRelease`、`macos`、`windows`。
  - 明确列出 blockers，避免 pending/unsigned evidence 被误读成 release-ready。
  - 保留 `--fail-on-not-ready`，用于正式 release CI 硬门禁。

- 新增 `tests/release/signed-release-closure-report.test.js`：
  - 覆盖参数解析。
  - 覆盖 unsigned/pending archive 不得升级为 release-ready。
  - 覆盖 macOS / Windows 平台证据不能互相替代。
  - 覆盖 signed all-pass Windows claim 可以 ready，但 official desktop release 仍必须满足双平台证据。
  - 覆盖 Markdown / JSON 输出。

- 新增 npm script：
  - `npm run create-signed-release-closure-report`

- 归档当前 closure evidence：
  - `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/release-evidence-archive-manifest.json`
  - `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/signed-release-closure-report.md`
  - `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/signed-release-closure-report.json`

## 当前结论

当前 closure report 的结论是：

- `releaseReady: false`
- `macos: not-ready`
- `windows: not-ready`
- `officialDesktopRelease: not-ready`

主要 blockers：

- 缺 macOS codesign / notarization / Gatekeeper signed evidence。
- macOS packaged runtime report 仍是 unsigned，并且 picker-linked checks 还未完成。
- Windows smoke report 仍是 pending template，缺 Authenticode signed evidence 与 clean-machine smoke。
- Windows desktop picker evidence 缺失。
- Windows packaged runtime evidence 缺失；现有 runtime evidence 是 macOS packaged app。

这正是本阶段想要保护的口径：工具可以归档当前事实，但不会把当前事实升级为官方发布就绪。

## 验证

```bash
node --test tests/release/signed-release-closure-report.test.js
npm run create-signed-release-closure-report -- --archive-dir docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z --windows-smoke-report docs/release-evidence/windows-smoke-report.template.json --packaged-runtime-report docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/packaged-runtime-smoke-report.json --manifest-output docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/release-evidence-archive-manifest.json --output docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/signed-release-closure-report.md --json-output docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/signed-release-closure-report.json
```

完整验证和 production review 记录见：

- `docs/reviews/phase-43-signed-release-evidence-closure-review.md`

## 后续约束

1. 正式 release CI 可以使用 `--fail-on-not-ready` 作为 hard gate。
2. 当真实 signed macOS / Windows 证据补齐时，应重新生成 archive manifest 和 closure report。
3. SmartScreen 只能记录 observed result，不能用 Authenticode 或 smoke evidence 推断 reputation trust。
