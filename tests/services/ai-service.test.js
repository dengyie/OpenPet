const test = require('node:test')
const assert = require('node:assert/strict')

const { createAiService, getBehaviorToolDefinition } = require('../../src/main/services/ai-service')

const createSettingsService = (initialSettings = {}) => {
  let current = {
    ai: {
      enabled: false,
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.default',
      systemPrompt: 'You are a friendly desktop pet companion.'
    },
    ...initialSettings
  }

  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    },
    update: (updater) => {
      current = updater(current)
      return current
    }
  }
}

test('ai service exposes config without secret values', () => {
  const service = createAiService({
    settingsService: createSettingsService(),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    }
  })

  assert.deepEqual(service.getConfig(), {
    enabled: false,
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyRef: 'ai.default',
    systemPrompt: 'You are a friendly desktop pet companion.',
    memory: {
      enabled: false
    },
    behavior: {
      enabled: false,
      useTools: true,
      cooldownMs: 1500,
      rules: [],
      decisions: []
    },
    vision: {
      mode: 'follow-chat',
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.default',
      hasApiKey: true,
      modelCatalog: {
        cacheKey: '',
        models: [],
        fetchedAt: '',
        source: 'none'
      },
      effectiveProvider: 'openai-compatible',
      effectiveBaseUrl: 'https://api.openai.com/v1',
      effectiveModel: 'gpt-4o-mini',
      effectiveHasApiKey: true
    },
    hasApiKey: true,
    modelCatalog: {
      cacheKey: '',
      models: [],
      fetchedAt: '',
      source: 'none'
    }
  })
})

test('behavior tool definition exposes action candidates reason and display mode', () => {
  const tool = getBehaviorToolDefinition({
    actions: [
      { id: 'wave', label: 'Wave', kind: 'social' },
      { id: 'sleep', label: 'Sleep', kind: 'rest' }
    ]
  })

  assert.equal(tool.function.name, 'openpet_behavior')
  assert.deepEqual(tool.function.parameters.properties.actionId.enum, ['wave', 'sleep'])
  assert.deepEqual(tool.function.parameters.properties.displayMode.enum, ['none', 'bubble', 'action', 'event'])
  assert.equal(tool.function.parameters.properties.reason.type, 'string')
  assert.match(tool.function.parameters.properties.actionId.description, /wave: Wave/)
  assert.match(tool.function.parameters.properties.actionId.description, /sleep: Sleep/)
})

test('ai service sanitizes credentialed baseUrl in public config', () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://user:pass@example.test/v1?token=secret#frag',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: 'Stay cheerful.'
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    }
  })

  assert.equal(service.getConfig().baseUrl, 'https://example.test/v1')
})

test('ai service saves config and api key separately', () => {
  const secrets = []
  const logs = []
  const settingsService = createSettingsService()
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => '',
      setSecret: (secret) => secrets.push(secret)
    },
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const saved = service.saveConfig({
    enabled: true,
    baseUrl: 'https://example.test/v1',
    model: 'example-model',
    systemPrompt: 'Be concise.'
  })
  const keyResult = service.saveApiKey('sk-new')

  assert.equal(saved.enabled, true)
  assert.equal(saved.baseUrl, 'https://example.test/v1')
  assert.equal(saved.model, 'example-model')
  assert.equal(saved.apiKeyRef, 'ai.default')
  assert.equal(saved.hasApiKey, false)
  assert.equal(settingsService.get().ai.systemPrompt, 'Be concise.')
  assert.deepEqual(secrets, [{ id: 'ai.default', value: 'sk-new', label: 'AI API Key' }])
  assert.equal(keyResult.apiKeyRef, 'ai.default')
  assert.equal(keyResult.hasApiKey, true)
  assert.match(keyResult.updatedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(logs.map((entry) => entry.event), [
    'ai.settings.saved',
    'ai.settings.api-key.saved'
  ])
  assert.equal(logs[0].details.endpoint, 'https://example.test/v1/chat/completions')
  assert.equal(logs[1].details.apiKeyRef, 'ai.default')
  assert.equal(JSON.stringify(logs).includes('sk-new'), false)
  assert.throws(() => service.saveApiKey('   '), /API Key 不能为空/)
})

test('ai service persists automatic memory config through saveConfig', () => {
  const settingsService = createSettingsService()
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => '',
      setSecret: () => {}
    }
  })

  const saved = service.saveConfig({
    memory: { enabled: true }
  })

  assert.equal(saved.memory.enabled, true)
  assert.equal(settingsService.get().ai.memory.enabled, true)
})

test('ai service does not persist derived config fields', () => {
  const settingsService = createSettingsService()
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => '',
      setSecret: () => {}
    }
  })

  service.saveConfig({
    enabled: true,
    hasApiKey: true,
    unexpectedField: 'ignore me'
  })

  assert.equal(Object.hasOwn(settingsService.get().ai, 'hasApiKey'), false)
  assert.equal(Object.hasOwn(settingsService.get().ai, 'unexpectedField'), false)
})

test('ai service saveConfig preserves a richer stored baseUrl when a renderer sends the sanitized display value', () => {
  const settingsService = createSettingsService({
    ai: {
      enabled: false,
      provider: 'openai-compatible',
      baseUrl: 'https://user:pass@example.test/v1?token=secret',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.default',
      systemPrompt: 'You are a friendly desktop pet companion.'
    }
  })
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => '',
      setSecret: () => {}
    }
  })

  service.saveConfig({
    baseUrl: 'https://example.test/v1',
    memory: { enabled: true }
  })

  assert.equal(settingsService.get().ai.baseUrl, 'https://user:pass@example.test/v1?token=secret')
  assert.equal(settingsService.get().ai.memory.enabled, true)
})

test('ai service saveConfig persists a new baseUrl when the user actually changes it', () => {
  const settingsService = createSettingsService({
    ai: {
      enabled: false,
      provider: 'openai-compatible',
      baseUrl: 'https://user:pass@example.test/v1?token=secret',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.default',
      systemPrompt: 'You are a friendly desktop pet companion.'
    }
  })
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => '',
      setSecret: () => {}
    }
  })

  service.saveConfig({
    baseUrl: 'https://new-endpoint.example/v1'
  })

  assert.equal(settingsService.get().ai.baseUrl, 'https://new-endpoint.example/v1')
})

test('ai service sends openai-compatible chat completions requests', async () => {
  const requests = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1/',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: 'Stay cheerful.'
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello from pet AI.' } }]
        })
      }
    }
  })

  const result = await service.chat({ message: 'Hi' })

  assert.equal(result.reply, 'Hello from pet AI.')
  assert.equal(requests[0].url, 'https://example.test/v1/chat/completions')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer sk-test')
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    model: 'example-model',
    messages: [
      { role: 'system', content: 'Stay cheerful.' },
      { role: 'user', content: 'Hi' }
    ]
  })
})

test('ai service records provider lifecycle without leaking secrets or prompt text', async () => {
  const logs = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test-secret',
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'Bad request for hidden user prompt',
          code: 'bad_request'
        }
      })
    }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  await assert.rejects(
    () => service.chat({ message: 'hidden user prompt' }),
    /AI provider returned an error response/
  )

  const serializedLogs = JSON.stringify(logs)
  assert.match(serializedLogs, /ai\.provider\.request\.started/)
  assert.match(serializedLogs, /ai\.provider\.request\.failed/)
  assert.equal(serializedLogs.includes('sk-test-secret'), false)
  assert.equal(serializedLogs.includes('hidden user prompt'), false)
  assert.equal(logs.at(-1).details.status, 400)
  assert.equal(logs.at(-1).details.providerCode, 'bad_request')
})

test('ai service chat redacts provider error bodies before throwing', async () => {
  const leakedApiKey = 'sk-test-secret'
  const leakedPrompt = 'hidden system prompt'
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: leakedPrompt
      }
    }),
    secretService: {
      getSecretValue: () => leakedApiKey,
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: `bad key ${leakedApiKey} with prompt ${leakedPrompt}`
        }
      })
    })
  })

  await assert.rejects(
    () => service.chat({ conversationId: 'control-center', message: 'Hi' }),
    (error) => {
      assert.equal(error.providerStatus, 401)
      assert.equal(error.message.includes(leakedApiKey), false)
      assert.equal(error.message.includes(leakedPrompt), false)
      return true
    }
  )
})

test('ai service sends behavior tool definition and parses tool call intent', async () => {
  const requests = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: '',
        behavior: {
          enabled: true,
          useTools: true
        }
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                function: {
                  name: 'openpet_behavior',
                  arguments: JSON.stringify({
                    intent: 'success',
                    actionId: 'done',
                    confidence: 0.9,
                    bubbleText: '完成了',
                    reason: '任务完成时适合庆祝',
                    displayMode: 'action'
                  })
                }
              }]
            }
          }]
        })
      }
    }
  })

  const result = await service.chat({ message: 'Finish it' })

  assert.equal(requests[0].tools[0].function.name, 'openpet_behavior')
  assert.equal(result.reply, '完成了')
  assert.deepEqual(result.behaviorIntent, {
    intent: 'success',
    actionId: 'done',
    confidence: 0.9,
    bubbleText: '完成了',
    reason: '任务完成时适合庆祝',
    displayMode: 'action'
  })
})

test('ai service accepts legacy ibot_behavior tool calls for compatibility', async () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: '',
        behavior: {
          enabled: true,
          useTools: true
        }
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              function: {
                name: 'ibot_behavior',
                arguments: JSON.stringify({
                  intent: 'greeting',
                  actionId: 'wave',
                  confidence: 0.8,
                  bubbleText: '你好'
                })
              }
            }]
          }
        }]
      })
    })
  })

  const result = await service.chat({ message: 'Say hello' })

  assert.equal(result.reply, '你好')
  assert.deepEqual(result.behaviorIntent, {
    intent: 'greeting',
    actionId: 'wave',
    confidence: 0.8,
    bubbleText: '你好'
  })
})

test('ai service keeps message history by conversation id', async () => {
  const requests = []
  const replies = ['first reply', 'second reply']
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: 'Stay cheerful.'
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: replies.shift() } }]
        })
      }
    }
  })

  await service.chat({ conversationId: 'control-center', message: 'Hi' })
  const result = await service.chat({ conversationId: 'control-center', message: 'Again' })

  assert.deepEqual(requests[1].messages, [
    { role: 'system', content: 'Stay cheerful.' },
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'first reply' },
    { role: 'user', content: 'Again' }
  ])
  assert.deepEqual(result.messages, [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'first reply' },
    { role: 'user', content: 'Again' },
    { role: 'assistant', content: 'second reply' }
  ])
})

test('ai service persists conversation history in settings', async () => {
  const settingsService = createSettingsService({
    ai: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'https://example.test/v1',
      model: 'example-model',
      apiKeyRef: 'ai.default',
      systemPrompt: 'Stay cheerful.',
      hasApiKey: true,
      unexpectedField: 'ignore me'
    }
  })
  const createService = (reply) => createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: reply } }] })
    })
  })

  await createService('stored reply').chat({ conversationId: 'control-center', message: 'Hi' })
  const reloadedService = createService('next reply')

  assert.deepEqual(reloadedService.getConversation('control-center'), [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'stored reply' }
  ])
  assert.equal(Object.hasOwn(reloadedService.getConfig(), 'conversations'), false)
  assert.equal(Object.hasOwn(settingsService.get().ai, 'hasApiKey'), false)
  assert.equal(Object.hasOwn(settingsService.get().ai, 'unexpectedField'), false)
})

test('ai service trims conversation history by message count', async () => {
  const requests = []
  let count = 0
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: 'Stay cheerful.'
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body))
      count += 1
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: `reply ${count}` } }] })
      }
    },
    maxHistoryMessages: 2
  })

  await service.chat({ conversationId: 'control-center', message: 'one' })
  await service.chat({ conversationId: 'control-center', message: 'two' })
  await service.chat({ conversationId: 'control-center', message: 'three' })

  assert.deepEqual(requests[2].messages, [
    { role: 'system', content: 'Stay cheerful.' },
    { role: 'user', content: 'two' },
    { role: 'assistant', content: 'reply 2' },
    { role: 'user', content: 'three' }
  ])
})

test('ai service evicts old conversations by configured limit', async () => {
  const settingsService = createSettingsService({
    ai: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'https://example.test/v1',
      model: 'example-model',
      apiKeyRef: 'ai.default',
      systemPrompt: ''
    }
  })
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'reply' } }] })
    }),
    maxConversations: 2
  })

  await service.chat({ conversationId: 'one', message: '1' })
  await service.chat({ conversationId: 'two', message: '2' })
  await service.chat({ conversationId: 'three', message: '3' })

  assert.deepEqual(Object.keys(settingsService.get().ai.conversations), ['two', 'three'])
  assert.deepEqual(service.getConversation('one'), [])
})

test('ai service rejects overlong conversation ids instead of truncating them', async () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'reply' } }] })
    })
  })

  await assert.rejects(
    () => service.chat({ conversationId: 'x'.repeat(161), message: 'Hi' }),
    /conversation id is too long/
  )
})

test('ai service serializes concurrent chats for the same conversation', async () => {
  const requests = []
  const resolvers = []
  const waitForRequestCount = async (count) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (requests.length >= count) return
      await new Promise((resolve) => setImmediate(resolve))
    }
    assert.equal(requests.length, count)
  }
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => {
      const requestIndex = requests.length
      requests.push(JSON.parse(options.body))
      return new Promise((resolve) => {
        resolvers[requestIndex] = () => resolve({
          ok: true,
          json: async () => ({ choices: [{ message: { content: `reply ${requestIndex + 1}` } }] })
        })
      })
    }
  })

  const first = service.chat({ conversationId: 'control-center', message: 'one' })
  const second = service.chat({ conversationId: 'control-center', message: 'two' })

  await waitForRequestCount(1)
  assert.equal(requests.length, 1)
  resolvers[0]()
  await first
  assert.equal(requests.length, 1)
  await waitForRequestCount(2)

  assert.equal(requests.length, 2)
  assert.deepEqual(requests[1].messages, [
    { role: 'user', content: 'one' },
    { role: 'assistant', content: 'reply 1' },
    { role: 'user', content: 'two' }
  ])
  resolvers[1]()

  assert.deepEqual((await second).messages, [
    { role: 'user', content: 'one' },
    { role: 'assistant', content: 'reply 1' },
    { role: 'user', content: 'two' },
    { role: 'assistant', content: 'reply 2' }
  ])
})

test('ai service saveConfig preserves persisted conversations', async () => {
  const settingsService = createSettingsService({
    ai: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'https://example.test/v1',
      model: 'example-model',
      apiKeyRef: 'ai.default',
      systemPrompt: '',
      conversations: {
        existing: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' }
        ]
      }
    }
  })
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => '',
      setSecret: () => {}
    }
  })

  service.saveConfig({ model: 'next-model', hasApiKey: true })

  assert.deepEqual(settingsService.get().ai.conversations, {
    existing: [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' }
    ]
  })
  assert.equal(Object.hasOwn(settingsService.get().ai, 'hasApiKey'), false)
})

test('ai service sanitizes stored conversations and returns clones', () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: '',
        conversations: {
          ' control-center ': [
            { role: 'system', content: 'do not return' },
            { role: 'user', content: ' Hi ' },
            { role: 'assistant', content: 'Hello', ignored: true },
            { role: 'assistant', content: '' }
          ]
        }
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    }
  })

  const messages = service.getConversation('control-center')
  messages[0].content = 'mutated'

  assert.deepEqual(service.getConversation('control-center'), [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello' }
  ])
})

test('ai service times out stalled provider requests', async () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    }),
    requestTimeoutMs: 5
  })

  await assert.rejects(
    () => service.chat({ conversationId: 'control-center', message: 'Hi' }),
    /timed out/
  )
})

test('ai service complete supports an override config without mutating chat config', async () => {
  const requests = []
  const logs = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://chat.example.test/v1',
        model: 'chat-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: (key) => (key === 'ai.vision' ? 'sk-vision' : 'sk-chat'),
      setSecret: () => {}
    },
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        headers: options.headers,
        body: JSON.parse(options.body)
      })
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'override reply' } }] })
      }
    },
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const result = await service.complete({
    messages: [{ role: 'user', content: 'describe the pet' }],
    configOverride: {
      provider: 'openai-compatible',
      baseUrl: 'https://vision.example.test/v1',
      model: 'vision-model',
      apiKeyRef: 'ai.vision'
    }
  })

  assert.equal(result.reply, 'override reply')
  assert.equal(requests[0].url, 'https://vision.example.test/v1/chat/completions')
  assert.equal(requests[0].body.model, 'vision-model')
  assert.equal(requests[0].headers.Authorization, 'Bearer sk-vision')
  assert.equal(service.getConfig().baseUrl, 'https://chat.example.test/v1')
  assert.equal(service.getConfig().model, 'chat-model')
  const startedLog = logs.find((entry) => entry.event === 'ai.provider.request.started')
  const completedLog = logs.find((entry) => entry.event === 'ai.provider.request.completed')
  assert.equal(startedLog.details.configSource, 'override')
  assert.equal(completedLog.details.endpoint, 'https://vision.example.test/v1/chat/completions')
})

test('ai service testConnection validates provider response', async () => {
  const logs = []
  const requests = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: false,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (url) => {
      requests.push(url)
      if (url.endsWith('/chat/completions')) {
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'ok' } }] })
        }
      }
      if (url.endsWith('/models')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: 'gpt-4o-mini' },
              { id: 'example-model' },
              { id: 'deepseek-chat' }
            ]
          })
        }
      }
      throw new Error(`Unexpected url: ${url}`)
    },
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const result = await service.testConnection()

  assert.equal(result.ok, true)
  assert.equal(result.provider, 'openai-compatible')
  assert.equal(result.baseUrl, 'https://example.test/v1')
  assert.equal(result.model, 'example-model')
  assert.equal(result.hasApiKey, true)
  assert.equal(result.reply, 'ok')
  assert.equal(result.code, 'ok')
  assert.equal(result.modelsProbe, 'ok')
  assert.deepEqual(result.availableModels, ['gpt-4o-mini', 'example-model', 'deepseek-chat'])
  assert.equal(result.currentModelDiscovered, true)
  assert.equal(typeof result.elapsedMs, 'number')
  assert.deepEqual(requests, [
    'https://example.test/v1/chat/completions',
    'https://example.test/v1/models'
  ])
  assert.deepEqual(logs.map((entry) => entry.event).filter((event) => event.startsWith('ai.settings.')), [
    'ai.settings.connection-test.started',
    'ai.settings.connection-test.completed'
  ])
})

test('ai service testConnection degrades safely when models probe is unavailable', async () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: false,
        provider: 'openai-compatible',
        baseUrl: 'https://models-unavailable.example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (url) => {
      if (url.endsWith('/chat/completions')) {
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'ok' } }] })
        }
      }
      if (url.endsWith('/models')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({})
        }
      }
      throw new Error(`Unexpected url: ${url}`)
    }
  })

  const result = await service.testConnection()

  assert.equal(result.ok, true)
  assert.equal(result.code, 'ok')
  assert.equal(result.modelsProbe, 'unavailable')
  assert.deepEqual(result.availableModels, [])
  assert.equal(result.currentModelDiscovered, false)
})

test('ai service testConnection keeps chat success when optional models probe parsing fails', async () => {
  const logs = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: false,
        provider: 'openai-compatible',
        baseUrl: 'https://models-json-error.example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (url) => {
      if (url.endsWith('/chat/completions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'ok' } }] })
        }
      }
      if (url.endsWith('/models')) {
        return {
          ok: true,
          status: 200,
          json: () => {
            throw new Error('models payload is not JSON')
          }
        }
      }
      throw new Error(`Unexpected url: ${url}`)
    },
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const result = await service.testConnection()

  assert.equal(result.ok, true)
  assert.equal(result.code, 'ok')
  assert.equal(result.reply, 'ok')
  assert.equal(result.modelsProbe, 'failed')
  assert.deepEqual(result.availableModels, [])
  assert.equal(result.currentModelDiscovered, false)
  assert.deepEqual(logs.map((entry) => entry.event).filter((event) => event.startsWith('ai.settings.')), [
    'ai.settings.connection-test.started',
    'ai.settings.connection-test.completed'
  ])
})

test('ai service testConnection returns missing key failure metadata', async () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => '',
      setSecret: () => {}
    },
    fetchImpl: async () => {
      throw new Error('provider should not be called without a key')
    }
  })

  const result = await service.testConnection()

  assert.equal(result.ok, false)
  assert.equal(result.hasApiKey, false)
  assert.equal(result.code, 'missing_api_key')
  assert.equal(result.message, 'AI API key is not configured')
})

test('ai service testConnection logs provider failures without leaking secrets or prompt text', async () => {
  const logs = []
  const credentialedBaseUrl = 'https://user:pass@example.test/v1?token=secret#frag'
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: credentialedBaseUrl,
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: 'hidden system prompt'
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test-secret',
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: 'Rejected sk-test-secret hidden system prompt',
          code: 'unauthorized'
        }
      })
    }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const result = await service.testConnection()
  const serializedLogs = JSON.stringify(logs)

  assert.equal(result.ok, false)
  assert.equal(result.code, 'auth_failed')
  assert.equal(result.message, 'AI provider rejected the API key')
  assert.equal(result.baseUrl, 'https://example.test/v1')
  assert.equal(serializedLogs.includes('sk-test-secret'), false)
  assert.equal(serializedLogs.includes('hidden system prompt'), false)
  assert.equal(serializedLogs.includes(credentialedBaseUrl), false)
  assert.equal(serializedLogs.includes('user:pass'), false)
  assert.equal(serializedLogs.includes('token=secret'), false)
  assert.match(serializedLogs, /ai\.settings\.connection-test\.failed/)
})

test('ai service discovers available models through the optional /models probe', async () => {
  const requests = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://models.example.test/v1',
        model: 'gpt-4o-mini',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'gpt-4o-mini' },
            { id: 'gpt-4.1-mini' },
            { id: 'gpt-4o-mini' },
            { id: '' },
            {}
          ]
        })
      }
    }
  })

  const result = await service.discoverModels()

  assert.equal(result.ok, true)
  assert.equal(result.code, 'ok')
  assert.deepEqual(result.models, ['gpt-4.1-mini', 'gpt-4o-mini'])
  assert.equal(requests[0].url, 'https://models.example.test/v1/models')
  assert.equal(requests[0].options.method, 'GET')
  assert.deepEqual(service.getConfig().modelCatalog.models, ['gpt-4.1-mini', 'gpt-4o-mini'])
  assert.equal(service.getConfig().modelCatalog.source, 'saved')
})

test('ai service only exposes cached models for the active provider owner key', async () => {
  const settingsService = createSettingsService({
    ai: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'https://models.example.test/v1',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.default',
      systemPrompt: '',
      modelCatalog: {
        cacheKey: 'chat:openai-compatible:https://other.example.test/v1',
        models: ['stale-model'],
        fetchedAt: '2026-07-04T00:00:00.000Z',
        source: 'saved'
      }
    }
  })
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    }
  })

  assert.deepEqual(service.getConfig().modelCatalog, {
    cacheKey: '',
    models: [],
    fetchedAt: '',
    source: 'none'
  })
})

test('ai service exposes a renderer-safe model catalog cache key', async () => {
  const settingsService = createSettingsService({
    ai: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'https://user:pass@models.example.test/v1?token=secret#frag',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.default',
      systemPrompt: ''
    }
  })
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'gpt-4o-mini' }]
      })
    })
  })

  await service.discoverModels()

  assert.deepEqual(service.getConfig().modelCatalog, {
    cacheKey: 'chat:openai-compatible:https://models.example.test/v1',
    models: ['gpt-4o-mini'],
    fetchedAt: settingsService.get().ai.modelCatalog.fetchedAt,
    source: 'saved'
  })
  assert.equal(service.getConfig().modelCatalog.cacheKey.includes('user:pass'), false)
  assert.equal(service.getConfig().modelCatalog.cacheKey.includes('token=secret'), false)
})

test('ai service treats missing /models support as a safe discovery fallback', async () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://models-unavailable.example.test/v1',
        model: 'gpt-4o-mini',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'not found' } })
    })
  })

  const result = await service.discoverModels()

  assert.equal(result.ok, true)
  assert.equal(result.code, 'provider_reachable_models_unavailable')
  assert.deepEqual(result.models, [])
})

test('ai service resolves vision provider to chat config by default and to override when enabled', () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://chat.example.test/v1',
        model: 'gpt-5.5',
        apiKeyRef: 'ai.default',
        systemPrompt: '',
        vision: {
          mode: 'follow-chat',
          provider: 'openai-compatible',
          baseUrl: 'https://vision.example.test/v1',
          model: 'gpt-4.1-mini',
          apiKeyRef: 'ai.vision'
        }
      }
    }),
    secretService: {
      getSecretValue: (key) => (key === 'ai.default' ? 'sk-chat' : 'sk-vision'),
      setSecret: () => {}
    }
  })

  assert.deepEqual(service.getEffectiveVisionConfig(), {
    mode: 'follow-chat',
    provider: 'openai-compatible',
    baseUrl: 'https://chat.example.test/v1',
    model: 'gpt-5.5',
    apiKeyRef: 'ai.default',
    hasApiKey: true,
    modelCatalog: {
      cacheKey: '',
      models: [],
      fetchedAt: '',
      source: 'none'
    },
    effectiveProvider: 'openai-compatible',
    effectiveBaseUrl: 'https://chat.example.test/v1',
    effectiveModel: 'gpt-5.5',
    effectiveHasApiKey: true
  })

  service.saveConfig({
    vision: {
      mode: 'override',
      provider: 'openai-compatible',
      baseUrl: 'https://vision.example.test/v1',
      model: 'gpt-4.1-mini'
    }
  })

  assert.deepEqual(service.getEffectiveVisionConfig(), {
    mode: 'override',
    provider: 'openai-compatible',
    baseUrl: 'https://vision.example.test/v1',
    model: 'gpt-4.1-mini',
    apiKeyRef: 'ai.vision',
    hasApiKey: true,
    modelCatalog: {
      cacheKey: '',
      models: [],
      fetchedAt: '',
      source: 'none'
    },
    effectiveProvider: 'openai-compatible',
    effectiveBaseUrl: 'https://vision.example.test/v1',
    effectiveModel: 'gpt-4.1-mini',
    effectiveHasApiKey: true
  })
})

test('ai service discovers vision models with an override-scoped catalog', async () => {
  const settingsService = createSettingsService({
    ai: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'https://chat.example.test/v1',
      model: 'gpt-5.5',
      apiKeyRef: 'ai.default',
      systemPrompt: '',
      vision: {
        mode: 'override',
        provider: 'openai-compatible',
        baseUrl: 'https://vision.example.test/v1',
        model: 'gpt-4.1-mini',
        apiKeyRef: 'ai.vision'
      }
    }
  })
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: (key) => (key === 'ai.vision' ? 'sk-vision' : 'sk-chat'),
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'gpt-4.1-mini' }, { id: 'gpt-4o' }]
      })
    })
  })

  const result = await service.discoverVisionModels()

  assert.equal(result.ok, true)
  assert.deepEqual(result.models, ['gpt-4.1-mini', 'gpt-4o'])
  assert.deepEqual(service.getConfig().vision.modelCatalog, {
    cacheKey: 'vision:openai-compatible:https://vision.example.test/v1',
    models: ['gpt-4.1-mini', 'gpt-4o'],
    fetchedAt: settingsService.get().ai.visionModelCatalog.fetchedAt,
    source: 'saved'
  })
})

test('ai service streamComplete parses OpenAI-compatible SSE deltas', async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
    'data: [DONE]\n\n'
  ]
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    }
  })
  const requests = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'stream-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        body
      }
    }
  })
  const deltas = []

  const result = await service.streamComplete({
    requestId: 'stream-test-1',
    messages: [{ role: 'user', content: 'Say hello' }],
    onDelta: (delta) => deltas.push(delta)
  })

  assert.equal(requests[0].url, 'https://stream.example.test/v1/chat/completions')
  assert.equal(JSON.parse(requests[0].options.body).stream, true)
  assert.deepEqual(deltas, ['Hel', 'lo'])
  assert.equal(result.reply, 'Hello')
  assert.equal(result.streaming, true)
  assert.equal(result.fallback, false)
  assert.equal(result.chunkCount, 2)
  assert.equal(result.finishReason, 'stop')
})

test('ai service streamComplete parses the final SSE event without a trailing newline', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Tail"},"finish_reason":"stop"}]}'))
      controller.close()
    }
  })
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'stream-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async () => ({ ok: true, status: 200, body })
  })

  const result = await service.streamComplete({
    messages: [{ role: 'user', content: 'Say tail' }]
  })

  assert.equal(result.reply, 'Tail')
  assert.equal(result.chunkCount, 1)
  assert.equal(result.finishReason, 'stop')
})

test('ai service streamComplete cancels a still-open response body after DONE', async () => {
  let cancelCount = 0
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode([
        'data: {"choices":[{"delta":{"content":"Done"},"finish_reason":"stop"}]}',
        'data: [DONE]',
        ''
      ].join('\n\n')))
    },
    cancel() {
      cancelCount += 1
    }
  })
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'stream-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async () => ({ ok: true, status: 200, body })
  })

  const result = await service.streamComplete({
    messages: [{ role: 'user', content: 'Finish early' }]
  })

  assert.equal(result.reply, 'Done')
  assert.equal(cancelCount, 1)
  assert.equal(body.locked, false)
})

test('ai service streamComplete honors abort signal', async () => {
  const controller = new AbortController()
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'stream-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => {
      controller.abort()
      if (options.signal?.aborted) {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        throw error
      }
      throw new Error('abort signal was not propagated')
    }
  })

  await assert.rejects(
    () => service.streamComplete({
      requestId: 'stream-abort-1',
      messages: [{ role: 'user', content: 'Long reply' }],
      signal: controller.signal,
      onDelta: () => {}
    }),
    /aborted|timed out/i
  )
})

test('ai service streamComplete classifies internal timeout separately from caller abort', async () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'stream-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    requestTimeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener?.('abort', () => {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    })
  })

  await assert.rejects(
    () => service.streamComplete({
      requestId: 'stream-timeout-1',
      messages: [{ role: 'user', content: 'Long reply' }],
      onDelta: () => {}
    }),
    (error) => error?.name === 'TimeoutError' && error?.message === 'AI provider request timed out'
  )
})

test('ai service streamComplete falls back before chunks when streaming is unsupported', async () => {
  let callCount = 0
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'stream-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => {
      callCount += 1
      const body = JSON.parse(options.body)
      if (body.stream) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'stream is not supported' } })
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Fallback reply' }, finish_reason: 'stop' }] })
      }
    }
  })

  const result = await service.streamComplete({
    requestId: 'stream-fallback-1',
    messages: [{ role: 'user', content: 'Say hello' }],
    onDelta: () => {}
  })

  assert.equal(callCount, 2)
  assert.equal(result.reply, 'Fallback reply')
  assert.equal(result.streaming, false)
  assert.equal(result.fallback, true)
  assert.equal(result.fallbackReason, 'unsupported-stream')
})

test('ai service streamComplete does not retry a generic 404 as non-streaming', async () => {
  let callCount = 0
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'missing-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async () => {
      callCount += 1
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'model was not found', code: 'model_not_found' } })
      }
    }
  })

  await assert.rejects(
    () => service.streamComplete({ messages: [{ role: 'user', content: 'Say hello' }] }),
    (error) => error?.providerStatus === 404 && error?.providerCode === 'model_not_found'
  )
  assert.equal(callCount, 1)
})

test('ai service streamComplete propagates abort signal to tools fallback completion', async () => {
  const controller = new AbortController()
  let signalFromFallback = null
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'stream-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => {
      signalFromFallback = options.signal
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(signalFromFallback.aborted, true)
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      throw error
    }
  })
  controller.abort()

  await assert.rejects(
    () => service.streamComplete({
      requestId: 'stream-tools-abort-1',
      messages: [{ role: 'user', content: 'Long reply' }],
      tools: [{ type: 'function', function: { name: 'openpet_behavior', parameters: {} } }],
      signal: controller.signal,
      onDelta: () => {}
    }),
    /aborted|timed out/i
  )
  assert.ok(signalFromFallback)
})
