const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { test } = require('node:test')
const { callbackSignature, createWecomAdapter, decryptWecom, parseCallbackBody } = require('../../examples/plugins/im-gateway/service/adapters/wecom')
const { createImGatewayServer } = require('../../examples/plugins/im-gateway/service/im-gateway-service')
const { createGatewayHealth } = require('../../examples/plugins/im-gateway/service/health')

const credentials = { corpId: 'corp-id', corpSecret: 'corp-secret', token: 'callback-token', encodingAesKey: Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '') }
const wecomConfig = (extra = {}) => ({ wecomEnabled: true, wecomCorpId: credentials.corpId, wecomAgentId: 1, ...extra })
const signed = (body, extra = {}) => ({
  ...extra,
  body,
  timestamp: extra.timestamp || '1710000000',
  nonce: extra.nonce || 'nonce-1',
  signature: callbackSignature({ token: credentials.token, timestamp: extra.timestamp || '1710000000', nonce: extra.nonce || 'nonce-1', encrypt: body?.Encrypt || body?.encrypt || extra.encrypt })
})

const encryptCallback = (message, receiveId = credentials.corpId, paddingByte = null, paddingValue = null) => {
  const key = Buffer.from(`${credentials.encodingAesKey}=`, 'base64')
  const content = Buffer.from(message)
  const body = Buffer.alloc(20 + content.length + Buffer.byteLength(receiveId))
  crypto.randomFillSync(body.subarray(0, 16))
  body.writeUInt32BE(content.length, 16)
  content.copy(body, 20)
  Buffer.from(receiveId).copy(body, 20 + content.length)
  const padLength = paddingByte || (32 - (body.length % 32))
  const padding = Buffer.isBuffer(paddingValue) ? paddingValue : Buffer.alloc(padLength, paddingValue || padLength)
  const padded = Buffer.concat([body, padding])
  const cipher = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
}

test('WeCom verifies signatures and normalizes JSON and XML callbacks without retaining raw payloads', async () => {
  const messages = []
  const adapter = createWecomAdapter({ config: wecomConfig(), secrets: credentials })
  adapter.onMessage(async (message) => { messages.push(message) })
  await adapter.start()
  const jsonResult = await adapter.handleUpdate(signed({ MsgId: 'msg-1', FromUserName: 'user-1', Content: '/openpet status' }))
  const xmlResult = await adapter.handleUpdate(signed('<xml><MsgId><![CDATA[msg-2]]></MsgId><FromUserName><![CDATA[user-2]]></FromUserName><Content><![CDATA[hello]]></Content></xml>'))
  assert.deepEqual(jsonResult, { ok: true, accepted: true })
  assert.deepEqual(xmlResult, { ok: true, accepted: true })
  assert.equal(messages[0].platform, 'wecom')
  assert.equal(messages[0].chatType, 'private')
  assert.equal(messages[0].text, '/openpet status')
  assert.equal(messages[1].text, 'hello')
  assert.equal(Object.hasOwn(messages[0], 'raw'), true)
  assert.equal(messages[0].raw, undefined)
  assert.equal(JSON.stringify(adapter.health()).includes('user-1'), false)
})

test('WeCom rejects invalid signatures, disabled callbacks, and duplicate updates with stable redacted codes', async () => {
  const events = []
  const adapter = createWecomAdapter({ config: wecomConfig(), secrets: credentials, logEvent: (event) => events.push(event) })
  adapter.onMessage(async () => {})
  await adapter.start()
  const invalid = await adapter.handleUpdate({ body: { MsgId: 'secret-message-id', Content: 'secret-text' }, timestamp: '1', nonce: '2', signature: 'bad' })
  assert.deepEqual(invalid, { ok: false, error: 'invalid-signature' })
  const update = signed({ MsgId: 'duplicate-id', FromUserName: 'private-user', Content: 'hello' })
  assert.deepEqual(await adapter.handleUpdate(update), { ok: true, accepted: true })
  assert.deepEqual(await adapter.handleUpdate(update), { ok: true, duplicate: true })
  assert.equal(adapter.health().duplicateUpdateCount, 1)
  assert.equal(events.some((event) => JSON.stringify(event).includes('secret-text')), false)
  assert.equal(JSON.stringify(adapter.health()).includes('duplicate-id'), false)
})

test('WeCom sends bounded private and group receipts through injected clients and caches access tokens', async () => {
  const calls = []
  const adapter = createWecomAdapter({
    config: wecomConfig({ wecomAgentId: 9 }),
    secrets: credentials,
    httpClient: {
      getAccessToken: async (request) => { calls.push(['token', request.corpSecret]); return { errcode: 0, access_token: 'access-secret', expires_in: 7200 } },
      sendMessage: async (request) => { calls.push(['send', request.accessToken, request.payload]); return { errcode: 0 } }
    }
  })
  await adapter.start()
  await adapter.sendReceipt({ chatType: 'private', chatId: 'user-1' }, '  hello\nworld  ')
  await adapter.sendReceipt({ chatType: 'group', chatId: 'group-1' }, 'x'.repeat(3000))
  assert.equal(calls.filter(([kind]) => kind === 'token').length, 1)
  assert.equal(calls[1][2].touser, 'user-1')
  assert.equal(calls[2][2].chatid, 'group-1')
  assert.equal(calls[2][2].text.content.length, 2000)
  assert.equal(JSON.stringify(calls).includes('access-secret'), true)
  assert.equal(JSON.stringify(adapter.health()).includes('access-secret'), false)
})

test('WeCom maps callbacks with ChatId to group conversations', async () => {
  let received
  const adapter = createWecomAdapter({ config: wecomConfig(), secrets: credentials })
  adapter.onMessage(async (message) => { received = message })
  await adapter.start()
  await adapter.handleUpdate(signed({ MsgId: 'group-msg', FromUserName: 'user-1', ChatId: 'group-1', Content: 'group text' }))
  assert.equal(received.chatType, 'group')
  assert.equal(received.chatId, 'group-1')
})

test('WeCom reports missing credentials and request failures without exposing secret values', async () => {
  const adapter = createWecomAdapter({ config: wecomConfig(), secrets: { corpSecret: 'top-secret', token: 'token' } })
  await adapter.start()
  assert.equal(adapter.health().status, 'missing-credentials')
  assert.equal(adapter.health().lastErrorCode, 'missing-credentials')
  assert.equal(JSON.stringify(adapter.health()).includes('top-secret'), false)
  assert.deepEqual(parseCallbackBody('not xml or json'), {})
})

test('WeCom remains disabled by default and stop prevents new callback work', async () => {
  let handled = 0
  const adapter = createWecomAdapter({ secrets: credentials })
  adapter.onMessage(async () => { handled += 1 })
  await adapter.start()
  assert.equal(adapter.health().status, 'disabled')
  assert.deepEqual(await adapter.handleUpdate(signed({ MsgId: 'disabled', Content: 'hello' })), { ok: false, error: 'wecom-disabled' })
  const enabled = createWecomAdapter({ config: wecomConfig(), secrets: credentials })
  enabled.onMessage(async () => { handled += 1 })
  await enabled.start()
  await enabled.stop()
  assert.deepEqual(await enabled.handleUpdate(signed({ MsgId: 'stopped', Content: 'hello' })), { ok: true, accepted: false })
  assert.equal(handled, 0)
})

test('WeCom decrypts encrypted callbacks with the 32-byte block padding convention', async () => {
  let received
  const adapter = createWecomAdapter({ config: wecomConfig(), secrets: credentials })
  adapter.onMessage(async (message) => { received = message })
  await adapter.start()
  const echoEncrypted = encryptCallback('hello')
  assert.equal(decryptWecom(echoEncrypted, credentials.encodingAesKey, credentials.corpId), 'hello')
  const encrypted = encryptCallback(`${JSON.stringify({ Content: 'hello' })}${' '.repeat(18)}`)
  assert.deepEqual(await adapter.handleUpdate(signed({ Encrypt: encrypted })), { ok: true, accepted: true })
  assert.equal(received.text, 'hello')
})

test('WeCom rejects encrypted callbacks with a wrong receiver or malformed padding', () => {
  assert.throws(() => decryptWecom(encryptCallback('hello', 'wrong-corp-id'), credentials.encodingAesKey, credentials.corpId), /invalid-callback-receiver/)
  const malformedPadding = Buffer.alloc(31, 31)
  malformedPadding[30] = 30
  assert.throws(() => decryptWecom(encryptCallback('hello!', credentials.corpId, null, malformedPadding), credentials.encodingAesKey, credentials.corpId), /invalid-encrypted-callback/)
})

test('WeCom encrypted GET echo returns plaintext and decrypt failures are non-success responses', async () => {
  const adapter = createWecomAdapter({ config: wecomConfig(), secrets: credentials })
  const service = createImGatewayServer({ config: wecomConfig(), adapters: [adapter], bridgeClient: {} })
  try {
    await service.start(0)
    const port = service.server.address().port
    const encrypted = encryptCallback('echo')
    const query = new URLSearchParams({ echostr: encrypted, timestamp: '1710000000', nonce: 'nonce-1', msg_signature: callbackSignature({ token: credentials.token, timestamp: '1710000000', nonce: 'nonce-1', encrypt: encrypted }) })
    const valid = await fetch(`http://127.0.0.1:${port}/wecom/callback?${query}`)
    assert.equal(valid.status, 200)
    assert.equal(await valid.text(), 'echo')
    const brokenEncrypted = encryptCallback('echo', credentials.corpId, null, 5)
    const brokenQuery = new URLSearchParams({ echostr: brokenEncrypted, timestamp: '1710000000', nonce: 'nonce-1', msg_signature: callbackSignature({ token: credentials.token, timestamp: '1710000000', nonce: 'nonce-1', encrypt: brokenEncrypted }) })
    const broken = await fetch(`http://127.0.0.1:${port}/wecom/callback?${brokenQuery}`)
    assert.notEqual(broken.status, 200)
  } finally {
    await service.close()
  }
})

test('WeCom default server construction sends receipts and acknowledges plain POST callbacks', async () => {
  const previous = {
    corpId: process.env.OPENPET_IM_WECOM_CORP_ID,
    corpSecret: process.env.OPENPET_IM_WECOM_CORP_SECRET,
    token: process.env.OPENPET_IM_WECOM_TOKEN,
    encodingAesKey: process.env.OPENPET_IM_WECOM_ENCODING_AES_KEY
  }
  const fetchCalls = []
  Object.assign(process.env, {
    OPENPET_IM_WECOM_CORP_ID: credentials.corpId,
    OPENPET_IM_WECOM_CORP_SECRET: credentials.corpSecret,
    OPENPET_IM_WECOM_TOKEN: credentials.token,
    OPENPET_IM_WECOM_ENCODING_AES_KEY: credentials.encodingAesKey
  })
  const service = createImGatewayServer({
    config: wecomConfig({ allowAllPrivateChats: true }),
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options })
      return String(url).includes('/gettoken')
        ? { json: async () => ({ errcode: 0, access_token: 'access-token', expires_in: 7200 }) }
        : { json: async () => ({ errcode: 0 }) }
    }
  })
  try {
    await service.start(0)
    const port = service.server.address().port
    const timestamp = '1710000000'
    const nonce = 'default-construction'
    const body = JSON.stringify({ MsgId: 'default-post-1', FromUserName: 'user-1', Content: '/openpet status' })
    const response = await fetch(`http://127.0.0.1:${port}/wecom/callback?timestamp=${timestamp}&nonce=${nonce}&signature=${callbackSignature({ token: credentials.token, timestamp, nonce, encrypt: '' })}`, { method: 'POST', body })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /^text\/plain/)
    assert.equal(await response.text(), 'success')
    assert.equal(fetchCalls.length, 2)
    assert.equal(fetchCalls[1].options.method, 'POST')
  } finally {
    await service.close()
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[{ corpId: 'OPENPET_IM_WECOM_CORP_ID', corpSecret: 'OPENPET_IM_WECOM_CORP_SECRET', token: 'OPENPET_IM_WECOM_TOKEN', encodingAesKey: 'OPENPET_IM_WECOM_ENCODING_AES_KEY' }[key]]
      else process.env[{ corpId: 'OPENPET_IM_WECOM_CORP_ID', corpSecret: 'OPENPET_IM_WECOM_CORP_SECRET', token: 'OPENPET_IM_WECOM_TOKEN', encodingAesKey: 'OPENPET_IM_WECOM_ENCODING_AES_KEY' }[key]] = value
    }
  }
})

test('WeCom encrypted POST callbacks acknowledge success and suppress duplicates', async () => {
  const bridgeCalls = []
  const adapter = createWecomAdapter({
    config: wecomConfig({ allowAllPrivateChats: true }),
    secrets: credentials,
    httpClient: {
      getAccessToken: async () => ({ errcode: 0, access_token: 'access-token' }),
      sendMessage: async () => ({ errcode: 0 })
    }
  })
  const service = createImGatewayServer({ config: wecomConfig({ allowAllPrivateChats: true }), adapters: [adapter], bridgeClient: { say: async (payload) => bridgeCalls.push(payload) } })
  try {
    await service.start(0)
    const port = service.server.address().port
    const timestamp = '1710000000'
    const nonce = 'encrypted-post'
    const encrypted = encryptCallback(JSON.stringify({ MsgId: 'encrypted-post-1', FromUserName: 'user-1', Content: '/openpet say hello' }))
    const query = new URLSearchParams({ timestamp, nonce, msg_signature: callbackSignature({ token: credentials.token, timestamp, nonce, encrypt: encrypted }) })
    const request = () => fetch(`http://127.0.0.1:${port}/wecom/callback?${query}`, { method: 'POST', body: JSON.stringify({ Encrypt: encrypted }) })
    const first = await request()
    const second = await request()
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(await first.text(), 'success')
    assert.equal(await second.text(), 'success')
    assert.equal(bridgeCalls.length, 1)
    assert.equal(adapter.health().duplicateUpdateCount, 1)
  } finally {
    await service.close()
  }
})

test('WeCom request timeout aborts the injected HTTP client signal', async () => {
  let requestSignal
  const adapter = createWecomAdapter({
    config: wecomConfig({ wecomAgentId: 9 }),
    secrets: credentials,
    requestTimeoutMs: 250,
    httpClient: {
      getAccessToken: async (request) => {
        requestSignal = request.signal
        return new Promise(() => {})
      }
    }
  })
  await adapter.start()
  await assert.rejects(adapter.sendReceipt({ chatType: 'private', chatId: 'user-1' }, 'hello'), /request-timeout/)
  assert.equal(requestSignal?.aborted, true)
})

test('WeCom requires CorpID in configuration before reporting connected', async () => {
  const adapter = createWecomAdapter({ config: { wecomEnabled: true, wecomAgentId: 1 }, secrets: credentials })
  await adapter.start()
  assert.equal(adapter.health().status, 'missing-credentials')
})

test('WeCom requires a positive Agent ID before connecting or sending', async () => {
  let tokenRequests = 0
  const adapter = createWecomAdapter({
    config: { wecomEnabled: true, wecomCorpId: credentials.corpId, wecomAgentId: 0 },
    secrets: credentials,
    httpClient: {
      getAccessToken: async () => { tokenRequests += 1; return { errcode: 0, access_token: 'access-token' } },
      sendMessage: async () => ({ errcode: 0 })
    }
  })
  await adapter.start()
  assert.equal(adapter.health().status, 'invalid-agent-id')
  assert.equal(adapter.health().lastErrorCode, 'invalid-agent-id')
  await assert.rejects(adapter.sendReceipt({ chatType: 'private', chatId: 'user-1' }, 'hello'), /invalid-agent-id/)
  assert.equal(tokenRequests, 0)
})

test('WeCom overload health maps dropped updates to the shared handler counter', async () => {
  let release
  const adapter = createWecomAdapter({ config: wecomConfig(), secrets: credentials, maxPendingHandlers: 1 })
  adapter.onMessage(() => new Promise((resolve) => { release = resolve }))
  await adapter.start()
  const first = adapter.handleUpdate(signed({ MsgId: 'overload-1', Content: 'one' }))
  await new Promise((resolve) => setImmediate(resolve))
  const overloaded = await adapter.handleUpdate(signed({ MsgId: 'overload-2', Content: 'two' }, { nonce: 'nonce-2' }))
  assert.deepEqual(overloaded, { ok: false, error: 'handler-overloaded' })
  assert.equal(adapter.health().droppedUpdateCount, 1)
  assert.equal(createGatewayHealth({ adapters: [adapter] }).adapters.wecom.droppedHandlerCount, 1)
  release()
  await first
})
