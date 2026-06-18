# macOS Release Evidence Contracts Phase 92 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared TypeScript contracts for macOS release evidence summary and artifact archive outputs.

**Architecture:** Keep the existing CommonJS release scripts unchanged at runtime and extend `src/shared/openpet-contracts.ts` to mirror their JSON output shapes. Phase 77 owns macOS evidence summary generation, Phase 79 owns artifact archive manifests, and the shared contracts become the compile-time gate that keeps docs, fixtures, and future consumers aligned.

**Tech Stack:** TypeScript shared contracts, Node CommonJS release scripts, Node native tests, `tsc --noEmit` fixture validation.

---

### Task 1: Type Fixture RED

**Files:**
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [ ] **Step 1: Import the missing macOS evidence contract names**

Add imports for `MacosReleaseEvidenceSummary`, `MacosReleaseEvidenceCommand`, and `MacosReleaseEvidenceArtifactArchiveManifest` from `src/shared/openpet-contracts.ts`.

- [ ] **Step 2: Add representative Phase 77/79 fixtures**

Create fixtures that match the real script outputs: macOS evidence status summary, evidence file hashes, command transcripts, archive provenance, and warning wording.

- [ ] **Step 3: Run the typecheck and verify RED**

Run: `npm run typecheck`

Expected before implementation: FAIL with missing exported contract names.

### Task 2: Shared Contract Implementation

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Test: `tests/shared/openpet-contracts-type-fixture.ts`

- [ ] **Step 1: Add macOS evidence summary contracts**

Define interfaces for command captures, statuses, file paths, evidence file descriptions, and the top-level Phase 77 summary.

- [ ] **Step 2: Add artifact archive manifest contracts**

Define the Phase 79 archive manifest shape, including source provenance, archived files, per-file readiness statuses, and warnings.

- [ ] **Step 3: Run the typecheck and verify GREEN**

Run: `npm run typecheck`

Expected: PASS.

### Task 3: Runtime-Test Alignment

**Files:**
- Test: `tests/release/create-macos-release-evidence.test.js`
- Test: `tests/release/create-macos-release-evidence-archive.test.js`

- [ ] **Step 1: Run targeted macOS evidence tests**

Run: `node --test tests/release/create-macos-release-evidence.test.js tests/release/create-macos-release-evidence-archive.test.js`

Expected: PASS.

### Task 4: Documentation And Review

**Files:**
- Create: `docs/phases/phase-92-macos-release-evidence-contracts.md`
- Create: `docs/reviews/phase-92-macos-release-evidence-contracts-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`

- [ ] **Step 1: Document the new TypeScript boundary**

Record that Phase 92 adds compile-time contracts for Phase 77/79 output artifacts without changing readiness rules or platform claims.

- [ ] **Step 2: Run production review**

Use the production review workflow in deep mode for the current diff.

- [ ] **Step 3: Run full verification**

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

Commit message: `feat(阶段92): add macos release evidence contracts`

