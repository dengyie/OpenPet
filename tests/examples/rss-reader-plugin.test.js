const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createPluginInstallService } = require('../../src/main/services/plugin-install-service')
const { createPluginService } = require('../../src/main/services/plugin-service')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/rss-reader')
const EXAMPLE_PLUGIN_ID = 'openpet.example.rss-reader'

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

const rssFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>OpenPet Updates</title>
    <item>
      <title>Phase 22 lands</title>
      <link>https://openpet.example.com/releases/phase-22</link>
      <description><![CDATA[RSS example plugin ready.]]></description>
      <pubDate>Mon, 15 Jun 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Plugin guide expanded</title>
      <link>https://openpet.example.com/docs/plugins</link>
      <description>Developers can inspect tested examples.</description>
      <pubDate>Mon, 15 Jun 2026 09:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

test('rss reader example plugin can be inspected and installed disabled by default', async () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-rss-example-installed-'))
  const settingsService = createSettingsService()
  const installService = createPluginInstallService({ settingsService, pluginDir })

  const review = await installService.inspectPluginPackage(EXAMPLE_PLUGIN_PATH)

  assert.equal(review.sourceType, 'directory')
  assert.equal(review.installMode, 'install')
  assert.equal(review.plugin.id, EXAMPLE_PLUGIN_ID)
  assert.equal(review.plugin.main, 'index.js')
  assert.equal(review.plugin.configSchema, 'config.schema.json')
  assert.deepEqual(review.plugin.permissions, ['network', 'pet:say', 'storage'])
  assert.deepEqual(review.plugin.network.allowlist, ['feeds.example.com'])
  assert.deepEqual(review.plugin.commands.map((command) => command.id), ['refresh', 'latest'])
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

test('rss reader example plugin fetches and caches feed items through the local plugin service sdk', async () => {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-rss-example-installed-'))
  const settingsService = createSettingsService({
    plugins: {
      enabled: { [EXAMPLE_PLUGIN_ID]: true },
      config: {
        [EXAMPLE_PLUGIN_ID]: {
          feedPath: '/updates.xml',
          maxItems: 3,
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
          get: (name) => name.toLowerCase() === 'content-type' ? 'application/rss+xml' : ''
        },
        text: async () => rssFixture
      }
    }
  })

  const [plugin] = pluginService.listPlugins()
  assert.equal(plugin.id, EXAMPLE_PLUGIN_ID)
  assert.equal(plugin.enabled, true)
  assert.equal(plugin.runnable, true)
  assert.deepEqual(plugin.network.allowlist, ['feeds.example.com'])
  assert.deepEqual(plugin.config, {
    feedPath: '/updates.xml',
    maxItems: 3,
    announce: true
  })

  const refresh = await pluginService.runCommand(EXAMPLE_PLUGIN_ID, 'refresh', {
    feedPath: '/release.xml',
    maxItems: 2
  })
  const latest = await pluginService.runCommand(EXAMPLE_PLUGIN_ID, 'latest')

  const items = [
    {
      title: 'Phase 22 lands',
      link: 'https://openpet.example.com/releases/phase-22',
      publishedAt: 'Mon, 15 Jun 2026 10:00:00 GMT',
      summary: 'RSS example plugin ready.'
    },
    {
      title: 'Plugin guide expanded',
      link: 'https://openpet.example.com/docs/plugins',
      publishedAt: 'Mon, 15 Jun 2026 09:30:00 GMT',
      summary: 'Developers can inspect tested examples.'
    }
  ]

  assert.deepEqual(fetchCalls, [
    {
      url: 'https://feeds.example.com/release.xml',
      options: {
        method: 'GET',
        headers: {
          accept: 'application/rss+xml, application/xml, text/xml'
        },
        redirect: 'manual'
      }
    }
  ])
  assert.deepEqual(refresh, {
    ok: true,
    title: 'OpenPet Updates',
    sourceUrl: 'https://feeds.example.com/release.xml',
    itemCount: 2,
    items,
    refreshCount: 1
  })
  assert.deepEqual(latest, {
    ok: true,
    title: 'OpenPet Updates',
    sourceUrl: 'https://feeds.example.com/release.xml',
    item: items[0]
  })
  assert.deepEqual(petEvents, [
    {
      text: 'OpenPet Updates: Phase 22 lands. RSS example plugin ready.',
      source: `plugin:${EXAMPLE_PLUGIN_ID}`,
      sourceSurface: 'plugin-runtime'
    },
    {
      text: 'OpenPet Updates: Phase 22 lands. RSS example plugin ready.',
      source: `plugin:${EXAMPLE_PLUGIN_ID}`,
      sourceSurface: 'plugin-runtime'
    }
  ])
  assert.deepEqual(settingsService.get().plugins.storage[EXAMPLE_PLUGIN_ID], {
    lastFeed: {
      title: 'OpenPet Updates',
      sourceUrl: 'https://feeds.example.com/release.xml',
      items
    },
    refreshCount: 1
  })
})
