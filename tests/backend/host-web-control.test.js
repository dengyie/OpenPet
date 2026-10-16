const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const hostModule = import('../../services/backend/host.js')

function request(address, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: address.host,
      port: address.port,
      path: pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.once('error', reject)
    if (options.body !== undefined) {
      req.setHeader('content-type', 'application/json')
      req.end(JSON.stringify(options.body))
    } else req.end()
  })
}

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-web-control-'))
  const webRoot = path.join(root, 'web')
  fs.mkdirSync(path.join(webRoot, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>OpenPet</title>')
  fs.writeFileSync(path.join(webRoot, 'assets', 'app.js'), 'console.log("openpet")')
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, route: req.url, authorization: req.headers.authorization }))
  })
  const upstreamAddress = await new Promise((resolve) => upstream.listen(0, '127.0.0.1', () => resolve(upstream.address())))
  const child = new EventEmitter()
  child.pid = 1234
  child.exitCode = null
  child.send = (message) => {
    if (message.body.type !== 'init') return
    setImmediate(() => child.emit('message', {
      v: 1,
      id: 'ready',
      at: Date.now(),
      body: { type: 'ready', port: upstreamAddress.port, apiVersion: 'v1', pid: child.pid, sessionToken: 'child-session-token-01234567890123456789', startupMs: 1 }
    }))
  }
  child.kill = () => {
    child.exitCode = 0
    setImmediate(() => child.emit('exit', 0, 'SIGTERM'))
  }
  const host = (await hostModule).createBackendHost({
    port: 0,
    bridgePort: 48_341,
    backendPort: 48_342,
    dataDir: path.join(root, 'data'),
    webRoot,
    webPassword: 'mesh-password',
    fork: () => child,
    startupTimeoutMs: 1000
  })
  const address = await host.listen()
  return { root, upstream, host, address }
}

test('web control serves static assets only from the configured root and authenticates proxy requests', async (t) => {
  const ctx = await fixture()
  t.after(async () => {
    await ctx.host.close()
    await new Promise((resolve) => ctx.upstream.close(resolve))
    fs.rmSync(ctx.root, { recursive: true, force: true })
  })

  const session = await request(ctx.address, '/__openpet/session', {
    method: 'POST',
    body: { bridgeToken: 'a'.repeat(64), providerKeys: {}, localHttpConfig: { enabled: false, host: '127.0.0.1', port: 0 } }
  })
  assert.equal(session.status, 200)
  assert.equal((await request(ctx.address, '/', {})).status, 200)
  assert.equal((await request(ctx.address, '/assets/app.js', {})).status, 200)
  assert.equal((await request(ctx.address, '/../../etc/passwd', {})).status, 404)

  const wrong = await request(ctx.address, '/__openpet/web/login', { method: 'POST', body: { password: 'wrong' } })
  assert.equal(wrong.status, 401)
  const login = await request(ctx.address, '/__openpet/web/login', { method: 'POST', body: { password: 'mesh-password' } })
  assert.equal(login.status, 200)
  const webToken = JSON.parse(login.body).data.token
  assert.match(webToken, /^[a-f0-9]{64}$/)

  const proxy = await request(ctx.address, '/api/v1/health', { headers: { authorization: `Bearer ${webToken}` } })
  assert.equal(proxy.status, 200)
  assert.equal(JSON.parse(proxy.body).authorization, 'Bearer child-session-token-01234567890123456789')
  const job = await request(ctx.address, '/api/v1/jobs/creator.character%3Aabc-123', { headers: { authorization: `Bearer ${webToken}` } })
  assert.equal(job.status, 200)
  for (const pathname of [
    '/api/v1/creator/runs/run-1/retry-identity',
    '/api/v1/creator/runs/run-1/retry-action',
    '/api/v1/creator/runs/run-1/accept-action-candidate'
  ]) {
    const allowed = await request(ctx.address, pathname, {
      method: 'POST', headers: { authorization: `Bearer ${webToken}` }, body: {}
    })
    assert.equal(allowed.status, 200, pathname)
  }
  const forbiddenRoute = await request(ctx.address, '/api/v1/plugins', { headers: { authorization: `Bearer ${webToken}` } })
  assert.equal(forbiddenRoute.status, 403)
  const forbiddenMethod = await request(ctx.address, '/api/v1/health', { method: 'POST', headers: { authorization: `Bearer ${webToken}` }, body: {} })
  assert.equal(forbiddenMethod.status, 403)
  assert.equal((await request(ctx.address, '/api/v1/health')).status, 401)

  assert.equal((await request(ctx.address, '/__openpet/web/logout', { method: 'POST', headers: { authorization: `Bearer ${webToken}` } })).status, 200)
  assert.equal((await request(ctx.address, '/api/v1/health', { headers: { authorization: `Bearer ${webToken}` } })).status, 401)
})
