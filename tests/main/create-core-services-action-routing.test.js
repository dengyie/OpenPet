const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const Module = require('module')
const os = require('os')
const path = require('path')

const coreServicesPath = require.resolve('../../src/main/bootstrap/create-core-services')

const loadCreateCoreServices = () => {
  delete require.cache[coreServicesPath]
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return { safeStorage: {} }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(coreServicesPath).createCoreServices
  } finally {
    Module._load = originalLoad
  }
}

const createFactories = ({ activePack, importServiceOptions }) => ({
  createEventBus: () => ({ on: () => {}, emit: () => {} }),
  createSettingsService: () => ({ get: () => ({}), save: (settings) => settings }),
  createPetPackService: () => ({ getActivePetPack: () => activePack }),
  createActionService: () => ({ getConfig: () => ({ actions: [] }) }),
  createPetService: () => ({}),
  createSecretService: () => ({}),
  createAiService: () => ({}),
  createAiTalkStore: () => ({}),
  createAiTalkService: () => ({}),
  createPetUtteranceLogService: () => ({}),
  createImageGenerationModelService: () => ({}),
  createTriggerRuleRuntimeService: () => ({}),
  createCreatorReferenceService: () => ({}),
  createBehaviorOrchestratorService: () => ({}),
  createLocalHttpService: () => ({}),
  createCursorAssetService: () => ({}),
  createAppLogService: () => ({ record: () => {}, logPath: '/tmp/openpet-test.log' }),
  createAboutService: () => ({}),
  createPetMovementPolicy: () => ({}),
  createActionImportService: (options) => {
    importServiceOptions.push(options)
    return {
      inspectActionFrames: (payload) => ({ payload, options }),
      importActionFrames: (payload) => ({ payload, options }),
      regenerate: (payload) => ({ payload, options }),
      updateActionConfig: (payload) => ({ payload, options }),
      deleteAction: (actionId) => ({ actionId, options })
    }
  }
})

const createCore = ({ activePack, projectRoot, userDataDir, importServiceOptions }) => {
  const createCoreServices = loadCreateCoreServices()
  return createCoreServices({
    app: { getPath: () => userDataDir },
    projectRoot,
    packageJson: { version: '1.0.0' },
    settingsRuntime: {
      loadSettings: () => ({}),
      saveSettings: (settings) => settings,
      syncLoginItemSettings: () => {}
    },
    factories: createFactories({ activePack, importServiceOptions }),
    screen: {}
  })
}

test('core action import routing targets the active installed pet pack manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-core-action-routing-'))
  const projectRoot = path.join(root, 'project')
  const userDataDir = path.join(root, 'user-data')
  const activeRoot = path.join(userDataDir, 'pet-packs', 'installed-cat')
  const importServiceOptions = []
  const core = createCore({
    projectRoot,
    userDataDir,
    importServiceOptions,
    activePack: {
      rootPath: activeRoot,
      source: { type: 'user-installed', path: activeRoot },
      manifest: { id: 'installed-cat', actions: [] }
    }
  })

  const result = core.services.actionImportService.importActionFrames({ actionId: 'jump' })

  assert.equal(result.options.framesRoot, path.join(activeRoot, 'frames'))
  assert.equal(result.options.spritesDir, path.join(activeRoot, 'sprites'))
  assert.equal(result.options.configPath, path.join(activeRoot, 'pet.json'))
  assert.equal(result.options.configType, 'pet-pack')
  assert.equal(result.options.spriteRelativeDir, 'sprites')
  assert.equal(importServiceOptions.length, 1)
})

test('core action import routing keeps legacy cat edits on legacy cat_anime paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-core-action-routing-legacy-'))
  const projectRoot = path.join(root, 'project')
  const importServiceOptions = []
  const core = createCore({
    projectRoot,
    userDataDir: path.join(root, 'user-data'),
    importServiceOptions,
    activePack: {
      rootPath: projectRoot,
      source: { type: 'built-in', path: projectRoot },
      manifest: { id: 'legacy-cat', actions: [] }
    }
  })

  const result = core.services.actionImportService.importActionFrames({ actionId: 'jump' })

  assert.equal(result.options.framesRoot, path.join(projectRoot, 'cat_anime', 'flames'))
  assert.equal(result.options.spritesDir, path.join(projectRoot, 'cat_anime', 'sprites'))
  assert.equal(result.options.configPath, path.join(projectRoot, 'cat_anime', 'animations.json'))
})

test('core action import routing rejects read-only bundled pet packs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-core-action-routing-readonly-'))
  const projectRoot = path.join(root, 'project')
  const activeRoot = path.join(projectRoot, 'assets', 'pet-packs', 'starter')
  const core = createCore({
    projectRoot,
    userDataDir: path.join(root, 'user-data'),
    importServiceOptions: [],
    activePack: {
      rootPath: activeRoot,
      source: { type: 'built-in', path: activeRoot },
      manifest: { id: 'starter', actions: [] }
    }
  })

  assert.throws(
    () => core.services.actionImportService.importActionFrames({ actionId: 'jump' }),
    /only available/
  )
})
