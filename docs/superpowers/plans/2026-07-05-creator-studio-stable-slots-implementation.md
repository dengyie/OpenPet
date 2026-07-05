# Creator Studio Stable Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline stable-slots correction helper for already-extracted official full-pet row frames.

**Architecture:** Keep the correction in a focused Creator Studio library next to the official row extractor and QA modules. The helper produces corrected frame files plus metadata, while existing row QA remains the authority for accepting or rejecting official-quality rows.

**Tech Stack:** Node.js native test runner, `sharp`, CommonJS modules, existing Creator Studio test helpers.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/3c34/OpenPet` on branch `codex/dev8`.
- Do not touch `/Users/mango/project/codex/OpenPet`.
- Do not call image providers or spend generation quota.
- Stable-slots repairs extraction/framing only; it must not manufacture actions from a base image.
- Preserve official Codex cell size: `192x208`.
- Preserve official row frame counts from `full-pet-row-contract`.
- Keep filesystem path containment under `dataDir` when provided.
- Use TDD: write each failing test first, run it red, then implement.

---

## File Structure

- Create `examples/plugins/creator-studio/lib/full-pet-row-stable-slots.js`
  - Exports `stabilizeRowFrames`.
  - Owns frame measurement, path containment, shared-slot composition, and metadata writing.
- Create `tests/examples/creator-studio-full-pet-row-stable-slots.test.js`
  - Owns synthetic image fixtures and stable-slots behavior tests.
- Keep `examples/plugins/creator-studio/lib/full-pet-row-qa.js` unchanged unless tests expose a true QA bug.
- Keep `examples/plugins/creator-studio/lib/real-atlas-builder.js` unchanged in this slice; builder integration can follow after the helper is proven.

## Task 1: RED Tests For Stable Correction

**Files:**
- Create: `tests/examples/creator-studio-full-pet-row-stable-slots.test.js`

**Interfaces:**
- Consumes: `analyzeRowFrames({ actionId, frames, sourceKind })`
- Produces expectation for: `stabilizeRowFrames({ frames, actionId, outputDir, dataDir })`

- [ ] **Step 1: Write failing tests**

Add tests that import the not-yet-created helper:

```js
const { stabilizeRowFrames } = require('../../examples/plugins/creator-studio/lib/full-pet-row-stable-slots')
```

Add synthetic helper functions:

```js
const writeFrame = async ({ outputPath, rects }) => {
  const body = rects.map((rect) => (
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${rect.color || '#ff0000'}"/>`
  )).join('')
  await sharp(Buffer.from(`<svg width="192" height="208" xmlns="http://www.w3.org/2000/svg">${body}</svg>`))
    .ensureAlpha()
    .png()
    .toFile(outputPath)
}
```

Core correction test:

```js
test('stable-slots reduces extraction jitter while preserving real row variation', async () => {
  const dataDir = makeTempDataDir()
  const sourceDir = path.join(dataDir, 'rows', 'waving', 'jittered')
  const outputDir = path.join(dataDir, 'rows', 'waving', 'stable')
  const frames = await writeFrames({
    outputDir: sourceDir,
    frameCount: 4,
    createRects: (index) => [
      { x: 46 + index * 24, y: 56 + index * 10, width: 58 + index, height: 82 - index, color: '#f6b73c' },
      { x: 70 + index * 24, y: 36 + index * 10, width: 12, height: 24 + index * 3, color: '#1c7ed6' }
    ]
  })
  const before = await analyzeRowFrames({ actionId: 'waving', frames, sourceKind: 'row-strip' })
  assert.equal(before.quality, FULL_PET_ROW_QUALITY.FAILED)
  assert.ok(before.errors.includes('row_centroid_drift') || before.errors.includes('row_baseline_drift'))

  const result = await stabilizeRowFrames({ dataDir, actionId: 'waving', frames, outputDir })
  const after = await analyzeRowFrames({ actionId: 'waving', frames: result.frames, sourceKind: 'row-strip' })

  assert.equal(after.quality, FULL_PET_ROW_QUALITY.ROW_REAL)
  assert.equal(after.frameCount, 4)
  assert.equal(after.uniqueFrameCount, 4)
  assert.deepEqual(after.errors, [])
  assert.ok(after.centroidDrift < before.centroidDrift)
  assert.ok(after.baselineDrift < before.baselineDrift)
})
```

Guard tests:

```js
test('stable-slots does not make repeated static rows pass QA', async () => { ... })
test('stable-slots does not make transform-like rows pass QA', async () => { ... })
test('stable-slots rejects source frames outside dataDir', async () => { ... })
test('stable-slots rejects output directories outside dataDir', async () => { ... })
test('stable-slots rejects frame count mismatches', async () => { ... })
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-stable-slots.test.js
```

Expected: FAIL with `Cannot find module '../../examples/plugins/creator-studio/lib/full-pet-row-stable-slots'`.

## Task 2: GREEN Implementation

**Files:**
- Create: `examples/plugins/creator-studio/lib/full-pet-row-stable-slots.js`

**Interfaces:**
- Produces: `stabilizeRowFrames({ frames, actionId, outputDir, dataDir = '', padding = 4 })`

- [ ] **Step 1: Implement path and row validation**

Implement `ensureOfficialRow`, `resolveInsideDataDir`, `createFramePath`, and frame count validation using the same containment pattern as `full-pet-row-extractor.js`.

- [ ] **Step 2: Implement alpha bbox measurement**

Use `sharp(framePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })` and scan alpha bytes. Return `{ image, metadata, bbox }`; throw when no visible pixels exist.

- [ ] **Step 3: Implement shared slot composition**

For each frame:

```js
const cropBuffer = await sharp(sourcePath).ensureAlpha().extract(bbox).png().toBuffer()
const fittedCrop = await fitCropInsideSlot(cropBuffer, bbox, slotWidth, slotHeight, padding)
await sharp({ create: { width: 192, height: 208, channels: 4, background: transparent } })
  .composite([{ input: sharedSlotBuffer, left: slotLeft, top: slotTop }])
  .png()
  .toFile(framePath)
```

Compute `slotLeft = Math.floor((192 - slotWidth) / 2)` and `slotTop = clamp(baseline - slotHeight + 1, 0, 208 - slotHeight)`.

- [ ] **Step 4: Write metadata**

Write `stable-slots-metadata.json` to `outputDir` with sanitized absolute internal data only needed for debugging. Do not expose it through QA artifacts in this slice.

- [ ] **Step 5: Run RED test again for GREEN**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-stable-slots.test.js
```

Expected: PASS.

## Task 3: Regression Verification

**Files:**
- Test only.

**Interfaces:**
- Consumes existing row extractor, row QA, and builder behavior.

- [ ] **Step 1: Run targeted row tests**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-stable-slots.test.js \
  tests/examples/creator-studio-full-pet-row-qa.test.js \
  tests/examples/creator-studio-full-pet-row-extractor.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run syntax check**

Run:

```sh
npm run check:syntax
```

Expected: command exits 0.

- [ ] **Step 3: Commit**

Run:

```sh
git add docs/superpowers/specs/2026-07-05-creator-studio-stable-slots-design.md \
  docs/superpowers/plans/2026-07-05-creator-studio-stable-slots-implementation.md \
  examples/plugins/creator-studio/lib/full-pet-row-stable-slots.js \
  tests/examples/creator-studio-full-pet-row-stable-slots.test.js
git commit -m "feat(dev8): add official row stable slots correction"
```

## Self-Review

- Spec coverage: the plan covers the helper API, path containment, correction behavior, metadata, and regression verification.
- Placeholder scan: no `TBD`, `TODO`, or unspecified test commands remain.
- Type consistency: all tasks use `stabilizeRowFrames({ frames, actionId, outputDir, dataDir, padding })`.
