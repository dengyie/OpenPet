# Phase 100: Plugin Community-Source Intake Report

> Date: 2026-06-18
> Scope: add a compatibility-first intake report for candidate community-source plugin archives before they enter the Phase 99 evidence path.

## Goal

Phase 99 can archive community-source evidence once a maintainer already has a compatible OpenPet plugin archive. The remaining ecosystem gap is earlier than that: maintainers still need a structured way to inspect public third-party candidate sources and record whether they are actually compatible with OpenPet's current `plugin.json` package model.

Phase 100 adds that intake report layer.

## Problem

Real public repositories now exist around adjacent desktop-pet ecosystems, but not every public source that mentions OpenPet or OpenPets is a compatible OpenPet extension package. Without an intake gate, maintainers either:

- overstate compatibility by forcing a foreign package model through the Phase 99 flow; or
- leave the gap as an undocumented manual judgment.

Neither is good enough for a production-facing plugin ecosystem.

## Decision Record

### Decision 1: record incompatible candidate sources instead of fabricating a live successful run

- Problem: there is still no confirmed independent third-party repository in the current OpenPet `plugin.json` package model.
- Choice: add an intake report that can conclude `ready-for-community-evidence` or `incompatible-package-model`.
- Reason: this creates auditable maintainer evidence without pretending a neighboring ecosystem repository is already an OpenPet plugin.
- Risk: Phase 100 still does not prove a live successful third-party OpenPet plugin submission; docs must continue to say that plainly.

### Decision 2: keep Phase 99 as the canonical community-source evidence chain

- Problem: source discovery/triage and submission evidence are related but not the same step.
- Choice: keep Phase 99 unchanged and add a separate intake command before it.
- Reason: maintainers can now reject or defer incompatible candidate sources without polluting the approval/bundle evidence chain.
- Risk: maintainers must run two commands for a compatible live source, but the boundaries stay much clearer.

## Planned Behavior

1. Add `create-plugin-community-source-intake-report`:
   - downloads a public HTTPS archive;
   - resolves a candidate plugin path inside the archive;
   - records archive provenance and public source metadata;
   - checks whether the selected path is a current OpenPet `plugin.json` package;
   - validates compatible packages with the existing package validator;
   - writes a README, command list, machine-readable intake report, and summary JSON.

2. Emit explicit status values and reason codes:
   - `ready-for-community-evidence`
   - `incompatible-package-model`
   - reason codes such as `plugin-path-not-found`, `plugin-json-missing`, and `plugin-json-invalid`

3. Keep trust claims conservative:
   - intake compatibility is not maintainer approval;
   - intake compatibility is not signing trust, catalog publication, runtime safety, or release readiness;
   - incompatible neighboring repositories may still be useful ecosystem references, but they are not current OpenPet plugin submissions.

## Acceptance

- Maintainers can archive a public candidate source and get a structured compatibility verdict.
- Compatible archives can be routed into Phase 99 next.
- Incompatible public repositories are recorded as evidence gaps rather than being silently ignored or misrepresented.
