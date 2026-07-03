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

const createRequiredServices = ({
  ipcMainService,
  petService,
  cursorAssetService,
  dialogService,
  browserWindowService,
  appService,
  getPetWindow = () => null,
  applyWindowScale = () => {}
}) => ({
  getPetWindow,
  petService,
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
  cursorAssetService,
  appLogService: { record: () => {} },
  applyWindowScale,
  applyPetViewport: () => {},
  clampToWorkArea: (_win, x, y) => ({ x, y }),
  getMovementState: () => null,
  createSettingsWindow: () => {},
  dialogService: dialogService || {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  },
  browserWindowService,
  appService,
  ipcMainService
})

test('settings:save removes orphaned cursor assets after replacing a custom cursor', async () => {
  const deletedPaths = []
  const ipcMain = createIpcMainStub()
  let currentSettings = {
    scale: 1,
    walkSpeed: 2,
    walkDuration: 15000,
    bubbleDuration: 1300,
    autoStart: false,
    selectedCursorId: 'cursor-old',
    customCursor: {
      enabled: true,
      assetPath: '/tmp/cursor-old.png',
      assetUrl: 'file:///tmp/cursor-old.png',
      fileName: 'cursor-old.png',
      width: 32,
      height: 32,
      hotspotX: 0,
      hotspotY: 0
    },
    customCursors: [{
      id: 'cursor-old',
      type: 'custom',
      name: '旧指针',
      assetPath: '/tmp/cursor-old.png',
      assetUrl: 'file:///tmp/cursor-old.png',
      fileName: 'cursor-old.png',
      width: 32,
      height: 32,
      byteSize: 123,
      hotspotX: 0,
      hotspotY: 0,
      createdAt: '2026-06-19T00:00:00.000Z'
    }],
    petBehavior: {
      grounded: false,
      home: {
        enabled: false,
        radius: 'medium',
        anchor: null
      }
    }
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService: {
      onSay: () => {},
      onAction: () => {},
      onEvent: () => {},
      getAnimations: () => ({ actions: [] }),
      getPreviewAnimations: () => ({ actions: [] }),
      reloadAnimations: () => ({ actions: [] }),
      previewSettings: () => {},
      getSettings: () => currentSettings,
      saveSettings: (settings) => {
        currentSettings = settings
        return currentSettings
      },
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    },
    cursorAssetService: {
      deleteAssets: (paths) => deletedPaths.push(...paths)
    }
  }))

  const result = await ipcMain.handlers.get(IPC.SETTINGS_SAVE)(null, {
    selectedCursorId: 'cursor-new',
    customCursors: [{
      id: 'cursor-new',
      type: 'custom',
      name: '新指针',
      assetPath: '/tmp/cursor-new.png',
      assetUrl: 'file:///tmp/cursor-new.png',
      fileName: 'cursor-new.png',
      width: 32,
      height: 32,
      byteSize: 456,
      hotspotX: 0,
      hotspotY: 0,
      createdAt: '2026-06-19T00:01:00.000Z'
    }]
  })

  assert.equal(result.selectedCursorId, 'cursor-new')
  assert.deepEqual(deletedPaths, ['/tmp/cursor-old.png'])
})

test('settings:get repairs legacy custom cursor records so size controls can use real dimensions', async () => {
  const ipcMain = createIpcMainStub()
  let savedSettings = null
  let currentSettings = {
    scale: 1,
    walkSpeed: 2,
    walkDuration: 15000,
    bubbleDuration: 1300,
    menuPosition: 'auto',
    autoStart: false,
    selectedCursorId: 'builtin-claw-purple',
    customCursor: {
      enabled: true,
      assetPath: 'builtin://builtin-claw-purple',
      assetUrl: 'data:image/svg+xml;utf8,builtin',
      fileName: 'builtin-claw-purple.svg',
      width: 48,
      height: 48,
      hotspotX: 2,
      hotspotY: 2
    },
    customCursors: [{
      id: 'custom-legacy',
      type: 'custom',
      name: 'cursor.png',
      assetPath: '/tmp/cursor.png',
      assetUrl: 'file:///tmp/cursor.png',
      fileName: 'cursor.png',
      width: 0,
      height: 0,
      byteSize: 123,
      hotspotX: 0,
      hotspotY: 0,
      createdAt: '2026-07-02T00:00:00.000Z',
      sizePercent: 150,
      baseWidth: 0,
      baseHeight: 0,
      baseHotspotX: 0,
      baseHotspotY: 0
    }],
    petBehavior: {
      grounded: false,
      home: {
        enabled: false,
        radius: 'medium',
        anchor: null
      }
    }
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService: {
      onSay: () => {},
      onAction: () => {},
      onEvent: () => {},
      getAnimations: () => ({ actions: [] }),
      getPreviewAnimations: () => ({ actions: [] }),
      reloadAnimations: () => ({ actions: [] }),
      previewSettings: () => {},
      getSettings: () => currentSettings,
      saveSettings: (settings) => {
        currentSettings = settings
        savedSettings = settings
        return currentSettings
      },
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    },
    cursorAssetService: {
      repairCursor: async () => ({
        enabled: true,
        assetPath: '/tmp/cursor-repaired.png',
        assetUrl: 'file:///tmp/cursor-repaired.png',
        fileName: 'cursor-repaired.png',
        width: 64,
        height: 64,
        hotspotX: 16,
        hotspotY: 12
      })
    }
  }))

  const result = await ipcMain.handlers.get(IPC.SETTINGS_GET)()

  assert.ok(savedSettings)
  assert.equal(result.customCursors.length, 1)
  assert.equal(result.customCursors[0].assetPath, '/tmp/cursor-repaired.png')
  assert.equal(result.customCursors[0].width, 96)
  assert.equal(result.customCursors[0].height, 96)
  assert.equal(result.customCursors[0].hotspotX, 24)
  assert.equal(result.customCursors[0].hotspotY, 18)
  assert.equal(result.customCursors[0].baseWidth, 64)
  assert.equal(result.customCursors[0].baseHeight, 64)
  assert.equal(result.customCursors[0].sizePercent, 150)
})

test('settings:get repairs malformed built-in cursor overrides from the built-in catalog without file repair', async () => {
  const ipcMain = createIpcMainStub()
  let repairCursorCalls = 0
  let savedSettings = null
  let currentSettings = {
    scale: 1,
    walkSpeed: 2,
    walkDuration: 15000,
    bubbleDuration: 1300,
    menuPosition: 'auto',
    autoStart: false,
    selectedCursorId: 'builtin-claw-purple',
    customCursor: {
      enabled: true,
      assetPath: 'builtin://builtin-claw-purple',
      assetUrl: 'data:image/svg+xml;utf8,builtin',
      fileName: 'builtin-claw-purple.svg',
      width: 48,
      height: 48,
      hotspotX: 2,
      hotspotY: 2
    },
    customCursors: [{
      id: 'builtin-claw-purple',
      type: 'custom',
      name: '爪爪紫',
      assetPath: 'builtin://builtin-claw-purple',
      assetUrl: 'data:image/svg+xml;utf8,builtin',
      fileName: 'builtin-claw-purple.svg',
      width: 0,
      height: 0,
      byteSize: 0,
      hotspotX: 0,
      hotspotY: 0,
      createdAt: 'builtin',
      sizePercent: 150,
      baseWidth: 0,
      baseHeight: 0,
      baseHotspotX: 0,
      baseHotspotY: 0
    }],
    petBehavior: {
      grounded: false,
      home: {
        enabled: false,
        radius: 'medium',
        anchor: null
      }
    }
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService: {
      onSay: () => {},
      onAction: () => {},
      onEvent: () => {},
      getAnimations: () => ({ actions: [] }),
      getPreviewAnimations: () => ({ actions: [] }),
      reloadAnimations: () => ({ actions: [] }),
      previewSettings: () => {},
      getSettings: () => currentSettings,
      saveSettings: (settings) => {
        currentSettings = settings
        savedSettings = settings
        return currentSettings
      },
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    },
    cursorAssetService: {
      repairCursor: async () => {
        repairCursorCalls += 1
        throw new Error('builtin override should repair from catalog')
      }
    }
  }))

  const result = await ipcMain.handlers.get(IPC.SETTINGS_GET)()

  assert.ok(savedSettings)
  assert.equal(repairCursorCalls, 0)
  assert.equal(result.customCursors.length, 1)
  assert.equal(result.customCursors[0].id, 'builtin-claw-purple')
  assert.equal(result.customCursors[0].width, 72)
  assert.equal(result.customCursors[0].height, 72)
  assert.equal(result.customCursors[0].hotspotX, 3)
  assert.equal(result.customCursors[0].hotspotY, 3)
  assert.equal(result.customCursors[0].baseWidth, 48)
  assert.equal(result.customCursors[0].baseHeight, 48)
  assert.equal(result.customCursors[0].sizePercent, 150)
})

test('pet cursor focus request focuses the pet window only when it is unfocused', () => {
  const ipcMain = createIpcMainStub()
  const appFocusCalls = []
  let moveTopCalls = 0
  let focusCalls = 0
  let focused = false
  const petWindow = {
    isFocused: () => focused,
    moveTop: () => { moveTopCalls += 1 },
    focus: () => {
      focusCalls += 1
      focused = true
    }
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService: {
      onSay: () => {},
      onAction: () => {},
      onEvent: () => {},
      getAnimations: () => ({ actions: [] }),
      getPreviewAnimations: () => ({ actions: [] }),
      reloadAnimations: () => ({ actions: [] }),
      previewSettings: () => {},
      getSettings: () => ({}),
      saveSettings: (settings) => settings,
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    },
    cursorAssetService: {
      deleteAssets: () => {}
    },
    browserWindowService: {
      fromWebContents: () => petWindow
    },
    appService: {
      focus: (options) => appFocusCalls.push(options)
    }
  }))

  ipcMain.listeners.get(IPC.PET_REQUEST_FOCUS_FOR_CURSOR)({ sender: { id: 'pet-web-contents' } })
  ipcMain.listeners.get(IPC.PET_REQUEST_FOCUS_FOR_CURSOR)({ sender: { id: 'pet-web-contents' } })

  assert.equal(moveTopCalls, 1)
  assert.deepEqual(appFocusCalls, [{ steal: true }])
  assert.equal(focusCalls, 1)
})


test('settings:import-cursor only offers PNG and WEBP files in the picker', async () => {
  const ipcMain = createIpcMainStub()
  let dialogOptions = null

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService: {
      onSay: () => {},
      onAction: () => {},
      onEvent: () => {},
      getAnimations: () => ({ actions: [] }),
      getPreviewAnimations: () => ({ actions: [] }),
      reloadAnimations: () => ({ actions: [] }),
      previewSettings: () => {},
      getSettings: () => ({}),
      saveSettings: (settings) => settings,
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    },
    cursorAssetService: {
      importCursor: async () => ({})
    },
    dialogService: {
      showOpenDialog: async (_parentWindow, options) => {
        dialogOptions = options || _parentWindow
        return { canceled: true, filePaths: [] }
      }
    }
  }))

  const result = await ipcMain.handlers.get(IPC.SETTINGS_IMPORT_CURSOR)({})

  assert.deepEqual(result, { canceled: true })
  assert.deepEqual(dialogOptions.filters, [{ name: 'Cursor Images', extensions: ['png', 'webp'] }])
})

test('settings:preview-scale lets the renderer drive viewport resizing', () => {
  const ipcMain = createIpcMainStub()
  const previews = []
  const scaleCalls = []
  const sentMessages = []
  const petWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => sentMessages.push({ channel, payload })
    }
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    getPetWindow: () => petWindow,
    applyWindowScale: (targetWindow, scale) => scaleCalls.push({ targetWindow, scale }),
    petService: {
      onSay: () => {},
      onAction: () => {},
      onEvent: () => {},
      getAnimations: () => ({ actions: [] }),
      getPreviewAnimations: () => ({ actions: [] }),
      reloadAnimations: () => ({ actions: [] }),
      previewSettings: (settings) => previews.push(settings),
      getSettings: () => ({}),
      saveSettings: (settings) => settings,
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    },
    cursorAssetService: {}
  }))

  ipcMain.listeners.get(IPC.SETTINGS_PREVIEW_SCALE)(null, 1.25)

  assert.deepEqual(previews, [{ scale: 1.25 }])
  assert.deepEqual(scaleCalls, [])
  assert.deepEqual(sentMessages, [{ channel: IPC.SETTINGS_CHANGED, payload: { scale: 1.25 } }])
})

test('settings:save lets the renderer apply saved scale through the active viewport', async () => {
  const ipcMain = createIpcMainStub()
  const scaleCalls = []
  const sentMessages = []
  const petWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 150, height: 150 }),
    webContents: {
      send: (channel, payload) => sentMessages.push({ channel, payload })
    }
  }
  let currentSettings = {
    scale: 1,
    walkSpeed: 2,
    walkDuration: 15000,
    bubbleDuration: 1300,
    menuPosition: 'auto',
    autoStart: false,
    selectedCursorId: 'system',
    customCursor: {
      enabled: false,
      assetPath: '',
      assetUrl: '',
      fileName: '',
      hotspotX: 0,
      hotspotY: 0
    },
    customCursors: [],
    petBehavior: {
      grounded: false,
      home: {
        enabled: false,
        radius: 'medium',
        anchor: null
      }
    }
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    getPetWindow: () => petWindow,
    applyWindowScale: (targetWindow, scale) => scaleCalls.push({ targetWindow, scale }),
    petService: {
      onSay: () => {},
      onAction: () => {},
      onEvent: () => {},
      getAnimations: () => ({ actions: [] }),
      getPreviewAnimations: () => ({ actions: [] }),
      reloadAnimations: () => ({ actions: [] }),
      previewSettings: () => {},
      getSettings: () => currentSettings,
      saveSettings: (settings) => {
        currentSettings = settings
        return currentSettings
      },
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    },
    cursorAssetService: {}
  }))

  const result = await ipcMain.handlers.get(IPC.SETTINGS_SAVE)(null, { scale: 1.25 })

  assert.equal(result.scale, 1.25)
  assert.deepEqual(scaleCalls, [])
  assert.equal(sentMessages.at(-1).channel, IPC.SETTINGS_CHANGED)
  assert.equal(sentMessages.at(-1).payload.scale, 1.25)
})
