# Plugin Cleanup Evidence Archive Phase 89 Design

**Goal:** Add an archive manifest for reviewed plugin cleanup evidence runs so maintainers can preserve collector output with hashes without changing runtime cleanup guarantees.

**Architecture:** Keep Phase 86 cleanup reports, Phase 87 report updates, and Phase 88 collectors as the source of truth. Add a standalone Node manifest generator that validates report structure, checks collector wording, verifies required collected evidence files, and hashes the archive contents.

**Tech Stack:** Node scripts, CommonJS, Node native tests, existing plugin cleanup report validator.

---

## Problem

Phase 88 made cleanup evidence collection repeatable, but the collected evidence directory still needs a stable archive boundary. Maintainers need to know whether an archive is complete and whether it actually proves cleanup readiness. Those are separate claims.

## Scope

In scope:

- add `npm run create-plugin-cleanup-evidence-archive-manifest`;
- default to the standard archive shape:
  - `plugin-cleanup-evidence-report.json`;
  - `plugin-cleanup-evidence-collector.sh`;
  - `plugin-cleanup-evidence-collected/`;
  - `plugin-cleanup-evidence-archive-manifest.json`;
- validate the report structurally with pending checks allowed;
- validate readiness separately with pending checks disallowed;
- reject collector helpers that contain `--status pass` or omit conservative readiness wording;
- require the standard Phase 88 collected evidence files;
- recursively hash evidence files and reject evidence symlinks;
- keep `ok` and `cleanupReady` as separate manifest fields.

Out of scope:

- no runtime cleanup behavior changes;
- no automatic packaged-app execution;
- no automatic report status changes;
- no release-level readiness gate changes;
- no universal process-tree cleanup guarantee.

## Decisions

### Decision 1: Archive validity is not cleanup readiness

Problem: a complete evidence archive can still contain pending cleanup checks.

Choice: expose `ok` for archive completeness and `cleanupReady` for strict report readiness.

Reason: operators can archive in-progress evidence without overstating production readiness.

### Decision 2: Validate collector wording

Problem: a stale or hand-edited collector could include pass shortcuts.

Choice: require collector content to avoid `--status pass` and state that it does not prove cleanup readiness.

Reason: the archive should preserve the same evidence-first boundary introduced in Phase 88.

### Decision 3: Hash recursive evidence files

Problem: collected evidence can include nested controlled-fixture files in future runs.

Choice: recursively hash regular evidence files and reject symlinks.

Reason: the manifest should be useful for packaged or real-host evidence archives without granting path-escape ambiguity.

## Acceptance

- `npm run create-plugin-cleanup-evidence-archive-manifest -- --archive-dir <dir>` writes a manifest with hashes.
- pending reports can produce `ok: true` and `cleanupReady: false`.
- all-pass reports with evidence can produce `ok: true` and `cleanupReady: true`.
- missing required evidence files fail archive validity.
- misleading collector pass shortcuts fail archive validity.
- generated docs describe the manifest as archive evidence, not a cleanup guarantee.
