# Phase 94: Desktop Picker Evidence Contracts

> Date: 2026-06-18
> Scope: add shared TypeScript contracts for desktop picker evidence summaries and desktop picker archive manifests.

## Goal

Phase 94 extends the release-evidence TypeScript boundary from Phase 66, Phase 67, and Phase 93 into the desktop picker evidence tooling.

The runtime scripts already generate stable JSON for desktop picker evidence summaries and archive manifests. This phase adds shared contracts for those outputs and representative fixtures in the no-emit typecheck suite.

This is a contract-only phase. It does not change desktop picker smoke rules, signed-evidence rules, archive validation, or release support wording.

## Scope

In scope:

- `DesktopPickerEvidenceSummary`;
- `DesktopPickerArchiveManifest`;
- representative fixtures for the desktop picker summary and archive outputs;
- live doc updates making Phase 94 the current desktop picker evidence TypeScript boundary.

Out of scope:

- changing desktop picker smoke report generation;
- changing archive validation behavior;
- collecting real signed picker evidence;
- changing release support wording.

## Implementation

Updated files:

- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`

Behavior:

1. The desktop picker evidence summary now has a shared contract for evidence file hashes, paired report validation, artifact metadata, and readiness warnings.
2. The desktop picker archive manifest now has a shared contract for archive files, summary metadata, recomputed evidence hashes, and report validation sections.
3. Representative fixtures keep `npm run typecheck` aligned with real desktop picker evidence script outputs.

## Decision Record

### Continue on the evidence/report boundary

The next doc-driven TypeScript target after Phase 93 is another stable release-evidence boundary that already has dedicated scripts and tests. Phase 94 therefore extends contracts into desktop picker evidence instead of attempting blocked real signed capture work.

### Reuse existing evidence vocabulary

The new contracts reuse `ReleaseEvidenceArchiveFile` and the same validation-summary vocabulary already used by Windows smoke evidence, while keeping desktop picker-specific artifact and fixture details explicit.

## Validation

Red check:

```bash
npm run typecheck
```

Result before implementation:

- failed because `DesktopPickerEvidenceSummary` and `DesktopPickerArchiveManifest` were not exported.

Targeted validation:

```bash
npm run typecheck
node --test tests/release/create-desktop-picker-evidence-summary.test.js tests/release/create-desktop-picker-archive-manifest.test.js
```

Result:

- TypeScript no-emit passed.
- 18/18 targeted desktop picker evidence tests passed.

