const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginShutdownController } = require('../../src/main/services/plugin-shutdown-controller')

test('shutdown controller stops all runtime domains in the expected order', () => {
  const calls = []
  const controller = createPluginShutdownController({
    stopServices: (options) => calls.push({ type: 'services', options }),
    stopSetups: (options) => calls.push({ type: 'setups', options }),
    stopCommands: () => calls.push({ type: 'commands' }),
    closeCommandBridge: () => calls.push({ type: 'bridge' })
  })

  const result = controller.stopAll()

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls, [
    { type: 'services', options: { log: false } },
    { type: 'setups', options: { log: false } },
    { type: 'commands' },
    { type: 'bridge' }
  ])
})
