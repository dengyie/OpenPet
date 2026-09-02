const assert = require('node:assert/strict')
const { test } = require('node:test')
const { callbackSignature, createWecomAdapter, parseCallbackBody } = require('../../examples/plugins/im-gateway/service/adapters/wecom')

const credentials = { corpId: 'corp-id', corpSecret: 'corp-secret', token: 'callback-token', encodingAesKey: 'aes-key' }
const signed = (body, extra = {}) => ({
  ...extra,
  body,
  timestamp: extra.timestamp || '1710000000',
  nonce: extra.nonce || 'nonce-1',
  signature: callbackSignature({ token: credentials.token, timestamp: extra.timestamp || '1710000000', nonce: extra.nonce || 'nonce-1' })
})

test('WeCom verifies signatures and normalizes JSON and XML callbacks without retaining raw payloads', async () => {
  const messages = []
  const adapter = createWecomAdapter({ config: { wecomEnabled: true }, secrets: credentials })
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
  const adapter = createWecomAdapter({ config: { wecomEnabled: true }, secrets: credentials, logEvent: (event) => events.push(event) })
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
    config: { wecomEnabled: true, wecomAgentId: 9 },
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
  const adapter = createWecomAdapter({ config: { wecomEnabled: true }, secrets: credentials })
  adapter.onMessage(async (message) => { received = message })
  await adapter.start()
  await adapter.handleUpdate(signed({ MsgId: 'group-msg', FromUserName: 'user-1', ChatId: 'group-1', Content: 'group text' }))
  assert.equal(received.chatType, 'group')
  assert.equal(received.chatId, 'group-1')
})

test('WeCom reports missing credentials and request failures without exposing secret values', async () => {
  const adapter = createWecomAdapter({ config: { wecomEnabled: true }, secrets: { corpSecret: 'top-secret', token: 'token' } })
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
  const enabled = createWecomAdapter({ config: { wecomEnabled: true }, secrets: credentials })
  enabled.onMessage(async () => { handled += 1 })
  await enabled.start()
  await enabled.stop()
  assert.deepEqual(await enabled.handleUpdate(signed({ MsgId: 'stopped', Content: 'hello' })), { ok: true, accepted: false })
  assert.equal(handled, 0)
})
