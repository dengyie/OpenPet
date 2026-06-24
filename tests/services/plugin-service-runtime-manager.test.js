const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createPluginServiceRuntimeKey,
  createPluginServiceRuntimeManager
} = require('../../src/main/services/plugin-service-runtime-manager')

const createManager = () => {
  const stops = []
  const manager = createPluginServiceRuntimeManager({
    stopRuntime: (pluginId, serviceId, runtime, options) => stops.push({ pluginId, serviceId, runtime, options })
  })
  return { manager, stops }
}

test('plugin service runtime manager stores runtimes by plugin and service id', () => {
  const { manager } = createManager()
  const runtime = { pluginId: 'weather', serviceId: 'companion', status: 'running' }

  assert.equal(createPluginServiceRuntimeKey('weather', 'companion'), 'weather:companion')
  assert.equal(manager.setRuntime(runtime), runtime)
  assert.equal(manager.getRuntime('weather', 'companion'), runtime)
  assert.equal(manager.size(), 1)
})

test('plugin service runtime manager creates stopped runtimes lazily', () => {
  const { manager } = createManager()
  const created = manager.getOrCreateRuntime('weather', 'companion', () => ({
    pluginId: 'weather',
    serviceId: 'companion',
    status: 'stopped'
  }))

  const existing = manager.getOrCreateRuntime('weather', 'companion', () => {
    throw new Error('factory should not run for existing runtime')
  })

  assert.deepEqual(created, { pluginId: 'weather', serviceId: 'companion', status: 'stopped' })
  assert.equal(existing, created)
  assert.equal(manager.size(), 1)
})

test('plugin service runtime manager rejects active duplicate service runs', () => {
  const { manager } = createManager()

  manager.setRuntime({ pluginId: 'weather', serviceId: 'companion', status: 'running' })
  assert.throws(
    () => manager.assertNotActive('weather', 'companion'),
    /Plugin service is already running/
  )

  manager.setRuntime({ pluginId: 'weather', serviceId: 'companion', status: 'stopping' })
  assert.throws(
    () => manager.assertNotActive('weather', 'companion'),
    /Plugin service is already running/
  )

  manager.setRuntime({ pluginId: 'weather', serviceId: 'companion', status: 'stopped' })
  assert.doesNotThrow(() => manager.assertNotActive('weather', 'companion'))
})

test('plugin service runtime manager stops one plugin without matching id prefixes', () => {
  const { manager, stops } = createManager()
  const weatherRuntime = { pluginId: 'weather', serviceId: 'companion', status: 'running' }
  const weatherPlusRuntime = { pluginId: 'weather-plus', serviceId: 'companion', status: 'running' }
  manager.setRuntime(weatherRuntime)
  manager.setRuntime(weatherPlusRuntime)

  manager.stopPlugin('weather', { log: false })

  assert.deepEqual(stops, [{
    pluginId: 'weather',
    serviceId: 'companion',
    runtime: weatherRuntime,
    options: { log: false }
  }])
})

test('plugin service runtime manager can stop all service runtimes', () => {
  const { manager, stops } = createManager()
  const weatherRuntime = { pluginId: 'weather', serviceId: 'companion', status: 'running' }
  const focusRuntime = { pluginId: 'focus', serviceId: 'assistant', status: 'running' }
  manager.setRuntime(weatherRuntime)
  manager.setRuntime(focusRuntime)

  manager.stopAll({ log: false })

  assert.deepEqual(stops.map((entry) => `${entry.pluginId}:${entry.serviceId}:${entry.options.log}`), [
    'weather:companion:false',
    'focus:assistant:false'
  ])
})
