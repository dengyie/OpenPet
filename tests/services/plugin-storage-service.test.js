const test = require('node:test')
const assert = require('node:assert/strict')

const { createSettingsService } = require('../../src/main/services/settings-service')
const { createPluginStorageService } = require('../../src/main/services/plugin-storage-service')

const createStorageService = (initialSettings = {}) => {
  const saved = []
  const settingsService = createSettingsService({
    loadSettings: () => ({
      theme: 'system',
      plugins: {
        enabled: {},
        config: {},
        storage: {},
        logs: [],
        ...initialSettings.plugins
      },
      ...initialSettings
    }),
    saveSettings: (settings) => saved.push(settings)
  })
  return {
    saved,
    settingsService,
    storageService: createPluginStorageService({ settingsService })
  }
}

test('plugin storage service persists enablement config storage and health policies without replacing plugin settings', () => {
  const { settingsService, storageService } = createStorageService({
    plugins: {
      enabled: { existing: true },
      config: { existing: { mode: 'safe' } },
      storage: { existing: { count: 1 } },
      logs: [{ id: 1, timestamp: '2026-06-25T00:00:00.000Z', level: 'info', pluginId: 'existing', commandId: '', message: 'kept' }],
      serviceHealthPolicies: {
        existing: {
          service: { enabled: true, intervalMs: 30000 }
        }
      }
    }
  })

  storageService.saveEnabled('new-plugin', true)
  storageService.saveConfig('new-plugin', { greeting: 'hello' })
  storageService.savePluginStorage('new-plugin', { count: 2 })
  storageService.saveServiceHealthPolicy('new-plugin', 'worker', { enabled: true, intervalMs: 45000 })

  assert.deepEqual(settingsService.get().plugins, {
    enabled: { existing: true, 'new-plugin': true },
    config: { existing: { mode: 'safe' }, 'new-plugin': { greeting: 'hello' } },
    storage: { existing: { count: 1 }, 'new-plugin': { count: 2 } },
    logs: [{ id: 1, timestamp: '2026-06-25T00:00:00.000Z', level: 'info', pluginId: 'existing', commandId: '', message: 'kept' }],
    serviceHealthPolicies: {
      existing: {
        service: { enabled: true, intervalMs: 30000 }
      },
      'new-plugin': {
        worker: { enabled: true, intervalMs: 45000 }
      }
    }
  })
})

test('plugin storage service normalizes logs and returns filtered copies', () => {
  const { storageService } = createStorageService()

  storageService.appendLog({ pluginId: 'weather', commandId: 'announce', message: 'Command started' })
  storageService.appendLog({ level: 'error', pluginId: 'weather', commandId: 'announce', message: 'Command failed' })

  const logs = storageService.getLogs({ level: 'error' })
  logs[0].message = 'mutated'

  assert.deepEqual(storageService.getLogs({ level: 'error' }).map((entry) => ({
    level: entry.level,
    pluginId: entry.pluginId,
    commandId: entry.commandId,
    message: entry.message
  })), [{
    level: 'error',
    pluginId: 'weather',
    commandId: 'announce',
    message: 'Command failed'
  }])
})

test('plugin storage service validates private storage keys and quotas', () => {
  const { storageService } = createStorageService()

  assert.throws(() => storageService.assertStorageKey('../secret'), /Plugin storage key/)
  assert.throws(
    () => storageService.assertStorageValueSize('x'.repeat(17 * 1024)),
    /Plugin storage value exceeds/
  )
  assert.throws(
    () => storageService.savePluginStorage('weather', { blob: 'x'.repeat(65 * 1024) }),
    /Plugin storage exceeds/
  )
})
