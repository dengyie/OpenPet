# Phase 79 Plan: macOS Release Evidence Archive

## Goal

Add a repeatable local handoff from the GitHub Actions `openpet-macos-release-evidence-<tag>` artifact into a permanent release evidence archive.

## Acceptance

- A CLI copies the downloaded macOS evidence artifact into a chosen archive directory.
- The archive manifest records source artifact name, release tag, workflow run URL, file sizes, and SHA-256 hashes.
- Required evidence files are enforced: `macos-codesign.txt`, `macos-notarization.txt`, and `macos-gatekeeper.txt`.
- Optional Phase 77 summaries are preserved when present.
- Passing-looking evidence is labeled only as macOS evidence-ready; official release readiness remains gated by release archive and signed closure tooling.
- Tests cover unsigned artifacts, passing-looking artifacts, missing required files, parser behavior, and npm command availability.

## Implementation Steps

1. Add `scripts/create-macos-release-evidence-archive.js`.
2. Add `npm run create-macos-release-evidence-archive`.
3. Add Node tests under `tests/release/`.
4. Update release checklist and live project docs.
5. Run targeted, full validation, production review, then commit and push.

## Decision Record

### Decision 1: Archive downloaded artifact directories, not GitHub API downloads

- Problem: GitHub artifact download requires auth and varies between local and CI contexts.
- Choice: accept a local `--artifact-dir` after the maintainer downloads/unzips the artifact.
- Reason: keeps the tool deterministic, testable, and credential-free.
- Risk: operators must download the correct artifact; provenance fields record artifact name, tag, and workflow URL for review.

### Decision 2: Separate evidence-ready from release-ready

- Problem: macOS evidence can look passing before the whole release archive is complete.
- Choice: emit `macosEvidenceReady` only.
- Reason: official claims still need picker/runtime/Windows evidence and signed closure.
- Risk: another reviewer may mistake the manifest as release proof; docs and warnings state the boundary explicitly.
