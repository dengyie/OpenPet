# Phase 93: Windows Smoke Evidence Contracts

> Date: 2026-06-18
> Scope: add shared TypeScript contracts for Windows smoke evidence summaries and Windows smoke archive manifests.

## Goal

Phase 93 extends the release-evidence TypeScript boundary from Phase 81 and Phase 92 into the Windows smoke evidence tooling.

The runtime scripts already generate stable JSON for Windows smoke evidence summaries and archive manifests. This phase adds shared contracts for those outputs and representative fixtures in the no-emit typecheck suite.

This is a contract-only phase. It does not change Windows signing rules, smoke readiness rules, archive validation, or release support wording.

## Scope

In scope:

- `WindowsSmokeEvidenceSummary`;
- `WindowsSmokeArchiveManifest`;
- representative fixtures for the Windows smoke summary and archive outputs;
- live doc updates making Phase 93 the current Windows smoke evidence TypeScript boundary.

Out of scope:

- changing Windows smoke report generation;
- changing archive validation behavior;
- collecting real signed Windows evidence;
- changing release support wording.

## Implementation

Updated files:

- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`
- `docs/superpowers/plans/2026-06-18-windows-smoke-evidence-contracts-phase93.md`

Behavior:

1. The Windows smoke evidence summary now has a shared contract for evidence file hashes, paired report validation, and readiness warnings.
2. The Windows smoke archive manifest now has a shared contract for archive files, evidence bundle hashes, summary metadata, and report validation sections.
3. Representative fixtures keep `npm run typecheck` aligned with real script outputs.

## Decision Record

### Stay on the evidence/report boundary

The next best doc-driven step after Phase 92 is another high-drift report boundary that does not depend on external signed artifacts. Phase 93 therefore tightens the Windows smoke evidence JSON boundary instead of attempting blocked real-world signing work.

### Reuse release-evidence primitives

The new contracts reuse the existing release evidence archive file vocabulary and the Windows smoke validation semantics already enforced by the runtime scripts.

## Validation

Red check:

```bash
npm run typecheck
```

Result before implementation:

- failed because `WindowsSmokeEvidenceSummary` and `WindowsSmokeArchiveManifest` were not exported.

Targeted validation:

```bash
npm run typecheck
node --test tests/release/create-windows-smoke-evidence-summary.test.js tests/release/create-windows-smoke-archive-manifest.test.js
```

Result:

- TypeScript no-emit passed.
- 17/17 targeted Windows smoke evidence tests passed.
