const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createLocalHttpConfigService,
  normalizeLocalHttpConfig
} = require('../../src/main/services/local-http-config-service')

const clone = (value) => JSON.parse(JSON.stringify(value))

const createHarness = ({
  initialSettings = { localHttp: {} },
  initialStatus = { enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } }
} = {}) => {
  const events = []
  let settings = clone(initialSettings)
  let status = clone(initialStatus)

  const service = createLocalHttpConfigService({
    petService: {
      getSettings: () => {
        events.push('getSettings')
        return settings
      },
      saveSettings: (nextSettings) => {
        events.push(['saveSettings', clone(nextSettings.localHttp)])
        settings = clone(nextSettings)
        return settings
      }
    },
    localHttpService: {
      getStatus: () => {
        events.push('getStatus')
        return status
      },
      start: async (config) => {
        events.push(['start', clone(config)])
        status = {
          enabled: true,
          host: config.host,
          port: config.port,
          mcp: { activeSessions: 2, sessionTtlMs: 3000 }
        }
        return status
      },
      stop: async () => {
        events.push('stop')
        status = { enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } }
        return status
      },
      revokeMcpSessions: () => {
        events.push('revokeMcpSessions')
        return { activeSessions: 0, sessionTtlMs: 5000 }
      }
    },
    createToken: () => 'generated-token'
  })

  return {
    events,
    getSettings: () => settings,
    service
  }
}

test('normalizeLocalHttpConfig pins loopback host and generates token only when needed', () => {
  assert.deepEqual(
    normalizeLocalHttpConfig({}, { enabled: true, host: '0.0.0.0', port: '4317' }, { createToken: () => 'new-token' }),
    {
      enabled: true,
      host: '127.0.0.1',
      port: 4317,
      token: 'new-token'
    }
  )

  assert.deepEqual(
    normalizeLocalHttpConfig({ enabled: true, port: 3000, token: 'existing-token' }, { enabled: false }),
    {
      enabled: false,
      host: '127.0.0.1',
      port: 3000,
      token: 'existing-token'
    }
  )
})

test('local http config service saves config after starting runtime', async () => {
  const { events, getSettings, service } = createHarness({
    initialSettings: {
      theme: 'system',
      localHttp: { enabled: false, token: 'old-token' }
    }
  })

  const result = await service.saveConfig({ enabled: true, port: '4317' })

  assert.deepEqual(events.map((event) => Array.isArray(event) ? event[0] : event), [
    'getSettings',
    'start',
    'saveSettings',
    'getStatus'
  ])
  assert.deepEqual(events[1][1], {
    enabled: true,
    host: '127.0.0.1',
    port: 4317,
    token: 'old-token'
  })
  assert.deepEqual(getSettings().localHttp, {
    enabled: true,
    host: '127.0.0.1',
    port: 4317,
    token: 'old-token'
  })
  assert.equal(result.config.port, 4317)
  assert.equal(result.runtime.enabled, true)
  assert.equal(result.runtime.port, 4317)
})

test('local http config service rotates token and restarts enabled runtime', async () => {
  const { events, getSettings, service } = createHarness({
    initialSettings: {
      localHttp: { enabled: true, port: 4317, token: 'old-token' }
    }
  })

  const result = await service.rotateToken()

  assert.deepEqual(events.map((event) => Array.isArray(event) ? event[0] : event), [
    'getSettings',
    'start',
    'saveSettings',
    'getStatus'
  ])
  assert.equal(events[1][1].token, 'generated-token')
  assert.equal(getSettings().localHttp.token, 'generated-token')
  assert.equal(result.config.token, 'generated-token')
})

test('local http config service revokes mcp sessions in status view', () => {
  const { service } = createHarness({
    initialSettings: {
      localHttp: { enabled: true, port: 4317, token: 'token' }
    },
    initialStatus: {
      enabled: true,
      host: 'localhost',
      port: '4317',
      mcp: { activeSessions: 3, sessionTtlMs: 5000 }
    }
  })

  const result = service.revokeMcpSessions()

  assert.deepEqual(result.runtime.mcp, { activeSessions: 0, sessionTtlMs: 5000 })
  assert.equal(result.config.token, 'token')
})
