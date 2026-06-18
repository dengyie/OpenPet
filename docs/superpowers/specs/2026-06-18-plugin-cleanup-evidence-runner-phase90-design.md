# Plugin Cleanup Evidence Runner Phase 90 Design

**Goal:** Add an executable cleanup evidence runner that turns the Phase 86-89 report/collector/archive chain into a repeatable local evidence session.

**Architecture:** Compose existing cleanup evidence modules. The report generator owns report shape, the Phase 88 collector owns evidence file layout, and the Phase 89 archive manifest owns hash validation. The runner orchestrates those pieces and stores its own execution transcripts inside the evidence directory.

**Tech Stack:** Node CommonJS scripts, Node native tests, existing cleanup evidence report validator.

---

## Problem

OpenPet can create cleanup reports, safely update them, generate a collector helper, and archive collected evidence. Maintainers still need a single command that runs that chain locally and preserves the execution transcript without changing cleanup readiness semantics.

## Scope

In scope:

- add `npm run run-plugin-cleanup-evidence-collector`;
- generate pending cleanup reports;
- generate the existing collector;
- execute the collector with explicit `REPORT_PATH` and `EVIDENCE_DIR`;
- write collector stdout, stderr, and run metadata into the evidence directory;
- create the archive manifest after collector execution;
- refuse to overwrite an existing evidence session.

Out of scope:

- no automatic report pass updates;
- no packaged app UI automation;
- no runtime cleanup behavior changes;
- no release-level readiness gate change;
- no universal process-tree cleanup guarantee.

## Decisions

### Decision 1: Compose, do not fork the collector

Problem: duplicating collector logic would create two evidence layouts.

Choice: generate and run `plugin-cleanup-evidence-collector.sh`.

Reason: Phase 88 remains the owner of manual checklist and collected evidence layout.

### Decision 2: Archive execution transcripts as evidence files

Problem: runner stdout/stderr and exit metadata are part of the evidence chain.

Choice: write `collector-run.json`, `collector-stdout.txt`, and `collector-stderr.txt` under `plugin-cleanup-evidence-collected/`.

Reason: Phase 89 manifests already hash nested evidence files.

### Decision 3: Keep readiness report-driven

Problem: a successful collector run can be mistaken for cleanup readiness.

Choice: runner success means collector plus archive validity, not strict cleanup readiness.

Reason: strict cleanup readiness still requires every check to pass with reviewed evidence.

## Acceptance

- runner tests cover CLI parsing, default archive sessions, collector execution env, transcript persistence, failure preservation, and overwrite protection;
- a local archive under `docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64/` has `ok: true` and `cleanupReady: false`;
- docs state that Phase 90 gathers evidence and does not expand runtime cleanup guarantees.
