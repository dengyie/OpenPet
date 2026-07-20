# Quality-First Sprite Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This task is explicitly inline; do not dispatch subagents.

**Goal:** Replace the current Creator Studio image-generation core with a budget-feasible, candidate-comparing, anchor-grid, cross-action scale-profile pipeline that preserves every paid asset and stops at human review.

**Architecture:** `CreatorWorkflowService` remains the public workflow owner. New focused Creator Studio modules own immutable plans, motion presets, reference boards, deterministic processing, scale/component metrics, candidate storage, and action selection. `HatchPetAgentService` supplies bounded planning/evaluation calls; code computes every legal transition and quality gate. The old keyframe-parent row path is removed only after the new full-pet path and its checkpoints are verified.

**Tech Stack:** Electron main process, Node.js CommonJS, Sharp, React/TypeScript Control Center, Node native test runner, JSON artifacts under the host-owned run data directory.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/ff3f/OpenPet` on `codex/dev8`; do not touch `/Users/mango/project/codex/OpenPet` or any other worktree.
- Every real image request carries exactly one validated local reference image, uses `/images/edits`, and requests `n=1`.
- Provider visual prompts are compiled by `provider-image-prompt-compiler.js`; planner free text never reaches the image Provider.
- The canonical identity checkpoint is mandatory before any action Provider request.
- Three distinct canonical candidates require at most four dispatches; every action requires two distinct candidates, at most one duplicate replacement, and at most one repair dispatch.
- Default worst-case budget is 36 creative dispatches, 72 Provider HTTP calls, 34 planner calls, 68 evaluator calls, and `43_200_000` ms internal elapsed time.
- `FULL_PET_WORKFLOW_MAX_DURATION_MS` is `43_200_000`; Creator command timeout is `43_500_000`.
- `idle` is required. Optional actions may be omitted. A failed `idle` produces an asset-recovery bundle and is not importable as a runnable pet.
- `running-left` is a QA-gated framewise mirror only; mirror-ineligible asymmetric identities omit both directions pending human review.
- Visual pass/fail is code-computed from an immutable profile; model verdicts cannot approve, import, activate, or weaken a gate.
- Do not run real Provider generation, image viewing, GIF/contact-sheet inspection, or visual acceptance in this development task. The independent test task owns those checks.
- Focused unit tests are written and run during TDD; repository-wide verification is handed to the independent test task.
- Every task ends with a focused commit. Do not push or merge.

---

## File Map

| File | Responsibility |
| --- | --- |
| `examples/plugins/creator-studio/lib/full-pet-workflow-contract.js` | 12-hour internal deadline and lease timing constants |
| `examples/plugins/creator-studio/plugin.json` | 12-hour-plus-five-minute command watchdogs |
| `src/main/services/hatch-pet-agent-contracts.js` | Production execution mode, mandatory identity review, planner/evaluator budgets |
| `examples/plugins/creator-studio/lib/sprite-asset-plan.js` | Strict versioned plan, morphology, action policies, candidate budgets |
| `examples/plugins/creator-studio/lib/action-semantics.js` | Code-owned motion presets and exact frame plans |
| `examples/plugins/creator-studio/lib/action-sheet-layout.js` | Fixed grid mapping, unused cells, square character canvas contract |
| `examples/plugins/creator-studio/lib/character-anchor-grid.js` | Deterministic repeated canonical anchor sheets |
| `examples/plugins/creator-studio/lib/action-reference-board.js` | One 1536x1024 Provider conditioning board |
| `src/main/services/hatch-pet-sprite-review-board.js` | Fixed evaluator boards, region metadata, region-bound output |
| `examples/plugins/creator-studio/lib/sprite-frame-processor.js` | Exact split, alpha cleanup, reference-guided components, uniform scale/anchor |
| `examples/plugins/creator-studio/lib/character-scale-profile.js` | Morphology-specific measurements and immutable cross-action profile |
| `examples/plugins/creator-studio/lib/sprite-candidate-qa.js` | Candidate technical, identity, motion, scale, and semantic checks |
| `examples/plugins/creator-studio/lib/sprite-candidate-store.js` | Atomic candidate artifacts, hashes, revision/archive records |
| `src/main/services/hatch-pet-sprite-evaluator.js` | Structured evaluator schema and code-owned threshold gate |
| `examples/plugins/creator-studio/lib/quality-first-action-runner.js` | Distinct candidate pool, repair, selection, checkpoint result |
| `src/main/services/hatch-pet-agent-budget-ledger.js` | Provider/planner/evaluator/elapsed/cost reservations |
| `src/main/services/hatch-pet-agent-service.js` | Plan, evaluator, identity review, action decisions |
| `examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js` | Plan/profile/processor-bound reuse |
| `examples/plugins/creator-studio/lib/host-model-bridge.js` | Thin Creator/Provider integration calling focused runners |
| `examples/plugins/creator-studio/lib/backend-runner.js` | Durable state, lease, recovery, repair commands |
| `src/main/services/creator-workflow-service.js` | Public state, partial import, recovery bundle, progress |
| `src/shared/openpet-contracts.ts` | Renderer-safe plan/candidate/review/progress contracts |
| `src/shared/ipc-channels.js` / `.ts` | Identity acceptance, recovery export, candidate review channels |
| `src/main/ipc/register-creator-ipc.js` | Host-owned IPC handlers |
| `control-center-preload.js` | Renderer-safe Creator APIs |
| `src/control-center/src/hooks/useCreatorPane.ts` | Progress polling and action commands |
| `src/control-center/src/panes/CreatorPane.tsx` | Candidate comparison, identity review, failed assets, retries |
| `src/control-center/src/styles.css` | Review-board and candidate matrix layout |
| `docs/pet-character-generation.md` | Implemented current truth after cutover |

Tests mirror each production unit under `tests/examples`, `tests/services`, and `tests/control-center`.

## Task 1: Align the Runtime Budget And Execution Mode

**Files:**
- Modify: `examples/plugins/creator-studio/lib/full-pet-workflow-contract.js`
- Modify: `examples/plugins/creator-studio/plugin.json`
- Modify: `src/main/services/hatch-pet-agent-contracts.js`
- Create: `src/main/services/hatch-pet-agent-budget-ledger.js`
- Test: `tests/examples/creator-studio-full-pet-workflow-contract.test.js`
- Test: `tests/services/hatch-pet-agent-contracts.test.js`
- Test: `tests/services/hatch-pet-agent-budget-ledger.test.js`

**Interfaces:**
- `createBudgetLedger({ limits, startedAt, now }) -> ledger`
- `reserveProviderCall(ledger, { timeoutMs }) -> { ledger, reservationId }`
- `recordProviderCall(ledger, reservationId, result) -> ledger`
- `reservePlannerCall(ledger) -> ledger`
- `reserveEvaluatorCall(ledger) -> ledger`
- `assertPlanFitsBudget({ dispatchSlots, providerTimeoutMs, plannerCalls, evaluatorCalls, structuredTimeoutMs, processingReserveMs, elapsedLimitMs })`
- `createBudgetPublicView(ledger) -> renderer-safe view`

- [x] **Step 1: Write failing budget tests**

```js
test('accepts the quality-first worst-case budget', () => {
  assert.doesNotThrow(() => assertPlanFitsBudget({
    dispatchSlots: 36,
    providerTimeoutMs: 480000,
    plannerCalls: 34,
    evaluatorCalls: 68,
    structuredTimeoutMs: 60000,
    processingReserveMs: 1800000,
    elapsedLimitMs: 43200000
  }))
})

test('rejects an image timeout that cannot fit the run deadline', () => {
  assert.throws(
    () => assertPlanFitsBudget({ dispatchSlots: 36, providerTimeoutMs: 900000, plannerCalls: 34, evaluatorCalls: 68, structuredTimeoutMs: 60000, processingReserveMs: 1800000, elapsedLimitMs: 43200000 }),
    /generation_plan_budget_infeasible/
  )
})
```

- [x] **Step 2: Run the focused tests and verify the expected missing-interface failures**

Run: `node --test tests/examples/creator-studio-full-pet-workflow-contract.test.js tests/services/hatch-pet-agent-budget-ledger.test.js`

Expected: FAIL because the new budget constants and ledger exports do not exist.

- [x] **Step 3: Implement the exact deadline and ledger contract**

Set `FULL_PET_WORKFLOW_MAX_DURATION_MS = 43_200_000`, keep shutdown grace at `300_000`, and derive `FULL_PET_COMMAND_TIMEOUT_MS = 43_500_000`. Change Hatch Pet execution modes to `shadow` and `production`, default production quality mode to `requireIdentityReviewBeforeActions: true`, raise the elapsed upper bound to `43_200_000`, and add planner/evaluator call limits.

The ledger must atomically persist `budgets/ledger.json`, reserve before dispatch, reject exhausted elapsed/provider/planner/evaluator/cost budgets, and preserve usage after failures.

- [x] **Step 4: Run focused tests and commit**

Run: `node --test tests/examples/creator-studio-full-pet-workflow-contract.test.js tests/services/hatch-pet-agent-contracts.test.js tests/services/hatch-pet-agent-budget-ledger.test.js`

Expected: PASS with budget math `42_480_000 <= 43_200_000`.

Commit: `git add examples/plugins/creator-studio/lib/full-pet-workflow-contract.js examples/plugins/creator-studio/plugin.json src/main/services/hatch-pet-agent-contracts.js src/main/services/hatch-pet-agent-budget-ledger.js tests/examples/creator-studio-full-pet-workflow-contract.test.js tests/services/hatch-pet-agent-contracts.test.js tests/services/hatch-pet-agent-budget-ledger.test.js && git commit -m "feat enforce quality first generation budget"`

## Task 2: Add Strict Plan, Motion Preset, And Grid Contracts

**Files:**
- Create: `examples/plugins/creator-studio/lib/sprite-asset-plan.js`
- Modify: `examples/plugins/creator-studio/lib/action-semantics.js`
- Modify: `examples/plugins/creator-studio/lib/action-sheet-layout.js`
- Modify: `examples/plugins/creator-studio/lib/provider-image-task.js`
- Test: `tests/examples/creator-studio-sprite-asset-plan.test.js`
- Test: `tests/examples/creator-studio-action-semantics.test.js`
- Test: `tests/examples/creator-studio-action-sheet-layout.test.js`

**Interfaces:**
- `createSpriteAssetPlan(input) -> frozen plan`
- `expandMotionPreset({ actionId, motionPresetId, motionParameters, frameCount }) -> { framePlan, lockedParts, movingParts, semanticChecks, hash }`
- `getSpriteLayout(frameCount) -> { columns, rows, cellCount, unusedCells, canvas }`
- `assertPlanBudgetFeasible(plan, providerTimeoutMs) -> void`

- [x] **Step 1: Write failing strict-schema tests**

Cover unknown fields, wrong frame counts, free-form `framePoses`, unknown presets, invalid morphology, 4/5/6/8 frame geometry, and unused-cell metadata. Assert `running-left` is never a creative action job.

- [x] **Step 2: Run `node --test tests/examples/creator-studio-sprite-asset-plan.test.js tests/examples/creator-studio-action-semantics.test.js tests/examples/creator-studio-action-sheet-layout.test.js` and verify RED**

- [x] **Step 3: Implement frozen plan and code-owned presets**

Use the official rows from `full-pet-row-contract.js`. Add the eight preset IDs from the spec. The planner input contains only `motionPresetId` and bounded enums; the expanded frame plan is generated by code and hashed. Preserve the existing `buildActionFramePlan` behavior by moving its official phrases behind preset IDs, then delete free-form override input from production task construction.

Make `action-sheet-layout.js` return `unusedCells` and force square character canvas selection. `provider-image-task.js` accepts `anchorPolicy`, `actionClass`, `componentPolicy`, `effectPolicy`, `motionPresetId`, and `framePlanVersion` only through strict allowlists.

- [x] **Step 4: Run focused tests and commit**

Run the three focused suites again; expected PASS. Commit: `git add examples/plugins/creator-studio/lib/sprite-asset-plan.js examples/plugins/creator-studio/lib/action-semantics.js examples/plugins/creator-studio/lib/action-sheet-layout.js examples/plugins/creator-studio/lib/provider-image-task.js tests/examples/creator-studio-sprite-asset-plan.test.js tests/examples/creator-studio-action-semantics.test.js tests/examples/creator-studio-action-sheet-layout.test.js && git commit -m "feat add strict sprite asset and motion contracts"`

## Task 3: Build Reference And Evaluator Boards

**Files:**
- Create: `examples/plugins/creator-studio/lib/character-anchor-grid.js`
- Create: `examples/plugins/creator-studio/lib/action-reference-board.js`
- Create: `src/main/services/hatch-pet-sprite-review-board.js`
- Test: `tests/examples/creator-studio-character-anchor-grid.test.js`
- Test: `tests/examples/creator-studio-action-reference-board.test.js`
- Test: `tests/services/hatch-pet-sprite-review-board.test.js`

**Interfaces:**
- `createCharacterAnchorGrid({ masterPath, layout, outputPath, dataDir, planRevision }) -> { path, relativePath, sha256, regions }`
- `createActionReferenceBoard({ anchorGridPath, sourceDetailPath, outputPath, dataDir, metadata }) -> { path, relativePath, sha256, regions }`
- `createCanonicalEvaluatorBoard({ sourcePath, candidates, outputPath }) -> { path, regions, sha256 }`
- `createActionEvaluatorBoard({ sourcePath, canonicalPath, adjacentPath, candidateFrames, outputPath }) -> { path, regions, sha256 }`
- `validateEvaluationRegions({ evaluation, regions }) -> normalized evaluation`

- [x] **Step 1: Write failing geometry tests**

Use Sharp fixtures to assert exact 1024 square anchor grids, 1536x1024 Provider boards, 2048 square canonical evaluator boards, 2048x1536 action evaluator boards, region hashes, contain-fit, transparent unused cells, and unknown region rejection.

- [x] **Step 2: Run the three focused suites and verify RED**

- [x] **Step 3: Implement deterministic composition**

Anchor grids repeat the accepted master into used cells without labels. Provider boards place the 1024 anchor grid at `(0,0,1024,1024)` and normalized source detail at `(1024,0,512,1024)`. Evaluator boards use the exact spec coordinates and return region metadata with `regionId`, hash, coordinates, fit mode, and role. All temporary files are inside `dataDir` and are atomically renamed.

- [x] **Step 4: Run focused suites and commit**

Commit: `git add examples/plugins/creator-studio/lib/character-anchor-grid.js examples/plugins/creator-studio/lib/action-reference-board.js src/main/services/hatch-pet-sprite-review-board.js tests/examples/creator-studio-character-anchor-grid.test.js tests/examples/creator-studio-action-reference-board.test.js tests/services/hatch-pet-sprite-review-board.test.js && git commit -m "feat add deterministic sprite reference boards"`

## Task 4: Implement Reference-Guided Processing And Scale Profiles

**Files:**
- Create: `examples/plugins/creator-studio/lib/character-scale-profile.js`
- Create: `examples/plugins/creator-studio/lib/sprite-frame-processor.js`
- Create: `examples/plugins/creator-studio/lib/sprite-candidate-qa.js`
- Modify: `examples/plugins/creator-studio/lib/pet-generation-quality-profile.js`
- Test: `tests/examples/creator-studio-character-scale-profile.test.js`
- Test: `tests/examples/creator-studio-sprite-frame-processor.test.js`
- Test: `tests/examples/creator-studio-sprite-candidate-qa.test.js`

**Interfaces:**
- `createCharacterScaleProfile({ canonicalFrame, idleFrames, characterClass, anchorPolicy, processorVersion }) -> frozen profile`
- `measureBodyMask({ rgba, cell, canonicalProfile, characterClass }) -> metrics`
- `processSpriteSheet({ inputPath, outputDir, layout, profile, actionPolicy }) -> { frames, processedSheet, contactSheet, gif, metrics, hashes }`
- `analyzeSpriteCandidate({ actionId, frames, rawMetrics, profile, qualityProfile, evaluatorEvidence }) -> candidateQa`

- [x] **Step 1: Write failing metric and contamination tests**

Cover disconnected canonical tail/ear/accessory preservation, detached particle rejection, edge touch, paste clamp, empty cells, profile CV, compact baseline, elongated contact band, floating centroid, and jumping trajectory. Include fixtures where the largest component is not the full identity.

- [x] **Step 2: Run focused suites and verify RED**

- [x] **Step 3: Implement the processor**

Split exact cells, threshold alpha at 8, find 8-neighbor components, build the `reference-guided-body-v1` union using the canonical core/satellite rules, record unmatched components before removing residual noise, calculate distance-transform P75 thickness, normalized height/width/area, morphology-specific root, and raw pre-normalization drift. Apply one sheet-level scale, then one anchor translation per frame, and reject any clamp.

Extend quality profile v2 with `identity`, `groundedCompact`, `groundedElongated`, `floating`, `airborne`, `crossAction`, `atlas`, and `visual` groups. Preserve exact dataset binding and safe evidence paths.

- [x] **Step 4: Run focused suites and commit**

Commit: `git add examples/plugins/creator-studio/lib/character-scale-profile.js examples/plugins/creator-studio/lib/sprite-frame-processor.js examples/plugins/creator-studio/lib/sprite-candidate-qa.js examples/plugins/creator-studio/lib/pet-generation-quality-profile.js tests/examples/creator-studio-character-scale-profile.test.js tests/examples/creator-studio-sprite-frame-processor.test.js tests/examples/creator-studio-sprite-candidate-qa.test.js && git commit -m "feat add reference guided sprite processing and scale QA"`

## Task 5: Add Code-Owned Visual Evaluation

**Files:**
- Create: `src/main/services/hatch-pet-sprite-evaluator.js`
- Modify: `src/main/services/hatch-pet-agent-service.js`
- Modify: `examples/plugins/creator-studio/lib/pet-generation-quality-profile.js`
- Test: `tests/services/hatch-pet-sprite-evaluator.test.js`
- Test: `tests/services/hatch-pet-agent-service.test.js`

**Interfaces:**
- `validateSpriteEvaluation(value, { scope, regions }) -> evaluation`
- `evaluateVisualGate({ scope, scores, defects, profile, regions }) -> { ok, outcome, failures }`
- `createSpriteEvaluatorRequest({ scope, board, qa, profile }) -> structured request`
- `recordSpriteEvaluation({ dataDir, runId, scope, evaluation }) -> relative evidence path`

- [ ] **Step 1: Write failing threshold tests**

Assert that any below-threshold dimension, blocking defect, invalid score, low confidence, unknown region ID, or model-only `recommendation: pass` is rejected. Assert canonical/action/airborne/package profiles use their own minimums.

- [ ] **Step 2: Run focused suites and verify RED**

- [ ] **Step 3: Implement strict schema and gate**

The model returns only `recommendation`, bounded numeric scores, fixed defect records, and region IDs. The code derives `pass`, `repair`, `reject`, or `cannot-evaluate` from the immutable profile. Evaluation retries consume evaluator budget; an evaluator cannot mutate a plan, threshold, approval, or import status.

- [ ] **Step 4: Run focused suites and commit**

Commit: `git add src/main/services/hatch-pet-sprite-evaluator.js src/main/services/hatch-pet-agent-service.js examples/plugins/creator-studio/lib/pet-generation-quality-profile.js tests/services/hatch-pet-sprite-evaluator.test.js tests/services/hatch-pet-agent-service.test.js && git commit -m "feat enforce code owned sprite visual gates"`

## Task 6: Add Candidate Store And Quality-First Action Runner

**Files:**
- Create: `examples/plugins/creator-studio/lib/sprite-candidate-store.js`
- Create: `examples/plugins/creator-studio/lib/quality-first-action-runner.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js`
- Test: `tests/examples/creator-studio-sprite-candidate-store.test.js`
- Test: `tests/examples/creator-studio-quality-first-action-runner.test.js`
- Test: `tests/examples/creator-studio-full-pet-action-checkpoints.test.js`

**Interfaces:**
- `writeCandidateRecord({ dataDir, runId, scope, candidate }) -> record`
- `archiveCandidateRevision({ dataDir, runId, scope, reason }) -> archivePath`
- `selectBestPassingCandidate({ candidates, visualProfile }) -> candidate`
- `runQualityFirstAction({ context, generateCandidate, processCandidate, evaluateCandidate }) -> actionResult`
- `resolveReusableActionResult({ dataDir, runId, actionId, planHash, canonicalHash, profileHash, processorVersion }) -> result|null`

- [ ] **Step 1: Write failing candidate lifecycle tests**

Cover two distinct candidates, duplicate replacement, one repair only, best passing selection, no singleton acceptance, atomic archives, safe paths, and checkpoint invalidation when plan/canonical/profile/processor hashes differ.

- [ ] **Step 2: Run focused suites and verify RED**

- [ ] **Step 3: Implement bounded runner**

The runner reserves a creative slot before every dispatch, preserves raw and processed artifacts for every candidate, performs duplicate detection before evaluation, evaluates both distinct initial candidates, selects only code-computed passing candidates, and records a fixed reason when the action is omitted or idle blocks the run. It emits `action_candidate_diversity_insufficient` when two distinct candidates cannot be obtained and never accepts the remaining singleton.

- [ ] **Step 4: Run focused suites and commit**

Commit: `git add examples/plugins/creator-studio/lib/sprite-candidate-store.js examples/plugins/creator-studio/lib/quality-first-action-runner.js examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js tests/examples/creator-studio-sprite-candidate-store.test.js tests/examples/creator-studio-quality-first-action-runner.test.js tests/examples/creator-studio-full-pet-action-checkpoints.test.js && git commit -m "feat add bounded sprite candidate runner"`

## Task 7: Replace Host Generation With Canonical Review And Full-Pet Action Orchestration

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify: `examples/plugins/creator-studio/lib/run-store.js`
- Modify: `src/main/services/hatch-pet-agent-service.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Test: `tests/examples/creator-studio-host-model-bridge.test.js`
- Test: `tests/examples/creator-studio-backend-runner-anchor-artifacts.test.js`
- Test: `tests/services/creator-workflow-service.test.js`

**Interfaces:**
- `generateCanonicalCandidatePool({ dataDir, run, plan, sourceReference, budget }) -> candidatePool`
- `acceptCanonicalIdentity({ dataDir, runId, candidateId, expectedHash }) -> run`
- `generateSelectedFullPetAction({ dataDir, run, actionId, plan, canonical, profile, budget }) -> actionResult`
- `recoverStaleGeneratingRun(...) -> run`
- `createCreatorProgressView(run) -> renderer-safe progress`

- [ ] **Step 1: Write failing orchestration tests**

Assert no action Provider call before identity acceptance; accepted idle locks the profile before the next action; optional action failure preserves later actions; idle failure produces recovery-only status; stale run recovery retains candidates/checkpoints; running-left never dispatches independently.

- [ ] **Step 2: Run focused suites and verify RED**

- [ ] **Step 3: Implement the new host path**

Reduce `host-model-bridge.js` to source validation, model selection, Provider invocation, evidence, and calls into the focused runners. Use one action reference board per creative request. Keep exact-one-reference and actual-output-count gates at the host boundary. Add durable `awaiting_identity_review`, identity acceptance/retry, idle-first queue, profile lock, action checkpoints, repair archives, lease heartbeat, stale recovery, and partial/recovery result classification.

- [ ] **Step 4: Run focused orchestration suites and commit**

Commit: `git add examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/backend-runner.js examples/plugins/creator-studio/lib/run-store.js src/main/services/hatch-pet-agent-service.js src/main/services/creator-workflow-service.js tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-backend-runner-anchor-artifacts.test.js tests/services/creator-workflow-service.test.js && git commit -m "feat route creator workflow through quality first pipeline"`

## Task 8: Expose Identity Review, Candidate Evidence, And Recovery UX

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc/register-creator-ipc.js`
- Modify: `control-center-preload.js`
- Modify: `src/control-center/src/hooks/useCreatorPane.ts`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Modify: `src/control-center/src/styles.css`
- Test: `tests/control-center/creator-pane-copy.test.js`
- Test: `tests/control-center/creator-pane-quality-review.test.js`

**Interfaces:**
- IPC `creator:accept-identity({ runId, candidateId, sha256 })`
- IPC `creator:retry-identity({ runId })`
- IPC `creator:export-recovery-bundle({ runId })`
- API `acceptCreatorIdentity`, `retryCreatorIdentity`, `exportCreatorRecoveryBundle`
- Public views never include absolute paths, secrets, raw Provider payloads, or unbounded prompt text.

- [ ] **Step 1: Write failing UI contract tests**

Assert the Create pane renders `awaiting_identity_review`, candidate cards, scores, reject reasons, accept/retry controls, action progress, failed assets, recovery export, and explicit non-previewable/importable messages.

- [ ] **Step 2: Run focused UI contract tests and verify RED**

- [ ] **Step 3: Implement contracts, IPC, preload, hook, and pane**

Identity acceptance must require candidate hash equality and an eligible candidate. Buttons must report disabled reasons. Progress must show the current stage, action, candidate count, attempt count, selected model, failure code, next action, and retained assets. The review bench must keep failed raw/clean/processed assets visible.

- [ ] **Step 4: Run focused UI tests and commit**

Commit: `git add src/shared/openpet-contracts.ts src/shared/ipc-channels.js src/shared/ipc-channels.ts src/main/ipc/register-creator-ipc.js control-center-preload.js src/control-center/src/hooks/useCreatorPane.ts src/control-center/src/panes/CreatorPane.tsx src/control-center/src/styles.css tests/control-center/creator-pane-copy.test.js tests/control-center/creator-pane-quality-review.test.js && git commit -m "feat expose quality first creator review workflow"`

## Task 9: Cut Over, Remove Obsolete Generation Paths, And Refresh Live Documentation

**Files:**
- Modify: `examples/plugins/creator-studio/lib/action-frame-builder.js`
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-row-jobs.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-basic-actions.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-row-preview-artifacts.js`
- Delete only after caller search: obsolete action start/peak keyframe branches and duplicate layout/role adapters
- Modify: `docs/pet-character-generation.md`
- Test: all affected `tests/examples/creator-studio-*` suites

**Interfaces:**
- Production full-pet generation has exactly one path: plan -> canonical candidates -> identity review -> anchor grid -> idle/profile -> action candidates -> atlas review.
- No production caller remains for separate action start/peak keyframe generation.

- [ ] **Step 1: Write caller-absence and live-doc tests**

Assert the new production path is selected, obsolete keyframe commands cannot be dispatched, and current docs describe the mandatory identity review, budgets, evidence, and failure behavior.

- [ ] **Step 2: Run the affected suites and verify RED where old callers remain**

- [ ] **Step 3: Remove only proven-dead branches**

Search `rg` for every removed export and role string. Migrate unrelated single-action callers before deletion. Remove obsolete tests and fixtures only when their target behavior is represented by new candidate/processor tests. Do not delete a module merely because its old name appears in the design.

- [ ] **Step 4: Update `docs/pet-character-generation.md` and commit**

Commit: `git add -u examples/plugins/creator-studio docs/pet-character-generation.md tests/examples && git commit -m "refactor remove obsolete creator generation path"`

## Task 10: Development Verification And Independent Test Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-20-quality-first-sprite-generation-pipeline.md`
- Create: `docs/superpowers/plans/2026-07-20-quality-first-sprite-generation-test-handoff.md`
- Create/modify: focused test reports only; no real Provider secrets or image outputs in this branch.

- [ ] **Step 1: Run focused development verification**

Run the focused suites introduced by Tasks 1-9 and `git diff --check`. Do not run real Provider generation or visual inspection.

- [ ] **Step 2: Record exact known gaps**

The handoff must state that repository-wide `npm run check:syntax`, `npm run test:core`, `npm run test:control-center`, and `npm run test:core:all` belong to the independent test task, as do real Provider request evidence, candidate visual comparison, GIF/contact-sheet/atlas review, human identity approval rehearsal, partial import, and recovery export.

- [ ] **Step 3: Commit the handoff**

Commit: `git add docs/superpowers/plans/2026-07-20-quality-first-sprite-generation-test-handoff.md docs/superpowers/plans/2026-07-20-quality-first-sprite-generation-pipeline.md && git commit -m "docs hand off quality first sprite verification"`

## Self-Review Checklist

- [ ] Every spec section maps to one or more tasks above.
- [ ] Budget arithmetic is implemented and tested before any Provider path changes.
- [ ] No planner free text reaches the image compiler.
- [ ] No action generation occurs before canonical identity acceptance.
- [ ] Visual model recommendations are always recomputed by code thresholds.
- [ ] Raw component failures cannot be hidden by cleanup.
- [ ] Every accepted action is bound to plan, canonical, scale profile, processor, and quality-profile hashes.
- [ ] Failed and paid assets remain reviewable and exportable.
- [ ] The old path is removed only after a caller search and focused regression coverage.
- [ ] Real Provider and visual verification remain in the independent test handoff.
