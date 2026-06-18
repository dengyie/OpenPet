# Windows Smoke Report Contracts Phase 97 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared TypeScript contracts for Windows smoke reports.

**Architecture:** Keep the CommonJS Windows smoke script as the runtime source of truth and extend `src/shared/openpet-contracts.ts` so its JSON output becomes a compile-time-checked boundary. Summary/archive tooling remains separate and continues to consume the same runtime semantics without any behavior change.

**Tech Stack:** TypeScript shared contracts, Node CommonJS release scripts, Node native tests, `tsc --noEmit` fixture validation.

---

### Task 1: Type Fixture RED

**Files:**
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [x] **Step 1: Import the missing Windows smoke report contract name**

Add the `WindowsSmokeReport` import from `src/shared/openpet-contracts.ts`.

- [x] **Step 2: Add a representative fixture for the smoke report output**

Create a fixture that matches the real Windows smoke report output: environment metadata, release artifact metadata, Authenticode fields, blockmaps, and required check vocabulary.

- [x] **Step 3: Run the typecheck and verify RED**

Run: `npm run typecheck`

Expected before implementation: FAIL with the missing exported contract name.

### Task 2: Shared Contract Implementation

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Test: `tests/shared/openpet-contracts-type-fixture.ts`

- [x] **Step 1: Add Windows smoke report contracts**

Define interfaces for artifact files, smoke report environment metadata, artifact/signature metadata, check entries, and the top-level smoke report output.

- [x] **Step 2: Run the typecheck and verify GREEN**

Run: `npm run typecheck`

Expected: PASS.

### Task 3: Runtime-Test Alignment

**Files:**
- Test: `tests/release/create-windows-smoke-report.test.js`
- Test: `tests/release/create-windows-smoke-evidence-summary.test.js`
- Test: `tests/release/create-windows-smoke-archive-manifest.test.js`

- [x] **Step 1: Run targeted Windows smoke tests**

Run: `node --test tests/release/create-windows-smoke-report.test.js tests/release/create-windows-smoke-evidence-summary.test.js tests/release/create-windows-smoke-archive-manifest.test.js`

Expected: PASS.

### Task 4: Documentation And Review

**Files:**
- Create: `docs/phases/phase-97-windows-smoke-report-contracts.md`
- Create: `docs/reviews/phase-97-windows-smoke-report-contracts-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`

- [x] **Step 1: Document the new Windows smoke report TypeScript boundary**

Record that Phase 97 adds compile-time contracts only and does not change Windows smoke readiness, signed-evidence rules, or release wording.

- [x] **Step 2: Run production review**

Use the production review workflow in deep mode for the current diff.

- [x] **Step 3: Run full verification**

Run:

```bash
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected: all pass.

- [ ] **Step 4: Commit and push**

Commit message: `feat(阶段97): add Windows smoke report contracts`
