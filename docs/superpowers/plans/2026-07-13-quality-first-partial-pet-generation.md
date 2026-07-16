# Quality-First Partial Pet Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver importable Creator Studio pets with one required high-quality `idle` action and zero or more QA-approved optional actions, while omitting weak actions and preserving stable nine-row atlas compatibility.

**Architecture:** Introduce an explicit action-availability policy and durable per-action checkpoint store. Provider orchestration continues after optional failures, the atlas composer leaves missing rows transparent, QA/import require only approved `idle`, and Codex pet loading exposes only available actions while retaining the fixed atlas coordinates.

**Tech Stack:** Node.js CommonJS, Node native test runner, Sharp, Electron service layer, JSON pet-pack manifests.

## Global Constraints

- `idle` is the only required production action.
- `running-right` and mirrored `running-left` are one optional atomic pair.
- Failed or unreviewed actions must never be counted as production actions.
- Existing identity, transparency, composition, motion, semantic, hash, and atlas QA thresholds must not be lowered.
- Every Provider image request must contain at most one reference image.
- The atlas remains 1536x1872 with nine stable official row slots.
- Missing action rows must remain fully transparent and must not copy `idle` art.
- Human approval remains required before import.
- Existing complete pet packs without availability metadata remain compatible.
- Do not commit Provider outputs, temporary artifacts, secrets, `dist/`, or `node_modules/`.

---

### Task 1: Define required, optional, directional, and availability policy

**Files:**
- Modify: `examples/plugins/creator-studio/lib/full-pet-basic-actions.js`
- Test: `tests/examples/creator-studio-full-pet-basic-actions.test.js`

**Interfaces:**
- Produces: `REQUIRED_REAL_FULL_PET_ACTION_IDS`, `OPTIONAL_REAL_FULL_PET_ACTION_IDS`, `DIRECTIONAL_FULL_PET_ACTION_PAIRS`, `createBasicActionCoverage(rows, attempts)`.
- Coverage output adds `availableActionIds`, `omittedActionIds`, and `actionAvailability`.

- [ ] **Step 1: Write failing policy tests**

Add assertions equivalent to:

```js
assert.deepEqual(REQUIRED_REAL_FULL_PET_ACTION_IDS, ['idle'])
assert.deepEqual(DIRECTIONAL_FULL_PET_ACTION_PAIRS, [{ sourceActionId: 'running-right', derivedActionId: 'running-left' }])
assert.equal(OPTIONAL_REAL_FULL_PET_ACTION_IDS.includes('waving'), true)

const coverage = createBasicActionCoverage([
  { actionId: 'idle', quality: 'row-real' },
  { actionId: 'waving', quality: 'row-real' }
], [
  { actionId: 'running-right', ok: false, failureConditions: ['identity-descriptor-distance-high'] }
])
assert.deepEqual(coverage.requiredRealActionIds, ['idle'])
assert.deepEqual(coverage.availableActionIds, ['idle', 'waving'])
assert.equal(coverage.actionAvailability['running-right'].available, false)
assert.equal(coverage.actionAvailability['running-right'].reason, 'identity-descriptor-distance-high')
```

- [ ] **Step 2: Run policy tests and confirm RED**

Run:

```bash
node --test tests/examples/creator-studio-full-pet-basic-actions.test.js
```

Expected: failure because every official row is currently required and availability metadata is absent.

- [ ] **Step 3: Implement explicit policy**

Use explicit entries instead of deriving identical policy for every row:

```js
const REQUIRED_REAL_FULL_PET_ACTION_IDS = Object.freeze(['idle'])
const DIRECTIONAL_FULL_PET_ACTION_PAIRS = Object.freeze([
  Object.freeze({ sourceActionId: 'running-right', derivedActionId: 'running-left' })
])
const OPTIONAL_REAL_FULL_PET_ACTION_IDS = Object.freeze(
  OFFICIAL_FULL_PET_ACTION_IDS.filter((actionId) => actionId !== 'idle')
)
const GENERATED_FULL_PET_ACTION_IDS = Object.freeze(
  OFFICIAL_FULL_PET_ACTION_IDS.filter((actionId) => actionId !== 'running-left')
)
```

Extend `createBasicActionCoverage(rows, attempts = [])` so real rows become available, missing official rows become omitted, and attempt failure conditions provide bounded omission reasons.

- [ ] **Step 4: Run policy tests and confirm GREEN**

Run the Task 1 command. Expected: all tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add examples/plugins/creator-studio/lib/full-pet-basic-actions.js tests/examples/creator-studio-full-pet-basic-actions.test.js
git commit -m "feat creator pet action availability policy"
```

---

### Task 2: Continue after optional action failures and preserve attempt evidence

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Test: `tests/examples/creator-studio-host-model-bridge.test.js`
- Test: `tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js`

**Interfaces:**
- Consumes: Task 1 required/optional policy.
- Produces: full-pet generation result with successful `officialRows`, all `basicActionGeneration.attempts`, `actionAvailability`, `keyframes`, and `generationStages`.

- [ ] **Step 1: Write failing orchestration tests**

Cover these cases with injected `generateActionSourceImpl`:

```js
test('optional action failure is omitted and later actions continue', async () => {
  const result = await __testInternals.generateFullPetBasicActionSources({
    // idle succeeds, running-right fails identity QA, waving succeeds
  })
  assert.deepEqual(result.officialRows.rows.map((row) => row.actionId), ['idle', 'waving'])
  assert.equal(result.basicActionGeneration.attempts.find((entry) => entry.actionId === 'running-right').ok, false)
  assert.equal(result.basicActionGeneration.attempts.find((entry) => entry.actionId === 'waving').ok, true)
})

test('required idle failure still rejects full-pet generation', async () => {
  await assert.rejects(() => generate(), /required idle/i)
})
```

Also assert that failed `running-right` creates no `running-left` row or Provider stage.

- [ ] **Step 2: Run focused bridge tests and confirm RED**

```bash
node --test tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js
```

Expected: optional failure currently throws immediately.

- [ ] **Step 3: Implement optional continuation**

In `generateFullPetBasicActionSources`:

```js
actionResults.push(result)
if (!result.ok) {
  if (actionId === 'idle') {
    const error = new Error(`Creator Studio required idle generation failed: ${result.error}`)
    error.partialActionSources = createPartialActionSources()
    throw error
  }
  continue
}
officialRows.push(result.row)
```

Mirror only after successful `running-right`. Mirror failure records an omitted pair and continues. Return availability derived from successful rows and attempts.

In `generateViaHostModelBridge`, reject only missing or failed required actions. Optional failed attempts remain in the successful review-draft result.

- [ ] **Step 4: Run focused bridge tests and confirm GREEN**

Run Task 2 command. Expected: pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add examples/plugins/creator-studio/lib/host-model-bridge.js tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js
git commit -m "feat continue after optional pet action failures"
```

---

### Task 3: Add durable per-action checkpoints and scoped retry

**Files:**
- Create: `examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Test: `tests/examples/creator-studio-full-pet-action-checkpoints.test.js`
- Test: `tests/examples/creator-studio-host-model-bridge.test.js`

**Interfaces:**
- Produces:

```js
readActionCheckpoints({ dataDir, runId })
writeActionCheckpoint({ dataDir, runId, result, now })
resolveReusableActionResult({ dataDir, runId, actionId })
```

- Checkpoint path: `runs/<runId>/checkpoints/full-pet-actions.json`.

- [ ] **Step 1: Write failing checkpoint tests**

Test successful round-trip, path escape rejection, missing frame invalidation, changed frame hash invalidation, and omission record round-trip.

Example assertion:

```js
const reusable = resolveReusableActionResult({ dataDir, runId, actionId: 'idle' })
assert.equal(reusable.ok, true)
fs.writeFileSync(reusable.row.frames[0].path, 'changed')
assert.equal(resolveReusableActionResult({ dataDir, runId, actionId: 'idle' }), null)
```

- [ ] **Step 2: Run checkpoint tests and confirm RED**

```bash
node --test tests/examples/creator-studio-full-pet-action-checkpoints.test.js
```

Expected: module does not exist.

- [ ] **Step 3: Implement safe checkpoint storage**

Store only data-relative paths and SHA-256 hashes. Resolve every reused frame inside `dataDir`, require a regular file, verify the hash, and reconstruct absolute frame paths only in memory.

Use atomic writes:

```js
const temporaryPath = `${checkpointPath}.tmp-${process.pid}`
fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`)
fs.renameSync(temporaryPath, checkpointPath)
```

- [ ] **Step 4: Integrate reuse into orchestration**

Before a Provider action call:

```js
const reusable = resolveReusableActionResult({ dataDir, runId: run.runId, actionId })
const result = reusable || await generateActionSourceImpl(request)
if (!reusable) writeActionCheckpoint({ dataDir, runId: run.runId, result, now: nowImpl })
```

Persist success and failure immediately after each bounded action attempt. Do not reuse omitted-quality output automatically.

- [ ] **Step 5: Run checkpoint and bridge tests**

```bash
node --test tests/examples/creator-studio-full-pet-action-checkpoints.test.js tests/examples/creator-studio-host-model-bridge.test.js
```

Expected: pass, and Provider call assertions show only missing actions are requested on retry.

- [ ] **Step 6: Commit Task 3**

```bash
git add examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js examples/plugins/creator-studio/lib/host-model-bridge.js tests/examples/creator-studio-full-pet-action-checkpoints.test.js tests/examples/creator-studio-host-model-bridge.test.js
git commit -m "feat resume creator pet actions from checkpoints"
```

---

### Task 4: Compose partial atlas with transparent stable rows

**Files:**
- Modify: `examples/plugins/creator-studio/lib/full-pet-atlas-composer.js`
- Modify: `examples/plugins/creator-studio/lib/real-atlas-builder.js`
- Test: `tests/examples/creator-studio-real-atlas-builder.test.js`
- Test: `tests/examples/creator-studio-full-pet-row-preview-artifacts.test.js`

**Interfaces:**
- Consumes: successful row subset and action availability.
- Produces: fixed 1536x1872 atlas, previews only for available actions, QA availability metadata.

- [ ] **Step 1: Write failing partial-atlas tests**

Build an atlas containing only approved `idle` and assert:

```js
assert.equal(atlas.width, 1536)
assert.equal(atlas.height, 1872)
assert.deepEqual(atlasQa.basicActions.availableActionIds, ['idle'])
assert.equal(await countRowVisiblePixels('running-right'), 0)
assert.equal(rowQa.rows.some((row) => row.actionId === 'running-right'), false)
assert.deepEqual(atlasQa.visualReview.previews.map((entry) => entry.actionId), ['idle'])
```

Add a test proving an included row that fails row QA still rejects the atlas.

- [ ] **Step 2: Run atlas tests and confirm RED**

```bash
node --test tests/examples/creator-studio-real-atlas-builder.test.js tests/examples/creator-studio-full-pet-row-preview-artifacts.test.js
```

Expected: missing official rows are currently rejected.

- [ ] **Step 3: Make composer accept missing rows**

In `composeOfficialFullPetAtlas`, skip composites for absent rows while retaining the transparent atlas background:

```js
if (!Array.isArray(frames)) {
  frameRows.push({ id: row.id, row: row.row, frameCount: row.frameCount, uniqueFrameCount: 1, available: false })
  continue
}
```

Present rows still require exact frame counts and dimensions.

- [ ] **Step 4: Make atlas builder analyze only present rows**

Require an input for `idle`; skip missing optional rows; create previews only from `rowFramesByActionId`; pass attempts into `createBasicActionCoverage` so omission reasons survive.

- [ ] **Step 5: Run atlas tests and confirm GREEN**

Run Task 4 command. Expected: pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add examples/plugins/creator-studio/lib/full-pet-atlas-composer.js examples/plugins/creator-studio/lib/real-atlas-builder.js tests/examples/creator-studio-real-atlas-builder.test.js tests/examples/creator-studio-full-pet-row-preview-artifacts.test.js
git commit -m "feat build partial quality-approved pet atlases"
```

---

### Task 5: Change QA, pet manifest, and import gate to require approved idle only

**Files:**
- Modify: `examples/plugins/creator-studio/lib/full-pet-qa.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify: `src/main/pet-pack/codex-pet.js`
- Modify: `src/main/pet-pack/schema.js`
- Test: `tests/examples/creator-studio-full-pet-qa.test.js`
- Test: `tests/examples/creator-studio-plugin.test.js`
- Test: `tests/pet-pack/schema.test.js`
- Test: `tests/pet-pack/loader.test.js`

**Interfaces:**
- Pet JSON adds `requiredActionIds`, `availableActionIds`, `omittedActionIds`, `actionAvailability`.
- Normalized runtime manifest contains only available actions.

- [ ] **Step 1: Write failing QA/import tests**

Cover:

```js
assert.doesNotThrow(() => assertFullPetQaPassed({ artifacts: approvedIdleOnly }))
assert.throws(() => assertFullPetQaPassed({ artifacts: noIdle }), /idle/)
assert.throws(() => assertFullPetQaPassed({ artifacts: includedFailedRow }), /QA/)
```

Add a pet-pack normalization test where `availableActionIds: ['idle', 'waving']` produces exactly those two actions and uses `idle` as `clickAction` when `waving` is absent.

- [ ] **Step 2: Run QA and pet-pack tests and confirm RED**

```bash
node --test tests/examples/creator-studio-full-pet-qa.test.js tests/examples/creator-studio-plugin.test.js tests/pet-pack/schema.test.js tests/pet-pack/loader.test.js
```

- [ ] **Step 3: Implement import policy**

`assertFullPetQaPassed` checks missing required actions only. Optional missing official IDs remain warnings.

`writeHostGeneratedStandardOutputs` copies availability fields from atlas QA into `pet.json`.

`normalizeCodexPetManifest` filters `CODEX_ROWS`:

```js
const available = new Set(
  Array.isArray(manifest.availableActionIds)
    ? manifest.availableActionIds
    : CODEX_ROWS.map((row) => row.id)
)
if (!available.has('idle')) throw new Error('Codex pet must make idle available')
const availableRows = CODEX_ROWS.filter((row) => available.has(row.id))
```

Choose `clickAction: available.has('waving') ? 'waving' : 'idle'`.

- [ ] **Step 4: Run QA and pet-pack tests and confirm GREEN**

Run Task 5 command. Expected: pass.

- [ ] **Step 5: Commit Task 5**

```bash
git add examples/plugins/creator-studio/lib/full-pet-qa.js examples/plugins/creator-studio/lib/backend-runner.js src/main/pet-pack/codex-pet.js src/main/pet-pack/schema.js tests/examples/creator-studio-full-pet-qa.test.js tests/examples/creator-studio-plugin.test.js tests/pet-pack/schema.test.js tests/pet-pack/loader.test.js
git commit -m "feat import pets with approved partial action sets"
```

---

### Task 6: Enforce runtime availability and safe idle fallback

**Files:**
- Modify: `src/main/services/pet-service.js`
- Modify: `src/main/services/action-service.js`
- Test: `tests/services/pet-service.test.js`
- Test: `tests/services/action-service.test.js`

**Interfaces:**
- `PetService.playAction({ actionId, source })` returns `{ actionId, requestedActionId, source, fallback }`.
- Unknown/unavailable action requests fall back only when approved `idle` exists.

- [ ] **Step 1: Write failing runtime tests**

```js
const result = petService.playAction({ actionId: 'waving', source: 'test' })
assert.deepEqual(result, {
  actionId: 'idle',
  requestedActionId: 'waving',
  source: 'test',
  fallback: true
})
assert.equal(emitted.actionId, 'idle')
```

Add tests proving random/trigger configuration cannot reference an action absent from the normalized action list and legacy complete packs behave unchanged.

- [ ] **Step 2: Run service tests and confirm RED**

```bash
node --test tests/services/pet-service.test.js tests/services/action-service.test.js
```

- [ ] **Step 3: Implement idle fallback and trigger filtering**

Use the normalized action list as the source of availability. `playAction` resolves the request through `getAction`; if missing, resolves `idle`; if `idle` is also missing, retain the existing unknown-action error.

Do not rewrite stored trigger rules to another non-idle action. Invalid unavailable triggers remain rejected by existing action-service validation.

- [ ] **Step 4: Run service tests and confirm GREEN**

Run Task 6 command. Expected: pass.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/main/services/pet-service.js src/main/services/action-service.js tests/services/pet-service.test.js tests/services/action-service.test.js
git commit -m "feat fall back unavailable pet actions to idle"
```

---

### Task 7: Improve keyframe candidate selection without lowering QA

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Test: `tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js`

**Interfaces:**
- Produces `candidateSelection` in keyframe quality evidence.
- Selects the highest-scoring QA-passing output from one Provider response.

- [ ] **Step 1: Write failing candidate-selection tests**

Return two materialized outputs from one fake Provider response: candidate 1 has identity descriptor drift and candidate 2 passes. Assert candidate 2 is selected and both candidates appear in safe quality evidence.

Also test that all-failed candidates preserve each candidate score and reject the keyframe.

- [ ] **Step 2: Run candidate tests and confirm RED**

```bash
node --test tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js
```

- [ ] **Step 3: Implement bounded selection over existing outputs**

Replace first-output selection for keyframes with:

```js
const outputs = filterExistingGeneratedOutputs({ dataDir, outputs: attempt.response?.result?.outputs || [] })
const candidates = []
for (const output of outputs) {
  const candidate = await evaluateMaterializedKeyframeOutput({ output, ...context })
  candidates.push(candidate)
}
const selected = candidates
  .filter((candidate) => candidate.quality.ok)
  .sort((left, right) => right.quality.score - left.quality.score)[0] || null
```

Do not issue additional Provider calls. Do not accept a failed candidate when none pass.

- [ ] **Step 4: Run candidate tests and confirm GREEN**

Run Task 7 command. Expected: pass.

- [ ] **Step 5: Commit Task 7**

```bash
git add examples/plugins/creator-studio/lib/host-model-bridge.js tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js
git commit -m "feat select the best passing pet keyframe candidate"
```

---

### Task 8: Update review surfaces, smoke assertions, and canonical documentation

**Files:**
- Modify: `examples/plugins/creator-studio/web/dashboard/index.html`
- Modify: `scripts/run-creator-workflow-host-smoke.js`
- Modify: `docs/pet-character-generation.md`
- Test: `tests/examples/creator-studio-dashboard-browser.test.js`
- Test: `tests/scripts/run-creator-workflow-host-smoke.test.js`
- Test: `tests/docs/live-docs-creator-studio.test.js`

**Interfaces:**
- Review UI displays available and omitted actions separately.
- Smoke result distinguishes technical partial-package completion from human visual approval.

- [ ] **Step 1: Write failing UI and smoke tests**

Assert review text contains `Available actions`, `Omitted actions`, and the safe omission reason. Assert smoke accepts an imported idle-only package as technical completion but retains the claim boundary that visual quality is not automatically approved.

- [ ] **Step 2: Run UI/smoke tests and confirm RED**

```bash
node --test tests/examples/creator-studio-dashboard-browser.test.js tests/scripts/run-creator-workflow-host-smoke.test.js tests/docs/live-docs-creator-studio.test.js
```

- [ ] **Step 3: Implement review and evidence presentation**

Render only sanitized action IDs and failure-condition labels. Do not expose absolute paths, prompts, or Provider secrets in the dashboard summary or committed evidence.

Update the canonical document so the quality-first partial action contract supersedes the former nine-real-row requirement.

- [ ] **Step 4: Run UI/smoke tests and confirm GREEN**

Run Task 8 command. Expected: pass.

- [ ] **Step 5: Commit Task 8**

```bash
git add examples/plugins/creator-studio/web/dashboard/index.html scripts/run-creator-workflow-host-smoke.js docs/pet-character-generation.md tests/examples/creator-studio-dashboard-browser.test.js tests/scripts/run-creator-workflow-host-smoke.test.js tests/docs/live-docs-creator-studio.test.js
git commit -m "docs expose quality-first partial pet review"
```

---

### Task 9: Full regression and real-provider acceptance

**Files:**
- Modify only if a regression exposes an in-scope defect.
- Do not commit generated smoke artifacts.

**Interfaces:**
- Final verification for all previous tasks.

- [ ] **Step 1: Run syntax and focused suites**

```bash
npm run check:syntax
node --test \
  tests/examples/creator-studio-full-pet-basic-actions.test.js \
  tests/examples/creator-studio-full-pet-action-checkpoints.test.js \
  tests/examples/creator-studio-host-model-bridge.test.js \
  tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js \
  tests/examples/creator-studio-full-pet-qa.test.js \
  tests/pet-pack/loader.test.js \
  tests/services/pet-service.test.js
```

Expected: zero failures.

- [ ] **Step 2: Run complete core regressions**

```bash
npm run test:core
```

Expected: zero failures. If a time-sensitive unrelated test flakes, rerun that exact test and then rerun `test:core`; report both results.

- [ ] **Step 3: Run real single-reference host smoke**

```bash
npm run smoke:creator-workflow-host -- \
  --reference-image /Users/mango/Downloads/正面.png \
  --scenario new-character \
  --provider-timeout-ms 600000 \
  --output-dir /tmp/openpet-dev8-quality-first-partial-pet \
  --json
```

Acceptance:

- every image-edit request records `referenceImageCount=1`;
- approved `idle` is mandatory;
- optional failures are omitted and do not abort later actions;
- no Provider stage exists for `running-left`;
- only QA-passing actions appear in `availableActionIds`;
- the package imports only after the existing review/approval gate;
- no E2E artistic-success claim is made without human visual acceptance.

- [ ] **Step 4: Inspect git state and commit any final in-scope corrections**

```bash
git diff --check
git status --short --branch
```

The final worktree must be clean. Do not push or merge unless explicitly requested.
