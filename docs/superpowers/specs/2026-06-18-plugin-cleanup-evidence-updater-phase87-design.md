# Plugin Cleanup Evidence Updater Phase 87 Design

**Goal:** Add a safe incremental updater for structured plugin cleanup evidence reports so maintainers can fill reviewed evidence without hand-editing JSON.

**Architecture:** Keep the Phase 86 report schema and validator as the source of truth. Add one standalone Node updater that loads an existing report, applies allowlisted metadata and check updates, validates structurally by default, and only writes after validation succeeds.

**Tech Stack:** Node scripts, CommonJS, Node native tests, existing plugin cleanup evidence report validator, release evidence docs.

---

## Problem

Phase 86 added report creation and validation, but maintainers still had to edit JSON manually to fill real-host cleanup evidence. Manual editing increases the chance of malformed keys, accidental readiness claims, and stale pending checks.

Phase 87 closes that workflow gap without changing runtime cleanup behavior, report shape, plugin permissions, or cleanup guarantees.

## Scope

In scope:

- add `npm run update-plugin-cleanup-evidence-report`;
- update allowlisted `environment` keys: `platform`, `arch`, `node`, `machine`, `runner`, `evidence`;
- update allowlisted `scenario` keys: `pluginId`, `hostApp`, `notes`;
- update one required cleanup check per command with `status`, inline `evidence`, evidence from a UTF-8 file, and `notes`;
- list required cleanup check ids;
- validate incrementally with pending checks allowed by default;
- require all checks to pass only when `--validate-ready` is supplied;
- avoid writing invalid ready updates.

Out of scope:

- no report schema changes;
- no runtime cleanup behavior changes;
- no new plugin, renderer, bridge, or filesystem permissions;
- no automatic packaged-app collector;
- no universal process-tree cleanup guarantee.

## Decisions

### Decision 1: updater, not schema migration

Problem: maintainers need a safer editing path, but the Phase 86 schema is already adequate.

Choice: add a CLI updater that preserves the existing report shape.

Reason: this keeps downstream validation and shared contracts stable.

### Decision 2: allowlisted fields only

Problem: a generic JSON patcher would let operators accidentally create unsupported report claims.

Choice: allow only known environment/scenario keys and required cleanup check ids.

Reason: evidence records stay reviewable and validator-aligned.

### Decision 3: validate before write

Problem: `--validate-ready` should not corrupt the source report when the attempted update is incomplete.

Choice: update in memory, run validation, and write only if validation passes.

Reason: failed readiness attempts leave the previous report intact.

## Acceptance

- `npm run update-plugin-cleanup-evidence-report -- <report.json> --list-checks` lists every required cleanup evidence check.
- `--set-env`, `--set-scenario`, `--check`, `--status`, `--evidence`, `--evidence-file`, and `--notes` can update a report incrementally.
- unknown metadata keys and check ids are rejected.
- invalid statuses and check updates without `--check` are rejected.
- default validation allows pending reports.
- `--validate-ready` requires every cleanup check to pass with evidence.
- failed ready validation does not write an invalid update.
- docs describe the updater as evidence maintenance tooling, not stronger cleanup semantics.
