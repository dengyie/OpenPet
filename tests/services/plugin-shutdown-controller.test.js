const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginShutdownController } = require('../../src/main/services/plugin-shutdown-controller')

test('shutdown controller stops all runtime domains in the expected order', async () => {
  const calls = []
  const controller = createPluginShutdownController({
    stopServices: (options) => calls.push({ type: 'services', options }),
    listServiceRuntimes: () => [],
    stopSetups: (options) => calls.push({ type: 'setups', options }),
    listSetupRuntimes: () => [],
    stopCommands: () => calls.push({ type: 'commands' }),
    listCommandRuntimes: () => [],
    closeCommandBridge: () => calls.push({ type: 'bridge' })
  })

  const result = await controller.stopAll()

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls, [
    { type: 'services', options: { log: false } },
    { type: 'setups', options: { log: false } },
    { type: 'commands' },
    { type: 'bridge' }
  ])
})

test('shutdown controller waits for active runtime stop completion before resolving', async () => {
  const calls = []
  let resolveServiceStop
  let resolveSetupStop
  let resolveCommandStop
  const serviceRuntime = {
    status: 'running',
    stopCompleted: new Promise((resolve) => { resolveServiceStop = resolve })
  }
  const setupRuntime = { status: 'running' }
  const commandRuntime = { status: 'running' }

  const controller = createPluginShutdownController({
    stopServices: (options) => {
      calls.push({ type: 'services', options })
      serviceRuntime.status = 'stopping'
    },
    listServiceRuntimes: () => [serviceRuntime],
    stopSetups: (options) => calls.push({ type: 'setups', options }),
    listSetupRuntimes: () => [setupRuntime],
    stopCommands: () => calls.push({ type: 'commands' }),
    listCommandRuntimes: () => [commandRuntime],
    ensureSetupStopWaiter: () => new Promise((resolve) => { resolveSetupStop = resolve }),
    ensureCommandStopWaiter: () => new Promise((resolve) => { resolveCommandStop = resolve }),
    closeCommandBridge: () => calls.push({ type: 'bridge' })
  })

  let settled = false
  const stopAllPromise = controller.stopAll().then(() => {
    settled = true
  })

  await Promise.resolve()
  assert.equal(settled, false)

  resolveSetupStop()
  await Promise.resolve()
  assert.equal(settled, false)

  resolveCommandStop()
  await Promise.resolve()
  assert.equal(settled, false)

  resolveServiceStop()
  await stopAllPromise

  assert.equal(settled, true)
  assert.deepEqual(calls, [
    { type: 'services', options: { log: false } },
    { type: 'setups', options: { log: false } },
    { type: 'commands' },
    { type: 'bridge' }
  ])
})

test('shutdown controller stops waiting after the configured timeout', async () => {
  const calls = []
  const controller = createPluginShutdownController({
    stopServices: (options) => calls.push({ type: 'services', options }),
    listServiceRuntimes: () => [{
      status: 'stopping',
      stopCompleted: new Promise(() => {})
    }],
    stopSetups: (options) => calls.push({ type: 'setups', options }),
    listSetupRuntimes: () => [{
      status: 'running'
    }],
    stopCommands: () => calls.push({ type: 'commands' }),
    listCommandRuntimes: () => [{
      status: 'running'
    }],
    ensureSetupStopWaiter: () => new Promise(() => {}),
    ensureCommandStopWaiter: () => new Promise(() => {}),
    closeCommandBridge: () => calls.push({ type: 'bridge' }),
    shutdownWaitTimeoutMs: 5
  })

  const result = await controller.stopAll()

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls, [
    { type: 'services', options: { log: false } },
    { type: 'setups', options: { log: false } },
    { type: 'commands' },
    { type: 'bridge' }
  ])
})
