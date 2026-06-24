const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createPluginCommandRuntimeKey,
  createPluginCommandRuntimeManager
} = require('../../src/main/services/plugin-command-runtime-manager')

const createManager = () => {
  const logs = []
  const stops = []
  const manager = createPluginCommandRuntimeManager({
    appendLog: (entry) => logs.push(entry),
    stopRuntimeProcess: (runtime, signal) => stops.push({ runtime, signal })
  })
  return { logs, manager, stops }
}

test('plugin command runtime manager stores runtimes by plugin and command id', () => {
  const { manager } = createManager()
  const runtime = { pluginId: 'weather', commandId: 'refresh', status: 'running' }

  assert.equal(createPluginCommandRuntimeKey('weather', 'refresh'), 'weather:refresh')
  assert.equal(manager.setRuntime(runtime), runtime)
  assert.equal(manager.getRuntime('weather', 'refresh'), runtime)
  assert.equal(manager.size(), 1)
  assert.equal(manager.deleteRuntime('weather', 'refresh'), true)
  assert.equal(manager.getRuntime('weather', 'refresh'), undefined)
})

test('plugin command runtime manager rejects active duplicate command runs', () => {
  const { manager } = createManager()

  manager.setRuntime({ pluginId: 'weather', commandId: 'refresh', status: 'running' })
  assert.throws(
    () => manager.assertNotActive('weather', 'refresh'),
    /Plugin command is already running/
  )

  manager.setRuntime({ pluginId: 'weather', commandId: 'refresh', status: 'failed' })
  assert.doesNotThrow(() => manager.assertNotActive('weather', 'refresh'))
})

test('plugin command runtime manager attaches the standard stop handler', () => {
  const { manager, stops } = createManager()
  const runtime = manager.attachStopHandler({
    pluginId: 'weather',
    commandId: 'refresh',
    status: 'running',
    error: '',
    stopReason: ''
  })

  assert.equal(runtime.stop({ reason: 'Command stopped', signal: 'SIGTERM' }), true)
  assert.equal(runtime.status, 'stopping')
  assert.equal(runtime.error, '')
  assert.equal(runtime.stopReason, 'Command stopped')
  assert.deepEqual(stops, [{ runtime, signal: 'SIGTERM' }])
})

test('plugin command runtime manager stops one plugin without matching id prefixes', () => {
  const { logs, manager, stops } = createManager()
  const weatherRuntime = manager.attachStopHandler({ pluginId: 'weather', commandId: 'refresh', status: 'running', error: '' })
  const weatherPlusRuntime = manager.attachStopHandler({ pluginId: 'weather-plus', commandId: 'refresh', status: 'running', error: '' })
  manager.setRuntime(weatherRuntime)
  manager.setRuntime(weatherPlusRuntime)

  manager.stopPlugin('weather')

  assert.equal(weatherRuntime.status, 'stopping')
  assert.equal(weatherPlusRuntime.status, 'running')
  assert.deepEqual(stops.map((entry) => entry.runtime.pluginId), ['weather'])
  assert.deepEqual(logs.map((entry) => entry.message), ['Command stop requested'])
})

test('plugin command runtime manager marks failed stops as logged errors', () => {
  const { logs, manager } = createManager()
  const failedStops = []
  const runtime = {
    pluginId: 'weather',
    commandId: 'refresh',
    status: 'running',
    stop: () => {
      throw new Error('kill failed')
    },
    failStop: (error) => failedStops.push(error)
  }
  manager.setRuntime(runtime)

  manager.stopRuntime('weather', 'refresh')

  assert.equal(runtime.status, 'failed')
  assert.equal(runtime.error, 'kill failed')
  assert.equal(failedStops[0].openpetLogged, true)
  assert.deepEqual(logs, [{
    pluginId: 'weather',
    commandId: 'refresh',
    level: 'error',
    message: 'kill failed'
  }])
})

test('plugin command runtime manager can stop all command runtimes', () => {
  const { manager, stops } = createManager()
  manager.setRuntime(manager.attachStopHandler({ pluginId: 'weather', commandId: 'refresh', status: 'running', error: '' }))
  manager.setRuntime(manager.attachStopHandler({ pluginId: 'focus', commandId: 'start', status: 'running', error: '' }))

  manager.stopAll()

  assert.deepEqual(stops.map((entry) => `${entry.runtime.pluginId}:${entry.runtime.commandId}`), [
    'weather:refresh',
    'focus:start'
  ])
})
