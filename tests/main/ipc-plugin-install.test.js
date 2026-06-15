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
    clearPendingSelection: () => ({ ok: true }),
    importPack: () => ({ ok: true }),
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
    getStatus: () => ({ running: false }),
    getLogs: () => [],
    exportLogs: () => ({ ok: true }),
    clearLogs: () => ({ ok: true }),
    start: async (config) => ({ running: true, config }),
    stop: async () => ({ running: false }),
    revokeMcpSessions: () => ({ revoked: 0 })
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
