# Windows Smoke Evidence Contracts Phase 93 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared TypeScript contracts for Windows smoke evidence summaries and Windows smoke archive manifests.

**Architecture:** Keep the CommonJS evidence scripts as the runtime source of truth and extend `src/shared/openpet-contracts.ts` so their JSON outputs become compile-time-checked boundaries. The summary script owns evidence/report aggregation, the archive script owns hash/archive validation, and the shared contracts mirror those shapes for fixtures and future consumers.

**Tech Stack:** TypeScript shared contracts, Node CommonJS release scripts, Node native tests, `tsc --noEmit` fixture validation.

---

### Task 1: Type Fixture RED

**Files:**
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [x] **Step 1: Import missing Windows evidence contract names**

Add imports for `WindowsSmokeEvidenceSummary` and `WindowsSmokeArchiveManifest` from `src/shared/openpet-contracts.ts`.

- [x] **Step 2: Add representative fixtures for summary and archive outputs**

Create fixtures that match the real Phase 81-era evidence summary and archive manifest outputs: evidence file hashes, paired report validation flags, summary metadata, and warning/error wording.

- [x] **Step 3: Run the typecheck and verify RED**

Run: `npm run typecheck`

Expected before implementation: FAIL with missing exported contract names.

### Task 2: Shared Contract Implementation

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Test: `tests/shared/openpet-contracts-type-fixture.ts`

- [x] **Step 1: Add Windows evidence summary contracts**

Define interfaces for the evidence bundle summary, paired report details, check-status counts, and top-level structured summary from `create-windows-smoke-evidence-summary.js`.

- [x] **Step 2: Add Windows archive manifest contract**

Define the top-level archive manifest shape from `create-windows-smoke-archive-manifest.js`, including summary metadata, evidence section, and report validation sections.

- [x] **Step 3: Run the typecheck and verify GREEN**

Run: `npm run typecheck`

Expected: PASS.

### Task 3: Runtime-Test Alignment

**Files:**
- Test: `tests/release/create-windows-smoke-evidence-summary.test.js`
- Test: `tests/release/create-windows-smoke-archive-manifest.test.js`

- [x] **Step 1: Run targeted Windows evidence tests**

Run: `node --test tests/release/create-windows-smoke-evidence-summary.test.js tests/release/create-windows-smoke-archive-manifest.test.js`

Expected: PASS.

### Task 4: Documentation And Review

**Files:**
- Create: `docs/phases/phase-93-windows-smoke-evidence-contracts.md`
- Create: `docs/reviews/phase-93-windows-smoke-evidence-contracts-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`

- [x] **Step 1: Document the new Windows evidence TypeScript boundary**

Record that Phase 93 adds compile-time contracts only and does not change Windows readiness claims, signed-evidence rules, or archive semantics.

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

Commit message: `feat(阶段93): add windows smoke evidence contracts`
