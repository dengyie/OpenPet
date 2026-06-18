# Phase 97: Windows Smoke Report Contracts

> Date: 2026-06-18
> Scope: add shared TypeScript contracts for Windows smoke reports.

## Goal

Phase 97 extends the release-evidence TypeScript boundary from Phase 93 and Phase 96 into the Windows smoke report tooling itself.

The runtime script already generates a stable JSON report for Windows release smoke scaffolding. This phase adds a shared contract for that output and a representative fixture in the no-emit typecheck suite.

This is a contract-only phase. It does not change Windows smoke readiness rules, report generation behavior, signed-evidence rules, or release support wording.

## Scope

In scope:

- `WindowsSmokeReport`;
- supporting nested Windows smoke report types;
- a representative fixture for the Windows smoke report output;
- live doc updates making Phase 97 the current Windows smoke report TypeScript boundary.

Out of scope:

- changing Windows smoke report generation;
- changing Windows smoke validation behavior;
- collecting real signed Windows evidence;
- changing release support wording.

## Implementation

Updated files:

- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`

Behavior:

1. The Windows smoke report now has a shared contract for environment metadata, release artifact metadata, Authenticode metadata, blockmap listings, and per-check readiness vocabulary.
2. Representative fixtures keep `npm run typecheck` aligned with the real `create-windows-smoke-report.js` output shape.

## Decision Record

### Continue along source smoke report boundaries

After Phase 96 covered the desktop picker smoke report source JSON, the matching Windows smoke source report was the next stable release-evidence boundary without external blockers. Phase 97 therefore tightens the Windows smoke source report contract instead of attempting real Windows signing or smoke execution from this macOS host.

### Keep readiness rules unchanged

Windows remains not release-ready until real signed Windows smoke evidence is collected and archived. This phase only adds compile-time protection for the generated report shape.

## Validation

Red check:

```bash
npm run typecheck
```

Result before implementation:

- failed because `WindowsSmokeReport` was not exported.

Targeted validation:

```bash
npm run typecheck
node --test tests/release/create-windows-smoke-report.test.js tests/release/create-windows-smoke-evidence-summary.test.js tests/release/create-windows-smoke-archive-manifest.test.js
```

Result:

- TypeScript no-emit passed.
- 22/22 targeted Windows smoke report/summary/archive tests passed.
