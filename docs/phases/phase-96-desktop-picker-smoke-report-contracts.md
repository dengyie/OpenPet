# Phase 96: Desktop Picker Smoke Report Contracts

> Date: 2026-06-18
> Scope: add shared TypeScript contracts for desktop picker smoke reports.

## Goal

Phase 96 extends the release-evidence TypeScript boundary from Phase 94 and Phase 95 into the desktop picker smoke report tooling itself.

The runtime script already generates a stable JSON report for packaged native picker smoke scaffolding. This phase adds a shared contract for that output and a representative fixture in the no-emit typecheck suite.

This is a contract-only phase. It does not change desktop picker smoke readiness rules, report generation behavior, signed-evidence rules, or release support wording.

## Scope

In scope:

- `DesktopPickerSmokeReport`;
- supporting nested desktop picker smoke report types;
- a representative fixture for the desktop picker smoke report output;
- live doc updates making Phase 96 the current desktop picker smoke report TypeScript boundary.

Out of scope:

- changing desktop picker smoke report generation;
- changing desktop picker smoke validation behavior;
- collecting real native picker evidence;
- changing release support wording.

## Implementation

Updated files:

- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`

Behavior:

1. The desktop picker smoke report now has a shared contract for artifact discovery metadata, signature metadata, fixture prompts, and per-check readiness vocabulary.
2. Representative fixtures keep `npm run typecheck` aligned with the real `create-desktop-picker-smoke-report.js` output shape.

## Decision Record

### Continue along stable report boundaries

After Phase 95, the next doc-safe TypeScript target is another stable report boundary already generated and tested locally. Phase 96 therefore tightens the desktop picker smoke report boundary instead of inventing a new runtime feature or waiting on blocked external signed-artifact work.

### Keep summary/archive contracts separate from the source report

Phase 94 already covered desktop picker evidence summaries and archive manifests. This phase keeps the source smoke report explicit as its own contract so future consumers do not have to infer the runtime report shape indirectly from summary/archive layers.

## Validation

Red check:

```bash
npm run typecheck
```

Result before implementation:

- failed because `DesktopPickerSmokeReport` was not exported.

Targeted validation:

```bash
npm run typecheck
node --test tests/release/desktop-picker-smoke-report.test.js tests/release/create-desktop-picker-evidence-summary.test.js tests/release/create-desktop-picker-archive-manifest.test.js
```

Result:

- TypeScript no-emit passed.
- 26/26 targeted desktop picker report/summary/archive tests passed.
