# Phase 54 开发文档：Release Evidence Contracts

## 目标

Phase 54 延续 TypeScript 边界迁移路线，把 release evidence archive manifest 和 signed release closure report 的真实输出结构纳入 `src/shared/openpet-contracts.ts`。

本阶段只增加共享契约和测试覆盖，不生成新的签名证据，不改变 release readiness 判断，不升级 macOS / Windows 支持口径，也不改动发布脚本的运行时行为。

## 本阶段完成内容

- 扩展 `src/shared/openpet-contracts.ts`：
  - 新增 `ReleaseEvidenceArchiveManifest`。
  - 新增 `ReleaseEvidenceArchiveFile`、`ReleaseEvidenceReportSnapshot`、`ReleaseEvidenceReportValidation`、`ReleaseEvidenceReportSection`。
  - 新增 `MacosReleaseEvidenceStatus` 和 `MacosReleaseEvidenceFileStatus`，对齐 manifest 中 `macos.codesign/notarization/gatekeeper` 的实际形状。
  - 新增 `SignedReleaseClosureReport`、`SignedReleaseClaim` 和 `SignedReleaseClaimStatus`。
  - 保留现有轻量 `ReleaseEvidenceArchiveSummary` 与 `SignedReleaseClaimSummary`，避免破坏已有 summary fixture。
- 扩展 `tests/shared/openpet-contracts-type-fixture.ts`：
  - 增加 release archive manifest fixture。
  - 增加 signed release closure report fixture。
  - 让 `npm run typecheck` 覆盖完整 release evidence / closure payload 结构。
- 扩展 release 测试：
  - `tests/release/release-evidence-archive-manifest.test.js` 校验真实生成的 manifest 满足共享契约形状。
  - `tests/release/signed-release-closure-report.test.js` 校验真实生成的 closure report 满足共享契约形状。

## Review 修复

Production review 中发现一个 P3 级契约维护风险：最初新增的 `MacosReleaseEvidenceSection` 名称暗示它代表完整 macOS evidence section，但真实 manifest 只在 `macos.codesign/notarization/gatekeeper` 下输出 `{ status, file }`。

已修复为 `MacosReleaseEvidenceFileStatus`，并让 `ReleaseEvidenceArchiveManifest` 直接复用该类型，避免后续调用方误读结构。

## 验收

- `npm run typecheck` 覆盖完整 release evidence manifest 与 closure report fixture。
- `createReleaseEvidenceArchiveManifest()` 的真实输出有测试锁定：
  - `generatedAt`
  - `requireSigned`
  - `ok`
  - `releaseReady`
  - `archive`
  - `files`
  - `macos`
  - `reports`
  - `errors`
  - `warnings`
- `createSignedReleaseClosureReport()` 的真实输出有测试锁定：
  - `schemaVersion`
  - `manifest`
  - `claims`
  - `smartScreen`
  - `nextActions`
- Release readiness 仍由现有脚本和证据决定；本阶段不把 pending evidence 写成 ready。
- `npm run check:syntax`、`npm run test:control-center`、`npm test` 和 `git diff --check` 通过。

## 验证

```bash
npm run typecheck
node --test tests/release/release-evidence-archive-manifest.test.js tests/release/signed-release-closure-report.test.js
npm run check:syntax
npm run test:control-center
npm test
git diff --check
```

当前结果：

- `npm run typecheck`: pass
- targeted release evidence tests: 20/20 pass
- `npm run check:syntax`: pass
- `npm run test:control-center`: 10/10 pass
- `npm test`: 409/409 pass
- `git diff --check`: pass

## 后续约束

1. 后续 release evidence 脚本新增字段时，应同步更新 shared contract、type fixture 和生成器测试。
2. Contract 只能描述真实输出，不得用类型暗示尚未产生的签名证据。
3. Windows 和 official desktop release readiness 继续保持 `not-ready`，直到真实签名和平台烟测证据归档。
