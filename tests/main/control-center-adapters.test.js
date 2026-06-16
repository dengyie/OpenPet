const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createCatalogBlocklistResult,
  createLocalHttpConfigView,
  createLocalHttpRuntimeView,
  createPluginMutationResult,
  createServiceStatusView
} = require('../../src/main/control-center-adapters')

test('createServiceStatusView normalizes local HTTP config and runtime for Control Center', () => {
  const status = createServiceStatusView(
    {
      enabled: 1,
      port: '4317',
      token: 'secret-token',
      logs: [{ id: '1', timestamp: 'now', method: 'GET', path: '/api/status', statusCode: 200, authorized: true, remoteAddress: '127.0.0.1', error: '' }]
    },
    {
      enabled: true,
      host: 'localhost',
      port: '4318',
      mcp: { activeSessions: '2', sessionTtlMs: '30000' }
    }
  )

  assert.deepEqual(status, {
    config: {
      enabled: true,
      host: '127.0.0.1',
      port: 4317,
      token: 'secret-token',
      logs: [{ id: '1', timestamp: 'now', method: 'GET', path: '/api/status', statusCode: 200, authorized: true, remoteAddress: '127.0.0.1', error: '' }]
    },
    runtime: {
      enabled: true,
      host: 'localhost',
      port: 4318,
      mcp: { activeSessions: 2, sessionTtlMs: 30000 }
    }
  })
})

test('local HTTP view adapters provide stable defaults for missing fields', () => {
  assert.deepEqual(createLocalHttpConfigView(), {
    enabled: false,
    host: '127.0.0.1',
    port: 0,
    token: '',
    logs: []
  })
  assert.deepEqual(createLocalHttpRuntimeView(), {
    enabled: false,
    host: '127.0.0.1',
    port: 0,
    mcp: { activeSessions: 0, sessionTtlMs: 0 }
  })
})

test('createCatalogBlocklistResult preserves catalog and blocklist payload identity', () => {
  const catalog = {
    schemaVersion: 1,
    updatedAt: '2026-06-17T00:00:00.000Z',
    feedbackUrl: '',
    localBlocklist: { pluginIds: [], packIds: [], sha256: [] },
    catalogBlocklist: { pluginIds: [], packIds: [], sha256: [] },
    blocklist: { pluginIds: [], packIds: [], sha256: [] },
    plugins: [],
    petPacks: []
  }
  const blocklist = { pluginIds: ['openpet.demo'], packIds: [], sha256: [] }

  assert.deepEqual(createCatalogBlocklistResult(catalog, blocklist), { catalog, blocklist })
})

test('createPluginMutationResult packages mutation metadata with refreshed plugins', () => {
  const plugins = [{
    id: 'openpet.demo',
    name: 'Demo',
    version: '1.0.0',
    source: 'local',
    enabled: false,
    runnable: true,
    permissions: ['pet:say'],
    commands: [],
    configSchema: { properties: [] },
    config: {},
    storage: { keyCount: 0, byteSize: 0 },
    signatureStatus: { label: 'Unsigned' }
  }]

  assert.deepEqual(createPluginMutationResult({
    ok: true,
    pluginId: 'openpet.demo',
    installMode: 'update',
    disabled: true,
    storageRemoved: false
  }, plugins), {
    ok: true,
    pluginId: 'openpet.demo',
    installMode: 'update',
    disabled: true,
    storageRemoved: false,
    plugins
  })
})
