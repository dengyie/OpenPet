# Plugin Cleanup Evidence Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 87 tooling for safely updating plugin cleanup evidence reports.

**Architecture:** Reuse the Phase 86 validator and report schema. A standalone updater performs allowlisted metadata/check updates, validates before writing, and leaves runtime cleanup behavior untouched.

**Tech Stack:** CommonJS Node scripts, Node native test runner, existing plugin cleanup evidence report validator, Markdown phase/review docs.

---

## File Map

- Create: `scripts/update-plugin-cleanup-evidence-report.js`
  Purpose: incrementally update existing cleanup evidence reports with allowlisted fields.
- Create: `tests/release/plugin-cleanup-evidence-report-update.test.js`
  Purpose: prove parser safety, metadata updates, check updates, evidence-file reads, ready validation, list output, write behavior, and failed-ready write protection.
- Modify: `package.json`
  Purpose: expose `npm run update-plugin-cleanup-evidence-report`.
- Create: `docs/phases/phase-87-plugin-cleanup-evidence-updater.md`
  Purpose: record delivered scope, decisions, validation, and limits.
- Create: `docs/reviews/phase-87-plugin-cleanup-evidence-updater-review.md`
  Purpose: record production review and quality gate.
- Modify: live docs and machine context whose current facts or test counts change.

## Tasks

- [x] **Task 1: Write failing updater tests**

Add `tests/release/plugin-cleanup-evidence-report-update.test.js` with coverage for:

```js
parseUpdateArgs([
  'plugin-cleanup-evidence-report.json',
  '--set-env', 'machine=mac-cleanup-host',
  '--set-env', 'evidence=terminal transcript sha256:abc123',
  '--set-scenario', 'hostApp=OpenPet.app',
  '--check', 'service-exit-confirmed-stop',
  '--status', 'pass',
  '--evidence', 'Service stayed stopping until exit event',
  '--notes', 'Observed in packaged app cleanup fixture'
])
```

Expected RED:

```text
Cannot find module '../../scripts/update-plugin-cleanup-evidence-report'
```

- [x] **Task 2: Implement the updater**

Create `scripts/update-plugin-cleanup-evidence-report.js` with:

```js
const VALID_STATUSES = new Set(['pass', 'fail', 'pending', 'blocked'])
const ENVIRONMENT_KEYS = new Set(['platform', 'arch', 'node', 'machine', 'runner', 'evidence'])
const SCENARIO_KEYS = new Set(['pluginId', 'hostApp', 'notes'])
```

The script must:

- parse `--output`, `--list-checks`, `--check`, `--status`, `--evidence`, `--evidence-file`, `--notes`, `--set-env`, `--set-scenario`, and `--validate-ready`;
- reject check updates without `--check`;
- reject unknown metadata keys and check ids;
- read evidence files as UTF-8 and trim trailing whitespace;
- validate with pending checks allowed by default;
- validate with readiness requirements when `--validate-ready` is supplied;
- write only after validation passes.

- [x] **Task 3: Expose the npm command**

Add:

```json
"update-plugin-cleanup-evidence-report": "node scripts/update-plugin-cleanup-evidence-report.js"
```

- [x] **Task 4: Verify targeted behavior**

Run:

```bash
node --test tests/release/plugin-cleanup-evidence-report-update.test.js
node --test tests/release/plugin-cleanup-evidence-report.test.js tests/release/plugin-cleanup-evidence-report-update.test.js
```

Expected:

- Phase 87 updater tests pass;
- Phase 86 report generation/validation tests still pass.

- [ ] **Task 5: Run production review, full verification, and commit**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

- no blocking production review findings;
- all verification commands pass;
- `npm test` reports 623/623 Node tests.

Commit:

```bash
git add package.json scripts/update-plugin-cleanup-evidence-report.js tests/release/plugin-cleanup-evidence-report-update.test.js docs/phases/phase-87-plugin-cleanup-evidence-updater.md docs/reviews/phase-87-plugin-cleanup-evidence-updater-review.md docs/superpowers/specs/2026-06-18-plugin-cleanup-evidence-updater-phase87-design.md docs/superpowers/plans/2026-06-18-plugin-cleanup-evidence-updater-phase87.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md
git commit -m "feat(阶段87): add plugin cleanup evidence updater"
```

## Self-Review Checklist

- [x] Runtime cleanup semantics are unchanged.
- [x] Report schema is unchanged.
- [x] Unknown metadata and check ids are rejected.
- [x] `--validate-ready` does not write failed updates.
- [x] Docs keep cleanup guarantees conservative.
