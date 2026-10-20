const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { EventEmitter } = require('node:events')
const { mkdtemp, realpath, rm } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const hostModule = import('../../services/backend/host.js')

function call(address, path, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: address.host, port: address.port, path, method: options.method || 'GET', headers: options.headers || {} }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.once('error', reject)
    if (options.body !== undefined) request.end(JSON.stringify(options.body))
    else request.end()
  })
}

test('remote host validates loopback ports and exposes idle health', async () => {
  const { createBackendHost } = await hostModule
  assert.throws(() => createBackendHost({ bindHost: '0.0.0.0' }), /127\.0\.0\.1/)
  const host = createBackendHost({ port: 0, bridgePort: 48341, backendPort: 48342, dataDir: `/tmp/openpet-host-test-${process.pid}` })
  const address = await host.listen()
  try {
    const health = await call(address, '/__openpet/health')
    assert.equal(health.status, 200)
    assert.deepEqual(JSON.parse(health.body), { ok: true, status: 'idle', apiVersion: 'v1' })
    const unauthorized = await call(address, '/api/v1/health')
    assert.equal(unauthorized.status, 401)
  } finally {
    await host.close()
  }
})

test('remote host fixes child storage, proxies authenticated API, and correlates reverse Shell replies', async () => {
  const { createBackendHost } = await hostModule
  const root = await mkdtemp(path.join(os.tmpdir(), 'openpet-remote-host-'))
  const dataDir = path.join(root, 'server-owned-data')
  const upstream = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, route: request.url }))
  })
  const upstreamAddress = await new Promise((resolve) => upstream.listen(0, '127.0.0.1', () => resolve(upstream.address())))
  const bridgeServer = http.createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    bridgeRequests.push({ authorization: request.headers.authorization, envelope: body.envelope })
    const envelope = body.envelope
    const payload = JSON.stringify({ ok: true, envelope: {
      v: 1,
      id: envelope.id,
      at: Date.now(),
      body: { type: 'plugin.production.result', requestId: envelope.id, ok: true, result: { configured: false } },
    } })
    response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) })
    response.end(payload)
  })
  const bridgeAddress = await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', () => resolve(bridgeServer.address())))
  const logEntries = []
  const bridgeRequests = []
  const child = new EventEmitter()
  child.pid = 8123
  child.exitCode = null
  child.send = (envelope) => {
    if (envelope.body.type === 'init') {
      child.initEnvelope = envelope
      setImmediate(() => {
        child.emit('message', {
          v: 1,
          id: 'backend-ready',
          at: Date.now(),
          body: { type: 'ready', port: upstreamAddress.port, apiVersion: 'v1', pid: child.pid, sessionToken: 'remote-session-token-0123456789X', startupMs: 2 },
        })
        setImmediate(() => child.emit('message', {
          v: 1,
          id: 'backend-shell-request',
          at: Date.now(),
          body: { type: 'plugin.production.request', operation: 'secret.state' },
        }))
      })
      return
    }
    child.replyEnvelope = envelope
    if (envelope.body.type === 'shutdown') {
      child.exitCode = 0
      setImmediate(() => child.emit('exit', 0, 'SIGTERM'))
    }
  }
  child.kill = (signal) => {
    child.exitCode = signal === 'SIGKILL' ? 137 : 0
    setImmediate(() => child.emit('exit', child.exitCode, signal))
  }
  const host = createBackendHost({
    port: 0,
    bridgePort: bridgeAddress.port,
    backendPort: 48_342,
    dataDir,
    startupTimeoutMs: 1000,
    fork: () => child,
    logger: { info: (message, details) => logEntries.push([message, details]), warn: (message, details) => logEntries.push([message, details]), error: (message, details) => logEntries.push([message, details]) },
  })
  const address = await host.listen()
  const bridgeToken = 'b'.repeat(64)
  try {
    const sessionResponse = await call(address, '/__openpet/session', {
      method: 'POST',
      body: {
        bridgeToken,
        providerKeys: { 'ai.default': 'fixture-provider-secret' },
        legacyToken: null,
        localHttpConfig: { enabled: false, host: '127.0.0.1', port: 0 },
        userDataDir: '/attacker/path/ignored',
        appInfo: { name: 'test', version: '0', packaged: false, platform: 'test', arch: 'test' },
      },
    })
    assert.equal(sessionResponse.status, 200)
    assert.deepEqual(JSON.parse(sessionResponse.body).data.sessionToken, 'remote-session-token-0123456789X')
    assert.equal(child.initEnvelope.body.userDataDir, await realpath(dataDir))
    assert.equal(child.initEnvelope.body.httpPort, 48_342)
    assert.equal(child.initEnvelope.body.providerKeys['ai.default'], 'fixture-provider-secret')

    const duplicateSession = await call(address, '/__openpet/session', {
      method: 'POST',
      body: { bridgeToken, providerKeys: {}, localHttpConfig: { enabled: false, host: '127.0.0.1', port: 0 } },
    })
    assert.equal(duplicateSession.status, 409)

    const apiHealth = await call(address, '/api/v1/health', { headers: { authorization: 'Bearer remote-session-token-0123456789X' } })
    assert.equal(apiHealth.status, 200)
    assert.deepEqual(JSON.parse(apiHealth.body), { ok: true, route: '/api/v1/health' })
    assert.equal((await call(address, '/api/v1/health')).status, 401)
    assert.equal((await call(address, '/api/v1/health', { headers: { authorization: 'Bearer wrong-session-token' } })).status, 401)

    for (let attempt = 0; attempt < 30 && !child.replyEnvelope; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(bridgeRequests.length, 1)
    assert.equal(bridgeRequests[0].authorization, `Bearer ${bridgeToken}`)
    assert.equal(bridgeRequests[0].envelope.body.operation, 'secret.state')
    assert.equal(child.replyEnvelope.body.requestId, 'backend-shell-request')
    assert.equal(child.replyEnvelope.body.result.configured, false)
    assert.doesNotMatch(JSON.stringify(logEntries), /fixture-provider-secret|remote-session-token|bbbbbbbb/)

    assert.equal((await call(address, '/__openpet/session/end', { method: 'POST', headers: { authorization: 'Bearer remote-session-token-0123456789X' } })).status, 202)
    for (let attempt = 0; attempt < 30 && child.exitCode === null; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10))
    assert.notEqual(child.exitCode, null)
  } finally {
    await host.close()
    await new Promise((resolve) => bridgeServer.close(resolve))
    await new Promise((resolve) => upstream.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
})
