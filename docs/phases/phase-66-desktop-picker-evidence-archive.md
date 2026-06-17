# Phase 66: Desktop Picker Evidence Archive

> Date: 2026-06-17
> Branch: `codex/desktop-picker-archive-phase66`
> Status: implemented locally

## Goal

Give packaged desktop native picker evidence the same auditable archive shape as the Windows smoke evidence path: a reviewed evidence directory, a summary with hashes, and a manifest that can fail closed when archive files or summary content drift.

## What Changed

- Added `scripts/create-desktop-picker-evidence-summary.js` for Markdown or JSON summaries of `desktop-picker-evidence/` plus a paired `desktop-picker-smoke-report.json`.
- Added `scripts/create-desktop-picker-archive-manifest.js` for reviewed archive manifests containing:
  - `desktop-picker-smoke-report.json`,
  - `desktop-picker-smoke-runbook.md`,
  - `desktop-picker-evidence/`,
  - and `desktop-picker-evidence-summary.md` or `.json`.
- Added npm commands:
  - `npm run create-desktop-picker-evidence-summary`
  - `npm run create-desktop-picker-archive-manifest`
- Archive validation now recomputes evidence hashes and rejects stale Markdown or JSON summaries when evidence files change.
- Targeted release tests cover pending archives, signed all-pass archives, missing files, missing evidence directories, stale summaries, JSON summaries, CLI argument parsing, and writer behavior.

## Boundaries Preserved

- This phase does not create real native picker evidence.
- Pending or unsigned desktop picker evidence still cannot prove official release readiness.
- `releaseReady` remains false unless the paired picker report passes readiness validation and the archive itself is valid.
- Windows remains not release-ready.

## Commands

```bash
npm run create-desktop-picker-evidence-summary -- desktop-picker-evidence --report desktop-picker-smoke-report.json --output desktop-picker-evidence-summary.md
npm run create-desktop-picker-archive-manifest -- --archive-dir desktop-picker-archive
```

For official signed release evidence, add `--require-signed` to both commands after the packaged app picker report has real signed evidence.

## Tests

Targeted verification during implementation:

```bash
node --test tests/release/create-desktop-picker-evidence-summary.test.js tests/release/create-desktop-picker-archive-manifest.test.js
node --check scripts/create-desktop-picker-evidence-summary.js
node --check scripts/create-desktop-picker-archive-manifest.js
```

Full verification before commit:

```bash
npm test
npm run test:control-center
npm run typecheck
npm run check:syntax
git diff --check
```

## Acceptance

- A reviewed desktop picker archive can be summarized with file hashes.
- The archive manifest fails when report, runbook, summary, or evidence directory material is missing.
- The manifest fails when a summary no longer matches recomputed evidence hashes.
- The manifest separates archive validity from release readiness and keeps unsupported readiness claims false.
