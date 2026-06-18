# Plugin Creator-Tools Pack Manifest Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permissioned creator-tools bridge workflow for reading, validating, and applying bounded active-pack manifest metadata through the host.

**Architecture:** Keep `PluginService` responsible for permission checks, bridge routing, and logging. Put creator pack-manifest validation and persistence into `PetPackService`, which already owns active installed pack loading and `pet.json` writes, and keep action/assets outside this route.

**Tech Stack:** Electron main process, CommonJS services, Node native test runner, shared TypeScript contracts, pet-pack schema normalization, production-code-quality-review workflow.

---

## File Map

- Modify: `src/main/plugins/manifest.js`
  Purpose: allow `pack-manifest:read` and `pack-manifest:write`.
- Modify: `tests/plugins/manifest.test.js`
  Purpose: prove the new permissions normalize correctly.
- Modify: `src/main/services/pet-pack-service.js`
  Purpose: add creator manifest read, validate, and apply helpers over the active installed user pack.
- Modify: `tests/services/pet-pack-service.test.js`
  Purpose: cover successful read/validate/apply, built-in rejection, unsupported-key rejection, and host-owned field preservation.
- Modify: `src/main/services/plugin-service.js`
  Purpose: add bridge handlers and route dispatch for `/creator/pack-manifest`, `/creator/pack-manifest/validate`, and `/creator/pack-manifest/apply`.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: cover successful bridge read/validate/apply, missing permission, and built-in-pack rejection.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: add plugin-facing request/response contracts for creator pack-manifest workflows.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: keep new shared contracts type-checked with concrete fixtures.
- Create: `docs/phases/phase-84-plugin-creator-tools-pack-manifest.md`
  Purpose: record delivered scope, decisions, verification, and remaining limits.
- Create: `docs/reviews/phase-84-plugin-creator-tools-pack-manifest-review.md`
  Purpose: record production review findings, score, pass state, fixes, and residual risks.
- Modify: `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, `docs/productization-v1.1-todo-design.md`, `docs/development-summary.md`, `docs/project-status-review.md`, `docs/HANDOFF.md`, `docs/project-context.json`, `README.md`, `README.zh-CN.md`
  Purpose: keep live extension and project-state docs aligned with the new host-mediated pack-manifest boundary.

## Execution Preconditions

- Work on `codex/creator-tools-pack-manifest-phase84`.
- `git fetch origin main` has completed.
- `git rev-list --left-right --count HEAD...origin/main` shows `0` commits on the right side or `origin/main` has been merged.
- Worktree is clean before implementation except for this Phase 84 spec/plan when continuing immediately from planning.
- Preserve Phase 80 action workflows and Phase 83 asset workflows unchanged. This phase must not reopen raw writes, arbitrary pack targeting, or action/asset ownership boundaries.
- If this branch already contains a partial draft using `pet-pack:read` / `pet-pack:write`, migrate that draft instead of layering on top of it:
  - replace those permissions with `pack-manifest:read` / `pack-manifest:write`;
  - rename service helpers from `getCreatorActiveManifest`, `validateCreatorManifestMutation`, and `applyCreatorManifestMutation` to `getActiveCreatorPackManifest`, `validateActiveCreatorPackManifestMutation`, and `applyActiveCreatorPackManifestMutation`;
  - reject unsupported provenance fields such as `importedAt` and `originalFormat` instead of normalizing them from plugin payloads;
  - mirror editable provenance values into both legacy top-level provenance fields and the nested `provenance` object before reload validation.

## Task 1: Permission RED/GREEN

**Files:**
- Modify: `tests/plugins/manifest.test.js`
- Modify: `src/main/plugins/manifest.js`

- [ ] **Step 1: Add failing manifest permission tests**

Add these tests near the existing creator-tools permission coverage:

```js
test('normalizes creator-tools pack manifest read permission', () => {
  const manifest = normalizePluginManifest({
    id: 'pack-manifest-reader',
    name: 'Pack Manifest Reader',
    version: '1.0.0',
    profile: 'creator-tools',
    permissions: ['pack-manifest:read']
  })

  assert.equal(manifest.profile, 'creator-tools')
  assert.deepEqual(manifest.permissions, ['pack-manifest:read'])
})

test('normalizes creator-tools pack manifest write permission', () => {
  const manifest = normalizePluginManifest({
    id: 'pack-manifest-writer',
    name: 'Pack Manifest Writer',
    version: '1.0.0',
    profile: 'creator-tools',
    permissions: ['pack-manifest:write']
  })

  assert.equal(manifest.profile, 'creator-tools')
  assert.deepEqual(manifest.permissions, ['pack-manifest:write'])
})
```

- [ ] **Step 1a: Replace any broader draft permission vocabulary**

If `tests/plugins/manifest.test.js` already contains a test named `normalizes creator-tools pet-pack permissions`, replace it with the two `pack-manifest` tests from Step 1. If `src/main/plugins/manifest.js` already allows `pet-pack:read` or `pet-pack:write`, remove those entries before adding the narrower permissions.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "pack manifest"
```

Expected: FAIL with `Unknown plugin permission`.

- [ ] **Step 3: Implement the permission allowlist**

Extend `KNOWN_PLUGIN_PERMISSIONS` in `src/main/plugins/manifest.js`:

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
  'assets:generate',
  'pack-manifest:read',
  'pack-manifest:write'
])
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "pack manifest"
```

Expected: PASS.

## Task 2: PetPackService Manifest Workflow RED/GREEN

**Files:**
- Modify: `tests/services/pet-pack-service.test.js`
- Modify: `src/main/services/pet-pack-service.js`

- [ ] **Step 1: Add a failing successful read/validate/apply service test**

Add a focused test after the existing `updateActivePetPackManifest` coverage:

```js
test('pet pack service reads validates and applies creator pack manifest metadata for the active installed pack', () => {
  const sourceDir = createTempDir('pet-pack-creator-manifest')
  createPetPackDirectory(sourceDir, {
    id: 'creator-pack-cat',
    displayName: 'Creator Pack Cat',
    version: '1.0.0',
    sourceUrl: 'https://example.com/original',
    assetAuthor: 'Original Author',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
  })
  const settingsService = createSettingsService()
  const service = createService(settingsService)

  const inspection = service.inspectPackDirectory(sourceDir)
  service.importPack(inspection.selectionId)
  service.setActivePack('creator-pack-cat')

  const read = service.getActiveCreatorPackManifest()
  const validation = service.validateActiveCreatorPackManifestMutation({
    displayName: 'Creator Pack Cat Deluxe',
    version: '1.1.0',
    provenance: {
      sourceUrl: 'https://example.com/deluxe',
      assetAuthor: 'Updated Author',
      license: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
    }
  })
  const applied = service.applyActiveCreatorPackManifestMutation({
    displayName: 'Creator Pack Cat Deluxe',
    version: '1.1.0',
    provenance: {
      sourceUrl: 'https://example.com/deluxe',
      assetAuthor: 'Updated Author',
      license: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
    }
  })

  assert.equal(read.id, 'creator-pack-cat')
  assert.equal(read.displayName, 'Creator Pack Cat')
  assert.equal(validation.ok, true)
  assert.deepEqual(validation.errors, [])
  assert.equal(applied.displayName, 'Creator Pack Cat Deluxe')
  assert.equal(applied.version, '1.1.0')
  assert.equal(applied.provenance.license, 'CC-BY-SA-4.0')
})
```

- [ ] **Step 2: Add failing safety tests**

Add service tests for built-in rejection, unsupported keys, and host-owned field preservation:

```js
test('pet pack service rejects creator manifest mutation for built-in packs', () => {
  const service = createService()

  assert.throws(
    () => service.getActiveCreatorPackManifest(),
    /active installed pet pack/i
  )
  const validation = service.validateActiveCreatorPackManifestMutation({
    displayName: 'Should Fail'
  })
  assert.equal(validation.ok, false)
  assert.match(validation.errors.join('\n'), /active installed pet pack/i)
})

test('pet pack service rejects unsupported creator manifest keys', () => {
  const sourceDir = createTempDir('pet-pack-creator-manifest-unsupported')
  createPetPackDirectory(sourceDir, { id: 'unsupported-pack-cat' })
  const settingsService = createSettingsService()
  const service = createService(settingsService)

  const inspection = service.inspectPackDirectory(sourceDir)
  service.importPack(inspection.selectionId)
  service.setActivePack('unsupported-pack-cat')

  const validation = service.validateActiveCreatorPackManifestMutation({
    id: 'new-id',
    defaultAction: 'wave',
    provenance: {
      importedAt: '2026-06-18T00:00:00.000Z'
    }
  })

  assert.equal(validation.ok, false)
  assert.match(validation.errors.join('\n'), /Unsupported creator pack manifest field: id/)
  assert.match(validation.errors.join('\n'), /Unsupported creator pack manifest field: defaultAction/)
  assert.match(validation.errors.join('\n'), /Unsupported creator pack manifest provenance field: importedAt/)
})

test('pet pack service preserves host-owned and action fields during creator manifest apply', () => {
  const sourceDir = createTempDir('pet-pack-creator-manifest-preserve')
  createPetPackDirectory(sourceDir, {
    id: 'preserve-pack-cat',
    displayName: 'Preserve Pack Cat',
    version: '1.0.0'
  })
  const settingsService = createSettingsService()
  const service = createService(settingsService)

  const inspection = service.inspectPackDirectory(sourceDir)
  service.importPack(inspection.selectionId)
  service.setActivePack('preserve-pack-cat')

  const installedRoot = service.listPacks().packs.find((pack) => pack.id === 'preserve-pack-cat').rootPath
  const manifestPath = path.join(installedRoot, 'pet.json')
  const original = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

  const applied = service.applyActiveCreatorPackManifestMutation({
    displayName: 'Preserve Pack Cat Deluxe',
    provenance: {
      sourceUrl: 'https://example.com/preserve'
    }
  })
  const persisted = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

  assert.equal(applied.id, 'preserve-pack-cat')
  assert.equal(persisted.id, original.id)
  assert.equal(persisted.defaultAction, original.defaultAction)
  assert.equal(persisted.clickAction, original.clickAction)
  assert.deepEqual(persisted.actions, original.actions)
})
```

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test tests/services/pet-pack-service.test.js --test-name-pattern "creator manifest"
```

Expected: FAIL because the creator manifest helpers do not exist yet.

- [ ] **Step 4: Implement creator manifest helpers in `PetPackService`**

Add the schema import at the top of `src/main/services/pet-pack-service.js`:

```js
const { normalizePetPackManifest } = require('../pet-pack/schema')
```

Add helper constants near the existing pack helpers:

```js
const CREATOR_PACK_MANIFEST_FIELDS = new Set(['displayName', 'version', 'provenance'])
const CREATOR_PACK_MANIFEST_PROVENANCE_FIELDS = new Set(['sourceUrl', 'assetAuthor', 'license', 'licenseUrl'])
```

Add helper functions:

```js
const cloneCreatorPackManifestView = (pack) => ({
  id: pack.manifest.id,
  displayName: pack.manifest.displayName,
  version: pack.manifest.version,
  source: pack.source?.type || 'directory',
  provenance: {
    sourceUrl: pack.manifest.provenance?.sourceUrl || '',
    assetAuthor: pack.manifest.provenance?.assetAuthor || '',
    license: pack.manifest.provenance?.license || '',
    licenseUrl: pack.manifest.provenance?.licenseUrl || ''
  }
})

const assertCreatorEditableActivePack = () => {
  const pack = getActivePetPack()
  if (pack.source?.type !== 'user-installed') {
    throw new Error('Creator pack manifest workflows require an active installed pet pack')
  }
  return pack
}

const collectUnsupportedCreatorManifestErrors = (mutation = {}) => {
  const errors = []
  for (const key of Object.keys(mutation)) {
    if (!CREATOR_PACK_MANIFEST_FIELDS.has(key)) {
      errors.push(`Unsupported creator pack manifest field: ${key}`)
    }
  }
  if (mutation.provenance && typeof mutation.provenance === 'object' && !Array.isArray(mutation.provenance)) {
    for (const key of Object.keys(mutation.provenance)) {
      if (!CREATOR_PACK_MANIFEST_PROVENANCE_FIELDS.has(key)) {
        errors.push(`Unsupported creator pack manifest provenance field: ${key}`)
      }
    }
  }
  return errors
}
```

Add the service methods:

```js
const getActiveCreatorPackManifest = () => {
  const pack = assertCreatorEditableActivePack()
  return cloneCreatorPackManifestView(pack)
}

const validateActiveCreatorPackManifestMutation = (mutation = {}) => {
  const errors = []
  let pack = null
  try {
    pack = assertCreatorEditableActivePack()
  } catch (error) {
    return { ok: false, errors: [error.message], warnings: [], manifest: null }
  }

  errors.push(...collectUnsupportedCreatorManifestErrors(mutation))

  const nextDisplayName = mutation.displayName == null ? pack.manifest.displayName : String(mutation.displayName).trim()
  const nextVersion = mutation.version == null ? pack.manifest.version : String(mutation.version).trim()
  if (!nextDisplayName) errors.push('Creator pack manifest displayName is required')
  if (!nextVersion) errors.push('Creator pack manifest version is required')

  const nextProvenance = {
    ...(pack.manifest.provenance || {}),
    ...(mutation.provenance && typeof mutation.provenance === 'object' && !Array.isArray(mutation.provenance)
      ? Object.fromEntries(
          Object.entries(mutation.provenance).map(([key, value]) => [key, String(value ?? '').trim()])
        )
      : {})
  }

  const mergedManifest = {
    ...pack.manifest,
    displayName: nextDisplayName,
    version: nextVersion,
    provenance: {
      ...(pack.manifest.provenance || {}),
      sourceUrl: nextProvenance.sourceUrl || '',
      assetAuthor: nextProvenance.assetAuthor || '',
      license: nextProvenance.license || '',
      licenseUrl: nextProvenance.licenseUrl || '',
      importedAt: pack.manifest.provenance?.importedAt || '',
      originalFormat: pack.manifest.provenance?.originalFormat || ''
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings: [], manifest: cloneCreatorPackManifestView({ manifest: mergedManifest, source: pack.source }) }
  }

  normalizePetPackManifest(mergedManifest)
  return { ok: true, errors: [], warnings: [], manifest: cloneCreatorPackManifestView({ manifest: mergedManifest, source: pack.source }) }
}

const applyActiveCreatorPackManifestMutation = (mutation = {}) => {
  const validation = validateActiveCreatorPackManifestMutation(mutation)
  if (!validation.ok) {
    throw new Error(`Creator pack manifest mutation is invalid: ${validation.errors.join('; ')}`)
  }
  const current = getSettings()
  const activePackId = current.activePackId
  const targetDir = path.join(userPacksDir, activePackId)
  const manifestPath = path.join(targetDir, 'pet.json')
  const rawManifest = readJsonFile(manifestPath)
  const nextManifest = {
    ...rawManifest,
    displayName: validation.manifest.displayName,
    version: validation.manifest.version,
    sourceUrl: validation.manifest.provenance.sourceUrl,
    assetAuthor: validation.manifest.provenance.assetAuthor,
    license: validation.manifest.provenance.license,
    licenseUrl: validation.manifest.provenance.licenseUrl,
    provenance: {
      ...(rawManifest.provenance || {}),
      sourceUrl: validation.manifest.provenance.sourceUrl,
      assetAuthor: validation.manifest.provenance.assetAuthor,
      license: validation.manifest.provenance.license,
      licenseUrl: validation.manifest.provenance.licenseUrl
    }
  }
  normalizePetPackManifest(nextManifest)
  writeJsonFile(manifestPath, nextManifest)
  return cloneCreatorPackManifestView(loadInstalledPack(activePackId))
}
```

- [ ] **Step 4a: Migrate any existing draft helpers**

If this branch already has `getCreatorActiveManifest`, `validateCreatorManifestMutation`, or `applyCreatorManifestMutation`, replace those helpers with the method names and return shapes from Step 4. Do not keep both sets of helper names. The bridge and shared contracts should only expose the Phase 84 names:

```js
getActiveCreatorPackManifest
validateActiveCreatorPackManifestMutation
applyActiveCreatorPackManifestMutation
```

If the existing draft modified `updateActivePetPackManifest()` to accept `displayName`, `version`, or `provenance`, remove that broadening unless it is still needed by existing tests outside this phase. Phase 84 metadata writes should go through `applyActiveCreatorPackManifestMutation()` so action-field updates and metadata updates stay separate.

Return the new methods from `createPetPackService()`:

```js
return {
  getActivePetPack,
  listPacks,
  inspectPackDirectory,
  inspectPackSource,
  clearPendingSelection,
  importPack,
  exportPack,
  updateActivePetPackManifest,
  getActiveCreatorPackManifest,
  validateActiveCreatorPackManifestMutation,
  applyActiveCreatorPackManifestMutation,
  setActivePack,
  removePack
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test tests/services/pet-pack-service.test.js --test-name-pattern "creator manifest"
```

Expected: PASS.

## Task 3: Bridge RED/GREEN

**Files:**
- Modify: `tests/services/plugin-service.test.js`
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Add failing successful bridge tests**

Add tests after the existing creator action bridge coverage:

```js
test('declaration-only creator pack manifest bridge reads validates and applies active pack metadata', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const petPackService = {
    getActiveCreatorPackManifest: () => ({
      id: 'community-weather-cat',
      displayName: 'Community Weather Cat',
      version: '1.0.0',
      source: 'user-installed',
      provenance: {
        sourceUrl: 'https://example.com/original',
        assetAuthor: 'Original Author',
        license: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
      }
    }),
    validateActiveCreatorPackManifestMutation: (payload) => ({
      ok: true,
      errors: [],
      warnings: [],
      manifest: {
        id: 'community-weather-cat',
        displayName: payload.displayName,
        version: payload.version,
        source: 'user-installed',
        provenance: {
          sourceUrl: payload.provenance.sourceUrl,
          assetAuthor: payload.provenance.assetAuthor,
          license: payload.provenance.license,
          licenseUrl: payload.provenance.licenseUrl
        }
      }
    }),
    applyActiveCreatorPackManifestMutation: (payload) => ({
      id: 'community-weather-cat',
      displayName: payload.displayName,
      version: payload.version,
      source: 'user-installed',
      provenance: {
        sourceUrl: payload.provenance.sourceUrl,
        assetAuthor: payload.provenance.assetAuthor,
        license: payload.provenance.license,
        licenseUrl: payload.provenance.licenseUrl
      }
    })
  }
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['pack-manifest:read', 'pack-manifest:write']
  })
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    petPackService,
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

  const readResponse = await requestBridge(`${baseUrl}/creator/pack-manifest`, { token })
  const validateResponse = await requestBridge(`${baseUrl}/creator/pack-manifest/validate`, {
    method: 'POST',
    token,
    body: {
      displayName: 'Community Weather Cat Deluxe',
      version: '1.1.0',
      provenance: {
        sourceUrl: 'https://example.com/deluxe',
        assetAuthor: 'Updated Author',
        license: 'CC-BY-SA-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
      }
    }
  })
  const applyResponse = await requestBridge(`${baseUrl}/creator/pack-manifest/apply`, {
    method: 'POST',
    token,
    body: {
      displayName: 'Community Weather Cat Deluxe',
      version: '1.1.0',
      provenance: {
        sourceUrl: 'https://example.com/deluxe',
        assetAuthor: 'Updated Author',
        license: 'CC-BY-SA-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
      }
    }
  })

  child.stdout.write('{"ok":true}\\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(readResponse.status, 200)
  assert.equal(readResponse.body.manifest.id, 'community-weather-cat')
  assert.equal(validateResponse.status, 200)
  assert.equal(validateResponse.body.validation.ok, true)
  assert.equal(applyResponse.status, 200)
  assert.equal(applyResponse.body.manifest.displayName, 'Community Weather Cat Deluxe')
})
```

- [ ] **Step 2: Add failing permission and active-pack rejection tests**

```js
test('declaration-only creator pack manifest bridge rejects missing permissions', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: []
  })
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    petPackService: {
      getActiveCreatorPackManifest: () => ({ id: 'ignored', displayName: 'Ignored', version: '1.0.0', source: 'user-installed', provenance: {} })
    },
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

  const readResponse = await requestBridge(`${baseUrl}/creator/pack-manifest`, { token })
  const writeResponse = await requestBridge(`${baseUrl}/creator/pack-manifest/apply`, {
    method: 'POST',
    token,
    body: { displayName: 'Nope' }
  })

  child.stdout.write('{"ok":true}\\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(readResponse.status, 403)
  assert.equal(writeResponse.status, 403)
})

test('declaration-only creator pack manifest bridge rejects non-editable active packs', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir({
    profile: 'creator-tools',
    permissions: ['pack-manifest:read', 'pack-manifest:write']
  })
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    petPackService: {
      getActiveCreatorPackManifest: () => {
        throw new Error('Creator pack manifest workflows require an active installed pet pack')
      },
      validateActiveCreatorPackManifestMutation: () => ({
        ok: false,
        errors: ['Creator pack manifest workflows require an active installed pet pack'],
        warnings: [],
        manifest: null
      }),
      applyActiveCreatorPackManifestMutation: () => {
        throw new Error('Creator pack manifest workflows require an active installed pet pack')
      }
    },
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

  const readResponse = await requestBridge(`${baseUrl}/creator/pack-manifest`, { token })
  const validateResponse = await requestBridge(`${baseUrl}/creator/pack-manifest/validate`, {
    method: 'POST',
    token,
    body: { displayName: 'Still Nope' }
  })

  child.stdout.write('{"ok":true}\\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(readResponse.status, 400)
  assert.match(readResponse.body.error, /active installed pet pack/i)
  assert.equal(validateResponse.status, 200)
  assert.equal(validateResponse.body.validation.ok, false)
})
```

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "creator pack manifest bridge"
```

Expected: FAIL because the bridge routes do not exist yet.

- [ ] **Step 4: Implement bridge handlers and route dispatch**

Update the `createPluginService()` signature to accept `petPackService`:

```js
const createPluginService = ({
  settingsService,
  petService,
  actionService,
  actionImportService,
  petPackService,
  aiService,
  fetchImpl = globalThis.fetch
}) => {
```

Add bridge handlers inside `createPluginBridgeHandlers()`:

```js
creatorPackManifestRead: async () => {
  assertPermission(plugin.manifest, 'pack-manifest:read')
  if (!petPackService?.getActiveCreatorPackManifest) {
    throw new Error('Creator pack manifest read is not available')
  }
  appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pack-manifest read invoked' })
  return { ok: true, manifest: petPackService.getActiveCreatorPackManifest() }
},
creatorPackManifestValidate: async (payload = {}) => {
  assertPermission(plugin.manifest, 'pack-manifest:write')
  if (!petPackService?.validateActiveCreatorPackManifestMutation) {
    throw new Error('Creator pack manifest validation is not available')
  }
  appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pack-manifest validate invoked' })
  return { ok: true, validation: petPackService.validateActiveCreatorPackManifestMutation(payload) }
},
creatorPackManifestApply: async (payload = {}) => {
  assertPermission(plugin.manifest, 'pack-manifest:write')
  if (!petPackService?.applyActiveCreatorPackManifestMutation) {
    throw new Error('Creator pack manifest apply is not available')
  }
  appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pack-manifest apply invoked' })
  return { ok: true, manifest: petPackService.applyActiveCreatorPackManifestMutation(payload) }
},
```

Extend route dispatch:

```js
if (request.method === 'GET' && pathname === '/creator/pack-manifest') {
  const result = await handlers.creatorPackManifestRead()
  sendJson(response, 200, result)
  return
}

if (request.method === 'POST' && pathname === '/creator/pack-manifest/validate') {
  if (!isJsonRequest(request)) throw new Error('Creator pack manifest validation requires application/json')
  const body = await readJsonBody(request)
  const result = await handlers.creatorPackManifestValidate(body)
  sendJson(response, 200, result)
  return
}

if (request.method === 'POST' && pathname === '/creator/pack-manifest/apply') {
  if (!isJsonRequest(request)) throw new Error('Creator pack manifest apply requires application/json')
  const body = await readJsonBody(request)
  const result = await handlers.creatorPackManifestApply(body)
  sendJson(response, 200, result)
  return
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "creator pack manifest bridge"
```

Expected: PASS.

## Task 4: Shared Contracts RED/GREEN

**Files:**
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
- Modify: `src/shared/openpet-contracts.ts`

- [ ] **Step 1: Add failing shared-contract fixtures**

Add new interfaces near the existing creator bridge types:

```ts
export interface CreatorPackManifestView {
  id: string
  displayName: string
  version: string
  source: string
  provenance: Pick<PetPackProvenance, 'sourceUrl' | 'assetAuthor' | 'license' | 'licenseUrl'>
}

export interface CreatorPackManifestMutationRequest {
  displayName?: string
  version?: string
  provenance?: Partial<Pick<PetPackProvenance, 'sourceUrl' | 'assetAuthor' | 'license' | 'licenseUrl'>>
}

export interface CreatorPackManifestReadResponse {
  ok: boolean
  manifest: CreatorPackManifestView
}

export interface CreatorPackManifestMutationResult {
  ok: boolean
  validation?: {
    ok: boolean
    errors: string[]
    warnings: string[]
    manifest: CreatorPackManifestView | null
  }
  manifest?: CreatorPackManifestView
}
```

Add fixtures in `tests/shared/openpet-contracts-type-fixture.ts`:

```ts
const creatorPackManifestReadFixture = {
  ok: true,
  manifest: {
    id: 'community-weather-cat',
    displayName: 'Community Weather Cat',
    version: '1.0.0',
    source: 'user-installed',
    provenance: {
      sourceUrl: 'https://example.com/original',
      assetAuthor: 'Original Author',
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
    }
  }
} satisfies CreatorPackManifestReadResponse

const creatorPackManifestMutationFixture = {
  ok: true,
  validation: {
    ok: true,
    errors: [],
    warnings: [],
    manifest: {
      id: 'community-weather-cat',
      displayName: 'Community Weather Cat Deluxe',
      version: '1.1.0',
      source: 'user-installed',
      provenance: {
        sourceUrl: 'https://example.com/deluxe',
        assetAuthor: 'Updated Author',
        license: 'CC-BY-SA-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
      }
    }
  },
  manifest: {
    id: 'community-weather-cat',
    displayName: 'Community Weather Cat Deluxe',
    version: '1.1.0',
    source: 'user-installed',
    provenance: {
      sourceUrl: 'https://example.com/deluxe',
      assetAuthor: 'Updated Author',
      license: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
    }
  }
} satisfies CreatorPackManifestMutationResult
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run typecheck
```

Expected: FAIL because the new interfaces are not defined yet.

- [ ] **Step 3: Implement the shared contracts**

Add the interfaces from Step 1 to `src/shared/openpet-contracts.ts` next to the existing creator bridge types, and import/use them in the fixture file.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm run typecheck
```

Expected: PASS.

## Task 5: Documentation And Review Slice

**Files:**
- Create: `docs/phases/phase-84-plugin-creator-tools-pack-manifest.md`
- Create: `docs/reviews/phase-84-plugin-creator-tools-pack-manifest-review.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/project-context.json`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write the phase record**

Create `docs/phases/phase-84-plugin-creator-tools-pack-manifest.md` with these points:

```md
# Phase 84: Plugin Creator-Tools Pack Manifest Workflow

> Date: 2026-06-18
> Scope: add a host-mediated creator-tools bridge workflow for reading, validating, and applying bounded active-pack manifest metadata.

## Goal

Phase 84 completes the first pack-authoring metadata slice for creator-tools extensions. Declaration-only command runs can now inspect and update the active installed user pack's top-level manifest metadata through the host bridge without receiving arbitrary pack writes or raw filesystem access.

## Scope

In scope:

- `pack-manifest:read`
- `pack-manifest:write`
- `GET /creator/pack-manifest`
- `POST /creator/pack-manifest/validate`
- `POST /creator/pack-manifest/apply`
- active installed user pack only
- editable fields: `displayName`, `version`, `provenance.sourceUrl`, `provenance.assetAuthor`, `provenance.license`, `provenance.licenseUrl`

Out of scope:

- arbitrary pack targeting
- built-in pack edits
- action/default/click edits through this route
- pet-pack file writes outside the active installed pack manifest
- raw filesystem access
```

- [ ] **Step 2: Update live docs**

Make these exact live-doc edits:

```md
- In `docs/plugin-development.md`, add the new bridge routes under “Current bridge routes”:
  - `GET /creator/pack-manifest`
  - `POST /creator/pack-manifest/validate`
  - `POST /creator/pack-manifest/apply`

- In `docs/plugin-development.md`, add permission wording that `pack-manifest:read` / `pack-manifest:write` only affect the active installed user pack metadata and do not permit arbitrary pack writes.

- In `docs/plugin-ecosystem-rules.md`, extend the creator-tools paragraph so it reads “bounded action reads/writes, package-local frame inspection, host-mediated package-local frame import/sprite generation, and active-pack manifest metadata workflows” while still rejecting arbitrary folder reads, raw writes, plugin-selected output paths, and pet-pack writes.

- In `docs/development-summary.md`, replace the “Extend creator-tools beyond Phase 83…” line with “Phase 84 adds active-pack manifest metadata workflows; future creator expansion should continue through host-mediated APIs such as user-approved picker imports rather than raw plugin file writes.”

- In `docs/HANDOFF.md`, add a new next-step fact after Phase 83 describing Phase 84 as the current pack-authoring metadata boundary.
```

- [ ] **Step 3: Record the production review**

Create `docs/reviews/phase-84-plugin-creator-tools-pack-manifest-review.md` with this starter content:

```md
# Phase 84 Production Code Quality Review

> Reviewer: Codex
> Date: 2026-06-18
> Scope: creator-tools pack-manifest bridge, pet-pack manifest mutation guards, shared contracts, docs.

## Result

Pending implementation review.

## Review Focus

- built-in pack rejection
- unsupported-key rejection
- host-owned field preservation
- bridge permission enforcement
- doc honesty about non-goals
```

## Task 6: Verification And Atomic Commit

**Files:**
- Stage only the Phase 84 implementation/doc files listed in this plan.

- [ ] **Step 1: Run targeted verification**

Run:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "pack manifest"
node --test tests/services/pet-pack-service.test.js --test-name-pattern "creator manifest"
node --test tests/services/plugin-service.test.js --test-name-pattern "creator pack manifest bridge"
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected: all commands PASS.

- [ ] **Step 3: Stage the Phase 84 slice atomically**

Run:

```bash
git add src/main/plugins/manifest.js tests/plugins/manifest.test.js src/main/services/pet-pack-service.js tests/services/pet-pack-service.test.js src/main/services/plugin-service.js tests/services/plugin-service.test.js src/shared/openpet-contracts.ts tests/shared/openpet-contracts-type-fixture.ts docs/phases/phase-84-plugin-creator-tools-pack-manifest.md docs/reviews/phase-84-plugin-creator-tools-pack-manifest-review.md docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/productization-v1.1-todo-design.md docs/development-summary.md docs/project-status-review.md docs/HANDOFF.md docs/project-context.json README.md README.zh-CN.md docs/superpowers/specs/2026-06-18-plugin-creator-tools-pack-manifest-phase84-design.md docs/superpowers/plans/2026-06-18-plugin-creator-tools-pack-manifest-phase84.md
git commit -m "feat(阶段84): add creator pack manifest workflow"
```

- [ ] **Step 4: Confirm the committed diff is Phase 84 only**

Run:

```bash
git show --stat --oneline HEAD
```

Expected:

- the commit message is `feat(阶段84): add creator pack manifest workflow`;
- changed runtime files are limited to manifest permissions, pet-pack service, plugin bridge, shared contracts, tests, and related docs;
- no unrelated release-evidence or later-phase files are mixed into the commit.

## Self-Review Checklist

- Spec coverage: this plan maps each Phase 84 design requirement to a task.
- Placeholder scan: no `TODO`, `TBD`, or “handle appropriately” placeholders remain.
- Type consistency: `pack-manifest:read` / `pack-manifest:write`, `getActiveCreatorPackManifest`, `validateActiveCreatorPackManifestMutation`, and `applyActiveCreatorPackManifestMutation` are named consistently across tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-plugin-creator-tools-pack-manifest-phase84.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints
