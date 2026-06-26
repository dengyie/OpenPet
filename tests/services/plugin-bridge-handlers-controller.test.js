const test = require('node:test')
const assert = require('node:assert/strict')

const {
  PLUGIN_BRIDGE_ROUTE_INVENTORY,
  PLUGIN_BRIDGE_ROUTE_PERMISSION_NAMES,
  createPluginBridgeHandlersController
} = require('../../src/main/services/plugin-bridge-handlers-controller')

const createController = (overrides = {}) => {
  const logs = []
  const controller = createPluginBridgeHandlersController({
    appendLog: (entry) => logs.push(entry),
    assertPermission: (_manifest, permission) => {
      if (permission === 'actions:write' && overrides.blockActionsWrite) {
        throw new Error('Plugin weather-declaration does not have actions:write permission')
      }
    },
    getBridgeContext: () => ({
      petName: 'OpenPet',
      selectedPetId: 'legacy-cat',
      currentActionId: 'idle',
      personality: { tone: 'friendly', tags: ['companion'] }
    }),
    getActionsSnapshot: () => ({ defaultAction: 'idle', clickAction: 'wave', actions: [] }),
    validateActionMutation: (payload) => ({ ok: true, payload }),
    applyActionMutation: (payload) => ({ defaultAction: payload.defaultAction || 'idle' }),
    submitTriggerProposal: (payload) => ({ proposalId: 'proposal-1', proposal: payload }),
    readPackManifest: () => ({ id: 'creator-pack' }),
    validatePackManifestMutation: (payload) => ({ ok: true, payload }),
    applyPackManifestMutation: (payload) => ({ id: payload.id || 'creator-pack' }),
    inspectFrames: async ({ sourceDir, actionId }) => ({ inspection: { valid: true }, sourceDir, actionId }),
    importFrames: async ({ sourceDir, actionId, label }) => ({
      importedAction: { id: actionId, label: label || actionId },
      defaultAction: actionId,
      actions: [{ id: actionId }]
    }),
    inspectPackOutput: (sourcePath) => ({ sourcePath, valid: true }),
    importPackOutput: (selectionId) => ({ pack: { id: selectionId || 'pack-1' } }),
    setActivePack: (packId) => ({ packId, activated: true }),
    onPetPackActivated: (payload) => {
      logs.push({ pluginId: payload.pluginId, commandId: payload.commandId, level: 'info', message: `activated:${payload.packId}` })
    },
    readModelSettings: () => ({ provider: 'openai-compatible' }),
    checkModelHealth: async () => ({ ok: true }),
    generateModelImage: async (payload) => ({ ok: true, payload }),
    petService: {
      say: async (payload) => payload,
      playAction: async (payload) => payload,
      setEvent: async (payload) => payload
    },
    resolveAssetPath: (_manifest, relativePath) => `/plugin/${relativePath}`,
    resolveDataPath: (_manifest, relativePath) => `/data/${relativePath}`,
    selectAssetSourceDir: async () => ({ canceled: false, sourceDir: '/picked/folder' }),
    assertDirectoryHasNoSymlinks: () => {},
    assertCreatorAssetImportWithinLimits: () => {},
    ensureCreatorDirs: () => ({ dataDir: '/plugin-data' }),
    ...overrides
  })

  return { controller, logs }
}

const plugin = {
  manifest: {
    id: 'weather-declaration',
    permissions: ['actions:read', 'actions:write', 'pack-manifest:read', 'pack-manifest:write', 'assets:inspect', 'assets:generate', 'pet-pack:import', 'model:image-generate', 'pet:say', 'pet:action', 'pet:event']
  }
}

test('bridge handlers controller exposes context and action read/validate routes with logging', async () => {
  const { controller, logs } = createController()
  const handlers = controller.createHandlers(plugin, 'start')

  const context = await handlers.context()
  const actions = await handlers.creatorActionsRead()
  const validation = await handlers.creatorActionsValidate({ defaultAction: 'wave' })

  assert.equal(context.ok, true)
  assert.equal(context.context.petName, 'OpenPet')
  assert.deepEqual(actions.actions, { defaultAction: 'idle', clickAction: 'wave', actions: [] })
  assert.deepEqual(validation.validation, { ok: true, payload: { defaultAction: 'wave' } })
  assert.deepEqual(logs.map((entry) => entry.message), [
    'Bridge context requested',
    'Bridge creator.actions read invoked',
    'Bridge creator.actions validate invoked'
  ])
})

test('bridge handlers controller enforces bridge permissions', async () => {
  const { controller } = createController({ blockActionsWrite: true })
  const handlers = controller.createHandlers(plugin, 'start')

  await assert.rejects(
    () => handlers.creatorActionsApply({ defaultAction: 'wave' }),
    /does not have actions:write permission/
  )
})

test('bridge handlers controller imports pet packs and emits activation callback when requested', async () => {
  const { controller, logs } = createController()
  const handlers = controller.createHandlers(plugin, 'start')

  const result = await handlers.creatorPetPackImportOutput({
    selectionId: 'pack-42',
    activate: true
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.imported, { pack: { id: 'pack-42' } })
  assert.deepEqual(result.activated, { packId: 'pack-42', activated: true })
  assert.equal(logs[0].message, 'Bridge creator.pet-pack import-output invoked')
  assert.equal(logs[1].message, 'activated:pack-42')
})

test('bridge handlers controller routes model generation through host-owned data dir', async () => {
  const { controller } = createController()
  const handlers = controller.createHandlers(plugin, 'start')

  const result = await handlers.creatorModelImageGenerate({
    prompt: 'draw a cat',
    output: { format: 'png' }
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.result, {
    ok: true,
    payload: {
      prompt: 'draw a cat',
      output: {
        format: 'png',
        dataDir: '/plugin-data'
      }
    }
  })
})

test('bridge handlers controller exports a unique route inventory that matches handler keys', () => {
  const { controller } = createController()
  const handlers = controller.createHandlers(plugin, 'start')

  assert.equal(Array.isArray(PLUGIN_BRIDGE_ROUTE_INVENTORY), true)
  assert.equal(PLUGIN_BRIDGE_ROUTE_INVENTORY.length, 20)

  const uniqueRouteKeys = new Set(PLUGIN_BRIDGE_ROUTE_INVENTORY.map((entry) => `${entry.method} ${entry.path}`))
  assert.equal(uniqueRouteKeys.size, PLUGIN_BRIDGE_ROUTE_INVENTORY.length)

  PLUGIN_BRIDGE_ROUTE_INVENTORY.forEach((entry) => {
    assert.match(entry.method, /^(GET|POST)$/)
    assert.match(entry.path, /^\//)
    assert.equal(typeof entry.handlerName, 'string')
    assert.equal(typeof entry.description, 'string')
    assert.equal(typeof handlers[entry.handlerName], 'function')
    if (entry.path === '/context') {
      assert.equal(entry.permission, '')
    } else {
      assert.match(entry.permission, /^[a-z:-]+$/)
    }
  })
})

test('bridge handlers controller exports the exact bridge permission inventory', () => {
  assert.deepEqual(PLUGIN_BRIDGE_ROUTE_PERMISSION_NAMES, [
    'actions:read',
    'actions:write',
    'pack-manifest:read',
    'pack-manifest:write',
    'assets:inspect',
    'assets:generate',
    'pet-pack:import',
    'model:image-generate',
    'pet:say',
    'pet:action',
    'pet:event'
  ])

  const derivedPermissions = [...new Set(PLUGIN_BRIDGE_ROUTE_INVENTORY
    .map((entry) => entry.permission)
    .filter(Boolean))]

  assert.deepEqual(PLUGIN_BRIDGE_ROUTE_PERMISSION_NAMES, derivedPermissions)
})
