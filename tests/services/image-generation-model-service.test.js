const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createImageGenerationModelService } = require('../../src/main/services/image-generation-model-service')
const { createSavedProviderModelCatalog } = require('../../src/main/services/provider-model-catalog')
const { buildCharacterAnchorPrompt } = require('../../examples/plugins/creator-studio/lib/anchor-prompt-builder')

const createSettingsService = (initialSettings = {}) => {
  let current = {
    models: {},
    ...initialSettings
  }

  return {
    get: () => current,
    save: (next) => {
      current = next
      return current
    }
  }
}

const createSecretService = (initial = {}) => {
  const store = new Map(Object.entries(initial))
  return {
    setSecret: ({ id, value, label }) => {
      store.set(id, { value, label: label || id })
      return { id, label: label || id, hasValue: Boolean(value) }
    },
    getSecretValue: (id) => store.get(id)?.value || '',
    deleteSecret: (id) => {
      store.delete(id)
    },
    listSecretRefs: () => Array.from(store.entries()).map(([id, secret]) => ({
      id,
      label: secret.label || id,
      hasValue: Boolean(secret.value)
    }))
  }
}

const providerSettings = (overrides = {}) => ({
  models: {
    imageGeneration: {
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8317/v1',
      model: 'gpt-image-2',
      apiKeyRef: 'secret:model.image.openai.apiKey',
      timeoutMs: 120000,
      maxConcurrentJobs: 1,
      ...overrides
    }
  }
})

const waitForTurn = () => new Promise((resolve) => setImmediate(resolve))

const waitForRequestCount = async (requests, expectedCount) => {
  for (let index = 0; index < 20; index += 1) {
    if (requests.length >= expectedCount) return
    await waitForTurn()
  }
  assert.fail(`Timed out waiting for ${expectedCount} provider request(s); saw ${requests.length}`)
}

const createReferenceImages = (dataDir, fileName = 'canonical-reference.png') => {
  const relativePath = path.posix.join('inputs', 'references', fileName)
  const referencePath = path.join(dataDir, ...relativePath.split('/'))
  fs.mkdirSync(path.dirname(referencePath), { recursive: true })
  fs.writeFileSync(referencePath, Buffer.from('reference-image-bytes'))
  return [{
    path: referencePath,
    fileName,
    relativePath,
    metadataRelativePath: 'inputs/references/reference.json',
    role: 'canonical-reference'
  }]
}

test('image generation model service exposes a renderer-safe unified provider config view and migrates legacy cloud config', () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'cloud',
          cloud: {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1/',
            model: 'gpt-image-1',
            apiKeyRef: 'secret:model.image.openai.apiKey'
          }
        }
      }
    }),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-abcd', label: 'Image API Key' }
    })
  })

  const config = service.getConfig()

  assert.equal(config.provider, 'openai')
  assert.equal(config.baseUrl, 'https://api.openai.com/v1')
  assert.equal(config.model, 'gpt-image-1')
  assert.equal(config.hasApiKey, true)
  assert.equal(config.apiKeyPreview, '••••abcd')
  assert.deepEqual(config.modelCatalog, {
    cacheKey: '',
    models: [],
    fetchedAt: '',
    source: 'none'
  })
  assert.equal(Object.hasOwn(config, 'apiKey'), false)
  assert.equal(Object.hasOwn(config, 'cloud'), false)
  assert.equal(Object.hasOwn(config, 'local'), false)
  assert.equal(Object.hasOwn(config, 'defaultBackend'), false)
})

test('image generation model service sanitizes legacy credentialed URLs and rejects discovery before network access', async () => {
  const logs = []
  let requested = false
  const settingsService = createSettingsService(providerSettings({
    baseUrl: 'https://user:pass@images.example.test/v1?token=secret#frag'
  }))
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService(),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => {
      requested = true
      return { ok: true, status: 200, json: async () => ({ data: [] }) }
    }
  })

  assert.equal(service.getConfig().baseUrl, 'https://images.example.test/v1')
  const result = await service.discoverModels()

  assert.equal(result.ok, false)
  assert.equal(result.hasApiKey, false)
  assert.equal(requested, false)
  assert.equal(logs.at(-1).event, 'imageGeneration.models.failed')
  assert.equal(JSON.stringify(logs).includes('user:pass'), false)
  assert.equal(JSON.stringify(logs).includes('token=secret'), false)
})

test('image generation model service canonicalizes a legacy credentialed URL on the next save', () => {
  const settingsService = createSettingsService(providerSettings({
    baseUrl: 'https://user:pass@images.example.test/v1?token=secret#frag'
  }))
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService()
  })

  service.saveConfig({ model: 'next-image-model' })

  assert.equal(settingsService.get().models.imageGeneration.baseUrl, 'https://images.example.test/v1')
  assert.equal(settingsService.get().models.imageGeneration.model, 'next-image-model')
})

test('image generation model service saves unified config without persisting derived secret fields', () => {
  const settingsService = createSettingsService()
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService()
  })

  const saved = service.saveConfig({
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:8317/v1/',
    model: 'gpt-image-2',
    apiKeyRef: 'secret:model.image.openai.apiKey',
    timeoutMs: 90000,
    maxConcurrentJobs: 2,
    hasApiKey: true,
    apiKeyPreview: '••••abcd'
  })

  assert.equal(saved.baseUrl, 'http://127.0.0.1:8317/v1')
  assert.equal(saved.timeoutMs, 90000)
  assert.equal(settingsService.get().models.imageGeneration.model, 'gpt-image-2')
  assert.equal(Object.hasOwn(settingsService.get().models.imageGeneration, 'hasApiKey'), false)
  assert.equal(Object.hasOwn(settingsService.get().models.imageGeneration, 'apiKeyPreview'), false)
})

test('image generation model service does not persist renderer-only model catalog or unexpected fields', () => {
  const savedCatalog = createSavedProviderModelCatalog({
    capability: 'image',
    provider: 'openai-compatible',
    baseUrl: 'https://images.example.test/v1',
    models: ['saved-image-model'],
    fetchedAt: '2026-07-04T08:00:00.000Z'
  })
  const settingsService = createSettingsService({
    models: {
      imageGeneration: {
        provider: 'openai-compatible',
        baseUrl: 'https://images.example.test/v1',
        model: 'saved-image-model',
        apiKeyRef: 'secret:model.image.openai.apiKey',
        timeoutMs: 120000,
        maxConcurrentJobs: 1,
        modelCatalog: savedCatalog
      }
    }
  })
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService()
  })

  service.saveConfig({
    model: 'next-image-model',
    hasApiKey: true,
    apiKeyPreview: '••••9999',
    apiKeyLabel: 'Image API Key',
    unexpectedField: 'ignore me',
    modelCatalog: {
      cacheKey: 'draft-cache',
      models: ['draft-image-model'],
      fetchedAt: '2026-07-05T09:00:00.000Z',
      source: 'draft'
    }
  })

  assert.equal(settingsService.get().models.imageGeneration.model, 'next-image-model')
  assert.equal(Object.hasOwn(settingsService.get().models.imageGeneration, 'hasApiKey'), false)
  assert.equal(Object.hasOwn(settingsService.get().models.imageGeneration, 'apiKeyPreview'), false)
  assert.equal(Object.hasOwn(settingsService.get().models.imageGeneration, 'apiKeyLabel'), false)
  assert.equal(Object.hasOwn(settingsService.get().models.imageGeneration, 'unexpectedField'), false)
  assert.deepEqual(settingsService.get().models.imageGeneration.modelCatalog, savedCatalog)
  assert.deepEqual(service.getConfig().modelCatalog, savedCatalog)
})

test('image generation model service exposes a creator workflow model policy with host-owned verified fallback truth', () => {
  const settingsService = createSettingsService({
    models: {
      imageGeneration: {
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-image-2',
        apiKeyRef: 'secret:model.image.openai.apiKey',
        timeoutMs: 120000,
        maxConcurrentJobs: 1,
        modelCatalog: createSavedProviderModelCatalog({
          capability: 'image',
          provider: 'openai-compatible',
          baseUrl: 'http://127.0.0.1:8317/v1',
          models: ['gpt-image-2', 'gpt-image-1.5', 'grok-imagine-image'],
          fetchedAt: '2026-07-05T09:00:00.000Z'
        })
      }
    }
  })
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService()
  })

  const config = service.getConfig()

  assert.deepEqual(config.creatorWorkflowModelPolicy, {
    evidenceScope: 'creator-one-click-default',
    preferredModel: 'gpt-image-2',
    verifiedModels: ['gpt-image-2'],
    fallbackModels: [],
    discoveredModels: ['gpt-image-1.5', 'gpt-image-2', 'grok-imagine-image'],
    preferredModelVerified: true
  })
})

test('image generation model service does not let config saves retarget the provider api key ref', () => {
  const settingsService = createSettingsService()
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService()
  })

  const config = service.getConfig()

  assert.deepEqual(config.creatorWorkflowModelPolicy, {
    evidenceScope: 'creator-one-click-default',
    preferredModel: 'gpt-image-2',
    verifiedModels: ['gpt-image-1.5', 'gpt-image-2'],
    fallbackModels: ['gpt-image-1.5'],
    discoveredModels: ['gpt-image-1.5', 'gpt-image-2', 'grok-imagine-image'],
    preferredModelVerified: true
  })
})

test('image generation model service rejects config attempts to retarget the provider api key ref', () => {
  const settingsService = createSettingsService()
  const logs = []
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService(),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  assert.throws(() => service.saveConfig({
    baseUrl: 'https://images.example.test/v1',
    model: 'custom-image-model',
    apiKeyRef: 'ai.default'
  }), /owner-controlled/i)

  assert.equal(service.getConfig().apiKeyRef, 'secret:model.image.openai.apiKey')
  assert.equal(settingsService.get().models.imageGeneration, undefined)
  assert.equal(logs.at(-1).event, 'imageGeneration.settings.owner-fields.rejected')
  assert.deepEqual(logs.at(-1).details.fields, ['apiKeyRef'])
  assert.equal(JSON.stringify(logs).includes('ai.default'), false)
})

test('image generation model service rejects invalid provider and model config in the owner', () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService: createSecretService()
  })

  assert.throws(() => service.saveConfig({ provider: 'custom-provider' }), /Unsupported Image provider/)
  assert.throws(() => service.saveConfig({ model: '   ' }), /Image model is required/)
})

test('image generation model service rejects non-object config payloads without mutating settings', () => {
  const settingsService = createSettingsService()
  const before = structuredClone(settingsService.get())
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService()
  })

  assert.throws(() => service.saveConfig(null), /config payload must be an object/i)
  assert.throws(() => service.saveConfig(undefined), /config payload must be an object/i)
  assert.throws(() => service.saveConfig([]), /config payload must be an object/i)
  assert.deepEqual(settingsService.get(), before)
})

test('image generation model service rejects non-owner secret refs from persisted settings', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  let requested = false
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ apiKeyRef: 'secret:model.image.attacker.apiKey' })),
    secretService: createSecretService({
      'secret:model.image.attacker.apiKey': { value: 'sk-attacker-secret', label: 'Other Image API Key' }
    }),
    fetchImpl: async () => {
      requested = true
      return { ok: true, status: 200, json: async () => ({ data: [] }) }
    }
  })

  assert.equal(service.getConfig().apiKeyRef, 'secret:model.image.openai.apiKey')
  assert.equal(service.getConfig().hasApiKey, false)
  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: 'runs/rejected-secret-ref/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /API key is missing/
  )
  assert.equal(requested, false)
})

test('image generation model service rejects unsupported persisted providers before network access', async () => {
  const logs = []
  let requested = false
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ provider: 'attacker-provider' })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-image', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => {
      requested = true
      return { ok: true, status: 200, json: async () => ({ data: [] }) }
    }
  })

  const result = await service.checkHealth()

  assert.equal(result.ok, false)
  assert.equal(result.code, 'health_check_error')
  assert.equal(requested, false)
  assert.equal(logs.at(-1).event, 'imageGeneration.health.failed')
})

test('image generation model service saves and clears provider api keys through secret service', () => {
  const secretService = createSecretService()
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService,
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const saved = service.saveProviderApiKey('sk-demo-1234')
  assert.equal(saved.hasApiKey, true)
  assert.equal(saved.apiKeyPreview, '••••1234')

  const cleared = service.clearProviderApiKey()
  assert.equal(cleared.hasApiKey, false)
  assert.equal(cleared.apiKeyPreview, '')
  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.settings.api-key.saved',
    'imageGeneration.settings.api-key.cleared'
  ])
  assert.equal(logs[0].details.apiKeyRef, 'secret:model.image.openai.apiKey')
  assert.equal(logs[0].details.capability, 'image')
  assert.equal(logs[0].details.operation, 'save-secret')
  assert.ok(logs[0].details.requestId)
  assert.equal(logs[0].details.configSource, 'image')
  assert.equal(logs[0].details.outcome, 'completed')
  assert.equal(logs[1].details.operation, 'clear-secret')
  assert.ok(logs[1].details.requestId)
  assert.equal(JSON.stringify(logs).includes('sk-demo-1234'), false)
})

test('image generation model service rejects blank provider api keys without mutating the secret', () => {
  const secretService = createSecretService({
    'secret:model.image.openai.apiKey': { value: 'sk-existing-1234', label: 'Image API Key' }
  })
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService,
    appLogService: { record: (entry) => logs.push(entry) }
  })

  assert.throws(() => service.saveProviderApiKey('   '), /API Key.*不能为空/i)
  assert.equal(secretService.getSecretValue('secret:model.image.openai.apiKey'), 'sk-existing-1234')
  assert.equal(logs.some((entry) => entry.event === 'imageGeneration.settings.api-key.saved'), false)
})

test('image generation model service logs safe provider settings when config is saved', () => {
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService: createSecretService(),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  service.saveConfig({
    baseUrl: 'https://images.example.test/v1',
    model: 'openpet-image-test',
    timeoutMs: 90000,
    maxConcurrentJobs: 2
  })

  assert.deepEqual(logs.map((entry) => entry.event), ['imageGeneration.settings.saved'])
  assert.equal(logs[0].details.baseUrlHost, 'images.example.test')
  assert.equal(logs[0].details.model, 'openpet-image-test')
  assert.equal(logs[0].details.timeoutMs, 90000)
  assert.equal(logs[0].details.maxConcurrentJobs, 2)
  assert.equal(logs[0].details.capability, 'image')
  assert.equal(logs[0].details.operation, 'save-config')
  assert.equal(logs[0].details.configSource, 'image')
  assert.equal(logs[0].details.outcome, 'completed')
  assert.equal(logs[0].details.endpointHost, 'images.example.test')
})

test('image generation model service reports missing provider api key in health checks', async () => {
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService(),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'health-missing-key'
  })

  const result = await service.checkHealth()

  assert.equal(result.ok, false)
  assert.equal(result.provider, 'openai-compatible')
  assert.equal(result.code, 'missing_api_key')
  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.health.started',
    'imageGeneration.health.failed'
  ])
  assert.equal(logs[1].details.requestId, 'health-missing-key')
  assert.equal(logs[1].details.errorCode, 'missing_api_key')
})

test('image generation model service treats missing models endpoint as reachable for custom image providers', async () => {
  const requests = []
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({
      baseUrl: 'https://images.example.test/v1',
      model: 'custom-image-model'
    })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-custom', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'health-custom-models-unavailable',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'not found' } })
      }
    }
  })

  const result = await service.checkHealth()

  assert.equal(result.ok, true)
  assert.equal(result.code, 'provider_reachable_models_unavailable')
  assert.equal(requests[0].url, 'https://images.example.test/v1/models')
  assert.equal(logs[1].event, 'imageGeneration.health.completed')
  assert.equal(logs[1].details.modelsProbe, 'unavailable')
  assert.equal(logs[1].details.status, 404)
})

test('image generation model service returns discovered models when the optional models probe succeeds', async () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({
      baseUrl: 'https://images.example.test/v1',
      model: 'openpet-image-test'
    })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-custom', label: 'Image API Key' }
    }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'gpt-image-2' },
          { id: 'openpet-image-test' },
          { id: 'flux-dev-transparent' },
          { name: 'missing-id-ignored' }
        ]
      })
    })
  })

  const result = await service.checkHealth()

  assert.equal(result.ok, true)
  assert.equal(result.code, 'provider_healthy')
  assert.deepEqual(result.availableModels, [
    'gpt-image-2',
    'openpet-image-test',
    'flux-dev-transparent'
  ])
  assert.equal(result.currentModelDiscovered, true)
})

test('image generation health times out while reading a stalled response body', async () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-image', label: 'Image API Key' }
    }),
    providerGenerationTimeoutMs: 5,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => new Promise(() => {})
    })
  })

  const result = await service.checkHealth()

  assert.equal(result.ok, false)
  assert.equal(result.code, 'health_check_timeout')
  assert.equal(result.modelsProbe, 'timed_out')
})

test('image generation model service discovers available models through the optional /models probe', async () => {
  const requests = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({
      baseUrl: 'https://images-models.example.test/v1',
      model: 'gpt-image-2'
    })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-image', label: 'Image API Key' }
    }),
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'gpt-image-2' },
            { id: 'openpet-image-test' },
            { id: 'gpt-image-2' },
            {}
          ]
        })
      }
    }
  })

  const result = await service.discoverModels()

  assert.equal(result.ok, true)
  assert.equal(result.code, 'ok')
  assert.deepEqual(result.models, ['gpt-image-2', 'openpet-image-test'])
  assert.equal(requests[0].url, 'https://images-models.example.test/v1/models')
  assert.equal(requests[0].options.method, 'GET')
  assert.deepEqual(service.getConfig().modelCatalog.models, ['gpt-image-2', 'openpet-image-test'])
  assert.equal(service.getConfig().modelCatalog.source, 'saved')
})

test('image generation model service filters secrets and bounds discovered models', async () => {
  const apiKey = 'sk-image-secret-123456'
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: apiKey, label: 'Image API Key' }
    }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: apiKey },
          { id: `token=${apiKey}` },
          { id: `model-${'x'.repeat(300)}` },
          ...Array.from({ length: 250 }, (_, index) => ({ id: `safe-image-model-${String(index).padStart(3, '0')}` }))
        ]
      })
    })
  })

  const result = await service.discoverModels()

  assert.equal(result.models.length, 200)
  assert.deepEqual(result.models, service.getConfig().modelCatalog.models)
  assert.equal(result.models.some((model) => model.includes(apiKey)), false)
  assert.equal(result.models.some((model) => model.length > 256), false)
})

test('image generation model service filters short owner secrets from discovery and persisted catalogs', async () => {
  const apiKey = 'abc'
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: apiKey, label: 'Image API Key' }
    }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: `image-${apiKey}-private` }, { id: 'safe-image-model' }] })
    })
  })

  const result = await service.discoverModels()

  assert.deepEqual(result.models, ['safe-image-model'])
  assert.deepEqual(service.getConfig().modelCatalog.models, ['safe-image-model'])
})

test('image generation model discovery does not expose provider response text in logs', async () => {
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-image', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({
        error: { message: 'private provider response with sk-provider-secret and prompt text' }
      })
    })
  })

  const result = await service.discoverModels()

  assert.equal(result.ok, false)
  assert.equal(result.code, 'provider_unhealthy')
  assert.equal(Object.hasOwn(logs.at(-1).details, 'providerMessage'), false)
  assert.equal(JSON.stringify(logs).includes('private provider response'), false)
  assert.equal(JSON.stringify(logs).includes('prompt text'), false)
})

test('image generation model service bounds model discovery and returns sanitized timeout diagnostics', async () => {
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-image-secret', label: 'Image API Key' }
    }),
    providerGenerationTimeoutMs: 5,
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async (_url, options) => {
      assert.ok(options.signal, 'model discovery must provide an abort signal')
      return await new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    }
  })

  const result = await service.discoverModels()

  assert.equal(result.ok, false)
  assert.equal(result.code, 'model_discovery_timeout')
  assert.equal(logs.at(-1).event, 'imageGeneration.models.failed')
  assert.equal(logs.at(-1).details.outcome, 'failed')
  assert.equal(logs.at(-1).details.errorCode, 'model_discovery_timeout')
  assert.equal(JSON.stringify(logs).includes('sk-image-secret'), false)
})

test('image generation model service times out model discovery while reading a stalled body', async () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-image-secret', label: 'Image API Key' }
    }),
    providerGenerationTimeoutMs: 5,
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

  assert.equal(result.code, 'model_discovery_timeout')
})

test('image generation model service strips control characters from discovered model ids', async () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({
      baseUrl: 'https://images-models.example.test/v1',
      model: 'gpt-image-2'
    })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-image', label: 'Image API Key' }
    }),
    fetchImpl: async (url) => {
      if (String(url).endsWith('/models')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { id: 'gpt-image-2\u0000' },
              { id: 'gpt-image-1.5' },
              { id: 'gpt-image-2' }
            ]
          })
        }
      }
      throw new Error(`Unexpected url: ${url}`)
    }
  })

  const discovery = await service.discoverModels()
  assert.deepEqual(discovery.models, ['gpt-image-2', 'gpt-image-1.5'])
})

test('image generation model service only exposes cached models for the active provider owner key', () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({
      baseUrl: 'https://images-models.example.test/v1',
      modelCatalog: {
        cacheKey: 'image:openai-compatible:https://old-images.example.test/v1',
        models: ['stale-image-model'],
        fetchedAt: '2026-07-04T00:00:00.000Z',
        source: 'saved'
      }
    })),
    secretService: createSecretService()
  })

  assert.deepEqual(service.getConfig().modelCatalog, {
    cacheKey: '',
    models: [],
    fetchedAt: '',
    source: 'none'
  })
})

test('image generation model service can bound health probe time with an explicit timeout override', async () => {
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({
      baseUrl: 'https://images.example.test/v1',
      model: 'openpet-image-test'
    })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-custom', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'health-timeout-test',
    fetchImpl: async () => new Promise(() => {})
  })

  const result = await service.checkHealth({ timeoutMs: 25 })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'health_check_timeout')
  assert.match(result.message, /timed out/i)
  assert.equal(logs[1].event, 'imageGeneration.health.failed')
  assert.equal(logs[1].details.errorCode, 'health_check_timeout')
})

test('image generation model service maps legacy local settings into the unified provider view', () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'local',
          local: {
            endpoint: 'http://127.0.0.1:7860/v1',
            model: 'local-openai-compatible-image',
            timeoutMs: 90000,
            maxConcurrentJobs: 2
          }
        }
      }
    }),
    secretService: createSecretService()
  })

  const config = service.getConfig()

  assert.equal(config.provider, 'openai-compatible')
  assert.equal(config.baseUrl, 'http://127.0.0.1:7860/v1')
  assert.equal(config.model, 'local-openai-compatible-image')
  assert.equal(config.timeoutMs, 90000)
  assert.equal(config.maxConcurrentJobs, 2)
})

test('image generation model service prefers legacy local settings when flat defaults were merged in', () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          provider: 'openai-compatible',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-image-2',
          apiKeyRef: 'secret:model.image.openai.apiKey',
          timeoutMs: 120000,
          maxConcurrentJobs: 1,
          defaultBackend: 'local',
          local: {
            endpoint: 'http://127.0.0.1:7860/v1',
            model: 'local-openai-compatible-image',
            timeoutMs: 90000,
            maxConcurrentJobs: 2
          }
        }
      }
    }),
    secretService: createSecretService()
  })

  const config = service.getConfig()

  assert.equal(config.baseUrl, 'http://127.0.0.1:7860/v1')
  assert.equal(config.model, 'local-openai-compatible-image')
  assert.equal(config.timeoutMs, 90000)
  assert.equal(config.maxConcurrentJobs, 2)
})

test('image generation model service writes reference-conditioned outputs under the allowed data directory', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const requests = []
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ model: 'gpt-image-1' })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-1',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { b64_json: Buffer.from('fake-image-bytes').toString('base64') }
          ]
        })
      }
    },
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  const result = await service.generateImage({
    prompt: 'small mint helper cat, transparent background',
    referenceImages: createReferenceImages(dataDir),
    output: {
      dataDir,
      dataRelativeDir: 'runs/2026-06-19-sprout-cat/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.requestId, 'img-run-1')
  assert.equal(result.provider, 'openai-compatible')
  assert.equal(result.outputs.length, 1)
  assert.match(result.outputs[0].dataRelativePath, /^runs\/2026-06-19-sprout-cat\/frames\/base\/0001\.png$/)
  assert.equal(fs.existsSync(path.join(dataDir, result.outputs[0].dataRelativePath)), true)
  assert.equal(requests[0].url, 'http://127.0.0.1:8317/v1/images/generations')
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    model: 'gpt-image-1',
    prompt: 'small mint helper cat, transparent background',
    size: '1024x1024',
    n: 1,
    background: 'transparent',
    response_format: 'b64_json'
  })
  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.request.started',
    'imageGeneration.provider.request.started',
    'imageGeneration.provider.request.completed',
    'imageGeneration.request.completed'
  ])
  assert.equal(logs[0].details.requestId, 'img-run-1')
  assert.equal(logs[0].details.provider, 'openai-compatible')
  assert.equal(logs[0].details.model, 'gpt-image-1')
  assert.equal(logs[0].details.requestedTransparent, true)
  assert.equal(logs[1].details.baseUrlHost, '127.0.0.1:8317')
  assert.equal(logs[1].details.backgroundMode, 'transparent')
  assert.equal(logs[2].details.status, 200)
  assert.equal(logs[3].details.outputCount, 1)
  for (const entry of logs) {
    assert.equal(entry.details.capability, 'image')
    assert.equal(entry.details.configSource, 'image')
    assert.equal(entry.details.endpointHost, '127.0.0.1:8317')
    assert.equal(entry.details.operation, entry.event.includes('.provider.') ? 'provider-generate' : 'generate')
  }
  assert.deepEqual(logs.map((entry) => entry.details.outcome), ['started', 'started', 'completed', 'completed'])
  assert.equal(JSON.stringify(logs).includes('sk-test-1234'), false)
  assert.equal(JSON.stringify(logs).includes('small mint helper cat'), false)
  assert.equal(JSON.stringify(logs).includes(dataDir), false)
})

test('image generation model service does not request transparency from unregistered models', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const requests = []
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ model: 'grok-imagine-image' })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ b64_json: Buffer.from('fake-image-bytes').toString('base64') }]
        })
      }
    }
  })

  await service.generateImage({
    prompt: 'one character on a uniform opaque background',
    referenceImages: createReferenceImages(dataDir),
    output: {
      dataDir,
      dataRelativeDir: 'runs/unknown-model/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  })

  const requestBody = requests[0].options.body.toString('utf8')
  assert.match(requestBody, /name="background"\r\n\r\nwhite\r\n/)
  assert.doesNotMatch(requestBody, /name="background"\r\n\r\ntransparent\r\n/)
  assert.equal(logs.find((entry) => entry.event === 'imageGeneration.provider.request.started').details.backgroundMode, 'white')
})

test('image generation model service honors per-request timeout overrides', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ timeoutMs: 120000 })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ b64_json: Buffer.from('fake-image-bytes').toString('base64') }]
      })
    })
  })

  await service.generateImage({
    prompt: 'small mint helper cat, transparent background',
    referenceImages: createReferenceImages(dataDir),
    timeoutMs: 300000,
    output: {
      dataDir,
      dataRelativeDir: 'runs/2026-06-19-sprout-cat/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  })

  assert.equal(logs[1].event, 'imageGeneration.provider.request.started')
  assert.equal(logs[1].details.timeoutMs, 300000)
})

test('image generation model service rejects per-request provider owner overrides', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const requests = []
  const logs = []
  const settingsService = createSettingsService(providerSettings({ model: 'gpt-image-2' }))
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ b64_json: Buffer.from('fake-image-bytes').toString('base64') }]
        })
      }
    }
  })

  await assert.rejects(service.generateImage({
    model: 'gpt-image-1.5',
    provider: 'openai-compatible',
    baseUrl: 'https://attacker.example.test/v1',
    apiKeyRef: 'ai.default',
    prompt: 'small mint helper cat, transparent background',
    referenceImages: createReferenceImages(dataDir),
    output: {
      dataDir,
      dataRelativeDir: 'runs/model-override/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  }), /owner-controlled/i)

  assert.equal(requests.length, 0)
  assert.equal(settingsService.get().models.imageGeneration.model, 'gpt-image-2')
  assert.equal(logs.some((entry) => (
    entry.event === 'imageGeneration.owner-fields.rejected' &&
    entry.level === 'warn' &&
    entry.details.fields.includes('model') &&
    entry.details.fields.includes('apiKeyRef')
  )), true)
  assert.equal(JSON.stringify(logs).includes('attacker.example.test'), false)
})

test('image generation model service uses a gpt-image-2 compatible edit payload', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const requests = []
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { b64_json: Buffer.from('fake-image-2-bytes').toString('base64') }
          ]
        })
      }
    },
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  const promptBuild = buildCharacterAnchorPrompt({
    model: 'gpt-image-2',
    appearanceIntent: ['small mint-colored character']
  })
  const result = await service.generateImage({
    prompt: promptBuild.prompt,
    promptCompiler: promptBuild.promptCompiler,
    referenceImages: createReferenceImages(dataDir),
    output: {
      dataDir,
      dataRelativeDir: 'runs/2026-06-19-gpt-image-2/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: false
    }
  })

  const payload = requests[0].options.body.toString('utf8')
  assert.equal(result.ok, true)
  assert.equal(payload.model, 'gpt-image-2')
  assert.equal(payload.prompt, 'small mint helper cat, transparent background')
  assert.equal(payload.size, '1024x1024')
  assert.equal(payload.quality, 'high')
  assert.equal(Object.hasOwn(payload, 'background'), false)
  assert.equal(Object.hasOwn(payload, 'response_format'), false)
  assert.equal(logs[0].details.requestedTransparent, true)
  assert.equal(logs[1].details.backgroundMode, 'omitted')
  assert.equal(logs[1].details.quality, 'high')
  assert.equal(logs[1].details.requestedTransparent, true)
})

test('image generation model service uses image edits when reference conditioning inputs are provided', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-edit-'))
  const referencePath = path.join(dataDir, 'canonical-reference.png')
  fs.writeFileSync(referencePath, Buffer.from('reference-image-bytes'))
  const requests = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ model: 'gpt-image-2' })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { b64_json: Buffer.from('edited-image-bytes').toString('base64') }
          ]
        })
      }
    }
  })

  const result = await service.generateImage({
    prompt: 'keep the same orange cat identity and create a waving action sheet',
    output: {
      dataDir,
      dataRelativeDir: 'runs/reference-conditioned/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    },
    referenceImages: [{
      path: referencePath,
      fileName: 'canonical-reference.png',
      relativePath: 'runs/reference-conditioned/inputs/references/canonical-reference.png',
      metadataRelativePath: 'runs/reference-conditioned/inputs/references/reference.json',
      role: 'canonical-reference'
    }]
  })

  const request = requests[0]
  const body = request.options.body
  const contentType = request.options.headers['Content-Type']
  const serialized = Buffer.isBuffer(body) ? body.toString('utf8') : String(body)
  assert.equal(request.url, 'http://127.0.0.1:8317/v1/images/edits')
  assert.ok(Buffer.isBuffer(body))
  assert.match(contentType, /^multipart\/form-data; boundary=----OpenPetFormBoundary[0-9a-f]+$/)
  assert.equal(request.options.headers['Content-Length'], String(body.byteLength))
  assert.match(serialized, /name="image"; filename="canonical-reference\.png"/)
  assert.match(serialized, /Content-Type: image\/png/)
  assert.match(serialized, /name="model"\r\n\r\ngpt-image-2\r\n/)
  assert.match(serialized, /name="prompt"\r\n\r\nkeep the same orange cat identity and create a waving action sheet\r\n/)
  assert.match(serialized, /name="size"\r\n\r\n1024x1024\r\n/)
  assert.match(serialized, /name="quality"\r\n\r\nhigh\r\n/)
  assert.equal(result.conditioning.mode, 'image-edit')
  assert.equal(result.conditioning.endpoint, '/images/edits')
  assert.equal(result.conditioning.quality, 'high')
  assert.equal(result.conditioning.referenceImageCount, 1)
  assert.equal(result.conditioning.references[0].fileName, 'canonical-reference.png')
  assert.equal(result.conditioning.references[0].relativePath, 'runs/reference-conditioned/inputs/references/canonical-reference.png')
  assert.equal(result.conditioning.references[0].metadataRelativePath, 'runs/reference-conditioned/inputs/references/reference.json')
  assert.equal(result.conditioning.references[0].role, 'canonical-reference')
})

for (const transientFailure of ['http-524', 'fetch-failed']) {
  test(`image generation model service retries one same-model request after ${transientFailure}`, async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-retry-'))
    const requests = []
    let transientResponseCancelCalls = 0
    const service = createImageGenerationModelService({
      settingsService: createSettingsService(providerSettings({ model: 'gpt-image-2' })),
      secretService: createSecretService({
        'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
      }),
      fetchImpl: async (url, options) => {
        requests.push({ url, options })
        if (requests.length === 1) {
          if (transientFailure === 'http-524') {
            return {
              ok: false,
              status: 524,
              body: {
                cancel: () => {
                  transientResponseCancelCalls += 1
                }
              },
              json: async () => ({})
            }
          }
          const error = new Error('fetch failed')
          error.cause = { code: 'ECONNRESET' }
          throw error
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ b64_json: Buffer.from('retried-image-bytes').toString('base64') }]
          })
        }
      }
    })

    const result = await service.generateImage({
      prompt: 'keep the same character identity',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: `runs/retry-${transientFailure}/frames/base`
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    })

    assert.equal(result.ok, true)
    assert.equal(result.model, 'gpt-image-2')
    assert.equal(requests.length, 2)
    assert.equal(transientResponseCancelCalls, transientFailure === 'http-524' ? 1 : 0)
    for (const request of requests) {
      const body = request.options.body.toString('utf8')
      assert.equal(request.url, 'http://127.0.0.1:8317/v1/images/edits')
      assert.equal(request.options.method, 'POST')
      assert.match(body, /name="image"; filename="canonical-reference\.png"/)
      assert.match(body, /name="model"\r\n\r\ngpt-image-2\r\n/)
      assert.match(body, /name="prompt"\r\n\r\nkeep the same character identity\r\n/)
      assert.match(body, /name="n"\r\n\r\n1\r\n/)
    }
  })
}

test('image generation model service does not retry non-transient provider HTTP failures', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-no-retry-'))
  let calls = 0
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ model: 'gpt-image-2' })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    fetchImpl: async () => {
      calls += 1
      return { ok: false, status: 400, json: async () => ({}) }
    }
  })

  await assert.rejects(() => service.generateImage({
    prompt: 'keep the same character identity',
    referenceImages: createReferenceImages(dataDir),
    output: {
      dataDir,
      dataRelativeDir: 'runs/non-transient-400/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  }), /HTTP 400/)

  assert.equal(calls, 1)
})

test('image generation model service keeps a transient retry inside the original timeout budget', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-retry-budget-'))
  let calls = 0
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ model: 'gpt-image-2' })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    providerGenerationTimeoutMs: 100,
    fetchImpl: async (_url, options) => {
      calls += 1
      if (calls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 60))
        return { ok: false, status: 524, json: async () => ({}) }
      }
      return await new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    }
  })

  const startedAt = Date.now()
  await assert.rejects(() => service.generateImage({
    prompt: 'keep the same character identity',
    referenceImages: createReferenceImages(dataDir),
    output: {
      dataDir,
      dataRelativeDir: 'runs/retry-budget/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  }), /timed out after 100ms/i)
  const elapsedMs = Date.now() - startedAt

  assert.equal(calls, 2)
  assert.equal(elapsedMs < 170, true, `retry exceeded total timeout budget: ${elapsedMs}ms`)
})

test('image generation model service enforces provider maxConcurrentJobs by queueing requests', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const requests = []
  const logs = []
  let releaseFirstRequest
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ maxConcurrentJobs: 1 })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: (() => {
      const ids = ['img-run-queue-1', 'img-run-queue-2']
      return () => ids.shift() || 'img-run-queue-extra'
    })(),
    fetchImpl: async (url, options) => {
      const requestIndex = requests.length + 1
      requests.push({ url, options })
      if (requestIndex === 1) {
        await new Promise((resolve) => {
          releaseFirstRequest = resolve
        })
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { b64_json: Buffer.from(`fake-image-${requestIndex}`).toString('base64') }
          ]
        })
      }
    }
  })

  const first = service.generateImage({
    prompt: 'first queued custom pet prompt',
    referenceImages: createReferenceImages(dataDir, 'first-reference.png'),
    output: {
      dataDir,
      dataRelativeDir: 'runs/concurrency/first/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  })
  await waitForRequestCount(requests, 1)

  const second = service.generateImage({
    prompt: 'second queued custom pet prompt',
    referenceImages: createReferenceImages(dataDir, 'second-reference.png'),
    output: {
      dataDir,
      dataRelativeDir: 'runs/concurrency/second/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  })
  await waitForTurn()
  await waitForTurn()

  assert.equal(requests.length, 1)
  assert.equal(logs.some((entry) => entry.event === 'imageGeneration.provider.queue.waiting' && entry.details.requestId === 'img-run-queue-2'), true)

  releaseFirstRequest()
  const results = await Promise.all([first, second])

  assert.equal(requests.length, 2)
  assert.equal(results[0].ok, true)
  assert.equal(results[1].ok, true)
  assert.equal(logs.some((entry) => entry.event === 'imageGeneration.provider.queue.acquired' && entry.details.requestId === 'img-run-queue-2'), true)
  assert.equal(JSON.stringify(logs).includes('sk-test-1234'), false)
  assert.equal(JSON.stringify(logs).includes('queued custom pet prompt'), false)
})

test('image generation model service rejects output paths outside the allowed data directory', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService: createSecretService()
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'no-op',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: '../escape'
      },
      constraints: {
        width: 512,
        height: 512,
        transparent: true
      }
    }),
    /allowed data directory/i
  )
})

test('image generation model service rejects output directory symlinks escaping the data directory', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-outside-'))
  const symlinkDir = path.join(dataDir, 'runs', 'symlink-output')
  fs.mkdirSync(path.dirname(symlinkDir), { recursive: true })
  try {
    fs.symlinkSync(outsideDir, symlinkDir, 'dir')
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService: createSecretService()
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'no-op',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: 'runs/symlink-output'
      },
      constraints: {
        width: 512,
        height: 512,
        transparent: true
      }
    }),
    /allowed data directory/i
  )
  assert.equal(fs.existsSync(path.join(outsideDir, '0001.png')), false)
})

test('image generation model service records failed provider calls without leaking secrets or prompt text', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-failed',
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'unsupported model for image generation' }
      })
    }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: 'runs/failure-case/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /HTTP 400/
  )

  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.request.started',
    'imageGeneration.provider.request.started',
    'imageGeneration.provider.request.failed',
    'imageGeneration.request.failed'
  ])
  assert.equal(logs[2].level, 'error')
  assert.equal(logs[2].details.requestId, 'img-run-failed')
  assert.equal(logs[2].details.status, 400)
  assert.equal(logs[2].details.errorCode, 'provider_http_error')
  assert.equal(logs[2].details.errorMessage, 'Image Provider returned an error response')
  assert.equal(logs[3].details.provider, 'openai-compatible')
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
  assert.equal(JSON.stringify(logs).includes(dataDir), false)
})

test('image generation model service sanitizes thrown provider request errors before logging', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-thrown-error',
    fetchImpl: async () => {
      throw new Error('Prompt "private detailed custom pet prompt" failed at /Users/mango/private/reference.png via http://127.0.0.1:8787/generate with sk-test-secret')
    }
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: 'runs/thrown-error/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    (error) => error?.message === 'Image Provider request failed'
  )

  assert.equal(logs[2].event, 'imageGeneration.provider.request.failed')
  assert.match(logs[2].details.errorMessage, /\[redacted-prompt\]/)
  assert.match(logs[2].details.errorMessage, /\[redacted-path\]/)
  assert.match(logs[2].details.errorMessage, /\[redacted-local-url\]/)
  assert.match(logs[2].details.errorMessage, /\[redacted-secret\]/)
  assert.equal(logs[3].event, 'imageGeneration.request.failed')
  assert.equal(logs[3].details.errorMessage, 'Image Provider request failed')
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
  assert.equal(JSON.stringify(logs).includes('/Users/mango/private/reference.png'), false)
  assert.equal(JSON.stringify(logs).includes('127.0.0.1:8787'), false)
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
})

test('image generation model service redacts provider business errors from HTTP 200 responses', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-business-error',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        msg: '该接口未接入公益站独立网关，旧转发链路已关闭',
        data: null
      })
    }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: 'runs/business-error/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /Image Provider returned a business error/
  )

  assert.equal(logs[2].event, 'imageGeneration.provider.request.failed')
  assert.equal(logs[2].details.errorCode, 'provider_business_error')
  assert.equal(logs[2].details.status, 200)
  assert.equal(logs[2].details.errorMessage, 'Image Provider returned a business error')
  assert.equal(logs[3].details.errorMessage, 'Image Provider returned a business error')
  assert.equal(JSON.stringify(logs).includes('旧转发链路已关闭'), false)
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
})

test('image generation model service rejects provider outputs with missing image bytes', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-missing-bytes',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ revised_prompt: 'no image attached' }] })
    }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: 'runs/missing-bytes/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /missing image bytes/
  )

  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.request.started',
    'imageGeneration.provider.request.started',
    'imageGeneration.provider.request.failed',
    'imageGeneration.request.failed'
  ])
  assert.equal(logs[2].details.errorCode, 'provider_invalid_response')
  assert.equal(logs[2].details.outputCount, 0)
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
})

test('image generation model service times out provider generation requests and records timeout logs', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-provider-timeout',
    providerGenerationTimeoutMs: 25,
    nowMs: (() => {
      let current = 1000
      return () => {
        current += 25
        return current
      }
    })(),
    fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      }, { once: true })
    })
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: 'runs/provider-timeout/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /timed out/i
  )

  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.request.started',
    'imageGeneration.provider.request.started',
    'imageGeneration.provider.request.failed',
    'imageGeneration.request.failed'
  ])
  assert.equal(logs[2].details.errorCode, 'provider_timeout')
  assert.equal(logs[2].details.timeoutMs, 25)
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
  assert.equal(JSON.stringify(logs).includes(dataDir), false)
})

test('image generation model service times out while reading a stalled generation response body', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    providerGenerationTimeoutMs: 5,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => new Promise(() => {})
    })
  })

  const result = await Promise.race([
    service.generateImage({
      prompt: 'private detailed custom pet prompt',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: 'runs/provider-body-timeout/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }).catch((error) => error),
    new Promise((resolve) => setTimeout(() => resolve(new Error('response body stayed pending')), 50))
  ])

  assert.match(result.message, /timed out after 5ms/i)
})

test('image generation model service uses the saved provider timeout for generation requests', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ timeoutMs: 1500 })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'temporarily unavailable' } })
    })
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: 'runs/provider-config-timeout/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /HTTP 503/
  )

  assert.equal(logs[1].event, 'imageGeneration.provider.request.started')
  assert.equal(logs[1].details.timeoutMs, 1500)
})

test('image generation model service keeps the production provider timeout by default', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'temporarily unavailable' } })
    })
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      referenceImages: createReferenceImages(dataDir),
      output: {
        dataDir,
        dataRelativeDir: 'runs/provider-default-timeout/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /HTTP 503/
  )

  assert.equal(logs[1].event, 'imageGeneration.provider.request.started')
  assert.equal(logs[1].details.timeoutMs, 120000)
})
