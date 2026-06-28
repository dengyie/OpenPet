const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

const ipcPath = require.resolve('../../src/main/ipc')
const { IPC } = require('../../src/shared/ipc-channels')

const loadIpcWithElectron = (electronStub) => {
  delete require.cache[ipcPath]
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return electronStub
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(ipcPath)
  } finally {
    Module._load = originalLoad
  }
}

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

const createRequiredServices = (overrides = {}) => ({
  getPetWindow: () => null,
  petService: {
    onSay: () => {},
    onAction: () => {},
    onEvent: () => {},
    getAnimations: () => ({
      actions: [
        { id: 'idle', label: '待机' },
        { id: 'waving', label: '挥手' }
      ]
    }),
    getPreviewAnimations: () => ({ actions: [] }),
    reloadAnimations: () => ({ actions: [] }),
    getSettings: () => ({ localHttp: {}, menuPosition: 'above' }),
    saveSettings: (settings) => settings,
    previewSettings: () => {},
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
    dryRun: () => ({ matched: false }),
    replayDecision: () => ({ matched: false }),
    exportDiagnostics: () => ({}),
    clearDecisions: () => ({ ok: true })
  },
  pluginService: {
    listPlugins: () => [],
    getLogs: () => [],
    exportLogs: () => ({ ok: true }),
    clearLogs: () => ({ ok: true }),
    setEnabled: () => ({ ok: true }),
    saveConfig: () => ({ ok: true }),
    runCommand: () => ({ ok: true }),
    runSetup: () => ({ ok: true }),
    openDashboard: () => ({ ok: true }),
    startService: () => ({ ok: true }),
    stopService: () => ({ ok: true }),
    checkServiceHealth: () => ({ ok: true }),
    saveServiceHealthPolicy: () => ({ ok: true }),
    clearStorage: () => ({ ok: true })
  },
  pluginInstallService: {
    inspectPluginPackage: () => ({}),
    clearPendingSelection: () => ({ ok: true }),
    installPlugin: () => ({ ok: true }),
    updatePlugin: () => ({ ok: true }),
    uninstallPlugin: () => ({ ok: true })
  },
  pluginGithubImportService: {
    inspectRepositoryUrl: () => ({ ok: true })
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
    start: async () => ({}),
    stop: async () => ({}),
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
  applyWindowScale: () => {},
  clampToWorkArea: (_win, x, y) => ({ x, y }),
  getMovementState: () => null,
  createSettingsWindow: () => {},
  dialogService: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  },
  ...overrides
})

test('pet context menu opens a positioned menu window and sends action commands back', async () => {
  const ipcMain = createIpcMainStub()
  const sentMessages = []
  const petWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 720, y: 300, width: 150, height: 150 }),
    webContents: {
      send: (channel, payload) => sentMessages.push({ channel, payload })
    }
  }
  let popupOptions = null
  let menuWindowRequest = null
  const browserWindowService = {
    fromWebContents: () => petWindow
  }
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: browserWindowService,
    app: { quit: () => {} },
    dialog: {},
    Menu: {
      buildFromTemplate: (nextTemplate) => {
        return {
          popup: (options) => { popupOptions = options }
        }
      }
    },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices(),
    getPetWindow: () => petWindow,
    ipcMainService: ipcMain,
    showContextMenuWindow: (request) => {
      menuWindowRequest = request
    }
  })

  const placement = await ipcMain.handlers.get(IPC.PET_SHOW_CONTEXT_MENU)({
    sender: petWindow.webContents
  }, { x: 70, y: 80 })

  assert.equal(placement.placement, 'above')
  assert.equal(popupOptions, null)
  const template = menuWindowRequest.items
  assert.equal(template[0].type, 'submenu')
  assert.equal(template[0].label, '动作')
  assert.equal(template.some((item) => item.label === '待机'), false)
  assert.equal(template.some((item) => item.label === '挥手'), false)
  assert.equal(template.some((item) => item.label === '散步'), false)
  assert.deepEqual(template[0].submenu.map((item) => item.label), ['散步', '挥手'])
  assert.deepEqual(menuWindowRequest.point, placement.screenPoint)
  assert.deepEqual(menuWindowRequest.size, { width: 112, height: 146 })
  assert.equal(menuWindowRequest.parentWindow, petWindow)
  assert.equal(menuWindowRequest.BrowserWindow, browserWindowService)

  menuWindowRequest.onSelect(template[0].submenu[1])

  assert.deepEqual(sentMessages, [{
    channel: IPC.PET_MENU_COMMAND,
    payload: { command: 'action', actionId: 'waving' }
  }])
})

test('pet context menu hides the action submenu when no manual actions are available', async () => {
  const ipcMain = createIpcMainStub()
  const petWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 520, y: 240, width: 150, height: 150 }),
    webContents: {
      send: () => {}
    }
  }
  let menuWindowRequest = null
  const browserWindowService = {
    fromWebContents: () => petWindow
  }
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: browserWindowService,
    app: { quit: () => {} },
    dialog: {},
    Menu: {},
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices({
      petService: {
        ...createRequiredServices().petService,
        getAnimations: () => ({
          actions: [
            { id: 'idle', label: '待机', kind: 'idle' },
            { id: 'running', label: '奔跑', kind: 'working' }
          ]
        })
      }
    }),
    getPetWindow: () => petWindow,
    ipcMainService: ipcMain,
    showContextMenuWindow: (request) => {
      menuWindowRequest = request
    }
  })

  await ipcMain.handlers.get(IPC.PET_SHOW_CONTEXT_MENU)({
    sender: petWindow.webContents
  }, { x: 70, y: 80 })

  assert.deepEqual(menuWindowRequest.items.map((item) => item.label || item.type), ['设置', 'separator', '退出'])
})

test('pet context menu prefers bubble chat for the primary chat entry and keeps desktop chat as an extended panel', async () => {
  const ipcMain = createIpcMainStub()
  const petWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 500, y: 240, width: 150, height: 150 }),
    webContents: {
      send: () => {}
    }
  }
  let openBubbleChatCalls = 0
  let openDesktopChatCalls = 0
  let menuWindowRequest = null
  const browserWindowService = {
    fromWebContents: () => petWindow
  }
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: browserWindowService,
    app: { quit: () => {} },
    dialog: {},
    Menu: {},
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices(),
    getPetWindow: () => petWindow,
    ipcMainService: ipcMain,
    petBubbleChatWindowService: {
      open: () => {
        openBubbleChatCalls += 1
        return { visible: true, hasWindow: true }
      }
    },
    petChatWindowService: {
      open: () => { openDesktopChatCalls += 1 }
    },
    showContextMenuWindow: (request) => {
      menuWindowRequest = request
    }
  })

  await ipcMain.handlers.get(IPC.PET_SHOW_CONTEXT_MENU)({
    sender: petWindow.webContents
  }, { x: 70, y: 80 })

  const chatItem = menuWindowRequest.items.find((item) => item.label === '和宠物聊天')
  const desktopChatItem = menuWindowRequest.items.find((item) => item.label === '打开扩展聊天面板')
  const actionItem = menuWindowRequest.items.find((item) => item.label === '动作')
  assert.ok(chatItem)
  assert.ok(desktopChatItem)
  assert.ok(actionItem)
  assert.deepEqual(actionItem.submenu.map((item) => item.label), ['散步', '挥手'])
  assert.equal(menuWindowRequest.size.height, 206)

  menuWindowRequest.onSelect(chatItem)
  menuWindowRequest.onSelect(desktopChatItem)

  assert.equal(openBubbleChatCalls, 1)
  assert.equal(openDesktopChatCalls, 1)
})

test('pet context menu falls back to the extended desktop chat when bubble chat is disabled', async () => {
  const ipcMain = createIpcMainStub()
  const petWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 500, y: 240, width: 150, height: 150 }),
    webContents: {
      send: () => {}
    }
  }
  let openBubbleChatCalls = 0
  let openDesktopChatCalls = 0
  let menuWindowRequest = null
  const browserWindowService = {
    fromWebContents: () => petWindow
  }
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: browserWindowService,
    app: { quit: () => {} },
    dialog: {},
    Menu: {},
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices(),
    getPetWindow: () => petWindow,
    ipcMainService: ipcMain,
    petBubbleChatWindowService: {
      open: () => {
        openBubbleChatCalls += 1
        return { visible: false, hasWindow: false }
      }
    },
    petChatWindowService: {
      open: () => { openDesktopChatCalls += 1 }
    },
    showContextMenuWindow: (request) => {
      menuWindowRequest = request
    }
  })

  await ipcMain.handlers.get(IPC.PET_SHOW_CONTEXT_MENU)({
    sender: petWindow.webContents
  }, { x: 70, y: 80 })

  const chatItem = menuWindowRequest.items.find((item) => item.label === '和宠物聊天')
  assert.ok(chatItem)

  menuWindowRequest.onSelect(chatItem)

  assert.equal(openBubbleChatCalls, 1)
  assert.equal(openDesktopChatCalls, 1)
})

test('pet context menu hides the action submenu when no manual actions are available', async () => {
  const ipcMain = createIpcMainStub()
  const petWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 520, y: 240, width: 150, height: 150 }),
    webContents: {
      send: () => {}
    }
  }
  let menuWindowRequest = null
  const browserWindowService = {
    fromWebContents: () => petWindow
  }
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: browserWindowService,
    app: { quit: () => {} },
    dialog: {},
    Menu: {},
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices({
      petService: {
        ...createRequiredServices().petService,
        getAnimations: () => ({
          actions: [
            { id: 'idle', label: '待机', kind: 'idle' },
            { id: 'running', label: '奔跑', kind: 'working' }
          ]
        })
      }
    }),
    getPetWindow: () => petWindow,
    ipcMainService: ipcMain,
    showContextMenuWindow: (request) => {
      menuWindowRequest = request
    }
  })

  await ipcMain.handlers.get(IPC.PET_SHOW_CONTEXT_MENU)({
    sender: petWindow.webContents
  }, { x: 70, y: 80 })

  assert.deepEqual(menuWindowRequest.items.map((item) => item.label || item.type), ['设置', 'separator', '退出'])
})

test('pet quit records the user intent before quitting the app', () => {
  const ipcMain = createIpcMainStub()
  const logs = []
  let quitCalls = 0
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: { fromWebContents: () => null },
    app: { quit: () => { quitCalls += 1 } },
    dialog: {},
    Menu: {},
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices(),
    ipcMainService: ipcMain,
    appLogService: { record: (entry) => logs.push(entry) }
  })

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
