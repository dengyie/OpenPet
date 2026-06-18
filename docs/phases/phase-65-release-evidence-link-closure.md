# Phase 65: Release Evidence Link Closure

> Date: 2026-06-17
> Branch: `codex/release-evidence-phase65`
> Status: implemented locally

## Goal

Tighten the packaged runtime evidence chain so a runtime smoke report cannot claim picker-linked readiness unless it actually points at the paired desktop picker smoke report, and ensure release archive readiness drops when that link is missing or mismatched.

## What Changed

- `scripts/validate-packaged-runtime-smoke-report.js` now requires `linkedEvidence.desktopPickerSmokeReport` whenever packaged runtime readiness is claimed, and also rejects picker-linked pass checks without that link.
- `scripts/create-release-evidence-archive-manifest.js` now:
  - preserves packaged runtime `linkedEvidence` in the archived report snapshot,
  - cross-checks the runtime report's linked desktop picker path against the archive's desktop picker report,
  - and keeps `releaseReady` false whenever archive-level cross-report validation fails.
- `src/shared/openpet-contracts.ts` and the shared type fixture now model release evidence snapshots with linked evidence metadata.
- Targeted release tests now cover:
  - ready runtime reports missing a picker link,
  - archive manifests where runtime evidence points at the wrong picker report,
  - and the existing valid runtime/picker happy path.

## Boundaries Preserved

- This phase does not manufacture new picker evidence; it only hardens the proof chain between existing runtime and picker reports.
- Native picker success still requires real packaged-app evidence.
- Signed release readiness still requires real signed macOS and Windows evidence.
- Windows remains not release-ready.

## Tests

```bash
node --test tests/release/packaged-runtime-smoke-report.test.js
node --test tests/release/packaged-runtime-smoke-capture.test.js
node --test tests/release/release-evidence-archive-manifest.test.js
npm run typecheck
```

Full verification before commit:

```bash
npm test
npm run test:control-center
npm run typecheck
npm run check:syntax
git diff --check
```

## Acceptance

- A packaged runtime report cannot become ready without a linked desktop picker smoke report path.
- A runtime report cannot pass archive validation if it links a different picker report than the one archived for the same evidence set.
- Archive `releaseReady` becomes false whenever the cross-report evidence chain is broken.
- Shared release evidence contracts stay aligned with the new archived snapshot shape.
