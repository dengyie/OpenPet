const test = require('node:test')
const assert = require('node:assert/strict')
const { IPC } = require('../../apps/desktop/src/shared/ipc-channels')
const { registerServiceIpc } = require('../../apps/desktop/src/ipc/register-service-ipc')

function createHarness(initialSettings, { normalize = (_current, next) => ({ ..._current, ...next }), backendStatuses = [], initialBackendState = 'ready' } = {}) {
  const handlers = new Map()
  const requests = []
  const transitions = []
  let settings = initialSettings
  let backendIndex = 0
  let backendState = initialBackendState
  const coordinator = {
    getBackend: () => ({ baseUrl: `http://127.0.0.1:${backendIndex + 3200}/api/v1`, sessionToken: `session-${backendIndex}` }),
    getState: () => ({ status: backendState }),
    stop: async () => { transitions.push('stop'); backendState = 'stopped' },
    start: async () => { transitions.push('start'); backendIndex += 1; backendState = 'ready' },
  }
  registerServiceIpc({
    ipcMainService: { handle: (channel, listener) => handlers.set(channel, listener) },
    petService: {
      getSettings: () => settings,
      saveSettings: (next) => { settings = next; return settings },
    },
    localHttpService: new Proxy({}, { get: () => () => { throw new Error('local HTTP service should not be called') } }),
    normalizeLocalHttpConfig: normalize,
    createLocalHttpToken: () => 'replacement-token',
    createServiceStatusView: (config, runtime) => ({ config, runtime }),
    sidecarRuntimeCoordinator: coordinator,
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      if (url.endsWith('/service/status')) {
        const status = backendStatuses[backendIndex] || { enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } }
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, data: status }) }
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, data: {} }) }
    },
  })
  return { handlers, requests, transitions, getSettings: () => settings }
}

test('changing Backend target restarts first, reads status from the new Backend, and never PUTs remote fields', async () => {
  const harness = createHarness({ localHttp: { enabled: true, host: '127.0.0.1', port: 8341, token: 'local-token', backendMode: 'local', sshAlias: 'gz-cvm', backendPort: 48330 } }, {
    backendStatuses: [
      { enabled: false, host: 'old-backend', port: 1, mcp: { activeSessions: 0, sessionTtlMs: 0 } },
      { enabled: true, host: '127.0.0.1', port: 8341, mcp: { activeSessions: 2, sessionTtlMs: 1000 } },
    ],
  })
  const result = await harness.handlers.get(IPC.SERVICE_SAVE_CONFIG)(null, {
    enabled: true, host: '127.0.0.1', port: 8341, token: 'local-token',
    backendMode: 'remote', sshAlias: 'gz-cvm', backendPort: 48330,
  })
  assert.deepEqual(harness.transitions, ['stop', 'start'])
  assert.equal(result.runtime.port, 8341)
  assert.equal(harness.requests.some(({ url }) => url.endsWith('/service/config')), false)
  assert.equal(harness.requests.at(-1).url.startsWith('http://127.0.0.1:3201/'), true)
  assert.equal(harness.getSettings().localHttp.backendMode, 'remote')
})

test('ordinary service edits send only Backend-owned HTTP settings', async () => {
  const harness = createHarness({ localHttp: { enabled: false, host: '127.0.0.1', port: 0, token: 'local-token', backendMode: 'remote', sshAlias: 'gz-cvm', backendPort: 48330 } })
  await harness.handlers.get(IPC.SERVICE_SAVE_CONFIG)(null, { enabled: true, port: 8342 })
  const configRequest = harness.requests.find(({ url }) => url.endsWith('/service/config'))
  assert.deepEqual(JSON.parse(configRequest.options.body), {
    enabled: true,
    host: '127.0.0.1',
    port: 8342,
    token: 'local-token',
  })
  assert.deepEqual(harness.transitions, [])
})

test('saving the unchanged remote target reconnects when the coordinator is degraded', async () => {
  const harness = createHarness({ localHttp: { enabled: false, host: '127.0.0.1', port: 0, token: 'local-token', backendMode: 'remote', sshAlias: 'gz-cvm', backendPort: 48330 } }, {
    initialBackendState: 'degraded',
    backendStatuses: [
      { enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } },
    ],
  })
  await harness.handlers.get(IPC.SERVICE_SAVE_CONFIG)(null, {
    enabled: false, host: '127.0.0.1', port: 0, token: 'local-token',
    backendMode: 'remote', sshAlias: 'gz-cvm', backendPort: 48330,
  })
  assert.deepEqual(harness.transitions, ['stop', 'start'])
  assert.equal(harness.requests.some(({ url }) => url.endsWith('/service/config')), false)
  assert.equal(harness.requests.at(-1).url.startsWith('http://127.0.0.1:3201/'), true)
})

test('rejects invalid SSH alias and remote port before persisting settings', async () => {
  const harness = createHarness({ localHttp: { enabled: false, host: '127.0.0.1', port: 0, token: 'local-token', backendMode: 'local', sshAlias: 'gz-cvm', backendPort: 48330 } })
  await assert.rejects(harness.handlers.get(IPC.SERVICE_SAVE_CONFIG)(null, { backendMode: 'remote', sshAlias: 'gz-cvm; touch /tmp/x' }), /invalid SSH alias/)
  await assert.rejects(harness.handlers.get(IPC.SERVICE_SAVE_CONFIG)(null, { backendMode: 'remote', sshAlias: 'gz-cvm', backendPort: 0 }), /port must be between/)
  assert.equal(harness.getSettings().localHttp.backendMode, 'local')
  assert.deepEqual(harness.requests, [])
})
