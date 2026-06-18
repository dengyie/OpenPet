# Plugin Creator-Tools Picker Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add host-owned native picker routes that let creator-tools commands inspect and import user-approved external frame folders without exposing selected paths to plugins.

**Architecture:** `PluginService` owns bridge routing, permission checks, path redaction, logs, and import guard reuse. `main.js` injects a `selectCreatorAssetFrameFolder` callback backed by Electron `dialog.showOpenDialog`. `ActionImportService` remains the only owner of frame inspection, copying, sprite generation, and action config updates.

**Tech Stack:** Electron main process, CommonJS services, Electron native directory picker, Node native test runner, shared TypeScript contracts.

---

## File Map

- Modify: `src/main/services/plugin-service.js`
  Purpose: add `selectCreatorAssetFrameFolder`, picked-folder validation, and `/creator/assets/pick-frames/*` routes.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: cover picker inspect/import success, cancellation, permission rejection, path redaction, symlink rejection, and import side-effect guards.
- Modify: `main.js`
  Purpose: wire the Electron native folder picker into `PluginService`.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: add picker inspect/import request and response types.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: keep new contracts type-checked.
- Create: `docs/phases/phase-85-plugin-creator-tools-picker-import.md`
  Purpose: record delivered behavior, decisions, verification, and remaining limits.
- Create: `docs/reviews/phase-85-plugin-creator-tools-picker-import-review.md`
  Purpose: record production review findings, score, pass status, and verification.
- Modify: live docs such as `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, `docs/productization-v1.1-todo-design.md`, `docs/development-summary.md`, `docs/project-status-review.md`, `docs/HANDOFF.md`, `docs/project-context.json`, `README.md`, and `README.zh-CN.md` if their current facts or test counts change.

## Execution Preconditions

- Work on `codex/creator-tools-picker-import-phase85`.
- Preserve Phase 82 package-local inspection, Phase 83 package-local import, and Phase 84 pack-manifest workflows unchanged.
- Do not add plugin-provided absolute paths, persistent folder grants, batch imports, overwrite behavior, raw filesystem writes, or arbitrary pet-pack writes.
- Keep selected absolute paths inside main-process code and out of bridge responses.

## Task 1: Picker Bridge RED/GREEN

**Files:**
- Modify: `tests/services/plugin-service.test.js`
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Add helper for external frame fixtures**

Add near existing plugin asset frame helpers:

```js
const createExternalFrameFolder = async (root, folderName = 'picked-wave') => {
  const folderPath = path.join(root, folderName)
  fs.mkdirSync(folderPath, { recursive: true })
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 120, g: 220, b: 120, alpha: 0.9 }
    }
  }).png().toFile(path.join(folderPath, '01_no_bg.png'))
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 140, g: 240, b: 140, alpha: 0.9 }
    }
  }).png().toFile(path.join(folderPath, '02_no_bg.png'))
  return folderPath
}
```

- [ ] **Step 2: Add picker inspect tests**

Add:

```js
test('declaration-only creator asset picker inspection opens a host picker without leaking the selected path', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })
  const externalFrames = await createExternalFrameFolder(root)
  let pickerCalls = 0
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    selectCreatorAssetFrameFolder: async () => {
      pickerCalls += 1
      return { canceled: false, sourceDir: externalFrames }
    },
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const inspectResponse = await requestBridge(`${baseUrl}/creator/assets/pick-frames/inspect`, {
    method: 'POST',
    token,
    body: { actionId: 'picked-wave' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(pickerCalls, 1)
  assert.equal(inspectResponse.status, 200)
  assert.equal(inspectResponse.body.ok, true)
  assert.equal(inspectResponse.body.canceled, false)
  assert.equal(inspectResponse.body.result.actionId, 'picked-wave')
  assert.equal(inspectResponse.body.result.folderName, 'picked-wave')
  assert.equal(inspectResponse.body.result.inspection.valid, true)
  assert.equal(JSON.stringify(inspectResponse.body).includes(externalFrames), false)
})
```

Add cancel coverage:

```js
test('declaration-only creator asset picker inspection returns canceled without inspecting', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })
  let inspectCalled = false
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: {
      inspectActionFrames: async () => {
        inspectCalled = true
        return {}
      }
    },
    officialPlugins: [],
    pluginDirs: [root],
    selectCreatorAssetFrameFolder: async () => ({ canceled: true }),
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const inspectResponse = await requestBridge(`${spawned[0].options.env.OPENPET_BRIDGE_URL}/creator/assets/pick-frames/inspect`, {
    method: 'POST',
    token: spawned[0].options.env.OPENPET_BRIDGE_TOKEN,
    body: { actionId: 'picked-wave' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(inspectResponse.status, 200)
  assert.deepEqual(inspectResponse.body, { ok: true, canceled: true })
  assert.equal(inspectCalled, false)
})
```

- [ ] **Step 3: Add picker import and guard tests**

Add tests for:

```js
test('declaration-only creator asset picker import imports a user-approved external frame folder', async () => {
  // Use createExternalFrameFolder(root, 'approved-wave')
  // Use permissions: ['assets:generate']
  // Call /creator/assets/pick-frames/import with actionId 'approved-wave' and label 'Approved Wave'
  // Assert status 200, canceled false, importedAction.id, generated frame folder, generated sprite, and no selected path in JSON response.
})

test('declaration-only creator asset picker routes reject missing permissions', async () => {
  // Use permissions: []
  // Call inspect and import picker routes.
  // Assert both return 403.
})

test('declaration-only creator asset picker import rejects symlinks inside picked folders before importing', async (t) => {
  // Create a selected folder containing a symlinked frame.
  // Use permissions: ['assets:generate'].
  // Assert status 400, /must not contain symlinks/, and importActionFrames was not called.
})
```

When implementing, use complete test bodies matching the Phase 85 diff and keep the no-path-leak assertion:

```js
assert.equal(JSON.stringify(importResponse.body).includes(externalFrames), false)
```

- [ ] **Step 4: Verify RED**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "picker"
```

Expected before implementation: FAIL because `selectCreatorAssetFrameFolder` and picker routes do not exist.

- [ ] **Step 5: Implement picker support in `PluginService`**

Add the dependency default:

```js
selectCreatorAssetFrameFolder = async () => {
  throw new Error('Creator asset folder picker is not available')
}
```

Add selected path resolution helpers:

```js
const resolvePickedAssetPath = (sourceDir) => {
  if (typeof sourceDir !== 'string' || !sourceDir.trim()) {
    throw new Error('Selected frame folder is required')
  }
  const targetPath = path.resolve(sourceDir)
  if (!fs.existsSync(targetPath)) throw new Error('Selected frame folder does not exist')
  const realTargetPath = fs.realpathSync(targetPath)
  if (!fs.statSync(realTargetPath).isDirectory()) throw new Error('Selected frame folder must be a folder')
  assertDirectoryHasNoSymlinks(realTargetPath)
  return realTargetPath
}

const selectCreatorAssetSourceDir = async () => {
  const selected = await selectCreatorAssetFrameFolder()
  if (selected?.canceled || !selected?.sourceDir) return { canceled: true }
  return { canceled: false, sourceDir: resolvePickedAssetPath(selected.sourceDir) }
}
```

Add bridge handlers:

```js
creatorAssetsPickFramesInspect: async (payload = {}) => {
  assertPermission(plugin.manifest, 'assets:inspect')
  if (!actionImportService?.inspectActionFrames) throw new Error('Creator asset inspection is not available')
  const selected = await selectCreatorAssetSourceDir()
  if (selected.canceled) return { ok: true, canceled: true }
  appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets pick-frames inspect invoked' })
  const result = await actionImportService.inspectActionFrames({
    sourceDir: selected.sourceDir,
    actionId: payload.actionId
  })
  return { ok: true, canceled: false, result }
},
creatorAssetsPickFramesImport: async (payload = {}) => {
  assertPermission(plugin.manifest, 'assets:generate')
  if (!actionImportService?.inspectActionFrames || !actionImportService?.importActionFrames) {
    throw new Error('Creator asset import is not available')
  }
  const selected = await selectCreatorAssetSourceDir()
  if (selected.canceled) return { ok: true, canceled: true }
  const actionId = String(payload.actionId || '')
  const label = payload.label == null || payload.label === '' ? undefined : String(payload.label)
  appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets pick-frames import invoked' })
  const preflight = await actionImportService.inspectActionFrames({ sourceDir: selected.sourceDir, actionId })
  assertCreatorAssetImportWithinLimits(preflight.inspection, selected.sourceDir)
  const result = await actionImportService.importActionFrames({ sourceDir: selected.sourceDir, actionId, label })
  const { importedAction, ...actions } = result
  return { ok: true, canceled: false, actions, importedAction }
},
```

Extend the route regex and dispatch:

```js
\/creator\/assets\/pick-frames\/inspect|\/creator\/assets\/pick-frames\/import
```

```js
if (route === '/creator/assets/pick-frames/inspect') {
  sendJson(response, 200, await runtime.handlers.creatorAssetsPickFramesInspect(payload))
  return
}
if (route === '/creator/assets/pick-frames/import') {
  sendJson(response, 200, await runtime.handlers.creatorAssetsPickFramesImport(payload))
  return
}
```

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "picker"
```

Expected: PASS.

## Task 2: Main Picker Wiring

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Wire Electron dialog**

Import `dialog` and pass the callback:

```js
const { app, BrowserWindow, dialog, shell } = require('electron')
```

```js
selectCreatorAssetFrameFolder: async () => {
  const selected = await dialog.showOpenDialog({
    title: '选择动作帧文件夹',
    properties: ['openDirectory']
  })
  if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
  return { canceled: false, sourceDir: selected.filePaths[0] }
},
```

- [ ] **Step 2: Verify syntax**

Run:

```bash
node --check main.js
```

Expected: PASS.

## Task 3: Shared Contracts

**Files:**
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
- Modify: `src/shared/openpet-contracts.ts`

- [ ] **Step 1: Add fixtures first**

Add fixtures:

```ts
const creatorAssetsPickFramesRequestFixture = {
  actionId: 'picked-wave',
  label: 'Picked Wave'
} satisfies CreatorAssetsPickFramesRequest

const creatorAssetsPickFramesInspectResponseFixture = {
  ok: true,
  canceled: false,
  result: {
    actionId: 'picked-wave',
    folderName: 'picked-wave',
    inspection: creatorAssetsInspectFramesResponseFixture.result.inspection
  }
} satisfies CreatorAssetsPickFramesInspectResponse

const creatorAssetsPickFramesImportResponseFixture = {
  ok: true,
  canceled: false,
  actions: creatorAssetsImportFramesResponseFixture.actions,
  importedAction: creatorAssetsImportFramesResponseFixture.importedAction
} satisfies CreatorAssetsPickFramesImportResponse

const creatorAssetsPickFramesCanceledFixture = {
  ok: true,
  canceled: true
} satisfies CreatorAssetsPickFramesInspectResponse
```

- [ ] **Step 2: Add contracts**

Add near existing creator asset contracts:

```ts
export interface CreatorAssetsPickFramesRequest {
  actionId: string
  label?: string
}

export interface CreatorAssetsPickFramesCanceledResponse {
  ok: boolean
  canceled: true
}

export type CreatorAssetsPickFramesInspectResponse = CreatorAssetsPickFramesCanceledResponse | {
  ok: boolean
  canceled: false
  result: CreatorAssetsInspectFramesResult
}

export type CreatorAssetsPickFramesImportResponse = CreatorAssetsPickFramesCanceledResponse | {
  ok: boolean
  canceled: false
  actions: ActionsConfigViewState
  importedAction?: ActionEntry
}
```

- [ ] **Step 3: Verify typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

## Task 4: Documentation, Review, And Commit

**Files:**
- Create: `docs/phases/phase-85-plugin-creator-tools-picker-import.md`
- Create: `docs/reviews/phase-85-plugin-creator-tools-picker-import-review.md`
- Modify live docs if current facts or counts change.

- [ ] **Step 1: Write phase record**

Ensure the phase record states:

```md
- `POST /creator/assets/pick-frames/inspect` requires `assets:inspect`;
- `POST /creator/assets/pick-frames/import` requires `assets:generate`;
- the host opens the native directory picker;
- cancellation has no side effect;
- selected absolute paths are not returned;
- arbitrary folder access, plugin-selected output paths, persistent folder grants, and pet-pack writes remain out of scope.
```

- [ ] **Step 2: Run production review**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Review in `deep` mode using `output-contract.md`, `false-positive-control.md`, `review-framework.md`, `security.md`, and `backend-and-integrations.md`.

The final review document must include:

```md
## Quality Gate

- Severe issues: none open.
- Improvement recommendations: keep future batch import, overwrite, or generated-image workflows behind separate consent and rollback design rather than expanding this route.
- Quality score: 95/100.
- Pass status: passed.
```

- [ ] **Step 3: Run verification**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "picker"
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected: all commands PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add main.js src/main/services/plugin-service.js src/shared/openpet-contracts.ts tests/services/plugin-service.test.js tests/shared/openpet-contracts-type-fixture.ts docs/phases/phase-85-plugin-creator-tools-picker-import.md docs/reviews/phase-85-plugin-creator-tools-picker-import-review.md docs/superpowers/specs/2026-06-18-plugin-creator-tools-picker-import-phase85-design.md docs/superpowers/plans/2026-06-18-plugin-creator-tools-picker-import-phase85.md
git commit -m "feat(阶段85): add creator asset picker import"
```

## Self-Review Checklist

- Spec coverage: every Phase 85 design requirement maps to a task.
- Placeholder scan: no `TBD`, `TODO`, or unresolved placeholders remain.
- Type consistency: `selectCreatorAssetFrameFolder`, `pick-frames/inspect`, and `pick-frames/import` are named consistently.
- Boundary check: plugin code never supplies or receives selected absolute paths.
- Safety check: user cancellation has no side effect, and symlink/resource validation runs before import.
