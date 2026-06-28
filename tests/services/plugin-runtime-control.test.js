const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginRuntimeControl } = require('../../src/main/services/plugin-runtime-control')

const createTimerHarness = () => {
  const scheduled = []
  return {
    scheduled,
    setTimeoutImpl: (callback, delay) => {
      const handle = {
        callback,
        delay,
        cleared: false,
        unrefCalled: false,
        unref() {
          handle.unrefCalled = true
        }
      }
      scheduled.push(handle)
      return handle
    },
    clearTimeoutImpl: (handle) => {
      if (handle) handle.cleared = true
    }
  }
}

test('runtime control stops services, clears timers, and schedules forced stop', () => {
  const timerHarness = createTimerHarness()
  const logs = []
  const stopSignals = []
  const forceSignals = []
  const clearedHealthRuntimes = []
  const control = createPluginRuntimeControl({
    appendLog: (entry) => logs.push(entry),
    stopServiceProcess: (runtime, signal) => stopSignals.push({ runtime, signal }),
    forceStopServiceProcess: (runtime, signal) => forceSignals.push({ runtime, signal }),
    stopRuntimeProcessWithFallback: () => {},
    clearServiceHealthSchedule: (runtime) => clearedHealthRuntimes.push(runtime),
    setTimeoutImpl: timerHarness.setTimeoutImpl,
    clearTimeoutImpl: timerHarness.clearTimeoutImpl,
    serviceStopGracePeriodMs: 25
  })
  const runtime = {
    status: 'running',
    stopGracePeriodMs: 25,
    stopTimer: { cleared: false },
    healthTimer: { active: true },
    error: '',
    stoppedAt: ''
  }

  const result = control.stopPluginServiceRuntime('weather-declaration', 'companion', runtime)

  assert.equal(result, runtime)
  assert.equal(runtime.status, 'stopping')
  assert.equal(typeof runtime.stoppedAt, 'string')
  assert.equal(runtime.error, '')
  assert.equal(runtime.stopCompleted instanceof Promise, true)
  assert.equal(runtime.stopTimer.delay, 25)
  assert.equal(runtime.stopTimer.unrefCalled, true)
  assert.equal(stopSignals.length, 1)
  assert.equal(stopSignals[0].signal, 'SIGTERM')
  assert.equal(forceSignals.length, 0)
  assert.deepEqual(clearedHealthRuntimes, [runtime])
  assert.equal(logs[0].message, 'Service stop requested')

  timerHarness.scheduled[0].callback()

  assert.equal(forceSignals.length, 1)
  assert.equal(forceSignals[0].signal, 'SIGKILL')
  assert.equal(runtime.error, 'Service did not stop before force kill')
  assert.equal(logs[1].message, 'Service stop grace period expired; force stop requested')
})

test('runtime control marks setup stop failures and rejects through failStop', () => {
  const logs = []
  const failStopErrors = []
  const control = createPluginRuntimeControl({
    appendLog: (entry) => logs.push(entry),
    stopServiceProcess: () => {},
    forceStopServiceProcess: () => {},
    stopRuntimeProcessWithFallback: () => {
      throw new Error('setup stop failed')
    },
    clearServiceHealthSchedule: () => {}
  })
  const runtime = {
    status: 'running',
    error: '',
    exitCode: 7,
    lastRunAt: '',
    failStop: (error) => failStopErrors.push(error)
  }

  control.stopPluginSetupRuntime('weather-declaration', 'install-deps', runtime)

  assert.equal(runtime.status, 'failed')
  assert.equal(runtime.error, 'setup stop failed')
  assert.equal(runtime.exitCode, null)
  assert.equal(typeof runtime.lastRunAt, 'string')
  assert.equal(runtime.stopCompleted instanceof Promise, true)
  assert.equal(logs[0].message, 'setup stop failed')
  assert.equal(logs[0].level, 'error')
  assert.equal(failStopErrors.length, 1)
  assert.match(failStopErrors[0].message, /setup stop failed/)
})

test('runtime control marks command stop failures, resolves waiters, and notifies failStop', async () => {
  const logs = []
  const failStopErrors = []
  const control = createPluginRuntimeControl({
    appendLog: (entry) => logs.push(entry),
    stopServiceProcess: () => {},
    forceStopServiceProcess: () => {},
    stopRuntimeProcessWithFallback: () => {},
    clearServiceHealthSchedule: () => {}
  })
  const runtime = {
    status: 'running',
    error: '',
    stop: () => {
      throw new Error('command stop failed')
    },
    failStop: (error) => failStopErrors.push(error)
  }

  control.stopPluginCommandRuntime('weather-declaration', 'announce', runtime)
  await runtime.stopCompleted

  assert.equal(runtime.status, 'failed')
  assert.equal(runtime.error, 'command stop failed')
  assert.equal(logs[0].message, 'command stop failed')
  assert.equal(logs[0].level, 'error')
  assert.equal(failStopErrors.length, 1)
  assert.equal(failStopErrors[0].openpetLogged, true)
})
