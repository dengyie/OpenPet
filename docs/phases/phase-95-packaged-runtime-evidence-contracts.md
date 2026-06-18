# Phase 95: Packaged Runtime Evidence Contracts

> Date: 2026-06-18
> Scope: add shared TypeScript contracts for packaged runtime smoke reports and packaged runtime smoke evidence payloads.

## Goal

Phase 95 extends the release-evidence TypeScript boundary from Phase 42, Phase 65, and Phase 94 into the packaged runtime smoke tooling.

The runtime scripts already generate stable JSON for packaged runtime smoke reports and packaged runtime smoke evidence payloads. This phase adds shared contracts for those outputs and representative fixtures in the no-emit typecheck suite.

This is a contract-only phase. It does not change packaged runtime smoke rules, picker-link readiness rules, signed-evidence rules, or release support wording.

## Scope

In scope:

- `PackagedRuntimeSmokeReport`;
- `PackagedRuntimeSmokeEvidence`;
- supporting nested packaged runtime evidence/report types;
- representative fixtures for packaged runtime report and evidence outputs;
- live doc updates making Phase 95 the current packaged runtime evidence TypeScript boundary.

Out of scope:

- changing packaged runtime smoke report generation;
- changing packaged runtime smoke capture behavior;
- changing release archive validation behavior;
- collecting new real packaged runtime evidence;
- changing release support wording.

## Implementation

Updated files:

- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`

Behavior:

1. The packaged runtime smoke report now has a shared contract for artifact metadata, linked picker evidence, built-in pack fixtures, and per-check readiness vocabulary.
2. The packaged runtime smoke evidence payload now has a shared contract for launch/window/renderer/pack/final-state evidence emitted by the packaged runtime smoke runner.
3. Representative fixtures keep `npm run typecheck` aligned with real packaged runtime report and evidence script outputs.

## Decision Record

### Continue on a high-drift release-evidence boundary

After desktop picker and Windows smoke evidence contracts, the next doc-driven TypeScript target is the packaged runtime boundary that already feeds release archive logic and signed closure checks. Phase 95 therefore tightens that report/evidence shape instead of attempting blocked external signed-artifact work.

### Keep runtime ownership in the existing CommonJS scripts

The packaged runtime scripts remain the source of truth for evidence generation and readiness validation. This phase only mirrors their current JSON outputs into the shared contract layer for typechecked consumers and fixtures.

## Validation

Red check:

```bash
npm run typecheck
```

Result before implementation:

- failed because `PackagedRuntimeSmokeEvidence` and `PackagedRuntimeSmokeReport` were not exported.

Targeted validation:

```bash
npm run typecheck
node --test tests/release/packaged-runtime-smoke-report.test.js tests/release/packaged-runtime-smoke-capture.test.js
```

Result:

- TypeScript no-emit passed.
- 17/17 targeted packaged runtime evidence tests passed.
