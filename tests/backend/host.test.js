const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { EventEmitter } = require('node:events')
const { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat } = require('node:fs/promises')
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

test('resident host keeps Backend online across desktop session end and persists provider keys securely', async () => {
  const { createBackendHost } = await hostModule
  const root = await mkdtemp(path.join(os.tmpdir(), 'openpet-resident-host-'))
  const dataDir = path.join(root, 'data')
  await mkdir(dataDir, { mode: 0o700 })
  const providerKeysFile = path.join(dataDir, 'provider-keys.json')
  await import('node:fs/promises').then(({ writeFile }) => writeFile(providerKeysFile, JSON.stringify({ 'ai.default': 'server-provider-secret' }), { mode: 0o600 }))
  const upstream = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
  })
  const upstreamAddress = await new Promise((resolve) => upstream.listen(0, '127.0.0.1', () => resolve(upstream.address())))
  const child = new EventEmitter()
  child.pid = 9234
  child.exitCode = null
  child.sent = []
  child.send = (envelope) => {
    child.sent.push(envelope)
    if (envelope.body.type === 'init') {
      child.initEnvelope = envelope
      setImmediate(() => child.emit('message', {
        v: 1,
        id: 'resident-ready',
        at: Date.now(),
        body: { type: 'ready', port: upstreamAddress.port, apiVersion: 'v1', pid: child.pid, sessionToken: 'resident-session-token-01234567890123456789', startupMs: 1 }
      }))
    }
  }
  child.kill = (signal) => {
    child.exitCode = signal === 'SIGKILL' ? 137 : 0
    setImmediate(() => child.emit('exit', child.exitCode, signal))
  }
  const logs = []
  const host = createBackendHost({
    port: 0,
    bridgePort: 48_341,
    backendPort: 48_342,
    dataDir,
    providerKeysFile,
    residentBackend: true,
    sessionTtlMs: 15,
    startupTimeoutMs: 1000,
    fork: () => child,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) }
  })
  let address
  try {
    address = await host.listen()
    assert.equal(child.initEnvelope.body.providerKeys['ai.default'], 'server-provider-secret')
    assert.deepEqual(host.getState().status, 'ready')
    assert.equal(host.getState().mode, 'resident')

    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(child.exitCode, null)

    const attached = await call(address, '/__openpet/session', {
      method: 'POST',
      body: {
        bridgeToken: 'c'.repeat(64),
        providerKeys: { 'ai.default': 'desktop-provider-secret' },
        localHttpConfig: { enabled: false, host: '127.0.0.1', port: 0 }
      }
    })
    assert.equal(attached.status, 200)
    assert.equal(child.initEnvelope.body.providerKeys['ai.default'], 'server-provider-secret')

    child.emit('message', {
      v: 1,
      id: 'resident-key-save',
      at: Date.now(),
      body: { type: 'secrets.persist.request', providerId: 'ai.default', value: 'rotated-provider-secret' }
    })
    for (let attempt = 0; attempt < 30 && !child.sent.some((envelope) => envelope.id === 'resident-key-save'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const keyReply = child.sent.find((envelope) => envelope.id === 'resident-key-save')
    assert.equal(keyReply.body.type, 'secrets.persist.result')
    assert.equal(keyReply.body.ok, true)
    assert.deepEqual(JSON.parse(await readFile(providerKeysFile, 'utf8')), { 'ai.default': 'rotated-provider-secret' })
    assert.equal((await stat(providerKeysFile)).mode & 0o777, 0o600)

		child.emit('message', {
			v: 1,
			id: 'resident-key-save-a',
			at: Date.now(),
			body: { type: 'secrets.persist.request', providerId: 'ai.default', value: 'rotated-provider-secret-a' }
		})
		child.emit('message', {
			v: 1,
			id: 'resident-key-save-b',
			at: Date.now(),
			body: { type: 'secrets.persist.request', providerId: 'ai.vision', value: 'rotated-provider-secret-b' }
		})
		for (let attempt = 0; attempt < 30 && !child.sent.some((envelope) => envelope.id === 'resident-key-save-b'); attempt += 1) {
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
		assert.deepEqual(JSON.parse(await readFile(providerKeysFile, 'utf8')), {
			'ai.default': 'rotated-provider-secret-a',
			'ai.vision': 'rotated-provider-secret-b',
		})

    const detached = await call(address, '/__openpet/session/end', {
      method: 'POST',
      headers: { authorization: 'Bearer resident-session-token-01234567890123456789' }
    })
    assert.equal(detached.status, 202)
    assert.equal(host.getState().status, 'ready')
    assert.equal(child.exitCode, null)
    assert.doesNotMatch(JSON.stringify(logs), /server-provider-secret|desktop-provider-secret|rotated-provider-secret/)
  } finally {
    await host.close()
    await new Promise((resolve) => upstream.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
})

test('resident host rejects provider key files with group or world permissions', async () => {
  const { createBackendHost } = await hostModule
  const root = await mkdtemp(path.join(os.tmpdir(), 'openpet-resident-insecure-'))
  const dataDir = path.join(root, 'data')
  await mkdir(dataDir, { mode: 0o700 })
  const providerKeysFile = path.join(dataDir, 'provider-keys.json')
  await import('node:fs/promises').then(({ writeFile }) => writeFile(providerKeysFile, JSON.stringify({ 'ai.default': 'must-not-load' }), { mode: 0o600 }))
  await chmod(providerKeysFile, 0o644)
  let forked = false
  const host = createBackendHost({
    port: 0,
    bridgePort: 48_341,
    backendPort: 48_342,
    dataDir,
    providerKeysFile,
    residentBackend: true,
    fork: () => { forked = true; throw new Error('unexpected fork') }
  })
  try {
    await assert.rejects(host.listen(), /permissions/i)
    assert.equal(forked, false)
  } finally {
    await host.close()
    await rm(root, { recursive: true, force: true })
  }
})
