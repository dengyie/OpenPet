const test = require('node:test')
const assert = require('node:assert/strict')

const { IPC } = require('../../src/shared/ipc-channels')
const { registerIpcHandlers } = require('../../src/main/ipc')
const { registerCursorRepair } = require('../../src/main/bootstrap/startup-side-effects')
const { createSettingsHostEffect } = require('../../src/main/settings-host-effects')

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
  systemCursorService,
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
  actionImportService: {
    inspectActionFrames: () => ({ inspection: { valid: true } }),
    importActionFrames: () => ({ ok: true }),
    updateActionConfig: (payload) => payload,
    deleteAction: () => ({ ok: true })
  },
  cursorAssetService,
  systemCursorService,
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

const createCursorSettingsFixture = ({ scope = 'openpet' } = {}) => ({
  scale: 1,
  walkSpeed: 2,
  walkDuration: 15000,
  bubbleDuration: 1300,
  menuPosition: 'auto',
  autoStart: false,
  selectedCursorId: 'cursor-system-test',
  customCursorScope: scope,
  customCursor: {
    enabled: true,
    assetPath: '/tmp/cursor-system-test.png',
    assetUrl: 'file:///tmp/cursor-system-test.png',
    fileName: 'cursor-system-test.png',
    width: 32,
    height: 32,
    hotspotX: 4,
    hotspotY: 5
  },
  customCursors: [{
    id: 'cursor-system-test',
    type: 'custom',
    source: 'uploaded',
    name: 'System Test',
    assetPath: '/tmp/cursor-system-test.png',
    assetUrl: 'file:///tmp/cursor-system-test.png',
    fileName: 'cursor-system-test.png',
    width: 32,
    height: 32,
    byteSize: 100,
    hotspotX: 4,
    hotspotY: 5,
    createdAt: '2026-07-10T00:00:00.000Z'
  }],
  petBehavior: {
    grounded: false,
    home: { enabled: false, radius: 'medium', anchor: null }
  },
  petBubbleChat: { enabled: true, autoPopup: true, autoHide: true, pinOnInteraction: true }
})

const createCursorPetService = (initialSettings, onSave = () => {}, onApply = () => {}) => {
  let currentSettings = initialSettings
  const saveSettings = (settings) => {
    onSave(settings)
    currentSettings = settings
    return currentSettings
  }
  const applySettings = (settings) => {
    onApply(settings)
    currentSettings = settings
    return currentSettings
  }
  return {
    onSay: () => {},
    onAction: () => {},
    onEvent: () => {},
    getAnimations: () => ({ actions: [] }),
    getPreviewAnimations: () => ({ actions: [] }),
    reloadAnimations: () => ({ actions: [] }),
    previewSettings: () => {},
    getSettings: () => currentSettings,
    saveSettings,
    applySettings,
    updateSettings: (updater) => saveSettings(updater(currentSettings)),
    say: (payload) => payload,
    playAction: (payload) => payload,
    setEvent: (payload) => payload
  }
}

test('settings host effect activates whole-computer cursor before applying system scope', async () => {
  const ipcMain = createIpcMainStub()
  const order = []
  let saveCalls = 0
  const petService = createCursorPetService(createCursorSettingsFixture(), (settings) => {
    saveCalls += 1
    order.push(`save:${settings.customCursorScope}`)
  }, (settings) => {
    order.push(`apply:${settings.customCursorScope}`)
  })
  let active = false
  const systemCursorService = {
    sync: async (settings) => {
      order.push(`sync:${settings.customCursorScope}`)
      active = settings.customCursorScope === 'system'
    },
    getStatus: () => ({ supported: true, platform: 'darwin', active, helperPid: active ? 88 : 0 })
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService,
    cursorAssetService: {},
    systemCursorService
  }))

  const previousSettings = petService.getSettings()
  const result = await createSettingsHostEffect({ petService, systemCursorService })({
    settings: { ...previousSettings, customCursorScope: 'system' },
    previousSettings,
    version: 0
  })

  assert.deepEqual(order, ['sync:system', 'apply:system'])
  assert.equal(saveCalls, 0)
  assert.equal(result.customCursorScope, 'system')
  assert.deepEqual(systemCursorService.getStatus(), {
    supported: true,
    platform: 'darwin',
    active: true,
    helperPid: 88
  })
})

test('settings host effects preserve independent overlapping field updates', async () => {
  const ipcMain = createIpcMainStub()
  const petService = createCursorPetService(createCursorSettingsFixture())
  let releaseFirstSync
  let syncCalls = 0
  const systemCursorService = {
    // 第一次保存挂起在系统指针同步上，制造与第二次保存的交错窗口。
    sync: () => {
      syncCalls += 1
      if (syncCalls === 1) return new Promise((resolve) => { releaseFirstSync = resolve })
      return Promise.resolve()
    },
    getStatus: () => ({ supported: true, platform: 'darwin', active: false, helperPid: 0 })
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService,
    cursorAssetService: {},
    systemCursorService
  }))

  const apply = createSettingsHostEffect({ petService, systemCursorService })
  const firstSave = apply({ settings: { ...petService.getSettings(), scale: 1.5 }, previousSettings: petService.getSettings(), version: 0 })
  releaseFirstSync()
  await firstSave
  await apply({ settings: { ...petService.getSettings(), walkSpeed: 3 }, previousSettings: petService.getSettings(), version: 0 })

  // 旧实现基于 await 之前的快照整体覆盖，会把 walkSpeed 冲回 2。
  const finalSettings = petService.getSettings()
  assert.equal(finalSettings.scale, 1.5)
  assert.equal(finalSettings.walkSpeed, 3)
})

test('settings host effects serialize concurrent snapshots without losing the later field update', async () => {
  let releaseFirstSync
  let markFirstSync
  const firstSyncStarted = new Promise((resolve) => { markFirstSync = resolve })
  let currentSettings = createCursorSettingsFixture()
  const petService = {
    getSettings: () => currentSettings,
    applySettings: (settings) => { currentSettings = settings; return settings }
  }
  let syncCalls = 0
  const systemCursorService = {
    sync: () => {
      syncCalls += 1
      if (syncCalls === 1) return new Promise((resolve) => { releaseFirstSync = resolve; markFirstSync() })
      return Promise.resolve()
    }
  }
  const apply = createSettingsHostEffect({ petService, systemCursorService })
  const firstPrevious = petService.getSettings()
  const first = apply({ settings: { ...firstPrevious, scale: 1.5 }, previousSettings: firstPrevious, version: 1 })
  await firstSyncStarted
  const secondPrevious = petService.getSettings()
  const second = apply({ settings: { ...secondPrevious, walkSpeed: 3 }, previousSettings: secondPrevious, version: 2 })
  releaseFirstSync()
  await Promise.all([first, second])
  assert.equal(currentSettings.scale, 1.5)
  assert.equal(currentSettings.walkSpeed, 3)
})

test('settings host effect leaves scope unchanged when system cursor activation fails', async () => {
  const ipcMain = createIpcMainStub()
  let saveCalls = 0
  const petService = createCursorPetService(createCursorSettingsFixture(), () => { saveCalls += 1 })
  const systemCursorService = {
    sync: async () => { throw new Error('helper failed') },
    getStatus: () => ({ supported: true, platform: 'darwin', active: false, helperPid: 0 })
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService,
    cursorAssetService: {},
    systemCursorService
  }))

  const previousSettings = petService.getSettings()
  await assert.rejects(createSettingsHostEffect({ petService, systemCursorService })({
    settings: { ...previousSettings, customCursorScope: 'system' }, previousSettings, version: 0
  }), /helper failed/)
  assert.equal(saveCalls, 0)
  assert.equal(petService.getSettings().customCursorScope, 'openpet')
})

test('settings host effect rolls the native cursor back when applying settings fails', async () => {
  const ipcMain = createIpcMainStub()
  const syncScopes = []
  const initialSettings = createCursorSettingsFixture()
  const petService = createCursorPetService(initialSettings, () => {}, () => { throw new Error('disk failed') })
  const systemCursorService = {
    sync: async (settings) => { syncScopes.push(settings.customCursorScope) },
    getStatus: () => ({ supported: true, platform: 'darwin', active: false, helperPid: 0 })
  }

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService,
    cursorAssetService: {},
    systemCursorService
  }))

  const previousSettings = petService.getSettings()
  await assert.rejects(createSettingsHostEffect({ petService, systemCursorService })({
    settings: { ...previousSettings, customCursorScope: 'system' }, previousSettings, version: 0
  }), /disk failed/)
  assert.deepEqual(syncScopes, ['system', 'openpet'])
})

test('settings host effect removes orphaned cursor assets after replacing a custom cursor', async () => {
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
      updateSettings: (updater) => {
        currentSettings = updater(currentSettings)
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

  const previousSettings = currentSettings
  const result = await createSettingsHostEffect({
    petService: {
      getSettings: () => currentSettings,
      applySettings: (settings) => { currentSettings = settings; return settings }
    }, cursorAssetService: { deleteAssets: (paths) => deletedPaths.push(...paths) }
  })({
    settings: { ...currentSettings, selectedCursorId: 'cursor-new',
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
    }] }, previousSettings, version: 0
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

  const petService = {
      onSay: () => {},
      onAction: () => {},
      onEvent: () => {},
      getAnimations: () => ({ actions: [] }),
      getPreviewAnimations: () => ({ actions: [] }),
      reloadAnimations: () => ({ actions: [] }),
      previewSettings: () => {},
      getSettings: () => currentSettings,
      saveSettings: (settings) => { currentSettings = settings; savedSettings = settings; return currentSettings },
      updateSettings: (updater) => { currentSettings = updater(currentSettings); savedSettings = currentSettings; return currentSettings },
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    }
  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService,
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

  const repairPromise = registerCursorRepair({ cursorAssetService: {
    repairCursor: async () => ({
      enabled: true,
      assetPath: '/tmp/cursor-repaired.png', assetUrl: 'file:///tmp/cursor-repaired.png', fileName: 'cursor-repaired.png',
      width: 64, height: 64, hotspotX: 16, hotspotY: 12
    })
  }, petService, appLogService: { record: () => {} } })
  await repairPromise
  const result = petService.getSettings()

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

test('settings:get cursor repair preserves edits made to the same cursor while repair is pending', async () => {
  const ipcMain = createIpcMainStub()
  let releaseRepair
  let markRepairStarted
  const repairStarted = new Promise((resolve) => { markRepairStarted = resolve })
  let currentSettings = {
    ...createCursorSettingsFixture(),
    selectedCursorId: 'custom-pending',
    customCursors: [{
      id: 'custom-pending',
      type: 'custom',
      source: 'uploaded',
      name: 'Before repair',
      assetPath: '/tmp/pending.png',
      assetUrl: 'file:///tmp/pending.png',
      fileName: 'pending.png',
      width: 0,
      height: 0,
      byteSize: 123,
      hotspotX: 0,
      hotspotY: 0,
      createdAt: '2026-07-02T00:00:00.000Z',
      sizePercent: 100,
      baseWidth: 0,
      baseHeight: 0,
      baseHotspotX: 0,
      baseHotspotY: 0
    }]
  }
  const petService = createCursorPetService(currentSettings, (settings) => {
    currentSettings = settings
  })

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService,
    cursorAssetService: {
      repairCursor: async () => {
        markRepairStarted()
        return await new Promise((resolve) => { releaseRepair = resolve })
      }
    }
  }))

  const pendingGet = registerCursorRepair({ cursorAssetService: {
    repairCursor: async () => {
      markRepairStarted()
      return await new Promise((resolve) => { releaseRepair = resolve })
    }
  }, petService, appLogService: { record: () => {} } })
  await repairStarted
  petService.updateSettings((latest) => ({
    ...latest,
    customCursors: latest.customCursors.map((cursor) => cursor.id === 'custom-pending'
      ? { ...cursor, name: 'Edited while repairing', sizePercent: 200 }
      : cursor)
  }))
  releaseRepair({
    enabled: true,
    assetPath: '/tmp/repaired.png',
    assetUrl: 'file:///tmp/repaired.png',
    fileName: 'repaired.png',
    width: 64,
    height: 64,
    hotspotX: 16,
    hotspotY: 12
  })

  await pendingGet
  const repaired = petService.getSettings().customCursors.find((cursor) => cursor.id === 'custom-pending')
  assert.equal(repaired.name, 'Edited while repairing')
  assert.equal(repaired.sizePercent, 200)
  assert.equal(repaired.baseWidth, 64)
  assert.equal(repaired.baseHeight, 64)
  assert.equal(repaired.width, 128)
  assert.equal(repaired.height, 128)
  assert.equal(repaired.hotspotX, 32)
  assert.equal(repaired.hotspotY, 24)
})

test('settings:get cursor repair does not overwrite a replacement asset with stale repair output', async () => {
  const ipcMain = createIpcMainStub()
  let releaseRepair
  let markRepairStarted
  const repairStarted = new Promise((resolve) => { markRepairStarted = resolve })
  const petService = createCursorPetService({
    ...createCursorSettingsFixture(),
    selectedCursorId: 'custom-pending',
    customCursors: [{
      id: 'custom-pending',
      type: 'custom',
      source: 'uploaded',
      name: 'Original asset',
      assetPath: '/tmp/original.png',
      assetUrl: 'file:///tmp/original.png',
      fileName: 'original.png',
      width: 0,
      height: 0,
      byteSize: 123,
      hotspotX: 0,
      hotspotY: 0,
      createdAt: '2026-07-02T00:00:00.000Z',
      sizePercent: 100,
      baseWidth: 0,
      baseHeight: 0,
      baseHotspotX: 0,
      baseHotspotY: 0
    }]
  })

  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService,
    cursorAssetService: {
      repairCursor: async () => {
        markRepairStarted()
        return await new Promise((resolve) => { releaseRepair = resolve })
      }
    }
  }))

  const pendingGet = registerCursorRepair({ cursorAssetService: {
    repairCursor: async () => {
      markRepairStarted()
      return await new Promise((resolve) => { releaseRepair = resolve })
    }
  }, petService, appLogService: { record: () => {} } })
  await repairStarted
  petService.updateSettings((latest) => ({
    ...latest,
    customCursors: latest.customCursors.map((cursor) => cursor.id === 'custom-pending'
      ? {
          ...cursor,
          name: 'Replacement asset',
          assetPath: '/tmp/replacement.png',
          assetUrl: 'file:///tmp/replacement.png',
          fileName: 'replacement.png'
        }
      : cursor)
  }))
  releaseRepair({
    enabled: true,
    assetPath: '/tmp/stale-repair.png',
    assetUrl: 'file:///tmp/stale-repair.png',
    fileName: 'stale-repair.png',
    width: 64,
    height: 64,
    hotspotX: 16,
    hotspotY: 12
  })

  await pendingGet
  const replacement = petService.getSettings().customCursors.find((cursor) => cursor.id === 'custom-pending')
  assert.equal(replacement.name, 'Replacement asset')
  assert.equal(replacement.assetPath, '/tmp/replacement.png')
  assert.equal(replacement.assetUrl, 'file:///tmp/replacement.png')
  assert.equal(replacement.fileName, 'replacement.png')
  assert.equal(replacement.width, 0)
  assert.equal(replacement.height, 0)
})

test('settings cursor repair persists repaired authority through the backend callback', async () => {
  let settings = {
    ...createCursorSettingsFixture(),
    selectedCursorId: 'custom-pending',
    customCursors: [{ id: 'custom-pending', source: 'uploaded', assetPath: '/tmp/pending.png', assetUrl: 'file:///tmp/pending.png', fileName: 'pending.png', width: 0, height: 0, baseWidth: 0, baseHeight: 0, hotspotX: 0, hotspotY: 0 }],
    customCursor: { enabled: true, assetPath: '/tmp/pending.png', assetUrl: 'file:///tmp/pending.png', width: 0, height: 0 }
  }
  const persisted = []
  const petService = {
    getSettings: () => settings,
    applySettings: (next) => { settings = next; return next }
  }
  await registerCursorRepair({
    cursorAssetService: { repairCursor: async (cursor) => ({ ...cursor, width: 64, height: 64, hotspotX: 16, hotspotY: 16, baseWidth: 64, baseHeight: 64 }) },
    petService,
    persistCanonicalSettings: async (input) => persisted.push(input),
    appLogService: { record: () => {} }
  })
  assert.deepEqual(persisted[0].paths, ['customCursor', 'customCursors'])
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

  const petService = {
      onSay: () => {},
      onAction: () => {},
      onEvent: () => {},
      getAnimations: () => ({ actions: [] }),
      getPreviewAnimations: () => ({ actions: [] }),
      reloadAnimations: () => ({ actions: [] }),
      previewSettings: () => {},
      getSettings: () => currentSettings,
      saveSettings: (settings) => { currentSettings = settings; savedSettings = settings; return currentSettings },
      updateSettings: (updater) => { currentSettings = updater(currentSettings); savedSettings = currentSettings; return currentSettings },
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    }
  registerIpcHandlers(createRequiredServices({
    ipcMainService: ipcMain,
    petService,
    cursorAssetService: {
      repairCursor: async () => {
        repairCursorCalls += 1
        throw new Error('builtin override should repair from catalog')
      }
    }
  }))

  await registerCursorRepair({ cursorAssetService: {
    repairCursor: async () => {
      repairCursorCalls += 1
      throw new Error('builtin override should repair from catalog')
    }
  }, petService, appLogService: { record: () => {} } })
  const result = petService.getSettings()

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
      updateSettings: (updater) => updater({}),
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
      updateSettings: (updater) => updater({}),
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
      updateSettings: (updater) => updater({}),
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

test('settings host effect applies saved scale without using retired native IPC', async () => {
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
      applySettings: (settings) => {
        currentSettings = settings
        return currentSettings
      },
      updateSettings: (updater) => {
        currentSettings = updater(currentSettings)
        return currentSettings
      },
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    },
    cursorAssetService: {}
  }))

  const previousSettings = structuredClone(currentSettings)
  const result = await createSettingsHostEffect({
    getPetWindow: () => petWindow,
    petService: {
      applySettings: (settings) => { currentSettings = settings; return settings }
    },
    systemCursorService: { sync: async () => {} },
    applyWindowScale: (targetWindow, scale) => scaleCalls.push({ targetWindow, scale }),
    sendToPetRenderer: (settings) => sentMessages.push({ channel: IPC.SETTINGS_CHANGED, payload: settings })
  })({ settings: { ...previousSettings, scale: 1.25 }, previousSettings, version: 0 })

  assert.equal(result.scale, 1.25)
  assert.deepEqual(scaleCalls, [{ targetWindow: petWindow, scale: 1.25 }])
  assert.equal(sentMessages.at(-1).channel, IPC.SETTINGS_CHANGED)
  assert.equal(sentMessages.at(-1).payload.scale, 1.25)
})
