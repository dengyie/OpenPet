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
  const logs = []
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
    appLogService: { record: (entry) => logs.push(entry) },
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
  assert.equal(template[0].id, 'actions')
  assert.equal(template[0].type, 'submenu')
  assert.equal(template[0].label, '动作')
  assert.equal(template.some((item) => item.label === '待机'), false)
  assert.equal(template.some((item) => item.label === '挥手'), false)
  assert.equal(template.some((item) => item.label === '散步'), false)
  assert.deepEqual(template[0].submenu.map((item) => item.label), ['散步', '挥手'])
  assert.deepEqual(menuWindowRequest.layout.point, placement.screenPoint)
  assert.deepEqual(menuWindowRequest.layout.size, {
    width: 112,
    height: 116,
    contentHeight: 116,
    scrollable: false
  })
  assert.equal(menuWindowRequest.parentWindow, petWindow)
  assert.equal(menuWindowRequest.BrowserWindow, browserWindowService)

  const popupLog = logs.find((entry) => entry.event === 'pet.menu.popup')
  assert.equal(popupLog.details.contentHeight, 116)
  assert.equal(popupLog.details.windowHeight, 116)
  assert.equal(popupLog.details.scrollable, false)
  assert.equal(popupLog.details.reason, 'preferred-placement')
  assert.equal(popupLog.details.petOverlapArea, 0)
  assert.equal(Number.isFinite(popupLog.details.idealX), true)
  assert.equal(Number.isFinite(popupLog.details.idealY), true)
  assert.equal(popupLog.details.idealOverflowArea, 0)

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

test('pet context menu keeps only the primary chat entry when bubble chat is available', async () => {
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
  const actionItem = menuWindowRequest.items.find((item) => item.label === '动作')
  assert.ok(chatItem)
  assert.equal(menuWindowRequest.items.some((item) => item.label === '打开扩展聊天面板'), false)
  assert.ok(actionItem)
  assert.deepEqual(actionItem.submenu.map((item) => item.label), ['散步', '挥手'])
  assert.equal(menuWindowRequest.layout.size.height, 146)

  menuWindowRequest.onSelect(chatItem)

  assert.equal(openBubbleChatCalls, 1)
  assert.equal(openDesktopChatCalls, 0)
})

test('pet context menu falls back through the primary chat entry when bubble chat is disabled', async () => {
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
  assert.equal(menuWindowRequest.items.some((item) => item.label === '打开扩展聊天面板'), false)

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

test('pet context menu records submenu placement diagnostics when the menu window reports them', async () => {
  const ipcMain = createIpcMainStub()
  const logs = []
  const petWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 720, y: 300, width: 150, height: 150 }),
    webContents: { send: () => {} }
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
    ...createRequiredServices(),
    getPetWindow: () => petWindow,
    ipcMainService: ipcMain,
    appLogService: { record: (entry) => logs.push(entry) },
    showContextMenuWindow: (request) => {
      menuWindowRequest = request
    }
  })

  await ipcMain.handlers.get(IPC.PET_SHOW_CONTEXT_MENU)({
    sender: petWindow.webContents
  }, { x: 70, y: 80 })

  menuWindowRequest.onSubmenuOpen({
    label: '动作',
    placement: 'left',
    reason: 'avoids-pet',
    parentMenuBounds: { x: 568, y: 68, width: 112, height: 176 },
    petBounds: { x: 720, y: 300, width: 150, height: 150 },
    workArea: { x: 0, y: 0, width: 900, height: 700 },
    contentSize: { width: 112, height: 72 },
    scrollable: false,
    submenuBounds: { x: 456, y: 74, width: 112, height: 56 },
    parentOverlapArea: 0,
    petOverlapArea: 0,
    rightCandidate: {
      placement: 'right',
      screenPoint: { x: 680, y: 74 },
      idealPoint: { x: 680, y: 74 },
      overlapArea: 1800,
      petOverlapArea: 1800,
      parentOverlapArea: 0,
      overflowArea: 0,
      idealOverflowArea: 256,
      fitsHorizontally: true
    },
    leftCandidate: {
      placement: 'left',
      screenPoint: { x: 456, y: 74 },
      idealPoint: { x: 456, y: 74 },
      overlapArea: 0,
      petOverlapArea: 0,
      parentOverlapArea: 0,
      overflowArea: 0,
      idealOverflowArea: 0,
      fitsHorizontally: true
    }
  })

  assert.deepEqual(logs.at(-1), {
    scope: 'pet-menu',
    level: 'info',
    actor: 'user',
    event: 'pet.menu.submenu.popup',
    message: 'Pet context submenu popup requested',
    details: {
      label: '动作',
      placement: 'left',
      reason: 'avoids-pet',
      parentMenuX: 568,
      parentMenuY: 68,
      parentMenuWidth: 112,
      parentMenuHeight: 176,
      petX: 720,
      petY: 300,
      petWidth: 150,
      petHeight: 150,
      workAreaX: 0,
      workAreaY: 0,
      workAreaWidth: 900,
      workAreaHeight: 700,
      submenuX: 456,
      submenuY: 74,
      submenuWidth: 112,
      submenuHeight: 56,
      contentWidth: 112,
      contentHeight: 72,
      scrollable: false,
      parentOverlapArea: 0,
      petOverlapArea: 0,
      rightFits: true,
      rightX: 680,
      rightY: 74,
      rightIdealX: 680,
      rightIdealY: 74,
      rightOverflowArea: 0,
      rightIdealOverflowArea: 256,
      rightParentOverlapArea: 0,
      rightOverlapArea: 1800,
      leftFits: true,
      leftX: 456,
      leftY: 74,
      leftIdealX: 456,
      leftIdealY: 74,
      leftOverflowArea: 0,
      leftIdealOverflowArea: 0,
      leftParentOverlapArea: 0,
      leftOverlapArea: 0
    }
  })
})
