const test = require('node:test')
const assert = require('node:assert/strict')

const { requestPluginNetwork } = require('../../src/main/services/plugin-network-client')

const manifest = {
  id: 'network-plugin',
  network: { allowlist: ['api.example.com', 'api.example.com:8443', 'redirect.example.com'] }
}

const createResponse = ({ status = 200, url = 'https://api.example.com/data', headers = {}, text = 'ok' } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  url,
  headers: { get: (name) => headers[String(name).toLowerCase()] || '' },
  text: async () => text
})

test('plugin network request dials only the address returned by validation while preserving TLS hostname', async () => {
  const connections = []
  let resolveCalls = 0
  const response = await requestPluginNetwork({
    manifest,
    url: 'https://api.example.com/data',
    request: { method: 'GET', headers: {} },
    resolveAddress: async () => {
      resolveCalls += 1
      return resolveCalls === 1 ? ['203.0.113.10'] : ['127.0.0.1']
    },
    connect: async (options) => {
      connections.push(options)
      return createResponse()
    }
  })

  assert.equal(response.status, 200)
  assert.equal(resolveCalls, 1)
  assert.equal(connections[0].address, '203.0.113.10')
  assert.equal(connections[0].servername, 'api.example.com')
  assert.equal(connections[0].hostHeader, 'api.example.com')
})

test('plugin network request supports validated IPv6 and keeps the requested hostname for TLS', async () => {
  const connections = []
  await requestPluginNetwork({
    manifest,
    url: 'https://api.example.com:8443/data',
    request: { method: 'GET', headers: {} },
    resolveAddress: async () => ['2001:4860:4860::8888', '203.0.113.10'],
    connect: async (options) => {
      connections.push(options)
      return createResponse({ url: 'https://api.example.com:8443/data' })
    }
  })

  assert.equal(connections[0].address, '2001:4860:4860::8888')
  assert.equal(connections[0].family, 6)
  assert.equal(connections[0].servername, 'api.example.com')
  assert.equal(connections[0].port, 8443)
})

test('plugin network request revalidates redirects and blocks private redirect destinations', async () => {
  let connectCalls = 0
  await assert.rejects(
    () => requestPluginNetwork({
      manifest,
      url: 'https://api.example.com/start',
      request: { method: 'GET', headers: {} },
      resolveAddress: async (hostname) => hostname === 'api.example.com' ? ['203.0.113.10'] : ['127.0.0.1'],
      connect: async () => {
        connectCalls += 1
        return createResponse({
          status: 302,
          url: 'https://api.example.com/start',
          headers: { location: 'https://redirect.example.com/private' }
        })
      }
    }),
    /non-public address.*DNS-rebinding SSRF blocked/
  )
  assert.equal(connectCalls, 1)
})

test('plugin network request aborts a stalled pinned connection on timeout', async () => {
  await assert.rejects(
    () => requestPluginNetwork({
      manifest,
      url: 'https://api.example.com/slow',
      request: { method: 'GET', headers: {} },
      resolveAddress: async () => ['203.0.113.10'],
      timeoutMs: 5,
      connect: ({ signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('connection aborted')), { once: true })
      })
    }),
    /timed out/i
  )
})

test('plugin network request forwards caller cancellation to the pinned connection', async () => {
  const controller = new AbortController()
  const pending = requestPluginNetwork({
    manifest,
    url: 'https://api.example.com/cancel',
    request: { method: 'GET', headers: {} },
    resolveAddress: async () => ['203.0.113.10'],
    signal: controller.signal,
    connect: ({ signal }) => new Promise((resolve, reject) => {
      const rejectCanceled = () => {
        const error = new Error('caller canceled')
        error.name = 'AbortError'
        reject(error)
      }
      if (signal.aborted) rejectCanceled()
      else signal.addEventListener('abort', rejectCanceled, { once: true })
    })
  })
  controller.abort()

  await assert.rejects(() => pending, (error) => error.name === 'AbortError')
})
