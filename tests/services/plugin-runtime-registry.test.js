const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createPluginRuntimeKey,
  createPluginRuntimeRegistry
} = require('../../src/main/services/plugin-runtime-registry')
const {
  ACTIVE_PLUGIN_RUNTIME_STATUSES,
  isActivePluginRuntimeStatus
} = require('../../src/main/services/plugin-runtime-status')

test('plugin runtime status exposes the shared active status policy', () => {
  assert.equal(createPluginRuntimeKey('weather', 'refresh'), 'weather:refresh')
  assert.equal(isActivePluginRuntimeStatus('running'), true)
  assert.equal(isActivePluginRuntimeStatus('stopping'), true)
  assert.equal(isActivePluginRuntimeStatus('failed'), false)
  assert.equal(ACTIVE_PLUGIN_RUNTIME_STATUSES.has('running'), true)
})

test('plugin runtime registry stores runtimes and fans out stop operations by exact plugin id', () => {
  const stops = []
  const registry = createPluginRuntimeRegistry({
    runtimeIdKey: 'commandId',
    alreadyRunningMessage: 'Plugin command is already running',
    stopRuntime: (pluginId, commandId, runtime, options) => stops.push({ pluginId, commandId, runtime, options })
  })
  const weatherRuntime = { pluginId: 'weather', commandId: 'refresh', status: 'running' }
  const weatherPlusRuntime = { pluginId: 'weather-plus', commandId: 'refresh', status: 'running' }

  registry.setRuntime(weatherRuntime)
  registry.setRuntime(weatherPlusRuntime)

  assert.equal(registry.getRuntime('weather', 'refresh'), weatherRuntime)
  assert.throws(() => registry.assertNotActive('weather', 'refresh'), /Plugin command is already running/)
  assert.equal(registry.deleteRuntime('weather-plus', 'refresh'), true)

  registry.stopPlugin('weather', { log: false })
  registry.stopAll({ log: true })

  assert.deepEqual(stops, [
    { pluginId: 'weather', commandId: 'refresh', runtime: weatherRuntime, options: { log: false } },
    { pluginId: 'weather', commandId: 'refresh', runtime: weatherRuntime, options: { log: true } }
  ])
})

test('plugin runtime registry can lazily create runtimes', () => {
  const registry = createPluginRuntimeRegistry({
    runtimeIdKey: 'serviceId',
    alreadyRunningMessage: 'Plugin service is already running',
    stopRuntime: () => {}
  })

  const created = registry.getOrCreateRuntime('weather', 'companion', () => ({
    pluginId: 'weather',
    serviceId: 'companion',
    status: 'stopped'
  }))
  const existing = registry.getOrCreateRuntime('weather', 'companion', () => {
    throw new Error('factory should not run twice')
  })

  assert.equal(existing, created)
  assert.equal(registry.size(), 1)
})
