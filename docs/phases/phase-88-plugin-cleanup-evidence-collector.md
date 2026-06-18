# Phase 88: Plugin Cleanup Evidence Collector

> Date: 2026-06-18
> Scope: add a local helper generator for plugin cleanup evidence collection.

## Goal

Phase 88 makes real-host plugin cleanup evidence collection more repeatable without automating readiness claims.

Phase 86 created the report shape and validator. Phase 87 added safe report updates. This phase adds a helper generator that creates a POSIX script for maintainers. The generated helper writes a manual checklist and update-command notes for every required cleanup check.

## Scope

In scope:

- `npm run create-plugin-cleanup-evidence-collector`;
- input report validation with pending checks allowed;
- generated `plugin-cleanup-evidence-collector.sh`;
- generated manual checklist content for every required cleanup check;
- generated update-command notes that use the Phase 87 updater;
- no generated `--status pass` commands;
- conservative wording that the helper does not prove readiness.

Out of scope:

- no runtime cleanup behavior changes;
- no automatic packaged-app cleanup collector;
- no plugin, renderer, bridge, or filesystem permission expansion;
- no automatic pass/fail/blocked decision;
- no universal process-tree cleanup guarantee.

## Implementation

Updated files:

- `scripts/create-plugin-cleanup-evidence-collector.js`
- `tests/release/plugin-cleanup-evidence-collector.test.js`
- `package.json`

Behavior:

1. The script parses `<report.json>`, optional `--output <collector.sh>`, and `--help`.
2. It validates the report with `validateReport(report, { allowPending: true })`.
3. It writes a POSIX helper next to the report by default.
4. The helper creates `manual-checks.md` and `update-report-commands.md` when run.
5. The generated content includes every required cleanup check id and label.
6. Generated update notes show metadata and validation commands only; they do not include status changes.

## Decision Record

### Decision 1: helper generation only

- Problem: cleanup evidence collection needs less drift, but automatic validation can overstate guarantees.
- Choice: generate a helper that writes checklist/command-note files only.
- Reason: evidence remains a reviewed operator action.

### Decision 2: no pass shortcuts

- Problem: generated `--status pass` commands would make it too easy to mark checks passed without evidence.
- Choice: use `STATUS` placeholders and explicit warnings.
- Reason: report readiness should require deliberate reviewed evidence.

### Decision 3: reuse Phase 86 validation

- Problem: helper output is only useful if it targets a valid report shape.
- Choice: reject invalid reports before generating the helper.
- Reason: required-check drift is caught at generation time.

## Validation

Targeted validation:

```bash
node --test tests/release/plugin-cleanup-evidence-collector.test.js
node --test tests/release/plugin-cleanup-evidence-report.test.js tests/release/plugin-cleanup-evidence-report-update.test.js tests/release/plugin-cleanup-evidence-collector.test.js tests/scripts/create-plugin-cleanup-evidence.test.js
```

Result:

- 10/10 pass for Phase 88 collector tests.
- 31/31 pass across cleanup evidence report, updater, collector, and controlled fixture suites.

Full verification is recorded in the Phase 88 review document.

## Outcome

OpenPet now has a safe maintainer helper for collecting plugin cleanup evidence consistently. The helper supports the Phase 86/87 report workflow, but it does not run production cleanup, does not mark checks as passed, and does not change runtime cleanup guarantees.
