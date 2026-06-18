# Phase 92 Review: macOS Release Evidence Contracts

> Date: 2026-06-18
> Branch: `codex/plugin-cleanup-evidence-contracts-phase91`
> Mode: deep
> Scope: shared macOS release evidence contracts, representative fixtures, and live documentation updates.

## Scope

- Base: current Phase 91 head with Phase 92 contract additions.
- Scope mode: working tree.
- Changed files reviewed: `src/shared/openpet-contracts.ts`, `tests/shared/openpet-contracts-type-fixture.ts`, Phase 92 docs, and live documentation updates.
- Risk level: low to medium, because this is compile-time contract work on release-evidence JSON boundaries.

## Findings

No blocking production issues remain in the Phase 92 diff.

## Review Notes

- Runtime macOS evidence capture and archive copy behavior is unchanged.
- The new contracts match the real `create-macos-release-evidence` summary and `create-macos-release-evidence-archive` manifest shapes.
- The shared fixture now covers both the summary and archive contracts without requiring external signed evidence.

## Review Fixes

- Added `MacosReleaseEvidenceCommand` and `MacosReleaseEvidenceSummary` contracts for the Phase 77 output path.
- Added `MacosReleaseEvidenceArtifactArchiveManifest` contracts for the Phase 79 archive path.
- Added representative fixtures that keep the no-emit typecheck tied to real macOS evidence script outputs.

## Architecture Assessment

This keeps the release-evidence boundary in the shared contract layer instead of scattering JSON shape knowledge through consumers. The runtime scripts remain the single owners of evidence generation.

## Test Assessment

Strongest coverage:

- red-green typecheck proof for missing macOS evidence contract exports;
- targeted macOS evidence generation tests;
- shared fixture coverage for both summary and archive manifest shapes.

Remaining gap:

- real signed macOS evidence still depends on external artifact state and remains outside this phase.

## Quality Gate

- Result: pass
- Rationale: the change is narrowly scoped, aligned with runtime outputs, and verified by both type and target tests.

## Verification

```bash
npm run typecheck
# pass
```

```bash
node --test tests/release/create-macos-release-evidence.test.js tests/release/create-macos-release-evidence-archive.test.js
# pass: 14/14
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
# pass: 10/10
```

```bash
git diff --check
# pass
```

```bash
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# pass
```

