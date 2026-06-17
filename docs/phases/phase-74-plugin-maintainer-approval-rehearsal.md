# Phase 74: Plugin Maintainer Approval Rehearsal

> Date: 2026-06-17
> Scope: add a structured maintainer approval record on top of the existing plugin submission bundle workflow.

## Goal

Phase 44 already gave OpenPet a complete author-side rehearsal:

- scaffold example extensions,
- validate them,
- package one plugin,
- create a submission bundle,
- and validate that bundle as ready for human review.

What remained missing was the next artifact in the handoff chain: a maintainer-side approval record that is explicit, local, auditable, and separate from the author bundle itself.

Phase 74 closes that gap without overstating trust:

- the author bundle still stops at `ready-for-human-review`;
- maintainer approval is now recorded separately as Markdown and JSON;
- approval still means human judgment, not signing trust, catalog publication, runtime safety, or release readiness.

## Scope

In scope:

- `scripts/create-plugin-maintainer-approval.js`;
- `scripts/validate-plugin-maintainer-approval.js`;
- npm scripts for approval generation and validation;
- author rehearsal guidance updates so the next maintainer step is explicit;
- targeted script tests for approved and changes-requested decisions;
- one archived maintainer approval example beside the existing author rehearsal submission bundle;
- live-doc wording updates where current facts changed.

Out of scope:

- GitHub PR merge automation;
- catalog publication automation;
- signing or notarization trust changes;
- plugin runtime permission or sandbox changes;
- any claim that local validation equals release approval.

## Implementation

Updated files:

- `package.json`
- `scripts/create-plugin-author-rehearsal.js`
- `tests/scripts/create-plugin-author-rehearsal.test.js`
- `docs/HANDOFF.md`
- `docs/development-summary.md`
- `docs/project-status-review.md`
- `docs/plugin-development.md`
- `docs/plugin-submission-workflow-playbook.md`
- `docs/plugin-ecosystem-rules.md`
- `docs/project-context.json`
- `docs/productization-v1.1-todo-design.md`
- `docs/project-review-todo-design.md`
- archived author rehearsal evidence under `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/`

Added files:

- `scripts/create-plugin-maintainer-approval.js`
- `scripts/validate-plugin-maintainer-approval.js`
- `tests/scripts/create-plugin-maintainer-approval.test.js`
- `tests/scripts/validate-plugin-maintainer-approval.test.js`
- `docs/phases/phase-74-plugin-maintainer-approval-rehearsal.md`
- `docs/reviews/phase-74-plugin-maintainer-approval-rehearsal-review.md`
- `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle/plugin-maintainer-approval.md`
- `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle/plugin-maintainer-approval.json`

Behavior changes:

1. `create-plugin-maintainer-approval` now:
   - loads an existing submission bundle;
   - validates that bundle before writing approval artifacts;
   - requires `reviewer`, `decision`, and `notes`;
   - supports `approved` and `changes-requested`;
   - writes `plugin-maintainer-approval.md` and `plugin-maintainer-approval.json`.

2. `validate-plugin-maintainer-approval` now:
   - confirms required approval files exist;
   - validates the approval JSON shape;
   - checks plugin id, version, package hash, and submission decision against the source submission bundle;
   - supports `--require-approved` for stricter local gating.

3. `create-plugin-author-rehearsal` now:
   - keeps author and maintainer roles separate;
   - adds maintainer approval commands to the generated README and command list;
   - makes the checklist explicit that approval is archived separately.

4. The archived rehearsal evidence now contains a concrete maintainer approval example for the ready-for-review AI author bundle.

## Decision Record

### Decision 1: keep approval as a separate artifact

- Problem: the approval outcome could have been added directly into `plugin-submission-summary.json`.
- Choice: record approval as a separate Markdown/JSON pair.
- Reason: the submission bundle is author-owned handoff material, while approval is a later maintainer-owned governance event.

### Decision 2: keep approval local and human-authored

- Problem: local tooling can accidentally blur validation and trust.
- Choice: require explicit reviewer metadata and notes, and keep the artifact local.
- Reason: OpenPet should capture the human decision, not simulate publication or trust.

## Validation

Targeted verification during implementation:

```bash
node --test tests/scripts/create-plugin-maintainer-approval.test.js tests/scripts/validate-plugin-maintainer-approval.test.js tests/scripts/create-plugin-author-rehearsal.test.js
npm run create-plugin-maintainer-approval -- docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle --reviewer "OpenPet Maintainer" --decision approved --notes "Manifest, permissions, package hash, and submission artifacts reviewed."
npm run validate-plugin-maintainer-approval -- docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle --require-approved
```

Full verification before commit:

```bash
npm test
npm run check:syntax
npm run typecheck
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

## Outcome

After Phase 74:

- the plugin review handoff no longer stops at a ready submission bundle;
- maintainers can record an explicit local approval artifact with reviewer identity and notes;
- author rehearsal now shows the real next step without pretending that authors approve themselves;
- OpenPet still keeps trust and release claims conservative.
