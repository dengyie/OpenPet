# Creator Studio Official Row Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic official full-pet row package support for Creator Studio so real row strips can become official Codex pet action coverage without overclaiming preview fallback output.

**Architecture:** Add a focused row pipeline beside the existing preview atlas builder. Row job manifests describe the nine official rows, row-strip extraction produces `192x208` cell frames, row QA classifies rows as `row-real`, `approved-mirror`, or `preview-fallback`, and the atlas builder composes official row packages into the fixed Codex atlas. Provider row generation and human visual approval remain separate follow-up evidence paths.

**Tech Stack:** Node.js, CommonJS modules, `sharp`, Node native test runner, existing Creator Studio run/output layout.

## Global Constraints

- Atlas dimensions remain `1536x1872`, 8 columns x 9 rows, cell `192x208`.
- Official rows are exactly `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, and `review`.
- Only `running-left` may be deterministically derived, and only by approved framewise mirroring from `running-right`.
- Local base-image translate, scale, crop, or repeated static frames must not count as official action generation.
- Base-only preview output must remain importable but must leave official missing rows visible.
- Provider credentials stay host-owned; this plan does not add plugin-managed provider credentials.
- Real provider smoke and human contact-sheet/GIF approval remain Manual-required.

---

## File Structure

- Create `examples/plugins/creator-studio/lib/full-pet-row-contract.js`
  - Owns official row metadata, quality labels, frame counts, and row lookup helpers.
- Create `examples/plugins/creator-studio/lib/full-pet-row-jobs.js`
  - Creates and normalizes `full-pet-row-jobs.json` manifests and validates derivation policy.
- Create `examples/plugins/creator-studio/lib/full-pet-row-extractor.js`
  - Extracts row-strip images into `192x208` frame PNG buffers/paths; mirrors approved `running-left` frames.
- Create `examples/plugins/creator-studio/lib/full-pet-row-qa.js`
  - Computes per-frame visible pixels, hashes, centroid, baseline, bounding box, drift metrics, and quality classification.
- Create `examples/plugins/creator-studio/lib/full-pet-atlas-composer.js`
  - Composes official row frames into `spritesheet.webp` and transparent unused cells.
- Modify `examples/plugins/creator-studio/lib/full-pet-basic-actions.js`
  - Reuse official row ids and keep official coverage driven only by `row-real` / `approved-mirror`.
- Modify `examples/plugins/creator-studio/lib/real-atlas-builder.js`
  - Accept optional `officialRows` package; compose official atlas when complete enough; keep preview fallback path unchanged.
- Modify `src/main/services/creator-workflow-service.js`
  - Preserve official row coverage fields already added and add no raw filesystem paths.
- Test with:
  - `tests/examples/creator-studio-full-pet-row-jobs.test.js`
  - `tests/examples/creator-studio-full-pet-row-extractor.test.js`
  - `tests/examples/creator-studio-full-pet-row-qa.test.js`
  - existing `tests/examples/creator-studio-real-atlas-builder.test.js`
  - existing `tests/examples/creator-studio-full-pet-basic-actions.test.js`
  - existing `tests/services/creator-workflow-service.test.js`

---

### Task 1: Official Row Contract And Job Manifest

**Files:**
- Create: `examples/plugins/creator-studio/lib/full-pet-row-contract.js`
- Create: `examples/plugins/creator-studio/lib/full-pet-row-jobs.js`
- Test: `tests/examples/creator-studio-full-pet-row-jobs.test.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-basic-actions.js`

**Interfaces:**
- Produces:
  - `OFFICIAL_FULL_PET_ROWS: Array<{ id, row, frameCount, durations }>`
  - `OFFICIAL_FULL_PET_ACTION_IDS: string[]`
  - `FULL_PET_ROW_QUALITY: { ROW_REAL, APPROVED_MIRROR, PREVIEW_FALLBACK, PENDING, FAILED }`
  - `getOfficialFullPetRow(actionId): object | null`
  - `createFullPetRowJobManifest({ runId, baseSourceRelativePath, canonicalReferenceRelativePath }): object`
  - `normalizeFullPetRowJobManifest(manifest): object`
  - `markRunningLeftApprovedMirror({ manifest, decisionNote }): object`

- [ ] **Step 1: Write the failing row jobs test**

Create `tests/examples/creator-studio-full-pet-row-jobs.test.js` with tests asserting:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  OFFICIAL_FULL_PET_ACTION_IDS,
  FULL_PET_ROW_QUALITY,
  getOfficialFullPetRow
} = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract')
const {
  createFullPetRowJobManifest,
  markRunningLeftApprovedMirror,
  normalizeFullPetRowJobManifest
} = require('../../examples/plugins/creator-studio/lib/full-pet-row-jobs')

test('official row contract matches Codex hatch-pet rows and frame counts', () => {
  assert.deepEqual(OFFICIAL_FULL_PET_ACTION_IDS, [
    'idle',
    'running-right',
    'running-left',
    'waving',
    'jumping',
    'failed',
    'waiting',
    'running',
    'review'
  ])
  assert.equal(getOfficialFullPetRow('idle').frameCount, 6)
  assert.equal(getOfficialFullPetRow('running-right').frameCount, 8)
  assert.equal(getOfficialFullPetRow('running-left').frameCount, 8)
  assert.equal(getOfficialFullPetRow('waving').frameCount, 4)
  assert.equal(getOfficialFullPetRow('jumping').frameCount, 5)
  assert.equal(getOfficialFullPetRow('failed').frameCount, 8)
  assert.equal(getOfficialFullPetRow('waiting').frameCount, 6)
  assert.equal(getOfficialFullPetRow('running').frameCount, 6)
  assert.equal(getOfficialFullPetRow('review').frameCount, 6)
})

test('row job manifest creates one pending job for every official row', () => {
  const manifest = createFullPetRowJobManifest({
    runId: 'run-1',
    baseSourceRelativePath: 'runs/run-1/frames/base/0001.png',
    canonicalReferenceRelativePath: 'runs/run-1/references/canonical-base.png'
  })

  assert.equal(manifest.version, 1)
  assert.equal(manifest.mode, 'official-full-pet')
  assert.equal(manifest.base.sourceRelativePath, 'runs/run-1/frames/base/0001.png')
  assert.deepEqual(manifest.jobs.map((job) => job.actionId), OFFICIAL_FULL_PET_ACTION_IDS)
  for (const job of manifest.jobs) {
    assert.equal(job.status, 'pending')
    assert.equal(job.quality, FULL_PET_ROW_QUALITY.PENDING)
    assert.match(job.promptRelativePath, new RegExp(`runs/run-1/prompts/rows/${job.actionId}\\.txt$`))
    assert.match(job.outputRelativePath, new RegExp(`runs/run-1/rows/${job.actionId}/strip\\.png$`))
    assert.equal(job.frameCount, getOfficialFullPetRow(job.actionId).frameCount)
  }
})

test('only running-left can be marked as an approved mirror of running-right', () => {
  const manifest = createFullPetRowJobManifest({
    runId: 'run-1',
    baseSourceRelativePath: 'runs/run-1/frames/base/0001.png',
    canonicalReferenceRelativePath: 'runs/run-1/references/canonical-base.png'
  })
  const mirrored = markRunningLeftApprovedMirror({
    manifest,
    decisionNote: 'Symmetric markings and prop-free gait preserve identity.'
  })
  const runningLeft = mirrored.jobs.find((job) => job.actionId === 'running-left')
  assert.equal(runningLeft.status, 'derived')
  assert.equal(runningLeft.quality, FULL_PET_ROW_QUALITY.APPROVED_MIRROR)
  assert.deepEqual(runningLeft.derivation, {
    type: 'approved-mirror',
    sourceActionId: 'running-right',
    decisionNote: 'Symmetric markings and prop-free gait preserve identity.'
  })
})

test('manifest normalization rejects non-running-left derivations', () => {
  const manifest = createFullPetRowJobManifest({
    runId: 'run-1',
    baseSourceRelativePath: 'runs/run-1/frames/base/0001.png',
    canonicalReferenceRelativePath: 'runs/run-1/references/canonical-base.png'
  })
  const invalid = {
    ...manifest,
    jobs: manifest.jobs.map((job) => job.actionId === 'waving'
      ? {
          ...job,
          status: 'derived',
          quality: FULL_PET_ROW_QUALITY.APPROVED_MIRROR,
          derivation: { type: 'approved-mirror', sourceActionId: 'running-right', decisionNote: 'bad' }
        }
      : job)
  }
  assert.throws(() => normalizeFullPetRowJobManifest(invalid), /Only running-left may be derived/)
})
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-jobs.test.js
```

Expected: FAIL because `full-pet-row-contract.js` and `full-pet-row-jobs.js` do not exist.

- [ ] **Step 3: Implement the minimal row contract and job manifest**

Create `full-pet-row-contract.js` and `full-pet-row-jobs.js` with the exported names above. Use exact Codex row metadata already present in `real-atlas-builder.js`.

- [ ] **Step 4: Run the row jobs test to verify GREEN**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-jobs.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```sh
git add examples/plugins/creator-studio/lib/full-pet-row-contract.js \
  examples/plugins/creator-studio/lib/full-pet-row-jobs.js \
  examples/plugins/creator-studio/lib/full-pet-basic-actions.js \
  tests/examples/creator-studio-full-pet-row-jobs.test.js
git commit -m "feat(phase-1): add official full-pet row manifest"
```

---

### Task 2: Row Extraction, Mirror, And QA

**Files:**
- Create: `examples/plugins/creator-studio/lib/full-pet-row-extractor.js`
- Create: `examples/plugins/creator-studio/lib/full-pet-row-qa.js`
- Test: `tests/examples/creator-studio-full-pet-row-extractor.test.js`
- Test: `tests/examples/creator-studio-full-pet-row-qa.test.js`

**Interfaces:**
- Consumes:
  - `getOfficialFullPetRow(actionId)`
  - `FULL_PET_ROW_QUALITY`
- Produces:
  - `extractRowStripFrames({ stripPath, actionId, outputDir }): Promise<{ actionId, frames, extraction }>`
  - `mirrorRowFrames({ frames, actionId, outputDir }): Promise<{ actionId, frames, extraction }>`
  - `analyzeRowFrames({ actionId, frames, sourceKind }): Promise<{ actionId, quality, frameCount, expectedFrameCount, uniqueFrameCount, centroidDrift, baselineDrift, sizeDrift, errors, warnings }>`

- [ ] **Step 1: Write failing extraction tests**

Create `tests/examples/creator-studio-full-pet-row-extractor.test.js` that writes a synthetic horizontal strip with one colored block per frame, extracts `waving`, verifies four `192x208` PNG frames, verifies visible pixels, and verifies `running-left` mirroring preserves frame order.

- [ ] **Step 2: Run extraction tests to verify RED**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-extractor.test.js
```

Expected: FAIL because extractor module does not exist.

- [ ] **Step 3: Implement row extraction and mirror**

Implement equal-slot extraction for `frameCount * 192` by `208` strips and proportional equal-slot extraction for wider strips. Write frame files as `01.png`, `02.png`, etc. Implement mirror by flipping each frame horizontally without reversing order.

- [ ] **Step 4: Run extraction tests to verify GREEN**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-extractor.test.js
```

Expected: PASS.

- [ ] **Step 5: Write failing row QA tests**

Create `tests/examples/creator-studio-full-pet-row-qa.test.js` covering:

- a varied row with stable baseline becomes `row-real`;
- a repeated/static row is rejected with `row_repeated_static`;
- a row where every frame is only translated/scaled base-like content is rejected with `row_transform_like`;
- an approved mirror row becomes `approved-mirror` when source frames are varied and stable.

- [ ] **Step 6: Run QA tests to verify RED**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-qa.test.js
```

Expected: FAIL because QA module does not exist or lacks classification.

- [ ] **Step 7: Implement row QA**

Compute visible bounding boxes, centroids, bottom baselines, visible pixel counts, frame hashes, and drift metrics. Treat identical hashes as static. Treat equal dimensions plus shifting centroids with highly similar visible counts as transform-like. Use row-specific default tolerances: centroid drift <= 40 px, baseline drift <= 30 px, size drift <= 0.35 ratio for deterministic tests.

- [ ] **Step 8: Run QA tests to verify GREEN**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-qa.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```sh
git add examples/plugins/creator-studio/lib/full-pet-row-extractor.js \
  examples/plugins/creator-studio/lib/full-pet-row-qa.js \
  tests/examples/creator-studio-full-pet-row-extractor.test.js \
  tests/examples/creator-studio-full-pet-row-qa.test.js
git commit -m "feat(phase-2): add official full-pet row extraction qa"
```

---

### Task 3: Official Atlas Composition And Coverage Integration

**Files:**
- Create: `examples/plugins/creator-studio/lib/full-pet-atlas-composer.js`
- Modify: `examples/plugins/creator-studio/lib/real-atlas-builder.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-basic-actions.js`
- Test: `tests/examples/creator-studio-real-atlas-builder.test.js`
- Test: `tests/examples/creator-studio-full-pet-basic-actions.test.js`

**Interfaces:**
- Consumes:
  - extracted official row frames;
  - row QA records.
- Produces:
  - `composeOfficialFullPetAtlas({ outputPath, rowFramesByActionId }): Promise<{ visiblePixels, frameRows }>`
  - `buildRealAtlasFromGeneratedImage({ dataDir, generationResult, outputDir, qaDir, officialRows })` official package branch.

- [ ] **Step 1: Write failing atlas-builder tests**

Extend `tests/examples/creator-studio-real-atlas-builder.test.js` with a test that builds synthetic official row strips for all rows, passes them as `officialRows`, and expects:

- atlas dimensions `1536x1872`;
- each used row cell visible;
- unused cells transparent;
- `basicActions.realActionIds` contains all nine official row ids except `running-left` may be `approved-mirror`;
- `missingRequiredOfficialActionIds` is empty;
- row qualities are `row-real` or `approved-mirror`;
- base-only preview test still reports missing official rows.

- [ ] **Step 2: Run atlas-builder tests to verify RED**

Run:

```sh
node --test tests/examples/creator-studio-real-atlas-builder.test.js
```

Expected: FAIL because officialRows is ignored.

- [ ] **Step 3: Implement official atlas composer**

Create `full-pet-atlas-composer.js` to compose row frame PNGs into the fixed atlas. For each official row, composite expected frames into used cells and leave unused cells transparent.

- [ ] **Step 4: Integrate officialRows into real-atlas-builder**

When `officialRows` is provided, validate/analyze rows, compose official atlas, write `full-pet-row-validation.json`, write `atlas-validation.json`, and compute `basicActions` rows with `fallback: false` and `quality: row-real` or `approved-mirror`. If officialRows is absent, keep the preview path unchanged.

- [ ] **Step 5: Run atlas-builder and basic-actions tests to verify GREEN**

Run:

```sh
node --test tests/examples/creator-studio-real-atlas-builder.test.js \
  tests/examples/creator-studio-full-pet-basic-actions.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```sh
git add examples/plugins/creator-studio/lib/full-pet-atlas-composer.js \
  examples/plugins/creator-studio/lib/real-atlas-builder.js \
  examples/plugins/creator-studio/lib/full-pet-basic-actions.js \
  tests/examples/creator-studio-real-atlas-builder.test.js \
  tests/examples/creator-studio-full-pet-basic-actions.test.js
git commit -m "feat(phase-3): compose official full-pet row atlas"
```

---

### Task 4: Workflow Surface, Docs, And Verification

**Files:**
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Modify: `docs/one-click-action-generation-complete-chain.md`
- Modify: `docs/openpet-current-todo-architecture.md`
- Test: `tests/services/creator-workflow-service.test.js`
- Test: `tests/docs/live-docs-creator-studio.test.js`

**Interfaces:**
- Consumes:
  - `basicActions` official coverage emitted by atlas builder.
- Produces:
  - renderer-safe official coverage and missing row fields.

- [ ] **Step 1: Write/update workflow and docs tests**

Extend `creator-workflow-service.test.js` so official row-real coverage reaches `result.basicActions.realActionIds` and no absolute paths leak. Extend docs tests so live docs mention official row package support only when row-real / approved-mirror evidence exists.

- [ ] **Step 2: Run workflow/docs tests to verify RED if needed**

Run:

```sh
node --test tests/services/creator-workflow-service.test.js tests/docs/live-docs-creator-studio.test.js
```

Expected: PASS if existing normalizers already cover fields; FAIL if fields are missing.

- [ ] **Step 3: Implement minimal normalizer/docs updates**

Only patch missing fields or wording. Do not add broad dashboard redesign.

- [ ] **Step 4: Run focused verification**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-basic-actions.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js \
  tests/examples/creator-studio-full-pet-row-jobs.test.js \
  tests/examples/creator-studio-full-pet-row-extractor.test.js \
  tests/examples/creator-studio-full-pet-row-qa.test.js \
  tests/services/creator-workflow-service.test.js \
  tests/docs/live-docs-creator-studio.test.js
npm run check:docs-drift
npm run check:syntax
npm test
```

Expected: all pass.

- [ ] **Step 5: Production code quality review**

Use `production-code-quality-review` against the changed files. Fix only P0/P1 blockers in this milestone. Record non-blocking follow-ups in the final summary.

- [ ] **Step 6: Commit Task 4**

```sh
git add src/main/services/creator-workflow-service.js \
  src/shared/openpet-contracts.ts \
  src/control-center/src/panes/CreatorPane.tsx \
  docs/one-click-action-generation-complete-chain.md \
  docs/openpet-current-todo-architecture.md \
  tests/services/creator-workflow-service.test.js \
  tests/docs/live-docs-creator-studio.test.js
git commit -m "test(phase-4): verify official full-pet row coverage"
```

