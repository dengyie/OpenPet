# Plugin Cleanup Evidence Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional collector generator for plugin cleanup evidence reports.

**Architecture:** The generator validates an existing cleanup report with pending checks allowed, then writes a POSIX shell helper that collects environment data, controlled fixture output, manual checklist notes, and updater command guidance. The helper never marks cleanup checks as passed.

**Tech Stack:** Node scripts, CommonJS, Node native test runner, existing plugin cleanup evidence scripts.

---

## File Map

- Create: `scripts/create-plugin-cleanup-evidence-collector.js`
  Purpose: generate `plugin-cleanup-evidence-collector.sh` for real-host evidence collection.
- Create: `tests/release/plugin-cleanup-evidence-collector.test.js`
  Purpose: cover CLI parsing, default path, checklist content, command notes, collector content, invalid report rejection, and writes.
- Modify: `package.json`
  Purpose: expose `npm run create-plugin-cleanup-evidence-collector`.
- Create: `docs/phases/phase-88-plugin-cleanup-evidence-collector.md`
  Purpose: record delivered scope, decisions, validation, and limits.
- Create: `docs/reviews/phase-88-plugin-cleanup-evidence-collector-review.md`
  Purpose: record production review result and quality gate.
- Modify: live docs/context
  Purpose: add command and update Node test counts.

## Tasks

- [x] **Task 1: Write failing tests**

Run:

```bash
node --test tests/release/plugin-cleanup-evidence-collector.test.js
```

Expected initial failure:

- missing `scripts/create-plugin-cleanup-evidence-collector.js`.

- [x] **Task 2: Implement collector generator**

Implemented:

- `--output <collector.sh>`;
- report-adjacent default output path;
- manual checklist generation;
- update command notes;
- POSIX helper generation;
- input report validation with pending checks allowed;
- executable writes with trailing newline.

- [x] **Task 3: Wire npm script**

Added:

```json
"create-plugin-cleanup-evidence-collector": "node scripts/create-plugin-cleanup-evidence-collector.js"
```

- [x] **Task 4: Verify and commit**

Run:

```bash
node --test tests/release/plugin-cleanup-evidence-collector.test.js
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

- all commands pass;
- `npm test` reports 633/633 Node tests;
- Control Center reports 10/10 UI tests.

Commit:

```bash
git add package.json scripts/create-plugin-cleanup-evidence-collector.js tests/release/plugin-cleanup-evidence-collector.test.js docs/phases/phase-88-plugin-cleanup-evidence-collector.md docs/reviews/phase-88-plugin-cleanup-evidence-collector-review.md docs/superpowers/specs/2026-06-18-plugin-cleanup-evidence-collector-phase88-design.md docs/superpowers/plans/2026-06-18-plugin-cleanup-evidence-collector-phase88.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md README.md README.zh-CN.md
git commit -m "feat(阶段88): add plugin cleanup evidence collector"
```

## Self-Review Checklist

- [x] Runtime cleanup semantics are unchanged.
- [x] The collector does not mark checks as passed.
- [x] Invalid input reports are rejected.
- [x] Manual checklist covers every required cleanup check.
- [x] Docs do not claim universal cleanup guarantees.
