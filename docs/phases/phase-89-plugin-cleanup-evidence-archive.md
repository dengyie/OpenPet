# Phase 89: Plugin Cleanup Evidence Archive

> Date: 2026-06-18
> Scope: add an archive manifest for plugin cleanup evidence collector runs.

## Goal

Phase 89 gives maintainers a stable archive boundary for Phase 88 cleanup evidence collector output.

Phase 86 created cleanup reports. Phase 87 made those reports safe to update. Phase 88 generated collection helpers. This phase creates a manifest for preserving report, collector, and collected evidence files with hashes while keeping archive validity separate from cleanup readiness.

## Scope

In scope:

- `npm run create-plugin-cleanup-evidence-archive-manifest`;
- standard archive defaults for:
  - `plugin-cleanup-evidence-report.json`;
  - `plugin-cleanup-evidence-collector.sh`;
  - `plugin-cleanup-evidence-collected/`;
  - `plugin-cleanup-evidence-archive-manifest.json`;
- cleanup report structural validation with pending checks allowed;
- cleanup report readiness validation with pending checks disallowed;
- collector conservative-wording validation;
- rejection of collector `--status pass` shortcuts;
- standard collected evidence file requirements;
- recursive evidence file hashes;
- evidence symlink rejection;
- separate `ok` and `cleanupReady` manifest fields.

Out of scope:

- no runtime cleanup behavior changes;
- no automatic packaged-app execution;
- no automatic report status changes;
- no release-level readiness gate change;
- no universal process-tree cleanup guarantee.

## Implementation

Updated files:

- `scripts/create-plugin-cleanup-evidence-archive-manifest.js`
- `tests/release/plugin-cleanup-evidence-archive-manifest.test.js`
- `package.json`

Behavior:

1. The script parses archive/report/collector/evidence/output paths plus `--json`.
2. It validates the cleanup report structurally and records strict readiness separately.
3. It validates the collector does not include `--status pass` and states that it does not prove readiness.
4. It requires standard collected evidence files from the Phase 88 helper.
5. It recursively hashes evidence files and rejects evidence symlinks.
6. It writes a manifest where `ok` means archive completeness and `cleanupReady` means strict cleanup report readiness.

## Decision Record

### Decision 1: separate archive and readiness status

- Problem: pending cleanup evidence should be archivable without implying readiness.
- Choice: use `ok` for archive validity and `cleanupReady` for strict cleanup report readiness.
- Reason: release documentation can preserve evidence without changing support claims.

### Decision 2: validate collector safety language

- Problem: stale generated helpers or manual edits could include pass shortcuts.
- Choice: reject collectors containing `--status pass` or missing readiness-boundary wording.
- Reason: archive manifests should preserve the Phase 88 evidence-first boundary.

### Decision 3: hash recursive evidence files

- Problem: future packaged cleanup evidence runs may include nested transcripts or fixture outputs.
- Choice: recursively hash regular evidence files and reject symlinks.
- Reason: the manifest can track nested evidence without path-escape ambiguity.

## Validation

Targeted validation:

```bash
node --test tests/release/plugin-cleanup-evidence-archive-manifest.test.js
```

Result:

- 11/11 pass for Phase 89 archive manifest tests.

Full verification is recorded in the Phase 89 review document.

## Outcome

OpenPet now has a reviewed archive manifest path for plugin cleanup evidence runs. The archive manifest can prove that evidence was preserved consistently, but it does not change runtime cleanup semantics and does not claim cleanup readiness unless the underlying structured report passes strict readiness validation.
