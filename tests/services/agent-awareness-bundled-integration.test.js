const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const { syncBundledPlugins } = require('../../src/main/services/bundled-plugin-sync-service')
const { createPluginService } = require('../../src/main/services/plugin-service')

const pluginId = 'openpet.agent-awareness'
const pluginRoot = path.resolve(__dirname, '../../examples/plugins/agent-awareness')

const createSettingsService = (initialSettings = {}) => {
  let current = {
    ...initialSettings,
    plugins: {
      enabled: {},
      config: {},
      storage: {},
      logs: [],
      installed: {},
      ...(initialSettings.plugins || {})
    }
  }

  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

const createFakeServiceProcess = ({ pid = 4321 } = {}) => {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => true
  return child
}

test('bundled agent-awareness sync stays enabled-by-default, remains stopped on discovery, and requires native approval to start', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-bundled-'))
  const pluginDir = path.join(root, 'plugins')
  const userPluginDir = path.join(pluginDir, 'user-notes')
  const settingsService = createSettingsService()
  const spawned = []
  const child = createFakeServiceProcess()

  fs.mkdirSync(userPluginDir, { recursive: true })
  fs.writeFileSync(path.join(userPluginDir, 'plugin.json'), JSON.stringify({
    id: 'user.notes',
    name: 'User Notes',
    version: '0.0.1',
    entries: {}
  }, null, 2))

  const syncResult = syncBundledPlugins({
    pluginDir,
    bundledPluginDirs: [pluginRoot],
    settingsService
  })

  assert.equal(syncResult.synced.length, 1)
  assert.equal(syncResult.synced[0].pluginId, pluginId)
  assert.equal(fs.existsSync(path.join(pluginDir, pluginId, 'plugin.json')), true)
  assert.equal(fs.existsSync(path.join(userPluginDir, 'plugin.json')), true)
  assert.equal(settingsService.get().plugins.enabled[pluginId], true)
  assert.equal(settingsService.get().plugins.installed[pluginId].managedBy, 'bundled')

  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [pluginDir],
    spawnServiceProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const plugin = service.listPlugins().find((entry) => entry.id === pluginId)
  assert.ok(plugin)
  assert.equal(plugin.source, 'local')
  assert.equal(plugin.enabled, true)
  assert.equal(plugin.requiresNativeExecution, true)
  assert.equal(plugin.nativeExecutionApproved, false)
  assert.equal(plugin.configSchema.title, 'Agent Awareness')
  assert.deepEqual(plugin.config, { autoStartOnCodexSignal: false })
  assert.equal(plugin.entries.services[0].id, 'agent-awareness')
  assert.equal(plugin.entries.services[0].runtime.status, 'stopped')
  assert.equal(spawned.length, 0)

  assert.throws(
    () => service.startService(pluginId, 'agent-awareness'),
    /native execution is not approved/
  )
  assert.equal(spawned.length, 0)

  const approvedView = service.setNativeExecutionApproved(pluginId, true)
  assert.equal(approvedView.nativeExecutionApproved, true)

  const started = await service.startService(pluginId, 'agent-awareness')
  assert.equal(started.ok, true)
  assert.equal(started.runtime.status, 'running')
  assert.equal(spawned.length, 1)
  assert.equal(spawned[0].file, 'node')
  assert.deepEqual(spawned[0].args, ['./service/agent-awareness-service.js'])
  assert.equal(fs.realpathSync(spawned[0].options.cwd), fs.realpathSync(path.join(pluginDir, pluginId)))

  const stopped = service.stopService(pluginId, 'agent-awareness')
  assert.equal(stopped.runtime.status, 'stopping')
  child.emit('exit', 0, 'SIGTERM')
  assert.equal(service.listPlugins().find((entry) => entry.id === pluginId).entries.services[0].runtime.status, 'stopped')
})

test('bundled agent-awareness can opt into Codex-signal auto-start through plugin config', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-bundled-autostart-'))
  const pluginDir = path.join(root, 'plugins')
  const settingsService = createSettingsService()
  const spawned = []
  const child = createFakeServiceProcess()

  syncBundledPlugins({
    pluginDir,
    bundledPluginDirs: [pluginRoot],
    settingsService
  })

  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [pluginDir],
    probeAgentAwarenessActivity: () => ({
      active: true,
      signalSource: 'codex-rollout',
      observedAt: '2026-07-05T10:00:00.000Z'
    }),
    spawnServiceProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  service.setNativeExecutionApproved(pluginId, true)
  service.saveConfig(pluginId, { autoStartOnCodexSignal: true })

  const result = await service.pollAgentAwarenessAutostart()

  assert.equal(result.started, true)
  assert.equal(result.signalSource, 'codex-rollout')
  assert.equal(spawned.length, 1)
})

test('bundled agent-awareness sync restores metadata when the bundled copy already exists unchanged', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-bundled-existing-'))
  const pluginDir = path.join(root, 'plugins')
  const targetDir = path.join(pluginDir, pluginId)
  const settingsService = createSettingsService({
    plugins: {
      enabled: {},
      installed: {}
    }
  })

  fs.mkdirSync(pluginDir, { recursive: true })
  fs.cpSync(pluginRoot, targetDir, { recursive: true })

  const syncResult = syncBundledPlugins({
    pluginDir,
    bundledPluginDirs: [pluginRoot],
    settingsService
  })

  assert.equal(syncResult.synced.length, 0)
  assert.equal(settingsService.get().plugins.enabled[pluginId], true)
  assert.equal(settingsService.get().plugins.installed[pluginId].managedBy, 'bundled')
  assert.equal(settingsService.get().plugins.installed[pluginId].signer, 'openpet')
})

test('bundled agent-awareness sync preserves an explicit disabled setting during metadata refresh', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-bundled-disabled-'))
  const pluginDir = path.join(root, 'plugins')
  const targetDir = path.join(pluginDir, pluginId)
  const settingsService = createSettingsService({
    plugins: {
      enabled: { [pluginId]: false },
      installed: {}
    }
  })

  fs.mkdirSync(pluginDir, { recursive: true })
  fs.cpSync(pluginRoot, targetDir, { recursive: true })

  const syncResult = syncBundledPlugins({
    pluginDir,
    bundledPluginDirs: [pluginRoot],
    settingsService
  })

  assert.equal(syncResult.synced.length, 0)
  assert.equal(settingsService.get().plugins.enabled[pluginId], false)
  assert.equal(settingsService.get().plugins.installed[pluginId].managedBy, 'bundled')
})
