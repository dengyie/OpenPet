# Phase 77: macOS Release Evidence Capture

> Date: 2026-06-18
> Scope: add a macOS release evidence capture command that writes the evidence files consumed by the release archive manifest.

## Goal

Phase 76 completed remote-source rehearsal for extension submissions. The next highest-value productization gap is signed release evidence.

Phase 77 does not create a signed release. Instead, it makes macOS evidence capture repeatable by adding a command that writes the canonical `macos-codesign.txt`, `macos-notarization.txt`, and `macos-gatekeeper.txt` files expected by the release archive manifest, plus Markdown/JSON summaries that keep readiness wording conservative.

## Scope

In scope:

- new `create-macos-release-evidence` command;
- optional app-bundle verification with `codesign --verify --deep --strict --verbose=2`;
- optional Gatekeeper verification with `spctl --assess --type execute --verbose=4`;
- imported codesign, notarization, and Gatekeeper evidence files for CI/manual release runs;
- inline notarization evidence text for release operators who paste `notarytool` output;
- canonical archive filenames for release-level aggregation;
- Markdown and JSON summary files;
- tests for parsing, imported evidence, command output capture, and readiness gates.

Out of scope:

- creating Developer ID certificates;
- submitting notarization requests;
- claiming macOS release readiness without signed, notarized, Gatekeeper-accepted evidence;
- changing Windows release wording;
- changing runtime, picker, or app packaging behavior.

## Implementation

Added files:

- `scripts/create-macos-release-evidence.js`
- `tests/release/create-macos-release-evidence.test.js`
- `docs/phases/phase-77-macos-release-evidence-capture.md`
- `docs/reviews/phase-77-macos-release-evidence-capture-review.md`
- `docs/superpowers/plans/2026-06-18-macos-release-evidence-capture-phase77.md`

Updated files:

- `package.json`
- `docs/desktop-release-design.md`
- `docs/release-checklist.md`
- `docs/HANDOFF.md`
- `docs/development-summary.md`
- `docs/project-status-review.md`
- `docs/project-context.json`
- `docs/productization-v1.1-todo-design.md`
- `docs/project-review-todo-design.md`

Behavior changes:

1. `create-macos-release-evidence` can run codesign and spctl against an app bundle or copy pre-collected evidence files.
2. It always writes:
   - `macos-codesign.txt`
   - `macos-notarization.txt`
   - `macos-gatekeeper.txt`
   - `macos-release-evidence-summary.md`
   - `macos-release-evidence-summary.json`
3. It reuses the release archive manifest's macOS evidence status rules, so summary readiness matches archive readiness.
4. If evidence is missing, unsigned, rejected, or pending, the summary remains `releaseReady: false`.

## Decision Record

### Decision 1: capture evidence, do not automate notarization

- Problem: notarization requires Apple credentials and can be asynchronous.
- Choice: support imported notarization evidence or inline text instead of trying to run `notarytool` in this phase.
- Reason: the release operator can archive the authoritative Apple output without putting credentials into a local helper.
- Risk: this phase does not remove the need for a real signed/notarized release run.

### Decision 2: keep canonical archive filenames

- Problem: release archive tooling already expects three macOS evidence files.
- Choice: write exactly `macos-codesign.txt`, `macos-notarization.txt`, and `macos-gatekeeper.txt`.
- Reason: the new command plugs into the existing manifest and closure report without broadening the release contract.

### Decision 3: preserve conservative readiness wording

- Problem: a helper that writes evidence files could be mistaken for proof of release readiness.
- Choice: summary output explicitly separates evidence archival from release readiness and stays false unless all three macOS evidence statuses pass.
- Reason: this follows the project rule that evidence comes before claims.

## Verification

Targeted verification:

```bash
node --test tests/release/create-macos-release-evidence.test.js
npm run create-macos-release-evidence -- --help
node --check scripts/create-macos-release-evidence.js
```

Full verification before commit:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

## Outcome

After Phase 77, OpenPet has a repeatable macOS evidence capture path that feeds the existing release archive manifest and signed closure report. Official macOS release readiness still requires real signed, notarized, and Gatekeeper-accepted evidence.
