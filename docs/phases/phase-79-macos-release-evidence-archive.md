# Phase 79: macOS Release Evidence Archive

> Date: 2026-06-18
> Scope: preserve macOS release workflow evidence artifacts in permanent release archives.

## Goal

Phase 78 made GitHub macOS release jobs upload `openpet-macos-release-evidence-<tag>` as a maintainer artifact. Phase 79 adds the local archive handoff so that downloaded artifact can be copied into a long-term release evidence directory with source provenance and hashes.

## Scope

In scope:

- add `npm run create-macos-release-evidence-archive`;
- copy required macOS evidence files from a downloaded artifact directory;
- preserve optional Phase 77 Markdown/JSON summaries when present;
- write `macos-release-evidence-artifact-manifest.json`;
- record artifact name, release tag, workflow run URL, bytes, SHA-256 hashes, and evidence statuses;
- keep official release readiness gated by release archive and signed closure tooling.

Out of scope:

- downloading GitHub artifacts through the API;
- creating, signing, or notarizing app bundles;
- claiming official release readiness from this artifact manifest alone;
- changing Windows evidence flow.

## Implementation

Updated files:

- `scripts/create-macos-release-evidence-archive.js`
- `tests/release/create-macos-release-evidence-archive.test.js`
- `package.json`
- release checklist and live project docs

Behavior:

1. Maintainers download and unzip `openpet-macos-release-evidence-<tag>`.
2. They run `npm run create-macos-release-evidence-archive -- --artifact-dir <downloaded> --archive-dir <permanent-archive>`.
3. The script copies required evidence files, copies optional summaries, and writes a manifest.
4. The manifest exposes `macosEvidenceReady` but never `releaseReady`.

## Decision Record

### Decision 1: credential-free local handoff

- Problem: direct artifact download requires GitHub auth and would make the tool depend on local credential state.
- Choice: accept a downloaded/unzipped artifact directory.
- Reason: deterministic local validation and repeatable release review.
- Risk: the wrong artifact could be supplied; the manifest records artifact name, release tag, and workflow URL so reviewers can compare it with the release run.

### Decision 2: manifest is not a release claim

- Problem: passing macOS evidence can be mistaken for full release readiness.
- Choice: report `macosEvidenceReady`, not `releaseReady`.
- Reason: official release claims also depend on packaged runtime, native picker, Windows smoke, release archive, and signed closure gates.
- Risk: more steps remain before a release can be called ready; that is intentional and documented.

## Verification

Targeted:

```bash
node --test tests/release/create-macos-release-evidence-archive.test.js
node --check scripts/create-macos-release-evidence-archive.js
npm run create-macos-release-evidence-archive -- --help
```

Full:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
```

## Outcome

After Phase 79, the macOS workflow evidence artifact has a permanent archive path. Official release readiness remains evidence-gated and unchanged.
