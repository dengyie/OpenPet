const test = require('node:test')
const assert = require('node:assert/strict')

const { createOpenPetRuntime } = require('../../src/main/bootstrap/create-openpet-runtime')

test('bootstrap runtime wires plugin install and service block-status lookups through the created catalog service', async () => {
  const dialogCalls = []
  const pluginInstallCandidates = []
  const pluginServiceCandidates = []
  const createWindowCalls = []
  const loadPetWindowCalls = []
  const smokeCalls = []
  const cleanupCalls = []
  const appHandlers = new Map()
  const screenHandlers = new Map()
  const registeredIpcDependencies = []
  const settings = {
    scale: 1,
    autoStart: false,
    localHttp: {},
    petBehavior: { home: { enabled: false, anchor: null } },
    plugins: { enabled: {}, config: {}, storage: {}, logs: [] },
    ai: { behavior: {} },
    petPacks: { activePackId: 'starter', installed: {} },
    ecosystem: { blocklist: { pluginIds: [], packIds: [], sha256: [] } }
  }
  let petWindow = {
    webContents: { on: (eventName, handler) => { if (eventName === 'did-finish-load') petWindow.didFinishLoad = handler }, send: () => {} },
    getBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    setPosition: () => {},
    isDestroyed: () => false
  }

  const runtime = createOpenPetRuntime({
    app: {
      getPath: () => '/tmp/openpet-runtime-test',
      on: (eventName, handler) => { appHandlers.set(eventName, handler) }
    },
    BrowserWindow: {
      getAllWindows: () => [petWindow]
    },
    dialog: {
      showOpenDialog: async (options) => {
        dialogCalls.push(options)
        return { canceled: false, filePaths: ['/tmp/frames'] }
      }
    },
    shell: { openExternal: () => {} },
    screen: { on: (eventName, handler) => { screenHandlers.set(eventName, handler) } },
    projectRoot: '/workspace/OpenPet',
    packageJson: { version: '1.0.0' },
    settingsRuntime: {
      loadSettings: () => settings,
      saveSettings: () => {},
      syncLoginItemSettings: () => {}
    },
    getPetWindow: () => petWindow,
    setPetWindow: (nextPetWindow) => { petWindow = nextPetWindow },
    createSettingsWindow: () => {},
    createWindow: (options = {}) => {
      createWindowCalls.push(options)
      return petWindow
    },
    loadPetWindow: (targetWindow) => loadPetWindowCalls.push(targetWindow),
    registerAppLifecycleLogs: ({ appLogService, onBeforeQuit }) => {
      appLogService.record({ event: 'app.ready' })
      appHandlers.set('before-quit', onBeforeQuit)
    },
    registerIpcHandlers: (dependencies) => registeredIpcDependencies.push(dependencies),
    createPetRendererSettings: (input) => input,
    normalizeLocalHttpConfig: (_current, nextConfig) => nextConfig,
    reloadAndSendAnimations: () => ({ actions: [] }),
    applyWindowScale: () => {},
    applyPetViewport: () => {},
    clampToWorkArea: (_window, x, y) => ({ x, y }),
    getMovementState: () => null,
    maybeRunPackagedRuntimeSmoke: (payload) => smokeCalls.push(payload),
    maybeRunPackagedPluginCleanupEvidence: (payload) => cleanupCalls.push(payload),
    factories: {
      createAboutService: () => ({ id: 'about' }),
      createActionImportService: () => ({ id: 'action-import' }),
      createActionService: () => ({ id: 'action-service' }),
      createAiService: () => ({ id: 'ai-service' }),
      createAiTalkService: () => ({ id: 'ai-talk-service' }),
      createAiTalkStore: () => ({ getMigrationSummary: () => ({ migrated: false }) }),
      createAppLogService: () => ({ record: () => {}, logPath: '/tmp/app-log.jsonl' }),
      createBasicBehaviorPlugin: () => ({ id: 'basic' }),
      createBehaviorOrchestratorService: () => ({ id: 'behavior' }),
      createCatalogService: () => ({
        getPluginBlockStatus: (candidate) => {
          return { blocked: candidate === 'blocked-plugin', reasons: candidate === 'blocked-plugin' ? ['policy'] : [] }
        },
        getPetPackBlockStatus: () => ({ blocked: false, reasons: [] })
      }),
      createCursorAssetService: () => ({ repairCursor: async () => ({}) }),
      createEventBus: () => ({ on: () => {}, emit: () => {} }),
      createImageGenerationModelService: () => ({ id: 'image-service' }),
      createLocalHttpService: () => ({ start: async () => ({}) }),
      createPetBubbleChatWindowManager: () => ({ id: 'bubble-window' }),
      createPetChatWindowManager: () => ({ id: 'chat-window' }),
      createPetMovementPolicy: () => ({
        normalizeWindowForDisplay: () => ({ x: 0, y: 0 }),
        normalizePetBehaviorSettings: (behavior) => behavior || { home: { enabled: false, anchor: null } },
        resolveDisplayForWindow: () => ({ id: 'display-1' }),
        normalizeAnchorForDisplay: ({ anchor }) => anchor
      }),
      createPetPackService: () => ({ id: 'pet-pack-service' }),
      createPetService: () => ({
        getSettings: () => settings,
        saveSettings: () => {},
        reloadAnimations: () => ({ actions: [] })
      }),
      createPetUtteranceLogService: () => ({ id: 'utterance-log' }),
      createPluginGithubImportService: () => ({ id: 'github-import' }),
      createPluginInstallService: ({ getPluginBlockStatus }) => ({
        readBlockStatus: (candidate) => {
          pluginInstallCandidates.push(candidate)
          return getPluginBlockStatus(candidate)
        }
      }),
      createPluginService: ({ getPluginBlockStatus, selectCreatorAssetFrameFolder }) => ({
        readBlockStatus: (candidate) => {
          pluginServiceCandidates.push(candidate)
          return getPluginBlockStatus(candidate)
        },
        pickFrames: selectCreatorAssetFrameFolder,
        stopAllServices: () => {}
      }),
      createSecretService: () => ({ id: 'secret' }),
      createSettingsService: ({ loadSettings }) => ({ get: loadSettings, save: () => {}, preview: () => ({}) }),
      syncBundledPlugins: () => ({ synced: [] })
    }
  })

  assert.ok(runtime)
  assert.equal(createWindowCalls.length, 1)
  assert.equal(loadPetWindowCalls.length, 1)
  assert.equal(registeredIpcDependencies.length, 1)
  assert.equal(screenHandlers.has('display-added'), true)
  assert.equal(typeof appHandlers.get('activate'), 'function')

  const ipcDependencies = registeredIpcDependencies[0]
  assert.deepEqual(ipcDependencies.pluginInstallService.readBlockStatus('blocked-plugin'), { blocked: true, reasons: ['policy'] })
  assert.deepEqual(ipcDependencies.pluginService.readBlockStatus('allowed-plugin'), { blocked: false, reasons: [] })
  assert.deepEqual(await ipcDependencies.pluginService.pickFrames(), { canceled: false, sourceDir: '/tmp/frames' })
  assert.equal(dialogCalls.length, 1)
  assert.deepEqual(pluginInstallCandidates, ['blocked-plugin'])
  assert.deepEqual(pluginServiceCandidates, ['allowed-plugin'])

  petWindow.didFinishLoad()
  assert.equal(smokeCalls.length, 1)
  assert.equal(cleanupCalls.length, 1)
})
