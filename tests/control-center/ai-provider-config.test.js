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
      memory: { enabled: true }
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
