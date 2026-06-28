const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginSetupRuntimeController } = require('../../src/main/services/plugin-setup-runtime-controller')

const createController = (overrides = {}) => {
  const calls = {
    assertNotActive: [],
    run: [],
    stopPlugin: []
  }

  const runtimeManager = {
    assertNotActive(pluginId, setupId) {
      calls.assertNotActive.push({ pluginId, setupId })
    },
    stopPlugin(pluginId, options = {}) {
      calls.stopPlugin.push({ pluginId, options })
      return { ok: true, pluginId, options }
    },
    ...overrides.runtimeManager
  }

  const processController = {
    run(args) {
      calls.run.push(args)
      return { ok: true, mode: 'setup', setupId: args.setupId }
    },
    ...overrides.processController
  }

  const controller = createPluginSetupRuntimeController({
    runtimeManager,
    processController
  })

  return { controller, calls }
}

test('setup runtime controller rejects active duplicate setup runs before spawning', () => {
  const { controller, calls } = createController({
    runtimeManager: {
      assertNotActive() {
        throw new Error('Plugin setup is already running')
      }
    }
  })

  assert.throws(() => controller.run({
    pluginId: 'weather-declaration',
    manifest: { id: 'weather-declaration' },
    setupId: 'install-deps',
    setupEntry: { id: 'install-deps' }
  }), /Plugin setup is already running/)

  assert.deepEqual(calls.run, [])
})

test('setup runtime controller asserts runtime uniqueness and delegates process run', async () => {
  const { controller, calls } = createController()
  const manifest = { id: 'weather-declaration' }
  const setupEntry = { id: 'install-deps', command: 'npm install', cwd: '.' }

  const result = await controller.run({
    pluginId: 'weather-declaration',
    manifest,
    setupId: 'install-deps',
    setupEntry
  })

  assert.deepEqual(result, { ok: true, mode: 'setup', setupId: 'install-deps' })
  assert.deepEqual(calls.assertNotActive, [{ pluginId: 'weather-declaration', setupId: 'install-deps' }])
  assert.equal(calls.run.length, 1)
  assert.equal(calls.run[0].manifest, manifest)
  assert.equal(calls.run[0].setupEntry, setupEntry)
})

test('setup runtime controller stops one plugin through runtime manager', () => {
  const { controller, calls } = createController()

  const result = controller.stopPlugin('weather-declaration', { log: false })

  assert.deepEqual(result, { ok: true, pluginId: 'weather-declaration', options: { log: false } })
  assert.deepEqual(calls.stopPlugin, [{ pluginId: 'weather-declaration', options: { log: false } }])
})
