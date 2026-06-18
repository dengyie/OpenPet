# Plugin Cleanup Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, repeatable Phase 86 evidence tooling for current-host plugin cleanup behavior and structured readiness reports.

**Architecture:** A standalone Node script owns evidence collection and calls the existing `service-process-tree` helper against a controlled fixture. A companion report generator/validator records maintainer-filled readiness evidence. Runtime plugin cleanup behavior stays unchanged; docs and contracts record the evidence boundary.

**Tech Stack:** Node scripts, CommonJS, Node native test runner, shared TypeScript contracts, Markdown/JSON release evidence artifacts.

---

## File Map

- Create: `scripts/create-plugin-cleanup-evidence.js`
  Purpose: run a controlled root/descendant process fixture, invoke existing process-tree cleanup, and write JSON/Markdown evidence.
- Create: `scripts/create-plugin-cleanup-evidence-report.js`
  Purpose: create pending checklist reports for broader real-host cleanup evidence.
- Create: `scripts/validate-plugin-cleanup-evidence-report.js`
  Purpose: validate pending and readiness cleanup evidence reports.
- Create: `tests/scripts/create-plugin-cleanup-evidence.test.js`
  Purpose: cover CLI parsing, actual fixture evidence generation, overwrite refusal, and conservative Markdown wording.
- Create: `tests/release/plugin-cleanup-evidence-report.test.js`
  Purpose: cover pending report generation, readiness validation, evidence requirements, and malformed checks.
- Modify: `package.json`
  Purpose: expose `npm run create-plugin-cleanup-evidence`.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: add `PluginCleanupEvidenceReport`.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: type-check a representative cleanup evidence payload.
- Create: `docs/release-evidence/plugin-cleanup-evidence/2026-06-18T10-00-00Z-darwin-arm64/`
  Purpose: archive one current macOS host evidence run.
- Create: `docs/phases/phase-86-plugin-cleanup-evidence.md`
  Purpose: record delivered scope, decisions, validation, and remaining limits.
- Create: `docs/reviews/phase-86-plugin-cleanup-evidence-review.md`
  Purpose: record production review result and quality gate.
- Modify: live docs and context files whose current facts or test counts change.

## Tasks

- [x] **Task 1: Add the evidence command**

Implement `scripts/create-plugin-cleanup-evidence.js` with:

```js
const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'plugin-cleanup-evidence')
const DEFAULT_JSON_NAME = 'plugin-cleanup-evidence.json'
const DEFAULT_MARKDOWN_NAME = 'plugin-cleanup-evidence.md'
```

The script must:

- parse `--output-dir`, `--json`, and `--help`;
- start one root Node process and one descendant Node process;
- wait until the descendant is visible;
- call `createServiceProcessTree().signalServiceProcessTree(rootPid, 'SIGTERM')`;
- mark `ok: true` only when cleanup was attempted, root exited, and all pre-cleanup descendants are no longer live;
- write JSON and Markdown evidence;
- refuse to overwrite existing evidence files;
- include warning text that this is not a universal cleanup guarantee.

- [x] **Task 2: Add tests and contracts**

Add Node tests that prove:

- argument parsing accepts output/json controls;
- incomplete and unexpected arguments fail;
- a real controlled host fixture produces `ok: true`;
- overwrite is refused;
- Markdown includes conservative claim wording.

Add `PluginCleanupEvidenceReport` to shared contracts and a fixture using `satisfies PluginCleanupEvidenceReport`.

Add tests for the structured checklist report generator/validator, including pending mode, readiness mode, required evidence, missing checks, duplicate checks, unknown checks, and missing CLI values.

- [x] **Task 3: Generate one archived host evidence run**

Run:

```bash
npm run create-plugin-cleanup-evidence -- --output-dir docs/release-evidence/plugin-cleanup-evidence/2026-06-18T10-00-00Z-darwin-arm64 --json
```

Expected:

- JSON output has `ok: true`;
- `plugin-cleanup-evidence.json` and `plugin-cleanup-evidence.md` exist in the archive directory;
- warnings preserve the non-universal claim boundary.

- [x] **Task 4: Update docs**

Update Phase 86 docs, review docs, README/HANDOFF/development summary/status/context, and the v1.1 TODO design so they say:

- Phase 86 adds cleanup evidence collection and report validation, not stronger runtime semantics;
- the command is `npm run create-plugin-cleanup-evidence`;
- the checklist commands are `npm run create-plugin-cleanup-evidence-report` and `npm run validate-plugin-cleanup-evidence-report`;
- current Node test count increases by twelve;
- OpenPet still does not claim universal descendant termination.

- [ ] **Task 5: Verify and commit**

Run:

```bash
node --test tests/scripts/create-plugin-cleanup-evidence.test.js
node --test tests/release/plugin-cleanup-evidence-report.test.js
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

- all commands pass;
- `npm test` reports 614/614 Node tests;
- Control Center still reports 10/10 UI tests.

Commit:

```bash
git add package.json scripts/create-plugin-cleanup-evidence.js scripts/create-plugin-cleanup-evidence-report.js scripts/validate-plugin-cleanup-evidence-report.js tests/scripts/create-plugin-cleanup-evidence.test.js tests/release/plugin-cleanup-evidence-report.test.js src/shared/openpet-contracts.ts tests/shared/openpet-contracts-type-fixture.ts docs/release-evidence/plugin-cleanup-evidence/2026-06-18T10-00-00Z-darwin-arm64 docs/phases/phase-86-plugin-cleanup-evidence.md docs/reviews/phase-86-plugin-cleanup-evidence-review.md docs/superpowers/specs/2026-06-18-plugin-cleanup-evidence-phase86-design.md docs/superpowers/plans/2026-06-18-plugin-cleanup-evidence-phase86.md docs/HANDOFF.md docs/development-summary.md docs/project-context.json docs/productization-v1.1-todo-design.md
git commit -m "feat(阶段86): add plugin cleanup evidence"
```

## Self-Review Checklist

- [x] Runtime cleanup semantics are unchanged.
- [x] The script only targets controlled fixture processes it starts.
- [x] Reports refuse overwrite and preserve evidence provenance.
- [x] Docs do not claim universal cleanup guarantees.
- [x] Tests and shared contracts cover the new report shape.
