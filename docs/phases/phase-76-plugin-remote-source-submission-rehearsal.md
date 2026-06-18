# Phase 76: Plugin Remote-Source Submission Rehearsal

> Date: 2026-06-18
> Scope: add a remote-source submission rehearsal that records HTTPS archive provenance together with package, submission-bundle, and maintainer-approval artifacts.

## Goal

Phase 75 proved the full local author-plus-maintainer handoff for an already-authored example plugin directory.

Phase 76 moves the evidence one step closer to a realistic third-party submission by starting from a public HTTPS archive instead of a plain directory. The purpose is to record which remote archive was reviewed, where it finally resolved, which plugin path inside the extracted archive was packaged, and which exact plugin files were hashed, while keeping the rest of the workflow on the same conservative local submission chain.

## Scope

In scope:

- new `create-plugin-remote-source-submission-rehearsal` command;
- HTTPS archive download input;
- selected plugin-path resolution inside the extracted archive;
- source provenance recording for archive URL, final URL, archive SHA-256, archive size, selected plugin path, and extracted file hashes;
- source validation, package creation, package validation, submission bundle creation, bundle validation, maintainer approval creation, and approval validation;
- README, command list, checklist, provenance JSON, and summary JSON artifacts for the session;
- one reviewed archived session using `https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main` plus `examples/plugins/weather-status`;
- conservative live-doc updates.

Out of scope:

- claiming live public community adoption;
- proving independent third-party ownership of the reviewed archive;
- signing trust, catalog publication, runtime safety, or release readiness claims;
- plugin execution or runtime permission changes;
- turning archive review into a catalog or install flow.

## Implementation

Updated files:

- `package.json`
- `docs/HANDOFF.md`
- `docs/development-summary.md`
- `docs/project-status-review.md`
- `docs/project-context.json`
- `docs/productization-v1.1-todo-design.md`
- `docs/project-review-todo-design.md`
- `docs/plugin-development.md`
- `docs/plugin-submission-workflow-playbook.md`

Added files:

- `scripts/create-plugin-remote-source-submission-rehearsal.js`
- `tests/scripts/create-plugin-remote-source-submission-rehearsal.test.js`
- `docs/phases/phase-76-plugin-remote-source-submission-rehearsal.md`
- `docs/reviews/phase-76-plugin-remote-source-submission-rehearsal-review.md`
- `docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/`

Behavior changes:

1. `create-plugin-remote-source-submission-rehearsal` now:
   - accepts `--archive-url`, `--plugin-path`, `--output-dir`, reviewer metadata, decision, notes, and `--json`;
   - downloads the remote archive through `curl -L`;
   - records the original archive URL plus the final resolved URL;
   - hashes the downloaded archive and records its byte size;
   - safely extracts the archive and resolves one plugin path inside it;
   - records extracted file hashes for the selected plugin;
   - validates the source plugin before packaging;
   - packages it into `.openpet-plugin.zip`;
   - validates the packaged artifact;
   - creates and validates a submission bundle;
   - creates and validates maintainer approval artifacts;
   - writes README, checklist, commands, provenance, and summary files.

2. The archived Phase 76 session uses the public OpenPet codeload archive and selects `examples/plugins/weather-status` inside the extracted tree. That exercises archive capture, plugin-path selection, extracted file hashing, package validation, submission bundle generation, and maintainer approval in one reproducible reviewed archive.

## Decision Record

### Decision 1: make remote-source provenance the canonical Phase 76 baseline

- Problem: the codebase briefly diverged between a local Git-bundle rehearsal and a remote archive rehearsal.
- Choice: keep remote-source provenance as the official Phase 76 path.
- Reason: the extension docs and ecosystem guidance already promise archive URL, final URL, archive hash, plugin path, and extracted file hashes. The implementation needed to catch up to that published boundary.

### Decision 2: require HTTPS for the real command but keep tests network-independent

- Problem: a true remote-source rehearsal should verify an HTTPS archive, but automated tests should not depend on network availability.
- Choice: the CLI requires `https:` archive URLs, while tests inject a local zip fixture through the download boundary.
- Reason: the production path remains honest about remote-source inputs, while the test suite stays deterministic and fast.

## Validation

Targeted verification:

```bash
node --test tests/scripts/create-plugin-remote-source-submission-rehearsal.test.js
npm run create-plugin-remote-source-submission-rehearsal -- --archive-url https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main --plugin-path examples/plugins/weather-status --output-dir docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z
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

After Phase 76:

- OpenPet has scaffold-based, existing-plugin, and remote-source submission rehearsals;
- the remote-source rehearsal records archive URL, final URL, archive SHA-256, archive size, selected plugin path, and extracted file hashes beside package/review artifacts;
- the docs still say clearly that this is remote-source workflow evidence, not proof of independent public ecosystem trust, signing, publication, runtime safety, or release readiness.
