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
    hatchPet: {
      enabled: false,
      executionMode: 'shadow',
      configMode: 'follow-chat',
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.hatch-pet',
      systemPromptVersion: 1,
      requireIdentityReviewBeforeActions: false,
      budgets: {
        maxIdentityRegenerations: 1,
        maxActionAttemptsPerAction: 3,
        maxEvaluationAttemptsPerArtifact: 2,
        maxProviderCalls: 72,
        maxPlannerCalls: 34,
        maxEvaluatorCalls: 68,
        maxElapsedMs: 43200000,
        maxEstimatedCost: null
      },
      hasApiKey: true
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

test('ai service structured completion forces one named tool without persisting conversations', async () => {
  const requests = []
  const settingsService = createSettingsService({ ai: { conversations: { keep: [{ role: 'user', content: 'unchanged' }] } } })
  const service = createAiService({
    settingsService,
    secretService: { getSecretValue: () => 'sk-private', setSecret: () => {} },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { tool_calls: [{ function: { name: 'required_tool', arguments: '{"ok":true}' } }] } }] }) }
    }
  })
  const result = await service.completeStructuredTool({
    messages: [{ role: 'user', content: 'bounded request' }],
    tool: { type: 'function', function: { name: 'required_tool', parameters: { type: 'object' } } },
    timeoutMs: 999999
  })
  assert.deepEqual(result.arguments, { ok: true })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].tools.length, 1)
  assert.deepEqual(requests[0].tool_choice, { type: 'function', function: { name: 'required_tool' } })
  assert.deepEqual(settingsService.get().ai.conversations, { keep: [{ role: 'user', content: 'unchanged' }] })
})

test('ai service structured completion keeps its timeout active while reading the response body', async () => {
  let bodyAborted = false
  const service = createAiService({
    settingsService: createSettingsService(),
    secretService: { getSecretValue: () => 'sk-private', setSecret: () => {} },
    fetchImpl: async (_url, options) => ({
      ok: true,
      status: 200,
      json: async () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          bodyAborted = true
          const error = new Error('aborted while reading response body')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    })
  })

  const result = await Promise.race([
    service.completeStructuredTool({
      messages: [{ role: 'user', content: 'bounded request' }],
      tool: { type: 'function', function: { name: 'required_tool', parameters: { type: 'object' } } },
      timeoutMs: 1000
    }).catch((error) => error),
    new Promise((resolve) => setTimeout(() => resolve(new Error('structured response body stayed pending')), 1300))
  ])

  assert.equal(result?.name, 'TimeoutError')
  assert.equal(bodyAborted, true)
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
  assert.ok(logs[0].details.requestId)
  assert.equal(logs[1].details.apiKeyRef, 'ai.default')
  assert.ok(logs[1].details.requestId)
  assert.deepEqual({
    capability: logs[1].details.capability,
    operation: logs[1].details.operation,
    configSource: logs[1].details.configSource,
    outcome: logs[1].details.outcome,
    endpointHost: logs[1].details.endpointHost
  }, {
    capability: 'chat',
    operation: 'save-secret',
    configSource: 'chat',
    outcome: 'completed',
    endpointHost: 'example.test'
  })
  assert.equal(JSON.stringify(logs).includes('sk-new'), false)
  assert.throws(() => service.saveApiKey('   '), /API Key 不能为空/)
})

test('ai service rejects owner-controlled secret refs and invalid provider config without mutating settings', () => {
  const logs = []
  const settingsService = createSettingsService()
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => '',
      setSecret: () => {}
    },
    appLogService: { record: (entry) => logs.push(entry) }
  })

  assert.throws(() => service.saveConfig({
    apiKeyRef: 'secret:model.image.openai.apiKey',
    vision: { apiKeyRef: 'ai.default' }
  }), /owner-controlled/i)
  assert.throws(() => service.saveConfig({ provider: 'custom-provider' }), /Unsupported AI provider/)
  assert.throws(() => service.saveConfig({ baseUrl: 'file:///tmp/provider' }), /HTTP or HTTPS/)
  assert.throws(() => service.saveConfig({ baseUrl: 42 }), /valid URL/)
  assert.throws(() => service.saveConfig({ model: '   ' }), /model is required/i)
  assert.throws(() => service.saveConfig({
    vision: { mode: 'override', baseUrl: 42 }
  }), /valid URL/)

  assert.equal(settingsService.get().ai.apiKeyRef, 'ai.default')
  assert.equal(settingsService.get().ai.vision, undefined)
  assert.equal(logs.some((entry) => (
    entry.event === 'ai.settings.owner-fields.rejected' &&
    entry.level === 'warn' &&
    entry.details.fields.includes('apiKeyRef') &&
    entry.details.fields.includes('vision.apiKeyRef')
  )), true)
  assert.ok(logs.find((entry) => entry.event === 'ai.settings.owner-fields.rejected').details.requestId)
  assert.equal(JSON.stringify(logs).includes('secret:model.image.openai.apiKey'), false)
})

test('ai service rejects non-object config payloads without mutating settings', () => {
  const settingsService = createSettingsService()
  const before = structuredClone(settingsService.get())
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => '',
      setSecret: () => {}
    }
  })

  assert.throws(() => service.saveConfig(null), /config payload must be an object/i)
  assert.throws(() => service.saveConfig([]), /config payload must be an object/i)
  assert.deepEqual(settingsService.get(), before)
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

test('ai service only persists owner-approved config fields', () => {
  const settingsService = createSettingsService({
    ai: {
      enabled: false,
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.default',
      systemPrompt: 'You are a friendly desktop pet companion.',
      behavior: {
        enabled: false,
        useTools: true,
        cooldownMs: 1500,
        rules: [],
        decisions: []
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

  service.saveConfig({
    enabled: true,
    hasApiKey: true,
    unexpectedField: 'ignore me',
    behavior: {
      enabled: true,
      useTools: false,
      cooldownMs: 0,
      rules: [{ id: 'renderer-injected-rule' }],
      decisions: []
    },
    vision: {
      mode: 'follow-chat',
      hasApiKey: true,
      effectiveProvider: 'renderer-controlled',
      modelCatalog: {
        cacheKey: 'renderer-controlled',
        models: ['renderer-controlled'],
        fetchedAt: '2026-07-15T00:00:00.000Z',
        source: 'saved'
      }
    }
  })

  assert.equal(Object.hasOwn(settingsService.get().ai, 'hasApiKey'), false)
  assert.equal(Object.hasOwn(settingsService.get().ai, 'unexpectedField'), false)
  assert.equal(settingsService.get().ai.behavior.enabled, false)
  assert.deepEqual(settingsService.get().ai.behavior.rules, [])
  assert.equal(Object.hasOwn(settingsService.get().ai.vision, 'hasApiKey'), false)
  assert.equal(Object.hasOwn(settingsService.get().ai.vision, 'effectiveProvider'), false)
  assert.equal(Object.hasOwn(settingsService.get().ai.vision, 'modelCatalog'), false)
})

test('ai service saveConfig canonicalizes a sanitized display baseUrl instead of retaining hidden credentials', () => {
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

  assert.equal(settingsService.get().ai.baseUrl, 'https://example.test/v1')
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

test('ai service rejects credentialed persisted provider URLs before sending a request', async () => {
  const logs = []
  let requested = false
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://user:pass@example.test/v1?token=secret',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test-secret',
      setSecret: () => {}
    },
    fetchImpl: async () => {
      requested = true
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'unexpected' } }] })
      }
    },
    appLogService: { record: (entry) => logs.push(entry) }
  })

  await assert.rejects(
    () => service.complete({ messages: [{ role: 'user', content: 'hello' }] }),
    /must not include credentials/i
  )
  const discovery = await service.discoverModels()

  assert.equal(requested, false)
  assert.equal(discovery.ok, false)
  assert.equal(logs.some((entry) => entry.event === 'ai.provider.request.failed'), true)
  assert.equal(JSON.stringify(logs).includes('user:pass'), false)
  assert.equal(JSON.stringify(logs).includes('token=secret'), false)
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
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'ai-request-1'
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
  assert.equal(logs[0].details.requestId, 'ai-request-1')
  assert.equal(logs[1].details.requestId, 'ai-request-1')
  assert.equal(typeof logs[1].details.durationMs, 'number')
  assert.deepEqual(logs.map((entry) => ({
    event: entry.event,
    capability: entry.details.capability,
    operation: entry.details.operation,
    configSource: entry.details.configSource,
    outcome: entry.details.outcome,
    endpointHost: entry.details.endpointHost
  })), [
    {
      event: 'ai.provider.request.started',
      capability: 'chat',
      operation: 'complete',
      configSource: 'chat',
      outcome: 'started',
      endpointHost: 'example.test'
    },
    {
      event: 'ai.provider.request.failed',
      capability: 'chat',
      operation: 'complete',
      configSource: 'chat',
      outcome: 'failed',
      endpointHost: 'example.test'
    }
  ])
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

test('ai service redacts sensitive provider error codes before logging or returning them', async () => {
  const leakedApiKey = 'sk-test-secret'
  const leakedPrompt = 'private user request'
  const leakedPath = '/Users/mango/private/input.txt'
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
      getSecretValue: () => leakedApiKey,
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'Provider request failed',
          code: `api_key=${leakedApiKey} prompt="${leakedPrompt}" path=${leakedPath}`
        }
      })
    }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  await assert.rejects(
    () => service.complete({ messages: [{ role: 'user', content: leakedPrompt }] }),
    (error) => {
      assert.equal(error.providerCode.includes(leakedApiKey), false)
      assert.equal(error.providerCode.includes(leakedPrompt), false)
      assert.equal(error.providerCode.includes(leakedPath), false)
      return true
    }
  )

  const serializedLogs = JSON.stringify(logs)
  assert.equal(serializedLogs.includes(leakedApiKey), false)
  assert.equal(serializedLogs.includes(leakedPrompt), false)
  assert.equal(serializedLogs.includes(leakedPath), false)
})

test('ai service redacts sensitive network exceptions before returning them to consumers', async () => {
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
    fetchImpl: async () => {
      throw new Error('Prompt "private user request" failed at /Users/mango/private/input.txt with sk-test-secret')
    },
    appLogService: { record: (entry) => logs.push(entry) }
  })

  await assert.rejects(
    () => service.complete({ messages: [{ role: 'user', content: 'private user request' }] }),
    (error) => error?.message === 'AI provider request failed'
  )
  assert.equal(JSON.stringify(logs).includes('private user request'), false)
  assert.equal(JSON.stringify(logs).includes('/Users/mango/private/input.txt'), false)
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
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

test('ai service keeps timeout and caller cancellation active while reading response bodies', async () => {
  const createService = () => createAiService({
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
      status: 200,
      json: async () => new Promise(() => {})
    }),
    requestTimeoutMs: 5
  })

  const timeoutResult = await Promise.race([
    createService().complete({ messages: [{ role: 'user', content: 'Hi' }] }).catch((error) => error),
    new Promise((resolve) => setTimeout(() => resolve(new Error('response body stayed pending')), 50))
  ])
  assert.equal(timeoutResult?.name, 'TimeoutError')

  const controller = new AbortController()
  const cancellation = createService().complete({
    messages: [{ role: 'user', content: 'Hi' }],
    signal: controller.signal
  }).catch((error) => error)
  setTimeout(() => controller.abort(), 1)
  const cancelResult = await Promise.race([
    cancellation,
    new Promise((resolve) => setTimeout(() => resolve(new Error('response body ignored cancellation')), 50))
  ])
  assert.equal(cancelResult?.name, 'AbortError')
})

test('ai service rejects generic config overrides and resolves Vision through its owner method', async () => {
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
        systemPrompt: '',
        vision: {
          mode: 'override',
          provider: 'openai-compatible',
          baseUrl: 'https://vision.example.test/v1',
          model: 'vision-model',
          apiKeyRef: 'ai.vision'
        }
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

  await assert.rejects(service.complete({
    messages: [{ role: 'user', content: 'describe the pet' }],
    configOverride: {
      provider: 'openai-compatible',
      baseUrl: 'https://attacker.example.test/v1',
      model: 'attacker-model',
      apiKeyRef: 'secret:model.image.openai.apiKey'
    }
  }), /owner-controlled/i)

  const result = await service.completeVision({
    messages: [{ role: 'user', content: 'describe the pet' }]
  })

  assert.equal(result.reply, 'override reply')
  assert.equal(requests[0].url, 'https://vision.example.test/v1/chat/completions')
  assert.equal(requests[0].body.model, 'vision-model')
  assert.equal(requests[0].headers.Authorization, 'Bearer sk-vision')
  assert.equal(service.getConfig().baseUrl, 'https://chat.example.test/v1')
  assert.equal(service.getConfig().model, 'chat-model')
  const startedLog = logs.find((entry) => entry.event === 'ai.provider.request.started')
  const completedLog = logs.find((entry) => entry.event === 'ai.provider.request.completed')
  assert.equal(startedLog.details.configSource, 'vision-override')
  assert.equal(completedLog.details.endpoint, 'https://vision.example.test/v1/chat/completions')
  assert.equal(JSON.stringify(logs).includes('attacker.example.test'), false)
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

test('ai service testConnection distinguishes model probe timeout during fetch and body parsing', async () => {
  const createService = (modelsFetch) => createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: false,
        provider: 'openai-compatible',
        baseUrl: 'https://models-timeout.example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    requestTimeoutMs: 5,
    fetchImpl: async (url, options) => {
      if (url.endsWith('/chat/completions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'ok' } }] })
        }
      }
      return await modelsFetch(options)
    }
  })

  const fetchTimeout = await createService((options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      reject(error)
    }, { once: true })
  })).testConnection()
  const bodyTimeout = await createService(async () => ({
    ok: true,
    status: 200,
    json: async () => new Promise(() => {})
  })).testConnection()

  for (const result of [fetchTimeout, bodyTimeout]) {
    assert.equal(result.ok, true)
    assert.equal(result.code, 'ok')
    assert.equal(result.modelsProbe, 'timed_out')
    assert.deepEqual(result.availableModels, [])
    assert.equal(result.currentModelDiscovered, false)
  }
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
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
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
  assert.match(serializedLogs, /ai\.settings\.connection-test\.failed/)
})

test('ai service discovers available models through the optional /models probe', async () => {
  const requests = []
  const logs = []
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
    idFactory: () => 'chat-models-1',
    appLogService: { record: (entry) => logs.push(entry) },
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
  assert.equal(logs[0].details.requestId, 'chat-models-1')
  assert.equal(logs.at(-1).details.requestId, 'chat-models-1')
  assert.equal(typeof logs.at(-1).details.durationMs, 'number')
})

test('ai service filters secrets and bounds model discovery results before caching or returning them', async () => {
  const apiKey = 'sk-provider-secret-123456'
  const oversizedModel = `model-${'x'.repeat(300)}`
  const providerModels = [
    { id: apiKey },
    { id: `Bearer ${apiKey}` },
    { id: oversizedModel },
    ...Array.from({ length: 250 }, (_, index) => ({ id: `safe-model-${String(index).padStart(3, '0')}` }))
  ]
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://models.example.test/v1',
        model: 'safe-model-000',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => apiKey,
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: providerModels })
    })
  })

  const result = await service.discoverModels()
  const cachedModels = service.getConfig().modelCatalog.models

  assert.equal(result.ok, true)
  assert.equal(result.models.length, 200)
  assert.deepEqual(result.models, cachedModels)
  assert.equal(result.models.some((model) => model.includes(apiKey)), false)
  assert.equal(result.models.some((model) => model.length > 256), false)
})

test('ai service filters short owner secrets from model discovery and persisted catalogs', async () => {
  const apiKey = 'abc'
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://models.example.test/v1',
        model: 'safe-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => apiKey,
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: `model-${apiKey}-private` }, { id: 'safe-model' }] })
    })
  })

  const result = await service.discoverModels()

  assert.deepEqual(result.models, ['safe-model'])
  assert.deepEqual(service.getConfig().modelCatalog.models, ['safe-model'])
})

test('ai service times out model discovery when the response body stalls', async () => {
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
    requestTimeoutMs: 5,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => new Promise(() => {})
    })
  })

  const result = await Promise.race([
    service.discoverModels(),
    new Promise((resolve) => setTimeout(() => resolve({ code: 'response_body_stalled' }), 50))
  ])

  assert.equal(result.code, 'timeout')
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

test('ai service exposes a renderer-safe model catalog cache key', () => {
  const settingsService = createSettingsService({
    ai: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'https://user:pass@models.example.test/v1?token=secret#frag',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.default',
      systemPrompt: '',
      modelCatalog: {
        cacheKey: 'chat:openai-compatible:https://models.example.test/v1',
        models: ['gpt-4o-mini'],
        fetchedAt: '2026-07-14T00:00:00.000Z',
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
    cacheKey: 'chat:openai-compatible:https://models.example.test/v1',
    models: ['gpt-4o-mini'],
    fetchedAt: '2026-07-14T00:00:00.000Z',
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

test('ai service discovers follow-chat vision models through the effective chat provider', async () => {
  const requests = []
  const settingsService = createSettingsService({
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
        baseUrl: 'https://stale-vision.example.test/v1',
        model: 'stale-vision-model',
        apiKeyRef: 'ai.vision'
      }
    }
  })
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: (key) => (key === 'ai.default' ? 'sk-chat' : 'sk-vision'),
      setSecret: () => {}
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'gpt-5.5' }, { id: 'gpt-4o' }] })
      }
    }
  })

  const result = await service.discoverVisionModels()

  assert.equal(result.ok, true)
  assert.equal(result.model, 'gpt-5.5')
  assert.equal(requests[0].url, 'https://chat.example.test/v1/models')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer sk-chat')
  assert.deepEqual(service.getConfig().vision.modelCatalog, service.getConfig().modelCatalog)
})

test('ai service filters the effective Vision secret from discovered model ids', async () => {
  const visionApiKey = 'sk-vision-secret-123456'
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://chat.example.test/v1',
        model: 'chat-model',
        apiKeyRef: 'ai.default',
        systemPrompt: '',
        vision: {
          mode: 'override',
          provider: 'openai-compatible',
          baseUrl: 'https://vision.example.test/v1',
          model: 'vision-model',
          apiKeyRef: 'ai.vision'
        }
      }
    }),
    secretService: {
      getSecretValue: (key) => (key === 'ai.vision' ? visionApiKey : 'sk-chat-secret-123456'),
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: visionApiKey }, { id: 'safe-vision-model' }] })
    })
  })

  const result = await service.discoverVisionModels()

  assert.deepEqual(result.models, ['safe-vision-model'])
  assert.deepEqual(service.getConfig().vision.modelCatalog.models, ['safe-vision-model'])
})

test('ai service filters a short Vision owner secret from discovery and persisted catalogs', async () => {
  const visionApiKey = 'abc'
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://chat.example.test/v1',
        model: 'chat-model',
        apiKeyRef: 'ai.default',
        systemPrompt: '',
        vision: {
          mode: 'override',
          provider: 'openai-compatible',
          baseUrl: 'https://vision.example.test/v1',
          model: 'safe-vision-model',
          apiKeyRef: 'ai.vision'
        }
      }
    }),
    secretService: {
      getSecretValue: (key) => (key === 'ai.vision' ? visionApiKey : 'chat-key'),
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: `vision-${visionApiKey}-private` }, { id: 'safe-vision-model' }] })
    })
  })

  const result = await service.discoverVisionModels()

  assert.deepEqual(result.models, ['safe-vision-model'])
  assert.deepEqual(service.getConfig().vision.modelCatalog.models, ['safe-vision-model'])
})

test('ai service bounds follow-chat vision model discovery and logs a sanitized timeout', async () => {
  const logs = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://chat.example.test/v1',
        model: 'gpt-5.5',
        apiKeyRef: 'ai.default',
        systemPrompt: '',
        vision: { mode: 'follow-chat' }
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-chat-secret',
      setSecret: () => {}
    },
    requestTimeoutMs: 5,
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    })
  })

  const result = await service.discoverVisionModels()

  assert.equal(result.ok, false)
  assert.equal(result.code, 'timeout')
  assert.equal(logs.at(-1).details.capability, 'vision')
  assert.equal(logs.at(-1).details.operation, 'discover-models')
  assert.equal(logs.at(-1).details.configSource, 'vision-follow-chat')
  assert.equal(logs.at(-1).details.outcome, 'failed')
  assert.equal(JSON.stringify(logs).includes('sk-chat-secret'), false)
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

test('ai service streamComplete tolerates a truncated trailing SSE frame', async () => {
  // 连接中断时缓冲区里可能残留半帧 JSON；flush 这半帧不应让整轮流式对话报错。
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":" trunc'
  ]
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
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
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body
    })
  })

  const result = await service.streamComplete({
    requestId: 'stream-truncated-1',
    messages: [{ role: 'user', content: 'Say hello' }]
  })

  assert.equal(result.reply, 'Hello')
  assert.equal(result.streaming, true)
  assert.equal(result.chunkCount, 2)
})

test('ai service streamComplete parses a successful non-stream JSON response without retrying', async () => {
  let callCount = 0
  const logs = []
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
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => {
      callCount += 1
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : '' },
        body: null,
        json: async () => ({
          choices: [{
            message: {
              content: 'Non-stream reply',
              tool_calls: [{
                function: {
                  name: 'openpet_behavior',
                  arguments: JSON.stringify({ intent: 'greet', confidence: 0.9, bubbleText: 'Hi' })
                }
              }]
            },
            finish_reason: 'stop'
          }]
        })
      }
    }
  })

  const result = await service.streamComplete({
    requestId: 'stream-json-fallback-1',
    messages: [{ role: 'user', content: 'Say hello' }],
    onDelta: () => assert.fail('non-stream JSON fallback must not emit SSE deltas')
  })

  assert.equal(callCount, 1)
  assert.equal(result.reply, 'Non-stream reply')
  assert.equal(result.behaviorIntent.intent, 'greet')
  assert.equal(result.streaming, false)
  assert.equal(result.fallback, true)
  assert.equal(result.fallbackReason, 'non-stream-response')
  assert.equal(result.chunkCount, 0)
  assert.equal(result.finishReason, 'stop')
  const streamTerminalLogs = logs.filter((entry) => (
    ['ai.provider.stream.completed', 'ai.provider.stream.failed'].includes(entry.event)
  ))
  assert.equal(streamTerminalLogs.length, 1)
  assert.equal(streamTerminalLogs[0].event, 'ai.provider.stream.completed')
  assert.equal(streamTerminalLogs[0].details.requestId, 'stream-json-fallback-1')
  assert.equal(streamTerminalLogs[0].details.fallback, true)
  assert.equal(streamTerminalLogs[0].details.fallbackReason, 'non-stream-response')
})

test('ai service streamComplete parses a real JSON response with a non-json content type', async () => {
  let callCount = 0
  const payload = JSON.stringify({
    choices: [{ message: { content: 'Text response reply' }, finish_reason: 'stop' }]
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
    fetchImpl: async () => {
      callCount += 1
      return new Response(payload, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    }
  })

  const result = await service.streamComplete({
    requestId: 'stream-text-json-1',
    messages: [{ role: 'user', content: 'Say hello' }]
  })

  assert.equal(callCount, 1)
  assert.equal(result.reply, 'Text response reply')
  assert.equal(result.streaming, false)
  assert.equal(result.fallback, true)
  assert.equal(result.fallbackReason, 'non-stream-response')
})

test('ai service streamComplete trusts a JSON body over an event-stream content type', async () => {
  let callCount = 0
  const logs = []
  const payload = JSON.stringify({
    choices: [{ message: { content: 'Header mismatch reply' }, finish_reason: 'stop' }]
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
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => {
      callCount += 1
      return new Response(payload, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    }
  })

  const result = await service.streamComplete({
    requestId: 'stream-event-header-json-1',
    messages: [{ role: 'user', content: 'Say hello' }],
    onDelta: () => assert.fail('ordinary JSON must not emit SSE deltas')
  })

  assert.equal(callCount, 1)
  assert.equal(result.reply, 'Header mismatch reply')
  assert.equal(result.streaming, false)
  assert.equal(result.fallback, true)
  assert.equal(result.fallbackReason, 'non-stream-response')
  const terminalLogs = logs.filter((entry) => (
    ['ai.provider.stream.completed', 'ai.provider.stream.failed'].includes(entry.event)
  ))
  assert.equal(terminalLogs.length, 1)
  assert.equal(terminalLogs[0].event, 'ai.provider.stream.completed')
  assert.equal(terminalLogs[0].details.requestId, 'stream-event-header-json-1')
})

test('ai service streamComplete trusts an SSE body over a text content type', async () => {
  let callCount = 0
  const logs = []
  const payload = [
    'data: {"choices":[{"delta":{"content":"Header "}}]}',
    '',
    'data: {"choices":[{"delta":{"content":"mismatch stream"},"finish_reason":"stop"}]}',
    '',
    'data: [DONE]',
    ''
  ].join('\n')
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
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => {
      callCount += 1
      return new Response(payload, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    }
  })
  const deltas = []

  const result = await service.streamComplete({
    requestId: 'stream-text-header-sse-1',
    messages: [{ role: 'user', content: 'Say hello' }],
    onDelta: (delta) => deltas.push(delta)
  })

  assert.equal(callCount, 1)
  assert.deepEqual(deltas, ['Header ', 'mismatch stream'])
  assert.equal(result.reply, 'Header mismatch stream')
  assert.equal(result.streaming, true)
  assert.equal(result.fallback, false)
  const terminalLogs = logs.filter((entry) => (
    ['ai.provider.stream.completed', 'ai.provider.stream.failed'].includes(entry.event)
  ))
  assert.equal(terminalLogs.length, 1)
  assert.equal(terminalLogs[0].event, 'ai.provider.stream.completed')
  assert.equal(terminalLogs[0].details.requestId, 'stream-text-header-sse-1')
})

test('ai service streamComplete detects JSON from a real response without content type', async () => {
  let callCount = 0
  const payload = Buffer.from(JSON.stringify({
    choices: [{ message: { content: 'Sniffed JSON reply' }, finish_reason: 'stop' }]
  }))
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
    fetchImpl: async () => {
      callCount += 1
      return new Response(payload, { status: 200 })
    }
  })

  const result = await service.streamComplete({
    requestId: 'stream-sniffed-json-1',
    messages: [{ role: 'user', content: 'Say hello' }]
  })

  assert.equal(callCount, 1)
  assert.equal(result.reply, 'Sniffed JSON reply')
  assert.equal(result.streaming, false)
  assert.equal(result.fallbackReason, 'non-stream-response')
})

test('ai service streamComplete parses JSON-only response objects without content type or body stream', async () => {
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
    fetchImpl: async () => {
      callCount += 1
      return {
        ok: true,
        status: 200,
        headers: { get: () => '' },
        body: null,
        json: async () => ({
          choices: [{ message: { content: 'JSON-only reply' }, finish_reason: 'stop' }]
        })
      }
    }
  })

  const result = await service.streamComplete({
    requestId: 'stream-json-only-response-1',
    messages: [{ role: 'user', content: 'Say hello' }]
  })

  assert.equal(callCount, 1)
  assert.equal(result.reply, 'JSON-only reply')
  assert.equal(result.streaming, false)
  assert.equal(result.fallbackReason, 'non-stream-response')
})

test('ai service streamComplete preserves SSE streaming when content type is missing', async () => {
  const payload = Buffer.from([
    'data: {"choices":[{"delta":{"content":"Still "}}]}',
    '',
    'data: {"choices":[{"delta":{"content":"streaming"},"finish_reason":"stop"}]}',
    '',
    'data: [DONE]',
    ''
  ].join('\n'))
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
    fetchImpl: async () => new Response(payload, { status: 200 })
  })
  const deltas = []

  const result = await service.streamComplete({
    requestId: 'stream-sniffed-sse-1',
    messages: [{ role: 'user', content: 'Say hello' }],
    onDelta: (delta) => deltas.push(delta)
  })

  assert.deepEqual(deltas, ['Still ', 'streaming'])
  assert.equal(result.reply, 'Still streaming')
  assert.equal(result.streaming, true)
  assert.equal(result.fallback, false)
})

test('ai service streamComplete reports JSON body read failures without misclassifying them as empty replies', async () => {
  const logs = []
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
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      body: null,
      json: async () => {
        throw new TypeError('terminated while reading secret-provider-body')
      }
    })
  })

  await assert.rejects(
    () => service.streamComplete({
      requestId: 'stream-json-read-failed-1',
      messages: [{ role: 'user', content: 'Say hello' }]
    }),
    (error) => error?.message === 'AI provider response body could not be parsed'
  )

  const streamTerminalLogs = logs.filter((entry) => (
    ['ai.provider.stream.completed', 'ai.provider.stream.failed'].includes(entry.event)
  ))
  assert.equal(streamTerminalLogs.length, 1)
  assert.equal(streamTerminalLogs[0].event, 'ai.provider.stream.failed')
  assert.equal(streamTerminalLogs[0].details.requestId, 'stream-json-read-failed-1')
  assert.equal(streamTerminalLogs[0].details.providerCode, 'response_parse_failed')
  assert.equal(streamTerminalLogs[0].details.errorName, 'ProviderResponseParseError')
  assert.equal(streamTerminalLogs[0].details.errorMessage, 'AI provider response body could not be parsed')
  assert.doesNotMatch(JSON.stringify(streamTerminalLogs[0]), /secret-provider-body/)
})

test('ai service streamComplete times out and releases a sniffed JSON response body', async () => {
  let readCount = 0
  let canceled = false
  let released = false
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
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => '' },
      body: {
        getReader: () => ({
          read: async () => {
            readCount += 1
            if (readCount === 1) {
              return { done: false, value: new TextEncoder().encode('{') }
            }
            return new Promise(() => {})
          },
          cancel: () => { canceled = true },
          releaseLock: () => { released = true }
        })
      },
      json: async () => ({})
    })
  })

  await assert.rejects(
    () => service.streamComplete({
      requestId: 'stream-sniffed-json-timeout-1',
      messages: [{ role: 'user', content: 'Long reply' }]
    }),
    (error) => error?.name === 'TimeoutError'
  )

  assert.equal(readCount, 2)
  assert.equal(canceled, true)
  assert.equal(released, true)
})

test('ai service streamComplete keeps timeout and caller cancellation active for non-stream JSON bodies', async () => {
  const createService = () => {
    const logs = []
    return {
      logs,
      service: createAiService({
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
        appLogService: { record: (entry) => logs.push(entry) },
        requestTimeoutMs: 5,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          body: null,
          json: async () => new Promise(() => {})
        })
      })
    }
  }

  const timeoutFixture = createService()
  await assert.rejects(
    () => timeoutFixture.service.streamComplete({
      requestId: 'stream-json-timeout-1',
      messages: [{ role: 'user', content: 'Long reply' }]
    }),
    (error) => error?.name === 'TimeoutError'
  )
  const timeoutTerminalLogs = timeoutFixture.logs.filter((entry) => (
    ['ai.provider.stream.completed', 'ai.provider.stream.failed'].includes(entry.event)
  ))
  assert.equal(timeoutTerminalLogs.length, 1)
  assert.equal(timeoutTerminalLogs[0].event, 'ai.provider.stream.failed')
  assert.equal(timeoutTerminalLogs[0].details.requestId, 'stream-json-timeout-1')

  const controller = new AbortController()
  const cancelFixture = createService()
  const pending = cancelFixture.service.streamComplete({
    requestId: 'stream-json-cancel-1',
    messages: [{ role: 'user', content: 'Long reply' }],
    signal: controller.signal
  })
  setTimeout(() => controller.abort(), 1)
  await assert.rejects(pending, (error) => error?.name === 'AbortError')
  const cancelTerminalLogs = cancelFixture.logs.filter((entry) => (
    ['ai.provider.stream.completed', 'ai.provider.stream.failed'].includes(entry.event)
  ))
  assert.equal(cancelTerminalLogs.length, 1)
  assert.equal(cancelTerminalLogs[0].event, 'ai.provider.stream.failed')
  assert.equal(cancelTerminalLogs[0].details.requestId, 'stream-json-cancel-1')
})

test('ai service streamComplete rejects a successful SSE response with no reply', async () => {
  const logs = []
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
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
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream; charset=utf-8' },
      body
    })
  })

  await assert.rejects(
    () => service.streamComplete({
      requestId: 'stream-empty-sse-1',
      messages: [{ role: 'user', content: 'Say hello' }]
    }),
    /empty response/i
  )

  const streamTerminalLogs = logs.filter((entry) => (
    ['ai.provider.stream.completed', 'ai.provider.stream.failed'].includes(entry.event)
  ))
  assert.equal(streamTerminalLogs.length, 1)
  assert.equal(streamTerminalLogs[0].event, 'ai.provider.stream.failed')
})

test('ai service streamComplete does not retry after partial SSE output fails', async () => {
  let callCount = 0
  let readCount = 0
  const deltas = []
  const logs = []
  const body = {
    getReader: () => ({
      read: async () => {
        readCount += 1
        if (readCount === 1) {
          return {
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n')
          }
        }
        throw new Error('stream disconnected')
      },
      cancel: () => {},
      releaseLock: () => {}
    })
  }
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
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => {
      callCount += 1
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/event-stream' },
        body
      }
    }
  })

  await assert.rejects(
    () => service.streamComplete({
      requestId: 'stream-partial-failure-1',
      messages: [{ role: 'user', content: 'Say hello' }],
      onDelta: (delta) => deltas.push(delta)
    }),
    /stream disconnected/i
  )

  assert.equal(callCount, 1)
  assert.deepEqual(deltas, ['Partial'])
  assert.equal(logs.filter((entry) => entry.event === 'ai.provider.request.started').length, 0)
  const streamTerminalLogs = logs.filter((entry) => (
    ['ai.provider.stream.completed', 'ai.provider.stream.failed'].includes(entry.event)
  ))
  assert.equal(streamTerminalLogs.length, 1)
  assert.equal(streamTerminalLogs[0].event, 'ai.provider.stream.failed')
  assert.equal(streamTerminalLogs[0].details.chunkCount, 1)
  assert.equal(streamTerminalLogs[0].details.partialReplyChars, 7)
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

test('ai service streamComplete times out after headers when the stream reader stalls', async () => {
  let canceled = false
  let released = false
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
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => new Promise(() => {}),
          cancel: () => { canceled = true },
          releaseLock: () => { released = true }
        })
      }
    })
  })

  await assert.rejects(
    () => service.streamComplete({
      requestId: 'stream-body-timeout-1',
      messages: [{ role: 'user', content: 'Long reply' }],
      onDelta: () => {}
    }),
    (error) => error?.name === 'TimeoutError'
  )
  assert.equal(canceled, true)
  assert.equal(released, true)
})

test('ai service streamComplete falls back before chunks when streaming is unsupported', async () => {
  let callCount = 0
  const logs = []
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
    appLogService: { record: (entry) => logs.push(entry) },
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
  const streamTerminalLogs = logs.filter((entry) => (
    ['ai.provider.stream.completed', 'ai.provider.stream.failed'].includes(entry.event)
  ))
  assert.equal(streamTerminalLogs.length, 1)
  assert.equal(streamTerminalLogs[0].event, 'ai.provider.stream.completed')
  assert.equal(streamTerminalLogs[0].details.requestId, 'stream-fallback-1')
  assert.equal(streamTerminalLogs[0].details.fallback, true)
  assert.equal(streamTerminalLogs[0].details.fallbackReason, 'unsupported-stream')
  assert.deepEqual(
    logs
      .filter((entry) => ['ai.provider.stream.started', 'ai.provider.request.started', 'ai.provider.request.completed'].includes(entry.event))
      .map((entry) => entry.details.requestId),
    ['stream-fallback-1', 'stream-fallback-1', 'stream-fallback-1']
  )
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
