# Phase 95 Review: Packaged Runtime Evidence Contracts

> Date: 2026-06-18
> Branch: `codex/plugin-cleanup-evidence-contracts-phase91`
> Mode: deep
> Scope: shared packaged runtime smoke contracts, representative fixtures, and live documentation updates.

## Scope

- Base: current Phase 94 head with Phase 95 contract additions.
- Scope mode: working tree.
- Changed files reviewed: `src/shared/openpet-contracts.ts`, `tests/shared/openpet-contracts-type-fixture.ts`, Phase 95 docs, and live documentation updates.
- Risk level: low to medium, because this is compile-time contract work on release-evidence JSON boundaries that feed release archive consumers.

## Findings

No blocking production issues remain in the Phase 95 diff.

## Review Notes

- Runtime packaged smoke report generation and packaged runtime capture behavior are unchanged.
- The new contracts match the real `create-packaged-runtime-smoke-report` and packaged runtime evidence payload output shapes already exercised by the runtime smoke tests.
- The shared fixtures cover both pending picker-linked runtime reports and captured renderer/window evidence without requiring new packaged-app runs.

## Review Fixes

- Added `PackagedRuntimeSmokeReport` contracts for the packaged runtime smoke report output.
- Added `PackagedRuntimeSmokeEvidence` contracts for the packaged runtime smoke evidence payload emitted by the packaged runtime runner.
- Added representative fixtures that keep the no-emit typecheck tied to real packaged runtime evidence script outputs.

## Architecture Assessment

This keeps packaged runtime evidence knowledge in the shared contract layer instead of duplicating JSON assumptions in future release/archive consumers. The existing CommonJS scripts still own evidence capture, report generation, and readiness validation.

## Test Assessment

Strongest coverage:

- red-green typecheck proof for missing packaged runtime contract exports;
- targeted packaged runtime report/capture tests;
- shared fixture coverage for report and evidence payload shapes.

Remaining gap:

- real signed packaged runtime evidence and linked native picker evidence still depend on external packaged-app runs and remain outside this phase.

## Quality Gate

- Result: pass
- Rationale: the diff is narrow, runtime behavior is unchanged, and the new contract surface matches existing tested outputs.

## Verification

```bash
npm run typecheck
# pass
```

```bash
node --test tests/release/packaged-runtime-smoke-report.test.js tests/release/packaged-runtime-smoke-capture.test.js
# pass: 17/17
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
