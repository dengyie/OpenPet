# Phase 87: Plugin Cleanup Evidence Updater

> Date: 2026-06-18
> Scope: add a maintainer CLI for safely updating Phase 86 plugin cleanup evidence reports.

## Goal

Phase 87 makes plugin cleanup evidence reports easier and safer to maintain.

Phase 86 could create a pending report and validate a finished report, but filling real-host evidence still required manual JSON edits. This phase adds an updater that applies reviewed evidence snippets through allowlisted fields and validates before writing.

## Scope

In scope:

- `npm run update-plugin-cleanup-evidence-report`;
- allowlisted environment metadata updates;
- allowlisted scenario metadata updates;
- required cleanup check updates for status, evidence, evidence file, and notes;
- check listing for maintainers;
- default structural validation with pending checks allowed;
- readiness validation through `--validate-ready`;
- write protection for invalid ready updates.

Out of scope:

- no report schema changes;
- no runtime cleanup behavior changes;
- no new plugin, renderer, bridge, or filesystem permissions;
- no automatic packaged-app cleanup collector;
- no universal process-tree cleanup guarantee.

## Implementation

Updated files:

- `scripts/update-plugin-cleanup-evidence-report.js`
- `tests/release/plugin-cleanup-evidence-report-update.test.js`
- `package.json`

Behavior:

1. `--list-checks` prints every required cleanup evidence check id and label.
2. `--set-env` accepts only `platform`, `arch`, `node`, `machine`, `runner`, and `evidence`.
3. `--set-scenario` accepts only `pluginId`, `hostApp`, and `notes`.
4. `--check` selects one required cleanup check for status, evidence, evidence-file, and notes updates.
5. Default validation calls the existing Phase 86 validator with pending checks allowed.
6. `--validate-ready` uses strict readiness validation and writes only after validation succeeds.

## Decision Record

### Decision 1: preserve the Phase 86 schema

- Problem: evidence reports need safer editing, but the schema is already validated and documented.
- Choice: keep the report shape unchanged and add an updater around it.
- Reason: maintainers get better workflow without creating contract drift.

### Decision 2: reject generic JSON patching

- Problem: generic patching would allow unsupported fields and misleading claims.
- Choice: update only known environment/scenario keys and required cleanup check ids.
- Reason: the report remains aligned with the validator and review checklist.

### Decision 3: validate before write

- Problem: a failed readiness attempt could otherwise leave a partially updated report on disk.
- Choice: validate the in-memory update first and write only when validation passes.
- Reason: failed `--validate-ready` runs preserve the previous report state.

## Validation

Targeted validation:

```bash
node --test tests/release/plugin-cleanup-evidence-report-update.test.js
node --test tests/release/plugin-cleanup-evidence-report.test.js tests/release/plugin-cleanup-evidence-report-update.test.js
```

Result:

- 9/9 pass for Phase 87 updater tests.
- 16/16 pass across Phase 86 report and Phase 87 updater suites.

Full verification is recorded in the Phase 87 review document.

## Outcome

OpenPet now has a safe maintainer path for filling plugin cleanup evidence reports incrementally. This improves the cleanup evidence workflow while preserving the existing runtime cleanup boundary and the non-universal cleanup guarantee.
