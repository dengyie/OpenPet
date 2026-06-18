# Phase 92: macOS Release Evidence Contracts

> Date: 2026-06-18
> Scope: add shared TypeScript contracts for macOS release evidence summaries and macOS release evidence artifact archive manifests.

## Goal

Phase 92 extends the release-evidence TypeScript boundary from Phase 54 and Phase 91 into the macOS evidence tooling added in Phases 77 and 79.

The runtime scripts already generate stable JSON summaries for macOS evidence capture and macOS evidence artifact archiving. This phase adds shared contracts for those JSON outputs and representative fixtures in the no-emit typecheck suite.

This is a contract-only phase. It does not change codesign, notarization, Gatekeeper, archive copy, release-readiness, or platform-support behavior.

## Scope

In scope:

- `MacosReleaseEvidenceCommand`;
- `MacosReleaseEvidenceSummary`;
- `MacosReleaseEvidenceArtifactArchiveManifest` and nested archived-file contract;
- representative fixtures for Phase 77 and Phase 79 outputs;
- live doc updates making Phase 92 the current macOS evidence TypeScript boundary.

Out of scope:

- changing macOS evidence capture runtime behavior;
- changing archive copy/runtime validation behavior;
- collecting real signed evidence;
- changing release support wording.

## Implementation

Updated files:

- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`
- `docs/superpowers/plans/2026-06-18-macos-release-evidence-contracts-phase92.md`

Behavior:

1. The Phase 77 machine-readable summary now has a shared contract for statuses, evidence files, file paths, and executed commands.
2. The Phase 79 machine-readable archive manifest now has a shared contract for archived files, source provenance, archive output paths, and warnings.
3. Representative fixtures keep `npm run typecheck` aligned with real script outputs.

## Decision Record

### Stay on the evidence/report boundary

The next best doc-driven step after Phase 91 is another high-drift report boundary that does not depend on external signed artifacts. Phase 92 therefore tightens the macOS evidence JSON boundary instead of attempting blocked real-world signing work.

### Reuse existing release evidence primitives

The new contracts reuse `MacosReleaseEvidenceStatus` and `ReleaseEvidenceArchiveFile` semantics where possible, so release tooling keeps one consistent vocabulary for readiness-state and hashed file descriptions.

## Validation

Red check:

```bash
npm run typecheck
```

Result before implementation:

- failed because `MacosReleaseEvidenceSummary`, `MacosReleaseEvidenceCommand`, and `MacosReleaseEvidenceArtifactArchiveManifest` were not exported.

Targeted validation:

```bash
npm run typecheck
node --test tests/release/create-macos-release-evidence.test.js tests/release/create-macos-release-evidence-archive.test.js
```

Result:

- TypeScript no-emit passed.
- 14/14 targeted macOS evidence tests passed.

Full verification is recorded in the Phase 92 review note.

