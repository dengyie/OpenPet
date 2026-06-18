# Plugin Cleanup Evidence Contracts Phase 91 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared TypeScript contracts for Phase 89/90 plugin cleanup archive manifests and runner transcripts.

**Architecture:** Keep runtime scripts in CommonJS and add only shared compile-time contracts. The Phase 89 manifest script owns archive shape, the Phase 90 runner owns collector execution shape, and `src/shared/openpet-contracts.ts` mirrors those JSON boundaries so future UI/docs/tooling changes can type-check against them.

**Tech Stack:** TypeScript shared contracts, Node CommonJS release scripts, Node native tests, `tsc --noEmit` fixture validation.

---

### Task 1: Type Fixture RED

**Files:**
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [ ] **Step 1: Import missing contract names**

Add imports for `PluginCleanupEvidenceArchiveManifest`, `PluginCleanupEvidenceCollectorRun`, and `PluginCleanupEvidenceRunResult` from `src/shared/openpet-contracts.ts`.

- [ ] **Step 2: Add fixtures for the archive manifest and runner result**

Create literals that match real Phase 89/90 script output: archive file descriptions, evidence file hashes, validation summaries, collector run transcript, and full runner result.

- [ ] **Step 3: Run the typecheck and verify RED**

Run: `npm run typecheck`

Expected before implementation: FAIL with missing exported contract names.

### Task 2: Shared Contract Implementation

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Test: `tests/shared/openpet-contracts-type-fixture.ts`

- [ ] **Step 1: Add reusable cleanup validation summary types**

Model cleanup report validator output with `ok`, `errors`, `warnings`, and `summary` containing passed/total/cleanupReady.

- [ ] **Step 2: Add archive manifest contracts**

Define archive file, evidence file, collector summary, report snapshot, and top-level manifest interfaces matching `scripts/create-plugin-cleanup-evidence-archive-manifest.js`.

- [ ] **Step 3: Add runner contracts**

Define collector run transcript and top-level runner result interfaces matching `scripts/run-plugin-cleanup-evidence-collector.js`.

- [ ] **Step 4: Run the typecheck and verify GREEN**

Run: `npm run typecheck`

Expected: PASS.

### Task 3: Script Output Contract Coverage

**Files:**
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
- Test: `tests/release/plugin-cleanup-evidence-archive-manifest.test.js`
- Test: `tests/release/plugin-cleanup-evidence-runner.test.js`

- [ ] **Step 1: Ensure fixtures include generated-output edge cases**

Include pending readiness, a failed readiness validation warning, collector stdout/stderr paths, and recursive evidence file entries.

- [ ] **Step 2: Run targeted release tests**

Run: `node --test tests/release/plugin-cleanup-evidence-archive-manifest.test.js tests/release/plugin-cleanup-evidence-runner.test.js`

Expected: PASS.

### Task 4: Documentation And Review

**Files:**
- Create: `docs/phases/phase-91-plugin-cleanup-evidence-contracts.md`
- Create: `docs/reviews/phase-91-plugin-cleanup-evidence-contracts-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`

- [ ] **Step 1: Document the phase boundary**

Record that Phase 91 adds compile-time contracts only and does not change cleanup readiness, collector execution, or runtime guarantees.

- [ ] **Step 2: Run production review**

Run the production-code-quality-review helper and inspect the diff in checkpoint/deep mode for contract drift.

- [ ] **Step 3: Run verification**

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

Commit message: `feat(阶段91): add plugin cleanup evidence contracts`

