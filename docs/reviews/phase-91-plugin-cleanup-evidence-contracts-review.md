# Phase 91 Review: Plugin Cleanup Evidence Contracts

> Date: 2026-06-18
> Branch: `codex/plugin-cleanup-evidence-contracts-phase91`
> Mode: deep
> Scope: shared TypeScript cleanup evidence contracts, representative fixtures, and live documentation updates.

## Scope

- Base: Phase 90 HEAD with the packaged-runbook detour removed from working tree scope.
- Scope mode: working tree.
- Changed files reviewed: `src/shared/openpet-contracts.ts`, `tests/shared/openpet-contracts-type-fixture.ts`, Phase 91 docs, and live summary/handoff/status context updates.
- Risk level: low to medium, because this is compile-time contract work on release/evidence boundaries rather than runtime process behavior.

## Findings

No blocking production issues remain in the Phase 91 diff.

## Review Notes

- Runtime cleanup execution is unchanged.
- The new contracts mirror real script outputs instead of introducing a second invented schema.
- Archive manifests keep `environment` and `scenario` partial in the shared contract so malformed archives remain representable for diagnostics.
- The shared fixture now covers the cleanup archive manifest, collector run transcript, and top-level runner result in addition to the earlier cleanup report/checklist coverage.

## Review Fixes

- Added explicit shared types for cleanup report validation summaries so manifest contracts reuse the same readiness model as the validator.
- Added shared contracts for cleanup archive file entries, collected evidence file hashes, collector transcript metadata, and runner results.
- Added representative fixtures that match Phase 89/90 script output shapes and keep `npm run typecheck` honest.

## Architecture Assessment

This phase improves the TypeScript boundary without destabilizing release tooling. The cleanup evidence scripts continue to own runtime behavior, while `src/shared/openpet-contracts.ts` now covers the JSON artifacts those scripts persist and return.

## Test Assessment

Strongest coverage:

- red-green typecheck proof for missing cleanup contract exports;
- targeted archive manifest runtime tests;
- targeted runner runtime tests;
- shared fixture coverage for cleanup evidence report, archive manifest, collector run transcript, and runner result.

Remaining gap:

- packaged app UI cleanup evidence is still future work; Phase 91 only types the current archive and runner outputs.

## Quality Gate

- Result: pass
- Rationale: the diff is tightly scoped, reuses existing runtime shapes, and has direct type/runtime verification.

## Verification

```bash
npm run typecheck
# pass
```

```bash
node --test tests/release/plugin-cleanup-evidence-archive-manifest.test.js tests/release/plugin-cleanup-evidence-runner.test.js
# pass: 19/19
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
