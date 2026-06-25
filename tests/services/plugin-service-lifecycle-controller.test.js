const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')

const { createPluginServiceLifecycleController } = require('../../src/main/services/plugin-service-lifecycle-controller')

const createChild = (pid = 4321) => {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

const createRuntime = (controller, child, overrides = {}) => controller.createRuntime({
  pluginId: 'weather-declaration',
  serviceId: 'companion',
  child,
  command: 'npm run service:start',
  cwd: '/tmp/weather-declaration',
  existingHealth: overrides.existingHealth,
  serviceEntry: overrides.serviceEntry || { health: { url: 'http://127.0.0.1:8787/health' } },
  stopGracePeriodMs: overrides.stopGracePeriodMs
})

test('lifecycle controller creates service runtimes from spawn inputs', () => {
  const child = createChild(4321)
  const controller = createPluginServiceLifecycleController({
    createHealthView: (_health, serviceEntry) => ({
      status: serviceEntry.health?.url ? 'unknown' : 'not-configured',
      url: serviceEntry.health?.url || ''
    })
  })

  const runtime = createRuntime(controller, child)

  assert.equal(runtime.status, 'running')
  assert.equal(runtime.pid, 4321)
  assert.equal(runtime.command, 'npm run service:start')
  assert.equal(runtime.cwd, '/tmp/weather-declaration')
  assert.equal(runtime.child, child)
  assert.equal(runtime.stopGracePeriodMs, 1500)
  assert.deepEqual(runtime.health, { status: 'unknown', url: 'http://127.0.0.1:8787/health' })
  assert.match(runtime.startedAt, /T/)
})

test('lifecycle controller forwards stdout and stderr logs', () => {
  const logs = []
  const child = createChild()
  const controller = createPluginServiceLifecycleController({
    appendLog: (entry) => logs.push(entry)
  })
  const runtime = createRuntime(controller, child)

  controller.attachChildHandlers({ pluginId: 'weather-declaration', serviceId: 'companion', runtime, child })
  child.stdout.emit('data', ' ready for traffic \n')
  child.stderr.emit('data', ' failed to load cache \n')

  assert.equal(logs[0].message, 'Service stdout: ready for traffic')
  assert.equal(logs[0].level, 'info')
  assert.equal(logs[1].message, 'Service stderr: failed to load cache')
  assert.equal(logs[1].level, 'error')
})

test('lifecycle controller marks child errors failed and clears timers', () => {
  const logs = []
  const cleared = []
  const child = createChild()
  const controller = createPluginServiceLifecycleController({
    appendLog: (entry) => logs.push(entry),
    clearStopTimer: (runtime) => cleared.push(['stop', runtime]),
    clearHealthSchedule: (runtime) => cleared.push(['health', runtime])
  })
  const runtime = createRuntime(controller, child)

  controller.attachChildHandlers({ pluginId: 'weather-declaration', serviceId: 'companion', runtime, child })
  child.emit('error', new Error('spawn failed'))

  assert.equal(runtime.status, 'failed')
  assert.equal(runtime.error, 'spawn failed')
  assert.equal(cleared.length, 2)
  assert.equal(logs[0].message, 'spawn failed')
  assert.match(runtime.stoppedAt, /T/)
})

test('lifecycle controller reconciles requested exits as stopped', () => {
  const logs = []
  const child = createChild()
  const controller = createPluginServiceLifecycleController({
    appendLog: (entry) => logs.push(entry)
  })
  const runtime = createRuntime(controller, child)
  runtime.status = 'stopping'

  controller.attachChildHandlers({ pluginId: 'weather-declaration', serviceId: 'companion', runtime, child })
  child.emit('exit', 0, 'SIGTERM')

  assert.equal(runtime.status, 'stopped')
  assert.equal(runtime.exitCode, 0)
  assert.equal(runtime.signal, 'SIGTERM')
  assert.equal(runtime.child, null)
  assert.equal(logs[0].message, 'Service stopped')
  assert.equal(logs[0].level, 'info')
})

test('lifecycle controller reconciles forced stop exits and unrequested failures', () => {
  const logs = []
  const child = createChild()
  const controller = createPluginServiceLifecycleController({
    appendLog: (entry) => logs.push(entry)
  })
  const forcedRuntime = createRuntime(controller, child)
  forcedRuntime.status = 'stopping'
  forcedRuntime.error = 'Service did not stop before force kill'

  controller.attachChildHandlers({ pluginId: 'weather-declaration', serviceId: 'companion', runtime: forcedRuntime, child })
  child.emit('exit', null, 'SIGKILL')

  assert.equal(forcedRuntime.status, 'failed')
  assert.equal(logs[0].message, 'Service exited after force stop')
  assert.equal(logs[0].level, 'error')

  const failureLogs = []
  const otherChild = createChild()
  const failureController = createPluginServiceLifecycleController({
    appendLog: (entry) => failureLogs.push(entry)
  })
  const runtime = createRuntime(failureController, otherChild)

  failureController.attachChildHandlers({ pluginId: 'weather-declaration', serviceId: 'companion', runtime, child: otherChild })
  otherChild.emit('exit', 1, '')

  assert.equal(runtime.status, 'failed')
  assert.equal(failureLogs[0].message, 'Service exited')
  assert.equal(failureLogs[0].level, 'error')
})
