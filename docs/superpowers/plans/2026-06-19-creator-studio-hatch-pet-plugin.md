# Creator Studio Hatch-Pet Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hybrid Creator Studio extension path that can generate a reviewable `codex-pet` output and import approved outputs into OpenPet through host-owned pet-pack APIs.

**Architecture:** Start by adding a narrow host bridge capability for plugin-generated pet-pack import, then scaffold a bundled/example Creator Studio extension that uses plugin-owned data directories for runs and outputs. The first executable slice uses deterministic fixture generation instead of real model calls, so the full create -> review -> import loop can be tested before cloud/local model adapters are added.

**Tech Stack:** Electron main process services, Node native test runner, OpenPet plugin manifest/bridge system, `PetPackService`, React Control Center plugin dashboard integration, local declaration-only plugin commands/services.

---

## File Structure

Create or modify these files:

- Modify `src/main/plugins/manifest.js`: add the `pet-pack:import` permission.
- Modify `src/main/services/plugin-service.js`: add pet-pack output path resolution and three bridge handlers/routes for inspect, import, and activate.
- Reuse `src/main/services/pet-pack-service.js` public APIs as-is: `inspectPackSource()`, `importPack()`, and `setActivePack()`.
- Create `examples/plugins/creator-studio/`: runnable extension fixture and author-facing reference package.
- Create `examples/plugins/creator-studio/plugin.json`: hybrid manifest with commands, service, dashboard, and permissions.
- Create `examples/plugins/creator-studio/config.schema.json`: backend and behavior config schema.
- Create `examples/plugins/creator-studio/commands/create-run.js`: creates a durable run in `OPENPET_DATA_DIR`.
- Create `examples/plugins/creator-studio/commands/run-step.js`: advances a run through deterministic fixture generation and QA states.
- Create `examples/plugins/creator-studio/commands/approve-run.js`: marks a run approved.
- Create `examples/plugins/creator-studio/commands/import-approved-pet.js`: calls the new bridge import route for approved output.
- Create `examples/plugins/creator-studio/commands/export-bundle.js`: returns the generated `.codex-pet.zip` path and hash.
- Create `examples/plugins/creator-studio/lib/run-store.js`: run directory creation, state transitions, and artifact bookkeeping.
- Create `examples/plugins/creator-studio/lib/fake-hatch-pet.js`: deterministic valid `codex-pet` output generator.
- Create `examples/plugins/creator-studio/lib/bridge-client.js`: small fetch wrapper for `OPENPET_BRIDGE_URL`.
- Create `examples/plugins/creator-studio/web/dashboard/index.html`: static Creator Studio dashboard shell that can be opened from Control Center.
- Create `examples/plugins/creator-studio/README.md`: developer guidance and current limitations.
- Modify `tests/plugins/manifest.test.js`: permission normalization coverage.
- Modify `tests/services/plugin-service.test.js`: bridge pet-pack inspect/import/activate coverage and permission denial coverage.
- Create `tests/examples/creator-studio-plugin.test.js`: package-level command tests for run state and output shape.
- Modify `docs/plugin-development.md`: mention Creator Studio as a canonical Creator Tools example after implementation works.

Keep changes scoped. Do not introduce real cloud image calls in this first implementation plan.

## Task 1: Add `pet-pack:import` Manifest Permission

**Files:**
- Modify: `src/main/plugins/manifest.js`
- Test: `tests/plugins/manifest.test.js`

- [ ] **Step 1: Write the failing permission normalization test**

Add this test near the existing creator-tools permission tests in `tests/plugins/manifest.test.js`:

```js
test('normalizes creator-tools pet pack import permission', () => {
  const manifest = normalizePluginManifest({
    id: 'creator-studio',
    name: 'Creator Studio',
    version: '1.0.0',
    profile: 'hybrid',
    permissions: ['pet-pack:import']
  })

  assert.equal(manifest.profile, 'hybrid')
  assert.deepEqual(manifest.permissions, ['pet-pack:import'])
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/plugins/manifest.test.js
```

Expected: failure containing `Unknown plugin permission: pet-pack:import`.

- [ ] **Step 3: Add the permission**

In `src/main/plugins/manifest.js`, add the new permission to `KNOWN_PLUGIN_PERMISSIONS`:

```js
  'assets:generate',
  'pet-pack:import',
  'pack-manifest:read',
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
node --test tests/plugins/manifest.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/plugins/manifest.js tests/plugins/manifest.test.js
git commit -m "feat: allow pet pack import permission"
```

## Task 2: Add Host Bridge Routes for Plugin Pet-Pack Output

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Test: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add failing bridge tests**

Add tests near the existing declaration-only creator bridge tests in `tests/services/plugin-service.test.js`. Reuse local helpers already present in that file such as `createDeclarationOnlyPluginDir`, `createFakeServiceProcess`, `requestBridge`, and `waitFor`.

Add a helper in the test file if one is not already local to the needed scope:

```js
const createMinimalCodexPetOutput = (root, manifest = {}) => {
  fs.mkdirSync(root, { recursive: true })
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(22, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8X', 12, 'ascii')
  buffer.writeUInt32LE(10, 16)
  buffer.writeUInt8(0, 20)
  buffer.writeUIntLE(1536 - 1, 24, 3)
  buffer.writeUIntLE(1872 - 1, 27, 3)
  fs.writeFileSync(path.join(root, 'spritesheet.webp'), buffer)
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: manifest.id || 'creator-studio-cat',
    displayName: manifest.displayName || 'Creator Studio Cat',
    description: manifest.description || 'A generated OpenPet pet.',
    spritesheetPath: 'spritesheet.webp'
  }))
}
```

Add this test:

```js
test('declaration-only pet pack bridge inspects imports and activates approved plugin output', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  let capturedDataDir = ''
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } },
    petPacks: { activePackId: 'legacy-cat', installed: {} }
  })
  const petPackService = createPetPackService({
    settingsService,
    userPacksDir: fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-packs-')),
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })
  const service = createPluginService({
    settingsService,
    petService: createBridgeAwarePetService(),
    petPackService,
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'hybrid',
      permissions: ['pet-pack:import']
    })],
    spawnCommandProcess: (file, args, options) => {
      capturedDataDir = options.env.OPENPET_DATA_DIR
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.listenerCount('exit') > 0)
  const outputDir = path.join(capturedDataDir, 'runs', 'approved-cat', 'outputs')
  createMinimalCodexPetOutput(outputDir)
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const inspectResponse = await requestBridge(`${baseUrl}/creator/pet-pack/inspect-output`, {
    token,
    body: { dataRelativePath: 'runs/approved-cat/outputs' }
  })
  const importResponse = await requestBridge(`${baseUrl}/creator/pet-pack/import-output`, {
    token,
    body: { selectionId: inspectResponse.body.selectionId, activate: true }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(inspectResponse.statusCode, 200)
  assert.equal(inspectResponse.body.ok, true)
  assert.equal(inspectResponse.body.inspection.valid, true)
  assert.equal(inspectResponse.body.inspection.pack.id, 'creator-studio-cat')
  assert.equal(importResponse.statusCode, 200)
  assert.equal(importResponse.body.ok, true)
  assert.equal(importResponse.body.imported.pack.id, 'creator-studio-cat')
  assert.equal(importResponse.body.activated.activePackId, 'creator-studio-cat')
  assert.equal(settingsService.get().petPacks.activePackId, 'creator-studio-cat')
})
```

Add the missing permission test:

```js
test('declaration-only pet pack bridge rejects missing import permission', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  let capturedDataDir = ''
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      profile: 'hybrid',
      permissions: []
    })],
    spawnCommandProcess: (file, args, options) => {
      capturedDataDir = options.env.OPENPET_DATA_DIR
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => child.listenerCount('exit') > 0)
  createMinimalCodexPetOutput(path.join(capturedDataDir, 'runs', 'approved-cat', 'outputs'))
  const response = await requestBridge(`${spawned[0].options.env.OPENPET_BRIDGE_URL}/creator/pet-pack/inspect-output`, {
    token: spawned[0].options.env.OPENPET_BRIDGE_TOKEN,
    body: { dataRelativePath: 'runs/approved-cat/outputs' }
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(response.statusCode, 403)
  assert.match(response.body.error, /pet-pack:import/)
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "pet pack bridge"
```

Expected: route returns `404` or missing route handling.

- [ ] **Step 3: Add plugin data path resolution**

In `createPluginService`, add a resolver near `resolvePluginAssetPath`:

```js
  const resolvePluginDataPath = (manifest, relativePath) => {
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      throw new Error('Plugin data relative path is required')
    }
    const normalized = relativePath.replace(/\\/g, '/')
    if (
      normalized.startsWith('/') ||
      /^[a-zA-Z]:\//.test(normalized) ||
      normalized.includes('\0') ||
      normalized.split('/').includes('..')
    ) {
      throw new Error('Plugin data path must be a safe relative path')
    }
    const { dataDir } = ensurePluginCreatorDirs(manifest)
    const basePath = path.resolve(dataDir)
    const targetPath = path.resolve(basePath, normalized)
    if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
      throw new Error('Plugin data path must stay inside plugin data directory')
    }
    if (!fs.existsSync(targetPath)) throw new Error('Plugin data path does not exist')
    const realTargetPath = fs.realpathSync(targetPath)
    const realBasePath = fs.realpathSync(basePath)
    if (realTargetPath !== realBasePath && !realTargetPath.startsWith(`${realBasePath}${path.sep}`)) {
      throw new Error('Plugin data path must stay inside plugin data directory')
    }
    return realTargetPath
  }
```

- [ ] **Step 4: Add bridge handlers**

Inside `createPluginBridgeHandlers`, add these handlers after asset handlers:

```js
    creatorPetPackInspectOutput: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet-pack:import')
      if (!petPackService?.inspectPackSource) throw new Error('Creator pet pack inspection is not available')
      const sourcePath = payload.dataRelativePath
        ? resolvePluginDataPath(plugin.manifest, payload.dataRelativePath)
        : resolvePluginAssetPath(plugin.manifest, payload.relativePath)
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pet-pack inspect-output invoked' })
      return { ok: true, inspection: petPackService.inspectPackSource(sourcePath) }
    },
    creatorPetPackImportOutput: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet-pack:import')
      if (!petPackService?.importPack) throw new Error('Creator pet pack import is not available')
      const selectionId = String(payload.selectionId || '')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pet-pack import-output invoked' })
      const imported = petPackService.importPack(selectionId)
      const activated = payload.activate && imported?.pack?.id && petPackService?.setActivePack
        ? petPackService.setActivePack(imported.pack.id)
        : null
      return { ok: true, imported, activated }
    },
    creatorPetPackActivate: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet-pack:import')
      if (!petPackService?.setActivePack) throw new Error('Creator pet pack activation is not available')
      const packId = String(payload.packId || '')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: `Bridge creator.pet-pack activate invoked: ${packId}`.slice(0, 240) })
      return { ok: true, activated: petPackService.setActivePack(packId) }
    },
```

- [ ] **Step 5: Add route matching and dispatch**

Extend the bridge route regex to include:

```text
/creator/pet-pack/inspect-output
/creator/pet-pack/import-output
/creator/pet-pack/activate
```

Then add dispatch blocks after JSON payload parsing:

```js
        if (route === '/creator/pet-pack/inspect-output') {
          sendJson(response, 200, await runtime.handlers.creatorPetPackInspectOutput(payload))
          return
        }
        if (route === '/creator/pet-pack/import-output') {
          sendJson(response, 200, await runtime.handlers.creatorPetPackImportOutput(payload))
          return
        }
        if (route === '/creator/pet-pack/activate') {
          sendJson(response, 200, await runtime.handlers.creatorPetPackActivate(payload))
          return
        }
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "pet pack bridge"
```

Expected: both new tests pass.

- [ ] **Step 7: Run broader service tests**

Run:

```bash
node --test tests/services/plugin-service.test.js tests/services/pet-pack-service.test.js
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/main/services/plugin-service.js tests/services/plugin-service.test.js
git commit -m "feat: import plugin generated pet packs"
```

## Task 3: Scaffold Creator Studio Example Manifest and Config

**Files:**
- Create: `examples/plugins/creator-studio/plugin.json`
- Create: `examples/plugins/creator-studio/config.schema.json`
- Create: `examples/plugins/creator-studio/README.md`
- Test: `tests/examples/creator-studio-plugin.test.js`

- [ ] **Step 1: Write the manifest validation test**

Create `tests/examples/creator-studio-plugin.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { normalizePluginManifest } = require('../../src/main/plugins/manifest')

const pluginRoot = path.resolve(__dirname, '../../examples/plugins/creator-studio')

test('creator studio example manifest declares hybrid creator workflow entries', () => {
  const manifest = normalizePluginManifest(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf-8')),
    { source: 'local', basePath: pluginRoot }
  )

  assert.equal(manifest.id, 'openpet.creator-studio')
  assert.equal(manifest.profile, 'hybrid')
  assert.deepEqual(manifest.permissions, ['pet-pack:import', 'pet:say'])
  assert.deepEqual(manifest.commands.map((command) => command.id), [
    'create-run',
    'run-step',
    'approve-run',
    'import-approved-pet',
    'export-bundle'
  ])
  assert.equal(manifest.entries.services[0].id, 'studio')
  assert.equal(manifest.entries.dashboards[0].id, 'main')
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected: failure because the plugin files do not exist.

- [ ] **Step 3: Create `plugin.json`**

Create `examples/plugins/creator-studio/plugin.json`:

```json
{
  "id": "openpet.creator-studio",
  "name": "Creator Studio",
  "version": "0.1.0",
  "profile": "hybrid",
  "description": "Create, review, import, and export Codex-compatible OpenPet pets.",
  "permissions": ["pet-pack:import", "pet:say"],
  "config": "config.schema.json",
  "entries": {
    "commands": [
      { "id": "create-run", "title": "Create Run", "command": "node ./commands/create-run.js", "cwd": "." },
      { "id": "run-step", "title": "Run Step", "command": "node ./commands/run-step.js", "cwd": "." },
      { "id": "approve-run", "title": "Approve Run", "command": "node ./commands/approve-run.js", "cwd": "." },
      { "id": "import-approved-pet", "title": "Import Approved Pet", "command": "node ./commands/import-approved-pet.js", "cwd": "." },
      { "id": "export-bundle", "title": "Export Bundle", "command": "node ./commands/export-bundle.js", "cwd": "." }
    ],
    "services": [
      {
        "id": "studio",
        "title": "Creator Studio Service",
        "command": "node ./service/studio-service.js",
        "cwd": ".",
        "health": { "type": "http", "url": "http://127.0.0.1:8794/health" }
      }
    ],
    "dashboards": [
      { "id": "main", "title": "Creator Studio", "url": "http://127.0.0.1:8794" }
    ]
  },
  "manifest": {
    "dataLocations": [
      { "path": "OPENPET_DATA_DIR/runs", "description": "Creator Studio run workspaces and generated pet outputs." }
    ],
    "modelBackends": ["fixture", "cloud", "local"],
    "outputFormat": "codex-pet"
  },
  "assets": ["web/dashboard/index.html"]
}
```

- [ ] **Step 4: Create `config.schema.json`**

Create `examples/plugins/creator-studio/config.schema.json`:

```json
{
  "properties": [
    {
      "key": "backend",
      "title": "Backend",
      "type": "string",
      "enum": ["fixture", "cloud", "local"],
      "default": "fixture"
    },
    {
      "key": "autoActivateAfterImport",
      "title": "Auto activate imported pet",
      "type": "boolean",
      "default": true
    },
    {
      "key": "servicePort",
      "title": "Dashboard service port",
      "type": "number",
      "default": 8794
    }
  ]
}
```

- [ ] **Step 5: Create README**

Create `examples/plugins/creator-studio/README.md`:

```md
# Creator Studio Example Extension

Creator Studio is a hybrid OpenPet extension that demonstrates the end-to-end pet creation workflow planned for hatch-pet style generation.

The first implementation uses a deterministic fixture backend. It creates a valid `codex-pet` output, moves the run through review, then imports the approved output through OpenPet's host-owned pet-pack bridge.

Current commands:

- `create-run`: create a run workspace under `OPENPET_DATA_DIR/runs`.
- `run-step`: generate fixture output and QA metadata for a run.
- `approve-run`: mark a run approved.
- `import-approved-pet`: ask OpenPet to inspect and import the approved output.
- `export-bundle`: return the generated `.codex-pet.zip` output details.

Future backend adapters can replace the fixture generator without changing the run workspace contract.
```

- [ ] **Step 6: Run the manifest test**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected: manifest test passes.

- [ ] **Step 7: Commit**

```bash
git add examples/plugins/creator-studio/plugin.json examples/plugins/creator-studio/config.schema.json examples/plugins/creator-studio/README.md tests/examples/creator-studio-plugin.test.js
git commit -m "feat: scaffold creator studio extension"
```

## Task 4: Add Run Store and Deterministic Hatch-Pet Fixture

**Files:**
- Create: `examples/plugins/creator-studio/lib/run-store.js`
- Create: `examples/plugins/creator-studio/lib/fake-hatch-pet.js`
- Test: `tests/examples/creator-studio-plugin.test.js`

- [ ] **Step 1: Add failing run store tests**

Append to `tests/examples/creator-studio-plugin.test.js`:

```js
const os = require('node:os')
const crypto = require('node:crypto')

test('creator studio run store creates and advances durable run state', () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-test-'))

  const run = createRun({
    dataDir,
    input: {
      petName: 'Sprout Cat',
      prompt: 'A small mint helper cat',
      backend: 'fixture'
    },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const updated = updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'prepared',
    patch: { currentStep: 'prepare' },
    now: () => '2026-06-19T00:01:00.000Z'
  })

  assert.equal(run.status, 'draft')
  assert.equal(readRun({ dataDir, runId: run.runId }).input.petName, 'Sprout Cat')
  assert.equal(updated.status, 'prepared')
  assert.equal(updated.currentStep, 'prepare')
})

test('creator studio fake hatch pet creates valid codex output and bundle', () => {
  const { createRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { generateFixturePetOutput } = require('../../examples/plugins/creator-studio/lib/fake-hatch-pet')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-output-'))
  const run = createRun({
    dataDir,
    input: { petName: 'Sprout Cat', prompt: 'A small mint helper cat', backend: 'fixture' },
    now: () => '2026-06-19T00:00:00.000Z'
  })

  const output = generateFixturePetOutput({ dataDir, runId: run.runId })
  const manifest = JSON.parse(fs.readFileSync(path.join(output.outputDir, 'pet.json'), 'utf-8'))
  const bundleHash = crypto.createHash('sha256').update(fs.readFileSync(output.bundlePath)).digest('hex')

  assert.equal(manifest.id, run.petId)
  assert.equal(manifest.spritesheetPath, 'spritesheet.webp')
  assert.equal(fs.existsSync(path.join(output.outputDir, 'spritesheet.webp')), true)
  assert.equal(fs.existsSync(output.bundlePath), true)
  assert.equal(output.sha256, bundleHash)
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected: failure because modules do not exist.

- [ ] **Step 3: Create run store**

Create `examples/plugins/creator-studio/lib/run-store.js`:

```js
const fs = require('fs')
const path = require('path')

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

const slugify = (value) => String(value || 'pet')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^-|-$/g, '')
  || 'pet'

const ensureDirectory = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const getRunsDir = (dataDir) => path.join(dataDir, 'runs')

const getRunDir = ({ dataDir, runId }) => {
  if (!SAFE_ID_PATTERN.test(runId || '')) throw new Error('Creator Studio runId is invalid')
  return path.join(getRunsDir(dataDir), runId)
}

const getRunPath = ({ dataDir, runId }) => path.join(getRunDir({ dataDir, runId }), 'run.json')

const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf-8'))

const createRun = ({ dataDir, input = {}, now = () => new Date().toISOString() }) => {
  if (!dataDir) throw new Error('Creator Studio dataDir is required')
  const timestamp = now()
  const petName = String(input.petName || 'Creator Studio Pet').trim() || 'Creator Studio Pet'
  const petId = slugify(input.petId || petName)
  const runId = `${timestamp.slice(0, 10)}-${petId}`.replace(/[^a-zA-Z0-9_-]/g, '-')
  const runDir = getRunDir({ dataDir, runId })
  ensureDirectory(path.join(runDir, 'inputs', 'references'))
  ensureDirectory(path.join(runDir, 'jobs', 'prompts'))
  ensureDirectory(path.join(runDir, 'decoded'))
  ensureDirectory(path.join(runDir, 'frames'))
  ensureDirectory(path.join(runDir, 'outputs'))
  ensureDirectory(path.join(runDir, 'qa'))
  ensureDirectory(path.join(runDir, 'logs'))
  const run = {
    runId,
    petId,
    status: 'draft',
    backend: input.backend || 'fixture',
    modelProvider: input.modelProvider || input.backend || 'fixture',
    createdAt: timestamp,
    updatedAt: timestamp,
    currentStep: 'draft',
    input: {
      petName,
      prompt: String(input.prompt || ''),
      backend: input.backend || 'fixture'
    },
    artifacts: {},
    jobs: [],
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    error: ''
  }
  writeJson(getRunPath({ dataDir, runId }), run)
  fs.writeFileSync(path.join(runDir, 'inputs', 'prompt.md'), `${run.input.prompt}\n`)
  writeJson(path.join(runDir, 'inputs', 'config.json'), run.input)
  return run
}

const readRun = ({ dataDir, runId }) => readJson(getRunPath({ dataDir, runId }))

const writeRun = ({ dataDir, run }) => {
  writeJson(getRunPath({ dataDir, runId: run.runId }), run)
  return run
}

const updateRunStatus = ({ dataDir, runId, status, patch = {}, now = () => new Date().toISOString() }) => {
  const current = readRun({ dataDir, runId })
  return writeRun({
    dataDir,
    run: {
      ...current,
      ...patch,
      status,
      updatedAt: now()
    }
  })
}

module.exports = {
  createRun,
  getRunDir,
  readRun,
  updateRunStatus,
  writeRun
}
```

- [ ] **Step 4: Create fixture generator**

Create `examples/plugins/creator-studio/lib/fake-hatch-pet.js`:

```js
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const { getRunDir, readRun, writeRun } = require('./run-store')

const createMinimalWebp = ({ width = 1536, height = 1872 } = {}) => {
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(22, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8X', 12, 'ascii')
  buffer.writeUInt32LE(10, 16)
  buffer.writeUInt8(0, 20)
  buffer.writeUIntLE(width - 1, 24, 3)
  buffer.writeUIntLE(height - 1, 27, 3)
  return buffer
}

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const writeZip = (sourceDir, outputPath) => {
  fs.rmSync(outputPath, { force: true })
  execFileSync('zip', ['-qr', outputPath, '.'], { cwd: sourceDir })
}

const generateFixturePetOutput = ({ dataDir, runId, now = () => new Date().toISOString() }) => {
  const run = readRun({ dataDir, runId })
  const runDir = getRunDir({ dataDir, runId })
  const outputDir = path.join(runDir, 'outputs')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), createMinimalWebp())
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: run.petId,
    displayName: run.input.petName,
    description: run.input.prompt || `A generated OpenPet pet named ${run.input.petName}.`,
    spritesheetPath: 'spritesheet.webp'
  }, null, 2)}\n`)
  const qaDir = path.join(runDir, 'qa')
  fs.mkdirSync(qaDir, { recursive: true })
  fs.writeFileSync(path.join(qaDir, 'atlas-validation.json'), `${JSON.stringify({
    ok: true,
    width: 1536,
    height: 1872,
    warnings: []
  }, null, 2)}\n`)
  const bundlePath = path.join(outputDir, `${run.petId}.codex-pet.zip`)
  writeZip(outputDir, bundlePath)
  const nextRun = {
    ...run,
    status: 'ready_for_review',
    currentStep: 'review',
    updatedAt: now(),
    artifacts: {
      ...run.artifacts,
      outputDir,
      petJson: path.join(outputDir, 'pet.json'),
      spritesheet: path.join(outputDir, 'spritesheet.webp'),
      bundle: bundlePath,
      qa: path.join(qaDir, 'atlas-validation.json')
    },
    reviewStatus: 'pending',
    error: ''
  }
  writeRun({ dataDir, run: nextRun })
  return {
    outputDir,
    bundlePath,
    sha256: sha256(bundlePath),
    run: nextRun
  }
}

module.exports = { generateFixturePetOutput }
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add examples/plugins/creator-studio/lib/run-store.js examples/plugins/creator-studio/lib/fake-hatch-pet.js tests/examples/creator-studio-plugin.test.js
git commit -m "feat: add creator studio run workspace"
```

## Task 5: Implement Creator Studio Command Entries

**Files:**
- Create: `examples/plugins/creator-studio/lib/command-io.js`
- Create: `examples/plugins/creator-studio/lib/bridge-client.js`
- Create: `examples/plugins/creator-studio/commands/create-run.js`
- Create: `examples/plugins/creator-studio/commands/run-step.js`
- Create: `examples/plugins/creator-studio/commands/approve-run.js`
- Create: `examples/plugins/creator-studio/commands/import-approved-pet.js`
- Create: `examples/plugins/creator-studio/commands/export-bundle.js`
- Test: `tests/examples/creator-studio-plugin.test.js`

- [ ] **Step 1: Add command execution tests**

Append to `tests/examples/creator-studio-plugin.test.js`:

```js
const { spawnSync } = require('node:child_process')

const runCreatorCommand = ({ command, dataDir, payload = {}, env = {} }) => {
  const result = spawnSync(process.execPath, [path.join(pluginRoot, 'commands', `${command}.js`)], {
    input: `${JSON.stringify({
      pluginId: 'openpet.creator-studio',
      commandId: command,
      payload,
      config: { backend: 'fixture', autoActivateAfterImport: true },
      paths: { extensionDir: pluginRoot }
    })}\n`,
    env: {
      ...process.env,
      OPENPET_DATA_DIR: dataDir,
      OPENPET_CACHE_DIR: path.join(dataDir, 'cache'),
      OPENPET_LOG_DIR: path.join(dataDir, 'logs'),
      ...env
    },
    encoding: 'utf-8'
  })
  return {
    ...result,
    json: JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1))
  }
}

test('creator studio commands create run generate output approve and export', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-commands-'))

  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Sprout Cat', prompt: 'A small mint helper cat' }
  })
  const generated = runCreatorCommand({
    command: 'run-step',
    dataDir,
    payload: { runId: created.json.run.runId }
  })
  const approved = runCreatorCommand({
    command: 'approve-run',
    dataDir,
    payload: { runId: created.json.run.runId }
  })
  const exported = runCreatorCommand({
    command: 'export-bundle',
    dataDir,
    payload: { runId: created.json.run.runId }
  })

  assert.equal(created.status, 0)
  assert.equal(generated.status, 0)
  assert.equal(approved.status, 0)
  assert.equal(exported.status, 0)
  assert.equal(created.json.ok, true)
  assert.equal(generated.json.run.status, 'ready_for_review')
  assert.equal(approved.json.run.status, 'approved')
  assert.equal(exported.json.ok, true)
  assert.equal(fs.existsSync(exported.json.bundle.path), true)
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected: command files missing.

- [ ] **Step 3: Create command IO helper**

Create `examples/plugins/creator-studio/lib/command-io.js`:

```js
const readStdinJson = async () => new Promise((resolve, reject) => {
  let text = ''
  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', (chunk) => { text += chunk })
  process.stdin.on('end', () => {
    try {
      resolve(text.trim() ? JSON.parse(text) : {})
    } catch (error) {
      reject(new Error('Creator Studio command input must be JSON'))
    }
  })
  process.stdin.on('error', reject)
})

const writeResult = (value) => {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

const runCommand = async (handler) => {
  try {
    const context = await readStdinJson()
    const result = await handler(context)
    writeResult({ ok: true, ...result })
  } catch (error) {
    writeResult({ ok: false, error: error.message || 'Creator Studio command failed' })
    process.exitCode = 1
  }
}

module.exports = { runCommand }
```

- [ ] **Step 4: Create bridge client**

Create `examples/plugins/creator-studio/lib/bridge-client.js`:

```js
const callBridge = async (route, payload = {}) => {
  const baseUrl = process.env.OPENPET_BRIDGE_URL
  const token = process.env.OPENPET_BRIDGE_TOKEN
  if (!baseUrl || !token) throw new Error('OpenPet bridge is not available')
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  const body = await response.json()
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `OpenPet bridge request failed: ${response.status}`)
  }
  return body
}

module.exports = { callBridge }
```

- [ ] **Step 5: Create command files**

Create `examples/plugins/creator-studio/commands/create-run.js`:

```js
const { runCommand } = require('../lib/command-io')
const { createRun } = require('../lib/run-store')

runCommand(async (context) => {
  const run = createRun({
    dataDir: process.env.OPENPET_DATA_DIR,
    input: {
      ...context.payload,
      backend: context.payload?.backend || context.config?.backend || 'fixture'
    }
  })
  return { message: `Created run ${run.runId}`, run }
})
```

Create `examples/plugins/creator-studio/commands/run-step.js`:

```js
const { runCommand } = require('../lib/command-io')
const { generateFixturePetOutput } = require('../lib/fake-hatch-pet')

runCommand(async (context) => {
  const runId = String(context.payload?.runId || '')
  if (!runId) throw new Error('runId is required')
  const output = generateFixturePetOutput({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId
  })
  return { message: `Generated fixture pet output for ${runId}`, run: output.run, outputDir: output.outputDir }
})
```

Create `examples/plugins/creator-studio/commands/approve-run.js`:

```js
const { runCommand } = require('../lib/command-io')
const { readRun, updateRunStatus } = require('../lib/run-store')

runCommand(async (context) => {
  const runId = String(context.payload?.runId || '')
  if (!runId) throw new Error('runId is required')
  const current = readRun({ dataDir: process.env.OPENPET_DATA_DIR, runId })
  if (current.status !== 'ready_for_review') throw new Error(`Run must be ready_for_review before approval: ${current.status}`)
  const run = updateRunStatus({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId,
    status: 'approved',
    patch: { reviewStatus: 'approved', currentStep: 'approved' }
  })
  return { message: `Approved run ${runId}`, run }
})
```

Create `examples/plugins/creator-studio/commands/import-approved-pet.js`:

```js
const path = require('path')
const { runCommand } = require('../lib/command-io')
const { callBridge } = require('../lib/bridge-client')
const { readRun, updateRunStatus } = require('../lib/run-store')

runCommand(async (context) => {
  const runId = String(context.payload?.runId || '')
  if (!runId) throw new Error('runId is required')
  const current = readRun({ dataDir: process.env.OPENPET_DATA_DIR, runId })
  if (current.status !== 'approved') throw new Error(`Run must be approved before import: ${current.status}`)
  const outputDir = current.artifacts?.outputDir
  if (!outputDir) throw new Error('Run has no output directory')
  const dataRelativePath = path.relative(process.env.OPENPET_DATA_DIR, outputDir).replace(/\\/g, '/')
  const inspection = await callBridge('/creator/pet-pack/inspect-output', { dataRelativePath })
  if (!inspection.inspection?.valid) throw new Error((inspection.inspection?.errors || []).join('; ') || 'Pet pack inspection failed')
  const imported = await callBridge('/creator/pet-pack/import-output', {
    selectionId: inspection.inspection.selectionId,
    activate: context.payload?.activate ?? context.config?.autoActivateAfterImport ?? true
  })
  const run = updateRunStatus({
    dataDir: process.env.OPENPET_DATA_DIR,
    runId,
    status: 'imported',
    patch: {
      importStatus: 'imported',
      importedPackId: imported.imported?.pack?.id || '',
      currentStep: 'imported'
    }
  })
  return { message: `Imported run ${runId}`, run, imported }
})
```

Create `examples/plugins/creator-studio/commands/export-bundle.js`:

```js
const fs = require('fs')
const crypto = require('crypto')
const { runCommand } = require('../lib/command-io')
const { readRun } = require('../lib/run-store')

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

runCommand(async (context) => {
  const runId = String(context.payload?.runId || '')
  if (!runId) throw new Error('runId is required')
  const run = readRun({ dataDir: process.env.OPENPET_DATA_DIR, runId })
  const bundlePath = run.artifacts?.bundle
  if (!bundlePath || !fs.existsSync(bundlePath)) throw new Error('Run has no export bundle')
  return {
    message: `Export bundle ready for ${runId}`,
    bundle: {
      path: bundlePath,
      sha256: sha256(bundlePath),
      byteSize: fs.statSync(bundlePath).size
    }
  }
})
```

- [ ] **Step 6: Run command tests**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add examples/plugins/creator-studio/lib/command-io.js examples/plugins/creator-studio/lib/bridge-client.js examples/plugins/creator-studio/commands tests/examples/creator-studio-plugin.test.js
git commit -m "feat: add creator studio commands"
```

## Task 6: Add Creator Studio Service and Dashboard Shell

**Files:**
- Create: `examples/plugins/creator-studio/service/studio-service.js`
- Create: `examples/plugins/creator-studio/web/dashboard/index.html`
- Test: `tests/examples/creator-studio-plugin.test.js`

- [ ] **Step 1: Add service static dashboard test**

Append:

```js
test('creator studio dashboard asset exists and service script is declared', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const servicePath = path.join(pluginRoot, 'service', 'studio-service.js')
  assert.equal(fs.existsSync(dashboardPath), true)
  assert.equal(fs.existsSync(servicePath), true)
  assert.match(fs.readFileSync(dashboardPath, 'utf-8'), /Creator Studio/)
})
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected: missing service/dashboard files.

- [ ] **Step 3: Create service**

Create `examples/plugins/creator-studio/service/studio-service.js`:

```js
const http = require('http')
const fs = require('fs')
const path = require('path')

const port = Number(process.env.OPENPET_CREATOR_STUDIO_PORT || 8794)
const dashboardPath = path.join(__dirname, '..', 'web', 'dashboard', 'index.html')

const listRuns = () => {
  const runsDir = path.join(process.env.OPENPET_DATA_DIR || '', 'runs')
  if (!runsDir || !fs.existsSync(runsDir)) return []
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const runPath = path.join(runsDir, entry.name, 'run.json')
      if (!fs.existsSync(runPath)) return null
      try {
        return JSON.parse(fs.readFileSync(runPath, 'utf-8'))
      } catch (_) {
        return null
      }
    })
    .filter(Boolean)
}

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    sendJson(response, 200, { ok: true, service: 'creator-studio' })
    return
  }
  if (request.url === '/api/runs') {
    sendJson(response, 200, { ok: true, runs: listRuns() })
    return
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(fs.readFileSync(dashboardPath, 'utf-8'))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Creator Studio dashboard listening on http://127.0.0.1:${port}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

- [ ] **Step 4: Create dashboard shell**

Create `examples/plugins/creator-studio/web/dashboard/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Creator Studio</title>
    <style>
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #1f2933;
        background: #f7f7f4;
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px;
      }
      .panel {
        border: 1px solid #d8d8d0;
        border-radius: 8px;
        background: #fff;
        padding: 20px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      p {
        margin: 0;
        color: #52616b;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="panel">
        <h1>Creator Studio</h1>
        <p>Run creation, review, import, and export controls will live here. The first implementation exposes command entries through OpenPet Control Center.</p>
      </div>
    </main>
  </body>
</html>
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add examples/plugins/creator-studio/service examples/plugins/creator-studio/web tests/examples/creator-studio-plugin.test.js
git commit -m "feat: add creator studio service shell"
```

## Task 7: Add End-to-End Plugin Import Test

**Files:**
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add an end-to-end command bridge test**

Add this test to `tests/services/plugin-service.test.js`. It runs the example plugin commands against real `PluginService`, `PetPackService`, and command process spawning:

```js
test('creator studio example imports approved fixture pet through host bridge', async () => {
  const settingsService = createSettingsService({
    plugins: { enabled: { 'openpet.creator-studio': true } },
    petPacks: { activePackId: 'legacy-cat', installed: {} }
  })
  const userPacksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-import-'))
  const petPackService = createPetPackService({
    settingsService,
    userPacksDir,
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })
  const service = createPluginService({
    settingsService,
    petService: createBridgeAwarePetService(),
    petPackService,
    officialPlugins: [],
    pluginDirs: [path.resolve(__dirname, '../../examples/plugins')]
  })

  const createResult = await service.runCommand('openpet.creator-studio', 'create-run', {
    petName: 'Sprout Cat',
    prompt: 'A small mint helper cat'
  })
  const runId = createResult.result.run.runId
  await service.runCommand('openpet.creator-studio', 'run-step', { runId })
  await service.runCommand('openpet.creator-studio', 'approve-run', { runId })
  const importResult = await service.runCommand('openpet.creator-studio', 'import-approved-pet', { runId, activate: true })

  assert.equal(importResult.ok, true)
  assert.equal(importResult.result.ok, true)
  assert.equal(importResult.result.run.importStatus, 'imported')
  assert.equal(settingsService.get().petPacks.activePackId, 'sprout-cat')
  assert.equal(fs.existsSync(path.join(userPacksDir, 'sprout-cat', 'pet.json')), true)
})
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "creator studio example imports"
```

Expected: pass.

- [ ] **Step 3: Verify command result shape**

Confirm the test asserts the existing command-entry shape returned by `service.runCommand()`: top-level command execution metadata with parsed stdout JSON under `result`.

- [ ] **Step 4: Run focused suites**

Run:

```bash
node --test tests/services/plugin-service.test.js tests/examples/creator-studio-plugin.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add tests/services/plugin-service.test.js
git commit -m "test: cover creator studio import workflow"
```

## Task 8: Update Documentation

**Files:**
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`
- Verify: `README.md`

- [ ] **Step 1: Add Creator Studio to plugin development docs**

In `docs/plugin-development.md`, add a short section after the package layout examples:

```md
## Creator Tools Example: Creator Studio

`examples/plugins/creator-studio/` demonstrates a hybrid creator-tools extension. It creates durable pet-generation runs under `OPENPET_DATA_DIR`, produces a valid `codex-pet` fixture output, requires explicit approval, and imports the approved output through OpenPet's host-owned pet-pack bridge.

The example intentionally uses a deterministic fixture backend first. Cloud and local model adapters can replace the fixture generator while keeping the same run workspace and review/import contract.
```

- [ ] **Step 2: Document new permission**

In the permission/bridge section of `docs/plugin-ecosystem-rules.md`, add `pet-pack:import` to the creator use cases and explain:

```md
- approved full pet-pack import through `pet-pack:import`, where the extension provides an output path and OpenPet performs inspection, import, policy checks, and optional activation.
```

- [ ] **Step 3: Run docs syntax sanity**

Run:

```bash
rg -n "pet-pack:import|Creator Studio" docs/plugin-development.md docs/plugin-ecosystem-rules.md
```

Expected: both docs mention the new capability.

- [ ] **Step 4: Verify README does not need a duplicate entry**

Run:

```bash
rg -n "plugin-development|plugin ecosystem|Creator Studio" README.md
```

Expected: either README already points developers to plugin docs, or no README plugin section exists. Do not add a duplicate README entry in this first slice.

- [ ] **Step 5: Commit**

```bash
git add docs/plugin-development.md docs/plugin-ecosystem-rules.md
git commit -m "docs: document creator studio extension workflow"
```

## Task 9: Final Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
node --test tests/plugins/manifest.test.js tests/services/plugin-service.test.js tests/services/pet-pack-service.test.js tests/examples/creator-studio-plugin.test.js
```

Expected: pass.

- [ ] **Step 2: Run all Node tests**

Run:

```bash
npm test
```

Expected: pass.

- [ ] **Step 3: Run syntax/type/build baseline**

Run:

```bash
npm run check:syntax
```

Expected: pass.

- [ ] **Step 4: Check worktree**

Run:

```bash
git status --short
```

Expected: only intentional untracked `.superpowers/` brainstorming files may remain. Do not commit `.superpowers/`.

- [ ] **Step 5: Confirm no verification commit is needed**

Run:

```bash
git status --short
```

Expected: no additional tracked changes beyond the commits made in previous tasks.

## Self-Review Notes

- Spec coverage: The plan covers host import authority, plugin package shape, run workspace, fake generation, review/approval, import/export, dashboard shell, and tests. Real cloud/local model adapters are intentionally deferred behind the adapter boundary because the first implementation needs a deterministic end-to-end slice.
- Placeholder scan: No task uses an open-ended placeholder as an implementation step. Deferred cloud/local model work is named explicitly as out of first-slice scope.
- Type consistency: Permission name is consistently `pet-pack:import`; run statuses use `draft`, `ready_for_review`, `approved`, and `imported` in the first executable slice.
