# Development Documentation Hardening Design

> Date: 2026-07-16
> Canonical branch: `main`
> Scope: repository-internal documentation and documentation validation

## Goal

Make OpenPet's active developer documentation complete, navigable, current, and mechanically protected against the drift already present in the repository. Close every repository-internal documentation task that can be proven from source, tests, and commit history while keeping external signing, real-device, human-acceptance, and third-party-source work explicitly open.

## Current Evidence

The current repository has a strong documentation inventory but an unreliable active-document surface:

- `docs/README.md`, `docs/HANDOFF.md`, `docs/TODO.md`, `docs/project-status-review.md`, and `docs/project-context.json` all link to `docs/development-workflow.md`, but that file does not exist.
- The live maintainer documents still identify `codex/dev7` as the current branch even though the canonical integration branch is `main`.
- `docs/TODO.md` records the production-review remediation as complete, while every execution checkbox in `docs/superpowers/plans/2026-07-12-production-review-remediation.md` remains open.
- `npm run check:docs-drift` and the documentation test suite pass despite those inconsistencies.
- Source, tests, and scripts contain no actionable runtime `TODO`, `FIXME`, `XXX`, `HACK`, or `TBD` markers outside documentation references and test text.

## Scope Boundaries

### In Scope

- Add the missing canonical development workflow document.
- Align active maintainer metadata and current engineering facts with the latest `main` baseline.
- Record production-review remediation completion with commit-level evidence and close its execution checkboxes.
- Strengthen documentation validation so missing live documents, unstable branch metadata, and reopened completed remediation work fail deterministically.
- Update documentation tests and maintenance guidance for the new invariants.

### Out Of Scope

- Runtime Electron, service, IPC, plugin, renderer, or Control Center behavior changes.
- Apple signing/notarization, Windows signed smoke, real packaged picker runs, or human desktop acceptance.
- Manufacturing a third-party plugin source or promoting unsupported release claims.
- Rewriting historical phase, review, release-evidence, or superseded roadmap records.

External work remains in `docs/TODO.md` with its real prerequisites and current evidence paths.

## Documentation Architecture

Documentation is divided into four levels. Each level has a distinct owner and update rule.

### Level 0: Public Entry

Files: `README.md`, `README.zh-CN.md`, `CHANGELOG.md`.

Purpose: product overview, supported capabilities, installation, and common commands. These files link to maintainer and domain documentation but do not carry detailed operational state.

### Level 1: Live Maintainer Truth

Files: `docs/README.md`, `docs/HANDOFF.md`, `docs/TODO.md`, `docs/development-workflow.md`, `docs/testing-strategy.md`, `docs/development-summary.md`, `docs/project-status-review.md`, and `docs/project-context.json`.

Purpose: current architecture, development process, validation policy, current blockers, and machine-readable project facts. These are the only documents that should be updated for ordinary current-state changes.

The branch field in live documentation means the canonical integration branch, not the temporary branch used to edit the document. Its stable value is `main`.

### Level 2: Domain Reference

Files include plugin authoring, Agent Awareness, AI provider, MCP, pet-pack, release, and design-system documents linked from `docs/README.md`.

Purpose: durable subsystem contracts and operator guidance. Domain reference documents change only when their subsystem contract changes.

### Level 3: Audit History And Evidence

Files under `docs/phases/`, `docs/reviews/`, `docs/archive/`, `docs/release-evidence/`, and historical Superpowers plans/specs.

Purpose: immutable or append-oriented evidence and decision history. They are not bulk-updated when current facts change. The production-review remediation plan is the one active execution record being closed by this work because `docs/README.md` explicitly lists it as current.

## Developer Workflow Document

`docs/development-workflow.md` will be a task-oriented maintainer guide with these sections:

1. Supported local prerequisites and initial installation.
2. Protected-main and isolated-worktree rules.
3. Architecture entrypoints and ownership boundaries.
4. Change workflow: inspect, reproduce, test first, implement, verify, commit.
5. Validation levels and exact commands.
6. Runtime-specific workflows for Control Center, services, plugins, pet packs, and release tooling.
7. Configuration, secret, and logging safety rules.
8. Troubleshooting for dependencies, Electron/Playwright, native cursor helper, and documentation drift.
9. Merge readiness and handoff requirements.

The guide links to canonical domain documents instead of duplicating their full content.

## Code And Verification Classification

Changes and checks are graded by production risk so contributors can choose the correct validation surface.

### Grade A: Security, Persistence, Lifecycle, And Public Runtime

Examples: secret storage, settings durability, plugin network/package handling, IPC, process lifecycle, AI conversation state.

Required validation: focused regression tests, `npm run test:core:all`, `npm test`, `npm run check:syntax`, relevant manual acceptance, and `git diff --check`.

### Grade B: User-Facing Control Center And Runtime Integration

Examples: panes, hooks, IPC adapters, provider flows, pet interaction, plugin management.

Required validation: focused Node tests, `npm run test:control-center`, `npm run test:core`, `npm run check:syntax`, and `git diff --check`.

### Grade C: Tooling, Contracts, And Documentation

Examples: release scripts, evidence parsers, shared contracts, active documentation, and documentation checks.

Required validation: focused tool or docs tests, `npm run test:tools`, `npm run check:docs-drift`, JSON/type validation where applicable, and `git diff --check`. Run broader suites when a shared script or contract affects runtime consumers.

This hardening change is Grade C. It must not claim Grade A or B runtime verification unless those suites are actually run.

## Validation Design

The documentation validator remains a small Node tool but gains explicit structural checks before content checks.

### Layer 1: Required File Inventory

A single exported or module-local list defines live documentation files. The validator checks existence and regular-file status before reading. Failure output names the missing path instead of throwing a raw filesystem exception.

`development-workflow.md` is added to this inventory.

### Layer 2: Stable Metadata

Live human-readable summaries and `project-context.json` must follow these
independent metadata rules:

- each live document owns its own valid ISO `YYYY-MM-DD` update date;
- canonical branch `main`.

Checks reject invalid dates, temporary `codex/*`, `dev*`, detached,
or inconsistent branch metadata in Level 1 documents. A valid date change in
one live document does not require touching unrelated live documents.
Historical documents and test fixtures are excluded.

### Layer 3: Completion Integrity

The active production-review remediation plan must state that Tasks 1-10 are complete, contain no open execution checkbox, and link each workstream to an existing commit reachable from `main`.

The validator checks document state, while tests verify the expected completion contract. Git reachability is established during implementation and recorded in the plan; the runtime docs check remains filesystem-deterministic and does not depend on a `.git` directory in packaged or copied fixtures.

### Layer 4: Existing Truth Checks

Current release, provider, Agent Awareness, and evidence-boundary checks remain intact. External blockers must continue to be described as real/manual-required work.

## Test Strategy

The implementation follows a documentation-focused red-green cycle:

1. Add a test proving the live-doc inventory fails clearly when `development-workflow.md` is missing.
2. Add tests rejecting stale temporary branch metadata and inconsistent machine-readable metadata.
3. Add a test requiring the active production remediation plan to have no open execution checkbox and to include its completion ledger.
4. Run the focused tests and confirm they fail against the current repository.
5. Implement the validator and documentation changes.
6. Run focused tests, `npm run check:docs-drift`, `npm run test:tools`, `npm test`, `npm run test:control-center`, `npm run check:syntax`, and `git diff --check`.

Tests assert public behavior and document contracts rather than private helper implementation details.

## Maintainability Rules

- Keep one source of truth for the live-document inventory.
- Keep structural checks separate from content-truth checks.
- Use named check IDs and actionable failure messages.
- Do not add a second active TODO, roadmap, or handoff file.
- Do not copy long release-evidence narratives into the workflow guide.
- Do not derive project truth from the current feature branch name.
- Keep JSON facts machine-readable and validate them through `JSON.parse` in tests.
- Preserve external blockers until real evidence changes their state.

## Usability Requirements

A new maintainer following `README.md` to `docs/README.md` must be able to:

- install and launch the project;
- identify the service and UI entrypoints;
- select the correct validation grade;
- develop without touching protected `main` directly;
- find plugin, pet-pack, AI, testing, and release guidance;
- understand which TODO items are locally actionable and which require external evidence;
- diagnose a failed documentation check from its output.

## Acceptance Criteria

- Every Level 1 document linked from `docs/README.md` exists.
- Live metadata identifies canonical `main`, and each live document carries
  its own valid ISO update date.
- The production-review remediation plan has Tasks 1-10 closed with an evidence ledger and no open execution checkbox.
- External/manual TODO items remain open and retain their current evidence boundaries.
- Documentation checks fail cleanly for a missing live file, stale branch metadata, or reopened remediation checkbox.
- All required Grade C checks and the requested full regression matrix pass from a clean worktree.
- No runtime source file is changed.
