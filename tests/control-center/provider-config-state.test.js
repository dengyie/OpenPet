const test = require('node:test')
const assert = require('node:assert/strict')

test('applySavedAiConfigState preserves draft fields while refreshing saved chat provider state', async () => {
  const { applySavedAiConfigState } = await import('../../src/control-center/src/lib/provider-config-state.ts')

  const draftConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://draft.example.test/v1',
    model: 'draft-model'
  }
  const savedConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://saved.example.test/v1',
    model: 'saved-model'
  }

  assert.deepEqual(
    applySavedAiConfigState({
      draftConfig,
      savedConfig,
      preserveDraft: true
    }),
    {
      config: draftConfig,
      activeConfig: savedConfig
    }
  )
})

test('applySavedImageGenerationConfigState preserves draft fields while refreshing saved image provider state', async () => {
  const { applySavedImageGenerationConfigState } = await import('../../src/control-center/src/lib/provider-config-state.ts')

  const draftConfig = {
    baseUrl: 'https://draft-images.example.test/v1',
    model: 'draft-image-model'
  }
  const savedConfig = {
    baseUrl: 'https://saved-images.example.test/v1',
    model: 'saved-image-model'
  }

  assert.deepEqual(
    applySavedImageGenerationConfigState({
      draftConfig,
      savedConfig,
      preserveDraft: true
    }),
    {
      imageGenerationConfig: draftConfig,
      activeImageGenerationConfig: savedConfig
    }
  )
})
