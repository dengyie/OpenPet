# Phase 78: macOS Release Evidence Artifact

> Date: 2026-06-18
> Scope: upload macOS release evidence from the GitHub release workflow.

## Goal

Phase 77 added a local command for canonical macOS release evidence capture. Phase 78 wires that command into the macOS release job so release runs produce a separate audit artifact without mixing evidence files into user-facing downloads.

## Scope

In scope:

- run `npm run create-macos-release-evidence` after the macOS release build;
- capture live `codesign` and `spctl` output when `OpenPet.app` is found;
- write pending evidence if the app bundle is not found;
- set notarization evidence text from workflow mode:
  - signed mode records accepted workflow notarization text;
  - unsigned mode records `NotSubmitted`;
- upload `release/macos-release-evidence/**` as `openpet-macos-release-evidence-<tag>`;
- keep macOS evidence out of public GitHub Release assets;
- add workflow regression tests.

Out of scope:

- creating Apple signing credentials;
- changing notarization behavior in `build/notarize.js`;
- claiming official macOS release readiness without real passing evidence;
- changing Windows release behavior.

## Implementation

Updated files:

- `.github/workflows/release.yml`
- `tests/release/release-workflow-macos-evidence.test.js`
- `docs/superpowers/plans/2026-06-18-macos-release-evidence-artifact-phase78.md`
- `docs/phases/phase-78-macos-release-evidence-artifact.md`
- `docs/reviews/phase-78-macos-release-evidence-artifact-review.md`
- live docs that describe current release evidence behavior.

Behavior:

1. The macOS release job now creates `release/macos-release-evidence/` before public asset publishing.
2. The workflow uploads that directory as an Actions artifact named `openpet-macos-release-evidence-<tag>` before public release asset publishing.
3. Public GitHub Release assets remain limited to `.dmg`, `.zip`, `.blockmap`, and `latest-mac.yml`.
4. Unsigned builds still archive pending evidence and cannot become release-ready through this workflow step.

## Decision Record

### Decision 1: upload evidence as an Actions artifact

- Problem: evidence files are useful for maintainers but are not user-installable assets.
- Choice: upload macOS evidence with `actions/upload-artifact`, not `softprops/action-gh-release`.
- Reason: keeps public release downloads clean while preserving audit material.
- Risk: evidence artifacts follow GitHub Actions retention policy and should be copied into long-term release archives when official release evidence is reviewed.

### Decision 1a: upload evidence before public release publishing

- Problem: if public GitHub Release asset upload fails first, a later evidence upload would not run.
- Choice: upload the macOS evidence artifact immediately after evidence generation.
- Reason: release-run audit material should exist even when the public asset publication step fails.
- Risk: a failed release may have an evidence artifact even when public assets were not published; this is acceptable because the artifact is for maintainer review and does not claim readiness.

### Decision 2: use workflow mode for notarization text

- Problem: Phase 77 intentionally does not call `notarytool`.
- Choice: signed workflow mode writes accepted workflow notarization text; unsigned mode writes `NotSubmitted`.
- Reason: electron-builder's notarization path is already controlled by `build/notarize.js`; this phase records the workflow result boundary without adding credentials or polling logic.
- Risk: official release closure still depends on reviewing real signed evidence, not only the helper text.

### Decision 3: test workflow shape directly

- Problem: GitHub Actions behavior cannot be fully executed locally.
- Choice: add a focused Node test that checks ordering, artifact upload, and public asset boundaries, plus a YAML parse check.
- Reason: this catches the regression that matters most for this phase without adding a new dependency.

## Verification

Targeted:

```bash
node --test tests/release/release-workflow-macos-evidence.test.js
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"'
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

After Phase 78, GitHub macOS release runs produce a dedicated macOS release evidence artifact. Official release readiness remains evidence-gated and still requires real signed, notarized, Gatekeeper-accepted evidence.
