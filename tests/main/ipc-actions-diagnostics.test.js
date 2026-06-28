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
    getAnimations: () => ({ actions: [] }),
    getPreviewAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'wave',
      actions: [
        { id: 'idle', label: 'Idle', kind: 'idle' },
        { id: 'wave', label: 'Wave', kind: 'custom' }
      ],
      triggerRules: [],
      triggerProposalInbox: []
    }),
    reloadAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'wave',
      actions: [
        { id: 'idle', label: 'Idle', kind: 'idle' },
        { id: 'wave', label: 'Wave', kind: 'custom' }
      ],
      triggerRules: [],
      triggerProposalInbox: []
    }),
    getSettings: () => ({ localHttp: {}, menuPosition: 'auto' }),
    saveSettings: (settings) => settings,
    previewSettings: () => {},
    say: (payload) => payload,
    playAction: (payload) => payload,
    setEvent: (payload) => payload
  },
  petPackService: {
    listPacks: () => ({ activePackId: 'legacy-cat', packs: [] }),
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

test('actions:get returns trigger runtime diagnostics alongside the actions config view', async () => {
  const ipcMain = createIpcMainStub()
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: { fromWebContents: () => null },
    app: { quit: () => {} },
    dialog: {},
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices(),
    ipcMainService: ipcMain,
    triggerRuleRuntimeService: {
      getDiagnostics: () => ({
        currentState: { actionId: 'idle' },
        decisions: [
          {
            ruleId: 'rule:event:wave:1',
            triggerType: 'event',
            outcome: 'matched',
            reason: 'rule matched',
            actionId: 'wave',
            binding: 'plugin:event',
            source: 'plugin:test'
          }
        ]
      })
    }
  })

  const result = await ipcMain.handlers.get(IPC.ACTIONS_GET)()

  assert.deepEqual(result.triggerRuntimeDiagnostics, {
    currentState: { actionId: 'idle' },
    decisions: [
      {
        ruleId: 'rule:event:wave:1',
        triggerType: 'event',
        outcome: 'matched',
        reason: 'rule matched',
        actionId: 'wave',
        binding: 'plugin:event',
        source: 'plugin:test'
      }
    ]
  })
})

test('actions:save-config returns animations with trigger runtime diagnostics after host rule edits', async () => {
  const ipcMain = createIpcMainStub()
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: { fromWebContents: () => null },
    app: { quit: () => {} },
    dialog: {},
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices(),
    ipcMainService: ipcMain,
    triggerRuleRuntimeService: {
      refresh: () => ({
        currentState: { actionId: 'idle' },
        decisions: []
      }),
      getDiagnostics: () => ({
        currentState: { actionId: 'idle' },
        decisions: [
          {
            ruleId: 'rule:state:wave:1',
            triggerType: 'state',
            outcome: 'skipped',
            reason: 'binding mismatch',
            actionId: 'wave',
            binding: 'working',
            source: 'idle'
          }
        ]
      })
    }
  })

  const result = await ipcMain.handlers.get(IPC.ACTIONS_SAVE_CONFIG)(null, {
    defaultAction: 'idle',
    clickAction: 'wave',
    triggerRules: [
      {
        id: 'rule:state:wave:1',
        type: 'state',
        actionId: 'wave',
        enabled: true,
        binding: 'working',
        intervalMs: 0,
        notes: '',
        sourcePluginId: '',
        sourceRunId: '',
        sourceCommandId: '',
        createdAt: '2026-06-29T08:00:00.000Z',
        updatedAt: '2026-06-29T08:00:00.000Z'
      }
    ]
  })

  assert.deepEqual(result.animations.triggerRuntimeDiagnostics, {
    currentState: { actionId: 'idle' },
    decisions: [
      {
        ruleId: 'rule:state:wave:1',
        triggerType: 'state',
        outcome: 'skipped',
        reason: 'binding mismatch',
        actionId: 'wave',
        binding: 'working',
        source: 'idle'
      }
    ]
  })
})

test('pet-packs:set-active returns animations with trigger runtime diagnostics for the next active pack', async () => {
  const ipcMain = createIpcMainStub()
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: { fromWebContents: () => null },
    app: { quit: () => {} },
    dialog: {},
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices({
      petPackService: {
        listPacks: () => ({
          activePackId: 'citrus-cat',
          packs: [{
            id: 'citrus-cat',
            displayName: 'Citrus Cat',
            version: '1.2.0',
            source: 'local',
            rootPath: '/demo/pet-packs/citrus-cat',
            active: true,
            actionCount: 4,
            defaultAction: 'idle',
            clickAction: 'wave'
          }]
        }),
        setActivePack: () => ({
          ok: true,
          pack: {
            id: 'citrus-cat',
            displayName: 'Citrus Cat'
          }
        }),
        inspectPackSource: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        importPack: () => ({ ok: true }),
        exportPack: () => ({ ok: true }),
        removePack: () => ({ ok: true })
      }
    }),
    ipcMainService: ipcMain,
    triggerRuleRuntimeService: {
      refresh: () => ({
        currentState: { actionId: 'idle' },
        decisions: []
      }),
      getDiagnostics: () => ({
        currentState: { actionId: 'idle' },
        decisions: [
          {
            ruleId: 'rule:event:wave:1',
            triggerType: 'event',
            outcome: 'matched',
            reason: 'rule matched',
            actionId: 'wave',
            binding: 'plugin:event',
            source: 'plugin:test'
          }
        ]
      })
    }
  })

  const result = await ipcMain.handlers.get(IPC.PET_PACKS_SET_ACTIVE)(null, { packId: 'citrus-cat' })

  assert.deepEqual(result.animations.triggerRuntimeDiagnostics, {
    currentState: { actionId: 'idle' },
    decisions: [
      {
        ruleId: 'rule:event:wave:1',
        triggerType: 'event',
        outcome: 'matched',
        reason: 'rule matched',
        actionId: 'wave',
        binding: 'plugin:event',
        source: 'plugin:test'
      }
    ]
  })
})
