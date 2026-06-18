# Phase 90: Plugin Cleanup Evidence Runner

> Date: 2026-06-18
> Scope: add an executable cleanup evidence collector runner.

## Goal

Phase 90 closes the local execution gap left after Phase 89.

Phase 86 created cleanup reports. Phase 87 made those reports safe to update. Phase 88 generated a conservative collector. Phase 89 archived collector output with hashes. This phase adds a runner that creates a pending report, generates the collector, executes it, captures transcripts, and writes the archive manifest.

The runner preserves the same boundary as the earlier phases: it gathers and archives evidence, but it does not mark cleanup checks as passed and does not claim universal cleanup readiness. The runner creates and archives a pending cleanup evidence session; it does not mark cleanup checks as pass and does not prove cleanup readiness.

## Scope

In scope:

- `npm run run-plugin-cleanup-evidence-collector`;
- default evidence sessions under `docs/release-evidence/plugin-cleanup-evidence/<timestamp-platform-arch>/`;
- generated `plugin-cleanup-evidence-report.json`;
- generated `plugin-cleanup-evidence-collector.sh`;
- executed `plugin-cleanup-evidence-collected/` output;
- collector stdout/stderr/run metadata transcripts;
- bounded collector execution timeout;
- generated `plugin-cleanup-evidence-archive-manifest.json`;
- overwrite protection for existing evidence sessions;
- tests for success, failure, timeout, and overwrite protection.

Out of scope:

- no runtime cleanup behavior changes;
- no automatic pass status updates;
- no packaged app UI automation;
- no release-level readiness gate change;
- no universal process-tree cleanup guarantee.

## Implementation

Updated files:

- `scripts/run-plugin-cleanup-evidence-collector.js`
- `tests/release/plugin-cleanup-evidence-runner.test.js`
- `package.json`
- `docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64/`

Behavior:

1. The runner creates the pending cleanup report and generated collector in the standard archive shape.
2. The runner executes the collector with explicit `REPORT_PATH` and `EVIDENCE_DIR`.
3. It stores `collector-run.json`, `collector-stdout.txt`, and `collector-stderr.txt` inside the evidence directory.
4. It creates the Phase 89 archive manifest after execution, so the run transcript and controlled fixture output are hashed.
5. It returns success only when collector execution succeeds and the archive manifest is valid.
6. It still leaves `cleanupReady: false` until a maintainer reviews evidence and updates every required check to pass.

## Decision Record

### Decision 1: run the existing collector instead of duplicating collection logic

- Problem: a second collector implementation would drift from Phase 88.
- Choice: generate and execute the Phase 88 collector.
- Reason: the collector remains the single helper that owns evidence file layout and safety wording.

### Decision 2: transcript files live inside the evidence directory

- Problem: collector stdout/stderr and execution metadata should be covered by archive hashes.
- Choice: write runner transcripts under `plugin-cleanup-evidence-collected/`.
- Reason: Phase 89 archive manifests already recursively hash evidence files.

### Decision 3: keep readiness manual

- Problem: a runner could be mistaken for a cleanup-readiness proof.
- Choice: never call the updater with `--status pass`; only create pending reports and archives.
- Reason: packaged cleanup readiness still requires human review of logs, screenshots, process listings, or transcripts.

### Decision 4: bound collector execution

- Problem: an operator helper should not hang forever if the collector or child process stalls.
- Choice: pass a default 5-minute timeout to `spawnSync` and preserve partial stdout/stderr/error metadata.
- Reason: maintainers get a diagnosable failed archive instead of an unbounded local command.

## Validation

Targeted validation:

```bash
node --test tests/release/plugin-cleanup-evidence-runner.test.js
```

Result:

- 8/8 pass for Phase 90 runner tests.

Related cleanup evidence validation:

```bash
node --test tests/release/plugin-cleanup-evidence-runner.test.js tests/release/plugin-cleanup-evidence-archive-manifest.test.js tests/release/plugin-cleanup-evidence-collector.test.js tests/release/plugin-cleanup-evidence-report.test.js tests/release/plugin-cleanup-evidence-report-update.test.js tests/scripts/create-plugin-cleanup-evidence.test.js
```

Result:

- 50/50 pass across cleanup evidence report, updater, collector, archive, runner, and controlled fixture suites.

Real local execution rehearsal:

```bash
npm run run-plugin-cleanup-evidence-collector -- --archive-dir docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64 --host-app "OpenPet packaged cleanup evidence rehearsal" --notes "Phase 90 local execution rehearsal"
```

Result:

- archive valid: yes;
- plugin cleanup ready: no;
- manifest: `docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64/plugin-cleanup-evidence-archive-manifest.json`.

Full verification is recorded in the Phase 90 review document.

## Outcome

OpenPet now has an executable cleanup evidence chain for maintainers. It can generate a structured report, generate and run the collector, capture transcripts, and archive the result with hashes. The project still keeps cleanup readiness report-driven and evidence-reviewed rather than script-asserted.
