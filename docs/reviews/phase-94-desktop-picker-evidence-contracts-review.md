# Phase 94 Review: Desktop Picker Evidence Contracts

> Date: 2026-06-18
> Branch: `codex/plugin-cleanup-evidence-contracts-phase91`
> Mode: deep
> Scope: shared desktop picker evidence contracts, representative fixtures, and live documentation updates.

## Scope

- Base: current Phase 93 head with Phase 94 contract additions.
- Scope mode: working tree.
- Changed files reviewed: `src/shared/openpet-contracts.ts`, `tests/shared/openpet-contracts-type-fixture.ts`, Phase 94 docs, and live documentation updates.
- Risk level: low to medium, because this is compile-time contract work on release-evidence JSON boundaries.

## Findings

No blocking production issues remain in the Phase 94 diff.

## Review Notes

- Runtime desktop picker evidence summary and archive manifest behavior is unchanged.
- The new contracts match the real `create-desktop-picker-evidence-summary` and `create-desktop-picker-archive-manifest` output shapes.
- The shared fixture covers pending and signed-gated picker evidence vocabulary without requiring external signed artifacts.

## Review Fixes

- Added `DesktopPickerEvidenceSummary` contracts for the desktop picker evidence summary output.
- Added `DesktopPickerArchiveManifest` contracts for the desktop picker archive manifest output.
- Added representative fixtures that keep the no-emit typecheck tied to real desktop picker evidence script outputs.

## Architecture Assessment

This keeps desktop picker evidence knowledge in the shared contract layer instead of duplicating JSON assumptions in future consumers. The CommonJS scripts remain the owners of runtime evidence generation and validation.

## Test Assessment

Strongest coverage:

- red-green typecheck proof for missing desktop picker evidence contract exports;
- targeted desktop picker evidence summary/archive tests;
- shared fixture coverage for summary and archive manifest shapes.

Remaining gap:

- real signed desktop picker evidence still depends on external packaged-app runs and remains outside this phase.

## Quality Gate

- Result: pass
- Rationale: the change is narrow, matches runtime outputs, and is verified by both type and targeted runtime tests.

## Verification

```bash
npm run typecheck
# pass
```

```bash
node --test tests/release/create-desktop-picker-evidence-summary.test.js tests/release/create-desktop-picker-archive-manifest.test.js
# pass: 18/18
```

```bash
npm run check:syntax
# pass
```

```bash
npm test
# pass: 652/652
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
