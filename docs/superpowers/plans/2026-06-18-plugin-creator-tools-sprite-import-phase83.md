# Plugin Creator-Tools Sprite Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permissioned creator-tools bridge route that imports package-local action frame folders through the host sprite/action import pipeline.

**Architecture:** Keep `PluginService` responsible for permission checks, short-lived bridge routing, path confinement, and third-party resource limits. Reuse `ActionImportService.inspectActionFrames()` for metadata and `ActionImportService.importActionFrames()` for all writes to copied frames, generated sprites, and action config.

**Tech Stack:** Electron main process, CommonJS services, Node native test runner, shared TypeScript contracts, Sharp-backed sprite generation, production-code-quality-review workflow.

---

## File Map

- Modify: `src/main/plugins/manifest.js`
  Purpose: allow the new `assets:generate` permission.
- Modify: `tests/plugins/manifest.test.js`
  Purpose: prove `assets:generate` is a supported permission.
- Modify: `src/main/services/plugin-service.js`
  Purpose: add resource-limited bridge routing for `POST /creator/assets/import-frames`.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: cover successful sprite import, missing permission, path traversal, symlink escape, duplicate action id, and resource-limit rejection.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: add plugin-facing request/response contracts for creator asset frame import.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: keep shared contracts type-checked with concrete fixtures.
- Create: `docs/phases/phase-83-plugin-creator-tools-sprite-import.md`
  Purpose: record delivered scope, decisions, verification, and remaining limits.
- Create: `docs/reviews/phase-83-plugin-creator-tools-sprite-import-review.md`
  Purpose: record production review findings, score, pass state, fixes, and residual risks.
- Modify: `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, `docs/productization-v1.1-todo-design.md`, `docs/development-summary.md`, `docs/project-status-review.md`, `docs/HANDOFF.md`, `docs/project-context.json`
  Purpose: keep live plugin and project-state docs aligned with the new host-mediated sprite import boundary.

## Execution Preconditions

- Work on `codex/creator-tools-sprite-import-phase83`.
- `git fetch origin main` has completed.
- `git rev-list --left-right --count HEAD...origin/main` shows `0` commits on the right side or `origin/main` has been merged.
- Worktree is clean before implementation except for this Phase 83 spec/plan when continuing immediately from planning.

## Task 1: Permission RED/GREEN

**Files:**
- Modify: `tests/plugins/manifest.test.js`
- Modify: `src/main/plugins/manifest.js`

- [ ] **Step 1: Add a failing manifest test**

Add this test near the existing `assets:inspect` permission test:

```js
test('normalizes creator-tools asset generation permission', () => {
  const manifest = normalizePluginManifest({
    id: 'asset-generator',
    name: 'Asset Generator',
    version: '1.0.0',
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })

  assert.equal(manifest.profile, 'creator-tools')
  assert.deepEqual(manifest.permissions, ['assets:generate'])
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "asset generation permission"
```

Expected: FAIL with `Unknown plugin permission: assets:generate`.

- [ ] **Step 3: Implement permission allowlist**

Add `'assets:generate'` to `KNOWN_PLUGIN_PERMISSIONS` in `src/main/plugins/manifest.js`:

```js
const KNOWN_PLUGIN_PERMISSIONS = new Set([
  'pet:say',
  'pet:action',
  'pet:event',
  'ai:chat',
  'storage',
  'network',
  'commands',
  'actions:read',
  'actions:write',
  'assets:inspect',
  'assets:generate'
])
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "asset generation permission"
```

Expected: PASS.

## Task 2: Bridge RED/GREEN

**Files:**
- Modify: `tests/services/plugin-service.test.js`
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Add a failing successful-import bridge test**

Add a test after the Phase 82 asset inspection tests:

```js
test('declaration-only creator asset import bridge imports package-local frames and generates sprites', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  await createPluginAssetFrame(root, 'assets/actions/wave', '01_no_bg.png')
  await createPluginAssetFrame(root, 'assets/actions/wave', '02_no_bg.png')
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const importResponse = await requestBridge(`${baseUrl}/creator/assets/import-frames`, {
    method: 'POST',
    token,
    body: {
      relativePath: 'assets/actions/wave',
      actionId: 'wave',
      label: 'Wave Hello'
    }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(importResponse.status, 200)
  assert.equal(importResponse.body.ok, true)
  assert.equal(importResponse.body.importedAction.id, 'wave')
  assert.equal(importResponse.body.importedAction.label, 'Wave Hello')
  assert.equal(importResponse.body.actions.defaultAction, 'wave')
  assert.equal(fs.existsSync(path.join(root, 'cat_anime', 'flames', 'wave', '01_no_bg.png')), true)
  assert.equal(fs.existsSync(path.join(root, 'cat_anime', 'sprites', 'wave.png')), true)
  const config = JSON.parse(fs.readFileSync(path.join(root, 'cat_anime', 'animations.json'), 'utf-8'))
  assert.equal(config.actions[0].id, 'wave')
})
```

- [ ] **Step 2: Add failing safety bridge tests**

Add tests for missing permission, path escape, duplicate id, and oversized imports:

```js
test('declaration-only creator asset import bridge rejects missing permissions', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })
  await createPluginAssetFrame(root, 'assets/actions/wave', '01_no_bg.png')
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const response = await requestBridge(`${spawned[0].options.env.OPENPET_BRIDGE_URL}/creator/assets/import-frames`, {
    method: 'POST',
    token: spawned[0].options.env.OPENPET_BRIDGE_TOKEN,
    body: { relativePath: 'assets/actions/wave', actionId: 'wave' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(response.status, 403)
})

test('declaration-only creator asset import bridge rejects path traversal and symlink escapes', async (t) => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  const outsideDir = path.join(root, 'outside-wave')
  fs.mkdirSync(outsideDir, { recursive: true })
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 255, g: 100, b: 0, alpha: 0.9 }
    }
  }).png().toFile(path.join(outsideDir, '01_no_bg.png'))
  const pluginDir = path.join(root, 'weather-declaration')
  const symlinkPath = path.join(pluginDir, 'assets', 'escape')
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true })
  try {
    fs.symlinkSync(outsideDir, symlinkPath, 'dir')
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService: createTestActionImportService(root),
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const traversalResponse = await requestBridge(`${spawned[0].options.env.OPENPET_BRIDGE_URL}/creator/assets/import-frames`, {
    method: 'POST',
    token: spawned[0].options.env.OPENPET_BRIDGE_TOKEN,
    body: { relativePath: '../outside-wave', actionId: 'wave' }
  })
  const symlinkResponse = await requestBridge(`${spawned[0].options.env.OPENPET_BRIDGE_URL}/creator/assets/import-frames`, {
    method: 'POST',
    token: spawned[0].options.env.OPENPET_BRIDGE_TOKEN,
    body: { relativePath: 'assets/escape', actionId: 'wave' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(traversalResponse.status, 400)
  assert.equal(symlinkResponse.status, 400)
  assert.equal(fs.existsSync(path.join(root, 'cat_anime', 'flames', 'wave')), false)
})

test('declaration-only creator asset import bridge rejects duplicate action ids without overwriting', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  const actionImportService = createTestActionImportService(root)
  await createPluginAssetFrame(root, 'assets/actions/wave', '01_no_bg.png')
  fs.mkdirSync(path.join(root, 'cat_anime', 'flames', 'wave'), { recursive: true })
  fs.writeFileSync(path.join(root, 'cat_anime', 'flames', 'wave', 'keep.txt'), 'keep')
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService,
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const response = await requestBridge(`${spawned[0].options.env.OPENPET_BRIDGE_URL}/creator/assets/import-frames`, {
    method: 'POST',
    token: spawned[0].options.env.OPENPET_BRIDGE_TOKEN,
    body: { relativePath: 'assets/actions/wave', actionId: 'wave' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(response.status, 400)
  assert.match(response.body.error, /Action ID already exists: wave/)
  assert.equal(fs.readFileSync(path.join(root, 'cat_anime', 'flames', 'wave', 'keep.txt'), 'utf-8'), 'keep')
})

test('declaration-only creator asset import bridge rejects oversized imports before writing', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['assets:generate']
  })
  await createPluginAssetFrame(root, 'assets/actions/huge', '01_no_bg.png')
  let importCalled = false
  const actionImportService = {
    inspectActionFrames: async () => ({
      actionId: 'huge',
      folderName: 'huge',
      inspection: {
        valid: true,
        frameCount: 241,
        maxWidth: 8,
        maxHeight: 8,
        frames: [],
        skippedFiles: [],
        errors: [],
        warnings: []
      }
    }),
    importActionFrames: async () => {
      importCalled = true
      throw new Error('import should not run')
    }
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionImportService,
    officialPlugins: [],
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => spawned.length === 1)
  const response = await requestBridge(`${spawned[0].options.env.OPENPET_BRIDGE_URL}/creator/assets/import-frames`, {
    method: 'POST',
    token: spawned[0].options.env.OPENPET_BRIDGE_TOKEN,
    body: { relativePath: 'assets/actions/huge', actionId: 'huge' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(response.status, 400)
  assert.match(response.body.error, /too many frames/)
  assert.equal(importCalled, false)
})
```

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "creator asset import bridge"
```

Expected: FAIL because `/creator/assets/import-frames` and `assets:generate` are not implemented yet.

- [ ] **Step 4: Implement resource checks and bridge handler**

In `src/main/services/plugin-service.js`, add constants near other plugin bridge constants:

```js
const CREATOR_ASSET_IMPORT_LIMITS = Object.freeze({
  maxFrames: 240,
  maxFramePixels: 1024 * 1024,
  maxSpritePixels: 48 * 1000 * 1000,
  maxFolderBytes: 50 * 1024 * 1024
})
```

Add helpers:

```js
const getDirectoryByteSize = (folderPath) => {
  let total = 0
  for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
    const entryPath = path.join(folderPath, entry.name)
    const stat = fs.lstatSync(entryPath)
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      total += getDirectoryByteSize(entryPath)
    } else {
      total += stat.size
    }
  }
  return total
}

const assertCreatorAssetImportWithinLimits = (inspection, sourceDir) => {
  const frameCount = Number(inspection?.frameCount) || 0
  const maxWidth = Number(inspection?.maxWidth) || 0
  const maxHeight = Number(inspection?.maxHeight) || 0
  const framePixels = maxWidth * maxHeight
  const spritePixels = framePixels * frameCount
  const folderBytes = getDirectoryByteSize(sourceDir)
  if (frameCount > CREATOR_ASSET_IMPORT_LIMITS.maxFrames) {
    throw new Error(`Creator asset import has too many frames: ${frameCount}`)
  }
  if (framePixels > CREATOR_ASSET_IMPORT_LIMITS.maxFramePixels) {
    throw new Error(`Creator asset import frame is too large: ${maxWidth}x${maxHeight}`)
  }
  if (spritePixels > CREATOR_ASSET_IMPORT_LIMITS.maxSpritePixels) {
    throw new Error(`Creator asset import sprite would be too large: ${spritePixels} pixels`)
  }
  if (folderBytes > CREATOR_ASSET_IMPORT_LIMITS.maxFolderBytes) {
    throw new Error(`Creator asset import folder is too large: ${folderBytes} bytes`)
  }
}
```

Add handler:

```js
creatorAssetsImportFrames: async (payload = {}) => {
  assertPermission(plugin.manifest, 'assets:generate')
  if (!actionImportService?.inspectActionFrames || !actionImportService?.importActionFrames) {
    throw new Error('Creator asset import is not available')
  }
  const sourceDir = resolvePluginAssetPath(plugin.manifest, payload.relativePath)
  appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets import-frames invoked' })
  const inspectionResult = await actionImportService.inspectActionFrames({
    sourceDir,
    actionId: payload.actionId
  })
  assertCreatorAssetImportWithinLimits(inspectionResult.inspection, sourceDir)
  const result = await actionImportService.importActionFrames({
    sourceDir,
    actionId: payload.actionId,
    label: payload.label
  })
  const { importedAction, ...actions } = result
  return { ok: true, actions, importedAction }
}
```

Extend the bridge route regex and route dispatch with `/creator/assets/import-frames`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "creator asset import bridge"
```

Expected: PASS.

## Task 3: Shared Contracts RED/GREEN

**Files:**
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
- Modify: `src/shared/openpet-contracts.ts`

- [ ] **Step 1: Add failing type fixture usage**

Import the new types:

```ts
  CreatorAssetsImportFramesRequest,
  CreatorAssetsImportFramesResponse,
```

Add fixtures:

```ts
const creatorAssetsImportFramesRequestFixture = {
  relativePath: 'assets/actions/wave',
  actionId: 'wave',
  label: 'Wave Hello'
} satisfies CreatorAssetsImportFramesRequest

const creatorAssetsImportFramesResponseFixture = {
  ok: true,
  actions: {
    defaultAction: 'wave',
    clickAction: 'wave',
    actions: [
      { id: 'wave', label: 'Wave Hello', sprite: 'cat_anime/sprites/wave.png', frameCount: 2, frameMs: 95, frameWidth: 8, frameHeight: 8 }
    ]
  },
  importedAction: { id: 'wave', label: 'Wave Hello', sprite: 'cat_anime/sprites/wave.png', frameCount: 2, frameMs: 95, frameWidth: 8, frameHeight: 8 }
} satisfies CreatorAssetsImportFramesResponse
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run typecheck
```

Expected: FAIL because the new types are not exported.

- [ ] **Step 3: Add contract types**

Add to `src/shared/openpet-contracts.ts` near the Phase 82 asset contracts:

```ts
export interface CreatorAssetsImportFramesRequest {
  relativePath: string
  actionId: string
  label?: string
}

export interface CreatorAssetsImportFramesResponse {
  ok: boolean
  actions: ActionsConfigViewState
  importedAction?: ActionConfigViewState
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm run typecheck
```

Expected: PASS.

## Task 4: Docs, Review, Verification, Commit

**Files:**
- Create: `docs/phases/phase-83-plugin-creator-tools-sprite-import.md`
- Create: `docs/reviews/phase-83-plugin-creator-tools-sprite-import-review.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/project-context.json`

- [ ] **Step 1: Write phase doc**

Record:

```md
- `assets:generate` is supported for declaration-only creator-tools commands.
- `POST /creator/assets/import-frames` imports plugin-package-local frame folders.
- `ActionImportService.importActionFrames()` remains the only write path.
- Path traversal, symlink escapes, duplicate action ids, and oversized imports are rejected.
- Arbitrary output paths, external user folders, pet-pack writes, and raw plugin filesystem writes remain out of scope.
```

- [ ] **Step 2: Run production review context collection**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Perform a `deep` review because this phase adds a host-mediated write/generation path for third-party plugins. Record:

```md
- severe issues;
- improvement suggestions;
- quality score;
- pass state;
- fixes applied;
- residual risks.
```

- [ ] **Step 3: Refresh live docs**

Update docs to say creator-tools now supports:

```md
action reads / validation / bounded writes, package-local frame inspection, and host-mediated package-local frame import with sprite/config generation.
```

Do not claim:

```md
raw plugin file writes, arbitrary output paths, external folder imports, pet-pack writes, personality mutation, catalog trust, or complete sandboxing.
```

- [ ] **Step 4: Run complete verification**

Run:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "asset generation permission|asset inspection permission"
node --test tests/services/plugin-service.test.js --test-name-pattern "creator asset import bridge|creator asset inspection bridge"
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected: all pass.

- [ ] **Step 5: Commit atomically**

Run:

```bash
git add src/main/plugins/manifest.js tests/plugins/manifest.test.js src/main/services/plugin-service.js tests/services/plugin-service.test.js src/shared/openpet-contracts.ts tests/shared/openpet-contracts-type-fixture.ts docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/phases/phase-83-plugin-creator-tools-sprite-import.md docs/reviews/phase-83-plugin-creator-tools-sprite-import-review.md docs/productization-v1.1-todo-design.md docs/development-summary.md docs/project-status-review.md docs/HANDOFF.md docs/project-context.json docs/superpowers/specs/2026-06-18-plugin-creator-tools-sprite-import-phase83-design.md docs/superpowers/plans/2026-06-18-plugin-creator-tools-sprite-import-phase83.md
git commit -m "feat(阶段83): add creator asset sprite import bridge"
```

## Self-Review Checklist

- [ ] The route is permission-gated by `assets:generate`.
- [ ] The source path is package-local and uses Phase 82 lexical plus realpath confinement.
- [ ] The route has frame count, frame area, sprite area, and folder byte limits before generation.
- [ ] Duplicate action ids do not overwrite existing frames.
- [ ] `PluginService` does not parse or write images directly.
- [ ] `ActionImportService.importActionFrames()` remains the only frame/sprite/config write path.
- [ ] Docs do not imply arbitrary filesystem access, pet-pack writes, image synthesis, or complete sandboxing.
