# Windows Smoke Archive Gate Phase 81 Design

**Goal:** Extend release-level evidence validation so reviewed Windows smoke archives must be present and matched before signed Windows or official desktop release claims can pass.

**Architecture:** Reuse the existing Windows smoke archive tooling rather than inventing a new evidence format. The release-level archive manifest and signed closure report should treat the Windows smoke archive manifest the same way they already treat the desktop picker archive manifest: validate the reviewed archive file, verify it matches the archived Windows smoke report, and require its signed-ready state before Windows release claims turn green.

**Tech Stack:** Node CommonJS release tooling, shared TypeScript contracts, Node native tests, live release documentation.

---

## Problem

OpenPet already has a strong Windows evidence toolchain:

- pending smoke report generation;
- runbook generation;
- PowerShell evidence collector;
- evidence bundle validation;
- reviewed evidence summary generation;
- reviewed Windows archive manifest generation.

But the final release-level gate still consumes only `windows-smoke-report.json`, not the reviewed `windows-smoke-archive-manifest.json`. That leaves one weak link in the evidence chain:

- a maintainer can create and validate a reviewed Windows smoke archive locally;
- yet the release-level archive and signed closure report do not require that reviewed archive manifest to be present or matched.

Desktop picker evidence already closes this loop by requiring `desktop-picker-archive-manifest.json` in the release archive. Windows smoke should reach the same standard so signed release wording depends on reviewed archive evidence, not only on a standalone report JSON.

## Scope

In scope:

- add `windows-smoke-archive-manifest.json` as a first-class input to `create-release-evidence-archive-manifest`;
- validate that archive manifest structurally exists, parses, and matches the archived Windows smoke report path/hash;
- require the Windows smoke archive manifest to be signed-ready when `--require-signed` is used;
- propagate the new gate into `create-signed-release-closure-report`;
- extend shared release-evidence contracts and fixtures;
- update release docs and phase/status docs to describe the new gate truthfully;
- cover the new behavior with targeted tests.

Out of scope:

- producing real signed Windows evidence;
- changing the Windows smoke archive format itself;
- changing macOS evidence behavior;
- changing packaged runtime or desktop picker evidence formats;
- broadening into GitHub artifact download automation.

## Current State

Today:

- `scripts/create-windows-smoke-archive-manifest.js` can validate a reviewed Windows smoke archive;
- `scripts/create-release-evidence-archive-manifest.js` validates:
  - Windows smoke report,
  - desktop picker report,
  - desktop picker archive manifest,
  - packaged runtime report,
  - macOS codesign/notarization/Gatekeeper evidence;
- `scripts/create-signed-release-closure-report.js` derives final release wording from that release archive manifest.

The missing piece is that Windows smoke archive evidence is not yet represented at the release-archive or closure-report level.

## Design Overview

Phase 81 adds a second reviewed archive gate beside the existing desktop picker archive gate.

### New release-level input

`create-release-evidence-archive-manifest` should accept:

- `--windows-smoke-archive-manifest <manifest.json>`

Default path inside the release archive:

- `windows-smoke-archive-manifest.json`

### Validation behavior

The release-level manifest should:

1. require the Windows smoke archive manifest file to exist;
2. parse it as JSON;
3. verify it records the same archived Windows smoke report file path and SHA-256 hash as the release archive report file;
4. expose whether the Windows archive manifest itself is valid;
5. expose whether that archive manifest is release-ready;
6. fail the release-level manifest when the Windows archive manifest is missing, stale, mismatched, or invalid.

### Signed readiness behavior

When `--require-signed` is used:

- the Windows smoke report must be signed-ready;
- the Windows smoke archive manifest must also be signed-ready.

This mirrors the existing desktop picker archive gate and ensures that official Windows release claims rest on reviewed archived evidence, not only on a report JSON.

## Contract Shape

The shared release-evidence manifest contract should gain:

- `archives.windowsSmoke`

It should use the same `ReleaseEvidenceLinkedArchiveSection` shape already used by `archives.desktopPicker`, including:

- archive file metadata;
- archive path metadata;
- report path/hash linkage;
- `ok`;
- `releaseReady`;
- `matchesWindowsSmokeReport`;
- `errors`;
- `warnings`.

To avoid widening types unnecessarily in this phase, the contract can keep the existing linked-archive section shape and rename the match field only if that change stays low-risk. The safer Phase 81 choice is to generalize the field to a neutral report-match name if doing so does not create noisy downstream churn; otherwise keep the existing type and add a Windows-specific sibling field only where needed.

## Decision

### Decision 1: mirror desktop picker archive gating instead of inventing a new Windows-only closure rule

- Problem: Windows smoke reviewed archives already exist, but release-level gating ignores them.
- Choice: apply the same archive-manifest pattern already used for desktop picker evidence.
- Reason: one consistent release-evidence model is easier to audit and less likely to drift.

### Decision 2: keep Phase 81 narrowly on release evidence linkage

- Problem: the Windows release story still has bigger open work such as real signed evidence capture and clean-machine validation.
- Choice: limit Phase 81 to archive linkage and signed-closure gating.
- Reason: this closes a real evidence-integrity gap without pretending local code changes can manufacture real Windows validation.

## Files Expected To Change

Code:

- `scripts/create-release-evidence-archive-manifest.js`
- `scripts/create-signed-release-closure-report.js`
- `src/shared/openpet-contracts.ts`

Tests:

- `tests/release/release-evidence-archive-manifest.test.js`
- `tests/release/signed-release-closure-report.test.js`
- `tests/shared/openpet-contracts-type-fixture.ts`

Docs:

- `docs/desktop-release-design.md`
- `docs/release-checklist.md`
- `docs/productization-v1.1-todo-design.md`
- `docs/development-summary.md`
- `docs/project-status-review.md`
- `docs/HANDOFF.md`
- `docs/project-context.json`
- `docs/phases/phase-81-windows-smoke-archive-gate.md`
- `docs/reviews/phase-81-windows-smoke-archive-gate-review.md`

## Acceptance Criteria

Phase 81 is complete when:

- release archive manifest CLI accepts and defaults a Windows smoke archive manifest path;
- release archive validation fails if `windows-smoke-archive-manifest.json` is missing, invalid, stale, or references a different Windows smoke report;
- signed release closure report blocks Windows readiness when the Windows smoke archive manifest is not release-ready;
- shared contracts and fixtures cover the new archive section;
- tests cover unsigned archives, missing archive manifest, mismatched report linkage, and signed-ready success;
- docs describe that reviewed Windows smoke archive evidence is now part of the release-level gate.

## Risks

### Risk: contract churn breaks release fixtures unnecessarily

Mitigation:

- prefer additive contract changes;
- keep fixture updates minimal and targeted;
- verify `npm run typecheck`.

### Risk: release docs overstate what this phase proves

Mitigation:

- keep wording explicit that Phase 81 improves archive integrity only;
- do not change Windows public support status;
- continue to say real signed Windows smoke evidence remains required.

## Expected Result

After Phase 81, OpenPet’s Windows release evidence chain becomes stricter and more reviewable:

- the Windows smoke report is no longer enough on its own at release-archive time;
- the reviewed Windows smoke archive manifest becomes part of the signed closure gate;
- official Windows or official desktop release wording remains blocked until both report-level and archive-level Windows evidence are truly ready.
