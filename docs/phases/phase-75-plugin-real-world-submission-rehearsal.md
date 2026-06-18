# Phase 75: Plugin Real-World Submission Rehearsal

> Date: 2026-06-17
> Scope: add a local real-world plugin submission rehearsal using an existing example plugin.

## Goal

Phase 44 proved the scaffold-based author path.

Phase 74 added the maintainer approval artifact.

Phase 75 moves the workflow closer to a real third-party submission by rehearsing the full author-plus-maintainer handoff from an already-authored example plugin. This keeps the scope local and auditable while addressing the documented follow-up for broader real-world extension rehearsal.

## Scope

In scope:

- new `create-plugin-real-world-submission-rehearsal` command;
- validation of an existing plugin directory before packaging;
- package zip creation;
- submission bundle creation and validation;
- maintainer approval creation and validation;
- README, command list, checklist, and summary artifacts for the session;
- one archived session using `examples/plugins/weather-status`;
- tests and conservative live-doc updates.

Out of scope:

- external GitHub/community repository fetches;
- catalog publication;
- signing trust escalation;
- runtime smoke execution;
- plugin permission, bridge, service, or cleanup behavior changes.

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

- `scripts/create-plugin-real-world-submission-rehearsal.js`
- `tests/scripts/create-plugin-real-world-submission-rehearsal.test.js`
- `docs/phases/phase-75-plugin-real-world-submission-rehearsal.md`
- `docs/reviews/phase-75-plugin-real-world-submission-rehearsal-review.md`
- `docs/superpowers/specs/2026-06-17-plugin-real-world-submission-rehearsal-phase75-design.md`
- `docs/superpowers/plans/2026-06-17-plugin-real-world-submission-rehearsal-phase75.md`
- `docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/`

Behavior changes:

1. `create-plugin-real-world-submission-rehearsal` now:
   - accepts `--source`, `--output-dir`, reviewer metadata, decision, notes, and `--json`;
   - validates the existing source plugin;
   - packages it into `.openpet-plugin.zip`;
   - validates the packaged artifact;
   - creates and validates a submission bundle;
   - creates and validates maintainer approval artifacts;
   - writes README, checklist, commands, and summary files.

2. The archived Phase 75 session uses `examples/plugins/weather-status`, which exercises:
   - `network`,
   - `pet:say`,
   - `storage`,
   - and an explicit network allowlist.

## Decision Record

### Decision 1: use `weather-status` as the first real-world rehearsal source

- Problem: the repo does not contain an external community plugin repository.
- Choice: use `examples/plugins/weather-status` as the local stand-in.
- Reason: it has a more realistic capability mix than `focus-timer` because it includes network, storage, pet speech, and public config.
- Risk: this still does not prove third-party provenance. The README and docs state that clearly.

### Decision 2: keep this as a separate command from scaffold rehearsal

- Problem: Phase 44's command could be extended to handle existing plugins.
- Choice: add a separate command for real-world submission rehearsal.
- Reason: scaffold and existing-plugin rehearsals answer different audit questions and deserve separate archives.

## Validation

Targeted verification:

```bash
node --test tests/scripts/create-plugin-real-world-submission-rehearsal.test.js
npm run create-plugin-real-world-submission-rehearsal -- --source examples/plugins/weather-status --output-dir docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z --reviewer "OpenPet Maintainer" --decision approved --notes "Manifest, permissions, package hash, network hosts, and submission artifacts reviewed."
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

After Phase 75:

- OpenPet has scaffold-based and existing-plugin submission rehearsals;
- the existing-plugin rehearsal archives package, submission bundle, and maintainer approval evidence;
- the docs remain conservative that this is workflow evidence, not community provenance, signing trust, catalog publication, runtime safety, or release readiness.
