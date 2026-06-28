const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')
const http = require('http')

const {
  createPluginBridgeKey,
  createPluginCommandBridgeServer
} = require('../../src/main/services/plugin-command-bridge-server')

const requestJson = (url, { token = 'token', method = 'POST', body = {}, headers = {}, includeJsonHeader = body !== null } = {}) => new Promise((resolve, reject) => {
  const payload = body === null ? '' : JSON.stringify(body)
  const request = http.request(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(includeJsonHeader ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    }
  }, (response) => {
    let text = ''
    response.on('data', (chunk) => { text += chunk })
    response.on('end', () => {
      try {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: JSON.parse(text || '{}')
        })
      } catch (error) {
        reject(error)
      }
    })
  })
  request.on('error', reject)
  if (payload) request.write(payload)
  request.end()
})

test('plugin command bridge server dispatches read and json routes through registered runtime handlers', async () => {
  const runtimes = new Map()
  const server = createPluginCommandBridgeServer({ commandBridgeRuntimes: runtimes })
  await server.ensureStarted()
  const baseUrl = server.createBridgeBaseUrl({
    pluginId: 'weather-declaration',
    commandId: 'announce',
    runId: 'run-1'
  })
  runtimes.set(createPluginBridgeKey('weather-declaration', 'announce', 'run-1'), {
    status: 'running',
    token: 'secret-token',
    handlers: {
      context: async () => ({ ok: true, context: { petName: 'OpenPet' } }),
      petSay: async (payload) => ({ ok: true, said: payload.text })
    }
  })

  const context = await requestJson(`${baseUrl}/context`, { token: 'secret-token', method: 'GET', body: null })
  const say = await requestJson(`${baseUrl}/pet/say`, { token: 'secret-token', body: { text: 'hello' } })

  assert.equal(context.statusCode, 200)
  assert.equal(context.headers['cache-control'], 'no-store')
  assert.deepEqual(context.body, { ok: true, context: { petName: 'OpenPet' } })
  assert.deepEqual(say.body, { ok: true, said: 'hello' })

  server.close()
})

test('plugin command bridge server rejects unknown, expired, unauthorized, and non-json requests', async () => {
  const logs = []
  const runtimes = new Map()
  const server = createPluginCommandBridgeServer({
    appendLog: (entry) => logs.push(entry),
    commandBridgeRuntimes: runtimes
  })
  await server.ensureStarted()
  const baseUrl = server.createBridgeBaseUrl({
    pluginId: 'weather-declaration',
    commandId: 'announce',
    runId: 'run-1'
  })
  runtimes.set(createPluginBridgeKey('weather-declaration', 'announce', 'run-1'), {
    status: 'running',
    token: 'secret-token',
    handlers: {
      petSay: async () => ({ ok: true })
    }
  })

  const unknown = await requestJson(`${baseUrl}/pet/unknown`, { token: 'secret-token' })
  const expired = await requestJson(`${baseUrl.replace('/run-1', '/run-2')}/pet/say`, { token: 'secret-token' })
  const unauthorized = await requestJson(`${baseUrl}/pet/say`, { token: 'wrong-token' })
  const nonJson = await requestJson(`${baseUrl}/pet/say`, {
    token: 'secret-token',
    body: null,
    headers: { 'Content-Type': 'text/plain' },
    includeJsonHeader: false
  })

  assert.deepEqual(unknown.body, { ok: false, error: 'Not found' })
  assert.equal(unknown.statusCode, 404)
  assert.deepEqual(expired.body, { ok: false, error: 'Bridge token expired' })
  assert.equal(expired.statusCode, 401)
  assert.deepEqual(unauthorized.body, { ok: false, error: 'Unauthorized' })
  assert.equal(unauthorized.statusCode, 401)
  assert.deepEqual(nonJson.body, { ok: false, error: 'Content-Type must be application/json' })
  assert.equal(nonJson.statusCode, 415)
  assert.equal(logs.length, 1)
  assert.equal(logs[0].message, 'Bridge request rejected: unauthorized token')

  server.close()
})

test('plugin command bridge server maps handler permission errors to 403 and bad json to 400', async () => {
  const runtimes = new Map()
  const server = createPluginCommandBridgeServer({ commandBridgeRuntimes: runtimes })
  await server.ensureStarted()
  const baseUrl = server.createBridgeBaseUrl({
    pluginId: 'weather-declaration',
    commandId: 'announce',
    runId: 'run-1'
  })
  runtimes.set(createPluginBridgeKey('weather-declaration', 'announce', 'run-1'), {
    status: 'running',
    token: 'secret-token',
    handlers: {
      petSay: async () => {
        throw new Error('Plugin does not have permission: pet:say')
      }
    }
  })

  const forbidden = await requestJson(`${baseUrl}/pet/say`, { token: 'secret-token', body: { text: 'hello' } })
  const invalidJson = await new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}/pet/say`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret-token',
        'Content-Type': 'application/json'
      }
    }, (response) => {
      let text = ''
      response.on('data', (chunk) => { text += chunk })
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(text) }))
    })
    request.on('error', reject)
    request.write('{not json')
    request.end()
  })

  assert.equal(forbidden.statusCode, 403)
  assert.deepEqual(forbidden.body, { ok: false, error: 'Plugin does not have permission: pet:say' })
  assert.equal(invalidJson.statusCode, 400)
  assert.deepEqual(invalidJson.body, { ok: false, error: 'Invalid JSON body' })

  server.close()
})

test('plugin command bridge server shares one startup across concurrent ensureStarted calls', async () => {
  const createdServers = []
  const createServer = () => {
    const server = new EventEmitter()
    server.listening = false
    server.off = server.removeListener.bind(server)
    server.listen = () => {
      createdServers.push(server)
    }
    server.address = () => ({ port: 8317 })
    server.unref = () => {}
    server.close = () => {
      server.listening = false
    }
    return server
  }
  const bridgeServer = createPluginCommandBridgeServer({
    commandBridgeRuntimes: new Map(),
    createServer
  })

  const firstStart = bridgeServer.ensureStarted()
  const secondStart = bridgeServer.ensureStarted()
  assert.equal(createdServers.length, 1)

  createdServers[0].listening = true
  createdServers[0].emit('listening')

  await assert.doesNotReject(Promise.all([firstStart, secondStart]))
  assert.deepEqual(await Promise.all([firstStart, secondStart]), [8317, 8317])

  bridgeServer.close()
})
