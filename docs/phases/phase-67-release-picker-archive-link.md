# Phase 67: Release Picker Archive Link

> Date: 2026-06-17
> Branch: `codex/release-picker-archive-link-phase67`
> Status: implemented locally

## Goal

Close the release evidence chain by making the release-level archive manifest and signed closure report explicitly require the reviewed desktop picker archive manifest, not just the raw picker report.

## What Changed

- `scripts/create-release-evidence-archive-manifest.js` now accepts `--desktop-picker-archive-manifest`, defaults to `desktop-picker-archive-manifest.json`, and records an `archives.desktopPicker` section.
- The release archive manifest now checks that the desktop picker archive manifest exists, parses, is valid, and points at the same archived desktop picker report by path and hash.
- `scripts/create-signed-release-closure-report.js` now accepts `--desktop-picker-archive-manifest` and treats the picker archive evidence as a Windows release blocker when it is missing, stale, or mismatched.
- `src/shared/openpet-contracts.ts` now models the linked archive manifest section in the release evidence manifest contract.
- Shared type fixtures and release tests now cover the new archive manifest gate, mismatch behavior, and closure-report wording.

## Boundaries Preserved

- The new gate does not manufacture picker evidence.
- Pending or unsigned picker archives can still be archived, but they do not become release-ready.
- Windows remains not release-ready until the full evidence set is present.

## Tests

Targeted verification during implementation:

```bash
node --test tests/release/release-evidence-archive-manifest.test.js tests/release/signed-release-closure-report.test.js
npm run typecheck
node --check scripts/create-release-evidence-archive-manifest.js
node --check scripts/create-signed-release-closure-report.js
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

- A signed release archive cannot pass unless the desktop picker archive manifest is present and matches the archived picker report.
- The signed closure report explains the picker archive blocker when the archive manifest is missing or stale.
- The shared release evidence contract stays aligned with the new archive-manifest section.
