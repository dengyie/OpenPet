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

const createRequiredServices = ({ ipcMainService, petService, cursorAssetService, dialogService }) => ({
  getPetWindow: () => null,
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
  applyWindowScale: () => {},
  applyPetViewport: () => {},
  clampToWorkArea: (_win, x, y) => ({ x, y }),
  getMovementState: () => null,
  createSettingsWindow: () => {},
  dialogService: dialogService || {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  },
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
