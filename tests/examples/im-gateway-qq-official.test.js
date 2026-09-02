const test = require('node:test')
const assert = require('node:assert/strict')

const { createQqOfficialAdapter } = require('../../examples/plugins/im-gateway/service/adapters/qq-official')
const { createDefaultAdapters } = require('../../examples/plugins/im-gateway/service/adapters/registry')

class FakeSocket {
  constructor() {
    this.sent = []
    this.listeners = new Map()
    this.closed = false
  }

  on(event, handler) {
    const list = this.listeners.get(event) || []
    list.push(handler)
    this.listeners.set(event, list)
  }

  emit(event, value) {
    for (const handler of this.listeners.get(event) || []) handler(value)
  }

  send(value) { this.sent.push(JSON.parse(value)) }

  close() {
    this.closed = true
    this.emit('close')
  }
}

const createHttp = ({ token = 'qq-access-token', delay = 0 } = {}) => {
  const calls = []
  return {
    calls,
    request: async (url, options = {}) => {
      calls.push({ url, options })
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      if (url.endsWith('/app/getAppAccessToken')) return { status: 200, body: { access_token: token, expires_in: 3600 } }
      return { status: 200, body: { id: 'receipt-1' } }
    }
  }
}

const createAdapter = (overrides = {}) => {
  const socket = new FakeSocket()
  const httpClient = createHttp()
  const adapter = createQqOfficialAdapter({
    config: { qqEnabled: true },
    secrets: { appId: 'app-id-secret', clientSecret: 'client-secret-value' },
    httpClient,
    websocketFactory: () => socket,
    now: () => '2026-09-02T00:00:00.000Z',
    ...overrides
  })
  return { adapter, socket, httpClient }
}

test('QQ official adapter authenticates through injected HTTP and identifies over WebSocket', async () => {
  const { adapter, socket, httpClient } = createAdapter()
  await adapter.start()
  socket.emit('open')
  socket.emit('message', JSON.stringify({ op: 10, d: { heartbeat_interval: 60000 } }))

  assert.equal(httpClient.calls[0].url, 'https://bots.qq.com/app/getAppAccessToken')
  assert.deepEqual(httpClient.calls[0].options.body, { app_id: 'app-id-secret', client_secret: 'client-secret-value' })
  assert.deepEqual(socket.sent[0], {
    op: 2,
    d: { token: 'QQBot qq-access-token', intents: 1107296256, shard: [0, 0] }
  })
  const encoded = JSON.stringify(adapter.getStatus())
  assert.equal(encoded.includes('app-id-secret'), false)
  assert.equal(encoded.includes('client-secret-value'), false)
  await adapter.stop()
})

test('QQ official adapter decodes WebSocket MessageEvent payloads and uses one gateway constructor argument', async () => {
  const socket = new FakeSocket()
  const httpClient = createHttp()
  const constructorArgs = []
  const adapter = createQqOfficialAdapter({
    config: { qqEnabled: true },
    secrets: { appId: 'app-id', clientSecret: 'client-secret' },
    httpClient,
    websocketFactory: (...args) => {
      constructorArgs.push(args)
      return socket
    }
  })
  const messages = []
  adapter.onMessage((message) => { messages.push(message) })
  await adapter.start()
  assert.deepEqual(constructorArgs, [['wss://api.sgroup.qq.com/websocket']])

  const payload = JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: {
    id: 'message-event-1', author: { user_openid: 'user-1' }, content: 'from event'
  } })
  socket.emit('message', { data: payload })
  socket.emit('message', { data: new TextEncoder().encode(payload.replace('message-event-1', 'message-event-2')) })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(messages.map((message) => message.messageId), ['message-event-1', 'message-event-2'])
  await adapter.stop()
})

test('QQ official adapter tracks sequence, acknowledges heartbeat, and reports reconnect or invalid-session opcodes', async () => {
  let heartbeat
  const { adapter, socket } = createAdapter({ clock: { setTimeout: (callback) => { heartbeat = callback; return 1 }, clearTimeout: () => {} } })
  await adapter.start()
  socket.emit('open')
  socket.emit('message', { op: 10, d: { heartbeat_interval: 60000 } })
  socket.emit('message', { op: 0, s: 42, t: 'C2C_MESSAGE_CREATE', d: { id: 'sequence-1', author: { user_openid: 'u' }, content: 'x' } })
  heartbeat()
  assert.deepEqual(socket.sent.at(-1), { op: 1, d: 42 })
  socket.emit('message', { op: 1, d: 42 })
  assert.equal(adapter.getStatus().status, 'connected')
  assert.deepEqual(socket.sent.at(-1), { op: 11, d: null })

  socket.emit('message', { op: 7, d: null })
  assert.equal(adapter.getStatus().status, 'disconnected')
  assert.equal(adapter.getStatus().lastErrorCode, 'qq-reconnect-required')
  assert.equal(socket.closed, true)

  const invalid = createAdapter()
  await invalid.adapter.start()
  invalid.socket.emit('message', { op: 10, d: { heartbeat_interval: 60000 } })
  invalid.socket.emit('message', { op: 9, d: false })
  assert.equal(invalid.adapter.getStatus().status, 'disconnected')
  assert.equal(invalid.adapter.getStatus().lastErrorCode, 'qq-invalid-session')
  await adapter.stop()
  await invalid.adapter.stop()
})

test('QQ official adapter normalizes private and group dispatches and sends bounded receipts', async () => {
  const { adapter, socket, httpClient } = createAdapter()
  const messages = []
  adapter.onMessage((message) => { messages.push(message) })
  await adapter.start()
  socket.emit('open')
  socket.emit('message', JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: {
    id: 'c2c-message-1', author: { user_openid: 'private-user-1' }, content: '/openpet status'
  } }))
  socket.emit('message', JSON.stringify({ op: 0, t: 'GROUP_AT_MESSAGE_CREATE', d: {
    id: 'group-message-1', group_openid: 'group-1', author: { member_openid: 'group-user-1' }, content: 'hello group'
  } }))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(messages.length, 2)
  assert.deepEqual(messages.map(({ platform, adapterId, chatType, chatId, userId, text, isMention }) => ({ platform, adapterId, chatType, chatId, userId, text, isMention })), [
    { platform: 'qq-official', adapterId: 'qq-official', chatType: 'private', chatId: 'private-user-1', userId: 'private-user-1', text: '/openpet status', isMention: false },
    { platform: 'qq-official', adapterId: 'qq-official', chatType: 'group', chatId: 'group-1', userId: 'group-user-1', text: 'hello group', isMention: true }
  ])
  await messages[0].reply('receipt')
  assert.equal(httpClient.calls[1].url, 'https://api.sgroup.qq.com/v2/users/private-user-1/messages')
  assert.deepEqual(httpClient.calls[1].options.body, { content: 'receipt', msg_type: 0, msg_id: 'c2c-message-1' })
  assert.equal(JSON.stringify(messages[0]).includes('receipt'), false)
  await adapter.stop()
})

test('QQ official adapter ignores duplicate updates and rejects unsupported OneBot adapter ids', async () => {
  const { adapter, socket } = createAdapter()
  let count = 0
  adapter.onMessage(() => { count += 1 })
  await adapter.start()
  socket.emit('open')
  const update = JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { id: 'duplicate-1', author: { user_openid: 'u' }, content: 'x' } })
  socket.emit('message', update)
  socket.emit('message', update)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(count, 1)
  assert.equal(adapter.getStatus().duplicateUpdateCount, 1)
  assert.throws(() => createQqOfficialAdapter({ adapterId: 'onebot' }), /official|unsupported/i)
  assert.equal(createDefaultAdapters({ config: {} }).some((entry) => entry.id === 'onebot'), false)
  await adapter.stop()
})

test('QQ official adapter is disabled by default and reports bounded transport errors', async () => {
  const disabled = createQqOfficialAdapter({ config: {} })
  await disabled.start()
  assert.deepEqual(disabled.getStatus(), {
    enabled: false, status: 'disabled', mode: 'official-websocket', lastErrorCode: '',
    pendingHandlerCount: 0, droppedHandlerCount: 0, duplicateUpdateCount: 0
  })

  const missing = createQqOfficialAdapter({ config: { qqEnabled: true }, secrets: {} })
  await missing.start()
  assert.equal(missing.getStatus().lastErrorCode, 'qq-credentials-missing')
})

test('QQ official adapter bounds pending handlers and aborts them during stop', async () => {
  const { adapter, socket } = createAdapter({ stopTimeoutMs: 5 })
  let aborted = false
  adapter.onMessage((_message, { signal }) => new Promise((resolve) => {
    signal.addEventListener('abort', () => { aborted = true })
  }))
  await adapter.start()
  socket.emit('open')
  socket.emit('message', JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { id: 'slow-1', author: { user_openid: 'u' }, content: 'x' } }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(adapter.getStatus().pendingHandlerCount, 1)
  await adapter.stop()
  assert.equal(aborted, true)
  assert.equal(adapter.getStatus().pendingHandlerCount, 0)
  assert.equal(adapter.getStatus().status, 'stopped')
})
