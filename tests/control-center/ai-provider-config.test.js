const test = require('node:test')
const assert = require('node:assert/strict')

test('buildProviderConfigSavePayload only includes owner-managed changed fields', async () => {
  const { buildProviderConfigSavePayload } = await import('../../src/control-center/src/lib/ai-provider-config.ts')

  const activeConfig = {
    enabled: false,
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    systemPrompt: 'You are a friendly desktop pet companion.',
    memory: { enabled: false },
    vision: {
      mode: 'follow-chat',
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.vision',
      hasApiKey: false,
      effectiveProvider: 'openai-compatible',
      effectiveBaseUrl: 'https://api.openai.com/v1',
      effectiveModel: 'gpt-4o-mini',
      effectiveHasApiKey: false,
      modelCatalog: {
        cacheKey: '',
        models: [],
        fetchedAt: '',
        source: 'none'
      }
    },
    hasApiKey: true,
    apiKeyRef: 'ai.default',
    modelCatalog: {
      cacheKey: 'saved-cache',
      models: ['gpt-4o-mini'],
      fetchedAt: '2026-07-04T08:00:00.000Z',
      source: 'saved'
    }
  }

  const draftConfig = {
    ...activeConfig,
    enabled: true,
    baseUrl: 'https://gateway.example.test/v1/',
    model: 'gpt-5.5',
    memory: { enabled: true },
    vision: {
      ...activeConfig.vision,
      mode: 'override',
      baseUrl: 'https://vision.example.test/v1/',
      model: 'gpt-4.1-mini',
      hasApiKey: true,
      modelCatalog: {
        cacheKey: 'draft-vision-cache',
        models: ['gpt-4.1-mini'],
        fetchedAt: '2026-07-05T09:00:00.000Z',
        source: 'draft'
      }
    },
    hasApiKey: false,
    apiKeyRef: 'draft.ai.ref',
    modelCatalog: {
      cacheKey: 'draft-cache',
      models: ['custom-model'],
      fetchedAt: '2026-07-05T09:00:00.000Z',
      source: 'draft'
    }
  }

  assert.deepEqual(
    buildProviderConfigSavePayload(draftConfig, activeConfig),
    {
      enabled: true,
      baseUrl: 'https://gateway.example.test/v1',
      model: 'gpt-5.5',
      memory: { enabled: true },
      vision: {
        mode: 'override',
        baseUrl: 'https://vision.example.test/v1',
        model: 'gpt-4.1-mini'
      }
    }
  )
})

test('buildImageGenerationConfigSavePayload only includes owner-managed changed fields', async () => {
  const { buildImageGenerationConfigSavePayload } = await import('../../src/control-center/src/lib/ai-provider-config.ts')

  const activeConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-image-2',
    organization: '',
    project: '',
    timeoutMs: 120000,
    maxConcurrentJobs: 1,
    hasApiKey: true,
    apiKeyPreview: '••••1234',
    apiKeyLabel: 'Image API Key',
    modelCatalog: {
      cacheKey: 'saved-cache',
      models: ['gpt-image-2'],
      fetchedAt: '2026-07-04T08:00:00.000Z',
      source: 'saved'
    }
  }

  const draftConfig = {
    ...activeConfig,
    baseUrl: 'https://image.example.test/v1/',
    model: 'custom-image-model',
    timeoutMs: 90000,
    hasApiKey: false,
    apiKeyPreview: '',
    modelCatalog: {
      cacheKey: 'draft-cache',
      models: ['custom-image-model'],
      fetchedAt: '2026-07-05T09:00:00.000Z',
      source: 'draft'
    }
  }

  assert.deepEqual(
    buildImageGenerationConfigSavePayload(draftConfig, activeConfig),
    {
      baseUrl: 'https://image.example.test/v1',
      model: 'custom-image-model',
      timeoutMs: 90000
    }
  )
})

test('getImageGenerationConfigChanges reports only image owner field changes', async () => {
  const {
    getImageGenerationConfigChanges,
    hasImageGenerationConfigChanges
  } = await import('../../src/control-center/src/lib/ai-provider-config.ts')

  const activeConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-image-2',
    organization: '',
    project: '',
    timeoutMs: 120000,
    maxConcurrentJobs: 1,
    hasApiKey: true
  }

  const draftConfig = {
    ...activeConfig,
    project: 'creator-studio',
    maxConcurrentJobs: 2,
    hasApiKey: false
  }

  assert.deepEqual(
    getImageGenerationConfigChanges(draftConfig, activeConfig),
    ['Project', '图片最大并发']
  )
  assert.equal(hasImageGenerationConfigChanges(draftConfig, activeConfig), true)
})

test('validateProviderConfig validates vision override only when enabled', async () => {
  const { validateProviderConfig } = await import('../../src/control-center/src/lib/ai-provider-config.ts')

  const baseConfig = {
    enabled: true,
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.5',
    apiKeyRef: 'ai.default',
    systemPrompt: '',
    memory: { enabled: false },
    behavior: { enabled: false, useTools: true, cooldownMs: 1500, rules: [], decisions: [] },
    hasApiKey: true,
    modelCatalog: { cacheKey: '', models: [], fetchedAt: '', source: 'none' },
    vision: {
      mode: 'override',
      provider: 'openai-compatible',
      baseUrl: 'not-a-url',
      model: '',
      apiKeyRef: 'ai.vision',
      hasApiKey: false,
      modelCatalog: { cacheKey: '', models: [], fetchedAt: '', source: 'none' },
      effectiveProvider: '',
      effectiveBaseUrl: '',
      effectiveModel: '',
      effectiveHasApiKey: false
    }
  }

  assert.equal(validateProviderConfig(baseConfig), 'Vision Base URL 不是有效 URL')
  assert.equal(validateProviderConfig({
    ...baseConfig,
    vision: {
      ...baseConfig.vision,
      mode: 'follow-chat'
    }
  }), '')
})
