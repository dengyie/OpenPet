# Plugin Maintainer Approval Rehearsal Design

> Date: 2026-06-17
> Phase target: Phase 74

## Goal

Phase 74 closes the next practical gap in OpenPet's third-party extension workflow: maintainer approval records.

OpenPet already lets third-party authors:

- scaffold an extension,
- validate the package,
- generate a submission report,
- generate a PR packet,
- generate a submission bundle,
- and archive an author rehearsal.

What the current workflow still lacks is a structured, local, auditable way for maintainers to record the outcome of human review after that handoff.

The goal of Phase 74 is to add a maintainer approval rehearsal layer on top of the existing submission bundle workflow, without pretending that validation equals trust or that local evidence equals publication.

## Current State

Today the repository already supports:

- `create-plugin-submission-report`
- `create-plugin-submission-pr`
- `create-plugin-submission-bundle`
- `validate-plugin-submission-bundle`
- `create-plugin-author-rehearsal`
- archived author rehearsal evidence under `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/`

Current limits:

- reviewer approval is still only a checklist item or prose instruction;
- there is no machine-readable approval record;
- there is no validator for an approval record;
- a submission bundle can be "ready for human review", but the local toolchain cannot represent "review completed and approved" as a separate structured artifact.

This keeps the ecosystem honest, but it leaves a real maintainer workflow gap.

## Decision Record

### Decision 1: approval must be a separate artifact, not a mutation of the submission summary

- Problem: approval could either mutate `plugin-submission-summary.json` or be recorded as a separate file.
- Choice: create a separate approval artifact pair for Markdown and JSON.
- Reason: the submission bundle is an author-to-reviewer handoff packet. A maintainer approval is a distinct governance event with different authorship and timing. Keeping it separate preserves traceability.
- Risk: the workflow gains extra files. This is acceptable because the lifecycle event itself is distinct.

### Decision 2: approval remains human-authored but tool-structured

- Problem: local validation success could be mistaken for approval.
- Choice: require explicit maintainer-supplied metadata such as reviewer, decision, and notes.
- Reason: OpenPet must not imply that local validation or bundle generation grants approval automatically. The tool should capture human judgment, not replace it.
- Risk: maintainers must still enter real notes manually. That is correct for this phase.

### Decision 3: keep this phase local and rehearsal-oriented

- Problem: approval tooling could sprawl into PR APIs, merge automation, or catalog publication.
- Choice: keep the work local: generate approval records, validate them, and archive one example rehearsal.
- Reason: the missing gap is traceable local review completion, not repository automation or catalog infrastructure.
- Risk: publication/merge still happens outside the tool. That is acceptable because the approval record is the specific missing artifact today.

## Scope

In scope:

- add a script to create a structured maintainer approval record from an existing submission bundle;
- add a validator for that approval record;
- support at least `approved` and `changes-requested` decisions;
- require reviewer identity and review notes;
- generate Markdown and JSON approval artifacts;
- update author/maintainer workflow docs to show this new handoff completion step;
- add tests and archive one maintainer approval rehearsal example;
- update phase/review/live docs conservatively.

Out of scope:

- no automatic PR merge or GitHub API integration;
- no catalog publication pipeline;
- no signing trust escalation;
- no execution of third-party extension code;
- no change to plugin runtime permissions, setup/command/service execution, bridge, or cleanup boundaries;
- no rewrite of existing submission bundle formats.

## Design

### 1. New approval artifacts

Add two new artifacts beside the existing submission bundle:

- `plugin-maintainer-approval.md`
- `plugin-maintainer-approval.json`

The JSON should include:

- `generatedAt`
- `reviewer`
- `decision`
- `notes`
- `sourceBundleDir`
- `plugin`
- `package`
- `submissionDecision`
- `approvalReady`

Where:

- `submissionDecision` mirrors the source bundle decision such as `ready-for-human-review`;
- `approvalReady` is true only if the source bundle was ready for review and the maintainer decision is `approved`.

### 2. New CLI flow

Add a script with a shape like:

```bash
npm run create-plugin-maintainer-approval -- <bundle-dir> --reviewer "OpenPet Maintainer" --decision approved --notes "Manifest, permissions, package hash, and submission artifacts reviewed."
```

Behavior:

- load the submission bundle through the existing bundle loader;
- validate the submission bundle before generating approval artifacts;
- require non-empty `reviewer`, `decision`, and `notes`;
- reject unknown decision values;
- write Markdown and JSON approval artifacts into the bundle directory by default.

### 3. Approval validator

Add a validator with a shape like:

```bash
npm run validate-plugin-maintainer-approval -- <bundle-dir> --require-approved
```

Behavior:

- confirm the approval Markdown and JSON files exist;
- parse the JSON and verify required fields;
- verify that plugin id, version, and package hash match the source bundle summary;
- warn if the bundle path moved but the content still matches;
- fail `--require-approved` unless the source bundle is ready for human review and the approval decision is `approved`.

### 4. Rehearsal integration

`create-plugin-author-rehearsal` should stay honest about role boundaries:

- it must not auto-generate a fake maintainer decision during author rehearsal;
- it can point to the next-step command in the generated README/checklist/commands list.

The archived evidence should then include one explicit maintainer-side approval example applied to the already archived author rehearsal submission bundle.

### 5. Documentation impact

Phase 74 should update:

- `docs/plugin-submission-workflow-playbook.md`
- `docs/plugin-development.md`
- `docs/plugin-ecosystem-rules.md`
- `docs/HANDOFF.md`
- `docs/development-summary.md`
- `docs/project-status-review.md`
- `docs/project-context.json`
- `docs/productization-v1.1-todo-design.md`
- `docs/project-review-todo-design.md`

Required wording:

- OpenPet now supports a structured maintainer approval rehearsal record;
- approval remains a human review decision;
- the approval record does not prove signing trust, catalog publication, runtime safety, or release readiness.

## Acceptance

Phase 74 is complete when:

- a submission bundle can receive a structured maintainer approval record locally;
- Markdown and JSON approval artifacts are generated;
- approval validation catches missing, malformed, or mismatched approval records;
- `approved` and `changes-requested` are both covered by tests;
- archived rehearsal evidence contains one maintainer approval example;
- docs describe the new artifact as review traceability, not automated governance;
- full verification and production review pass.
