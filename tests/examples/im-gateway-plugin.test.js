const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { normalizeConfigSchema } = require('../../src/main/plugins/config-schema')
const { normalizePluginManifest } = require('../../src/main/plugins/manifest')
const { isMessageAllowed } = require('../../examples/plugins/im-gateway/service/core/allowlist')
const { parseOpenPetCommand } = require('../../examples/plugins/im-gateway/service/core/commands')
const { createImGateway } = require('../../examples/plugins/im-gateway/service/core/gateway')
const { createFakeAdapter } = require('../../examples/plugins/im-gateway/service/adapters/fake')
const { createTelegramAdapter, createTelegramMessage } = require('../../examples/plugins/im-gateway/service/adapters/telegram')
const { normalizeImGatewayConfig } = require('../../examples/plugins/im-gateway/service/config')

const pluginRoot = path.resolve(__dirname, '../../examples/plugins/im-gateway')

test('im gateway manifest declares a bounded official runtime plugin without secret config', () => {
  const manifest = normalizePluginManifest(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf-8')),
    { source: 'local', basePath: pluginRoot }
  )
  const schema = normalizeConfigSchema(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'config.schema.json'), 'utf-8'))
  )

  assert.equal(manifest.id, 'openpet.im-gateway')
  assert.equal(manifest.profile, 'runtime')
  assert.deepEqual(manifest.permissions, ['pet:say', 'pet:action', 'pet:event', 'ai:chat'])
  assert.deepEqual(manifest.entries.services.map((service) => service.id), ['im-gateway'])
  assert.equal(manifest.entries.services[0].health.url, 'http://127.0.0.1:8796/health')
  assert.equal(schema.properties.some((field) => /token|secret|password|credential/i.test(field.key)), false)
  assert.equal(schema.properties.find((field) => field.key === 'telegramEnabled')?.default, false)
  assert.equal(schema.properties.find((field) => field.key === 'privateChatPolicy')?.hidden, true)
})

test('im gateway config normalizes safe defaults and comma separated allowlists', () => {
  const config = normalizeImGatewayConfig({
    telegramEnabled: true,
    allowedUsers: ' 1001,1002 ,, ',
    allowedChats: '-2001, -2002',
    commandAliases: '/openpet, /op',
    petSayTtlMs: '9000'
  })

  assert.equal(config.telegramEnabled, true)
  assert.equal(config.telegramMode, 'polling')
  assert.deepEqual(config.allowedUsers, ['1001', '1002'])
  assert.deepEqual(config.allowedChats, ['-2001', '-2002'])
  assert.deepEqual(config.commandAliases, ['/openpet', '/op'])
  assert.equal(config.petSayTtlMs, 9000)
  assert.equal(config.privateChatPolicy, 'command-only')
  assert.equal(config.privateTextMode, 'command-only')
  assert.equal(config.groupChatPolicy, 'mention-or-command')
  assert.equal(config.groupAiRepliesEnabled, false)
})

test('im gateway config migrates legacy private chat policy into phase 2 text mode', () => {
  const config = normalizeImGatewayConfig({
    privateChatPolicy: 'any-text'
  })

  assert.equal(config.privateChatPolicy, 'any-text')
  assert.equal(config.privateTextMode, 'pet-say')
})

test('im gateway allowlist requires user approval for private chats and chat plus user approval for groups', () => {
  const config = normalizeImGatewayConfig({
    allowedUsers: '1001,1002',
    allowedChats: '-2001',
    allowAllPrivateChats: false,
    allowAllGroupChats: false
  })

  assert.equal(isMessageAllowed({ chatType: 'private', userId: '1001', chatId: '1001' }, config).allowed, true)
  assert.equal(isMessageAllowed({ chatType: 'private', userId: '9001', chatId: '9001' }, config).allowed, false)
  assert.equal(isMessageAllowed({ chatType: 'group', userId: '1002', chatId: '-2001' }, config).allowed, true)
  assert.equal(isMessageAllowed({ chatType: 'group', userId: '1002', chatId: '-9999' }, config).allowed, false)
  assert.equal(isMessageAllowed({ chatType: 'group', userId: '9001', chatId: '-2001' }, config).allowed, false)
})

test('im gateway command parser accepts openpet aliases without leaking ordinary text into commands', () => {
  const config = normalizeImGatewayConfig({ commandAliases: '/openpet,/op' })

  assert.deepEqual(parseOpenPetCommand('/openpet say hello pet', config), {
    matched: true,
    name: 'say',
    args: ['hello', 'pet'],
    text: 'hello pet'
  })
  assert.deepEqual(parseOpenPetCommand('/op action wave', config), {
    matched: true,
    name: 'action',
    args: ['wave'],
    actionId: 'wave'
  })
  assert.deepEqual(parseOpenPetCommand('/openpet event excited hello there', config), {
    matched: true,
    name: 'event',
    args: ['excited', 'hello', 'there'],
    type: 'excited',
    message: 'hello there'
  })
  assert.deepEqual(parseOpenPetCommand('/op status', config), {
    matched: true,
    name: 'status',
    args: []
  })
  assert.deepEqual(parseOpenPetCommand('ordinary hello', config), { matched: false })
})

test('im gateway command parser recognizes onboarding helper commands', () => {
  const config = normalizeImGatewayConfig({ commandAliases: '/openpet,/op' })

  assert.deepEqual(parseOpenPetCommand('/openpet whoami', config), {
    matched: true,
    name: 'whoami',
    args: []
  })
  assert.deepEqual(parseOpenPetCommand('/op chatid', config), {
    matched: true,
    name: 'chatid',
    args: []
  })
})

test('im gateway helper commands bypass allowlist while non-helper commands still block', async () => {
  const replies = []
  const adapter = {
    id: 'telegram',
    platform: 'telegram',
    sendReceipt: async (_message, text) => replies.push(text)
  }
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {},
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      allowedChats: '-2001'
    }),
    now: () => '2026-07-09T01:00:00.000Z'
  })

  await gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'telegram',
    chatType: 'private',
    chatId: '9001',
    userId: '9001',
    userName: 'new-user',
    messageId: 'who-1',
    text: '/openpet whoami',
    receivedAt: '2026-07-09T01:00:00.000Z'
  })
  await gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'telegram',
    chatType: 'group',
    chatId: '-3001',
    userId: '9001',
    userName: 'new-user',
    messageId: 'chat-1',
    text: '/openpet chatid',
    receivedAt: '2026-07-09T01:00:01.000Z'
  })
  await gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'telegram',
    chatType: 'group',
    chatId: '-3001',
    userId: '9001',
    userName: 'new-user',
    messageId: 'status-1',
    text: '/openpet status',
    receivedAt: '2026-07-09T01:00:02.000Z'
  })

  const health = gateway.getHealth()
  const encoded = JSON.stringify(health)

  assert.equal(replies.length, 2)
  assert.equal(replies[0].includes('9001'), true)
  assert.equal(replies[1].includes('-3001'), true)
  assert.equal(health.adapters.telegram.lastAllowlistReason, 'group-chat-not-allowed')
  assert.equal(health.adapters.telegram.lastDiagnosticCode, 'allowlist-miss')
  assert.equal(health.adapters.telegram.lastDiagnosticAt, '2026-07-09T01:00:00.000Z')
  assert.equal(encoded.includes('9001'), false)
  assert.equal(encoded.includes('-3001'), false)
})

test('im gateway routes allowed command and text triggers through the pet bridge with short receipts', async () => {
  const calls = []
  const adapter = createFakeAdapter({ id: 'fake', platform: 'telegram' })
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {
      say: async (payload) => calls.push(['say', payload]),
      action: async (payload) => calls.push(['action', payload]),
      event: async (payload) => calls.push(['event', payload])
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      allowAllPrivateChats: false,
      privateChatPolicy: 'any-text',
      receiptMode: 'commands-only'
    }),
    now: () => '2026-07-08T00:00:00.000Z'
  })

  await gateway.start()
  await adapter.emitMessage({
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    text: '/op action wave',
    messageId: 'msg-1'
  })
  await adapter.emitMessage({
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    text: 'hello from telegram',
    messageId: 'msg-2'
  })
  await gateway.stop()

  assert.deepEqual(calls, [
    ['action', { actionId: 'wave' }],
    ['say', { text: 'hello from telegram', ttlMs: 6000 }]
  ])
  assert.deepEqual(adapter.receipts.map((receipt) => receipt.text), ['Action requested.'])
})

test('im gateway health redacts message content and peer identifiers', async () => {
  const adapter = createFakeAdapter({ id: 'fake', platform: 'telegram' })
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: { say: async () => {} },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      privateChatPolicy: 'any-text'
    }),
    now: () => '2026-07-08T00:00:00.000Z'
  })

  await gateway.start()
  await adapter.emitMessage({
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    text: 'secret raw message',
    messageId: 'msg-secret'
  })
  const health = gateway.getHealth()
  const encoded = JSON.stringify(health)

  assert.equal(health.ok, true)
  assert.equal(health.service, 'openpet.im-gateway')
  assert.equal(health.adapters.telegram.status, 'connected')
  assert.equal(health.adapters.telegram.triggerCount, 1)
  assert.equal(encoded.includes('secret raw message'), false)
  assert.equal(encoded.includes('1001'), false)
  assert.equal(encoded.includes('msg-secret'), false)
})

test('im gateway routes private ai-chat text through the host ai bridge', async () => {
  const aiCalls = []
  const adapter = createFakeAdapter({ id: 'fake', platform: 'telegram' })
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {
      aiChat: async (payload) => {
        aiCalls.push(payload)
        return { ok: true, result: { reply: 'y'.repeat(900) } }
      }
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      privateTextMode: 'ai-chat'
    })
  })

  await gateway.start()
  await adapter.emitMessage({
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    text: 'x'.repeat(2500),
    messageId: 'msg-ai-private'
  })

  assert.equal(aiCalls[0].message.length, 2000)
  assert.equal(aiCalls[0].conversationKey, 'telegram:private:1001:1001')
  assert.deepEqual(aiCalls[0].sourceContext, {
    platform: 'telegram',
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    messageId: 'msg-ai-private'
  })
  assert.equal(adapter.receipts[0].text.length, 800)
})

test('im gateway only treats direct bot mentions as group text triggers', async () => {
  const calls = []
  const gateway = createImGateway({
    bridgeClient: {
      say: async (payload) => calls.push(payload)
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      allowedChats: '-2001',
      groupChatPolicy: 'mention-or-command'
    }),
    now: () => '2026-07-08T00:00:00.000Z'
  })

  const adapter = { id: 'telegram', platform: 'telegram' }
  await gateway.handleMessage(adapter, createTelegramMessage({
    message: {
      message_id: 1,
      text: 'hello @someone_else',
      entities: [{ type: 'mention', offset: 6, length: 13 }]
    },
    chat: { id: '-2001', type: 'group' },
    from: { id: '1001', username: 'allowed-user' },
    me: { username: 'openpet_bot' }
  }, () => '2026-07-08T00:00:00.000Z'))
  await gateway.handleMessage(adapter, createTelegramMessage({
    message: {
      message_id: 2,
      text: 'hello @openpet_bot',
      entities: [{ type: 'mention', offset: 6, length: 12 }]
    },
    chat: { id: '-2001', type: 'group' },
    from: { id: '1001', username: 'allowed-user' },
    me: { username: 'openpet_bot' }
  }, () => '2026-07-08T00:00:01.000Z'))

  assert.deepEqual(calls, [
    { text: 'hello @openpet_bot', ttlMs: 6000 }
  ])
})

test('im gateway routes direct group mentions to ai only when the explicit toggle is enabled', async () => {
  const aiCalls = []
  const sayCalls = []
  const replies = []
  const gateway = createImGateway({
    bridgeClient: {
      aiChat: async (payload) => {
        aiCalls.push(payload)
        return { ok: true, result: { reply: 'r'.repeat(300) } }
      },
      say: async (payload) => sayCalls.push(payload)
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      allowedChats: '-2001',
      groupChatPolicy: 'mention-or-command',
      groupAiRepliesEnabled: true
    })
  })

  const adapter = {
    id: 'telegram',
    platform: 'telegram',
    sendReceipt: async (_message, text) => replies.push(text)
  }
  await gateway.handleMessage(adapter, createTelegramMessage({
    message: {
      message_id: 2,
      text: `please @openpet_bot ${'x'.repeat(900)}`,
      entities: [{ type: 'mention', offset: 7, length: 12 }]
    },
    chat: { id: '-2001', type: 'group' },
    from: { id: '1001', username: 'allowed-user' },
    me: { username: 'openpet_bot' }
  }, () => '2026-07-08T00:00:01.000Z'))

  assert.equal(sayCalls.length, 0)
  assert.equal(aiCalls[0].message.length, 500)
  assert.equal(aiCalls[0].message.startsWith('@openpet_bot'), false)
  assert.equal(aiCalls[0].conversationKey, 'telegram:group:-2001:1001')
  assert.equal(replies[0].length, 160)
})

test('im gateway allows one in-flight and one queued ai request per conversation', async () => {
  const requests = []
  const replies = []
  let releaseFirst
  const firstCanFinish = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const adapter = createFakeAdapter({ id: 'fake', platform: 'telegram' })
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {
      aiChat: async (payload) => {
        requests.push(payload.message)
        if (payload.message === 'first') {
          await firstCanFinish
          return { ok: true, result: { reply: 'reply one' } }
        }
        return { ok: true, result: { reply: `reply for ${payload.message}` } }
      }
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      privateTextMode: 'ai-chat'
    })
  })

  await gateway.start()
  const send = (text, messageId) => gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'fake',
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    messageId,
    text,
    receivedAt: '2026-07-09T00:00:00.000Z',
    reply: async (value) => replies.push(value)
  })

  const first = send('first', 'm1')
  await new Promise((resolve) => setImmediate(resolve))
  const second = send('second', 'm2')
  const third = send('third', 'm3')
  await new Promise((resolve) => setImmediate(resolve))
  releaseFirst()
  await Promise.all([first, second, third])

  assert.deepEqual(requests, ['first', 'second'])
  assert.equal(replies.includes('Still thinking about your last message. Please send one more message in a moment.'), true)
})

test('im gateway sends private failure notices but keeps group failures silent', async () => {
  const replies = []
  const gateway = createImGateway({
    bridgeClient: {
      aiChat: async () => {
        throw new Error('provider timed out')
      }
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      allowedChats: '-2001',
      privateTextMode: 'ai-chat',
      groupAiRepliesEnabled: true
    })
  })

  const privateAdapter = {
    id: 'private',
    platform: 'telegram',
    sendReceipt: async (_message, text) => replies.push(['private', text])
  }
  const groupAdapter = {
    id: 'group',
    platform: 'telegram',
    sendReceipt: async (_message, text) => replies.push(['group', text])
  }

  await gateway.handleMessage(privateAdapter, {
    platform: 'telegram',
    adapterId: 'private',
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    messageId: 'p1',
    text: 'hello',
    receivedAt: '2026-07-09T00:00:00.000Z'
  })

  await gateway.handleMessage(groupAdapter, {
    platform: 'telegram',
    adapterId: 'group',
    chatType: 'group',
    chatId: '-2001',
    userId: '1001',
    messageId: 'g1',
    text: '@openpet_bot hello',
    directMentionText: '@openpet_bot',
    isMention: true,
    receivedAt: '2026-07-09T00:00:01.000Z'
  })

  assert.deepEqual(replies, [['private', 'I could not reply just now. Please try again in a moment.']])
})

test('im gateway health exposes redacted ai counters and error codes', async () => {
  const adapter = createFakeAdapter({ id: 'fake', platform: 'telegram' })
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {
      aiChat: async () => ({ ok: true, result: { reply: 'ok reply' } })
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      privateTextMode: 'ai-chat'
    }),
    now: () => '2026-07-09T00:00:00.000Z'
  })

  await gateway.start()
  await adapter.emitMessage({
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    text: 'hello secret text',
    messageId: 'msg-ai'
  })

  const health = gateway.getHealth()
  const encoded = JSON.stringify(health)
  assert.equal(health.adapters.telegram.aiReplyCount, 1)
  assert.equal(health.adapters.telegram.lastAiReplyAt, '2026-07-09T00:00:00.000Z')
  assert.equal(health.adapters.telegram.lastAiErrorCode, '')
  assert.equal(encoded.includes('hello secret text'), false)
  assert.equal(encoded.includes('1001'), false)
})

test('im gateway records a redacted send failure code when reply delivery fails', async () => {
  const adapter = {
    id: 'telegram',
    platform: 'telegram',
    start: async () => {},
    stop: async () => {},
    sendReceipt: async () => {
      throw new Error('telegram send failed')
    },
    getStatus: () => ({
      enabled: true,
      status: 'connected',
      mode: 'fake',
      lastErrorCode: ''
    })
  }
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {
      aiChat: async () => ({ ok: true, result: { reply: 'ok reply' } })
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      privateTextMode: 'ai-chat'
    }),
    now: () => '2026-07-09T00:00:00.000Z'
  })

  await gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'telegram',
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    messageId: 'send-1',
    text: 'hello',
    receivedAt: '2026-07-09T00:00:00.000Z'
  })

  assert.equal(gateway.getHealth().adapters.telegram.lastAiErrorCode, 'reply-send-failed')
})

test('im gateway health exposes adapter error codes for operator diagnostics', async () => {
  const adapter = createTelegramAdapter({
    token: '',
    config: normalizeImGatewayConfig({ telegramEnabled: true })
  })
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {}
  })

  await gateway.start()
  const health = gateway.getHealth()

  assert.equal(health.adapters.telegram.status, 'missing-token')
  assert.equal(health.adapters.telegram.lastErrorCode, 'missing-token')
})

test('telegram adapter is disabled without a token and lazily constructs a grammY bot when provided', async () => {
  const disabled = createTelegramAdapter({
    token: '',
    config: normalizeImGatewayConfig({ telegramEnabled: true })
  })
  await disabled.start()
  assert.equal(disabled.getStatus().status, 'missing-token')

  const events = []
  class FakeBot {
    constructor(token) {
      events.push(['constructor', token])
      this.handlers = []
    }

    on(route, handler) {
      events.push(['on', route])
      this.handlers.push(handler)
    }

    start() {
      events.push(['start'])
      return Promise.resolve()
    }

    stop() {
      events.push(['stop'])
    }
  }

  const adapter = createTelegramAdapter({
    token: 'telegram-token',
    config: normalizeImGatewayConfig({ telegramEnabled: true }),
    grammy: { Bot: FakeBot }
  })

  await adapter.start()
  await adapter.stop()

  assert.deepEqual(events, [
    ['constructor', 'telegram-token'],
    ['on', 'message:text'],
    ['start'],
    ['stop']
  ])
})

test('telegram adapter reports connected without awaiting the long polling loop forever', async () => {
  class NeverResolvingBot {
    on() {}
    start() {
      return new Promise(() => {})
    }
    stop() {}
  }

  const adapter = createTelegramAdapter({
    token: 'telegram-token',
    config: normalizeImGatewayConfig({ telegramEnabled: true }),
    grammy: { Bot: NeverResolvingBot }
  })

  const result = await Promise.race([
    adapter.start().then(() => 'started'),
    new Promise((resolve) => setTimeout(() => resolve('timed-out'), 20))
  ])

  assert.equal(result, 'started')
  assert.equal(adapter.getStatus().status, 'connected')
  await adapter.stop()
})

test('telegram adapter classifies polling conflicts for operator diagnostics', async () => {
  class ConflictBot {
    on() {}
    start() {
      return Promise.reject(new Error('409: terminated by other getUpdates request'))
    }
    stop() {}
  }

  const adapter = createTelegramAdapter({
    token: 'telegram-token',
    config: normalizeImGatewayConfig({ telegramEnabled: true }),
    grammy: { Bot: ConflictBot }
  })

  await adapter.start()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(adapter.getStatus().status, 'failed')
  assert.equal(adapter.getStatus().lastErrorCode, 'telegram-polling-conflict')
})
