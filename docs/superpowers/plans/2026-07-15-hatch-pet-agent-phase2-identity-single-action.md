# Hatch-Pet Agent Phase 2 Identity And Single-Action Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 1 shadow planner into a bounded executor for canonical identity and one existing-character action, with separate model visual evaluation and optional identity review.

**Architecture:** Add versioned prompt strategies, safe image-model candidates, one-image evaluation boards, code/model combined gates, and scope budgets. Execute only identity and single-action decisions through current Creator Studio commands; full-pet action orchestration remains on the fixed path until Phase 3.

**Tech Stack:** Electron main process, Node.js CommonJS, Sharp review-board composition, Creator Studio command bridge, OpenAI-compatible multimodal chat completions, JSON evidence.

## Global Constraints

- Phase 1 and its independent automated verification must be complete before starting.
- The Provider reliability P0 from test report commit `4ac47213` must be implemented before enabling bounded execution: outer command timeouts must exceed the 90-minute inner workflow budget, and stale `generating` runs must recover through Creator Studio-owned leases.
- Follow `docs/superpowers/specs/2026-07-15-model-driven-hatch-pet-agent-design.md`.
- Work only in the assigned isolated development worktree; preserve history and do not push or merge.
- Do not run tests, builds, Provider calls, browser checks, image generation, or visual acceptance on the development branch.
- Add implementation and static checks only; all automated and real visual verification belongs to a new isolated testing task.
- Bounded execution remains opt-in and must preserve an explicit fixed Creator Studio fallback.
- The model cannot override code QA, change budgets, approve, import, activate, access secrets, add endpoints, or write arbitrary files.
- Each evaluation call receives at most one locally composed review-board image.
- Every generation request must carry exactly one validated local reference image, use the image-conditioned edit path, and request exactly one output.
- All upstream image prompts must be compiled through `provider-image-prompt-compiler.js`; Hatch Pet cannot send or append raw prompt text.
- Default limits remain one identity regeneration, three attempts per action, and two evaluation attempts per artifact.
- Required identity failure blocks; single-action failure remains reviewable/failed and never auto-imports.
- Every task ends in a focused commit. Do not push.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/main/services/hatch-pet-agent-strategies.js` | Versioned prompt/reference strategy registry and bounded model-requested change composition |
| `examples/plugins/creator-studio/lib/provider-image-task.js` | Typed dimensions, sheet geometry, reference interpretation, and visual directives |
| `examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js` | Project-neutral upstream prompt ownership |
| `src/main/services/hatch-pet-agent-review-board.js` | One-image identity/action evaluator board generation |
| `src/main/services/hatch-pet-agent-evaluation.js` | Evaluation schema, tool definition, verdict validation, combined gate |
| `src/main/services/hatch-pet-agent-model-candidates.js` | Safe image-model candidate list derived from host configuration/catalog |
| `src/main/services/hatch-pet-agent-service.js` | Planner/evaluator calls and bounded identity/single-action loops |
| `src/main/services/ai-service.js` | Structured multimodal tool call support |
| `src/main/services/creator-workflow-service.js` | Opt-in bounded identity/single-action routing and identity checkpoint |
| Creator Studio prompt/bridge files | Accept validated strategy directives without weakening fixed contracts |
| Shared contracts / IPC / Control Center | Execution mode, timeline, identity checkpoint, review status |

---

### Prerequisite Task 0: Align Creator Command Lifetime And Recover Orphaned Runs

**Files:**
- Modify: `examples/plugins/creator-studio/plugin.json`
- Modify: `examples/plugins/creator-studio/lib/run-store.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify: `examples/plugins/creator-studio/service/studio-service.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `src/main/services/image-generation-model-service.js`

**Interfaces:**
- Produces: outer command timeout `5700000`, Creator Studio generation lease helpers, heartbeat updates, and stale-run recovery with reason code `generation-command-terminated`.
- Preserves: `FULL_PET_WORKFLOW_MAX_DURATION_MS = 90 * 60 * 1000`, completed action checkpoints, and existing QA thresholds.

- [ ] **Step 1: Align native command timeouts with the inner workflow budget**

Set all three long-running commands to 95 minutes:

```json
{ "id": "run-step", "title": "Run Step", "command": "node ./commands/run-step.js", "cwd": ".", "timeoutMs": 5700000 },
{ "id": "retry-action", "title": "Retry Pet Action", "command": "node ./commands/retry-action.js", "cwd": ".", "timeoutMs": 5700000 },
{ "id": "retry-identity", "title": "Retry Pet Identity", "command": "node ./commands/retry-identity.js", "cwd": ".", "timeoutMs": 5700000 }
```

Do not use `timeoutMs: 0`. The 300000 ms difference is bounded shutdown/evidence grace after the 90-minute inner deadline.

- [ ] **Step 2: Add lease files to `run-store.js`**

Store `runs/<runId>/generation-lease.json` with:

```js
{
  version: 1,
  leaseId,
  operation: 'generate' | 'retry-action' | 'retry-identity',
  pid: process.pid,
  startedAt,
  heartbeatAt
}
```

Export:

```js
writeGenerationLease({ dataDir, runId, lease })
readGenerationLease({ dataDir, runId })
clearGenerationLease({ dataDir, runId, leaseId })
recoverStaleGeneratingRun({ dataDir, runId, nowMs, staleAfterMs = 120000 })
```

Use safe run paths and atomic temp-file rename. `clearGenerationLease` removes only a matching lease ID.

- [ ] **Step 3: Implement stale recovery**

When a run has `status === 'generating'` and the lease is missing or its heartbeat is older than 120000 ms, update only run status fields:

```js
{
  status: 'failed',
  currentStep: 'generate',
  reviewStatus: 'pending',
  importStatus: 'not-imported',
  failureReasonCode: 'generation-command-terminated',
  error: 'Creator Studio generation command terminated before completion',
  backendStatus: {
    ...run.backendStatus,
    state: 'failed',
    message: 'Creator Studio generation command terminated before completion',
    updatedAt
  }
}
```

Do not delete or invalidate generated outputs, action checkpoints, QA evidence, repair archives, or model provenance.

- [ ] **Step 4: Heartbeat every 30 seconds during generation and repair**

Add a helper in `backend-runner.js`:

```js
const withGenerationLease = async ({ dataDir, runId, operation, now, work }) => {
  const leaseId = crypto.randomUUID()
  const startedAt = now()
  writeGenerationLease({ dataDir, runId, lease: {
    version: 1,
    leaseId,
    operation,
    pid: process.pid,
    startedAt,
    heartbeatAt: startedAt
  } })
  const timer = setInterval(() => {
    const heartbeatAt = now()
    writeGenerationLease({ dataDir, runId, lease: {
      version: 1,
      leaseId,
      operation,
      pid: process.pid,
      startedAt,
      heartbeatAt
    } })
  }, 30000)
  timer.unref?.()
  try {
    return await work()
  } finally {
    clearInterval(timer)
    clearGenerationLease({ dataDir, runId, leaseId })
  }
}
```

Wrap `runGenerationStep`, `runFullPetActionRepair`, and `runFullPetIdentityRepair`. Recover stale state before rejecting an already-generating run.

- [ ] **Step 5: Recover on service load and command entry**

Before Studio service returns run details or command handlers begin retry/generation, call `recoverStaleGeneratingRun`. Record event `generate.stale-recovered` with reason code only; do not log host paths.

- [ ] **Step 6: Add safe Provider stage evidence**

Extend the host image-generation request with an optional bounded `logicalStage` matching `/^[a-z0-9][a-z0-9._-]{0,79}$/`. Pass exact stages such as `identity-anchor`, `canonical-identity`, `action-start-keyframe`, `action-peak-keyframe`, and `action-final-row` from `host-model-bridge.js`.

Provider request logs add:

```js
logicalStage,
multipartImageField: referenceImages.length ? 'image' : '',
requestedOutputCount: 1
```

Completion evidence keeps actual output count and adds `outputCountMismatch: outputs.length !== 1`. Never log multipart bytes, filenames containing host paths, raw Provider payloads, or `image[]`.

- [ ] **Step 7: Inspect and commit prerequisite**

```bash
git diff --check
git diff -- examples/plugins/creator-studio/plugin.json examples/plugins/creator-studio/lib/run-store.js examples/plugins/creator-studio/lib/backend-runner.js examples/plugins/creator-studio/service/studio-service.js examples/plugins/creator-studio/lib/host-model-bridge.js src/main/services/image-generation-model-service.js
git add examples/plugins/creator-studio/plugin.json examples/plugins/creator-studio/lib/run-store.js examples/plugins/creator-studio/lib/backend-runner.js examples/plugins/creator-studio/service/studio-service.js examples/plugins/creator-studio/lib/host-model-bridge.js src/main/services/image-generation-model-service.js
git commit -m "fix align creator generation lifetime"
```

---

### Task 1: Add Versioned Strategy Registry

**Files:**
- Create: `src/main/services/hatch-pet-agent-strategies.js`
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/openpet-prompt-builder.js`

**Interfaces:**
- Produces: `getHatchPetStrategy(id)`, `listHatchPetStrategies(scope)`, and `composeHatchPetStrategyGuidance({ strategyId, requestedChanges })`.
- Consumes: sanitized agent decision strategy fields.

- [ ] **Step 1: Define exact strategy IDs**

Create immutable entries:

```js
const STRATEGIES = Object.freeze({
  'canonical-identity-v1': {
    scopes: ['identity'],
    directives: ['preserve every visible identity feature', 'use one complete full-body pose', 'keep a stable lower-center root']
  },
  'preserve-canonical-pose-v1': {
    scopes: ['idle', 'action'],
    directives: ['preserve viewpoint, framing, scale, silhouette, markings, accessories, and lower-center root']
  },
  'idle-minimal-motion-v1': {
    scopes: ['idle'],
    directives: ['limit motion to subtle breathing, blink, ear, or tail-tip movement', 'keep the body root fixed']
  },
  'strengthen-action-semantics-v1': {
    scopes: ['action'],
    directives: ['make the assigned action readable through its clearest pose', 'preserve identity and root alignment']
  },
  'repair-identity-drift-v1': {
    scopes: ['identity', 'idle', 'action'],
    directives: ['restore the reference face, silhouette, palette, markings, materials, and accessories', 'do not copy the reference layout']
  },
  'repair-scale-baseline-v1': {
    scopes: ['idle', 'action'],
    directives: ['keep scale, lower-center root, baseline, and safe padding consistent across all frames']
  },
  'alternative-model-retry-v1': {
    scopes: ['identity', 'idle', 'action'],
    directives: ['preserve every fixed output, identity, framing, transparency, and motion requirement']
  }
})
```

- [ ] **Step 2: Bound model-requested changes**

`composeHatchPetStrategyGuidance` must:

- reject unknown strategy IDs;
- allow at most eight requested changes;
- sanitize each through existing creative-brief sanitization;
- truncate each to 240 characters;
- return structured `{ strategyId, fixedDirectives, requestedChanges }` without creating a raw prompt string.

- [ ] **Step 3: Add optional validated strategy guidance to prompt builders**

Pass the validated strategy to the typed image task and let the provider-neutral compiler place it inside fixed contracts:

```js
createProviderImageTask({
  ...baseTask,
  strategyId: agentStrategy.strategyId,
  requestedChanges: [
    ...agentStrategy.fixedDirectives,
    ...agentStrategy.requestedChanges
  ]
})
```

The compiler re-applies output dimensions, exact-one-reference interpretation, identity, transparency, framing, negative, action, and quality-profile rules after strategy composition.

- [ ] **Step 4: Inspect and commit Task 1**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-strategies.js examples/plugins/creator-studio/lib/anchor-prompt-builder.js examples/plugins/creator-studio/lib/openpet-prompt-builder.js
git add src/main/services/hatch-pet-agent-strategies.js examples/plugins/creator-studio/lib/anchor-prompt-builder.js examples/plugins/creator-studio/lib/openpet-prompt-builder.js
git commit -m "feat add hatch pet prompt strategies"
```

---

### Task 2: Add Safe Image-Model Candidates

**Files:**
- Create: `src/main/services/hatch-pet-agent-model-candidates.js`
- Modify: `src/main/services/image-generation-model-service.js`
- Modify: `src/main/services/provider-model-catalog.js`

**Interfaces:**
- Produces: `listEligibleHatchPetImageModels({ config, catalog, health, recentOutcomes, policy })` and `assertEligibleHatchPetImageModel(selection, candidates)`.
- Consumes: host-owned image configuration and saved catalog; never secrets.

- [ ] **Step 1: Expose bounded capability metadata**

Extend the image service public configuration/catalog view with safe entries:

```js
{
  id,
  provider,
  capabilities: ['generation', 'edit', 'transparent-background'],
  verified,
  health: 'healthy' | 'unknown' | 'unavailable'
}
```

Do not expose API key refs in planner snapshots unless the value is a fixed non-secret identifier already public in settings; never expose secret values.

- [ ] **Step 2: Filter candidates**

Eligibility requires:

- model ID exists in saved/discovered image catalog or equals the currently configured verified model;
- Provider equals the host image Provider;
- current health is healthy or a bounded cached health snapshot is accepted;
- requested stage capabilities are present;
- `edit` or equivalent image-conditioned generation capability is present; generation-only models are ineligible;
- local policy has not disabled the model.

When no image-conditioned model is available, stop with `no_image_conditioned_model`. Never fall back to a text-only image endpoint.

Sort candidates by verified, recent successful stage, then model ID. Limit to 20.

- [ ] **Step 3: Validate model decisions**

Exact Provider/model tuple matching is required. Unknown selections throw:

```text
Hatch-pet selected an unavailable image model
```

The agent service handles this as an invalid decision; it does not pass arbitrary IDs into image generation.

- [ ] **Step 4: Inspect and commit Task 2**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-model-candidates.js src/main/services/image-generation-model-service.js src/main/services/provider-model-catalog.js
git add src/main/services/hatch-pet-agent-model-candidates.js src/main/services/image-generation-model-service.js src/main/services/provider-model-catalog.js
git commit -m "feat expose bounded hatch pet image models"
```

---

### Task 3: Add One-Image Review Boards And Evaluation Contract

**Files:**
- Create: `src/main/services/hatch-pet-agent-review-board.js`
- Create: `src/main/services/hatch-pet-agent-evaluation.js`
- Modify: `src/main/services/ai-service.js`

**Interfaces:**
- Produces: `buildIdentityReviewBoard`, `buildActionReviewBoard`, `createHatchPetEvaluationTool`, `validateHatchPetEvaluation`, `combineHatchPetQualityGate`.
- Extends: `aiService.completeStructuredTool` with `imageInputs` containing at most one data URL or host-loaded safe image payload.

- [ ] **Step 1: Add review-board builders**

Use Sharp and existing safe path patterns. Boards are stored under:

```text
runs/<runId>/agent/review-boards/identity-<attempt>.png
runs/<runId>/agent/review-boards/<actionId>-<attempt>.png
```

Identity board layout:

- left: validated source;
- right: generated canonical identity;
- fixed code-rendered labels;
- white presentation background;
- maximum 2048x1024.

Action board layout:

- first panel: canonical identity;
- remaining space: ordered action contact sheet;
- fixed action ID, frame order, and attempt labels;
- maximum 2048x1536.

No arbitrary user text is rendered as a label.

- [ ] **Step 2: Extend structured completion with one image input**

Accept `imageInputs = []`. Reject more than one. Convert the final user message content to OpenAI-compatible multimodal content:

```js
[
  { type: 'text', text: userText },
  { type: 'image_url', image_url: { url: imageInputs[0] } }
]
```

Require `data:image/png;base64,` or `data:image/webp;base64,` generated by the host from a safe run-relative path. Limit encoded input size to 12 MiB. Do not log the data URL.

- [ ] **Step 3: Define the evaluation tool**

Tool name: `hatch_pet_visual_evaluation`.

Required fields:

```js
{
  schemaVersion: 1,
  verdict: 'pass' | 'repair' | 'reject' | 'cannot-evaluate',
  confidence: number,
  scores: {
    identity: number,
    actionReadability: number,
    crossFrameConsistency: number,
    smallScaleReadability: number,
    overallVisualQuality: number
  },
  defects: Array<{
    reasonCode: string,
    severity: 'blocking' | 'major' | 'minor',
    scope: string,
    evidence: string,
    repairDirective: string
  }>,
  summary: string
}
```

All scores are integers `0..100`; defects are limited to 12; evidence/directive are limited to 400 characters; summary to 1000.

- [ ] **Step 4: Enforce verdict consistency**

- `pass` rejects any blocking defect;
- `repair` requires at least one defect and one non-empty repair directive;
- `reject` marks output non-reusable;
- `cannot-evaluate` contains no fabricated scores and sets them to zero;
- unknown reason codes are rejected;
- one invalid evaluation receives one schema-repair call, then fails closed.

- [ ] **Step 5: Combine code and model gates**

Implement:

```js
const combineHatchPetQualityGate = ({ codeQaPassed, evaluation }) => {
  if (!codeQaPassed) return { passed: false, code: 'code_qa_failed' }
  if (evaluation.verdict === 'pass') return { passed: true, code: 'passed' }
  if (evaluation.verdict === 'cannot-evaluate') return { passed: false, code: 'evaluation_unavailable' }
  return { passed: false, code: 'visual_quality_failed' }
}
```

The evaluator never overrides code QA.

- [ ] **Step 6: Inspect and commit Task 3**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-review-board.js src/main/services/hatch-pet-agent-evaluation.js src/main/services/ai-service.js
git add src/main/services/hatch-pet-agent-review-board.js src/main/services/hatch-pet-agent-evaluation.js src/main/services/ai-service.js
git commit -m "feat add hatch pet visual evaluation"
```

---

### Task 4: Implement Bounded Identity Execution

**Files:**
- Modify: `src/main/services/hatch-pet-agent-service.js`
- Modify: `src/main/services/hatch-pet-agent-store.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`

**Interfaces:**
- Produces: `runIdentityAgent({ runId, userIntent, reference, creatorCommand })` returning provisional pass, identity review required, or bounded failure.

- [ ] **Step 1: Add executable mode gate**

Execute only when:

```js
config.enabled === true && config.executionMode === 'bounded'
```

Otherwise preserve Phase 1 shadow/fixed behavior.

- [ ] **Step 2: Persist identity attempt state**

Use:

```js
{
  stateVersion: 1,
  stage: 'generating_identity' | 'evaluating_identity' | 'identity_passed' | 'identity_failed',
  identity: {
    initialAttemptCompleted: false,
    regenerationsUsed: 0,
    evaluationAttemptsUsed: 0,
    latestArtifactRelativePath: '',
    latestCodeQaRelativePath: '',
    latestEvaluationRelativePath: ''
  }
}
```

Update snapshots atomically after each transition.

- [ ] **Step 3: Execute only validated identity decisions**

Legal decisions:

- first slot: `generate-identity`, `request-user-input`, `stop-run`;
- failed slot with regeneration budget: `retry-identity`, `switch-image-model`, `stop-run`;
- passed slot: `accept-stage`, `request-human-review`.

Map identity generation to the existing Creator Studio full-pet base/canonical generation path with additive validated fields:

```js
{
  agentStrategy,
  requestedImageModel: { provider, model },
  agentDecisionId
}
```

The host bridge validates the model tuple again before Provider work.

- [ ] **Step 4: Evaluate identity after code QA**

When canonical output and code QA exist:

1. build identity review board;
2. call evaluator with a separate stateless evaluation prompt;
3. persist evaluation JSON;
4. combine gates;
5. accept provisionally only when both pass.

If evaluation returns `cannot-evaluate`, allow one additional evaluation call without regenerating art. Other failures return to the planner and consume an identity regeneration only when new art is generated.

- [ ] **Step 5: Enforce identity budget**

After initial attempt plus one regeneration, transition to `identity_failed` and stop. The model cannot request another generation. Return code `hatch_pet_identity_budget_exhausted`.

- [ ] **Step 6: Inspect and commit Task 4**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-service.js src/main/services/hatch-pet-agent-store.js src/main/services/creator-workflow-service.js examples/plugins/creator-studio/lib/host-model-bridge.js
git add src/main/services/hatch-pet-agent-service.js src/main/services/hatch-pet-agent-store.js src/main/services/creator-workflow-service.js examples/plugins/creator-studio/lib/host-model-bridge.js
git commit -m "feat execute bounded hatch pet identity"
```

---

### Task 5: Implement Bounded Single-Action Execution

**Files:**
- Modify: `src/main/services/hatch-pet-agent-service.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`

**Interfaces:**
- Produces: `runSingleActionAgent({ runId, action, canonicalReference, creatorCommand })` with at most three generation attempts and two evaluations per artifact.

- [ ] **Step 1: Define legal action-loop decisions**

Before generation:

- `generate-action`;
- `switch-image-model`;
- `request-user-input`;
- `stop-run`.

After failure with budget:

- `retry-action`;
- `switch-image-model`;
- `stop-run`.

After combined pass:

- `accept-stage`;
- `request-human-review`.

`omit-optional-action` is not used by the single-action flow; a requested single action either reaches review or fails.

- [ ] **Step 2: Pass validated agent inputs through Creator Studio**

Add bounded command payload fields:

```js
agent: {
  decisionId,
  imageModel: { provider, model },
  strategy: {
    strategyId,
    fixedDirectives,
    requestedChanges
  }
}
```

Strip unknown fields and enforce safe lengths in both host workflow and plugin command boundary.

- [ ] **Step 3: Account for attempts and Provider calls**

An action attempt starts when the first image Provider request for that attempt is accepted. Persist actual Provider-call deltas reported by the image service. A transient lower-level retry consumes another Provider call but not another action attempt.

Stop before a request that would exceed `maxProviderCalls`, `maxElapsedMs`, or configured cost cap.

- [ ] **Step 4: Evaluate contact sheet and code QA**

After action frame/row QA:

- build the action review board;
- evaluate with the same hatch-pet model in evaluator role;
- combine gates;
- on failure, summarize fixed reason codes and repair directives for the next planner call;
- store only the latest three attempt summaries in snapshots while preserving all evidence files on disk.

- [ ] **Step 5: Return review-required instead of auto-import**

Combined pass returns `review-required` with code `hatch_pet_action_ready_for_review`. It must not run `approve-run` or import commands even if the old default flow could auto-approve fixture output.

- [ ] **Step 6: Inspect and commit Task 5**

```bash
git diff --check
git diff -- src/main/services/hatch-pet-agent-service.js src/main/services/creator-workflow-service.js examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/backend-runner.js
git add src/main/services/hatch-pet-agent-service.js src/main/services/creator-workflow-service.js examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/backend-runner.js
git commit -m "feat execute bounded hatch pet action"
```

---

### Task 6: Add Identity Checkpoint And Agent Timeline UI

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/main/ipc/register-creator-ipc.js`
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `control-center-preload.js`
- Modify: `src/control-center/src/hooks/useCreatorPane.ts`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Modify: `src/control-center/src/panes/AiPane.tsx`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`

**Interfaces:**
- Adds: `approveCreatorIdentity({ runId })`, `cancelCreatorAgentRun({ runId })`, and additive agent timeline/status types.

- [ ] **Step 1: Add identity review IPC**

Channels:

```js
CREATOR_APPROVE_IDENTITY: 'creator:approve-identity',
CREATOR_CANCEL_AGENT_RUN: 'creator:cancel-agent-run'
```

Approval is legal only in `awaiting_identity_review`; cancellation is legal before final human approval.

- [ ] **Step 2: Extend public creator state**

Add:

```ts
interface HatchPetAgentTimelineItem {
  decisionId: string
  stage: string
  scope: string
  decision: string
  provider: string
  model: string
  codeQa: 'pass' | 'fail' | 'pending' | 'unavailable'
  modelEvaluation: 'pass' | 'repair' | 'reject' | 'cannot-evaluate' | 'pending' | 'unavailable'
  budgetSummary: string
  resultCode: string
  createdAt: string
}
```

Expose remaining identity/action/evaluation/Provider-call/time budgets without cost secrets.

- [ ] **Step 3: Add explicit bounded-mode opt-in**

In the Hatch Pet Agent settings card, allow `Shadow` and `Bounded identity + single action` execution modes only when capability check confirms structured tool calls and vision. Show a warning that bounded mode stops at human review and full-pet action orchestration still uses the fixed path.

Saving bounded mode must not change image Provider settings, budgets, or Creator Studio approval/import defaults.

- [ ] **Step 4: Render checkpoint controls**

When awaiting identity review, show:

- source/canonical review location link;
- code QA summary;
- model evaluation summary;
- approve identity and continue button;
- cancel button;
- no automatic import/activation wording.

- [ ] **Step 5: Render a bounded timeline**

Show latest 20 items. Do not expose prompts, raw model responses, absolute paths, or hidden reasoning. Provide Creator Studio details link for full evidence.

- [ ] **Step 6: Mirror states in demo API**

Add deterministic fixtures for shadow, generating identity, awaiting identity review, action repair, ready for review, and budget exhausted.

- [ ] **Step 7: Inspect and commit Task 6**

```bash
git diff --check
git diff -- src/shared/openpet-contracts.ts src/main/ipc/register-creator-ipc.js src/shared/ipc-channels.js src/shared/ipc-channels.ts control-center-preload.js src/control-center/src/hooks/useCreatorPane.ts src/control-center/src/panes/CreatorPane.tsx src/control-center/src/panes/AiPane.tsx src/control-center/src/api/demo-control-center-api.ts
git add src/shared/openpet-contracts.ts src/main/ipc/register-creator-ipc.js src/shared/ipc-channels.js src/shared/ipc-channels.ts control-center-preload.js src/control-center/src/hooks/useCreatorPane.ts src/control-center/src/panes/CreatorPane.tsx src/control-center/src/panes/AiPane.tsx src/control-center/src/api/demo-control-center-api.ts
git commit -m "feat show hatch pet agent review state"
```

---

### Task 7: Document Phase 2 And Create Independent Test Handoff

**Files:**
- Modify: `docs/pet-character-generation.md`
- Modify: `examples/plugins/creator-studio/README.md`
- Create: `docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase2-test-handoff.md`

**Interfaces:**
- Produces: truthful opt-in boundary and isolated test assignment.

- [ ] **Step 1: Document supported Phase 2 scope**

State that bounded Agent execution supports canonical identity and single-action generation only. Full-pet action orchestration still uses the fixed workflow. Code/model double gate and human review are mandatory.

- [ ] **Step 2: Require separate automated and visual testing**

The test handoff must cover strategy registry, candidate filtering, one-image review boards, multimodal structured calls, evaluation consistency, code-gate non-override, identity budget, three action attempts, Provider-call/time/cost budgets, identity checkpoint, no auto-import, IPC/UI, broad suites, and real Provider identity/single-action visual review.

All real image generation and visual inspection in the testing task must use fresh one-shot subagents with `fork_turns="none"`; the controller may read structured reports only.

- [ ] **Step 3: Final static checks and commit**

```bash
git diff --check
git status --short --branch
git add docs/pet-character-generation.md examples/plugins/creator-studio/README.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase2-test-handoff.md
git commit -m "docs hand off bounded hatch pet verification"
git status --short --branch
git log -8 --oneline
```

Expected: clean, not pushed, bounded mode opt-in, no full-pet Agent claim, implemented but unverified.

---

## Phase 2 Completion Boundary

Phase 2 does not begin full-pet autonomous action iteration. Proceed to Phase 3 only after isolated tests prove identity and single-action loops preserve code QA, budgets, secrets, and the final human-review boundary.
