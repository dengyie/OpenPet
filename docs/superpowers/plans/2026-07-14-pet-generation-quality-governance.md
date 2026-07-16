# Pet Generation Quality Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch implementation subagents; the user requested a separate testing task only after development is complete.

**Goal:** Complete the five remaining pet-generation quality engineering items: single-reference enforcement, human-review quality protocols, profile-driven prompts and QA, smallest-scope repair, and Provider production-art promotion gates.

**Architecture:** Add focused governance modules beside the existing Creator Studio pipeline, then inject their validated outputs into current prompt, board, QA, checkpoint, workflow, dashboard, and smoke-result boundaries. Keep the default profile behavior-compatible, reuse current action checkpoints for scoped repair, and treat Provider promotion as claim metadata rather than a bypass of per-run QA or human approval.

**Tech Stack:** Node.js CommonJS, Electron IPC, Creator Studio loopback HTTP service, React/TypeScript Control Center contracts, JSON registries, Sharp-based image metrics, Node filesystem and crypto APIs.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/ff3f/OpenPet` on `codex/dev8`.
- Preserve all existing commits; do not reset, rewrite, push, merge, or touch another worktree.
- Do not modify the existing `cat_anime/` material structure.
- Every Provider image request accepts zero or one reference image.
- Multiple local visual cues must be composed into one local reference board before a Provider call.
- The default quality profile must preserve current thresholds and current empty-registry behavior.
- Human-review registries must use bounded reason codes and safe relative paths.
- No API key, authorization header, absolute host path, raw Provider payload, or unbounded reviewer prose may reach plugin/dashboard output.
- Optional actions remain optional; `idle` remains the only required action.
- `running-left` remains derived from `running-right` and cannot be independently regenerated.
- This development task must not run tests, real Provider smoke, or visual acceptance. A separate testing branch owns all verification.
- Each task ends with a focused commit. Do not push.

---

### Task 1: Enforce one Provider reference image at every host boundary

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/main/services/image-generation-model-service.js`

**Interfaces:**
- Consumes: plugin bridge payload field `referenceImages` and public `imageGenerationModelService.generateImage({ referenceImages })`.
- Produces: `assertSingleReferenceImage(referenceImages, label)` behavior with one stable error message; multipart edits always use field name `image`.

- [ ] **Step 1: Add one shared message inside each ownership boundary**

Use the exact text so plugin and host failures remain recognizable:

```js
const SINGLE_REFERENCE_IMAGE_ERROR = 'Image generation accepts at most one reference image; compose multiple sources into one local reference board'

const assertSingleReferenceImage = (referenceImages) => {
  if (!Array.isArray(referenceImages) || referenceImages.length <= 1) return
  throw new Error(SINGLE_REFERENCE_IMAGE_ERROR)
}
```

Keep one local helper per service rather than creating a cross-layer dependency between main-process services and plugin runtime code.

- [ ] **Step 2: Reject plugin payloads before path resolution**

At the top of `sanitizeCreatorModelReferenceImages`:

```js
const sanitizeCreatorModelReferenceImages = (manifest, referenceImages = []) => {
  if (!Array.isArray(referenceImages)) return []
  assertSingleReferenceImage(referenceImages)
  return referenceImages.map((referenceImage) => {
    // Existing path and metadata sanitization stays unchanged.
  })
}
```

This avoids resolving or reading any second path.

- [ ] **Step 3: Reject public host requests before queue acquisition**

At the beginning of `generateImage`, before `ensureInsideDataDir`, logging, or `acquireProviderJobSlot`:

```js
const generateImage = async ({ prompt, output, constraints, timeoutMs, referenceImages = [], model = '' }) => {
  assertSingleReferenceImage(referenceImages)
  // Existing generation flow.
}
```

- [ ] **Step 4: Reject normalized edits before multipart construction**

Add the assertion inside `generateProviderImage` immediately after normalization and inside `buildProviderEditMultipartRequest` as a fail-closed internal invariant:

```js
const normalizedReferenceImages = normalizeReferenceImages(referenceImages)
assertSingleReferenceImage(normalizedReferenceImages)
```

```js
const buildProviderEditMultipartRequest = ({ model, prompt, constraints, referenceImages = [] }) => {
  assertSingleReferenceImage(referenceImages)
  const imageField = 'image'
  // Existing multipart construction.
}
```

Remove the `image[]` branch.

- [ ] **Step 5: Inspect the focused diff without running tests**

Run only:

```bash
git diff --check
git diff -- src/main/services/plugin-service.js src/main/services/image-generation-model-service.js
```

Expected: no whitespace errors; all three boundaries fail before Provider work.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/main/services/plugin-service.js src/main/services/image-generation-model-service.js
git commit -m "feat enforce single provider reference image"
```

---

### Task 2: Add human-review registries and versioned quality profiles

**Files:**
- Create: `examples/plugins/creator-studio/quality/pet-generation-human-examples.json`
- Create: `examples/plugins/creator-studio/quality/provider-art-approvals.json`
- Create: `examples/plugins/creator-studio/lib/pet-generation-human-examples.js`
- Create: `examples/plugins/creator-studio/lib/pet-generation-quality-profile.js`

**Interfaces:**
- Produces: `loadHumanQualityExamples({ registryPath })`, `createQualityGuidanceSummary(registry)`, `loadQualityProfile({ profilePath, humanRegistry })`, `getDefaultQualityProfile()`, and `createQualityProfileEvidence(profile)`.
- Later tasks consume only normalized frozen objects and never raw registry data.

- [ ] **Step 1: Add valid empty registries**

`pet-generation-human-examples.json`:

```json
{
  "version": 1,
  "datasetId": "pet-generation-human-review-v1",
  "updatedAt": "2026-07-14T00:00:00.000Z",
  "examples": []
}
```

`provider-art-approvals.json`:

```json
{
  "version": 1,
  "updatedAt": "2026-07-14T00:00:00.000Z",
  "approvals": []
}
```

- [ ] **Step 2: Implement path-safe human-example loading**

Create a module with fixed decision and reason-code sets:

```js
const HUMAN_EXAMPLE_VERSION = 1
const HUMAN_DECISIONS = new Set(['approved', 'rejected'])
const HUMAN_REASON_CODES = new Set([
  'identity-drift',
  'semantic-mismatch',
  'static-motion',
  'transform-only-motion',
  'edge-contact',
  'background-contamination',
  'baseline-instability',
  'scale-instability',
  'direction-mismatch'
])
```

Normalize each record to:

```js
{
  id,
  actionId,
  decision,
  reasonCodes,
  evidenceRelativePath,
  metrics
}
```

Reject duplicate IDs, unsupported action IDs, invalid decisions, absolute/traversal paths, non-finite metrics, approved records with reasons, and rejected records without reasons.

- [ ] **Step 3: Produce bounded prompt guidance**

Expose:

```js
const createQualityGuidanceSummary = (registry) => ({
  datasetId: registry.datasetId,
  totalExamples: registry.examples.length,
  reasonCounts: { /* known reason code -> count */ },
  byActionId: { /* actionId -> known reason counts */ }
})
```

Do not include paths, sample IDs, timestamps, or reviewer text.

- [ ] **Step 4: Implement the immutable default quality profile**

Define `pet-generation-default-v1` with the current row thresholds and current host bridge thresholds:

```js
const DEFAULT_QUALITY_PROFILE = deepFreeze({
  version: 1,
  id: 'pet-generation-default-v1',
  sourceDatasetId: '',
  reviewEvidenceRelativePath: '',
  row: {
    visibleAlphaThreshold: 8,
    safeMarginPx: 4,
    maxAlphaCoverage: 0.9,
    maxCentroidDrift: 40,
    maxBaselineDrift: 30,
    maxSizeDrift: 0.35,
    minWavingUpperMotionRatio: 0.01,
    minLocomotionLowerMotionRatio: 0.01,
    maxIdentityCoreAverageMotionRatio: 0.32,
    maxIdentityCorePairMotionRatio: 0.5,
    maxIdentityMeanRgbDistance: 120,
    maxIdentityDescriptorDistance: 90,
    minJumpExcursion: 8,
    maxJumpReturnDrift: 6
  },
  keyframe: {
    maxIdentityDescriptorDistance: 90,
    maxActionIdentityDescriptorDistance: 70,
    minActionAnchorScore: 50,
    minActionKeyframeScore: 30,
    maxIdentityMeanRgbDistance: 120
  }
})
```

- [ ] **Step 5: Validate optional calibrated profiles as all-or-nothing**

`loadQualityProfile` returns the default profile when no path is supplied. A supplied profile must have a unique non-default ID, exact required keys, finite defensively bounded values, a `sourceDatasetId` matching the loaded human registry, and a safe non-empty `reviewEvidenceRelativePath`. Reject unknown threshold keys.

Return evidence via:

```js
const createQualityProfileEvidence = (profile) => ({
  version: profile.version,
  id: profile.id,
  sourceDatasetId: profile.sourceDatasetId
})
```

- [ ] **Step 6: Inspect and commit Task 2**

```bash
git diff --check
git diff -- examples/plugins/creator-studio/quality examples/plugins/creator-studio/lib/pet-generation-human-examples.js examples/plugins/creator-studio/lib/pet-generation-quality-profile.js
git add examples/plugins/creator-studio/quality examples/plugins/creator-studio/lib/pet-generation-human-examples.js examples/plugins/creator-studio/lib/pet-generation-quality-profile.js
git commit -m "feat add pet generation quality profiles"
```

---

### Task 3: Bind quality profiles and human guidance into QA, prompts, and boards

**Files:**
- Modify: `examples/plugins/creator-studio/lib/full-pet-row-qa.js`
- Modify: `examples/plugins/creator-studio/lib/real-atlas-builder.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/openpet-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/anchor-reference-board.js`

**Interfaces:**
- Consumes: Task 2 profile, profile evidence, and bounded guidance summary.
- Produces: QA artifacts with `qualityProfile`; prompts with fixed reason-based guidance; board metadata with profile ID and reason codes.

- [ ] **Step 1: Make row QA profile-driven without changing defaults**

Change the signature:

```js
const analyzeRowFrames = async ({
  actionId,
  frames,
  sourceKind,
  identityReferenceMeanRgb = null,
  identityReferenceDescriptor = null,
  qualityProfile = getDefaultQualityProfile()
}) => {
  const limits = qualityProfile.row
  // Replace literals with limits.*.
}
```

Return:

```js
qualityProfile: createQualityProfileEvidence(qualityProfile)
```

Replace every current row threshold literal, including alpha threshold, margin, motion, identity, jump, centroid, baseline, and size limits.

- [ ] **Step 2: Thread the active profile through atlas construction**

Load the profile once in `buildRealAtlasFromGeneratedImage` and pass it into every `analyzeRowFrames` call. Add the same profile evidence to the final atlas QA JSON so row and atlas records agree.

- [ ] **Step 3: Make keyframe and anchor evaluation profile-driven**

In `host-model-bridge.js`, remove the four quality constants now owned by the profile. Add `qualityProfile` parameters to `scoreActionAnchorMetrics`, `evaluateActionKeyframeQuality`, `generateActionKeyframe`, `generateKeyframeActionSpriteRow`, `generateAnchorReferences`, `generateFullPetBasicActionSource`, and their callers.

Use:

```js
const keyframeLimits = qualityProfile.keyframe
```

Every keyframe quality record and Provider generation stage includes `qualityProfile: createQualityProfileEvidence(qualityProfile)`.

- [ ] **Step 4: Load governance context once per host generation**

Add a helper near `generateViaHostModelBridge`:

```js
const loadPetGenerationGovernance = () => {
  const humanRegistry = loadHumanQualityExamples({ registryPath: DEFAULT_HUMAN_EXAMPLES_PATH })
  const qualityProfile = loadQualityProfile({ humanRegistry })
  return {
    humanRegistry,
    qualityProfile,
    guidance: createQualityGuidanceSummary(humanRegistry)
  }
}
```

Attach bounded governance metadata to the generation result:

```js
qualityGovernance: {
  datasetId: humanRegistry.datasetId,
  exampleCount: humanRegistry.examples.length,
  qualityProfile: createQualityProfileEvidence(qualityProfile)
}
```

- [ ] **Step 5: Add fixed phrase guidance to prompt builders**

Add optional `qualityGuidance` arguments. Map known reason codes to fixed text inside the prompt modules, for example:

```js
const QUALITY_GUIDANCE_PHRASES = Object.freeze({
  'identity-drift': 'Preserve the exact species, silhouette, proportions, markings, palette, material treatment, and accessories from the identity reference.',
  'semantic-mismatch': 'Make the requested action peak immediately readable and distinct from every other state.',
  'static-motion': 'Author genuine pose progression; do not repeat one pose.',
  'transform-only-motion': 'Do not simulate motion by only translating, scaling, rotating, or recoloring one base sprite.',
  'edge-contact': 'Keep the complete body inside safe transparent padding.',
  'background-contamination': 'Return one isolated character with no floor, shadow, scenery, labels, or border.',
  'baseline-instability': 'Keep a stable lower-center root except where vertical action semantics require movement.',
  'scale-instability': 'Keep character scale consistent across the sequence.',
  'direction-mismatch': 'Preserve the requested facing direction throughout the directional row.'
})
```

Append only reasons present globally or for the current action. Do not append registry paths or sample IDs.

- [ ] **Step 6: Record governance metadata in reference boards**

Add optional parameters:

```js
qualityProfile = getDefaultQualityProfile(),
qualityGuidance = null
```

Write metadata:

```js
qualityProfile: createQualityProfileEvidence(qualityProfile),
guidanceReasonCodes: resolveGuidanceReasonCodes({ qualityGuidance, actionId }),
panelAuthority: 'identity-primary-pose-guidance-secondary'
```

Do not render labels into pixels and do not change the single-board output.

- [ ] **Step 7: Inspect and commit Task 3**

```bash
git diff --check
git diff -- examples/plugins/creator-studio/lib/full-pet-row-qa.js examples/plugins/creator-studio/lib/real-atlas-builder.js examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/anchor-prompt-builder.js examples/plugins/creator-studio/lib/openpet-prompt-builder.js examples/plugins/creator-studio/lib/anchor-reference-board.js
git add examples/plugins/creator-studio/lib/full-pet-row-qa.js examples/plugins/creator-studio/lib/real-atlas-builder.js examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/anchor-prompt-builder.js examples/plugins/creator-studio/lib/openpet-prompt-builder.js examples/plugins/creator-studio/lib/anchor-reference-board.js
git commit -m "feat apply pet generation quality governance"
```

---

### Task 4: Add action-scoped and identity-scoped repair

**Files:**
- Modify: `examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Create: `examples/plugins/creator-studio/commands/retry-action.js`
- Create: `examples/plugins/creator-studio/commands/retry-identity.js`
- Modify: `examples/plugins/creator-studio/plugin.json`
- Modify: `examples/plugins/creator-studio/service/studio-service.js`
- Modify: `examples/plugins/creator-studio/web/dashboard/index.html`
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc/register-creator-ipc.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `control-center-preload.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`
- Modify: `src/control-center/src/hooks/useCreatorPane.ts`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`

**Interfaces:**
- Produces: `invalidateActionCheckpoint`, `invalidateAllActionCheckpoints`, `runFullPetActionRepair`, `runFullPetIdentityRepair`, plugin commands `retry-action` and `retry-identity`, Creator IPC methods, and dashboard repair actions.
- Reuses: successful hash-valid checkpoints and current run source/reference artifacts.

- [ ] **Step 1: Add atomic checkpoint invalidation**

Extend the checkpoint module:

```js
const invalidateActionCheckpoint = ({ dataDir, runId, actionId, reason = 'manual-repair', now = () => new Date().toISOString() }) => {
  const checkpoints = readActionCheckpoints({ dataDir, runId })
  delete checkpoints.actions?.[actionId]
  return writeCheckpointFile({ dataDir, runId, checkpoints, invalidation: { scope: 'action', actionIds: [actionId], reason, invalidatedAt: now() } })
}

const invalidateAllActionCheckpoints = ({ dataDir, runId, reason = 'identity-repair', now = () => new Date().toISOString() }) => {
  const checkpoints = readActionCheckpoints({ dataDir, runId })
  checkpoints.actions = {}
  return writeCheckpointFile({ dataDir, runId, checkpoints, invalidation: { scope: 'identity', actionIds: [], reason, invalidatedAt: now() } })
}
```

Refactor current atomic write logic into `writeCheckpointFile` so all writes retain version, run ID, and timestamps.

- [ ] **Step 2: Let action generation retry only requested missing actions**

Add `requestedActionIds = GENERATED_FULL_PET_ACTION_IDS` to `generateFullPetBasicActionSources`. Iterate every generated action ID to collect reusable rows, but call the Provider only when the ID is in `requestedActionIds` and no reusable checkpoint exists.

Return:

```js
basicActionGeneration: {
  requestedActionIds: normalizedRequestedActionIds,
  attemptedActionIds,
  reusedActionIds,
  attempts
}
```

For `running-right`, recreate and QA `running-left` from the reusable or regenerated source. Reject `running-left` in `requestedActionIds`.

- [ ] **Step 3: Add a host-bridge action repair entry**

Export:

```js
const regenerateFullPetActionsViaHostModelBridge = async ({ dataDir, run, actionIds }) => {
  const settings = await readHostModelSettings()
  const modelSnapshot = createModelSnapshot({ backend: PROVIDER_BACKEND, settings })
  const governance = loadPetGenerationGovernance()
  const referenceImages = resolveExistingFullPetRepairReferences({ dataDir, run })
  const repaired = await generateFullPetBasicActionSources({
    dataDir,
    run,
    settings,
    selectedModel: modelSnapshot.model,
    requestedTimeoutMs: Math.max(Number(settings.timeoutMs) || 0, CREATOR_PROVIDER_MIN_TIMEOUT_MS),
    referenceImages,
    requestedActionIds: actionIds,
    qualityProfile: governance.qualityProfile,
    qualityGuidance: governance.guidance
  })
  return mergeRepairedActionsIntoGenerationResult({ previous: run.artifacts.generatedImage, repaired, modelSnapshot, governance })
}
```

Repair must reuse the validated original reference or existing canonical generated output and must not regenerate the canonical identity for action scope.

- [ ] **Step 4: Add backend-runner repair operations**

Implement:

```js
runFullPetActionRepair({ dataDir, runId, actionId, now })
runFullPetIdentityRepair({ dataDir, runId, now })
```

Action repair requirements:

- full-pet Provider run;
- status `failed` or `ready_for_review`;
- official generated action ID other than `running-left`;
- invalidate target checkpoint;
- invalidate approval/import fields and derived atlas artifacts;
- call `regenerateFullPetActionsViaHostModelBridge`;
- call existing `buildHostGeneratedRunOutput` to rebuild atlas and review artifacts;
- preserve prior failed outputs in run logs/evidence.

Identity repair requirements:

- invalidate all checkpoints;
- remove anchor references, generated image, outputs, atlas, previews, QA, approval, and import readiness;
- retain validated source input and generation task;
- call existing `runGenerationStep` for a true full regeneration.

- [ ] **Step 5: Add plugin commands and dashboard endpoints**

Add commands:

```text
retry-action -- payload { runId, actionId }
retry-identity -- payload { runId }
```

Add service routes:

```text
POST /api/runs/:runId/actions/:actionId/retry
POST /api/runs/:runId/identity/retry
```

Return public run, action review, full-pet review, and bounded repair scope. Add action repair buttons only for omitted/failed generated actions; show identity repair as a distinct destructive regeneration command. Use text buttons because these are explicit commands and the existing dashboard does not currently load an icon library.

- [ ] **Step 6: Add host IPC and Control Center repair calls**

Add IPC constants:

```js
CREATOR_RETRY_ACTION: 'creator:retry-action'
CREATOR_RETRY_IDENTITY: 'creator:retry-identity'
```

Expose service methods:

```js
retryFullPetAction({ runId, actionId })
retryFullPetIdentity({ runId })
```

They run the new plugin commands through the existing `runExclusively` boundary and return `CreatorWorkflowResult` with state `review-required` or `failed`. They never auto-approve or auto-import repaired output.

Add contract types:

```ts
export interface CreatorRetryActionRequest { runId: string; actionId: string }
export interface CreatorRetryIdentityRequest { runId: string }
```

Add preload/API methods and expose matching callbacks from `useCreatorPane` and `CreatorPane` only when the last full-pet run has a run ID and is repairable. The default UI action should continue opening Creator Studio for detailed review; the bounded retry methods provide host parity and testable IPC access.

- [ ] **Step 7: Inspect and commit Task 4**

```bash
git diff --check
git status --short
git add examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/backend-runner.js examples/plugins/creator-studio/commands/retry-action.js examples/plugins/creator-studio/commands/retry-identity.js examples/plugins/creator-studio/plugin.json examples/plugins/creator-studio/service/studio-service.js examples/plugins/creator-studio/web/dashboard/index.html src/shared/ipc-channels.js src/shared/ipc-channels.ts src/main/ipc/register-creator-ipc.js src/main/services/creator-workflow-service.js control-center-preload.js src/shared/openpet-contracts.ts src/control-center/src/api/demo-control-center-api.ts src/control-center/src/hooks/useCreatorPane.ts src/control-center/src/panes/CreatorPane.tsx
git commit -m "feat repair pet generation at smallest scope"
```

---

### Task 5: Add Provider production-art promotion claims

**Files:**
- Create: `examples/plugins/creator-studio/lib/provider-art-approval.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/service/studio-service.js`
- Modify: `examples/plugins/creator-studio/web/dashboard/index.html`
- Modify: `scripts/run-creator-workflow-host-smoke.js`

**Interfaces:**
- Produces: `loadProviderArtApprovals`, `resolveProviderArtReadiness`, generation result field `artReadiness`, and bounded dashboard/smoke claim text.

- [ ] **Step 1: Validate Provider approval records**

Implement exact-match records:

```js
{
  id,
  provider,
  model,
  qualityProfileId,
  datasetId,
  decision: 'approved',
  reviewedAt,
  evidenceRelativePath
}
```

Reject duplicate IDs, missing exact-match fields, unsupported decisions, invalid dates, and unsafe paths. The empty registry remains valid.

- [ ] **Step 2: Resolve bounded readiness claims**

Expose:

```js
const resolveProviderArtReadiness = ({ approvals, provider, model, qualityProfile, datasetId }) => {
  const match = approvals.find(/* exact approved match */)
  return match
    ? {
        level: 'production-art-ready',
        approved: true,
        approvalId: match.id,
        evidenceRelativePath: match.evidenceRelativePath
      }
    : {
        level: 'technical-chain-ready',
        approved: false,
        reason: 'no-matching-human-art-approval'
      }
}
```

An approval never changes row QA, run approval, or import rules.

- [ ] **Step 3: Attach claim metadata to generation results**

After settings and governance are resolved in the host bridge, load approvals and attach `artReadiness` to success and partial failure results. Match exact Provider, model, profile ID, and dataset ID.

- [ ] **Step 4: Present claims without overstatement**

Dashboard review surfaces show one of:

```text
Provider art status: production-art-ready (human approval record approvalId)
Provider art status: technical-chain-ready; no matching human art approval
```

The smoke JSON adds the structured `artReadiness` object and never sets an artistic success flag from HTTP/QA success alone.

- [ ] **Step 5: Inspect and commit Task 5**

```bash
git diff --check
git diff -- examples/plugins/creator-studio/lib/provider-art-approval.js examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/service/studio-service.js examples/plugins/creator-studio/web/dashboard/index.html scripts/run-creator-workflow-host-smoke.js
git add examples/plugins/creator-studio/lib/provider-art-approval.js examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/service/studio-service.js examples/plugins/creator-studio/web/dashboard/index.html scripts/run-creator-workflow-host-smoke.js
git commit -m "feat gate provider production art claims"
```

---

### Task 6: Update the canonical document and prepare independent testing handoff

**Files:**
- Modify: `docs/pet-character-generation.md`
- Modify: `examples/plugins/creator-studio/README.md`
- Create: `docs/superpowers/plans/2026-07-14-pet-generation-quality-governance-test-handoff.md`

**Interfaces:**
- Produces: current documentation for implemented contracts and a bounded test-task brief that a new branch can execute without relying on this conversation.

- [ ] **Step 1: Update current implementation truth**

In the canonical document:

- move all five items out of “Known Limitations And Next Engineering Work”;
- document profile IDs in QA evidence;
- document action- and identity-scoped repair;
- document human-example and Provider approval registries;
- retain the explicit boundary that development completion is not test or visual acceptance.

Update the Creator Studio README with registry locations, repair commands/routes, and claim levels.

- [ ] **Step 2: Write the independent test handoff**

The handoff must state:

```text
Source branch: codex/dev8
Required starting commit: run `git rev-parse HEAD` after Task 5 and write the resulting 40-character commit hash here before committing the handoff
Testing branch: a new isolated codex/dev8-quality-governance-test branch/worktree
Do not modify or rewrite codex/dev8
```

It must assign the testing task to:

- add/adjust automated tests for all new contracts;
- run `npm run check:syntax`;
- run focused Node suites for image service, plugin service, Creator Studio bridge, row QA, atlas, checkpoints, backend runner, workflow service, IPC, docs, and smoke script;
- run `npm run test:core` and relevant Control Center tests;
- create real human-approved and human-rejected examples;
- calibrate a non-default profile only from those labels;
- exercise action and identity repair;
- run real Provider smoke with reference count assertions;
- perform human contact-sheet, animation, identity, transparency, scale, baseline, and atlas review;
- create a Provider art approval only after acceptance;
- report exact failures and commits without merging or pushing unless requested.

- [ ] **Step 3: Inspect and commit Task 6**

```bash
git diff --check
git diff -- docs/pet-character-generation.md examples/plugins/creator-studio/README.md docs/superpowers/plans/2026-07-14-pet-generation-quality-governance-test-handoff.md
git add docs/pet-character-generation.md examples/plugins/creator-studio/README.md docs/superpowers/plans/2026-07-14-pet-generation-quality-governance-test-handoff.md
git commit -m "docs hand off pet quality governance testing"
```

---

## Development Completion Check

Do not run test, build, syntax, smoke, Provider, browser, or visual-verification commands on `codex/dev8`.

After all six tasks:

```bash
git diff --check
git status --short --branch
git log -7 --oneline
```

Expected:

- worktree clean;
- branch remains `codex/dev8`;
- six focused implementation/documentation commits follow the design and plan commits;
- nothing pushed or merged;
- no generated smoke or visual evidence committed.

Then create a new isolated Codex testing task/branch using the handoff document. The testing task, not this development task, runs all verification and produces the acceptance result.
