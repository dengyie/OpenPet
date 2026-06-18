# Phase 103: Plugin Community Intake Submission Bridge

> Date: 2026-06-18
> Scope: add a safe maintainer bridge from compatible Phase 100 intake summaries into Phase 99 community-source submission evidence.

## Goal

Phase 100 can classify a public candidate source as compatible or incompatible. Phase 99 can create community-source submission evidence once a compatible archive is known. Phase 103 connects those two steps with a small bridge command so maintainers do not have to manually copy archive/source metadata from an intake summary into the submission-evidence command.

## Decision Record

### Decision 1: bridge only ready intake summaries

- Problem: Phase 102 proved that real public adjacent sources can be incompatible with OpenPet's current `plugin.json` package model.
- Choice: the bridge rejects every intake summary except `ready-for-community-evidence` with `compatibility.ok: true` and `reasonCode: openpet-plugin-package`.
- Reason: incompatible archives should remain useful intake evidence, not become submission-evidence claims.
- Risk: maintainers still need a compatible public `plugin.json` package for a real green-path community evidence archive.

### Decision 2: delegate to Phase 99 instead of duplicating submission logic

- Problem: duplicating package, bundle, approval, and provenance logic would create another evidence path that can drift.
- Choice: `create-plugin-community-source-evidence-from-intake` validates the intake summary, then calls the existing `createPluginCommunitySourceSubmissionEvidence()` implementation.
- Reason: Phase 99 remains the canonical submission-evidence generator.
- Risk: future Phase 99 option changes must be reflected in the bridge tests.

## Implementation

Added:

- `scripts/create-plugin-community-source-evidence-from-intake.js`
- `tests/scripts/create-plugin-community-source-evidence-from-intake.test.js`

Updated:

- `package.json`

Behavior:

1. The new CLI accepts:
   - `--intake-summary`
   - `--source-relation`
   - `--independence-notes`
   - optional output/reviewer/decision/notes/json flags.
2. The bridge reads the intake summary and rejects:
   - missing summaries;
   - incompatible statuses such as `incompatible-package-model`;
   - ready statuses with inconsistent compatibility metadata;
   - ready statuses missing archive, plugin, or community source metadata.
3. Ready summaries are delegated into the existing Phase 99 evidence generator with preserved archive URL, plugin path, community source URL, and submitter.

## Boundary

This phase improves maintainer workflow for compatible sources. It does not prove that a compatible live independent third-party OpenPet plugin exists, does not approve any plugin, and does not change signing trust, catalog publication, runtime safety, cleanup readiness, or release readiness.

Phase 102's `alvinunreal/openpets` archive remains `incompatible-package-model` and must not enter this bridge unless a compatible `plugin.json` package path is identified in a future source.

## Validation

Targeted validation:

```bash
node --test tests/scripts/create-plugin-community-source-evidence-from-intake.test.js
# pass: 6/6
```

Full verification is recorded in the Phase 103 review note.
