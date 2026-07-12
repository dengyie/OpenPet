const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createPluginInstallService } = require('../../src/main/services/plugin-install-service')
const { createPluginService } = require('../../src/main/services/plugin-service')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/weather-status')
const EXAMPLE_PLUGIN_ID = 'openpet.example.weather-status'

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

const installAndEnableExamplePlugin = async ({ settingsService, pluginDir }) => {
  const installService = createPluginInstallService({ settingsService, pluginDir })
  const review = await installService.inspectPluginPackage(EXAMPLE_PLUGIN_PATH)
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
}

test('weather status example plugin can be inspected and installed disabled by default', async () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-weather-example-installed-'))
  const settingsService = createSettingsService()
  const installService = createPluginInstallService({ settingsService, pluginDir })

  const review = await installService.inspectPluginPackage(EXAMPLE_PLUGIN_PATH)

  assert.equal(review.sourceType, 'directory')
  assert.equal(review.installMode, 'install')
  assert.equal(review.plugin.id, EXAMPLE_PLUGIN_ID)
  assert.equal(review.plugin.main, 'index.js')
  assert.equal(review.plugin.configSchema, 'config.schema.json')
  assert.deepEqual(review.plugin.permissions, ['network', 'pet:say', 'storage'])
  assert.deepEqual(review.plugin.network.allowlist, ['api.weather.example.com'])
  assert.deepEqual(review.plugin.commands.map((command) => command.id), ['refresh', 'last'])
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

test('weather status example plugin runs network and storage through the local plugin service sdk', async () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-weather-example-installed-'))
  const settingsService = createSettingsService({
    plugins: {
      enabled: { [EXAMPLE_PLUGIN_ID]: true },
      config: {
        [EXAMPLE_PLUGIN_ID]: {
          location: 'Tokyo',
          units: 'metric',
          announce: true
        }
      }
    }
  })
  await installAndEnableExamplePlugin({ settingsService, pluginDir })

  const petEvents = []
  const fetchCalls = []
  const pluginService = createPluginService({
    settingsService,
    petService: {
      say: async (payload) => petEvents.push(payload)
    },
    pluginDirs: [pluginDir],
    resolveAddress: async () => ['203.0.113.10'],
    pluginNetworkConnect: async ({ url, request }) => {
      fetchCalls.push({ url, options: { ...request, redirect: 'manual' } })
      return {
        ok: true,
        status: 200,
        url,
        headers: {
          get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : ''
        },
        text: async () => JSON.stringify({
          location: 'Berlin',
          condition: 'Sunny',
          temperature: 22,
          humidity: 40
        })
      }
    }
  })

  const [plugin] = pluginService.listPlugins()
  assert.equal(plugin.id, EXAMPLE_PLUGIN_ID)
  assert.equal(plugin.enabled, true)
  assert.equal(plugin.runnable, true)
  assert.deepEqual(plugin.network.allowlist, ['api.weather.example.com'])
  assert.deepEqual(plugin.config, {
    location: 'Tokyo',
    units: 'metric',
    announce: true
  })

  const refresh = await pluginService.runCommand(EXAMPLE_PLUGIN_ID, 'refresh', {
    location: 'Berlin',
    units: 'imperial'
  })
  const last = await pluginService.runCommand(EXAMPLE_PLUGIN_ID, 'last')

  assert.deepEqual(fetchCalls, [
    {
      url: 'https://api.weather.example.com/v1/current?location=Berlin&units=imperial',
      options: {
        method: 'GET',
        headers: {
          accept: 'application/json'
        },
        redirect: 'manual'
      }
    }
  ])
  assert.deepEqual(refresh, {
    ok: true,
    location: 'Berlin',
    units: 'imperial',
    condition: 'Sunny',
    temperature: 22,
    humidity: 40,
    refreshCount: 1
  })
  assert.deepEqual(last, {
    ok: true,
    location: 'Berlin',
    units: 'imperial',
    condition: 'Sunny',
    temperature: 22,
    humidity: 40
  })
  assert.deepEqual(petEvents, [
    {
      text: 'Berlin: Sunny, 22F. Humidity 40%.',
      source: `plugin:${EXAMPLE_PLUGIN_ID}`,
      sourceSurface: 'plugin-runtime'
    },
    {
      text: 'Berlin: Sunny, 22F. Humidity 40%.',
      source: `plugin:${EXAMPLE_PLUGIN_ID}`,
      sourceSurface: 'plugin-runtime'
    }
  ])
  assert.deepEqual(settingsService.get().plugins.storage[EXAMPLE_PLUGIN_ID], {
    lastWeather: {
      location: 'Berlin',
      units: 'imperial',
      condition: 'Sunny',
      temperature: 22,
      humidity: 40
    },
    refreshCount: 1
  })
})
