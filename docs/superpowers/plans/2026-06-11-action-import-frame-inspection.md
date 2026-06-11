# Action Import Frame Inspection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safer two-step Actions import flow: inspect a selected frame folder, show a clear report, then import only if the folder and action id still pass validation.

**Architecture:** Keep all filesystem paths in the Electron main process. Control Center receives only a short-lived `selectionId` and an inspection report; the main process stores one pending selected folder, rechecks it on confirmation, and imports through `ActionImportService` only after all hard errors are clear. The sprite inspection contract separates blocking `errors` from non-blocking `warnings` so UI and tests can express intent precisely.

**Tech Stack:** Electron IPC, React 19 + Vite Control Center, Node native test runner, `sharp` metadata inspection, existing `ActionImportService` and `SpriteGenerator` services.

---

## Confirmed Decisions

- Bad frame folders are hard-blocked. Empty folders, unreadable image files, and images without alpha must not import.
- Renderer never receives the selected source folder path; it receives only `selectionId`, `folderName`, and inspection data.
- Confirmation runs a second inspection before copying files, because the source folder can change after the first inspection.
- If confirmation recheck fails, keep the pending selection and return the updated inspection report so the UI can show the current failure.
- The UI supports rechecking the current selection via `selectionId`.
- `inspectFrameFolder()` returns `errors` and `warnings` separately. `errors` block import; `warnings` inform.
- Duplicate `actionId` is blocked by default, checked both during inspection and during final import.
- The main process stores a single pending action-frame selection, not a Map, because Control Center is single-window and the UI shows one pending import at a time.

## File Structure

- Modify: `src/main/services/sprite-generator.js`
  - Change inspection result shape to `{ valid, errors, warnings, skippedFiles, frames, frameCount, maxWidth, maxHeight }`.
- Modify: `src/main/services/action-import-service.js`
  - Add `inspectActionFrames({ sourceDir, actionId })`; block duplicate action ids; recheck source folders before import.
- Modify: `src/shared/ipc-channels.js`
  - Add `actions:inspect-frames`, `actions:reinspect-frames`, and `actions:clear-frame-selection`.
- Modify: `control-center-preload.js`
  - Expose `inspectActionFrames(payload)`, `reinspectActionFrames(selectionId)`, and `clearActionFrameSelection(selectionId)`.
- Modify: `src/main/ipc.js`
  - Register inspect/reinspect/clear handlers, keep one pending selection, and require `selectionId` for final import.
- Modify: `src/control-center/src/main.jsx`
  - Split Actions import into select/inspect, recheck, clear, and confirm-import states.
- Modify: `src/control-center/src/styles.css`
  - Add compact report styling consistent with existing Control Center rows.
- Modify: `tests/services/sprite-generator.test.js`
  - Update inspection assertions to `errors`/`warnings`.
- Modify: `tests/services/action-import-service.test.js`
  - Cover service inspection, duplicate blocking, and final import recheck.

## Task 1: Inspection Result Contract

**Files:**
- Modify: `src/main/services/sprite-generator.js`
- Modify: `tests/services/sprite-generator.test.js`

- [ ] **Step 1: Update failing tests for errors/warnings**

Update the existing inspection tests in `tests/services/sprite-generator.test.js` so valid folders have no errors and skipped files stay non-blocking:

```js
assert.equal(result.valid, true)
assert.deepEqual(result.errors, [])
assert.deepEqual(result.warnings, ['Frame dimensions differ; frames will be centered in the largest cell'])
assert.deepEqual(result.skippedFiles, ['notes.txt'])
```

Update the alpha-channel test to assert a blocking error:

```js
assert.equal(result.valid, false)
assert.deepEqual(result.errors, ['01.png has no alpha channel'])
assert.deepEqual(result.warnings, [])
```

Add an empty-folder test:

```js
test('sprite generator reports empty frame folders as errors', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-inspect-empty-'))

  const result = await inspectFrameFolder(root)

  assert.equal(result.valid, false)
  assert.equal(result.frameCount, 0)
  assert.deepEqual(result.errors, ['No image files found'])
  assert.deepEqual(result.warnings, [])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/services/sprite-generator.test.js
```

Expected: tests fail because `errors` does not exist yet.

- [ ] **Step 3: Implement the new inspection contract**

In `src/main/services/sprite-generator.js`, update `readFrameMetadata()` to collect `errors` and `warnings`:

```js
const readFrameMetadata = async (folderPath, frameFiles) => {
  const frames = []
  const errors = []
  const warnings = []

  for (const fileName of frameFiles) {
    try {
      const metadata = await sharp(path.join(folderPath, fileName)).metadata()
      frames.push({
        fileName,
        width: metadata.width || 0,
        height: metadata.height || 0,
        hasAlpha: Boolean(metadata.hasAlpha)
      })
      if (!metadata.hasAlpha) errors.push(`${fileName} has no alpha channel`)
    } catch (error) {
      errors.push(`${fileName} cannot be read: ${error.message}`)
    }
  }

  const dimensions = new Set(frames.map((frame) => `${frame.width}x${frame.height}`))
  if (dimensions.size > 1) warnings.push('Frame dimensions differ; frames will be centered in the largest cell')

  return { frames, errors, warnings }
}
```

Update `inspectFrameFolder()` to return the new shape:

```js
const { frames, errors, warnings } = await readFrameMetadata(folderPath, frameFiles)
if (!frameFiles.length) errors.push('No image files found')

return {
  valid: frameFiles.length > 0 && errors.length === 0,
  frameCount: frameFiles.length,
  maxWidth,
  maxHeight,
  frames,
  skippedFiles,
  errors,
  warnings
}
```

Update `processActionFolder()` to log `inspection.errors.join('; ')` when invalid.

- [ ] **Step 4: Run targeted tests**

```bash
npm test -- tests/services/sprite-generator.test.js
```

Expected: sprite-generator tests pass.

## Task 2: Action Import Service Validation

**Files:**
- Modify: `src/main/services/action-import-service.js`
- Modify: `tests/services/action-import-service.test.js`

- [ ] **Step 1: Add service tests**

Add tests for inspection and duplicate action blocking:

```js
test('action import service inspects a selected frames folder for an action id', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-action-inspect-'))
  const sourceDir = path.join(root, 'source-wave')
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createFrame(path.join(sourceDir, '02_no_bg.png'))
  await createFrame(path.join(sourceDir, '10_no_bg.png'))

  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  const result = await service.inspectActionFrames({ sourceDir, actionId: 'wave' })

  assert.equal(result.folderName, 'source-wave')
  assert.equal(result.actionId, 'wave')
  assert.equal(result.inspection.valid, true)
  assert.deepEqual(result.inspection.errors, [])
})

test('action import service reports duplicate action ids during inspection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-action-duplicate-'))
  const sourceDir = path.join(root, 'source-idle')
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createFrame(path.join(sourceDir, '01_no_bg.png'))
  await createActionFolder(framesRoot, 'idle')
  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  await service.regenerate()

  const result = await service.inspectActionFrames({ sourceDir, actionId: 'idle' })

  assert.equal(result.inspection.valid, false)
  assert.deepEqual(result.inspection.errors, ['Action ID already exists: idle'])
})

test('action import service blocks duplicate action ids during final import', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-action-import-duplicate-'))
  const sourceDir = path.join(root, 'source-idle')
  const framesRoot = path.join(root, 'cat_anime', 'flames')
  const spritesDir = path.join(root, 'cat_anime', 'sprites')
  const configPath = path.join(root, 'cat_anime', 'animations.json')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createFrame(path.join(sourceDir, '01_no_bg.png'))
  await createActionFolder(framesRoot, 'idle')
  const service = createActionImportService({ framesRoot, spritesDir, configPath })
  await service.regenerate()

  await assert.rejects(
    () => service.importActionFrames({ sourceDir, actionId: 'idle' }),
    /Action ID already exists: idle/
  )
})
```

- [ ] **Step 2: Implement service methods**

Import `inspectFrameFolder`:

```js
const { generateSpritesFromFrames, inspectFrameFolder } = require('./sprite-generator')
```

Add helpers inside `createActionImportService()`:

```js
const actionExists = (actionId) => (readCurrentConfig().actions || []).some((action) => action.id === actionId)

const inspectActionFrames = async ({ sourceDir, actionId }) => {
  if (!isSafeActionId(actionId)) throw new Error('Invalid action id')
  const inspection = await inspectFrameFolder(sourceDir)
  if (actionExists(actionId)) {
    inspection.errors = [...inspection.errors, `Action ID already exists: ${actionId}`]
    inspection.valid = false
  }
  return { actionId, folderName: path.basename(sourceDir || ''), inspection }
}
```

At the top of `importActionFrames()`, after source-dir validation, re-run inspection and block invalid results:

```js
const { inspection } = await inspectActionFrames({ sourceDir, actionId })
if (!inspection.valid) throw new Error(inspection.errors.join('; ') || 'Frame folder is invalid')
```

Return `inspectActionFrames` from the service.

- [ ] **Step 3: Run targeted tests**

```bash
npm test -- tests/services/action-import-service.test.js tests/services/sprite-generator.test.js
```

Expected: all selected tests pass.

## Task 3: IPC and Preload Flow

**Files:**
- Modify: `src/shared/ipc-channels.js`
- Modify: `control-center-preload.js`
- Modify: `src/main/ipc.js`

- [ ] **Step 1: Add IPC channels**

Add to `src/shared/ipc-channels.js` and mirrored constants in `control-center-preload.js`:

```js
ACTIONS_INSPECT_FRAMES: 'actions:inspect-frames',
ACTIONS_REINSPECT_FRAMES: 'actions:reinspect-frames',
ACTIONS_CLEAR_FRAME_SELECTION: 'actions:clear-frame-selection',
```

- [ ] **Step 2: Expose preload methods**

Add to `window.controlCenterAPI`:

```js
inspectActionFrames: (payload) => ipcRenderer.invoke(IPC.ACTIONS_INSPECT_FRAMES, payload),
reinspectActionFrames: (selectionId) => ipcRenderer.invoke(IPC.ACTIONS_REINSPECT_FRAMES, { selectionId }),
clearActionFrameSelection: (selectionId) => ipcRenderer.invoke(IPC.ACTIONS_CLEAR_FRAME_SELECTION, { selectionId }),
```

- [ ] **Step 3: Implement single pending selection in IPC**

Inside `registerIpcHandlers()`, add:

```js
let pendingActionFrameSelection = null

const createSelectionId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const getPendingSelection = (selectionId) => {
  if (!pendingActionFrameSelection || pendingActionFrameSelection.id !== selectionId) {
    throw new Error('Selected frame folder is no longer available')
  }
  return pendingActionFrameSelection
}
```

Add inspect, reinspect, and clear handlers. Inspect opens the folder dialog and stores `{ id, sourceDir }`. Reinspect reuses the existing `sourceDir`. Clear removes the selection if ids match.

- [ ] **Step 4: Update final import handler**

Change `ACTIONS_IMPORT_FRAMES` so it no longer opens a dialog. It should:

1. Resolve `payload.selectionId` with `getPendingSelection()`.
2. Call `actionImportService.inspectActionFrames({ sourceDir, actionId: payload.actionId })`.
3. If invalid, return `{ ok: false, inspectionResult }` and keep the selection.
4. If valid, call `importActionFrames()`, clear pending selection, reload animations, and return `{ ok: true, result, animations }`.

- [ ] **Step 5: Run syntax check**

```bash
npm run check:syntax
```

Expected: command exits with code 0.

## Task 4: Control Center UI

**Files:**
- Modify: `src/control-center/src/main.jsx`
- Modify: `src/control-center/src/styles.css`

- [ ] **Step 1: Extend fallback API and state**

Add fallback methods for inspect, reinspect, and clear. Add:

```js
const [importInspection, setImportInspection] = useState(null)
```

- [ ] **Step 2: Add `FrameInspectionReport`**

Render folder name, frame count, max dimensions, `errors`, `warnings`, `skippedFiles`, and the first 8 frame rows. Errors use red text and disable import; warnings use neutral text.

- [ ] **Step 3: Update `ActionsPane`**

Replace the single import button with:

- `选择并检查`: opens folder picker and stores the report.
- `重新检查`: enabled only when a selection exists.
- `确认导入`: enabled only when action id is present and `inspection.valid` is true.
- `清除选择`: clears the pending selection in main process and UI.

Keep action id and label inputs above the report. Changing action id should clear the old inspection report because duplicate-id validation depends on the current action id.

- [ ] **Step 4: Wire handlers in `App()`**

Use these response rules:

- `inspectActionFrames({ actionId })` returns `{ canceled: true }` or `{ canceled: false, selectionId, folderName, actionId, inspection }`.
- `reinspectActionFrames(selectionId)` returns the same report shape without opening a dialog.
- `importActionFrames({ selectionId, actionId, label })` returns `{ ok: false, inspectionResult }` on second-check failure or `{ ok: true, result, animations }` on success.

- [ ] **Step 5: Add CSS**

Add small, unframed report styles near the existing Actions styles. Use borders and compact grid rows; do not add nested card styling.

- [ ] **Step 6: Build Control Center**

```bash
npm run build:control-center
```

Expected: Vite build succeeds.

## Task 5: Verification

**Files:**
- No code changes expected unless checks reveal an issue.

- [ ] **Step 1: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run syntax check**

```bash
npm run check:syntax
```

Expected: exits with code 0.

- [ ] **Step 3: Build Control Center**

```bash
npm run build:control-center
```

Expected: Vite build succeeds.

- [ ] **Step 4: Manual smoke test**

```bash
npm start
```

Expected:
- Pet window opens.
- Actions tab shows select/recheck/confirm controls.
- Valid folder passes inspection and imports.
- Empty folder, unreadable image, missing alpha, and duplicate action id block import.
- Recheck updates the report without reopening the folder picker.

## Self-Review

- Spec coverage: Covers the P2 action import frame inspection report and all grill-me decisions confirmed in this thread.
- Security: Source folder paths stay in main process only.
- Scope: No broad `main.jsx` split, no legacy settings cleanup, no pet-pack loader migration.
- Validation: Service tests cover contract and file safety; syntax/build checks cover IPC and UI integration.
