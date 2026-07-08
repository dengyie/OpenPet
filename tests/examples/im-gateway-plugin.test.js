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
  assert.deepEqual(manifest.permissions, ['pet:say', 'pet:action', 'pet:event'])
  assert.deepEqual(manifest.entries.services.map((service) => service.id), ['im-gateway'])
  assert.equal(manifest.entries.services[0].health.url, 'http://127.0.0.1:8796/health')
  assert.equal(schema.properties.some((field) => /token|secret|password|credential/i.test(field.key)), false)
  assert.equal(schema.properties.find((field) => field.key === 'telegramEnabled')?.default, false)
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
  assert.equal(config.groupChatPolicy, 'mention-or-command')
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
