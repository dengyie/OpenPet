# Plugin Real-World Submission Rehearsal Design

> Date: 2026-06-17
> Phase target: Phase 75

## Goal

Phase 44 proved that OpenPet can guide an author through a scaffold-based submission rehearsal.

Phase 74 proved that OpenPet can record a separate maintainer approval artifact on top of a ready submission bundle.

The next practical gap is closer to the real third-party workflow called out in the project reviews and handoff docs: rehearse a full submission using an existing plugin that looks like a community package, not just a generated scaffold.

The goal of Phase 75 is to add a local, repeatable real-world submission rehearsal that:

- starts from an existing example plugin,
- packages it as a submitted artifact,
- generates the author-side bundle,
- records maintainer approval,
- archives the full artifact chain,
- and keeps all trust and runtime claims conservative.

## Current State

Today the repository already supports:

- example plugins under `examples/plugins/`,
- scaffold-driven author rehearsal under `create-plugin-author-rehearsal`,
- maintainer approval rehearsal on top of a submission bundle,
- archived author/maintainer rehearsal evidence under `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/`.

Current limits:

- the archived rehearsal is still scaffold-first rather than example-plugin-first;
- there is no one-command path for a more realistic existing-plugin submission rehearsal;
- there is no archived “community-style” submission session that exercises an already-authored plugin through author and maintainer handoff.

## Decision Record

### Decision 1: use an existing example plugin instead of inventing a fake external package

- Problem: the repo does not include a true third-party plugin repository.
- Choice: use an existing example plugin as the source of a more realistic submission rehearsal.
- Reason: this stays within current repository evidence while still moving beyond scaffold-only rehearsal.
- Risk: it is still not a live external community package. That is acceptable because the goal is local workflow realism, not external provenance proof.

### Decision 2: keep the real-world rehearsal separate from scaffold rehearsal

- Problem: one command could either mutate the current scaffold rehearsal path or be modeled separately.
- Choice: create a separate real-world submission rehearsal command and archive location.
- Reason: scaffold rehearsal and existing-plugin rehearsal answer different questions and should stay independently auditable.

### Decision 3: archive the full author-plus-maintainer chain

- Problem: the phase could stop at a report or submission bundle.
- Choice: archive the package zip, submission bundle, approval record, README, commands, checklist, and summary.
- Reason: the project reviews explicitly call for a more realistic third-party submission rehearsal, so the entire handoff chain should be visible.

## Scope

In scope:

- add a script to run a full real-world plugin submission rehearsal from an existing plugin directory;
- require the selected source plugin to validate before packaging;
- create a package zip, submission bundle, and maintainer approval record;
- write author/maintainer README, command list, checklist, and machine-readable summary;
- archive one example session under `docs/release-evidence/plugin-real-world-submission-rehearsal/`;
- update tests and live docs conservatively.

Out of scope:

- external GitHub fetch or marketplace integration;
- real catalog publication;
- signature/notarization trust escalation;
- executing plugin code;
- changing runtime permissions, bridge scope, or cleanup semantics.

## Design

### 1. New real-world rehearsal command

Add a script shaped like:

```bash
npm run create-plugin-real-world-submission-rehearsal -- --source examples/plugins/weather-status --output-dir docs/release-evidence/plugin-real-world-submission-rehearsal/<session> --reviewer "OpenPet Maintainer" --decision approved --notes "Manifest, permissions, package hash, and submission artifacts reviewed."
```

Behavior:

- validate the source plugin directory;
- package it as `.openpet-plugin.zip`;
- validate the zip package;
- create a submission bundle;
- validate the bundle with `--require-ready`;
- create maintainer approval artifacts;
- validate the approval with `--require-approved`;
- write README, commands, checklist, and summary JSON for the session.

### 2. New archive layout

Archive under:

- `docs/release-evidence/plugin-real-world-submission-rehearsal/<session>/`

Expected contents:

- `README.md`
- `commands.json`
- `submission-checklist.md`
- `plugin-real-world-submission-rehearsal-summary.json`
- `packages/`
- `submission-bundle/`

### 3. Example plugin selection

Support a required `--source` plugin directory.

For the first archived example, prefer `examples/plugins/weather-status` because it exercises:

- network allowlist,
- public config,
- storage,
- pet speech,
- and a more realistic capability mix than the minimal example.

### 4. Honest workflow language

Required wording:

- this is a local rehearsal using an existing example plugin;
- approval remains a human review artifact;
- the archive does not prove community provenance, signing trust, catalog publication, runtime safety, or release readiness.

## Acceptance

Phase 75 is complete when:

- an existing example plugin can run through a one-command real-world submission rehearsal locally;
- the session writes package, submission, and approval artifacts plus author/maintainer guidance files;
- targeted tests cover the command and generated outputs;
- archived evidence contains one complete real-world rehearsal session;
- docs describe the archive as local workflow evidence, not community trust proof;
- full verification and production review pass.
