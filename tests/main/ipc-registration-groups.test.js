const test = require('node:test')
const assert = require('node:assert/strict')

const { IPC } = require('../../src/shared/ipc-channels')
const { registerAiIpc } = require('../../src/main/ipc/register-ai-ipc')
const { registerPetRuntimeIpc } = require('../../src/main/ipc/register-pet-runtime-ipc')
const { registerPluginIpc } = require('../../src/main/ipc/register-plugin-ipc')
const { registerServiceIpc } = require('../../src/main/ipc/register-service-ipc')
const { registerSettingsIpc } = require('../../src/main/ipc/register-settings-ipc')
const { registerSystemIpc } = require('../../src/main/ipc/register-system-ipc')
const { registerCatalogIpc } = require('../../src/main/ipc/register-catalog-ipc')

const createIpcMainStub = () => {
  const handlers = new Map()
  const listeners = new Map()
  return {
    handlers,
    listeners,
    handle(channel, handler) {
      handlers.set(channel, handler)
    },
    on(channel, handler) {
      listeners.set(channel, handler)
    }
  }
}

test('registerSystemIpc wires quit and settings-open channels', () => {
  const ipcMain = createIpcMainStub()
  const quitSources = []
  const openedWith = []
  const petWindow = { id: 'pet-window' }

  registerSystemIpc({
    ipcMainService: ipcMain,
    getPetWindow: () => petWindow,
    createSettingsWindow: (window) => openedWith.push(window),
    requestAppQuit: (source) => quitSources.push(source)
  })

  ipcMain.listeners.get(IPC.PET_QUIT)()
  ipcMain.listeners.get(IPC.SETTINGS_OPEN)()

  assert.deepEqual(quitSources, ['pet-renderer'])
  assert.deepEqual(openedWith, [petWindow])
})

test('registerSettingsIpc wires settings preview and close flows', () => {
  const ipcMain = createIpcMainStub()
  const previewCalls = []
  const sentMessages = []
  const settingsWindow = {
    closeCalled: 0,
    close() {
      this.closeCalled += 1
    }
  }
  const petWindow = {
    settingsWindow
  }

  registerSettingsIpc({
    ipcMainService: ipcMain,
    petService: {
      previewSettings: (payload) => previewCalls.push(payload),
      getSettings: () => ({ customCursors: [], localHttp: {}, petBehavior: {} }),
      saveSettings: (settings) => settings
    },
    getPetWindow: () => petWindow,
    browserWindowService: {
      fromWebContents: () => settingsWindow
    },
    sendToPetWindow: (_getWindow, channel, payload) => sentMessages.push({ channel, payload }),
    createPetRendererSettings: (settings) => settings,
    collectCustomCursorAssetPaths: () => [],
    mergePetSettingsViewIntoHostSettings: (current, patch) => ({ ...current, ...patch }),
    recordAppLog: () => {}
  })

  ipcMain.listeners.get(IPC.SETTINGS_PREVIEW_SCALE)(null, 1.25)
  ipcMain.listeners.get(IPC.SETTINGS_CLOSE)({ sender: { id: 'settings-web-contents' } })

  assert.deepEqual(previewCalls, [{ scale: 1.25 }])
  assert.deepEqual(sentMessages, [{ channel: IPC.SETTINGS_CHANGED, payload: { scale: 1.25 } }])
  assert.equal(settingsWindow.closeCalled, 1)
  assert.equal(petWindow.settingsWindow, null)
})

test('registerPetRuntimeIpc wires pet movement and focus handlers', () => {
  const ipcMain = createIpcMainStub()
  const syncCalls = []
  const appFocusCalls = []
  const win = {
    position: [10, 20],
    getPosition() {
      return this.position
    },
    getBounds() {
      return { x: this.position[0], y: this.position[1], width: 120, height: 80 }
    },
    setPosition(x, y) {
      this.position = [x, y]
    },
    focusCalled: 0,
    focus() {
      this.focusCalled += 1
    },
    moveTopCalled: 0,
    moveTop() {
      this.moveTopCalled += 1
    },
    isFocused: () => false,
    isMinimized: () => false,
    isDestroyed: () => false,
    webContents: {}
  }

  registerPetRuntimeIpc({
    ipcMainService: ipcMain,
    petService: {
      getAnimations: () => ({ actions: [] }),
      getSettings: () => ({ petBehavior: {}, menuPosition: 'auto' })
    },
    getPetWindow: () => win,
    browserWindowService: {
      fromWebContents: () => win
    },
    appService: {
      focus: (payload) => appFocusCalls.push(payload)
    },
    applyPetViewport: () => {},
    clampToWorkArea: (_target, x, y) => ({ x, y }),
    getMovementState: () => ({ mode: 'idle' }),
    petMovementPolicy: null,
    petBubbleChatWindowService: {
      syncToPetWindow: () => syncCalls.push('sync')
    },
    screenService: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 800, height: 600 } })
    },
    createSettingsWindow: () => {},
    choosePetContextMenuPoint: () => ({ placement: 'bottom', screenPoint: { x: 0, y: 0 }, windowPoint: { x: 0, y: 0 } }),
    estimatePetContextMenuSize: () => ({ width: 100, height: 100 }),
    showContextMenuWindow: () => {},
    sendToPetWindow: () => {},
    createPetRendererSettings: (settings) => settings,
    recordAppLog: () => {},
    requestAppQuit: () => {}
  })

  const moveResult = ipcMain.handlers.get(IPC.PET_MOVE_BY)({ sender: win.webContents }, { x: 5, y: 7 })
  ipcMain.listeners.get(IPC.PET_REQUEST_FOCUS_FOR_CURSOR)({ sender: win.webContents })

  assert.deepEqual(moveResult, { x: 15, y: 27 })
  assert.deepEqual(win.position, [15, 27])
  assert.deepEqual(syncCalls, ['sync'])
  assert.deepEqual(appFocusCalls, [{ steal: true }])
  assert.equal(win.moveTopCalled, 1)
  assert.equal(win.focusCalled, 1)
})

test('registerAiIpc wires AI config, behavior, and chat-adjacent handlers', async () => {
  const ipcMain = createIpcMainStub()
  const dryRunCalls = []

  registerAiIpc({
    ipcMainService: ipcMain,
    aiService: {
      getConfig: () => ({ enabled: true, model: 'gpt-5.5' }),
      saveConfig: (config) => ({ enabled: true, ...config }),
      saveApiKey: (apiKey) => ({ ok: true, apiKey }),
      testConnection: () => ({ ok: true })
    },
    aiTalkService: {
      getPersonaProfile: async () => ({ petPackId: 'legacy-cat' }),
      generatePersonaDraft: async (request) => ({ prompt: request.prompt || '' }),
      savePersonaOverride: async (override) => ({ override }),
      getMemoryProfile: async () => ({ items: [] }),
      deleteMemory: async (memoryId) => ({ deleted: memoryId }),
      clearPetPackMemories: async () => ({ items: [] }),
      getConversation: (conversationId) => [{ id: conversationId || 'main' }],
      exportTraceDiagnostics: ({ filters, behaviorDecisions }) => JSON.stringify({ filters, behaviorDecisions })
    },
    imageGenerationModelService: {
      getConfig: () => ({ provider: 'cloud' }),
      saveConfig: (config) => config,
      saveCloudApiKey: () => ({ ok: true }),
      clearCloudApiKey: () => ({ ok: true }),
      checkHealth: async () => ({ ok: true })
    },
    behaviorOrchestratorService: {
      getConfig: () => ({ enabled: true, decisions: [{ id: 'd1' }] }),
      saveConfig: (payload) => payload,
      dryRun: (payload) => {
        dryRunCalls.push(payload)
        return { matched: false }
      },
      replayDecision: (payload) => payload,
      exportDiagnostics: () => ({ ok: true }),
      clearDecisions: () => ({ ok: true })
    },
    petService: {
      getAnimations: () => ({ actions: [{ id: 'wave' }] })
    },
    runAiChatRequest: async (payload, options) => ({ payload, options }),
    createAiConfigView: (config) => ({ kind: 'ai-config', config }),
    createAiPersonaProfileView: (profile) => ({ kind: 'persona-profile', profile }),
    createAiPersonaDraftView: (draft) => ({ kind: 'persona-draft', draft }),
    createAiMemoryProfileView: (profile) => ({ kind: 'memory-profile', profile }),
    createImageGenerationConfigView: (config) => ({ kind: 'image-config', config }),
    createImageGenerationApiKeyResult: (result) => ({ kind: 'image-key', result }),
    createImageGenerationHealthCheckResult: (result) => ({ kind: 'image-health', result })
  })

  const config = await ipcMain.handlers.get(IPC.AI_GET_CONFIG)()
  const chat = await ipcMain.handlers.get(IPC.AI_CHAT)(null, { message: 'hi' })
  const dryRun = await ipcMain.handlers.get(IPC.AI_BEHAVIOR_DRY_RUN)(null, { reply: 'wave' })

  assert.deepEqual(config, { kind: 'ai-config', config: { enabled: true, model: 'gpt-5.5' } })
  assert.deepEqual(chat, { payload: { message: 'hi' }, options: { source: 'control-center' } })
  assert.deepEqual(dryRun, { matched: false })
  assert.deepEqual(dryRunCalls, [{ reply: 'wave', actions: [{ id: 'wave' }] }])
  assert.ok(ipcMain.handlers.has(IPC.AI_GET_PERSONA_PROFILE))
  assert.ok(ipcMain.handlers.has(IPC.IMAGE_GENERATION_CHECK_HEALTH))
})

test('registerPluginIpc wires plugin lifecycle and package inspection handlers', async () => {
  const ipcMain = createIpcMainStub()

  registerPluginIpc({
    ipcMainService: ipcMain,
    dialogService: {
      showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/focus-timer.openpet-plugin.zip'] })
    },
    pluginService: {
      listPlugins: () => ({ items: [{ id: 'focus-timer' }] }),
      setEnabled: (pluginId, enabled) => ({ pluginId, enabled }),
      saveConfig: (pluginId, config) => ({ pluginId, config }),
      runCommand: (pluginId, commandId, payload) => ({ pluginId, commandId, payload }),
      runSetup: (pluginId, setupId) => ({ pluginId, setupId }),
      openDashboard: (pluginId, dashboardId) => ({ pluginId, dashboardId }),
      startService: (pluginId, serviceId) => ({ pluginId, serviceId, status: 'started' }),
      stopService: (pluginId, serviceId) => ({ pluginId, serviceId, status: 'stopped' }),
      checkServiceHealth: (pluginId, serviceId) => ({ pluginId, serviceId, ok: true }),
      saveServiceHealthPolicy: (pluginId, serviceId, policy) => ({ pluginId, serviceId, policy }),
      getLogs: (filters) => ({ filters }),
      exportLogs: (filters) => ({ filters, exported: true }),
      clearLogs: () => ({ ok: true }),
      clearStorage: (pluginId) => ({ pluginId, ok: true })
    },
    pluginInstallService: {
      inspectPluginPackage: (filePath) => ({ selectionId: 'sel-1', filePath }),
      clearPendingSelection: (selectionId) => ({ selectionId, ok: true }),
      installPlugin: (selectionId) => ({ kind: 'install', selectionId }),
      updatePlugin: (selectionId) => ({ kind: 'update', selectionId }),
      uninstallPlugin: (pluginId, options) => ({ kind: 'uninstall', pluginId, options })
    },
    pluginGithubImportService: {
      inspectRepositoryUrl: async (repositoryUrl) => ({ repositoryUrl, manifest: { id: 'focus-timer' } })
    },
    createPluginListView: (plugins) => ({ kind: 'plugin-list', plugins }),
    createPluginMutationResult: (result, plugins) => ({ kind: 'plugin-mutation', result, plugins })
  })

  const list = await ipcMain.handlers.get(IPC.PLUGINS_LIST)()
  const inspect = await ipcMain.handlers.get(IPC.PLUGINS_INSPECT_PACKAGE)()
  const install = await ipcMain.handlers.get(IPC.PLUGINS_INSTALL)(null, { selectionId: 'sel-1' })

  assert.deepEqual(list, { kind: 'plugin-list', plugins: { items: [{ id: 'focus-timer' }] } })
  assert.deepEqual(inspect, {
    canceled: false,
    selectionId: 'sel-1',
    filePath: '/tmp/focus-timer.openpet-plugin.zip'
  })
  assert.deepEqual(install, {
    kind: 'plugin-mutation',
    result: { kind: 'install', selectionId: 'sel-1' },
    plugins: { items: [{ id: 'focus-timer' }] }
  })
  assert.ok(ipcMain.handlers.has(IPC.PLUGINS_INSPECT_GITHUB_REPOSITORY))
  assert.ok(ipcMain.handlers.has(IPC.PLUGINS_SAVE_SERVICE_HEALTH_POLICY))
})

test('registerServiceIpc wires service status, token rotation, and config persistence handlers', async () => {
  const ipcMain = createIpcMainStub()
  const savedSettings = []
  const startedConfigs = []

  registerServiceIpc({
    ipcMainService: ipcMain,
    petService: {
      getSettings: () => ({ localHttp: { enabled: true, host: '127.0.0.1', port: 8317, token: 'old-token' } }),
      saveSettings: (settings) => {
        savedSettings.push(settings)
        return settings
      }
    },
    localHttpService: {
      getStatus: () => ({ enabled: true, host: '127.0.0.1', port: 8317, mcp: { activeSessions: 1, sessionTtlMs: 1000 } }),
      getLogs: () => [{ id: 'log-1' }],
      exportLogs: () => ({ ok: true }),
      clearLogs: () => ({ ok: true }),
      start: async (config) => {
        startedConfigs.push(config)
        return { enabled: true, host: config.host, port: config.port, mcp: { activeSessions: 0, sessionTtlMs: 1000 } }
      },
      stop: async () => ({ enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 1000 } }),
      revokeMcpSessions: () => ({ activeSessions: 0, sessionTtlMs: 1000 })
    },
    normalizeLocalHttpConfig: (_current, next) => ({ host: '127.0.0.1', ...next }),
    createLocalHttpToken: () => 'rotated-token',
    createServiceStatusView: (config, runtime) => ({ config, runtime })
  })

  const rotated = await ipcMain.handlers.get(IPC.SERVICE_ROTATE_TOKEN)()
  const saved = await ipcMain.handlers.get(IPC.SERVICE_SAVE_CONFIG)(null, { enabled: true, port: 8456, token: 'custom-token' })

  assert.equal(startedConfigs[0].token, 'rotated-token')
  assert.equal(startedConfigs[1].port, 8456)
  assert.equal(savedSettings.length, 2)
  assert.deepEqual(rotated.runtime, { enabled: true, host: '127.0.0.1', port: 8317, mcp: { activeSessions: 1, sessionTtlMs: 1000 } })
  assert.deepEqual(saved.config, { host: '127.0.0.1', enabled: true, port: 8456, token: 'custom-token' })
  assert.ok(ipcMain.handlers.has(IPC.SERVICE_REVOKE_MCP_SESSIONS))
})

test('registerCatalogIpc wires catalog install and blocklist handlers', async () => {
  const ipcMain = createIpcMainStub()
  const reloadCalls = []

  registerCatalogIpc({
    ipcMainService: ipcMain,
    catalogService: {
      listCatalog: () => ({ items: ['starter-pack'] }),
      prepareInstall: (payload) => ({ selectionId: payload.selectionId }),
      installSelection: () => ({ kind: 'pet-pack', itemId: 'starter-pack', petPacks: { activePackId: 'starter-pack' } }),
      clearSelection: (selectionId) => ({ selectionId, ok: true }),
      addBlocklistEntry: (payload) => [{ ...payload, added: true }],
      removeBlocklistEntry: (payload) => [{ ...payload, removed: true }]
    },
    getPetWindow: () => null,
    petService: {
      getPreviewAnimations: () => ({ actions: ['wave'] })
    },
    reloadAndSendAnimations: (...args) => {
      reloadCalls.push(args)
      return { actions: ['wave'] }
    },
    createCatalogView: (catalog) => ({ kind: 'catalog-view', catalog }),
    createCatalogBlocklistResult: (catalog, blocklist) => ({ kind: 'catalog-blocklist', catalog, blocklist })
  })

  const installed = await ipcMain.handlers.get(IPC.CATALOG_INSTALL_SELECTION)(null, { selectionId: 'sel-1' })
  const blocked = await ipcMain.handlers.get(IPC.CATALOG_ADD_BLOCKLIST)(null, { sourceUrl: 'https://example.com' })

  assert.equal(reloadCalls.length, 1)
  assert.deepEqual(installed, {
    kind: 'pet-pack',
    itemId: 'starter-pack',
    petPacks: { activePackId: 'starter-pack' },
    animations: { actions: ['wave'] },
    catalog: { kind: 'catalog-view', catalog: { items: ['starter-pack'] } }
  })
  assert.deepEqual(blocked, {
    kind: 'catalog-blocklist',
    catalog: { items: ['starter-pack'] },
    blocklist: [{ sourceUrl: 'https://example.com', added: true }]
  })
  assert.ok(ipcMain.handlers.has(IPC.CATALOG_CLEAR_SELECTION))
})
