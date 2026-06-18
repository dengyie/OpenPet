# Phase 97 Review: Windows Smoke Report Contracts

> Date: 2026-06-18
> Branch: `codex/plugin-cleanup-evidence-contracts-phase91`
> Mode: deep
> Scope: shared Windows smoke report contracts, representative fixtures, and live documentation updates.

## Scope

- Base: current Phase 96 head with Phase 97 contract additions.
- Scope mode: working tree manually narrowed to the Phase 97 Windows smoke report contract diff.
- Changed files reviewed: the `WindowsSmokeReport` additions in `src/shared/openpet-contracts.ts`, the matching `WindowsSmokeReport` fixture in `tests/shared/openpet-contracts-type-fixture.ts`, Phase 97 docs, and live documentation updates.
- Risk level: low to medium, because this is compile-time contract work on a release-evidence JSON boundary already covered by runtime tests.

## Findings

No blocking production issues remain in the Phase 97 diff.

## Review Notes

- Runtime Windows smoke report generation and validation behavior are unchanged.
- The new contract matches the real `create-windows-smoke-report` output shape already exercised by Windows smoke report tests.
- The new fixture keeps the source Windows smoke report shape explicit instead of relying only on downstream summary/archive projections.

## Review Fixes

- Added `WindowsSmokeReport` contracts for the Windows smoke report output.
- Added representative fixtures that keep the no-emit typecheck tied to the real source report shape.

## Architecture Assessment

This keeps the source Windows smoke report contract in the shared boundary layer, where release/evidence consumers can reuse it directly without duplicating JSON assumptions. The CommonJS smoke script remains the owner of runtime behavior and validation semantics.

## Test Assessment

Strongest coverage:

- red-green typecheck proof for the missing smoke report contract export;
- targeted Windows smoke report tests;
- downstream summary/archive tests confirming the new contract did not drift from existing consumers.

Remaining gap:

- real signed Windows smoke evidence still depends on external Windows execution and remains outside this phase.

## Quality Gate

- Result: pass
- Score: 90
- Rationale: the diff is narrow, runtime behavior is unchanged, and the new contract surface matches existing tested outputs.

## Verification

```bash
npm run typecheck
# pass
```

```bash
node --test tests/release/create-windows-smoke-report.test.js tests/release/create-windows-smoke-evidence-summary.test.js tests/release/create-windows-smoke-archive-manifest.test.js
# pass: 22/22
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
