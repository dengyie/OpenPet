const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createRuntimeView,
  createSetupRuntimeView,
  normalizeServiceHealthPolicy,
  getPluginSignatureStatus,
  normalizePluginConfig,
  getPluginStorageStats,
  listPlugins
} = require('../../src/main/services/plugin-service-state')

test('plugin service state normalizes periodic health policy bounds', () => {
  assert.deepEqual(
    normalizeServiceHealthPolicy(
      { enabled: true, intervalMs: '5' },
      { minIntervalMs: 15, maxIntervalMs: 30, defaultIntervalMs: 20 }
    ),
    { enabled: true, intervalMs: 15 }
  )

  assert.deepEqual(
    normalizeServiceHealthPolicy(
      { enabled: false, intervalMs: '1000' },
      { minIntervalMs: 15, maxIntervalMs: 30, defaultIntervalMs: 20 }
    ),
    { enabled: false, intervalMs: 30 }
  )

  assert.deepEqual(
    normalizeServiceHealthPolicy(
      { enabled: true, intervalMs: 'oops' },
      { minIntervalMs: 15, maxIntervalMs: 30, defaultIntervalMs: 20 }
    ),
    { enabled: true, intervalMs: 20 }
  )
})

test('plugin service state prefers installed signature metadata when present', () => {
  assert.deepEqual(
    getPluginSignatureStatus(
      {
        id: 'weather',
        source: 'local',
        signature: { signer: 'manifest-signer', algorithm: 'ed25519' }
      },
      { signatureStatus: 'hash-verified', signer: 'store-signer' }
    ),
    {
      status: 'hash-verified',
      label: 'File integrity checked (not a trusted source)',
      signer: 'store-signer',
      algorithm: ''
    }
  )
})

test('plugin service state normalizes config, storage stats, and list views', () => {
  const config = normalizePluginConfig(
    {
      properties: [
        { key: 'count', type: 'number' },
        { key: 'enabled', type: 'boolean' }
      ]
    },
    { count: '2', enabled: 1 },
    (value, field) => {
      if (field.type === 'number') return Number(value)
      if (field.type === 'boolean') return Boolean(value)
      return value
    }
  )
  assert.deepEqual(config, { count: 2, enabled: true })

  assert.deepEqual(
    getPluginStorageStats('weather', {
      getPluginStorage: () => ({ count: 2 }),
      getJsonByteSize: (value) => JSON.stringify(value).length
    }),
    { keyCount: 1, byteSize: 11, valid: true }
  )

  assert.deepEqual(
    getPluginStorageStats('weather', {
      getPluginStorage: () => {
        throw new Error('bad storage')
      },
      getJsonByteSize: () => 0
    }),
    { keyCount: 0, byteSize: 0, valid: false, error: 'bad storage' }
  )

  const entriesCalls = []
  const plugins = listPlugins({
    plugins: [{
      manifest: {
        id: 'weather',
        name: 'Weather',
        source: 'local',
        permissions: [],
        entries: { commands: [{ id: 'announce' }] }
      },
      configSchema: { properties: [{ key: 'count', type: 'number' }] },
      mainPath: ''
    }],
    enabledMap: { weather: true },
    decorateEntriesWithRuntime: (manifest) => {
      entriesCalls.push(manifest.id)
      return { ...manifest.entries, services: [] }
    },
    getPluginSignatureStatus: () => ({ status: 'unsigned' }),
    getPluginPolicyStatus: () => ({ blocked: false, reasons: [] }),
    getPluginConfig: () => ({ count: 2 }),
    getPluginStorageStats: () => ({ keyCount: 1, byteSize: 11, valid: true })
  })

  assert.deepEqual(entriesCalls, ['weather'])
  assert.equal(plugins[0].profile, 'runtime')
  assert.equal(plugins[0].enabled, true)
  assert.equal(plugins[0].runnable, true)
  assert.deepEqual(plugins[0].signatureStatus, { status: 'unsigned' })
  assert.deepEqual(plugins[0].config, { count: 2 })
  assert.deepEqual(plugins[0].storage, { keyCount: 1, byteSize: 11, valid: true })
})

test('plugin service state runtime helpers normalize unknown runtime payloads', () => {
  const createServiceHealthView = (health = {}, serviceEntry = {}) => ({
    status: typeof health.status === 'string' && health.status ? health.status : (serviceEntry.health?.url ? 'unknown' : 'not-configured'),
    checkedAt: typeof health.checkedAt === 'string' ? health.checkedAt : '',
    url: typeof health.url === 'string' ? health.url : (serviceEntry.health?.url || ''),
    statusCode: Number.isFinite(Number(health.statusCode)) ? Number(health.statusCode) : null,
    message: typeof health.message === 'string' ? health.message : ''
  })

  assert.deepEqual(
    createSetupRuntimeView({
      status: 'bad',
      lastRunAt: 42,
      exitCode: '1',
      error: null
    }),
    {
      status: 'not-run',
      lastRunAt: '',
      exitCode: 1,
      error: ''
    }
  )

  assert.deepEqual(
    createRuntimeView({
      status: 'bad',
      pid: '12',
      startedAt: 9,
      stoppedAt: null,
      command: ['node'],
      cwd: false,
      exitCode: '2',
      signal: 15,
      error: ['boom'],
      health: {
        status: '',
        checkedAt: 12,
        statusCode: '503',
        message: null
      }
    }, {
      health: {
        url: 'http://127.0.0.1:8787/health'
      }
    }, createServiceHealthView),
    {
      status: 'stopped',
      pid: 12,
      startedAt: '',
      stoppedAt: '',
      command: '',
      cwd: '',
      exitCode: 2,
      signal: '',
      error: '',
      health: {
        status: 'unknown',
        checkedAt: '',
        url: 'http://127.0.0.1:8787/health',
        statusCode: 503,
        message: ''
      }
    }
  )
})
