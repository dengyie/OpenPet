# M0 Documentation Debt Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Bring the M0 refactor documentation and task-card guidance into agreement with the verified `main` baseline and the audit recorded in issue #48.

**Architecture:** Treat `docs/refactor/07-spike.md` as the authoritative spike result matrix, align the surrounding architecture/roadmap/repo-state/handoff documents to those results, and make task-card/protocol links point to `main`. GitHub issues remain the agent interaction layer; this branch changes repository documentation only.

**Tech Stack:** Markdown documentation, existing Node native test runner, repository documentation drift checks, API contract checks.

## Global Constraints

- Development occurs only in this isolated worktree on `codex/m0-doc-debt-closure-v2`; never edit the primary `main` worktree.
- Preserve the verified M0 facts from issue #48: `main` `bbfdb096`, E1-E10 evidence, E7 3/4 expected red, E6 R20 mitigation, and G11 remaining.
- Do not claim M1-M3 completion; the original task-card scope remains 1/33 complete.
- Do not change `cat_anime/` material or runtime code for documentation-only debt.
- Keep task-card PR base and repository links on `main`.

---

### Task 1: Align authoritative M0 evidence and risk documents

**Files:**
- Modify: `docs/refactor/02-architecture.md`
- Modify: `docs/refactor/03-api-contract.md`
- Modify: `docs/refactor/07-spike.md`
- Modify: `docs/refactor/09-repo-state.md`
- Modify: `docs/refactor/14-handoff.md`

- [x] **Step 1: Correct packaging and security claims.** Update 02 architecture §6.5 to state that the backend runs from `app.asar.unpacked` and its JavaScript is readable; remove stale safeStorage/sqlite notes and repair the malformed §6.2 wording.
- [x] **Step 2: Record cold-start evidence.** Add the E5 sidecar first-line timings (`+569 ms` single-run and `+779 ms` shared-T0) to 03 API/cold-start accounting and define the 300 ms ready threshold origin as `fork -> Shell receives ready`.
- [x] **Step 3: Make spike instructions reflect the adopted fix.** In 07, remove the instruction to add backend files to `build.files`, mark `asarUnpack` as the adopted R20 mitigation, and retain the G11 file-backed WAL limitation.
- [x] **Step 4: Refresh repo-state truth.** In 09, remove “spike not run” escape-hatch wording, update version/change history to v1.3, restore G1 to pending with a link to T34/#45, and distinguish target G labels from gap G labels.
- [x] **Step 5: Refresh handoff truth.** In 14 §5, replace stale “all spikes pending” and `build.files` remediation text with the completed E3-E8 evidence, adopted `asarUnpack` decision, and remaining G11/document debt.
- [x] **Step 6: Review the six files for contradictory M0 claims.** Use `rg` to find `未跑`, stale branch names, `build.files`, and contradictory G1/G8 wording; resolve only claims covered by #48.

### Task 2: Update maintainer-facing index and task-card protocol

**Files:**
- Modify: `docs/refactor/README.md`
- Modify: `docs/refactor/00-START-HERE.md`
- Modify: `docs/refactor/08-agent-guide.md`
- Modify: `docs/refactor/10-tasks-m1.md`
- Modify: `docs/refactor/11-tasks-m1-http.md`
- Modify: `docs/refactor/12-tasks-m2.md`
- Modify: `docs/refactor/13-tasks-m3.md`
- Modify: `docs/refactor/AGENT-PROTOCOL.md`

- [x] **Step 1: Move the public baseline to main.** Update branch/PR-base references and current-progress pointers in the index, start-here, agent guide, task cards, and protocol to `main`.
- [x] **Step 2: Publish README v1.6 truth.** Record M0 as complete, link E1-E10 evidence and issue #48, state M1-M3 remain 1/33, and list G1/G11/document debt without claiming runtime completion.
- [x] **Step 3: Fix the M1 dependency diagram.** Make T04 explicitly depend on T01 and document the M1 spine: T01 → T02 → T06 → T07; T01 + T02 + T08 → T09 → T10/T11/T14/(T15-T19); T12 → T13. Add the T09 settings path ownership note.
- [x] **Step 4: Align agent protocol requirements.** Ensure the handback requires `card`, `branch`, `gates`, `assertions`, `doc-bugs`, `decisions`, and `questions`, with PR base `main` and no direct edits to authoritative docs by task agents.

### Task 3: Validate, commit, and hand back

**Files:**
- Test: repository documentation and test gates only

- [x] **Step 1: Run targeted documentation checks.** Run `npm run check:docs-drift`, `npm run check:api-contract`, and `npm run test:tools`.
- [x] **Step 2: Run syntax and native test gates.** Run `npm run check:node` and `npm test`; record any environment-only failures separately from regressions.
- [x] **Step 3: Inspect the diff.** Run `git diff --check`, verify no stale pre-`main` branch links remain in active docs, and confirm no runtime or `cat_anime/` files changed.
- [x] **Step 4: Commit the documentation batch.** Use a focused commit message such as `docs: close M0 refactor documentation debt`.
- [x] **Step 5: Push and open a PR against `main`.** Include issue #48 checklist references and a complete HANDBACK block; do not mark any item complete until CI is green.

### Task 4: Maintain GitHub tracking after merge

**External records:**
- Update: issue #48 checklist and audit comment
- Update: issue #41 handoff link/comment only when the repository PR is merged

- [x] **Step 1: Post the PR URL and exact scope to #48.** Distinguish repository-document changes from vault-only work.
- [ ] **Step 2: After CI and review, merge only into `main`.** Verify the merge SHA and remote CI result.
- [ ] **Step 3: Mark only the corresponding #48 checklist items complete.** Keep unresolved G1/G11/vault items unchecked.
- [ ] **Step 4: Add a concise #41 back-link.** Point agents to the updated `main` docs and #48 for acceptance debt; do not reintroduce hand-written progress counts.
