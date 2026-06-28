const test = require('node:test')
const assert = require('node:assert/strict')

const { createMcpTransportService, validateInputSchema } = require('../../src/main/services/mcp-transport-service')

const createRequest = (sessionId = '') => ({ headers: sessionId ? { 'mcp-session-id': sessionId } : {} })

test('mcp transport creates sessions and expires them by ttl', () => {
  let now = 1000
  const service = createMcpTransportService({
    petService: { getSnapshot: () => ({ ok: true }) },
    sessionTtlMs: 50,
    nowMs: () => now
  })

  const initialized = service.handleJsonRpc(createRequest(), { jsonrpc: '2.0', id: 1, method: 'initialize' })
  const sessionId = initialized.headers['Mcp-Session-Id']

  assert.equal(service.hasSession(createRequest(sessionId)), true)
  now += 51
  assert.equal(service.hasSession(createRequest(sessionId)), false)
})

test('mcp transport validates tool input schema', () => {
  const schema = {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false
  }

  assert.doesNotThrow(() => validateInputSchema(schema, { text: 'hello' }))
  assert.throws(() => validateInputSchema(schema, {}), /required: text/)
  assert.throws(() => validateInputSchema(schema, { text: 1 }), /text must be a string/)
  assert.throws(() => validateInputSchema(schema, { text: 'ok', extra: true }), /not allowed: extra/)
  assert.throws(() => validateInputSchema({
    type: 'object',
    properties: { ttlMs: { type: 'number' } },
    additionalProperties: false
  }, { ttlMs: '700' }), /ttlMs must be a number/)
})

test('mcp transport tools call uses pet service and rejects invalid args', () => {
  const calls = []
  const service = createMcpTransportService({
    petService: {
      getSnapshot: () => ({ ok: true }),
      say: (payload) => {
        calls.push(payload)
        return payload
      }
    }
  })
  const initialized = service.handleJsonRpc(createRequest(), { jsonrpc: '2.0', id: 1, method: 'initialize' })
  const request = createRequest(initialized.headers['Mcp-Session-Id'])

  const ok = service.handleJsonRpc(request, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'openpet.say', arguments: { text: 'hello' } }
  })
  const bad = service.handleJsonRpc(request, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'openpet.say', arguments: { text: 'hello', extra: true } }
  })
  const legacy = service.handleJsonRpc(request, {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'ibot.say', arguments: { text: 'legacy' } }
  })

  assert.deepEqual(calls, [
    { text: 'hello', ttlMs: undefined, source: 'mcp', sourceSurface: 'mcp-tool' },
    { text: 'legacy', ttlMs: undefined, source: 'mcp', sourceSurface: 'mcp-tool' }
  ])
  assert.equal(ok.body.result.structuredContent.text, 'hello')
  assert.equal(bad.body.error.code, -32602)
  assert.equal(legacy.body.result.structuredContent.text, 'legacy')
})
