const test = require('node:test')
const assert = require('node:assert/strict')

test('applySavedAiConfigState preserves draft fields while refreshing saved chat provider state', async () => {
  const { applySavedAiConfigState } = await import('../../src/control-center/src/lib/provider-config-state.ts')

  const draftConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://draft.example.test/v1',
    model: 'draft-model',
    hasApiKey: false,
    apiKeyRef: 'draft.ai.ref',
    modelCatalog: {
      cacheKey: 'draft-chat-cache',
      models: ['draft-model'],
      fetchedAt: '2026-07-05T10:00:00.000Z',
      source: 'saved'
    },
    vision: {
      mode: 'override',
      provider: 'openai-compatible',
      baseUrl: 'https://draft-vision.example.test/v1',
      model: 'draft-vision-model',
      apiKeyRef: 'draft.ai.vision',
      hasApiKey: false,
      modelCatalog: {
        cacheKey: 'draft-vision-cache',
        models: ['draft-vision-model'],
        fetchedAt: '2026-07-05T10:01:00.000Z',
        source: 'saved'
      },
      effectiveProvider: 'openai-compatible',
      effectiveBaseUrl: 'https://draft-vision.example.test/v1',
      effectiveModel: 'draft-vision-model',
      effectiveHasApiKey: false
    }
  }
  const savedConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://saved.example.test/v1',
    model: 'saved-model',
    hasApiKey: true,
    apiKeyRef: 'ai.default',
    modelCatalog: {
      cacheKey: 'saved-chat-cache',
      models: ['saved-model', 'saved-model-2'],
      fetchedAt: '2026-07-05T12:00:00.000Z',
      source: 'saved'
    },
    vision: {
      mode: 'follow-chat',
      provider: 'openai-compatible',
      baseUrl: 'https://saved.example.test/v1',
      model: 'saved-model',
      apiKeyRef: 'ai.vision',
      hasApiKey: true,
      modelCatalog: {
        cacheKey: 'saved-vision-cache',
        models: ['gpt-4.1-mini', 'gpt-4o'],
        fetchedAt: '2026-07-05T12:01:00.000Z',
        source: 'saved'
      },
      effectiveProvider: 'openai-compatible',
      effectiveBaseUrl: 'https://saved.example.test/v1',
      effectiveModel: 'saved-model',
      effectiveHasApiKey: true
    }
  }

  const result = applySavedAiConfigState({
    draftConfig,
    savedConfig,
    preserveDraft: true
  })

  assert.equal(result.config.baseUrl, 'https://draft.example.test/v1')
  assert.equal(result.config.model, 'draft-model')
  assert.equal(result.config.apiKeyRef, 'ai.default')
  assert.equal(result.config.hasApiKey, true)
  assert.deepEqual(result.config.modelCatalog, savedConfig.modelCatalog)
  assert.equal(result.config.vision.baseUrl, 'https://draft-vision.example.test/v1')
  assert.equal(result.config.vision.model, 'draft-vision-model')
  assert.equal(result.config.vision.apiKeyRef, 'ai.vision')
  assert.equal(result.config.vision.hasApiKey, true)
  assert.deepEqual(result.config.vision.modelCatalog, savedConfig.vision.modelCatalog)
  assert.equal(result.config.vision.effectiveBaseUrl, 'https://saved.example.test/v1')
  assert.equal(result.config.vision.effectiveModel, 'saved-model')
  assert.equal(result.config.vision.effectiveHasApiKey, true)
  assert.equal(result.activeConfig.baseUrl, 'https://saved.example.test/v1')
  assert.equal(result.activeConfig.model, 'saved-model')
  assert.deepEqual(result.activeConfig.modelCatalog, savedConfig.modelCatalog)
})

test('applySavedImageGenerationConfigState preserves draft fields while refreshing saved image provider state', async () => {
  const { applySavedImageGenerationConfigState } = await import('../../src/control-center/src/lib/provider-config-state.ts')

  const draftConfig = {
    baseUrl: 'https://draft-images.example.test/v1',
    model: 'draft-image-model',
    hasApiKey: false,
    apiKeyRef: 'draft.image.ref',
    apiKeyPreview: '',
    apiKeyLabel: 'Draft Image Key',
    modelCatalog: {
      cacheKey: 'draft-image-cache',
      models: ['draft-image-model'],
      fetchedAt: '2026-07-05T10:00:00.000Z',
      source: 'saved'
    }
  }
  const savedConfig = {
    baseUrl: 'https://saved-images.example.test/v1',
    model: 'saved-image-model',
    hasApiKey: true,
    apiKeyRef: 'secret:model.image.openai.apiKey',
    apiKeyPreview: 'sk-im...7890',
    apiKeyLabel: 'Image API Key',
    modelCatalog: {
      cacheKey: 'saved-image-cache',
      models: ['saved-image-model', 'saved-image-model-2'],
      fetchedAt: '2026-07-05T12:00:00.000Z',
      source: 'saved'
    }
  }

  const result = applySavedImageGenerationConfigState({
    draftConfig,
    savedConfig,
    preserveDraft: true
  })

  assert.equal(result.imageGenerationConfig.baseUrl, 'https://draft-images.example.test/v1')
  assert.equal(result.imageGenerationConfig.model, 'draft-image-model')
  assert.equal(result.imageGenerationConfig.apiKeyRef, 'secret:model.image.openai.apiKey')
  assert.equal(result.imageGenerationConfig.hasApiKey, true)
  assert.equal(result.imageGenerationConfig.apiKeyPreview, 'sk-im...7890')
  assert.equal(result.imageGenerationConfig.apiKeyLabel, 'Image API Key')
  assert.deepEqual(result.imageGenerationConfig.modelCatalog, savedConfig.modelCatalog)
  assert.equal(result.activeImageGenerationConfig.baseUrl, 'https://saved-images.example.test/v1')
  assert.equal(result.activeImageGenerationConfig.model, 'saved-image-model')
  assert.deepEqual(result.activeImageGenerationConfig.modelCatalog, savedConfig.modelCatalog)
})

test('applySavedAiConfigState replaces draft entirely when preserveDraft is false', async () => {
  const { applySavedAiConfigState } = await import('../../src/control-center/src/lib/provider-config-state.ts')

  const savedConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://saved.example.test/v1',
    model: 'saved-model'
  }

  const result = applySavedAiConfigState({
    draftConfig: {
      provider: 'openai-compatible',
      baseUrl: 'https://draft.example.test/v1',
      model: 'draft-model'
    },
    savedConfig,
    preserveDraft: false
  })

  assert.deepEqual(result.config.baseUrl, 'https://saved.example.test/v1')
  assert.deepEqual(result.activeConfig.baseUrl, 'https://saved.example.test/v1')
})
