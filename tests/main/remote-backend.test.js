const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { connectRemoteBackend, validateAlias } = require('../../apps/desktop/src/sidecar/remote-backend')

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) }
}

function makeSsh() {
  const child = new EventEmitter()
  child.pid = 4172
  child.kill = (signal) => {
    child.killedWith = signal
    if (signal === 'SIGTERM' || signal === 'SIGKILL') setImmediate(() => child.emit('exit', 0, signal))
  }
  return child
}

test('validates SSH aliases as one safe OpenSSH config name', () => {
  assert.equal(validateAlias('gz-cvm'), 'gz-cvm')
  for (const alias of ['-oProxyCommand=bad', 'gz-cvm;touch /tmp/pwned', 'user@host -F file', '']) {
    assert.throws(() => validateAlias(alias), /invalid SSH alias/)
  }
})

test('opens strict loopback SSH forwards and bootstraps an in-memory remote session', async () => {
  const ssh = makeSsh()
  const requests = []
  let spawnArgs
  let spawnOptions
  const transport = await connectRemoteBackend({
    sshAlias: 'gz-cvm',
    providerKeys: { 'ai.default': 'do-not-log-this-key' },
    spawnImpl: (command, args, options) => {
      assert.equal(command, 'ssh')
      spawnArgs = args
      spawnOptions = options
      return ssh
    },
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options })
      if (url.endsWith('/__openpet/health')) return response({ ok: true, status: 'idle' })
      if (url.endsWith('/__openpet/session')) return response({ ok: true, data: { sessionToken: 'private-session-token', apiVersion: 'v1' } })
      if (url.endsWith('/__openpet/session/end')) return response({ ok: true })
      return response({ ok: true, data: { result: 'ok' } })
    },
  })
  try {
    assert.equal(spawnOptions.shell, false)
    assert.equal(spawnOptions.stdio[0], 'ignore')
    assert.ok(spawnArgs.includes('BatchMode=yes'))
    assert.ok(spawnArgs.includes('ExitOnForwardFailure=yes'))
    assert.ok(spawnArgs.includes('StrictHostKeyChecking=yes'))
    assert.ok(spawnArgs.includes('-L'))
    assert.ok(spawnArgs.includes('127.0.0.1:48330:127.0.0.1:48330'))
    assert.ok(spawnArgs.includes('-R'))
    assert.ok(spawnArgs.some((arg) => /^127\.0\.0\.1:48331:127\.0\.0\.1:\d+$/.test(arg)))
    assert.equal(spawnArgs.at(-1), 'gz-cvm')

    const sessionRequest = requests.find(({ url }) => url.endsWith('/__openpet/session'))
    const sessionBody = JSON.parse(sessionRequest.options.body)
    assert.equal(sessionBody.providerKeys['ai.default'], 'do-not-log-this-key')
    assert.match(sessionBody.bridgeToken, /^[a-f0-9]{64}$/)
    assert.doesNotMatch(spawnArgs.join(' '), /do-not-log-this-key|private-session-token/)
    assert.equal(transport.baseUrl, 'http://127.0.0.1:48330/api/v1')
    assert.equal(transport.sessionToken, 'private-session-token')
  } finally {
    await transport.close()
  }
  assert.ok(requests.some(({ url }) => url.endsWith('/__openpet/session/end')))
  assert.equal(ssh.killedWith, 'SIGTERM')
})

test('fails promptly when SSH exits before host health is available', async () => {
  const ssh = makeSsh()
  const error = new Error('ssh executable missing')
  await assert.rejects(connectRemoteBackend({
    timeoutMs: 500,
    spawnImpl: () => {
      setImmediate(() => ssh.emit('error', error))
      return ssh
    },
    fetchImpl: async () => response({ ok: false }, 503),
  }), /ssh executable missing/)
})

test('rejects invalid ports before starting SSH', async () => {
  let spawned = false
  await assert.rejects(connectRemoteBackend({
    hostPort: 70_000,
    spawnImpl: () => { spawned = true; return makeSsh() },
    fetchImpl: async () => response({ ok: true }),
  }), /hostPort must be a valid port/)
  assert.equal(spawned, false)
})

test('reports a lost remote session when the host heartbeat is unauthorized', async () => {
  const ssh = makeSsh()
  const exits = []
  let heartbeatCalls = 0
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  let heartbeatTask = null
  let transport = null
  globalThis.setInterval = (callback) => {
    heartbeatTask = callback
    return { unref() {} }
  }
  globalThis.clearInterval = () => {}
  try {
    transport = await connectRemoteBackend({
      onExit: (code, signal) => exits.push({ code, signal }),
      spawnImpl: () => ssh,
      fetchImpl: async (url) => {
        if (url.endsWith('/__openpet/health')) return response({ ok: true, status: 'idle' })
        if (url.endsWith('/__openpet/session')) return response({ ok: true, data: { sessionToken: 'private-session-token', apiVersion: 'v1' } })
        if (url.endsWith('/__openpet/heartbeat')) {
          heartbeatCalls += 1
          return response({ ok: false, error: 'unauthorized' }, 401)
        }
        return response({ ok: true })
      },
    })
    await heartbeatTask?.()
    await new Promise((resolve) => setImmediate(resolve))
    assert.ok(heartbeatCalls > 0)
    const observedExits = exits.slice()
    assert.deepEqual(observedExits, [{ code: null, signal: null }])
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
    await transport?.close()
  }
})

test('reports a remote session lost after three consecutive heartbeat transport failures', async () => {
  const ssh = makeSsh()
  const exits = []
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  let heartbeatTask = null
  let transport = null
  globalThis.setInterval = (callback) => {
    heartbeatTask = callback
    return { unref() {} }
  }
  globalThis.clearInterval = () => {}
  try {
    transport = await connectRemoteBackend({
      onExit: (code, signal) => exits.push({ code, signal }),
      spawnImpl: () => ssh,
      fetchImpl: async (url) => {
        if (url.endsWith('/__openpet/health')) return response({ ok: true, status: 'idle' })
        if (url.endsWith('/__openpet/session')) return response({ ok: true, data: { sessionToken: 'private-session-token', apiVersion: 'v1' } })
        if (url.endsWith('/__openpet/heartbeat')) throw new Error('mesh route unavailable')
        return response({ ok: true })
      },
    })
    await heartbeatTask?.()
    await heartbeatTask?.()
    assert.deepEqual(exits, [])
    await heartbeatTask?.()
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(exits, [{ code: null, signal: null }])
    assert.equal(ssh.killedWith, 'SIGTERM')
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
    await transport?.close()
  }
})
