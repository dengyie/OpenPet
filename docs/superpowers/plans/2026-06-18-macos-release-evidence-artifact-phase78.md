# Phase 78 Plan: macOS Release Evidence Artifact

> Date: 2026-06-18
> Scope: wire Phase 77 macOS evidence capture into the GitHub macOS release job without changing release readiness claims.

## Goal

Make every macOS release workflow run upload a separate evidence artifact containing the canonical macOS signing evidence files. This should support signed and unsigned runs: signed runs can capture live `codesign` / `spctl` output, while unsigned runs remain explicit pending evidence.

## Tasks

1. Update `.github/workflows/release.yml`.
   - After the macOS build, find the packaged `OpenPet.app`.
   - Run `npm run create-macos-release-evidence`.
   - Use accepted notarization text only for signed workflow mode.
   - Fall back to pending evidence if the `.app` bundle is not found.
   - Upload `release/macos-release-evidence/**` as an Actions artifact.
   - Keep evidence out of public GitHub Release assets.

2. Add workflow regression coverage.
   - Verify evidence generation happens before public release asset publishing.
   - Verify evidence artifact upload exists.
   - Verify public release asset upload does not include the evidence directory.
   - Verify workflow YAML parses.

3. Update docs.
   - Phase document and production review.
   - Live docs only where current facts change.

4. Verify.
   - Targeted workflow test.
   - YAML parse check.
   - `npm run check:syntax`
   - `npm test`
   - `npm run test:control-center`
   - `npm run typecheck`
   - `git diff --check`

## Acceptance

- macOS release workflow produces an `openpet-macos-release-evidence-<tag>` artifact.
- macOS release evidence upload happens before public release publishing can fail.
- Public release assets stay limited to install/update files.
- Unsigned workflows cannot accidentally claim signed readiness.
- Tests and review pass.
