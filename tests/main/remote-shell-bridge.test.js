const test = require('node:test')
const assert = require('node:assert/strict')
const { createRemoteShellBridge } = require('../../apps/desktop/src/sidecar/remote-shell-bridge')

const token = 'a'.repeat(64)
const envelope = { v: 1, id: 'b1-1', at: Date.now(), body: { type: 'pet.say', text: 'hello' } }

async function request(address, { authorization = `Bearer ${token}`, body = { envelope }, method = 'POST', path = '/message' } = {}) {
  const http = require('node:http')
  return new Promise((resolve, reject) => {
    const request = http.request({ host: address.host, port: address.port, method, path, headers: { authorization, 'content-type': 'application/json' } }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ statusCode: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.once('error', reject)
    if (body !== undefined) request.end(JSON.stringify(body))
    else request.end()
  })
}

test('remote Shell bridge requires the session token and dispatches envelopes', async () => {
  const received = []
  const bridge = createRemoteShellBridge({ token, handler: async (value) => { received.push(value); return { v: 1, id: value.id, at: Date.now(), body: { type: 'settings.persist.result', version: 1, ok: true, changedPaths: [] } } } })
  const address = await bridge.listen()
  try {
    assert.equal((await request(address, { authorization: 'Bearer wrong' })).statusCode, 401)
    const result = await request(address)
    assert.equal(result.statusCode, 200)
    assert.deepEqual(received, [envelope])
    assert.equal(JSON.parse(result.body).envelope.id, envelope.id)
  } finally {
    await bridge.close()
  }
})

test('remote Shell bridge rejects non-message endpoints', async () => {
  const bridge = createRemoteShellBridge({ token, handler: () => {} })
  const address = await bridge.listen()
  try {
    assert.equal((await request(address, { path: '/health', method: 'GET', body: undefined })).statusCode, 404)
  } finally {
    await bridge.close()
  }
})
