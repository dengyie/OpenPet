# Packaged Runtime Evidence Contracts Phase 95 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared TypeScript contracts for packaged runtime smoke reports and packaged runtime smoke evidence payloads.

**Architecture:** Keep the CommonJS packaged runtime smoke scripts as the runtime source of truth and extend `src/shared/openpet-contracts.ts` so their JSON outputs become compile-time-checked boundaries. The report script owns artifact discovery and readiness scaffolding, the smoke runner owns emitted runtime evidence, and the shared contracts mirror those shapes for fixtures and future release/archive consumers.

**Tech Stack:** TypeScript shared contracts, Node CommonJS release scripts, Node native tests, `tsc --noEmit` fixture validation.

---

### Task 1: Type Fixture RED

**Files:**
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [x] **Step 1: Import missing packaged runtime contract names**

Add imports for `PackagedRuntimeSmokeReport` and `PackagedRuntimeSmokeEvidence` from `src/shared/openpet-contracts.ts`.

- [x] **Step 2: Add representative fixtures for report and evidence outputs**

Create fixtures that match the real packaged runtime report and evidence outputs: artifact metadata, linked picker evidence, runtime check status vocabulary, launch/window/renderer/pack state, and final-state evidence.

- [x] **Step 3: Run the typecheck and verify RED**

Run: `npm run typecheck`

Expected before implementation: FAIL with missing exported contract names.

### Task 2: Shared Contract Implementation

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Test: `tests/shared/openpet-contracts-type-fixture.ts`

- [x] **Step 1: Add packaged runtime smoke report contracts**

Define interfaces for artifact files, runtime environment summary, fixture metadata, linked picker evidence, runtime checks, and the top-level packaged runtime smoke report.

- [x] **Step 2: Add packaged runtime smoke evidence payload contracts**

Define interfaces for the runner-emitted launch/window/renderer/pack/final-state evidence payload.

- [x] **Step 3: Run the typecheck and verify GREEN**

Run: `npm run typecheck`

Expected: PASS.

### Task 3: Runtime-Test Alignment

**Files:**
- Test: `tests/release/packaged-runtime-smoke-report.test.js`
- Test: `tests/release/packaged-runtime-smoke-capture.test.js`

- [x] **Step 1: Run targeted packaged runtime evidence tests**

Run: `node --test tests/release/packaged-runtime-smoke-report.test.js tests/release/packaged-runtime-smoke-capture.test.js`

Expected: PASS.

### Task 4: Documentation And Review

**Files:**
- Create: `docs/phases/phase-95-packaged-runtime-evidence-contracts.md`
- Create: `docs/reviews/phase-95-packaged-runtime-evidence-contracts-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`

- [x] **Step 1: Document the new packaged runtime evidence TypeScript boundary**

Record that Phase 95 adds compile-time contracts only and does not change packaged runtime readiness rules, picker-link rules, or release wording.

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

Commit message: `feat(阶段95): add packaged runtime evidence contracts`
