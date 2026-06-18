# Phase 86: Plugin Cleanup Evidence

> Date: 2026-06-18
> Scope: add a repeatable current-host evidence command for the existing plugin process-tree cleanup helper.

## Goal

Phase 86 adds auditable cleanup evidence without changing plugin runtime cleanup behavior.

The new controlled evidence command starts a root process plus one descendant, invokes the existing `service-process-tree` cleanup path, waits for exit, and writes JSON/Markdown evidence. The phase also adds a structured checklist report and validator for manual real-host cleanup evidence across setup, command, and service cleanup paths.

## Scope

In scope:

- `npm run create-plugin-cleanup-evidence`;
- `npm run create-plugin-cleanup-evidence-report`;
- `npm run validate-plugin-cleanup-evidence-report`;
- controlled root/descendant process fixture owned by the evidence command;
- JSON and Markdown evidence output;
- structured checklist report validation with pending/readiness modes;
- overwrite protection for existing evidence files;
- shared `PluginCleanupEvidenceReport` / `PluginCleanupEvidenceChecklistReport` contracts and fixtures;
- one archived macOS host evidence run.

Out of scope:

- no `PluginService` behavior changes;
- no new cleanup escalation policy;
- no new plugin permissions;
- no renderer, bridge, or plugin access to the evidence command;
- no universal descendant termination guarantee.

## Implementation

Updated files:

- `scripts/create-plugin-cleanup-evidence.js`
- `scripts/create-plugin-cleanup-evidence-report.js`
- `scripts/validate-plugin-cleanup-evidence-report.js`
- `tests/scripts/create-plugin-cleanup-evidence.test.js`
- `tests/release/plugin-cleanup-evidence-report.test.js`
- `package.json`
- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`

Archived evidence:

- `docs/release-evidence/plugin-cleanup-evidence/2026-06-18T10-00-00Z-darwin-arm64/plugin-cleanup-evidence.json`
- `docs/release-evidence/plugin-cleanup-evidence/2026-06-18T10-00-00Z-darwin-arm64/plugin-cleanup-evidence.md`

Behavior:

1. The script parses `--output-dir`, `--json`, and `--help`.
2. It starts a root Node process and a descendant Node process.
3. It waits until the descendant is visible to `service-process-tree`.
4. It calls `signalServiceProcessTree(rootPid, 'SIGTERM')`.
5. It marks the report `ok: true` only when cleanup was attempted, the root exited, and all descendants seen before cleanup are no longer live.
6. It writes a conservative claim boundary into both JSON and Markdown output.
7. The structured report generator creates pending cleanup checks for service/setup/command cleanup evidence.
8. The validator allows in-progress reports only with `--allow-pending` and requires every check to pass with evidence before readiness.

## Decision Record

### Decision 1: evidence only

- Problem: docs call out stronger cleanup evidence, but runtime semantics are already bounded and tested.
- Choice: add an evidence command rather than changing `PluginService`.
- Reason: maintainers get real-host proof without expanding production stop behavior.

### Decision 2: controlled fixture

- Problem: cleanup evidence must not target arbitrary user processes.
- Choice: the script only kills the fixture processes it starts.
- Reason: evidence collection remains safe and repeatable.

### Decision 3: conservative wording

- Problem: one passing host run could be mistaken for a hard platform guarantee.
- Choice: the report explicitly says it is a single controlled host cleanup fixture and not a universal process-tree guarantee.
- Reason: this matches OpenPet's established plugin safety language.

### Decision 4: two evidence layers

- Problem: a controlled fixture proves one current-host cleanup helper run, but release/readiness review also needs explicit evidence for the documented setup, command, and service stop paths.
- Choice: keep the fixture command for machine-generated JSON/Markdown evidence and add a structured report generator/validator for maintainer-filled readiness records.
- Reason: this gives reviewers a stronger evidence path without pretending one fixture is a universal cleanup proof.

## Validation

Targeted validation:

```bash
node --test tests/scripts/create-plugin-cleanup-evidence.test.js
node --test tests/release/plugin-cleanup-evidence-report.test.js
```

Result:

- 12/12 pass across the two Phase 86 targeted suites.

Initial type/syntax validation:

```bash
npm run typecheck
node --check scripts/create-plugin-cleanup-evidence.js
node --check scripts/create-plugin-cleanup-evidence-report.js
node --check scripts/validate-plugin-cleanup-evidence-report.js
```

Result:

- pass.

Full verification is recorded in the Phase 86 review document.

## Outcome

OpenPet now has a repeatable plugin cleanup evidence command, one archived macOS host evidence run, and a structured checklist report/validator for broader real-host cleanup evidence. The runtime cleanup contract remains unchanged: setup, declaration-command, and service stop paths keep their existing Phase 68-73 semantics, and OpenPet still does not claim guaranteed cleanup for every possible descendant process tree.
