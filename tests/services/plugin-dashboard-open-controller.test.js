const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginDashboardOpenController } = require('../../src/main/services/plugin-dashboard-open-controller')

const createController = (overrides = {}) => {
  const openedUrls = []
  const logs = []
  const controller = createPluginDashboardOpenController({
    appendLog: (entry) => logs.push(entry),
    openExternal: async (url) => {
      openedUrls.push(url)
      return true
    },
    getDashboardEntry: (_plugin, dashboardId) => ({
      id: dashboardId,
      url: 'http://127.0.0.1:8787/'
    }),
    ...overrides
  })

  return { controller, logs, openedUrls }
}

test('dashboard open controller opens http dashboard urls and logs success', async () => {
  const { controller, logs, openedUrls } = createController()

  const result = await controller.open({
    plugin: { manifest: { id: 'weather-declaration' } },
    pluginId: 'weather-declaration',
    dashboardId: 'main'
  })

  assert.deepEqual(openedUrls, ['http://127.0.0.1:8787/'])
  assert.deepEqual(result, {
    ok: true,
    pluginId: 'weather-declaration',
    dashboardId: 'main',
    url: 'http://127.0.0.1:8787/'
  })
  assert.deepEqual(logs.map((entry) => entry.message), ['Dashboard opened'])
})

test('dashboard open controller rejects non-http urls before opening', async () => {
  const { controller, logs, openedUrls } = createController({
    getDashboardEntry: (_plugin, dashboardId) => ({
      id: dashboardId,
      url: 'file:///tmp/dashboard.html'
    })
  })

  await assert.rejects(
    () => controller.open({
      plugin: { manifest: { id: 'weather-declaration' } },
      pluginId: 'weather-declaration',
      dashboardId: 'main'
    }),
    /Plugin dashboard URL must use HTTP or HTTPS/
  )

  assert.deepEqual(openedUrls, [])
  assert.deepEqual(logs.map((entry) => entry.message), ['Plugin dashboard URL must use HTTP or HTTPS'])
})

test('dashboard open controller rejects invalid urls and logs failure', async () => {
  const { controller, logs } = createController({
    getDashboardEntry: (_plugin, dashboardId) => ({
      id: dashboardId,
      url: 'not a url'
    })
  })

  await assert.rejects(
    () => controller.open({
      plugin: { manifest: { id: 'weather-declaration' } },
      pluginId: 'weather-declaration',
      dashboardId: 'main'
    }),
    /Plugin dashboard URL is invalid/
  )

  assert.deepEqual(logs.map((entry) => entry.message), ['Plugin dashboard URL is invalid'])
})
