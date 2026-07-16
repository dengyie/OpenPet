# Provider Generation Reliability Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not dispatch implementation subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Provider image requests deterministic about output count, recover one transient network failure in-run, and condition full-pet action generation on the canonical identity without weakening QA.

**Architecture:** Keep request-count enforcement in the main-process image service, bounded retry and Creator Studio delivery invariants in the host bridge, and action-specific motion language in the semantics/prompt modules. Build one local full-pet action identity board so Provider calls still receive at most one reference image while keyframe QA compares against the canonical generated identity.

**Tech Stack:** Node.js CommonJS, Electron main-process services, Creator Studio host bridge, Sharp reference-board generation, JSON evidence metadata.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/ff3f/OpenPet` on `codex/dev8`.
- Preserve all existing commits; do not reset, rewrite, push, merge, or touch another worktree.
- Do not run tests, builds, syntax checks, Provider calls, browser checks, or visual acceptance on `codex/dev8`.
- Run only read-only source inspection, `git diff --check`, focused `git diff`, status, and log commands.
- Every Provider image request continues to accept zero or one reference image.
- Do not select the first item from an ambiguous deliverable multi-output response.
- Do not lower quality-profile thresholds or bypass keyframe, row, atlas, human-review, approval, import, or activation gates.
- Do not create human labels, calibrated profiles, Provider approvals, or production-art-ready claims on this branch.
- Each implementation task ends in a focused commit. Do not push.

---

### Task 1: Request exactly one Provider output and improve bounded transport evidence

**Files:**
- Modify: `src/main/services/image-generation-model-service.js`

**Interfaces:**
- Produces: Provider payload field `n: 1`, conditioning field `requestedOutputCount`, request log field `requestedOutputCount`, and sanitized `errorCauseCode` on transport failures.
- Preserves: materialization of all returned outputs and existing single-reference enforcement.

- [ ] **Step 1: Add the fixed output-count contract and safe cause-code helper**

Near the Provider constants add:

```js
const REQUESTED_PROVIDER_OUTPUT_COUNT = 1
```

Near `isAbortError` add:

```js
const getSafeTransportCauseCode = (error) => String(
  error?.cause?.code || error?.code || ''
).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80)
```

- [ ] **Step 2: Add `n=1` to both request formats**

Update `buildProviderGenerationPayload`:

```js
const payload = {
  model,
  prompt,
  size: `${constraints.width}x${constraints.height}`,
  n: REQUESTED_PROVIDER_OUTPUT_COUNT
}
```

Update `buildProviderEditMultipartRequest` after `size`:

```js
appendMultipartTextPart(buffers, boundary, 'n', REQUESTED_PROVIDER_OUTPUT_COUNT)
```

- [ ] **Step 3: Record requested count in conditioning and logs**

Add to `createConditioningSummary`:

```js
requestedOutputCount: REQUESTED_PROVIDER_OUTPUT_COUNT,
```

Add the same field to `imageGeneration.provider.request.started` details. In the transport catch add:

```js
errorCauseCode: getSafeTransportCauseCode(error),
```

Do not include raw cause messages.

- [ ] **Step 4: Inspect and commit Task 1**

```bash
git diff --check
git diff -- src/main/services/image-generation-model-service.js
git add src/main/services/image-generation-model-service.js
git commit -m "fix request one provider image output"
```

---

### Task 2: Retry transient fetch failures and enforce actual deliverable row output count

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`

**Interfaces:**
- Produces: `isTransientGatewayHttpFailure(error)` behavior that includes bounded transport failures and a fail-closed one-output invariant for final keyframe sprite rows.
- Consumes: the existing two-attempt model loop and existing Provider response output array.

- [ ] **Step 1: Extend the transient predicate without changing retry budgets**

Keep the exported function name for compatibility and implement:

```js
const TRANSIENT_TRANSPORT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
])

const isTransientGatewayHttpFailure = (error) => {
  const message = String(error?.message || error || '').trim()
  const normalizedMessage = message.toLowerCase()
  const causeCode = String(error?.cause?.code || error?.code || '').trim().toUpperCase()
  if (
    normalizedMessage.includes('fetch failed') ||
    normalizedMessage.includes('connection reset') ||
    normalizedMessage.includes('socket closed') ||
    TRANSIENT_TRANSPORT_ERROR_CODES.has(causeCode)
  ) return true
  const statusMatch = message.match(/generation failed with HTTP\s+(\d{3})/i)
  if (!statusMatch) return false
  const status = Number(statusMatch[1])
  return status === 408 || status === 425 || status === 429 ||
    (status >= 500 && status <= 504) ||
    (status >= 520 && status <= 524)
}
```

Do not change `MAX_TRANSIENT_GATEWAY_ATTEMPTS_PER_MODEL`, retry delay, or deadline accounting.

- [ ] **Step 2: Enforce one actual final sprite-row output**

Inside `generateKeyframeActionSpriteRow`, declare `let providerOutputCount = 0` before the final-stage `try`, then replace first-output selection with:

```js
const outputs = filterExistingGeneratedOutputs({
  dataDir,
  outputs: Array.isArray(attempt.response?.result?.outputs)
    ? attempt.response.result.outputs
    : []
})
providerOutputCount = outputs.length
if (outputs.length !== 1) {
  const error = new Error(
    `Creator Studio keyframe sprite row generation requires exactly one complete provider output for ${actionId}; received ${outputs.length}`
  )
  error.modelAttempts = attempt.attempts
  error.providerOutputCount = outputs.length
  throw error
}
const materializedOutput = createOutputFromGeneratedPath({ dataDir, output: outputs[0] })
```

Use the actual count in success and failure stage evidence:

```js
outputCount: outputs.length
```

In the catch, record `outputCount: Number(error?.providerOutputCount ?? providerOutputCount) || 0` rather than always recording zero.

- [ ] **Step 3: Inspect and commit Task 2**

```bash
git diff --check
git diff -- examples/plugins/creator-studio/lib/host-model-bridge.js
git add examples/plugins/creator-studio/lib/host-model-bridge.js
git commit -m "fix retry transient provider transport failures"
```

---

### Task 3: Bind full-pet action generation to one canonical identity board

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`

**Interfaces:**
- Produces: `createFullPetActionIdentityContext({ dataDir, run, baseOutputs, originalReferenceImages, qualityProfile, qualityGuidance })` returning Provider references, canonical QA references, and bounded evidence.
- Extends: `generateKeyframeActionSpriteRow`, `generateFullPetBasicActionSource`, and `generateFullPetBasicActionSources` with `qualityReferenceImages`.

- [ ] **Step 1: Add the identity-context helper beside generated-output reference helpers**

Implement:

```js
const createFullPetActionIdentityContext = async ({
  dataDir,
  run,
  baseOutputs = [],
  originalReferenceImages = [],
  qualityProfile = getDefaultQualityProfile(),
  qualityGuidance = null
}) => {
  const canonicalReference = createGeneratedOutputReferenceImage({
    dataDir,
    output: baseOutputs[0],
    role: 'canonical-generated-identity'
  })
  const usableOriginal = hasUsableLocalReferenceImages(originalReferenceImages, dataDir)
    ? originalReferenceImages[0]
    : null
  if (!canonicalReference) {
    const references = usableOriginal ? [usableOriginal] : []
    return {
      referenceImages: references,
      qualityReferenceImages: references,
      evidence: null
    }
  }
  const sourceReferences = [canonicalReference, usableOriginal].filter(Boolean)
  if (sourceReferences.length === 1) {
    return {
      referenceImages: [canonicalReference],
      qualityReferenceImages: [canonicalReference],
      evidence: {
        role: canonicalReference.role,
        relativePath: canonicalReference.relativePath,
        metadataRelativePath: ''
      }
    }
  }
  const board = await buildAnchorReferenceBoard({
    dataDir,
    runId: run.runId,
    sourceReferences,
    characterBrief: `${resolveAnchorCharacterBrief(run)} Canonical generated identity is the pose, framing, scale, and cross-row continuity authority; original source remains the visible-detail authority.`,
    outputRelativeDir: path.join('runs', run.runId, 'inputs', 'keyframes', 'identity').replace(/\\/g, '/'),
    boardRole: 'full-pet-action-identity-board',
    fileBaseName: 'full-pet-action-identity-board',
    qualityProfile,
    qualityGuidance
  })
  const boardReference = {
    path: board.path,
    fileName: path.basename(board.relativePath),
    relativePath: board.relativePath,
    metadataRelativePath: board.metadataRelativePath,
    role: board.role
  }
  return {
    referenceImages: [boardReference],
    qualityReferenceImages: [canonicalReference],
    evidence: {
      role: board.role,
      relativePath: board.relativePath,
      metadataRelativePath: board.metadataRelativePath,
      qualityReferenceRole: canonicalReference.role,
      qualityReferenceRelativePath: canonicalReference.relativePath
    }
  }
}
```

- [ ] **Step 2: Separate Provider and QA references through action generation**

Add `qualityReferenceImages = referenceImages` to `generateFullPetBasicActionSource` and `generateFullPetBasicActionSources`, pass it through their calls, and add `qualityReferenceImages = originalReferenceImages` to `generateKeyframeActionSpriteRow`.

For the start keyframe call use:

```js
referenceImages: normalizedOriginalReferenceImages,
qualityReferenceImages: normalizedQualityReferenceImages,
```

For peak keyframe QA also use `normalizedQualityReferenceImages`.

- [ ] **Step 3: Use the identity context in normal generation and scoped repair**

After base output validation in normal full-pet generation:

```js
const actionIdentityContext = await createFullPetActionIdentityContext({
  dataDir,
  run,
  baseOutputs,
  originalReferenceImages,
  qualityProfile,
  qualityGuidance
})
```

Pass its `referenceImages` and `qualityReferenceImages` into action generation and attach:

```js
actionIdentityReference: actionIdentityContext.evidence
```

Repeat the same construction in scoped repair using `previousGenerationResult.outputs`. If no usable reference exists, keep the current explicit failure.

- [ ] **Step 4: Preserve evidence in success and partial results**

Attach the bounded `actionIdentityReference` object to normal full-pet results, partial action-generation results, and scoped repair results. Do not expose absolute paths.

- [ ] **Step 5: Inspect and commit Task 3**

```bash
git diff --check
git diff -- examples/plugins/creator-studio/lib/host-model-bridge.js
git add examples/plugins/creator-studio/lib/host-model-bridge.js
git commit -m "fix bind pet actions to canonical identity"
```

---

### Task 4: Give idle a strict minimal-motion semantic contract

**Files:**
- Modify: `examples/plugins/creator-studio/lib/action-semantics.js`
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`

**Interfaces:**
- Produces: `isIdleAction(value)`, idle-specific frame plans, animated-part descriptions, keyframe pose instructions, and prompt language.

- [ ] **Step 1: Add and export `isIdleAction`**

```js
const isIdleAction = (value = '') => /(^|\s)(idle|idling|resting-idle)(\s|$)|待机|空闲/i.test(
  typeof value === 'object' ? getActionText(value) : normalizeText(value)
)
```

Check it before other classifiers in `inferAnimationTypeFromText` and return `stationary_loop`.

- [ ] **Step 2: Add idle motion and frame-plan semantics**

In `resolvePrimaryAnimatedPart` return:

```js
if (isIdleAction(action)) return 'subtle chest breathing, blink, ear movement, and tail-tip motion only'
```

At the start of `buildActionFramePlan` after custom plans:

```js
if (isIdleAction(action)) {
  return [
    'Frame 1: match the canonical identity pose, viewpoint, silhouette, scale, markings, accessories, and lower-center root exactly.',
    `Frame ${Math.max(2, Math.ceil(count / 2))}: add only a subtle breathing, blink, ear, or tail-tip change without moving the body root or redesigning any feature.`,
    `Frame ${count}: settle back to the canonical frame-1 pose for a seamless quiet loop.`
  ]
}
```

In `getKeyframePoseInstruction`, handle idle before generic stationary behavior:

```js
if (isIdleAction(action)) {
  return isStart
    ? 'Pose: match the canonical reference pose and viewpoint as closely as possible; do not force a new front-facing view or change limb placement merely to neutralize the pose.'
    : 'Pose: preserve the canonical pose and silhouette with only a subtle breathing, blink, ear, or tail-tip change; no action extreme or large limb movement.'
}
```

- [ ] **Step 3: Make keyframe prompt wording idle-aware**

Import `isIdleAction` in `anchor-prompt-builder.js`. In `buildActionKeyframePrompt`, compute `const idleAction = isIdleAction(action)` and replace the generic role text with:

```js
idleAction
  ? (isStart
      ? 'Keyframe role: IDLE START. Match the canonical identity pose and viewpoint; this is not a redesign or pose-normalization request.'
      : 'Keyframe role: IDLE MOTION PEAK. Show only a minimal loopable breathing, blink, ear, or tail-tip change from the canonical pose.')
  : (isStart
      ? 'Keyframe role: START FRAME. Create the neutral first frame before the action begins.'
      : `Keyframe role: PEAK/END FRAME. Create the clearest action extreme: ${movingPart} reaches the requested motion pose.`)
```

When `referenceRole` is `full-pet-action-identity-board`, add fixed text explaining that the canonical primary panel controls pose/framing/scale and the original source panel controls visible details; never copy the board layout.

- [ ] **Step 4: Inspect and commit Task 4**

```bash
git diff --check
git diff -- examples/plugins/creator-studio/lib/action-semantics.js examples/plugins/creator-studio/lib/anchor-prompt-builder.js
git add examples/plugins/creator-studio/lib/action-semantics.js examples/plugins/creator-studio/lib/anchor-prompt-builder.js
git commit -m "fix preserve canonical identity in idle actions"
```

---

### Task 5: Document the follow-up and create a new independent test handoff

**Files:**
- Modify: `docs/pet-character-generation.md`
- Create: `docs/superpowers/plans/2026-07-14-provider-generation-reliability-test-handoff.md`

**Interfaces:**
- Produces: current documentation truth and a self-contained testing prompt based on the final development HEAD.

- [ ] **Step 1: Update current truth**

Document:

- Provider requests explicitly ask for one output and still reject deliverable multi-output responses;
- one bounded same-model retry covers transient `fetch failed` transport errors;
- full-pet action calls use one canonical identity board and canonical QA reference;
- idle uses minimal-motion semantics;
- all changes are implemented but unverified until independent Provider and visual acceptance succeeds.

- [ ] **Step 2: Write the test handoff after Task 4**

Record the exact 40-character Task 4 HEAD as the required implementation ancestor. Require a new isolated branch such as `codex/dev8-provider-reliability-test`, never modifying `codex/dev8` or the previous test branch.

Assign the new task to add/update automated tests, run all syntax/core/core-all/Control Center/focused suites, rerun real action and full-pet Provider smoke, prove request `n=1` and actual output counts, reproduce transient retry, obtain a successful full-pet run, exercise action and identity repair, create real human labels, calibrate only from real labels, perform visual acceptance, and add Provider approval only after acceptance.

- [ ] **Step 3: Inspect and commit Task 5**

```bash
git diff --check
git diff -- docs/pet-character-generation.md docs/superpowers/plans/2026-07-14-provider-generation-reliability-test-handoff.md
git add docs/pet-character-generation.md docs/superpowers/plans/2026-07-14-provider-generation-reliability-test-handoff.md
git commit -m "docs hand off provider reliability verification"
```

---

## Development Completion Check

Do not run tests, builds, syntax checks, Provider smoke, browser checks, or visual verification on `codex/dev8`.

Run only:

```bash
git diff --check
git status --short --branch
git log -7 --oneline
```

Expected: clean `codex/dev8`, all prior commits preserved, focused follow-up commits present, nothing pushed or merged, and status reported as implemented but unverified. Then create and start the independent testing task from the final development commit.
