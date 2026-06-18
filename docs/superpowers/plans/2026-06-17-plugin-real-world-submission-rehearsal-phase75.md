# Plugin Real-World Submission Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local one-command submission rehearsal for an existing plugin that produces the full author-plus-maintainer artifact chain.

**Architecture:** Reuse the existing validation, submission-bundle, and maintainer-approval tooling. Keep scaffold rehearsal and real-world rehearsal separate so both remain independently auditable.

**Tech Stack:** CommonJS Node CLI scripts, Node native test runner, existing plugin submission tooling, Markdown/JSON artifact generation, production-code-quality-review workflow.

---

## File Map

- Create: `scripts/create-plugin-real-world-submission-rehearsal.js`
  Purpose: validate an existing plugin directory, package it, create a submission bundle, add maintainer approval, and archive the full rehearsal.
- Create: `tests/scripts/create-plugin-real-world-submission-rehearsal.test.js`
  Purpose: TDD coverage for the new real-world rehearsal command, arguments, outputs, and summary.
- Modify: `package.json`
  Purpose: expose an npm script for the new rehearsal command.
- Create: `docs/phases/phase-75-plugin-real-world-submission-rehearsal.md`
- Create: `docs/reviews/phase-75-plugin-real-world-submission-rehearsal-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-submission-workflow-playbook.md`
  Purpose for all live docs: record the new real-world rehearsal truth conservatively.
- Add under: `docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/`
  Purpose: archive one full example session using an existing example plugin.

## Task 1: Write failing tests for real-world submission rehearsal

**Files:**
- Create: `tests/scripts/create-plugin-real-world-submission-rehearsal.test.js`

- [ ] Add parse-args coverage for source, output, reviewer, decision, notes, and json flags.
- [ ] Add a failing end-to-end test that:
  - uses `examples/plugins/weather-status` as the source;
  - creates a temp output directory;
  - expects package zip, submission bundle, approval record, README, commands, checklist, and summary JSON;
  - expects the summary to report `sourcePlugin.id === openpet.example.weather-status`;
  - expects the submission bundle to be ready for human review;
  - expects the approval record to be approved and approval-ready.
- [ ] Run the targeted test and verify RED.

## Task 2: Implement the rehearsal command

**Files:**
- Create: `scripts/create-plugin-real-world-submission-rehearsal.js`
- Modify: `package.json`

- [ ] Implement CLI parsing and safe output handling.
- [ ] Reuse `validatePluginPackage`, `createPluginSubmissionBundle`, `loadBundle`/`validateBundle`, `createPluginMaintainerApproval`, and `validateMaintainerApproval`.
- [ ] Write Markdown/JSON guidance artifacts plus a machine-readable summary.
- [ ] Add the npm script entry.
- [ ] Run the targeted test and verify GREEN.

## Task 3: Archive one real-world session and update docs

**Files:**
- Add under: `docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/`
- Create: `docs/phases/phase-75-plugin-real-world-submission-rehearsal.md`
- Create: `docs/reviews/phase-75-plugin-real-world-submission-rehearsal-review.md`
- Modify the live docs listed above.

- [ ] Generate the archived session using `examples/plugins/weather-status`.
- [ ] Record Phase 75 scope, review outcome, and verification commands.
- [ ] Update live docs conservatively to point at the new real-world rehearsal baseline.

## Task 4: Verify and commit

- [ ] Run targeted tests for the new script.
- [ ] Run full verification:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

- [ ] Commit atomically:

```bash
feat(阶段75): add real-world plugin submission rehearsal
```
