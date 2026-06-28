const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginCommandOrchestrationController } = require('../../src/main/services/plugin-command-orchestration-controller')

const createController = (overrides = {}) => {
  const logs = []
  const resolutionCalls = []
  const runCalls = []

  const controller = createPluginCommandOrchestrationController({
    resolvePlugin: (pluginId) => {
      resolutionCalls.push(pluginId)
      return { manifest: { id: pluginId } }
    },
    runCommand: async ({ plugin, pluginId, commandId, payload }) => {
      runCalls.push({ plugin, pluginId, commandId, payload })
      return { ok: true, pluginId, commandId, payload }
    },
    appendLog: (entry) => logs.push(entry),
    getLogs: () => logs.slice(),
    ...overrides
  })

  return { controller, logs, resolutionCalls, runCalls }
}

test('command orchestration controller resolves plugin and delegates command run', async () => {
  const { controller, resolutionCalls, runCalls, logs } = createController()

  const result = await controller.run('official.basic-behavior', 'greet', { text: 'hello' })

  assert.deepEqual(result, {
    ok: true,
    pluginId: 'official.basic-behavior',
    commandId: 'greet',
    payload: { text: 'hello' }
  })
  assert.deepEqual(resolutionCalls, ['official.basic-behavior'])
  assert.equal(runCalls.length, 1)
  assert.equal(runCalls[0].plugin.manifest.id, 'official.basic-behavior')
  assert.deepEqual(logs, [])
})

test('command orchestration controller records one error log when command run throws', async () => {
  const { controller, logs } = createController({
    runCommand: async () => {
      throw new Error('Plugin is disabled')
    }
  })

  await assert.rejects(() => controller.run('official.basic-behavior', 'greet'), /Plugin is disabled/)

  assert.deepEqual(logs.map((entry) => ({
    level: entry.level,
    pluginId: entry.pluginId,
    commandId: entry.commandId,
    message: entry.message
  })), [{
    level: 'error',
    pluginId: 'official.basic-behavior',
    commandId: 'greet',
    message: 'Plugin is disabled'
  }])
})

test('command orchestration controller does not duplicate already-logged errors', async () => {
  const existingLogs = [{
    level: 'error',
    pluginId: 'weather-declaration',
    commandId: 'announce',
    message: 'Plugin command exited with code 7'
  }]
  const appendedLogs = []
  const { controller } = createController({
    runCommand: async () => {
      throw new Error('Plugin command exited with code 7')
    },
    getLogs: () => existingLogs.slice(),
    appendLog: (entry) => appendedLogs.push(entry)
  })

  await assert.rejects(() => controller.run('weather-declaration', 'announce'), /Plugin command exited with code 7/)

  assert.deepEqual(appendedLogs, [])
})

test('command orchestration controller preserves openpetLogged errors without adding logs', async () => {
  const appendedLogs = []
  const { controller } = createController({
    runCommand: async () => {
      const error = new Error('Command stopped')
      error.openpetLogged = true
      throw error
    },
    appendLog: (entry) => appendedLogs.push(entry)
  })

  await assert.rejects(() => controller.run('weather-declaration', 'announce'), /Command stopped/)

  assert.deepEqual(appendedLogs, [])
})

