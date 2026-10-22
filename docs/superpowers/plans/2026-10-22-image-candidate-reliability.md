# Image Candidate Reliability Implementation Plan

> **For agentic workers:** Execute this plan in the current isolated worktree and verify each task before continuing.

**Goal:** Prevent duplicate image-generation charges after ambiguous failures and preserve generated Web reference candidates across refresh while reclaiming stale files.

**Architecture:** Keep provider-request policy in the existing image model service. Persist only Web candidate job metadata in tab-scoped session storage, then reconstruct previews from the Backend Job result after login. Through the existing Backend maintenance timer, remove only unreferenced image files older than 30 days from real, strictly named `image-generate:<UUID>` output directories.

**Tech Stack:** Node.js native test runner, TypeScript/React, existing Backend filesystem and job APIs.

## Global Constraints

- Work only in the isolated `codex/image-retry-candidate-lifecycle` worktree.
- Do not launch Electron or perform acceptance testing on the user's workstation.
- Preserve Provider keys and uploaded image bytes outside browser storage.
- Do not remove `cat_anime/` material or unrelated generated files.

---

### Task 1: Make image generation requests non-retrying after ambiguous outcomes

**Files:**
- Modify: `apps/desktop/src/services/image-generation-model-service.js`
- Test: `tests/services/image-generation-model-service.test.js`

**Interfaces:** Provider errors from ambiguous network, timeout, and transient HTTP outcomes must not trigger another POST or model fallback. A fallback may run only after an explicit HTTP rejection in the bounded set 400, 404, or 422.

- [x] Replace retry-success tests with assertions that one ambiguous failure makes exactly one request and fails.
- [x] Change the existing fallback test to use an explicit 404 rejection and verify the alternate model still succeeds.
- [x] Remove the same-model retry loop and gate model fallback on explicit rejected status codes.
- [x] Run the focused image model service tests.

### Task 2: Restore Web candidate state and retain files for a bounded period

**Files:**
- Modify: `apps/web-control/src/main.tsx`
- Modify: `services/backend/domains/ai/image-generation.js`
- Modify: `services/backend/domains/creator/index.js`
- Modify: `services/backend/index.js`
- Modify: `services/backend/routes/health.js`
- Test: `tests/web-control/api.test.js`, `tests/backend/t46-image-jobs.test.js`, `tests/backend/creator-domain.test.js`, and `tests/backend/health-routes.test.js`

**Interfaces:** Session state contains only the candidate Job ID, prompt snapshot, and selected relative path. After login, the UI fetches the Job and its previews. Backend cleanup removes only real directories matching the generated image Job ID format whose directory mtime exceeds 30 days.

- [x] Add regressions for restoring a completed candidate Job and for retaining fresh files while pruning only stale matching image directories.
- [x] Restore the prompt and selected candidate from session storage after login, re-fetching candidate bytes from the authenticated preview API.
- [x] Add a 30-day cleanup method and invoke it through the existing hourly Backend cleanup timer. Cleanup is file-by-file, restricted to real UUID image Job directories, and preserves hashes referenced by Creator runs.
- [x] Bind pending image submissions and Creator Job responses to the authenticated Web session revision. Logout invalidates outstanding responses and busy-state ownership so an older request cannot repopulate or alter the next session.
- [x] Run focused Backend and Web tests and build the Web control bundle. Web API regressions pass 12/12, image model service tests 75/75, and focused Creator/health/image Backend tests 34/34; the Web Control production bundle builds successfully. Repository-wide `test:backend` reports 437/438 because the reused dependency tree lacks `eventsource-parser`; `test:core` reports 2,123/2,208 passing, 69 failing, and 15 canceled with the same incomplete dependency tree. Root typecheck is blocked by the absent `valibot` package and has cascading unrelated errors; no diagnostics remain in the modified Web Control files.

### Task 3: Review the final change set

**Files:** All files listed above.

- [x] Inspect `git diff --check` and the complete diff for scope, path-safety, and encoding.
- [x] Run the relevant regression suites and report any environment limitation without claiming unverified behavior.
