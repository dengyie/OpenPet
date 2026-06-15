const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createPluginInstallService } = require('../../src/main/services/plugin-install-service')
const { createPluginService } = require('../../src/main/services/plugin-service')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/focus-timer')
const EXAMPLE_PLUGIN_ID = 'openpet.example.focus-timer'

const createSettingsService = (initialSettings = {}) => {
  let current = {
    ...initialSettings,
    plugins: {
      enabled: {},
      config: {},
      storage: {},
      ...(initialSettings.plugins || {})
    }
  }

  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

test('focus timer example plugin can be inspected and installed disabled by default', () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-example-installed-'))
  const settingsService = createSettingsService()
  const installService = createPluginInstallService({ settingsService, pluginDir })

  const review = installService.inspectPluginPackage(EXAMPLE_PLUGIN_PATH)

  assert.equal(review.sourceType, 'directory')
  assert.equal(review.installMode, 'install')
  assert.equal(review.plugin.id, EXAMPLE_PLUGIN_ID)
  assert.equal(review.plugin.main, 'index.js')
  assert.equal(review.plugin.configSchema, 'config.schema.json')
  assert.deepEqual(review.plugin.permissions, ['pet:say', 'storage'])
  assert.deepEqual(review.plugin.commands.map((command) => command.id), ['start', 'reset'])
  assert.equal(review.signature.status, 'unsigned')
  assert.equal(review.riskLevel, 'review')
  assert.equal(review.fileCount, 4)

  const result = installService.installPlugin(review.selectionId)

  assert.deepEqual(result, {
    ok: true,
    pluginId: EXAMPLE_PLUGIN_ID,
    installMode: 'install',
    disabled: true
  })
  assert.equal(settingsService.get().plugins.enabled[EXAMPLE_PLUGIN_ID], false)
  assert.equal(fs.existsSync(path.join(pluginDir, EXAMPLE_PLUGIN_ID, 'plugin.json')), true)
})

test('focus timer example plugin runs through the local plugin service sdk', async () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-example-installed-'))
  const settingsService = createSettingsService({
    plugins: {
      enabled: { [EXAMPLE_PLUGIN_ID]: true },
      config: {
        [EXAMPLE_PLUGIN_ID]: {
          label: 'Deep work',
          minutes: 45,
          strictMode: true
        }
      }
    }
  })
  const installService = createPluginInstallService({ settingsService, pluginDir })
  const review = installService.inspectPluginPackage(EXAMPLE_PLUGIN_PATH)
  installService.installPlugin(review.selectionId)
  settingsService.save({
    ...settingsService.get(),
    plugins: {
      ...settingsService.get().plugins,
      enabled: {
        ...settingsService.get().plugins.enabled,
        [EXAMPLE_PLUGIN_ID]: true
      }
    }
  })

  const petEvents = []
  const pluginService = createPluginService({
    settingsService,
    petService: {
      say: async (payload) => petEvents.push(payload)
    },
    pluginDirs: [pluginDir]
  })

  const [plugin] = pluginService.listPlugins()
  assert.equal(plugin.id, EXAMPLE_PLUGIN_ID)
  assert.equal(plugin.enabled, true)
  assert.equal(plugin.runnable, true)
  assert.deepEqual(plugin.config, {
    label: 'Deep work',
    minutes: 45,
    strictMode: true
  })

  const firstRun = await pluginService.runCommand(EXAMPLE_PLUGIN_ID, 'start')
  const secondRun = await pluginService.runCommand(EXAMPLE_PLUGIN_ID, 'start', { minutes: 15 })
  const reset = await pluginService.runCommand(EXAMPLE_PLUGIN_ID, 'reset')

  assert.deepEqual(firstRun, {
    ok: true,
    label: 'Deep work',
    minutes: 45,
    sessionsCompleted: 1,
    strictMode: true
  })
  assert.equal(secondRun.sessionsCompleted, 2)
  assert.equal(secondRun.minutes, 15)
  assert.deepEqual(reset, { ok: true, sessionsCompleted: 0 })
  assert.deepEqual(petEvents, [
    {
      text: 'Deep work started for 45 minutes. No distractions.',
      source: `plugin:${EXAMPLE_PLUGIN_ID}`
    },
    {
      text: 'Deep work started for 15 minutes. No distractions.',
      source: `plugin:${EXAMPLE_PLUGIN_ID}`
    },
    {
      text: 'Focus timer sessions reset.',
      source: `plugin:${EXAMPLE_PLUGIN_ID}`
    }
  ])
  assert.deepEqual(settingsService.get().plugins.storage[EXAMPLE_PLUGIN_ID], {
    sessionsCompleted: 0
  })
})
