const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('http')

const { createLocalHttpService } = require('../../src/main/services/local-http-service')

const TEST_TOKEN = 'test-token'

const createSettingsService = (initialSettings = {}) => {
  let current = {
    localHttp: {
      enabled: false,
      host: '127.0.0.1',
      port: 0,
      token: '',
      logs: []
    },
    ...initialSettings
  }

  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

const getAvailablePort = () => new Promise((resolve, reject) => {
  const server = http.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    server.close(() => resolve(port))
  })
})

const requestJson = async (url, { method = 'GET', body, token, headers = {} } = {}) => {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  })
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json()
  }
}

test('local http service starts on loopback and returns runtime status', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({ settings: { scale: 1 }, actions: { actions: [] } }),
      say: () => {}
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const result = await requestJson(`http://${started.host}:${started.port}/api/status`)
    const authenticatedResult = await requestJson(`http://${started.host}:${started.port}/api/status`, { token: TEST_TOKEN })
    const headerAuthenticatedResult = await requestJson(`http://${started.host}:${started.port}/api/status`, { headers: { 'X-OpenPet-Token': TEST_TOKEN } })
    const legacyHeaderAuthenticatedResult = await requestJson(`http://${started.host}:${started.port}/api/status`, { headers: { 'X-iBot-Token': TEST_TOKEN } })

    assert.equal(started.host, '127.0.0.1')
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, true)
    assert.equal(result.body.service.host, '127.0.0.1')
    assert.equal(result.body.snapshot, undefined)
    assert.equal(authenticatedResult.body.snapshot.settings.scale, 1)
    assert.equal(headerAuthenticatedResult.body.snapshot.settings.scale, 1)
    assert.equal(legacyHeaderAuthenticatedResult.body.snapshot.settings.scale, 1)
  } finally {
    await service.stop()
  }
})

test('local http service rejects non-loopback hosts', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: () => {}
    }
  })

  await assert.rejects(
    () => service.start({ enabled: true, host: '0.0.0.0', port: 0, token: TEST_TOKEN }),
    /loopback/
  )
})

test('local http service rejects invalid ports', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: () => {}
    }
  })

  await assert.rejects(
    () => service.start({ enabled: true, host: '127.0.0.1', port: 70000, token: TEST_TOKEN }),
    /port/
  )
})

test('local http service keeps the previous server when replacement start fails', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: () => {}
    }
  })
  const blocker = http.createServer((_request, response) => response.end('busy'))

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    await new Promise((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(0, '127.0.0.1', resolve)
    })
    const blockedPort = blocker.address().port

    await assert.rejects(
      () => service.start({ enabled: true, host: '127.0.0.1', port: blockedPort, token: 'new-token' }),
      /EADDRINUSE|listen/
    )

    const status = service.getStatus()
    assert.equal(status.enabled, true)
    assert.equal(status.port, started.port)
  } finally {
    await service.stop()
    await new Promise((resolve) => blocker.close(resolve))
  }
})

test('local http service updates token in place when restarting the same fixed port', async () => {
  const sayEvents = []
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => {
        sayEvents.push(payload)
        return payload
      }
    }
  })

  try {
    const port = await getAvailablePort()
    const started = await service.start({ enabled: true, host: '127.0.0.1', port, token: TEST_TOKEN })
    const restarted = await service.start({ enabled: true, host: '127.0.0.1', port, token: 'new-token' })
    const oldTokenResult = await requestJson(`http://${started.host}:${started.port}/api/pet/say`, {
      method: 'POST',
      body: { text: 'old token' },
      token: TEST_TOKEN
    })
    const newTokenResult = await requestJson(`http://${started.host}:${started.port}/api/pet/say`, {
      method: 'POST',
      body: { text: 'new token' },
      token: 'new-token'
    })

    assert.equal(restarted.port, port)
    assert.equal(oldTokenResult.status, 401)
    assert.equal(newTokenResult.status, 200)
    assert.deepEqual(sayEvents, [{ text: 'new token', ttlMs: undefined, source: 'http', sourceSurface: 'local-http' }])
  } finally {
    await service.stop()
  }
})

test('local http service requires a token before starting', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: () => {}
    }
  })

  await assert.rejects(
    () => service.start({ enabled: true, host: '127.0.0.1', port: 0 }),
    /token/
  )
})

test('local http service exposes pet say endpoint', async () => {
  const sayEvents = []
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => {
        sayEvents.push(payload)
        return payload
      }
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const result = await requestJson(`http://${started.host}:${started.port}/api/pet/say`, {
      method: 'POST',
      body: { text: 'hello api', ttlMs: 1200 },
      token: TEST_TOKEN
    })

    assert.equal(result.status, 200)
    assert.deepEqual(result.body, {
      ok: true,
      result: { text: 'hello api', ttlMs: 1200, source: 'http', sourceSurface: 'local-http' }
    })
    assert.deepEqual(sayEvents, [{ text: 'hello api', ttlMs: 1200, source: 'http', sourceSurface: 'local-http' }])
  } finally {
    await service.stop()
  }
})

test('local http service exposes pet action and event endpoints', async () => {
  const intents = []
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: () => {},
      playAction: (payload) => {
        intents.push(['action', payload])
        return payload
      },
      setEvent: (payload) => {
        intents.push(['event', payload])
        return payload
      }
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const actionResult = await requestJson(`http://${started.host}:${started.port}/api/pet/action`, {
      method: 'POST',
      body: { actionId: 'idle' },
      token: TEST_TOKEN
    })
    const eventResult = await requestJson(`http://${started.host}:${started.port}/api/pet/event`, {
      method: 'POST',
      body: { type: 'status', message: 'working', ttlMs: 900 },
      token: TEST_TOKEN
    })

    assert.equal(actionResult.status, 200)
    assert.equal(eventResult.status, 200)
    assert.deepEqual(intents, [
      ['action', { actionId: 'idle', source: 'http' }],
      ['event', { type: 'status', message: 'working', ttlMs: 900, source: 'http' }]
    ])
  } finally {
    await service.stop()
  }
})

test('local http service rejects mutating requests without a valid token', async () => {
  const sayEvents = []
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => {
        sayEvents.push(payload)
        return payload
      }
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const missingToken = await requestJson(`http://${started.host}:${started.port}/api/pet/say`, {
      method: 'POST',
      body: { text: 'nope' }
    })
    const wrongToken = await requestJson(`http://${started.host}:${started.port}/api/pet/say`, {
      method: 'POST',
      body: { text: 'nope' },
      token: 'wrong-token'
    })

    assert.equal(missingToken.status, 401)
    assert.equal(wrongToken.status, 401)
    assert.deepEqual(sayEvents, [])
  } finally {
    await service.stop()
  }
})

test('local http service rejects browser-simple text posts before side effects', async () => {
  const sayEvents = []
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => {
        sayEvents.push(payload)
        return payload
      }
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const response = await fetch(`http://${started.host}:${started.port}/api/pet/say`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ text: 'cross-site simple request' })
    })

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { ok: false, error: 'Unauthorized' })
    assert.deepEqual(sayEvents, [])
  } finally {
    await service.stop()
  }
})

test('local http service rejects non-json mutating requests with a valid token', async () => {
  const sayEvents = []
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => {
        sayEvents.push(payload)
        return payload
      }
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const response = await fetch(`http://${started.host}:${started.port}/api/pet/say`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        Authorization: `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({ text: 'wrong content type' })
    })

    assert.equal(response.status, 415)
    assert.deepEqual(await response.json(), { ok: false, error: 'Content-Type must be application/json' })
    assert.deepEqual(sayEvents, [])
  } finally {
    await service.stop()
  }
})

test('local http service returns 404 json for unknown routes', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: () => {}
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const result = await requestJson(`http://${started.host}:${started.port}/api/missing`)

    assert.equal(result.status, 404)
    assert.deepEqual(result.body, { ok: false, error: 'Not found' })
  } finally {
    await service.stop()
  }
})

test('local http service records access logs without token values', async () => {
  const settingsService = createSettingsService()
  const service = createLocalHttpService({
    settingsService,
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => payload
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    await requestJson(`http://${started.host}:${started.port}/api/status`)
    await requestJson(`http://${started.host}:${started.port}/api/pet/say`, {
      method: 'POST',
      body: { text: 'nope' },
      token: 'wrong-token'
    })

    const logs = service.getLogs()
    assert.equal(logs.length, 2)
    assert.deepEqual(logs.map((log) => [log.method, log.path, log.statusCode, log.authorized]), [
      ['GET', '/api/status', 200, false],
      ['POST', '/api/pet/say', 401, false]
    ])
    assert.equal(JSON.stringify(logs).includes(TEST_TOKEN), false)
    assert.equal(JSON.stringify(logs).includes('wrong-token'), false)
    assert.equal(settingsService.get().localHttp.logs.length, 2)
  } finally {
    await service.stop()
  }
})

test('local http service filters exports and clears access logs', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => payload
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    await requestJson(`http://${started.host}:${started.port}/api/status`, { token: TEST_TOKEN })
    await requestJson(`http://${started.host}:${started.port}/api/missing`)

    assert.equal(service.getLogs({ status: '404' }).length, 1)
    assert.match(service.exportLogs({ format: 'csv' }), /^timestamp,method,path,statusCode,authorized,remoteAddress,error\n/)
    assert.match(service.exportLogs({ query: 'missing' }), /\/api\/missing/)
    assert.deepEqual(service.clearLogs(), [])
    assert.deepEqual(service.getLogs(), [])
  } finally {
    await service.stop()
  }
})

test('local http service honors a zero access log limit', async () => {
  const service = createLocalHttpService({
    maxAccessLogs: 0,
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => payload
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    await requestJson(`http://${started.host}:${started.port}/api/status`)

    assert.deepEqual(service.getLogs(), [])
  } finally {
    await service.stop()
  }
})

test('local http service trims preloaded access logs by configured limit', () => {
  const settingsService = createSettingsService({
    localHttp: {
      enabled: false,
      host: '127.0.0.1',
      port: 0,
      token: '',
      logs: [
        { id: 'one', timestamp: '2026-06-12T00:00:00.000Z', method: 'GET', path: '/one', statusCode: 200 },
        { id: 'two', timestamp: '2026-06-12T00:00:01.000Z', method: 'GET', path: '/two', statusCode: 200 }
      ]
    }
  })
  const service = createLocalHttpService({
    settingsService,
    maxAccessLogs: 1,
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => payload
    }
  })

  assert.deepEqual(service.getLogs().map((log) => log.id), ['two'])
})

test('local http service exposes mcp tools behind token and session', async () => {
  const sayEvents = []
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({ settings: { scale: 1 }, actions: { actions: [] } }),
      say: (payload) => {
        sayEvents.push(payload)
        return payload
      },
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const endpoint = `http://${started.host}:${started.port}/mcp`
    const unauthorized = await requestJson(endpoint, {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method: 'initialize' }
    })
    const initialized = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      body: { jsonrpc: '2.0', id: 1, method: 'initialize' }
    })
    const sessionId = initialized.headers.get('mcp-session-id')
    const missingSession = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    })
    const tools = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      headers: { 'Mcp-Session-Id': sessionId },
      body: { jsonrpc: '2.0', id: 3, method: 'tools/list' }
    })
    const call = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      headers: { 'Mcp-Session-Id': sessionId },
      body: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'openpet.say', arguments: { text: 'hello mcp', ttlMs: 700 } }
      }
    })

    assert.equal(unauthorized.status, 401)
    assert.equal(initialized.status, 200)
    assert.equal(Boolean(sessionId), true)
    assert.equal(initialized.body.result.serverInfo.name, 'openpet')
    assert.equal(missingSession.status, 401)
    assert.equal(tools.status, 200)
    assert.deepEqual(tools.body.result.tools.map((tool) => tool.name), [
      'openpet.status',
      'openpet.say',
      'openpet.play_action',
      'openpet.set_event'
    ])
    assert.equal(call.status, 200)
    assert.deepEqual(call.body.result.structuredContent, { text: 'hello mcp', ttlMs: 700, source: 'mcp', sourceSurface: 'mcp-tool' })
    assert.deepEqual(sayEvents, [{ text: 'hello mcp', ttlMs: 700, source: 'mcp', sourceSurface: 'mcp-tool' }])
  } finally {
    await service.stop()
  }
})

test('local http service clears mcp sessions when the token changes in place', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    }
  })

  try {
    const port = await getAvailablePort()
    const started = await service.start({ enabled: true, host: '127.0.0.1', port, token: TEST_TOKEN })
    const endpoint = `http://${started.host}:${started.port}/mcp`
    const initialized = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      body: { jsonrpc: '2.0', id: 1, method: 'initialize' }
    })
    const sessionId = initialized.headers.get('mcp-session-id')

    await service.start({ enabled: true, host: '127.0.0.1', port, token: 'new-token' })

    const oldToken = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      headers: { 'Mcp-Session-Id': sessionId },
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    })
    const newTokenOldSession = await requestJson(endpoint, {
      method: 'POST',
      token: 'new-token',
      headers: { 'Mcp-Session-Id': sessionId },
      body: { jsonrpc: '2.0', id: 3, method: 'tools/list' }
    })

    assert.equal(oldToken.status, 401)
    assert.equal(newTokenOldSession.status, 401)
  } finally {
    await service.stop()
  }
})

test('local http service validates mcp tool arguments before side effects', async () => {
  const sayEvents = []
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => {
        sayEvents.push(payload)
        return payload
      },
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const endpoint = `http://${started.host}:${started.port}/mcp`
    const initialized = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      body: { jsonrpc: '2.0', id: 1, method: 'initialize' }
    })
    const invalidCall = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      headers: { 'Mcp-Session-Id': initialized.headers.get('mcp-session-id') },
      body: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'openpet.say', arguments: { text: '' } }
      }
    })

    assert.equal(invalidCall.status, 200)
    assert.equal(invalidCall.body.error.code, -32602)
    assert.deepEqual(sayEvents, [])
  } finally {
    await service.stop()
  }
})

test('local http service expires mcp sessions by ttl', async () => {
  let now = 1000
  const service = createLocalHttpService({
    nowMs: () => now,
    mcpSessionTtlMs: 50,
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const endpoint = `http://${started.host}:${started.port}/mcp`
    const initialized = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      body: { jsonrpc: '2.0', id: 1, method: 'initialize' }
    })
    const sessionId = initialized.headers.get('mcp-session-id')
    now += 51
    const expired = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      headers: { 'Mcp-Session-Id': sessionId },
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    })

    assert.equal(expired.status, 401)
    assert.equal(service.getStatus().mcp.activeSessions, 0)
  } finally {
    await service.stop()
  }
})

test('local http service exposes authenticated mcp stream handshake', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const endpoint = `http://${started.host}:${started.port}/mcp`
    const initialized = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      body: { jsonrpc: '2.0', id: 1, method: 'initialize' }
    })
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        'Mcp-Session-Id': initialized.headers.get('mcp-session-id')
      }
    })
    const text = await response.text()

    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/event-stream/)
    assert.match(text, /event: endpoint/)
    assert.match(text, /"endpoint":"\/mcp"/)
  } finally {
    await service.stop()
  }
})

test('local http service can revoke all mcp sessions', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const endpoint = `http://${started.host}:${started.port}/mcp`
    const initialized = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      body: { jsonrpc: '2.0', id: 1, method: 'initialize' }
    })
    const sessionId = initialized.headers.get('mcp-session-id')

    assert.equal(service.getStatus().mcp.activeSessions, 1)
    assert.equal(service.revokeMcpSessions().activeSessions, 0)

    const revoked = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      headers: { 'Mcp-Session-Id': sessionId },
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    })
    assert.equal(revoked.status, 401)
  } finally {
    await service.stop()
  }
})

test('local http service logs mcp tool calls with tool-specific paths', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => payload,
      playAction: (payload) => payload,
      setEvent: (payload) => payload
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0, token: TEST_TOKEN })
    const endpoint = `http://${started.host}:${started.port}/mcp`
    const initialized = await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      body: { jsonrpc: '2.0', id: 1, method: 'initialize' }
    })
    await requestJson(endpoint, {
      method: 'POST',
      token: TEST_TOKEN,
      headers: { 'Mcp-Session-Id': initialized.headers.get('mcp-session-id') },
      body: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'openpet.say', arguments: { text: 'logged' } }
      }
    })

    assert.equal(service.getLogs({ query: 'openpet.say' }).some((log) => log.path === '/mcp/tools/call/openpet.say'), true)
  } finally {
    await service.stop()
  }
})
