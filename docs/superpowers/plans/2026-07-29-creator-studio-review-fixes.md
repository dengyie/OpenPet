# Creator Studio Review Fixes Implementation Plan

> **For agentic workers:** Execute each checkbox in order in the isolated `codex/dev8-review-fixes` worktree. Do not merge or push `main`.

**Goal:** Preserve the complete action-candidate decision contract through generation and retain paid action evidence safely when a newly selected idle invalidates the old scale profile.

**Architecture:** Candidate decisions remain host-owned: the orchestrator writes a safe, bounded run view; the backend rereads the retained candidate record and verifies path, hash, technical eligibility, plan/canonical/profile bindings, and the current asset before accepting. Idle replacement keeps non-idle evidence but converts dependent results to an explicit stale state that the renderer-safe workflow view derives from current record bindings.

**Tech Stack:** Node.js native test runner, Electron main-process JavaScript, React/TypeScript Control Center.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/dev8-review-fixes/OpenPet` on `codex/dev8-review-fixes` from baseline `2c5a933a`.
- Do not weaken path, hash, technical-eligibility, asset, or binding checks.
- Keep candidate decisions at the Creator Studio host boundary; renderer code only displays and submits confirmation.
- Preserve navigation-lock, SSE parsing, and cursor concurrency regressions.
- Do not merge or push `main`.

---

### Task 1: Unify the generated action-candidate view contract

**Files:**
- Modify: `tests/examples/creator-studio-quality-first-full-pet-orchestrator.test.js`
- Modify: `tests/examples/creator-studio-backend-runner-quality-first.test.js`
- Modify: `examples/plugins/creator-studio/lib/quality-first-full-pet-orchestrator.js`

**Interfaces:**
- Consumes: retained candidate records written by `writeCandidateRecord`.
- Produces: `qualityFirst.actionResults[actionId].candidates[]` with bounded `sha256`, `technicalEligible`, `recommended`, `technicalFailureCodes`, `qualityWarningCodes`, and a safe `candidateRecordRelativePath`.

- [x] Add an orchestrator regression proving decision fields survive while absolute paths, prompt contents, artifacts, and arbitrary private fields do not.
- [x] Add a full generation-result → `run.json` → `acceptQualityFirstActionCandidate` regression using a real retained record.
- [x] Run both focused tests and capture the expected hash/technical-eligibility failures.
- [x] Make `publicActionResult` use the same normalized candidate-decision contract as the backend view.
- [x] Rerun both regressions and confirm the generated result reaches materialization without weakening backend validation.

### Task 2: Preserve stale paid candidates across idle replacement

**Files:**
- Modify: `tests/examples/creator-studio-backend-runner-quality-first.test.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify: `tests/services/creator-workflow-service.test.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `tests/control-center/creator-pane-quality-review.test.js`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`

**Interfaces:**
- Produces: invalidated non-idle results with `ok: false`, `disposition: "invalidated"`, `failureCode: "candidate-binding-stale"`, no selected candidate/selection, and preserved candidate evidence.
- Consumes: current plan/canonical/profile binding hashes; stale candidates remain disabled unless a future host-side reprocessing flow creates current verified records.

- [x] Change the idle success and rebuild-failure tests to require all non-idle candidates/evidence to remain and old success/selection/package state to be cleared.
- [x] Add renderer-safe diagnostics assertions for preserved candidates and the concrete `candidate-binding-stale` technical reason.
- [x] Add renderer source coverage requiring the action-level stale reason to be shown.
- [x] Run the focused tests and capture deletion/misleading-state failures.
- [x] Add one minimal backend invalidation projection and apply it before the lease is persisted and after successful rebuild.
- [x] Ensure an explicit `selection: null` suppresses any stale candidate-record selection in the workflow view.
- [x] Render the action result failure code next to its retained candidate group.
- [x] Rerun the focused backend, workflow-service, and renderer tests.

### Task 3: Verify and commit the isolated branch

**Files:**
- Verify only the files listed in Tasks 1–2 plus this plan.

- [x] Run the two user-specified focused test groups.
- [x] Run `npm run check:syntax`, `npm run test:core:all`, `npm run test:tools`, and `git diff --check`.
- [x] Inspect status/diff, confirm `node_modules` is not staged, and verify no unrelated files changed.
- [ ] Commit on `codex/dev8-review-fixes` with a clear message.
- [ ] Report commit hash, changed files, logic, exact test counts, and residual risks without merging or pushing main.
