const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginConfigStorageController } = require('../../src/main/services/plugin-config-storage-controller')

const createSettingsService = (initial = {}) => {
  let current = structuredClone(initial)
  return {
    get: () => current,
    save: (next) => {
      current = next
    }
  }
}

const createController = (settingsService, overrides = {}) => createPluginConfigStorageController({
  settingsService,
  normalizePluginConfig: (schema, config = {}) => {
    if (!schema) return {}
    return Object.fromEntries(schema.properties.map((field) => [field.key, config[field.key] ?? field.default]))
  },
  cloneJsonValue: (value) => structuredClone(value),
  getJsonByteSize: (value) => Buffer.byteLength(JSON.stringify(value)),
  assertStorageSize: () => {},
  ...overrides
})

test('plugin config storage controller saves normalized config without replacing unrelated settings', () => {
  const settingsService = createSettingsService({
    theme: 'system',
    plugins: {
      enabled: { 'local-runner': true },
      config: { existing: { ok: true } }
    }
  })
  const controller = createController(settingsService)

  const saved = controller.saveConfig('local-runner', {
    properties: [
      { key: 'greeting', default: 'Focus' },
      { key: 'rounds', default: 1 }
    ]
  }, {
    greeting: 'Plan'
  })

  assert.deepEqual(saved, { greeting: 'Plan', rounds: 1 })
  assert.equal(settingsService.get().theme, 'system')
  assert.deepEqual(settingsService.get().plugins.enabled, { 'local-runner': true })
  assert.deepEqual(settingsService.get().plugins.config, {
    existing: { ok: true },
    'local-runner': { greeting: 'Plan', rounds: 1 }
  })
})

test('plugin config storage controller clones stored values on read and write', () => {
  const settingsService = createSettingsService({
    plugins: {
      storage: { 'local-runner': { meta: { ok: true } } }
    }
  })
  const controller = createController(settingsService)

  const storage = controller.getStorage('local-runner')
  storage.meta.ok = false

  const saved = controller.saveStorage('local-runner', { nested: { count: 2 } })
  saved.nested.count = 9

  assert.deepEqual(controller.getStorage('local-runner'), { nested: { count: 2 } })
})

test('plugin config storage controller reports invalid storage stats without throwing', () => {
  const cyclic = {}
  cyclic.self = cyclic
  const settingsService = createSettingsService({
    plugins: {
      storage: { 'local-runner': cyclic }
    }
  })
  const controller = createController(settingsService, {
    cloneJsonValue: (value) => structuredClone(value)
  })

  const stats = controller.getStorageStats('local-runner')
  assert.equal(stats.keyCount, 0)
  assert.equal(stats.byteSize, 0)
  assert.equal(stats.valid, false)
  assert.match(stats.error, /circular|Plugin storage is invalid/i)
})

test('plugin config storage controller clears storage by persisting an empty object', () => {
  const settingsService = createSettingsService({
    plugins: {
      storage: { 'local-runner': { count: 1 } }
    }
  })
  const controller = createController(settingsService)

  controller.clearStorage('local-runner')

  assert.deepEqual(settingsService.get().plugins.storage, { 'local-runner': {} })
})
