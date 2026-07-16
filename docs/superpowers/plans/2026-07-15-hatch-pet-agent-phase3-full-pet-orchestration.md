# Hatch-Pet Agent Phase 3 Full-Pet Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend bounded hatch-pet execution from identity/single-action scope to complete full-pet generation, model switching, optional action omission, package evaluation, durable resume, and final human review.

**Architecture:** Keep Creator Studio checkpoints and atlas composition authoritative. Add an agent-owned full-pet ledger that advances one official action scope at a time, validates every model switch, combines deterministic and visual gates, and reuses hash-valid successful rows. Final package evaluation stops at `ready_for_review`.

**Tech Stack:** Electron main process, Node.js CommonJS, Creator Studio checkpoint/repair modules, Sharp review boards, React/TypeScript Control Center, JSON/JSONL provenance.

## Global Constraints

- Phase 2 implementation and isolated verification must pass before starting.
- The command-timeout/lease prerequisite from Provider reliability report commit `4ac47213` must be verified before any full-pet Agent run.
- Work only in the assigned isolated development worktree; preserve commits and do not push or merge.
- Do not run tests, builds, Provider calls, browser checks, image generation, or visual acceptance on the development branch.
- Every identity, keyframe, action-row, retry, fallback, and repair image request must carry exactly one validated local reference image and request exactly one output.
- Every upstream image prompt must be compiled through the provider-neutral typed task compiler with explicit dimensions/aspect ratio; no raw Hatch Pet prompt text may reach the image service.
- Models without image-conditioned/edit capability are ineligible, and no failure path may fall back to text-only generation.
- Real Provider and image evaluation belong to the Phase 4 isolated testing task using fresh one-shot image subagents.
- Code QA and model evaluation must both pass; neither may weaken the other.
- `idle` is required and blocks packaging when exhausted.
- Optional actions are omitted after three attempts; they are never filled with copied `idle` or transform-only art.
- `running-left` remains a QA-gated framewise mirror of `running-right` and never receives its own Provider request.
- Model choices are limited to host-supplied eligible candidates. Every successful generation model is recorded.
- Budgets are code-owned and cannot be expanded by the model.
- Final output stops at human review; no auto-approval, import, activation, Provider approval, or production-art claim.
- Every task ends in a focused commit. Do not push.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/main/services/hatch-pet-agent-full-pet.js` | Full-pet state transitions, action queue, required/optional policy, checkpoint reuse |
| `src/main/services/hatch-pet-agent-budget-ledger.js` | Run/scope attempts, Provider calls, elapsed time, cost estimates, immutable snapshots |
| `src/main/services/hatch-pet-agent-provenance.js` | Successful Provider/model/profile/dataset tuples and approval-readiness evidence |
| `src/main/services/hatch-pet-agent-service.js` | Full-pet planner/evaluator orchestration |
| Creator Studio checkpoint/bridge/backend modules | Selected action execution and reuse of valid rows |
| `src/main/services/creator-workflow-service.js` | Start/pause/resume/cancel/review public flow |
| Shared IPC/contracts/Control Center | Full-pet progress, budgets, omitted actions, controls, final review |

---

### Task 1: Add Full-Pet Budget Ledger

**Files:**
- Create: `src/main/services/hatch-pet-agent-budget-ledger.js`
- Modify: `src/main/services/hatch-pet-agent-store.js`

**Interfaces:**
- Produces: `createBudgetLedger(config, startedAt)`, `reserveActionAttempt`, `recordProviderCall`, `recordModelUsage`, `recordEstimatedCost`, `assertBudgetAvailable`, and `createBudgetPublicView`.

- [ ] **Step 1: Define immutable ledger shape**

```js
{
  version: 1,
  startedAt,
  limits: {
    maxIdentityRegenerations,
    maxActionAttemptsPerAction,
    maxEvaluationAttemptsPerArtifact,
    maxProviderCalls,
    maxElapsedMs,
    maxEstimatedCost
  },
  usage: {
    identityRegenerations: 0,
    actionAttempts: {},
    evaluationAttempts: {},
    providerCalls: 0,
    plannerCalls: 0,
    evaluatorCalls: 0,
    estimatedCost: 0,
    costKnown: true
  }
}
```

Every update returns a new object and writes `agent/budgets.json` atomically.

- [ ] **Step 2: Define reservation semantics**

- reserve an action attempt before its first image request;
- lower-level transient retries increase Provider calls but not action attempts;
- evaluation retries increase evaluator count and scope evaluation attempts, not action attempts;
- cost updates accept non-negative finite values only;
- any unknown Provider price sets `costKnown=false` without inventing a cost;
- elapsed budget compares current time with `startedAt` before every model or Provider call.

- [ ] **Step 3: Fail before exceeding limits**

Throw fixed codes:

```text
hatch_pet_action_attempt_budget_exhausted
hatch_pet_provider_call_budget_exhausted
hatch_pet_elapsed_budget_exhausted
hatch_pet_cost_budget_exhausted
hatch_pet_evaluation_budget_exhausted
```

The model receives remaining counts but cannot write the ledger.

- [ ] **Step 4: Inspect and commit Task 1**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-budget-ledger.js src/main/services/hatch-pet-agent-store.js
git add src/main/services/hatch-pet-agent-budget-ledger.js src/main/services/hatch-pet-agent-store.js
git commit -m "feat add hatch pet budget ledger"
```

---

### Task 2: Add Full-Pet Action Queue And Checkpoint Reuse

**Files:**
- Create: `src/main/services/hatch-pet-agent-full-pet.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`

**Interfaces:**
- Produces: `createFullPetAgentState`, `getNextFullPetScope`, `applyFullPetScopeResult`, `createFullPetActionQueue`, and Creator Studio action-subset execution.

- [ ] **Step 1: Define the official queue**

Use current row contracts to produce generation jobs in this order:

```js
[
  'idle',
  'running-right',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review'
]
```

`running-left` is not a generation job. It becomes available only through the existing approved mirror path.

- [ ] **Step 2: Define durable full-pet state**

```js
{
  version: 1,
  stage: 'identity' | 'actions' | 'package' | 'ready_for_review' | 'failed' | 'paused' | 'cancelled',
  actionQueue: [],
  currentActionId: '',
  actions: {
    [actionId]: {
      status: 'pending' | 'generating' | 'passed' | 'omitted' | 'failed',
      attemptsUsed: 0,
      checkpointRelativePath: '',
      codeQaRelativePath: '',
      evaluationRelativePath: '',
      omissionReasonCode: ''
    }
  }
}
```

- [ ] **Step 3: Reuse only hash-valid passed checkpoints**

Before planning an action, call current checkpoint validation. A checkpoint is reusable only when:

- status/quality is passed;
- every frame path is inside the run data directory;
- hashes match;
- active quality profile evidence matches;
- canonical identity hash matches the current identity;
- action model provenance remains available.

Reuse writes a decision result `reused-checkpoint` and consumes no action attempt or Provider call.

- [ ] **Step 4: Add action-subset execution interface**

Expose through backend runner/host bridge:

```js
generateAgentSelectedFullPetAction({
  dataDir,
  runId,
  actionId,
  imageModel,
  agentStrategy,
  decisionId,
  budgetDeadlineMs
})
```

Reject `running-left`, unknown actions, stale identity hashes, unsafe strategies, or unavailable models. Return generated row/checkpoint/QA/provenance without composing or approving the final package.

- [ ] **Step 5: Apply required/optional failure policy**

- passed combined gate -> `passed`;
- attempts remain -> return to planner;
- `idle` exhausted -> full-pet `failed` with `required_idle_budget_exhausted`;
- optional exhausted -> `omitted` with fixed reason code and continue;
- `running-right` omission also records `running-left` omitted due to atomic pair.

- [ ] **Step 6: Inspect and commit Task 2**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-full-pet.js examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js examples/plugins/creator-studio/lib/backend-runner.js examples/plugins/creator-studio/lib/host-model-bridge.js
git add src/main/services/hatch-pet-agent-full-pet.js examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js examples/plugins/creator-studio/lib/backend-runner.js examples/plugins/creator-studio/lib/host-model-bridge.js
git commit -m "feat add bounded full pet action queue"
```

---

### Task 3: Execute Planner Decisions And Model Switching Per Action

**Files:**
- Modify: `src/main/services/hatch-pet-agent-service.js`
- Modify: `src/main/services/hatch-pet-agent-model-candidates.js`
- Modify: `src/main/services/hatch-pet-agent-store.js`
- Modify: `src/main/services/creator-workflow-service.js`

**Interfaces:**
- Produces: `runFullPetAgent({ runId, userIntent })` and `runNextFullPetAgentStep({ runId })`.

- [ ] **Step 1: Build per-action decision snapshots**

Include only:

- canonical identity descriptor/hash;
- current action contract;
- latest three attempt summaries for this action;
- current code QA/model evaluation reason codes;
- eligible image models and recent bounded outcomes;
- remaining scope/run budgets;
- legal decisions.

Do not include other action prompts, raw model reasoning, complete history, or image bytes.

- [ ] **Step 2: Validate model switches**

`switch-image-model` must name a different eligible tuple. The following execution decision must still be `generate-action` or `retry-action`; switching alone does not issue Provider work.

Persist:

```js
{
  from: { provider, model },
  to: { provider, model },
  scope: actionId,
  reasonCodes,
  decisionId
}
```

The switch consumes no Provider call but the subsequent new-art attempt consumes an action attempt.

- [ ] **Step 3: Loop one bounded action at a time**

Do not recursively generate all actions in one call stack. Each step:

1. loads state/ledger;
2. recovers stale Creator Studio runs;
3. resolves next scope;
4. requests one planner decision;
5. validates and persists it;
6. executes at most one generation/evaluation operation;
7. writes state and returns a progress view.

The workflow service may schedule the next step asynchronously, but each step remains restartable and idempotent.

- [ ] **Step 4: Route full-pet requests only when explicitly enabled**

After the existing draft and confirm stages establish a Creator Studio run, `CreatorWorkflowService` checks the normalized Agent configuration. When `enabled=true`, `executionMode='bounded'`, and full-pet Phase 3 capability is enabled, call `runFullPetAgent({ runId, userIntent })` instead of the legacy run-step/auto-approve/import sequence.

When any condition is false, preserve the existing fixed Creator Studio workflow. Agent failure must return review/failed evidence and must not silently fall back mid-run to auto-approval/import.

- [ ] **Step 5: Keep evaluation separate**

For generated rows:

- build one action review board;
- call evaluator in a new stateless request;
- persist evaluation;
- combine with code QA;
- never send planner rationale to evaluator.

- [ ] **Step 6: Inspect and commit Task 3**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-service.js src/main/services/hatch-pet-agent-model-candidates.js src/main/services/hatch-pet-agent-store.js src/main/services/creator-workflow-service.js
git add src/main/services/hatch-pet-agent-service.js src/main/services/hatch-pet-agent-model-candidates.js src/main/services/hatch-pet-agent-store.js src/main/services/creator-workflow-service.js
git commit -m "feat orchestrate full pet agent steps"
```

---

### Task 4: Add Exact Model Provenance And Approval Readiness

**Files:**
- Create: `src/main/services/hatch-pet-agent-provenance.js`
- Modify: `examples/plugins/creator-studio/lib/provider-art-approval.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`

**Interfaces:**
- Produces: `recordSuccessfulGenerationModel`, `listSuccessfulGenerationModels`, `createAgentArtReadiness`, exact tuple validation.

- [ ] **Step 1: Record every successful generation tuple**

```js
{
  provider,
  model,
  stage,
  scope,
  outputHashes,
  qualityProfileId,
  humanDatasetId,
  decisionId,
  generatedAt
}
```

Record only calls whose outputs are used by the current identity, passed action, reused checkpoint, or package. Preserve historical failed-attempt provenance separately but do not require Provider approval for unused rejected output.

- [ ] **Step 2: Include reused repair models**

When a checkpoint is reused, copy its original model tuple into current run readiness evidence. Do not relabel it as the current planner-selected model.

- [ ] **Step 3: Calculate readiness fail-closed**

`production-art-ready` requires an exact approved record for every successful used tuple and active profile/dataset. Until human acceptance and approval records exist, return `technical-chain-ready` or `unapproved-generation-models`.

This does not set `artisticApproval` or run approval.

- [ ] **Step 4: Inspect and commit Task 4**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-provenance.js examples/plugins/creator-studio/lib/provider-art-approval.js examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/backend-runner.js
git add src/main/services/hatch-pet-agent-provenance.js examples/plugins/creator-studio/lib/provider-art-approval.js examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/backend-runner.js
git commit -m "feat track hatch pet model provenance"
```

---

### Task 5: Add Package Review Board And Final Evaluation

**Files:**
- Modify: `src/main/services/hatch-pet-agent-review-board.js`
- Modify: `src/main/services/hatch-pet-agent-evaluation.js`
- Modify: `src/main/services/hatch-pet-agent-service.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-atlas-composer.js`
- Modify: `examples/plugins/creator-studio/lib/real-atlas-builder.js`

**Interfaces:**
- Produces: `buildPackageReviewBoard`, `evaluateFullPetPackage`, and final `ready_for_review` transition.

- [ ] **Step 1: Compose package only after action queue completion**

Require passed `idle`; include only passed/reused rows and approved mirror. Omitted optional rows stay fully transparent. Run existing atlas/manifest/availability QA unchanged.

- [ ] **Step 2: Build one final review board**

Board contains:

- source and canonical identity;
- compact contact-sheet thumbnails for every available action;
- explicit omitted action list generated by code;
- atlas overview;
- no raw user text.

Keep within 3072x2048 and one evaluator image input.

- [ ] **Step 3: Evaluate package**

Use the same evaluation contract with package-specific fixed instructions for cross-row identity, action distinction, small-scale readability, and visible contamination. Deterministic atlas failure always blocks before evaluation.

- [ ] **Step 4: Stop at human review**

Both gates passing sets:

```js
{
  stage: 'ready_for_review',
  reviewStatus: 'pending',
  importStatus: 'not-imported',
  artisticApproval: false
}
```

Do not call approve/import/activation commands.

- [ ] **Step 5: Inspect and commit Task 5**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-review-board.js src/main/services/hatch-pet-agent-evaluation.js src/main/services/hatch-pet-agent-service.js examples/plugins/creator-studio/lib/full-pet-atlas-composer.js examples/plugins/creator-studio/lib/real-atlas-builder.js
git add src/main/services/hatch-pet-agent-review-board.js src/main/services/hatch-pet-agent-evaluation.js src/main/services/hatch-pet-agent-service.js examples/plugins/creator-studio/lib/full-pet-atlas-composer.js examples/plugins/creator-studio/lib/real-atlas-builder.js
git commit -m "feat evaluate hatch pet package"
```

---

### Task 6: Add Pause, Resume, Cancel, And Durable Recovery

**Files:**
- Modify: `src/main/services/hatch-pet-agent-service.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `src/main/ipc/register-creator-ipc.js`
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `control-center-preload.js`

**Interfaces:**
- Adds: `pauseAgentRun`, `resumeAgentRun`, `cancelAgentRun`, and restart-safe `resumePendingAgentRuns`.

- [ ] **Step 1: Add exact transitions**

- pause: current non-terminal state -> `paused` after active bounded operation ends;
- resume: `paused` -> previous stage;
- cancel: non-terminal -> `cancelled`, no further model/Provider calls;
- restart: recover stale Creator Studio lease, validate artifacts/ledger, resume first unresolved slot only when auto-resume setting is enabled; otherwise remain paused.

- [ ] **Step 2: Add IPC channels**

```js
CREATOR_PAUSE_AGENT_RUN: 'creator:pause-agent-run',
CREATOR_RESUME_AGENT_RUN: 'creator:resume-agent-run',
CREATOR_CANCEL_AGENT_RUN: 'creator:cancel-agent-run'
```

All handlers validate run ID and current state.

- [ ] **Step 3: Preserve idempotency**

Before execution, derive an idempotency key from run ID, state version, stage, action, attempt, and decision ID. Reuse completed evidence with the same key; never issue a duplicate Provider call after restart.

- [ ] **Step 4: Inspect and commit Task 6**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-service.js src/main/services/creator-workflow-service.js src/main/ipc/register-creator-ipc.js src/shared/ipc-channels.js src/shared/ipc-channels.ts control-center-preload.js
git add src/main/services/hatch-pet-agent-service.js src/main/services/creator-workflow-service.js src/main/ipc/register-creator-ipc.js src/shared/ipc-channels.js src/shared/ipc-channels.ts control-center-preload.js
git commit -m "feat recover hatch pet agent runs"
```

---

### Task 7: Add Full-Pet Progress And Final Review UI

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/hooks/useCreatorPane.ts`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`
- Modify: `examples/plugins/creator-studio/web/dashboard/index.html`
- Modify: `examples/plugins/creator-studio/service/studio-service.js`

**Interfaces:**
- Produces: action queue view, remaining budgets, model usage, omission reasons, pause/resume/cancel controls, final review evidence.

- [ ] **Step 1: Extend public view**

Expose per action:

```ts
{
  actionId: string
  required: boolean
  status: 'pending' | 'generating' | 'passed' | 'reused' | 'omitted' | 'failed'
  attemptsUsed: number
  attemptsRemaining: number
  provider: string
  model: string
  codeQa: string
  modelEvaluation: string
  reasonCodes: string[]
}
```

- [ ] **Step 2: Render progress and controls**

Show current stage/action, identity state, action table, remaining Provider/time/cost budgets, all successful used models, omitted actions, and pause/resume/cancel. Never render raw prompts or model reasoning.

- [ ] **Step 3: Render final review boundary**

At `ready_for_review`, show code QA and model evaluation separately, Provider approval readiness separately, and explicit `Human approval required` copy. Keep approve/import actions in their existing human-owned locations.

- [ ] **Step 4: Update Creator Studio dashboard**

Expose the same bounded agent evidence and links to contact sheets/GIFs/atlas. Dashboard image routes remain host/path safe.

- [ ] **Step 5: Demo fixtures**

Add deterministic full-pet fixtures for checkpoint reuse, model switch, optional omission, required idle failure, paused, resumed, budget exhausted, and ready for review.

- [ ] **Step 6: Inspect and commit Task 7**

```bash
git diff --check
git diff -- src/shared/openpet-contracts.ts src/control-center/src/hooks/useCreatorPane.ts src/control-center/src/panes/CreatorPane.tsx src/control-center/src/api/demo-control-center-api.ts examples/plugins/creator-studio/web/dashboard/index.html examples/plugins/creator-studio/service/studio-service.js
git add src/shared/openpet-contracts.ts src/control-center/src/hooks/useCreatorPane.ts src/control-center/src/panes/CreatorPane.tsx src/control-center/src/api/demo-control-center-api.ts examples/plugins/creator-studio/web/dashboard/index.html examples/plugins/creator-studio/service/studio-service.js
git commit -m "feat show full hatch pet agent progress"
```

---

### Task 8: Document Phase 3 And Create Final Verification Handoff

**Files:**
- Modify: `docs/pet-character-generation.md`
- Modify: `examples/plugins/creator-studio/README.md`
- Create: `docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase4-verification-rollout.md`

**Interfaces:**
- Produces: current full-pet Agent truth and the Phase 4 plan.

- [ ] **Step 1: Document opt-in full-pet Agent behavior**

Cover bounded action queue, three attempts, code/model gates, model switching, successful model provenance, optional omission, required idle, pause/resume/recovery, and final human review.

- [ ] **Step 2: Keep claims conservative**

State implemented but unverified. Do not claim Provider approval or production readiness. Link Provider reliability report commit `4ac47213` as the reason command lifetime/lease are prerequisites.

- [ ] **Step 3: Final static checks and commit**

```bash
git diff --check
git status --short --branch
git add docs/pet-character-generation.md examples/plugins/creator-studio/README.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase4-verification-rollout.md
git commit -m "docs hand off full hatch pet agent verification"
git status --short --branch
git log -10 --oneline
```

---

## Phase 3 Completion Boundary

No default rollout decision is made on the development branch. Phase 3 ends with an opt-in, human-gated implementation and a clean handoff to independent automated, Provider, repair, and visual verification.
