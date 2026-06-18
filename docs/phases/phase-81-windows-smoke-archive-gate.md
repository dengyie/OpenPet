# Phase 81: Windows Smoke Archive Gate

> Date: 2026-06-18
> Scope: require reviewed Windows smoke archive manifests in release-level evidence and signed closure reports.

## Goal

Phase 81 closes a release-evidence integrity gap. OpenPet already had tooling for a reviewed Windows smoke archive, but the final release archive and signed closure report still depended only on `windows-smoke-report.json`.

After this phase, the standalone report is not enough for Windows or official desktop release wording. The reviewed `windows-smoke-archive-manifest.json` must also be present, valid, release-ready when signed evidence is required, and linked to the same archived Windows smoke report path and SHA-256 hash.

## Scope

In scope:

- add `--windows-smoke-archive-manifest` to release archive and signed closure CLIs;
- default the release archive path to `windows-smoke-archive-manifest.json`;
- validate the reviewed Windows archive manifest with the same linked-archive model used for desktop picker evidence;
- expose `archives.windowsSmoke` and generic `matchesReport` in the shared release archive contract;
- block Windows and official desktop signed closure claims when Windows archive evidence is missing, invalid, stale, mismatched, or not release-ready;
- update release and status docs.

Out of scope:

- creating real signed Windows evidence;
- changing the Windows smoke archive format;
- changing Windows support wording to release-ready;
- automating clean-machine Windows validation.

## Implementation

Updated files:

- `scripts/create-release-evidence-archive-manifest.js`
- `scripts/create-signed-release-closure-report.js`
- `src/shared/openpet-contracts.ts`
- `tests/release/release-evidence-archive-manifest.test.js`
- `tests/release/signed-release-closure-report.test.js`
- `tests/shared/openpet-contracts-type-fixture.ts`
- release/status docs

Behavior:

1. `create-release-evidence-archive-manifest` now reads a Windows smoke archive manifest from either an explicit CLI path or the archive default.
2. Linked archive validation compares the reviewed archive manifest's report path and hash against the archived Windows smoke report.
3. `archives.releaseReady` now requires both Windows smoke and desktop picker reviewed archive sections.
4. `create-signed-release-closure-report` includes Windows smoke archive blockers in the Windows claim and, by extension, the official desktop claim.
5. Shared TypeScript contracts include the new `archives.windowsSmoke` section.

## Verification

Targeted:

```bash
node --test tests/release/release-evidence-archive-manifest.test.js
node --test tests/release/signed-release-closure-report.test.js
npm run typecheck
```

Full phase verification:

```bash
npm run check:syntax
npm test
npm run test:control-center
git diff --check
```

## Outcome

The release evidence chain is stricter and easier to audit: Windows release claims now depend on both the Windows smoke report and its reviewed archive manifest. The project still must not claim Windows release readiness until real signed Windows artifacts and smoke evidence are captured and archived.
