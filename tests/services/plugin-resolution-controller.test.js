const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginResolutionController } = require('../../src/main/services/plugin-resolution-controller')

const createPlugin = (overrides = {}) => ({
  manifest: {
    id: 'weather-declaration',
    entries: {
      commands: [{ id: 'forecast' }],
      setup: [{ id: 'install-deps' }],
      services: [{ id: 'companion' }],
      dashboards: [{ id: 'main', url: 'http://127.0.0.1:8787/' }]
    },
    ...overrides.manifest
  },
  ...overrides
})

const createController = (overrides = {}) => createPluginResolutionController({
  getPlugins: () => [createPlugin()],
  getEnabledMap: () => ({ 'weather-declaration': true }),
  assertPluginAllowed: () => {},
  ...overrides
})

test('plugin resolution controller resolves enabled plugins by id', () => {
  const controller = createController()

  const plugin = controller.resolvePlugin('weather-declaration')

  assert.equal(plugin.manifest.id, 'weather-declaration')
})

test('plugin resolution controller rejects unknown plugins', () => {
  const controller = createController()

  assert.throws(
    () => controller.resolvePlugin('missing-plugin'),
    /Plugin not found: missing-plugin/
  )
})

test('plugin resolution controller rejects disabled plugins by default', () => {
  const controller = createController({
    getEnabledMap: () => ({})
  })

  assert.throws(
    () => controller.resolvePlugin('weather-declaration'),
    /Plugin is disabled/
  )
})

test('plugin resolution controller can resolve disabled plugins when requireEnabled is false', () => {
  const controller = createController({
    getEnabledMap: () => ({})
  })

  const plugin = controller.resolvePlugin('weather-declaration', { requireEnabled: false })

  assert.equal(plugin.manifest.id, 'weather-declaration')
})

test('plugin resolution controller applies plugin policy checks', () => {
  const controller = createController({
    assertPluginAllowed: () => {
      throw new Error('Plugin is blocked: blocked for review')
    }
  })

  assert.throws(
    () => controller.resolvePlugin('weather-declaration'),
    /Plugin is blocked: blocked for review/
  )
})

test('plugin resolution controller can skip plugin policy checks when requireAllowed is false', () => {
  const controller = createController({
    assertPluginAllowed: () => {
      throw new Error('Plugin is blocked: blocked for review')
    }
  })

  const plugin = controller.resolvePlugin('weather-declaration', { requireAllowed: false })

  assert.equal(plugin.manifest.id, 'weather-declaration')
})

test('plugin resolution controller resolves declared command/setup/service/dashboard entries', () => {
  const controller = createController()
  const plugin = controller.resolvePlugin('weather-declaration')

  assert.equal(controller.getCommandEntry(plugin, 'forecast').id, 'forecast')
  assert.equal(controller.getSetupEntry(plugin, 'install-deps').id, 'install-deps')
  assert.equal(controller.getServiceEntry(plugin, 'companion').id, 'companion')
  assert.equal(controller.getDashboardEntry(plugin, 'main').id, 'main')
})

test('plugin resolution controller keeps entry-specific missing errors', () => {
  const controller = createController()
  const plugin = controller.resolvePlugin('weather-declaration')

  assert.throws(
    () => controller.getCommandEntry(plugin, 'missing'),
    /Plugin command entry not found: missing/
  )
  assert.throws(
    () => controller.getSetupEntry(plugin, 'missing'),
    /Plugin setup entry not found: missing/
  )
  assert.throws(
    () => controller.getServiceEntry(plugin, 'missing'),
    /Plugin service not found: missing/
  )
  assert.throws(
    () => controller.getDashboardEntry(plugin, 'missing'),
    /Plugin dashboard not found: missing/
  )
})
