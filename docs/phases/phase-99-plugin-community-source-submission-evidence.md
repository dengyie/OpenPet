# Phase 99: Plugin Community-Source Submission Evidence

> Date: 2026-06-18
> Scope: add a stricter community-source evidence wrapper around the remote-source plugin submission rehearsal.

## Goal

Phase 76 made a public HTTPS archive reviewable, but the archived example still came from the official OpenPet repository. Phase 99 adds the missing community-source evidence layer: maintainers can now record a public community source URL, submitter label, source relationship, independence notes, remote archive hash, selected plugin path, submission bundle, and maintainer approval in one evidence command.

The goal is evidence traceability, not stronger trust claims.

## Scope

In scope:

- new `create-plugin-community-source-submission-evidence` command;
- community source URL and submitter metadata;
- required `community` source label;
- source relationship vocabulary: `independent-third-party`, `external-community`, `unknown`;
- required maintainer independence/provenance notes;
- reuse of the Phase 76 remote-source archive -> package -> submission bundle -> maintainer approval chain;
- community evidence README, checklist, command list, machine-readable community evidence, and summary JSON;
- deterministic tests using a local zip fixture rather than network access;
- live documentation updates.

Out of scope:

- claiming a live third-party OpenPet plugin has been adopted;
- treating the local test fixture as real public ecosystem proof;
- signing trust, catalog publication, runtime safety, cleanup readiness, or release readiness claims;
- plugin installation, enabling, or execution;
- runtime permission changes.

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

- `scripts/create-plugin-community-source-submission-evidence.js`
- `tests/scripts/create-plugin-community-source-submission-evidence.test.js`
- `docs/phases/phase-99-plugin-community-source-submission-evidence.md`
- `docs/reviews/phase-99-plugin-community-source-submission-evidence-review.md`

Behavior changes:

1. `create-plugin-community-source-submission-evidence` accepts:
   - `--archive-url`;
   - `--plugin-path`;
   - `--community-source-url`;
   - `--submitter`;
   - `--source-relation`;
   - `--independence-notes`;
   - reviewer metadata, decision, notes, output directory, and `--json`.

2. The command requires HTTPS for both archive URL and community source URL.

3. The command requires source label `community` and rejects other labels in this evidence mode.

4. The command reuses `createPluginRemoteSourceSubmissionRehearsal` so package validation, submission bundle creation, maintainer approval, and provenance hashing remain on the same tested path as Phase 76.

5. `communityEvidenceReady` becomes true only when:
   - the source label is `community`;
   - the source relation is not `unknown`;
   - the submission bundle validates;
   - maintainer approval validates;
   - the maintainer decision is `approved`.

6. Unknown source relation is allowed but keeps `communityEvidenceReady: false` so maintainers can still archive provenance without overstating source independence.

## Decision Record

### Decision 1: add a wrapper instead of forking submission tooling

- Problem: community evidence needs more metadata than Phase 76, but the package and approval flow should not diverge.
- Choice: add a wrapper command that calls the existing remote-source rehearsal.
- Reason: it keeps archive safety checks, package validation, submission bundle validation, and maintainer approval on one implementation path.
- Risk: output archives contain both Phase 76 files and Phase 99 files; docs now name which files are canonical for community-source evidence.

### Decision 2: allow `unknown` relationship but keep readiness false

- Problem: maintainers may need to capture a community-like source before independence is fully established.
- Choice: permit `sourceRelation: unknown`, but do not mark the evidence ready.
- Reason: preserving raw provenance is useful, while readiness still requires a reviewer to classify the source relationship.
- Risk: users may misread the archive as approval; README, checklist, and summary boundaries explicitly reject signing, publication, runtime safety, and release readiness claims.

### Decision 3: do not archive a fake live community source

- Problem: there is no confirmed live third-party OpenPet plugin archive available in this workspace.
- Choice: tests use a deterministic local zip fixture; live docs say a real independent community URL is still the next evidence step.
- Reason: a fabricated public source would be worse than a pending evidence gap.
- Risk: Phase 99 proves the evidence tooling, not external ecosystem adoption.

## Validation

Targeted verification:

```bash
node --test tests/scripts/create-plugin-community-source-submission-evidence.test.js
node --check scripts/create-plugin-community-source-submission-evidence.js
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

After Phase 99, OpenPet has scaffold, existing-plugin, remote-source, and community-source submission evidence tooling. The community-source path records source relationship and independence notes while keeping trust boundaries conservative. A real independent community plugin source can now be archived through the command without changing code.
