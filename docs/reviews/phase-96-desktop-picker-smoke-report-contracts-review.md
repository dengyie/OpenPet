# Phase 96 Review: Desktop Picker Smoke Report Contracts

> Date: 2026-06-18
> Branch: `codex/plugin-cleanup-evidence-contracts-phase91`
> Mode: deep
> Scope: shared desktop picker smoke report contracts, representative fixtures, and live documentation updates.

## Scope

- Base: current Phase 95 head with Phase 96 contract additions.
- Scope mode: working tree.
- Changed files reviewed: `src/shared/openpet-contracts.ts`, `tests/shared/openpet-contracts-type-fixture.ts`, Phase 96 docs, and live documentation updates.
- Risk level: low to medium, because this is compile-time contract work on a release-evidence JSON boundary already covered by runtime tests.

## Findings

No blocking production issues remain in the Phase 96 diff.

## Review Notes

- Runtime desktop picker smoke report generation and validation behavior are unchanged.
- The new contract matches the real `create-desktop-picker-smoke-report` output shape already exercised by the desktop picker smoke report tests.
- The new fixture keeps the source smoke report shape explicit instead of only relying on downstream summary/archive projections.

## Review Fixes

- Added `DesktopPickerSmokeReport` contracts for the packaged native picker smoke report output.
- Added representative fixtures that keep the no-emit typecheck tied to the real source report shape.

## Architecture Assessment

This keeps the source desktop picker report contract in the shared boundary layer, where release/evidence consumers can reuse it directly without duplicating JSON assumptions. The CommonJS smoke script remains the owner of runtime behavior and validation semantics.

## Test Assessment

Strongest coverage:

- red-green typecheck proof for the missing smoke report contract export;
- targeted desktop picker smoke report tests;
- downstream summary/archive tests confirming the new contract did not drift from existing consumers.

Remaining gap:

- real signed native picker evidence still depends on external packaged-app runs and remains outside this phase.

## Quality Gate

- Result: pass
- Rationale: the diff is narrow, runtime behavior is unchanged, and the new contract surface matches existing tested outputs.

## Verification

```bash
npm run typecheck
# pass
```

```bash
node --test tests/release/desktop-picker-smoke-report.test.js tests/release/create-desktop-picker-evidence-summary.test.js tests/release/create-desktop-picker-archive-manifest.test.js
# pass: 26/26
```

```bash
npm run check:syntax
# pass
```

```bash
npm test
# pass
```

```bash
npm run test:control-center
# pass
```

```bash
git diff --check
# pass
```

```bash
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# pass
```
