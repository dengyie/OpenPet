const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const { IPC } = require('../../src/shared/ipc-channels')
const { createPluginInstallService } = require('../../src/main/services/plugin-install-service')
const { registerIpcHandlers } = require('../../src/main/ipc')

const createSettingsService = () => {
  let current = { plugins: { enabled: {}, config: {}, storage: {}, installed: {} } }
  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const createSignedPluginPackageZip = ({ pluginId = 'focus-timer' } = {}) => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ipc-plugin-src-'))
  const zipRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ipc-plugin-zip-'))
  fs.writeFileSync(path.join(sourceRoot, 'plugin.json'), JSON.stringify({
    id: pluginId,
    name: 'Focus Timer',
    version: '1.0.0',
    main: 'index.js',
    permissions: ['pet:say'],
    commands: [{ id: 'start', title: 'Start focus' }]
  }, null, 2))
  fs.writeFileSync(path.join(sourceRoot, 'index.js'), 'module.exports = function activate() { return {} }\n')
  fs.writeFileSync(path.join(sourceRoot, 'signature.json'), JSON.stringify({
    algorithm: 'sha256-test',
    signer: 'openpet-labs',
    value: 'local-test-signature',
    manifestSha256: sha256(path.join(sourceRoot, 'plugin.json')),
    files: {
      'plugin.json': sha256(path.join(sourceRoot, 'plugin.json')),
      'index.js': sha256(path.join(sourceRoot, 'index.js'))
    }
  }, null, 2))
  const zipPath = path.join(zipRoot, `${pluginId}.openpet-plugin.zip`)
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: sourceRoot })
  return { zipPath, sourceRoot, zipRoot }
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

const createRequiredServices = ({ pluginInstallService, pluginService, dialogService }) => ({
  getPetWindow: () => null,
  petService: {
    onSay: () => {},
    onAction: () => {},
    onEvent: () => {},
    getAnimations: () => ({ actions: [] }),
    getPreviewAnimations: () => ({ actions: [] }),
    reloadAnimations: () => ({ actions: [] }),
    getSettings: () => ({ localHttp: {} }),
    saveSettings: (settings) => settings,
    previewSettings: () => {},
    say: (payload) => payload,
    playAction: (payload) => payload,
    setEvent: (payload) => payload
  },
  petPackService: {
    listPacks: () => [],
    inspectPackDirectory: () => ({}),
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
  pluginService,
  pluginInstallService,
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
    start: async (config) => ({ enabled: true, host: config.host || '127.0.0.1', port: config.port || 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } }),
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
  applyWindowScale: () => {},
  clampToWorkArea: (_win, x, y) => ({ x, y }),
  getMovementState: () => null,
  createSettingsWindow: () => {},
  dialogService
})

test('service:get-status returns Control Center service status shape', async () => {
  const ipcMain = createIpcMainStub()

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    petService: {
      ...createRequiredServices({
        pluginInstallService: {},
        pluginService: { listPlugins: () => [] },
        dialogService: {}
      }).petService,
      getSettings: () => ({
        localHttp: {
          enabled: true,
          port: '4317',
          token: 'demo-token'
        }
      })
    },
    localHttpService: {
      getStatus: () => ({ enabled: true, host: 'localhost', port: '4317', mcp: { activeSessions: '1', sessionTtlMs: '5000' } }),
      getLogs: () => [],
      exportLogs: () => '',
      clearLogs: () => [],
      start: async () => ({}),
      stop: async () => ({}),
      revokeMcpSessions: () => ({ activeSessions: 0, sessionTtlMs: 5000 })
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.SERVICE_GET_STATUS)()

  assert.deepEqual(result, {
    config: {
      enabled: true,
      host: '127.0.0.1',
      port: 4317,
      token: 'demo-token',
      logs: []
    },
    runtime: {
      enabled: true,
      host: 'localhost',
      port: 4317,
      mcp: { activeSessions: 1, sessionTtlMs: 5000 }
    }
  })
})

test('catalog blocklist handlers return catalog plus updated blocklist view result', async () => {
  const ipcMain = createIpcMainStub()
  const catalog = {
    schemaVersion: 1,
    updatedAt: '2026-06-17T00:00:00.000Z',
    feedbackUrl: '',
    localBlocklist: { pluginIds: ['blocked-plugin'], packIds: [], sha256: [] },
    catalogBlocklist: { pluginIds: [], packIds: [], sha256: [] },
    blocklist: { pluginIds: ['blocked-plugin'], packIds: [], sha256: [] },
    plugins: [],
    petPacks: []
  }
  const blocklist = { pluginIds: ['blocked-plugin'], packIds: [], sha256: [] }
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    catalogService: {
      listCatalog: () => catalog,
      prepareInstall: () => ({ ok: true }),
      installSelection: () => ({ ok: true }),
      clearSelection: () => ({ ok: true }),
      addBlocklistEntry: (payload) => {
        calls.push(['add', payload])
        return blocklist
      },
      removeBlocklistEntry: (payload) => {
        calls.push(['remove', payload])
        return blocklist
      }
    },
    ipcMainService: ipcMain
  })

  const payload = { type: 'pluginId', value: 'blocked-plugin' }
  const addResult = await ipcMain.handlers.get(IPC.CATALOG_ADD_BLOCKLIST)(null, payload)
  const removeResult = await ipcMain.handlers.get(IPC.CATALOG_REMOVE_BLOCKLIST)(null, payload)

  assert.deepEqual(addResult, { catalog, blocklist })
  assert.deepEqual(removeResult, { catalog, blocklist })
  assert.deepEqual(calls, [['add', payload], ['remove', payload]])
})

test('plugin mutation handlers return plugin mutation result with refreshed plugin list', async () => {
  const ipcMain = createIpcMainStub()
  const plugins = [{ id: 'focus-timer', enabled: false }]
  const calls = []

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: (selectionId) => {
          calls.push(['install', selectionId])
          return { ok: true, pluginId: 'focus-timer', installMode: 'install', disabled: true }
        },
        updatePlugin: (selectionId) => {
          calls.push(['update', selectionId])
          return { ok: true, pluginId: 'focus-timer', installMode: 'update', disabled: true }
        },
        uninstallPlugin: (pluginId, options) => {
          calls.push(['uninstall', pluginId, options])
          return { ok: true, pluginId, storageRemoved: Boolean(options.removeStorage) }
        }
      },
      pluginService: { listPlugins: () => plugins },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    ipcMainService: ipcMain
  })

  const installResult = await ipcMain.handlers.get(IPC.PLUGINS_INSTALL)(null, { selectionId: 'selection-install' })
  const updateResult = await ipcMain.handlers.get(IPC.PLUGINS_UPDATE)(null, { selectionId: 'selection-update' })
  const uninstallResult = await ipcMain.handlers.get(IPC.PLUGINS_UNINSTALL)(null, { pluginId: 'focus-timer', removeStorage: true })

  assert.deepEqual(installResult, {
    ok: true,
    pluginId: 'focus-timer',
    installMode: 'install',
    disabled: true,
    plugins
  })
  assert.deepEqual(updateResult, {
    ok: true,
    pluginId: 'focus-timer',
    installMode: 'update',
    disabled: true,
    plugins
  })
  assert.deepEqual(uninstallResult, {
    ok: true,
    pluginId: 'focus-timer',
    storageRemoved: true,
    plugins
  })
  assert.deepEqual(calls, [
    ['install', 'selection-install'],
    ['update', 'selection-update'],
    ['uninstall', 'focus-timer', { removeStorage: true }]
  ])
})

test('pet-packs:inspect-directory opens native folder or zip picker and delegates selected source', async () => {
  const ipcMain = createIpcMainStub()
  const dialogCalls = []
  const inspectedPaths = []
  const selectedPath = path.join(os.tmpdir(), 'clawd.codex-pet.zip')

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async (options) => {
          dialogCalls.push(options)
          return { canceled: false, filePaths: [selectedPath] }
        }
      }
    }),
    petPackService: {
      listPacks: () => [],
      inspectPackDirectory: () => {
        throw new Error('directory-only inspect should not be called')
      },
      inspectPackSource: (sourcePath) => {
        inspectedPaths.push(sourcePath)
        return { selectionId: 'sel-1', valid: true, pack: { id: 'clawd' } }
      },
      clearPendingSelection: () => ({ ok: true }),
      importPack: () => ({ ok: true }),
      setActivePack: () => ({ ok: true }),
      removePack: () => ({ ok: true })
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PET_PACKS_INSPECT_DIRECTORY)()

  assert.equal(result.canceled, false)
  assert.equal(result.selectionId, 'sel-1')
  assert.deepEqual(inspectedPaths, [selectedPath])
  assert.equal(dialogCalls.length, 1)
  assert.equal(dialogCalls[0].title, '选择 Pet Pack 文件夹或 Codex Pet 包')
  assert.deepEqual(dialogCalls[0].properties, ['openFile', 'openDirectory'])
  assert.deepEqual(dialogCalls[0].filters[0], { name: 'Pet Pack Package', extensions: ['zip'] })
})

test('pet-packs:export opens native output folder picker and delegates selected pack id', async () => {
  const ipcMain = createIpcMainStub()
  const dialogCalls = []
  const exportCalls = []
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ipc-pet-pack-export-'))

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async (options) => {
          dialogCalls.push(options)
          return { canceled: false, filePaths: [outputDir] }
        }
      }
    }),
    petPackService: {
      listPacks: () => [],
      inspectPackDirectory: () => ({}),
      inspectPackSource: () => ({}),
      clearPendingSelection: () => ({ ok: true }),
      importPack: () => ({ ok: true }),
      exportPack: (packId, selectedOutputDir) => {
        exportCalls.push({ packId, selectedOutputDir })
        return {
          packId,
          fileName: `${packId}-1.0.0.openpet-pet.zip`,
          outputPath: path.join(selectedOutputDir, `${packId}-1.0.0.openpet-pet.zip`),
          sha256: 'abc123',
          byteSize: 42
        }
      },
      setActivePack: () => ({ ok: true }),
      removePack: () => ({ ok: true })
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PET_PACKS_EXPORT)(null, { packId: 'exportable-cat' })

  assert.equal(result.canceled, false)
  assert.equal(result.packId, 'exportable-cat')
  assert.equal(result.fileName, 'exportable-cat-1.0.0.openpet-pet.zip')
  assert.deepEqual(exportCalls, [{ packId: 'exportable-cat', selectedOutputDir: outputDir }])
  assert.equal(dialogCalls.length, 1)
  assert.equal(dialogCalls[0].title, '选择 Pet Pack 导出目录')
  assert.deepEqual(dialogCalls[0].properties, ['openDirectory', 'createDirectory'])
})

test('pet-packs:export returns canceled without exporting when output picker is canceled', async () => {
  const ipcMain = createIpcMainStub()

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService: {
        inspectPluginPackage: () => ({}),
        clearPendingSelection: () => ({ ok: true }),
        installPlugin: () => ({ ok: true }),
        updatePlugin: () => ({ ok: true }),
        uninstallPlugin: () => ({ ok: true })
      },
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    }),
    petPackService: {
      listPacks: () => [],
      inspectPackDirectory: () => ({}),
      inspectPackSource: () => ({}),
      clearPendingSelection: () => ({ ok: true }),
      importPack: () => ({ ok: true }),
      exportPack: () => {
        throw new Error('export should not run after cancel')
      },
      setActivePack: () => ({ ok: true }),
      removePack: () => ({ ok: true })
    },
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PET_PACKS_EXPORT)(null, { packId: 'exportable-cat' })

  assert.deepEqual(result, { canceled: true })
})

test('plugins:inspect-package opens native package picker options and returns canceled without inspecting', async () => {
  const ipcMain = createIpcMainStub()
  const dialogCalls = []
  const pluginInstallService = {
    inspectPluginPackage: () => {
      throw new Error('inspect should not be called after cancel')
    },
    clearPendingSelection: () => ({ ok: true }),
    installPlugin: () => ({ ok: true }),
    updatePlugin: () => ({ ok: true }),
    uninstallPlugin: () => ({ ok: true })
  }

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService,
      pluginService: { listPlugins: () => [] },
      dialogService: {
        showOpenDialog: async (options) => {
          dialogCalls.push(options)
          return { canceled: true, filePaths: [] }
        }
      }
    }),
    ipcMainService: ipcMain
  })

  const result = await ipcMain.handlers.get(IPC.PLUGINS_INSPECT_PACKAGE)()

  assert.deepEqual(result, { canceled: true })
  assert.equal(dialogCalls.length, 1)
  assert.equal(dialogCalls[0].title, '选择插件目录或 OpenPet 插件包')
  assert.deepEqual(dialogCalls[0].properties, ['openFile', 'openDirectory'])
  assert.deepEqual(dialogCalls[0].filters[0], { name: 'OpenPet Plugin Package', extensions: ['zip'] })
})

test('plugins:inspect-package and plugins:install handle a selected .openpet-plugin.zip through main-process IPC', async () => {
  const ipcMain = createIpcMainStub()
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ipc-installed-plugins-'))
  const settingsService = createSettingsService()
  const pluginInstallService = createPluginInstallService({ settingsService, pluginDir })
  const { zipPath } = createSignedPluginPackageZip()
  const pluginService = {
    listPlugins: () => [{ id: 'focus-timer', enabled: settingsService.get().plugins.enabled['focus-timer'] }]
  }

  registerIpcHandlers({
    ...createRequiredServices({
      pluginInstallService,
      pluginService,
      dialogService: {
        showOpenDialog: async () => ({ canceled: false, filePaths: [zipPath] })
      }
    }),
    ipcMainService: ipcMain
  })

  const review = await ipcMain.handlers.get(IPC.PLUGINS_INSPECT_PACKAGE)()

  assert.equal(review.canceled, false)
  assert.equal(review.sourceType, 'zip')
  assert.equal(review.installMode, 'install')
  assert.equal(review.plugin.id, 'focus-timer')
  assert.equal(review.signature.status, 'hash-verified')
  assert.deepEqual(review.permissionDiff.permissions.added, ['pet:say'])
  assert.ok(review.selectionId)

  const installResult = ipcMain.handlers.get(IPC.PLUGINS_INSTALL)(null, { selectionId: review.selectionId })

  assert.equal(installResult.ok, true)
  assert.equal(installResult.pluginId, 'focus-timer')
  assert.equal(installResult.disabled, true)
  assert.deepEqual(installResult.plugins, [{ id: 'focus-timer', enabled: false }])
  assert.equal(fs.existsSync(path.join(pluginDir, 'focus-timer', 'plugin.json')), true)
  assert.equal(settingsService.get().plugins.enabled['focus-timer'], false)
  assert.equal(settingsService.get().plugins.installed['focus-timer'].signatureStatus, 'hash-verified')
})
