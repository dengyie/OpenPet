const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
const path = require('path')

const mainPath = require.resolve('../../main')

test('main forwards IPC-provided scale values to the window scaler', () => {
  delete require.cache[mainPath]

  const scaleCalls = []
  const animationReloadCalls = []
  let registeredIpcDependencies = null
  let registeredPluginDependencies = null
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
          on: () => {},
          quit: () => {},
          requestSingleInstanceLock: () => true,
          setLoginItemSettings: () => {},
          whenReady: () => ({ then: (callback) => { callback(); return { catch: () => {} } } })
        },
        BrowserWindow: {
          getAllWindows: () => [petWindow]
        },
        dialog: {},
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
      './src/main/services/pet-pack-service': { createPetPackService: () => ({ listPacks: () => [] }) },
      './src/main/services/secret-service': { createSecretService: () => ({}) },
      './src/main/services/ai-service': { createAiService: () => ({}) },
      './src/main/services/behavior-orchestrator-service': { createBehaviorOrchestratorService: () => ({ getConfig: () => ({ enabled: false }) }) },
      './src/main/services/plugin-service': {
        createPluginService: (dependencies) => {
          registeredPluginDependencies = dependencies
          return { stopAllServices: () => {} }
        }
      },
      './src/main/services/plugin-install-service': { createPluginInstallService: () => ({}) },
      './src/main/services/plugin-github-import-service': { createPluginGithubImportService: () => ({}) },
      './src/main/services/local-http-service': { createLocalHttpService: () => ({ start: async () => ({}) }) },
      './src/main/services/action-import-service': { createActionImportService: () => ({}) },
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
    assert.ok(registeredIpcDependencies)

    const ipcWindow = { id: 'ipc-window' }
    registeredIpcDependencies.applyWindowScale(ipcWindow, 0.5)
    registeredPluginDependencies.onPetPackActivated()

    assert.deepEqual(scaleCalls, [{ targetWindow: ipcWindow, scale: 0.5 }])
    assert.equal(animationReloadCalls.length, 1)
    assert.equal(animationReloadCalls[0].petWindow, petWindow)
  } finally {
    Module._load = originalLoad
    delete require.cache[mainPath]
  }
})
