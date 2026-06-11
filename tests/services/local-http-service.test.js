const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('http')

const { createLocalHttpService } = require('../../src/main/services/local-http-service')

const TEST_TOKEN = 'test-token'

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

    assert.equal(started.host, '127.0.0.1')
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, true)
    assert.equal(result.body.service.host, '127.0.0.1')
    assert.equal(result.body.snapshot, undefined)
    assert.equal(authenticatedResult.body.snapshot.settings.scale, 1)
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
    assert.deepEqual(sayEvents, [{ text: 'new token', ttlMs: undefined, source: 'http' }])
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
      result: { text: 'hello api', ttlMs: 1200, source: 'http' }
    })
    assert.deepEqual(sayEvents, [{ text: 'hello api', ttlMs: 1200, source: 'http' }])
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
