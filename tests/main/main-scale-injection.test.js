const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
const path = require('path')

const mainPath = require.resolve('../../main')

test('main forwards IPC-provided scale values to the window scaler', async () => {
  delete require.cache[mainPath]

  const scaleCalls = []
  const animationReloadCalls = []
  const appHandlers = new Map()
  const appLogs = []
  let stopAllServicesCalls = 0
  let registeredIpcDependencies = null
  let registeredPluginDependencies = null
  let createdAiTalkStorePath = null
  let createdAiTalkDependencies = null
  let bundledPluginSyncDependencies = null
  const petWindow = {
    webContents: { on: () => {}, send: () => {} },
    isMinimized: () => false,
    restore: () => {},
    focus: () => {}
  }

  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => path.join(__dirname, '..', '.tmp-main-scale-injection'),
          isPackaged: false,
          on: (eventName, handler) => { appHandlers.set(eventName, handler) },
          quit: () => {},
          requestSingleInstanceLock: () => true,
          setLoginItemSettings: () => {},
          whenReady: () => ({ then: (callback) => { callback(); return { catch: () => {} } } })
        },
        BrowserWindow: {
          getAllWindows: () => [petWindow]
        },
        dialog: {},
        screen: { on: () => {} },
        shell: { openExternal: () => {} }
      }
    }

    if (request === './src/main/window') {
      return {
        applyWindowScale: (targetWindow, scale) => scaleCalls.push({ targetWindow, scale }),
        createSettingsWindow: () => {},
        createWindow: () => petWindow,
        loadPetWindow: () => {}
      }
    }

    if (request === './src/main/ipc') {
      return {
        createPetRendererSettings: (settings) => settings,
        normalizeLocalHttpConfig: (_currentConfig, nextConfig) => nextConfig,
        reloadAndSendAnimations: (getPetWindow, petService) => {
          animationReloadCalls.push({ petWindow: getPetWindow(), petService })
          return { actions: [] }
        },
        registerIpcHandlers: (dependencies) => { registeredIpcDependencies = dependencies }
      }
    }

    if (request === './src/main/settings') {
      return {
        loadSettings: () => ({
          scale: 1,
          autoStart: false,
          localHttp: {},
          ai: { behavior: {} },
          plugins: { enabled: {}, config: {}, storage: {}, logs: [] },
          petPacks: { activePackId: 'legacy-cat', installed: {} },
          ecosystem: { blocklist: { pluginIds: [], packIds: [], sha256: [] } }
        }),
        saveSettings: () => {},
        syncLoginItemSettings: () => {}
      }
    }

    if (request === './src/main/screen') {
      return {
        clampToWorkArea: (_win, x, y) => ({ x, y }),
        getMovementState: () => null
      }
    }

    if (request === './src/main/services/event-bus') {
      return { createEventBus: () => ({ on: () => {}, emit: () => {} }) }
    }

    if (request === './src/main/services/settings-service') {
      return {
        createSettingsService: ({ loadSettings }) => {
          let settings = loadSettings()
          return {
            get: () => settings,
            preview: (partial) => ({ ...settings, ...partial }),
            save: (nextSettings) => { settings = nextSettings; return settings }
          }
        }
      }
    }

    if (request === './src/main/services/action-service') {
      return {
        createActionService: () => ({
          getConfig: () => ({ actions: [] }),
          getPreviewConfig: () => ({ actions: [] }),
          reloadConfig: () => ({ actions: [] })
        })
      }
    }

    if (request === './src/main/services/pet-service') {
      return {
        createPetService: ({ settingsService }) => ({
          getSettings: () => settingsService.get(),
          saveSettings: (settings) => settingsService.save(settings),
          previewSettings: (partial) => settingsService.preview(partial),
          getAnimations: () => ({ actions: [] }),
          getPreviewAnimations: () => ({ actions: [] }),
          reloadAnimations: () => ({ actions: [] }),
          onSay: () => {},
          onAction: () => {},
          onEvent: () => {},
          say: (payload) => payload,
          playAction: (payload) => payload,
          setEvent: (payload) => payload
        })
      }
    }

    const serviceFactories = {
      './src/main/services/pet-pack-service': { createPetPackService: () => ({ listPacks: () => [], getActivePetPack: () => ({ manifest: { id: 'legacy-cat', persona: null, actions: [] } }) }) },
      './src/main/services/secret-service': { createSecretService: () => ({}) },
      './src/main/services/ai-service': { createAiService: () => ({ id: 'ai-service' }) },
      './src/main/services/ai-talk-store': {
        createAiTalkStore: ({ storePath }) => {
          createdAiTalkStorePath = storePath
          return { id: 'ai-talk-store' }
        }
      },
      './src/main/services/ai-talk-service': {
        createAiTalkService: (dependencies) => {
          createdAiTalkDependencies = dependencies
          return { id: 'ai-talk-service' }
        }
      },
      './src/main/services/behavior-orchestrator-service': { createBehaviorOrchestratorService: () => ({ getConfig: () => ({ enabled: false }) }) },
      './src/main/services/plugin-service': {
        createPluginService: (dependencies) => {
          registeredPluginDependencies = dependencies
          return { stopAllServices: () => { stopAllServicesCalls += 1 } }
        }
      },
      './src/main/services/plugin-install-service': { createPluginInstallService: () => ({}) },
      './src/main/services/bundled-plugin-sync-service': {
        syncBundledPlugins: (dependencies) => {
          bundledPluginSyncDependencies = dependencies
          return { synced: [{ pluginId: 'openpet.creator-studio', removed: ['stale-copy'] }] }
        }
      },
      './src/main/services/plugin-github-import-service': { createPluginGithubImportService: () => ({}) },
      './src/main/services/local-http-service': { createLocalHttpService: () => ({ start: async () => ({}) }) },
      './src/main/services/action-import-service': { createActionImportService: () => ({}) },
      './src/main/services/cursor-asset-service': { createCursorAssetService: () => ({ repairCursor: async (cursor) => cursor || {} }) },
      './src/main/services/app-log-service': { createAppLogService: () => ({ record: (entry) => appLogs.push(entry), logPath: '/tmp/openpet-app.jsonl' }) },
      './src/main/services/about-service': { createAboutService: () => ({}) },
      './src/main/services/catalog-service': { createCatalogService: () => ({ getPetPackBlockStatus: () => ({ blocked: false, reasons: [] }), getPluginBlockStatus: () => ({ blocked: false, reasons: [] }) }) },
      './src/main/plugins/official/basic-behavior': { createBasicBehaviorPlugin: () => ({}) },
      './src/main/packaged-runtime-smoke-runner': { maybeRunPackagedRuntimeSmoke: () => {} },
      './src/main/packaged-plugin-cleanup-evidence-runner': { maybeRunPackagedPluginCleanupEvidence: () => {} },
      './src/main/user-data-path': { configureUserDataPath: () => {} }
    }
    if (serviceFactories[request]) return serviceFactories[request]

    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    require(mainPath)
    await Promise.resolve()
    await Promise.resolve()
    assert.ok(registeredIpcDependencies)

    const ipcWindow = { id: 'ipc-window' }
    registeredIpcDependencies.applyWindowScale(ipcWindow, 0.5)
    registeredPluginDependencies.onPetPackActivated()
    appHandlers.get('before-quit')()
    appHandlers.get('will-quit')()

    assert.deepEqual(scaleCalls, [{ targetWindow: ipcWindow, scale: 0.5 }])
    assert.equal(animationReloadCalls.length, 1)
    assert.equal(animationReloadCalls[0].petWindow, petWindow)
    assert.equal(createdAiTalkStorePath, path.join(__dirname, '..', '.tmp-main-scale-injection', 'ai-talk-store.json'))
    assert.equal(createdAiTalkDependencies.aiService.id, 'ai-service')
    assert.equal(createdAiTalkDependencies.aiTalkStore.id, 'ai-talk-store')
    assert.equal(registeredIpcDependencies.aiTalkService.id, 'ai-talk-service')
    assert.equal(bundledPluginSyncDependencies.pluginDir, path.join(__dirname, '..', '.tmp-main-scale-injection', 'plugins'))
    assert.deepEqual(bundledPluginSyncDependencies.bundledPluginDirs, [path.resolve(__dirname, '../../examples/plugins/creator-studio')])
    assert.deepEqual(appLogs.map((entry) => entry.event), [
      'app.ready',
      'plugins.bundled.synced',
      'app.before-quit',
      'app.will-quit'
    ])
    assert.equal(stopAllServicesCalls, 1)
  } finally {
    Module._load = originalLoad
    delete require.cache[mainPath]
  }
})

test('main still stops plugin services when lifecycle logging fails during quit', async () => {
  delete require.cache[mainPath]

  const appHandlers = new Map()
  let stopAllServicesCalls = 0
  const petWindow = {
    webContents: { on: () => {}, send: () => {} },
    isMinimized: () => false,
    restore: () => {},
    focus: () => {}
  }

  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => path.join(__dirname, '..', '.tmp-main-scale-injection'),
          isPackaged: false,
          on: (eventName, handler) => { appHandlers.set(eventName, handler) },
          quit: () => {},
          requestSingleInstanceLock: () => true,
          setLoginItemSettings: () => {},
          whenReady: () => ({ then: (callback) => { callback(); return { catch: () => {} } } })
        },
        BrowserWindow: {
          getAllWindows: () => [petWindow]
        },
        dialog: {},
        screen: { on: () => {} },
        shell: { openExternal: () => {} }
      }
    }

    if (request === './src/main/window') {
      return {
        applyWindowScale: () => {},
        createSettingsWindow: () => {},
        createWindow: () => petWindow,
        loadPetWindow: () => {}
      }
    }

    if (request === './src/main/ipc') {
      return {
        createPetRendererSettings: (settings) => settings,
        normalizeLocalHttpConfig: (_currentConfig, nextConfig) => nextConfig,
        reloadAndSendAnimations: () => ({ actions: [] }),
        registerIpcHandlers: () => {}
      }
    }

    if (request === './src/main/settings') {
      return {
        loadSettings: () => ({
          scale: 1,
          autoStart: false,
          localHttp: {},
          ai: { behavior: {} },
          plugins: { enabled: {}, config: {}, storage: {}, logs: [] },
          petPacks: { activePackId: 'legacy-cat', installed: {} },
          ecosystem: { blocklist: { pluginIds: [], packIds: [], sha256: [] } }
        }),
        saveSettings: () => {},
        syncLoginItemSettings: () => {}
      }
    }

    if (request === './src/main/screen') {
      return {
        clampToWorkArea: (_win, x, y) => ({ x, y }),
        getMovementState: () => null
      }
    }

    if (request === './src/main/services/event-bus') {
      return { createEventBus: () => ({ on: () => {}, emit: () => {} }) }
    }

    if (request === './src/main/services/settings-service') {
      return {
        createSettingsService: ({ loadSettings }) => {
          let settings = loadSettings()
          return {
            get: () => settings,
            preview: (partial) => ({ ...settings, ...partial }),
            save: (nextSettings) => { settings = nextSettings; return settings }
          }
        }
      }
    }

    if (request === './src/main/services/action-service') {
      return {
        createActionService: () => ({
          getConfig: () => ({ actions: [] }),
          getPreviewConfig: () => ({ actions: [] }),
          reloadConfig: () => ({ actions: [] })
        })
      }
    }

    if (request === './src/main/services/pet-service') {
      return {
        createPetService: ({ settingsService }) => ({
          getSettings: () => settingsService.get(),
          saveSettings: (settings) => settingsService.save(settings),
          previewSettings: (partial) => settingsService.preview(partial),
          getAnimations: () => ({ actions: [] }),
          getPreviewAnimations: () => ({ actions: [] }),
          reloadAnimations: () => ({ actions: [] }),
          onSay: () => {},
          onAction: () => {},
          onEvent: () => {},
          say: (payload) => payload,
          playAction: (payload) => payload,
          setEvent: (payload) => payload
        })
      }
    }

    const serviceFactories = {
      './src/main/services/pet-pack-service': { createPetPackService: () => ({ listPacks: () => [], getActivePetPack: () => ({ manifest: { id: 'legacy-cat', persona: null, actions: [] } }) }) },
      './src/main/services/secret-service': { createSecretService: () => ({}) },
      './src/main/services/ai-service': { createAiService: () => ({}) },
      './src/main/services/ai-talk-store': { createAiTalkStore: () => ({}) },
      './src/main/services/ai-talk-service': { createAiTalkService: () => ({}) },
      './src/main/services/behavior-orchestrator-service': { createBehaviorOrchestratorService: () => ({ getConfig: () => ({ enabled: false }) }) },
      './src/main/services/plugin-service': { createPluginService: () => ({ stopAllServices: () => { stopAllServicesCalls += 1 } }) },
      './src/main/services/plugin-install-service': { createPluginInstallService: () => ({}) },
      './src/main/services/bundled-plugin-sync-service': {
        syncBundledPlugins: () => ({ synced: [{ pluginId: 'openpet.creator-studio', removed: [] }] })
      },
      './src/main/services/plugin-github-import-service': { createPluginGithubImportService: () => ({}) },
      './src/main/services/local-http-service': { createLocalHttpService: () => ({ start: async () => ({}) }) },
      './src/main/services/action-import-service': { createActionImportService: () => ({}) },
      './src/main/services/cursor-asset-service': { createCursorAssetService: () => ({ repairCursor: async (cursor) => cursor || {} }) },
      './src/main/services/app-log-service': { createAppLogService: () => ({ record: () => { throw new Error('disk full') }, logPath: '/tmp/openpet-app.jsonl' }) },
      './src/main/services/about-service': { createAboutService: () => ({}) },
      './src/main/services/catalog-service': { createCatalogService: () => ({ getPetPackBlockStatus: () => ({ blocked: false, reasons: [] }), getPluginBlockStatus: () => ({ blocked: false, reasons: [] }) }) },
      './src/main/plugins/official/basic-behavior': { createBasicBehaviorPlugin: () => ({}) },
      './src/main/packaged-runtime-smoke-runner': { maybeRunPackagedRuntimeSmoke: () => {} },
      './src/main/packaged-plugin-cleanup-evidence-runner': { maybeRunPackagedPluginCleanupEvidence: () => {} },
      './src/main/user-data-path': { configureUserDataPath: () => {} }
    }
    if (serviceFactories[request]) return serviceFactories[request]

    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    require(mainPath)
    await Promise.resolve()
    await Promise.resolve()

    appHandlers.get('before-quit')()

    assert.equal(stopAllServicesCalls, 1)
  } finally {
    Module._load = originalLoad
    delete require.cache[mainPath]
  }
})
