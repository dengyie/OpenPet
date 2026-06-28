const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginRuntimeStopSupport } = require('../../src/main/services/plugin-runtime-stop-support')

const createRuntime = (overrides = {}) => ({
  pid: 4321,
  child: {
    killCalls: [],
    kill(signal) {
      this.killCalls.push(signal)
      return true
    }
  },
  ...overrides
})

test('runtime stop support stops detached process group before falling back to process tree or child kill', () => {
  const signals = []
  const treeSignals = []
  const support = createPluginRuntimeStopSupport({
    killProcess: (pid, signal) => {
      signals.push({ pid, signal })
      return true
    },
    signalProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return false
    }
  })
  const runtime = createRuntime()

  support.stopDetachedProcess(runtime, 'SIGTERM')

  assert.deepEqual(signals, [{ pid: -4321, signal: 'SIGTERM' }])
  assert.deepEqual(treeSignals, [])
  assert.deepEqual(runtime.child.killCalls, [])
})

test('runtime stop support falls back to process tree when detached process group kill fails', () => {
  const signals = []
  const treeSignals = []
  const support = createPluginRuntimeStopSupport({
    killProcess: (pid, signal) => {
      signals.push({ pid, signal })
      throw new Error('kill failed')
    },
    signalProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return true
    }
  })
  const runtime = createRuntime()

  support.forceStopDetachedProcess(runtime, 'SIGKILL')

  assert.deepEqual(signals, [{ pid: -4321, signal: 'SIGKILL' }])
  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGKILL' }])
  assert.deepEqual(runtime.child.killCalls, [])
})

test('runtime stop support falls back to child kill when no process tree cleanup succeeds', () => {
  const support = createPluginRuntimeStopSupport({
    killProcess: () => {
      throw new Error('kill failed')
    },
    signalProcessTree: () => false
  })
  const runtime = createRuntime()

  support.stopDetachedProcess(runtime, 'SIGTERM')

  assert.deepEqual(runtime.child.killCalls, ['SIGTERM'])
})

test('runtime stop support uses process tree first for runtime-manager fallback stops', () => {
  const treeSignals = []
  const support = createPluginRuntimeStopSupport({
    signalProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return true
    }
  })
  const runtime = createRuntime()

  support.stopRuntimeProcessWithFallback(runtime, 'SIGTERM')

  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(runtime.child.killCalls, [])
})

test('runtime stop support falls back to child kill when process tree fallback stop is unavailable', () => {
  const treeSignals = []
  const support = createPluginRuntimeStopSupport({
    signalProcessTree: (pid, signal) => {
      treeSignals.push({ pid, signal })
      return false
    }
  })
  const runtime = createRuntime()

  support.stopRuntimeProcessWithFallback(runtime, 'SIGTERM')

  assert.deepEqual(treeSignals, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(runtime.child.killCalls, ['SIGTERM'])
})
