const test = require('node:test')
const assert = require('node:assert/strict')

test('cloneServiceStatus normalizes config logs through cloneServiceLogs', async () => {
  const { cloneServiceStatus } = await import('../../apps/control-center/src/lib/defaults.ts')

  assert.deepEqual(cloneServiceStatus({
    config: {
      enabled: true,
      host: '127.0.0.1',
      port: 4317,
      token: 'demo-token',
      logs: [
        {
          timestamp: '2026-06-29T00:00:01.000Z',
          method: 'POST',
          path: '/mcp',
          statusCode: '201',
          authorized: 1,
          remoteAddress: '127.0.0.1',
          error: null,
          ignored: 'internal'
        },
        {
          method: 'GET',
          statusCode: 'oops'
        }
      ]
    },
    runtime: {
      enabled: true,
      host: '127.0.0.1',
      port: 4317,
      mcp: { activeSessions: 1, sessionTtlMs: 5000 }
    }
  }), {
    config: {
      enabled: true,
      host: '127.0.0.1',
      port: 4317,
      token: 'demo-token',
      logs: [
        {
          id: '2026-06-29T00:00:01.000Z-POST-/mcp-201',
          timestamp: '2026-06-29T00:00:01.000Z',
          method: 'POST',
          path: '/mcp',
          statusCode: 201,
          authorized: true,
          remoteAddress: '127.0.0.1',
          error: ''
        }
      ]
    },
    runtime: {
      enabled: true,
      host: '127.0.0.1',
      port: 4317,
      mcp: { activeSessions: 1, sessionTtlMs: 5000 }
    }
  })
})
