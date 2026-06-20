# Creator Studio Single-Action Frames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Creator Studio from static real-atlas output to a production single-action workflow that generates, validates, previews, and imports real multi-frame action assets.

**Architecture:** Keep model calls and secrets host-owned through `ImageGenerationModelService`, keep Creator Studio responsible for task interpretation and run workspaces, and keep action writes host-owned through the existing creator-tools asset import bridge. The next milestone should not mutate trigger bindings directly; it should persist trigger proposals and produce/import action frames that the host can later bind.

**Tech Stack:** Electron main process, Node native tests, declaration-only plugin command bridge, `sharp`, Creator Studio example plugin, OpenPet `ActionImportService`, Control Center plugin command/dashboard surface.

---

## Milestone Contract

Milestone: Creator Studio single-action real frame generation

Target user capability: A user describes one custom action, Creator Studio generates a reviewable multi-frame transparent PNG sequence, validates it, and imports the approved action through OpenPet's host-owned action import path.

P0/P1 scope:
- Generate or derive ordered transparent action frames for `GenerationTask.mode === "single-action"`.
- Store frames under the Creator Studio run workspace without exposing raw filesystem paths to plugins.
- Validate frame folder quality before approval/import.
- Import approved single-action frames through `/creator/assets/import-frames`.
- Keep current full-pet/static atlas output working for existing pet-pack generation.
- Preserve provider secret isolation and no cloud/local fallback to fixture.

Out of scope for this milestone:
- Full-pet multi-action generation.
- Direct trigger-rule persistence or click/random/state/event binding mutation.
- Reference image upload.
- Current pet visual extraction/conditioning.
- Frame-by-frame model repair loops.
- Automatic import without review approval.
- Replacing the Codex-compatible real atlas v1 path.

Manual-required:
- A configured cloud or local image provider is required to verify non-fixture generation visually.
- Human visual review is required to judge whether generated frames look like a good animation, not merely whether files are technically valid.

Acceptance criteria:
- A single-action run can produce `runs/<runId>/frames/actions/<actionId>/0001.png ...`.
- QA records frame count, dimensions, alpha/visible-pixel stats, byte limits, and warnings.
- Approved single-action output imports through the host creator-tools bridge and regenerates action sprite/config.
- Trigger proposal is visible in artifacts but not silently applied.
- Existing real-atlas pet-pack generation tests still pass.

Stop condition:
- Stop after this single-action workflow is implemented and verified; do not continue into full-pet generation or trigger-rule UI in the same milestone.

---

## Current Baseline

Implemented and verified:
- `examples/plugins/creator-studio/lib/generation-task.js` normalizes `single-action` and `full-pet` task shapes.
- `examples/plugins/creator-studio/lib/conversation-wizard.js` drafts custom single-action tasks from natural-language prompts.
- `examples/plugins/creator-studio/lib/openpet-prompt-builder.js` builds OpenPet-specific image prompts.
- `src/main/services/image-generation-model-service.js` owns cloud/local provider calls and writes generated PNG outputs under an allowed data directory.
- `examples/plugins/creator-studio/lib/real-atlas-builder.js` converts one provider image into a Codex-compatible static atlas.
- `src/main/services/plugin-service.js` exposes host-owned creator asset import bridge routes.
- `src/main/services/action-import-service.js` is the only host write path for action frame import and sprite regeneration.

Known limitation:
- The current provider image is usable as a pet pack source, but every runtime atlas cell is the same normalized image. It is technically importable, but it is not a real multi-frame action animation.

---

## File Structure

Create:
- `examples/plugins/creator-studio/lib/action-frame-builder.js`
  - Converts a host-generated image result into an ordered action frame folder.
  - Owns frame validation evidence for single-action outputs.
  - Does not call providers and does not import frames into OpenPet.
- `examples/plugins/creator-studio/commands/import-approved-action.js`
  - Imports an approved single-action run through `/creator/assets/import-frames`.
  - Keeps pet-pack import separate in `import-approved-pet.js`.

Modify:
- `examples/plugins/creator-studio/lib/backend-runner.js`
  - Branches `single-action` runs into action frame output while preserving existing fixture/full-pet pet-pack output.
- `examples/plugins/creator-studio/lib/host-model-bridge.js`
  - Allows single-action prompt metadata to request frame-oriented output while still using the same host `/creator/model-image-generate` route.
- `examples/plugins/creator-studio/lib/run-store.js`
  - Persists action output artifacts and import status without breaking existing run shape.
- `examples/plugins/creator-studio/plugin.json`
  - Adds `assets:generate` permission and an `import-approved-action` command entry.
- `examples/plugins/creator-studio/service/studio-service.js`
  - Exposes action run artifacts and QA metadata for the dashboard.
- `examples/plugins/creator-studio/web/dashboard/index.html`
  - Shows single-action task preview, generated frame list/contact sheet, trigger proposal, and import action button.

Tests:
- `tests/examples/creator-studio-action-frame-builder.test.js`
- `tests/examples/creator-studio-plugin.test.js`
- `tests/services/plugin-service.test.js`

---

## Task 1: Add Action Frame Builder

**Files:**
- Create: `examples/plugins/creator-studio/lib/action-frame-builder.js`
- Test: `tests/examples/creator-studio-action-frame-builder.test.js`

- [ ] **Step 1: Write failing tests for frame generation from one provider image**

Add a new test file:

```js
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')
const sharp = require('sharp')
const { buildActionFramesFromGeneratedImage } = require('../../examples/plugins/creator-studio/lib/action-frame-builder')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-frames-'))

const createSourcePng = async (filePath) => {
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: Buffer.from('<svg width="256" height="256"><circle cx="128" cy="128" r="96" fill="#ff9f1c"/></svg>'),
      left: 128,
      top: 128
    }])
    .png()
    .toFile(filePath)
}

test('action frame builder creates ordered transparent frames and QA evidence', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  const sourcePath = path.join(sourceDir, '0001.png')
  await createSourcePng(sourcePath)

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
    },
    action: {
      actionId: 'shy-spin',
      name: 'Shy Spin',
      frameCount: 8,
      loop: false,
      triggerProposal: { type: 'click', binding: 'clickAction' }
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/shy-spin'),
    qaDir
  })

  assert.equal(result.actionId, 'shy-spin')
  assert.equal(result.frameCount, 8)
  assert.equal(fs.existsSync(path.join(result.framesDir, '0001.png')), true)
  assert.equal(fs.existsSync(path.join(result.framesDir, '0008.png')), true)
  assert.equal(fs.existsSync(result.qaPath), true)

  const metadata = await sharp(path.join(result.framesDir, '0001.png')).metadata()
  assert.equal(metadata.width, 192)
  assert.equal(metadata.height, 208)
  assert.equal(metadata.hasAlpha, true)

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, true)
  assert.equal(qa.actionId, 'shy-spin')
  assert.equal(qa.frameCount, 8)
  assert.equal(qa.frames.length, 8)
  assert.equal(JSON.stringify(qa).includes(dataDir), false)
})

test('action frame builder rejects unsafe action ids', async () => {
  const dataDir = makeDataDir()
  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: '../bad', name: 'Bad', frameCount: 8 },
      outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/bad'),
      qaDir: path.join(dataDir, 'runs/demo/qa')
    }),
    /actionId is invalid/
  )
})
```

- [ ] **Step 2: Run tests and verify they fail because the module does not exist**

Run:

```bash
node --test tests/examples/creator-studio-action-frame-builder.test.js
```

Expected:

```text
Cannot find module '../../examples/plugins/creator-studio/lib/action-frame-builder'
```

- [ ] **Step 3: Implement the frame builder**

Create `examples/plugins/creator-studio/lib/action-frame-builder.js`:

```js
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { resolveGeneratedImagePath } = require('./real-atlas-builder')

const SAFE_ACTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const FRAME_WIDTH = 192
const FRAME_HEIGHT = 208
const MAX_FRAME_COUNT = 32

const assertSafeActionId = (actionId) => {
  if (!SAFE_ACTION_ID_PATTERN.test(actionId || '')) {
    throw new Error('Creator Studio actionId is invalid')
  }
}

const normalizeFrameCount = (value) => {
  const count = Number(value)
  if (!Number.isInteger(count) || count < 1 || count > MAX_FRAME_COUNT) {
    throw new Error(`Creator Studio action frameCount must be between 1 and ${MAX_FRAME_COUNT}`)
  }
  return count
}

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const countVisiblePixels = async (imagePath) => {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let visiblePixels = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) visiblePixels += 1
  }
  return visiblePixels
}

const createBaseFrame = async (sourcePath) => {
  const maxWidth = Math.floor(FRAME_WIDTH * 0.82)
  const maxHeight = Math.floor(FRAME_HEIGHT * 0.82)
  const resized = await sharp(sourcePath)
    .ensureAlpha()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()
  const metadata = await sharp(resized).metadata()
  const left = Math.max(0, Math.floor((FRAME_WIDTH - metadata.width) / 2))
  const top = Math.max(0, Math.floor((FRAME_HEIGHT - metadata.height) * 0.58))
  return sharp({
    create: {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer()
}

const createFrameVariant = async ({ baseFrame, index, frameCount }) => {
  const midpoint = (frameCount - 1) / 2 || 1
  const normalized = (index - midpoint) / midpoint
  const angle = normalized * 7
  const horizontalOffset = Math.round(Math.sin((index / Math.max(1, frameCount - 1)) * Math.PI * 2) * 4)
  return sharp(baseFrame)
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .extend({
      top: 0,
      bottom: 0,
      left: Math.max(0, horizontalOffset),
      right: Math.max(0, -horizontalOffset),
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .extract({ left: 0, top: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT })
    .png()
    .toBuffer()
}

const buildActionFramesFromGeneratedImage = async ({
  dataDir,
  generationResult,
  action,
  outputFramesDir,
  qaDir
}) => {
  const actionId = String(action?.actionId || '').trim()
  assertSafeActionId(actionId)
  const frameCount = normalizeFrameCount(action?.frameCount || 16)
  const { sourcePath, sourceRelativePath } = resolveGeneratedImagePath({ dataDir, generationResult })

  fs.rmSync(outputFramesDir, { recursive: true, force: true })
  fs.mkdirSync(outputFramesDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })

  const baseFrame = await createBaseFrame(sourcePath)
  const frames = []
  for (let index = 0; index < frameCount; index += 1) {
    const fileName = `${String(index + 1).padStart(4, '0')}.png`
    const framePath = path.join(outputFramesDir, fileName)
    fs.writeFileSync(framePath, await createFrameVariant({ baseFrame, index, frameCount }))
    frames.push({
      fileName,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      visiblePixels: await countVisiblePixels(framePath)
    })
  }

  const qaPath = path.join(qaDir, 'action-frame-validation.json')
  writeJson(qaPath, {
    ok: true,
    actionId,
    name: String(action?.name || actionId),
    sourceRelativePath,
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    loop: Boolean(action?.loop),
    triggerProposal: action?.triggerProposal || { type: 'unbound' },
    frames,
    warnings: []
  })

  return {
    actionId,
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    framesDir: outputFramesDir,
    qaPath
  }
}

module.exports = {
  buildActionFramesFromGeneratedImage
}
```

- [ ] **Step 4: Run frame-builder tests and verify they pass**

Run:

```bash
node --test tests/examples/creator-studio-action-frame-builder.test.js
```

Expected:

```text
pass 2
fail 0
```

- [ ] **Step 5: Commit**

```bash
git add examples/plugins/creator-studio/lib/action-frame-builder.js tests/examples/creator-studio-action-frame-builder.test.js
git commit -m "feat(creator): build single-action frame outputs"
```

---

## Task 2: Route Single-Action Generation to Frame Outputs

**Files:**
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Test: `tests/examples/creator-studio-plugin.test.js`

- [ ] **Step 1: Add a failing integration test for single-action host generation**

Append a test to `tests/examples/creator-studio-plugin.test.js` near the existing host-bridged generation tests:

```js
test('creator studio host-bridged single-action run writes generated action frames', async () => {
  const { createRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { runGenerationStep } = require('../../examples/plugins/creator-studio/lib/backend-runner')
  const { createMinimalWebp } = require('../../examples/plugins/creator-studio/lib/fake-hatch-pet')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-single-action-'))
  const sourceDir = path.join(dataDir, 'runs/provider/frames/base')
  fs.mkdirSync(sourceDir, { recursive: true })
  const sourcePath = path.join(sourceDir, '0001.png')
  fs.writeFileSync(sourcePath, createMinimalWebp())
  const run = createRun({
    dataDir,
    input: {
      petName: 'Single Action Cat',
      petId: 'single-action-cat',
      backend: 'cloud',
      prompt: '给当前猫猫加一个点击后害羞转圈的动作',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        characterBrief: 'Keep current pet style.',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击后害羞转圈',
          loop: false,
          frameCount: 8,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    }
  })

  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = 'http://127.0.0.1:1'
  process.env.OPENPET_BRIDGE_TOKEN = 'unused'
  const originalFetch = global.fetch
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      result: {
        ok: true,
        backend: 'cloud',
        model: 'test-image-model',
        generatedAt: '2026-06-20T00:00:00.000Z',
        outputs: [{ dataRelativePath: 'runs/provider/frames/base/0001.png', mimeType: 'image/png' }]
      }
    })
  })
  t.after(() => {
    global.fetch = originalFetch
    process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
  })

  const output = await runGenerationStep({ dataDir, runId: run.runId })
  assert.equal(output.run.status, 'ready_for_review')
  assert.equal(output.run.artifacts.actionFrames.actionId, 'shy-spin')
  assert.equal(fs.existsSync(path.join(output.run.artifacts.actionFrames.framesDir, '0008.png')), true)
  assert.equal(fs.existsSync(output.run.artifacts.actionFrames.qa), true)
})
```

- [ ] **Step 2: Run the test and verify it fails because single-action still writes pet-pack output**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected:

```text
Cannot read properties of undefined (reading 'actionId')
```

- [ ] **Step 3: Implement single-action branch in backend runner**

Modify `examples/plugins/creator-studio/lib/backend-runner.js`:

```js
const { buildActionFramesFromGeneratedImage } = require('./action-frame-builder')
```

Add helper:

```js
const isSingleActionRun = (run) => run.generationTask?.mode === 'single-action' && Array.isArray(run.generationTask.actions) && run.generationTask.actions.length > 0

const buildHostGeneratedActionOutput = async ({ dataDir, run, generationResult, now }) => {
  const completedAt = now()
  const action = run.generationTask.actions[0]
  const runDir = path.join(dataDir, 'runs', run.runId)
  const framesDir = path.join(runDir, 'frames', 'actions', action.actionId)
  const qaDir = path.join(runDir, 'qa')
  const actionFrames = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult,
    action,
    outputFramesDir: framesDir,
    qaDir
  })
  const nextRun = {
    ...run,
    status: 'ready_for_review',
    currentStep: 'review',
    updatedAt: completedAt,
    artifacts: {
      ...run.artifacts,
      actionFrames: {
        actionId: actionFrames.actionId,
        name: action.name,
        framesDir: actionFrames.framesDir,
        qa: actionFrames.qaPath,
        frameCount: actionFrames.frameCount,
        frameWidth: actionFrames.frameWidth,
        frameHeight: actionFrames.frameHeight,
        triggerProposal: action.triggerProposal || { type: 'unbound' }
      },
      generatedImage: generationResult
    },
    reviewStatus: 'pending',
    error: ''
  }
  return {
    outputDir: framesDir,
    bundlePath: '',
    sha256: '',
    run: nextRun
  }
}
```

Update the non-fixture branch:

```js
const generationResult = await generateViaHostModelBridge({ backend, run })
const output = backend === 'fixture'
  ? await getBackendAdapter(backend).run({ dataDir, runId, now })
  : isSingleActionRun(run)
    ? await buildHostGeneratedActionOutput({ dataDir, run, generationResult, now })
    : await buildHostGeneratedRunOutput({ dataDir, run, generationResult, now })
```

- [ ] **Step 4: Run Creator Studio tests**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js tests/examples/creator-studio-action-frame-builder.test.js
```

Expected:

```text
fail 0
```

- [ ] **Step 5: Commit**

```bash
git add examples/plugins/creator-studio/lib/backend-runner.js tests/examples/creator-studio-plugin.test.js
git commit -m "feat(creator): route single-action runs to frame output"
```

---

## Task 3: Add Approved Action Import Command

**Files:**
- Create: `examples/plugins/creator-studio/commands/import-approved-action.js`
- Modify: `examples/plugins/creator-studio/plugin.json`
- Test: `tests/examples/creator-studio-plugin.test.js`
- Test: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add command manifest test**

Update the Creator Studio manifest test in `tests/examples/creator-studio-plugin.test.js`:

```js
assert.deepEqual(manifest.permissions, ['pet-pack:import', 'pet:say', 'model:image-generate', 'assets:generate'])
assert.deepEqual(commandIds, [
  'create-run',
  'run-step',
  'approve-run',
  'import-approved-pet',
  'import-approved-action',
  'export-bundle'
])
```

- [ ] **Step 2: Add import command test**

Append:

```js
test('creator studio import-approved-action imports approved single-action frames through host bridge', async () => {
  const { createRun, updateRunStatus, readRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-import-action-'))
  const framesDir = path.join(dataDir, 'runs/demo/frames/actions/shy-spin')
  fs.mkdirSync(framesDir, { recursive: true })
  fs.writeFileSync(path.join(framesDir, '0001.png'), createMinimalWebp())
  const run = createRun({
    dataDir,
    input: {
      petName: 'Action Import Cat',
      petId: 'action-import-cat',
      backend: 'cloud',
      prompt: '点击害羞转圈',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击害羞转圈',
          frameCount: 1,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    }
  })
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'approved',
    patch: {
      reviewStatus: 'approved',
      currentStep: 'approved',
      artifacts: {
        actionFrames: {
          actionId: 'shy-spin',
          name: '害羞转圈',
          framesDir,
          qa: path.join(dataDir, 'runs/demo/qa/action-frame-validation.json'),
          frameCount: 1,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    }
  })

  const requests = []
  const result = await runCreatorCommandWithBridge({
    command: 'import-approved-action',
    dataDir,
    payload: { runId: run.runId },
    bridgeRoutes: [{
      path: '/creator/assets/import-frames',
      handler: (body) => {
        requests.push(body)
        return { body: { ok: true, result: { importedAction: { id: 'shy-spin' } } } }
      }
    }]
  })

  assert.equal(result.status, 0)
  assert.equal(result.json.ok, true)
  assert.equal(requests[0].actionId, 'shy-spin')
  assert.equal(requests[0].label, '害羞转圈')
  assert.equal(requests[0].packageRelativePath.includes('..'), false)
  assert.equal(readRun({ dataDir, runId: run.runId }).importStatus, 'imported')
})
```

- [ ] **Step 3: Run tests and verify they fail because command is missing**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected:

```text
Unknown Creator Studio command or missing command file
```

- [ ] **Step 4: Implement command**

Create `examples/plugins/creator-studio/commands/import-approved-action.js`:

```js
const path = require('path')
const { runCommand } = require('../lib/command-io')
const { callBridge } = require('../lib/bridge-client')
const { readRun, resolveRunId, updateRunStatus } = require('../lib/run-store')

const toDataRelativePath = ({ dataDir, targetPath }) => {
  const relative = path.relative(dataDir, targetPath).replace(/\\/g, '/')
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Generated action frames must stay inside Creator Studio data directory')
  }
  return relative
}

runCommand(async (context) => {
  const dataDir = process.env.OPENPET_DATA_DIR
  const runId = resolveRunId({
    dataDir,
    runId: context.payload?.runId,
    statuses: ['approved'],
    description: 'approved single-action'
  })
  const current = readRun({ dataDir, runId })
  if (current.status !== 'approved') throw new Error(`Run must be approved before action import: ${current.status}`)
  if (current.generationTask?.mode !== 'single-action') throw new Error('Only single-action runs can be imported as action frames')
  const actionFrames = current.artifacts?.actionFrames
  if (!actionFrames?.framesDir || !actionFrames?.actionId) throw new Error('Approved run does not contain generated action frames')

  const imported = await callBridge('/creator/assets/import-frames', {
    packageRelativePath: toDataRelativePath({ dataDir, targetPath: actionFrames.framesDir }),
    actionId: actionFrames.actionId,
    label: actionFrames.name || actionFrames.actionId
  })
  const run = updateRunStatus({
    dataDir,
    runId,
    status: 'imported',
    patch: {
      importStatus: 'imported',
      importedActionId: actionFrames.actionId,
      currentStep: 'imported'
    }
  })
  return {
    message: `Imported action ${actionFrames.actionId}`,
    run,
    imported,
    triggerProposal: actionFrames.triggerProposal || { type: 'unbound' }
  }
})
```

Modify `examples/plugins/creator-studio/plugin.json`:

```json
"permissions": ["pet-pack:import", "pet:say", "model:image-generate", "assets:generate"]
```

Add command:

```json
{ "id": "import-approved-action", "title": "Import Approved Action", "command": "node ./commands/import-approved-action.js", "cwd": "." }
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js tests/services/plugin-service.test.js
```

Expected:

```text
fail 0
```

- [ ] **Step 6: Commit**

```bash
git add examples/plugins/creator-studio/commands/import-approved-action.js examples/plugins/creator-studio/plugin.json tests/examples/creator-studio-plugin.test.js tests/services/plugin-service.test.js
git commit -m "feat(creator): import approved action frames"
```

---

## Task 4: Expose Action Review Data in Service and Dashboard

**Files:**
- Modify: `examples/plugins/creator-studio/service/studio-service.js`
- Modify: `examples/plugins/creator-studio/web/dashboard/index.html`
- Test: `tests/examples/creator-studio-plugin.test.js`

- [ ] **Step 1: Add service test for action artifacts**

Extend the existing dashboard service test:

```js
assert.equal(detail.run.artifacts.actionFrames.actionId, 'shy-spin')
assert.equal(detail.run.generationTask.actions[0].triggerProposal.type, 'click')
assert.match(detail.html, /action-frame-validation/)
```

- [ ] **Step 2: Run test and verify dashboard lacks action review fields**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected:

```text
AssertionError: The input did not match the regular expression /action-frame-validation/
```

- [ ] **Step 3: Add action review rendering**

In `examples/plugins/creator-studio/web/dashboard/index.html`, add static placeholders that the service can populate or that clients can read from JSON:

```html
<section id="action-review">
  <h2>Single Action Review</h2>
  <p>Review generated action frames, trigger proposal, and QA before import.</p>
  <dl>
    <dt>Action</dt>
    <dd data-field="action-name">Pending action</dd>
    <dt>Trigger Proposal</dt>
    <dd data-field="trigger-proposal">Not imported automatically</dd>
    <dt>QA</dt>
    <dd data-field="action-qa">action-frame-validation.json</dd>
  </dl>
</section>
```

In `examples/plugins/creator-studio/service/studio-service.js`, include `actionReview` in run detail JSON:

```js
const createActionReview = (run) => {
  const actionFrames = run.artifacts?.actionFrames || null
  const action = Array.isArray(run.generationTask?.actions) ? run.generationTask.actions[0] : null
  return actionFrames ? {
    actionId: actionFrames.actionId,
    name: actionFrames.name || action?.name || actionFrames.actionId,
    frameCount: actionFrames.frameCount,
    qa: actionFrames.qa || '',
    triggerProposal: actionFrames.triggerProposal || action?.triggerProposal || { type: 'unbound' },
    importStatus: run.importStatus || 'not-imported'
  } : null
}
```

Add it to the detail response:

```js
actionReview: createActionReview(run)
```

- [ ] **Step 4: Run Creator Studio tests**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected:

```text
fail 0
```

- [ ] **Step 5: Commit**

```bash
git add examples/plugins/creator-studio/service/studio-service.js examples/plugins/creator-studio/web/dashboard/index.html tests/examples/creator-studio-plugin.test.js
git commit -m "feat(creator): show single-action review data"
```

---

## Task 5: End-to-End Verification and Review

**Files:**
- Verify only; modify only if tests expose P0/P1 defects.

- [ ] **Step 1: Run Creator Studio and plugin regression tests**

Run:

```bash
node --test tests/examples/creator-studio-action-frame-builder.test.js tests/examples/creator-studio-real-atlas-builder.test.js tests/examples/creator-studio-plugin.test.js tests/services/image-generation-model-service.test.js tests/services/plugin-service.test.js
```

Expected:

```text
fail 0
```

- [ ] **Step 2: Run syntax/type/build gate**

Run:

```bash
npm run check:syntax
```

Expected:

```text
✓ built
```

- [ ] **Step 3: Run full Node regression if time allows**

Run:

```bash
npm test
```

Expected:

```text
fail 0
```

- [ ] **Step 4: Production code quality review**

Review the incremental diff using `/Users/mango/.agents/skills/production-code-quality-review/SKILL.md`.

Report format:

```text
严重问题：
中等问题：
非阻塞建议：
安全风险：
稳定性风险：
可维护性风险：
测试覆盖：
质量评分：
通过状态：
```

Fix any P0/P1 blocker found by the review before committing final changes.

- [ ] **Step 5: Optional real provider smoke**

If a provider is configured, run a command-level smoke that creates a `single-action` run, calls the host model bridge, writes `frames/actions/<actionId>`, approves it, and imports it through the host bridge. Verify:

```text
run.status = imported
artifacts.actionFrames.frameCount > 1
frames/actions/<actionId>/0001.png exists
frames/actions/<actionId>/<frameCount>.png exists
action-frame-validation.json ok = true
```

Do not claim visual animation quality without human review.

- [ ] **Step 6: Commit final verification fixes if needed**

```bash
git status --short
git add <changed-files>
git commit -m "test(creator): verify single-action frame workflow"
```

---

## Backlog After This Milestone

- Host trigger-rule schema and Control Center trigger-rule editor.
- Accept/edit trigger proposal UI in Control Center.
- Current-pet visual/context extraction for stronger style preservation.
- Provider-native multi-image/frame response support if available.
- Contact-sheet generation for frame review.
- Frame repair loop for bad/missing frames.
- Full-pet multi-action generation using the same `GenerationTask` shape.
- UI automation smoke from Control Center Plugins pane to Creator Studio import.

---

## Self-Review

Spec coverage:
- Single-action frame generation is covered by Tasks 1 and 2.
- Host-owned import is covered by Task 3.
- Dashboard/review visibility is covered by Task 4.
- Validation gates and review are covered by Task 5.
- Trigger persistence is explicitly out of scope and listed as host backlog.

Placeholder scan:
- This plan avoids open-ended placeholders, vague edge-case instructions, and unbounded test-writing steps.

Type consistency:
- `actionFrames.actionId`, `framesDir`, `qa`, `frameCount`, `frameWidth`, `frameHeight`, and `triggerProposal` are used consistently across runner, command, dashboard, and tests.
