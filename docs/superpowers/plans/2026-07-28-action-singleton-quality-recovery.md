# Action Singleton Quality Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue action generation from the best fully passing paid candidate even when the candidate pool lacks diversity, without weakening any quality gate.

**Architecture:** Change the action runner so duplicate detection annotates comparison evidence but does not prevent processing or evaluation. The Host action generator consumes dispatch metadata to compile registered identity-safe prompt variants. Existing deterministic QA and evaluator gates remain the sole acceptance authority.

**Tech Stack:** Node.js, CommonJS, Node native test runner, Creator Studio quality-first runtime.

## Global Constraints

- Never silently select one output from a Provider multi-output response.
- Never lower deterministic QA or evaluator thresholds.
- Every paid output remains retained as review evidence.
- Only registered visual directives may enter Provider prompts.
- Work only on `codex/dev8`; do not modify the protected main worktree.

---

### Task 1: Action runner singleton recovery

**Files:**
- Modify: `tests/examples/creator-studio-quality-first-action-runner.test.js`
- Modify: `examples/plugins/creator-studio/lib/quality-first-action-runner.js`

**Interfaces:**
- Consumes: `generateCandidate`, `processCandidate`, `evaluateCandidate`, and `selectBestPassingCandidate`.
- Produces: action results with `diversityStatus`, `warningCodes`, `distinctCandidateCount`, and `evaluatedCandidateCount`.

- [x] Add a regression test where one distinct candidate and one duplicate both enter processing/evaluation and the passing candidate is selected with degraded-diversity evidence.
- [x] Run the focused runner test and confirm it fails because the current implementation returns `action_candidate_diversity_insufficient` before processing.
- [x] Move processing/evaluation ahead of the diversity terminal return, retain duplicate annotations, and select from every evaluated candidate.
- [x] Preserve the bounded reason-directed repair when no candidate passes.
- [x] Run the focused runner suite and confirm all cases pass.

### Task 2: Dispatch-specific action prompts

**Files:**
- Modify: `tests/examples/creator-studio-host-model-bridge-quality-first.test.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`

**Interfaces:**
- Consumes: runner dispatch input `{ attemptKind, dispatchIndex, failureCodes }`.
- Produces: `strategyId` and bounded `requestedChanges` on each `ProviderImageTask`.

- [x] Add a regression test proving the two initial prompts and duplicate-replacement prompt have different hashes and registered strategy IDs.
- [x] Run the focused Host test and confirm it fails because the current generator ignores dispatch metadata.
- [x] Add a small registered action prompt-strategy resolver and pass its output to `createProviderImageTask`.
- [x] Map only known quality failure codes into reason-directed visual changes.
- [x] Run the focused Host suite and confirm it passes.

### Task 3: Documentation and verification

**Files:**
- Modify: `docs/pet-character-generation.md`
- Modify: `docs/superpowers/specs/2026-07-20-quality-first-sprite-generation-pipeline-design.md`
- Modify: `docs/superpowers/plans/2026-07-20-quality-first-sprite-generation-pipeline.md`

**Interfaces:**
- Produces: one consistent current action candidate contract.

- [x] Replace the obsolete prohibition on singleton acceptance with the approved degraded-diversity rule.
- [x] Run the two focused Creator Studio suites.
- [x] Run `npm run check:syntax`.
- [x] Run `npm run test:core`.
- [x] Inspect `git diff --check` and the final diff.
- [ ] Commit the verified change on `codex/dev8`.
