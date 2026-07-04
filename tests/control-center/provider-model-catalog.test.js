const test = require('node:test')
const assert = require('node:assert/strict')

test('mergeRecommendedAndCachedModels keeps cached models first and preserves current custom model', async () => {
  const { mergeRecommendedAndCachedModels } = await import('../../src/control-center/src/lib/provider-model-catalog.ts')

  assert.deepEqual(mergeRecommendedAndCachedModels({
    currentModel: 'custom-gateway-model',
    recommendedModels: ['gpt-4o-mini', 'gpt-5.5'],
    cachedModels: ['gpt-5.5', 'gpt-4o-mini', 'gpt-5.5']
  }), [
    'gpt-5.5',
    'gpt-4o-mini',
    'custom-gateway-model'
  ])
})

test('formatProviderModelCatalogMeta reports empty and populated cache states', async () => {
  const { formatProviderModelCatalogMeta } = await import('../../src/control-center/src/lib/provider-model-catalog.ts')

  assert.match(
    formatProviderModelCatalogMeta({
      cacheKey: '',
      models: [],
      fetchedAt: '',
      source: 'none'
    }),
    /还没有缓存模型列表/
  )

  assert.match(
    formatProviderModelCatalogMeta({
      cacheKey: 'chat:openai-compatible:https://api.openai.com/v1',
      models: ['gpt-5.5', 'gpt-4o-mini'],
      fetchedAt: '2026-07-04T08:00:00.000Z',
      source: 'saved'
    }),
    /已缓存 2 个模型/
  )
})
