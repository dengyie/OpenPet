const test = require('node:test')
const assert = require('node:assert/strict')

const { IPC } = require('../../src/shared/ipc-channels')
const { registerIpcHandlers } = require('../../src/main/ipc')

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

const createRequiredServices = ({ ipcMainService, appLogService, menuService, screenService, petWindow, appService }) => ({
  getPetWindow: () => petWindow || null,
  petService: {
    onSay: () => {},
    onAction: () => {},
    onEvent: () => {},
    getAnimations: () => ({ actions: [] }),
    getPreviewAnimations: () => ({ actions: [] }),
    reloadAnimations: () => ({ actions: [] }),
    previewSettings: () => {},
    getSettings: () => ({ localHttp: {}, petBehavior: {} }),
    saveSettings: (settings) => settings,
    say: (payload) => payload,
    playAction: (payload) => payload,
    setEvent: (payload) => payload
  },
  petPackService: {
    listPacks: () => [],
    inspectPackSource: () => ({}),
    clearPendingSelection: () => ({ ok: true }),
    importPack: () => ({ ok: true }),
    exportPack: () => ({ ok: true }),
    setActivePack: () => ({ ok: true }),
    removePack: () => ({ ok: true })
  },
  aiService: {
    getConfig: () => ({}),
    saveConfig: (config) => config,
    saveApiKey: () => ({ ok: true }),
    testConnection: () => ({ ok: true }),
    getConversation: () => [],
    chat: () => ({ reply: 'ok' })
  },
  behaviorOrchestratorService: {
    getConfig: () => ({ enabled: false }),
    saveConfig: (config) => config,
    dryRun: () => ({ matched: false })
  },
  pluginService: { listPlugins: () => [] },
  pluginInstallService: {
    inspectPluginPackage: () => ({}),
    clearPendingSelection: () => ({ ok: true }),
    installPlugin: () => ({ ok: true }),
    updatePlugin: () => ({ ok: true }),
    uninstallPlugin: () => ({ ok: true })
  },
  pluginGithubImportService: {
    inspectRepository: () => ({})
  },
  catalogService: {
    listCatalog: () => [],
    prepareInstall: () => ({ ok: true }),
    installSelection: () => ({ ok: true }),
    clearSelection: () => ({ ok: true }),
    addBlocklistEntry: () => [],
    removeBlocklistEntry: () => []
  },
  localHttpService: {
    getStatus: () => ({ enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } }),
    getLogs: () => [],
    exportLogs: () => ({ ok: true }),
    clearLogs: () => ({ ok: true }),
    start: async () => ({ enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } }),
    stop: async () => ({ enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } }),
    revokeMcpSessions: () => ({ activeSessions: 0, sessionTtlMs: 0 })
  },
  aboutService: {
    getInfo: () => ({}),
    checkForUpdates: () => ({ ok: true })
  },
  actionImportService: {
    inspectActionFrames: () => ({ inspection: { valid: true } }),
    importActionFrames: () => ({ ok: true }),
    updateActionConfig: (payload) => payload,
    deleteAction: () => ({ ok: true })
  },
  cursorAssetService: {},
  appLogService,
  applyWindowScale: () => {},
  applyPetViewport: () => {},
  clampToWorkArea: (_win, x, y) => ({ x, y }),
  getMovementState: () => null,
  createSettingsWindow: () => {},
  dialogService: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  },
  browserWindowService: {
    fromWebContents: () => petWindow || null
  },
  ipcMainService,
  menuService,
  screenService,
  appService,
  showContextMenuWindow: (request) => {
    const quitItem = request.items.find((item) => item.label === '退出')
    request.onSelect(quitItem)
  }
})

test('pet renderer quit records user intent before quitting', () => {
  const ipcMain = createIpcMainStub()
  const logs = []
  let quitCalls = 0

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    appLogService: { record: (entry) => logs.push(entry) },
    appService: { quit: () => { quitCalls += 1 } }
  }))

  ipcMain.listeners.get(IPC.PET_QUIT)()

  assert.equal(quitCalls, 1)
  assert.deepEqual(logs.at(-1), {
    scope: 'app',
    level: 'info',
    actor: 'user',
    event: 'app.quit.requested',
    message: 'OpenPet quit requested',
    details: { source: 'pet-renderer' }
  })
})

test('pet cursor focus request focuses the source pet window', () => {
  const ipcMain = createIpcMainStub()
  const logs = []
  let restoreCalls = 0
  let focusCalls = 0
  const petWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => { restoreCalls += 1 },
    focus: () => { focusCalls += 1 },
    webContents: {}
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petWindow,
    appLogService: { record: (entry) => logs.push(entry) }
  }))

  ipcMain.listeners.get(IPC.PET_REQUEST_FOCUS_FOR_CURSOR)({ sender: petWindow.webContents })

  assert.equal(restoreCalls, 1)
  assert.equal(focusCalls, 1)
  assert.deepEqual(logs.at(-1), {
    scope: 'pet-window',
    level: 'debug',
    actor: 'system',
    event: 'pet.cursor.focus.requested',
    message: 'Pet window focus requested for custom cursor'
  })
})

test('pet cursor focus request does not steal focus from an open context menu', () => {
  const ipcMain = createIpcMainStub()
  let focusCalls = 0
  const petWindow = {
    contextMenuWindow: {
      isDestroyed: () => false
    },
    isDestroyed: () => false,
    isMinimized: () => false,
    focus: () => { focusCalls += 1 },
    webContents: {}
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petWindow,
    appLogService: { record: () => {} }
  }))

  ipcMain.listeners.get(IPC.PET_REQUEST_FOCUS_FOR_CURSOR)({ sender: petWindow.webContents })

  assert.equal(focusCalls, 0)
})

test('pet context menu quit records menu source before quitting', async () => {
  const ipcMain = createIpcMainStub()
  const logs = []
  let quitCalls = 0
  const petWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 100, y: 100, width: 80, height: 120 }),
    webContents: {}
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petWindow,
    appLogService: { record: (entry) => logs.push(entry) },
    appService: { quit: () => { quitCalls += 1 } },
    screenService: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  }))

  await ipcMain.handlers.get(IPC.PET_SHOW_CONTEXT_MENU)({ sender: petWindow.webContents }, { x: 40, y: 60 })

  assert.equal(quitCalls, 1)
  assert.deepEqual(logs.at(-1), {
    scope: 'app',
    level: 'info',
    actor: 'user',
    event: 'app.quit.requested',
    message: 'OpenPet quit requested',
    details: { source: 'pet-context-menu' }
  })
})
