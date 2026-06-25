const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginServiceStopController } = require('../../src/main/services/plugin-service-stop-controller')

const createRuntime = (overrides = {}) => ({
  pluginId: 'weather-declaration',
  serviceId: 'companion',
  status: 'running',
  pid: 4321,
  stoppedAt: '',
  error: '',
  stopTimer: null,
  stopGracePeriodMs: 20,
  child: {
    kill: () => true
  },
  ...overrides
})

test('stop controller sends SIGTERM before scheduling force stop', () => {
  const signals = []
  const timers = []
  let clearedHealth = 0
  const controller = createPluginServiceStopController({
    appendLog: () => {},
    killServiceProcess: (pid, signal) => {
      signals.push({ pid, signal })
      return true
    },
    signalServiceProcessTree: () => false,
    setStopTimer: (callback, delay) => {
      timers.push({ callback, delay })
      return { unref() {} }
    },
    clearStopTimer: () => {},
    clearHealthSchedule: () => { clearedHealth += 1 }
  })
  const runtime = createRuntime()

  const result = controller.stopRuntime('weather-declaration', 'companion', runtime)

  assert.equal(result.status, 'stopping')
  assert.equal(clearedHealth, 1)
  assert.deepEqual(signals, [{ pid: -4321, signal: 'SIGTERM' }])
  assert.equal(timers[0].delay, 20)

  timers[0].callback()

  assert.deepEqual(signals, [
    { pid: -4321, signal: 'SIGTERM' },
    { pid: -4321, signal: 'SIGKILL' }
  ])
})

test('stop controller does not escalate when runtime stops before the grace timer fires', () => {
  const signals = []
  const timers = []
  const controller = createPluginServiceStopController({
    appendLog: () => {},
    killServiceProcess: (pid, signal) => {
      signals.push({ pid, signal })
      return true
    },
    signalServiceProcessTree: () => false,
    setStopTimer: (callback, delay) => {
      timers.push({ callback, delay })
      return { unref() {} }
    },
    clearStopTimer: () => {},
    clearHealthSchedule: () => {}
  })
  const runtime = createRuntime()

  controller.stopRuntime('weather-declaration', 'companion', runtime)
  runtime.status = 'stopped'
  timers[0].callback()

  assert.deepEqual(signals, [{ pid: -4321, signal: 'SIGTERM' }])
})

test('force stop falls back to process tree cleanup when direct kill fails', () => {
  const signals = []
  const treeSignals = []
  const controller = createPluginServiceStopController({
    appendLog: () => {},
    killServiceProcess: (pid, signal) => {
      signals.push({ pid, signal })
      throw new Error('process group kill failed')
    },
    signalServiceProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return true
    }
  })

  controller.forceStopServiceProcess(createRuntime(), 'SIGKILL')

  assert.deepEqual(signals, [{ pid: -4321, signal: 'SIGKILL' }])
  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGKILL' }])
})
