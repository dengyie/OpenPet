const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const { callBridge } = require('../../examples/plugins/creator-studio/lib/bridge-client')

test('creator bridge client preserves structured provider attempt diagnostics', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(400, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({
      ok: false,
      error: 'Image Provider generation failed with HTTP 524',
      errorCode: 'provider_http_error',
      errorDetails: {
        modelAttempts: [{
          model: 'gpt-image-2',
          ok: false,
          errorCode: 'provider_http_error',
          httpStatus: 524,
          timeoutMs: 120000,
          durationMs: 119000,
          requestId: 'request-524'
        }]
      }
    }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const previousUrl = process.env.OPENPET_BRIDGE_URL
  const previousToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${address.port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'

  try {
    await assert.rejects(() => callBridge('/creator/model-image-generate'), (error) => {
      assert.equal(error.code, 'provider_http_error')
      assert.deepEqual(error.modelAttempts, [{
        model: 'gpt-image-2',
        ok: false,
        errorCode: 'provider_http_error',
        httpStatus: 524,
        timeoutMs: 120000,
        durationMs: 119000,
        requestId: 'request-524'
      }])
      return true
    })
  } finally {
    if (previousUrl === undefined) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousUrl
    if (previousToken === undefined) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousToken
    await new Promise((resolve) => server.close(resolve))
  }
})
