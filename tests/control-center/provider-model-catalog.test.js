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

test('buildProviderModelOptions and current source label distinguish recommended cached and manual values', async () => {
  const { buildProviderModelOptions, describeCurrentModelSource } = await import('../../src/control-center/src/lib/provider-model-catalog.ts')

  assert.deepEqual(buildProviderModelOptions({
    currentModel: 'custom-gateway-model',
    recommendedModels: ['gpt-4o-mini', 'gpt-5.5'],
    cachedModels: ['gpt-5.5', 'openpet-chat-test']
  }), [
    { id: 'gpt-5.5', source: 'recommended' },
    { id: 'openpet-chat-test', source: 'cached' },
    { id: 'gpt-4o-mini', source: 'recommended' },
    { id: 'custom-gateway-model', source: 'manual' }
  ])

  assert.deepEqual(describeCurrentModelSource({
    currentModel: 'gpt-5.5',
    recommendedModels: ['gpt-4o-mini', 'gpt-5.5'],
    cachedModels: ['gpt-5.5', 'openpet-chat-test']
  }), {
    source: 'recommended',
    label: '当前来源：推荐模型'
  })

  assert.deepEqual(describeCurrentModelSource({
    currentModel: 'openpet-chat-test',
    recommendedModels: ['gpt-4o-mini', 'gpt-5.5'],
    cachedModels: ['gpt-5.5', 'openpet-chat-test']
  }), {
    source: 'cached',
    label: '当前来源：缓存模型'
  })

  assert.deepEqual(describeCurrentModelSource({
    currentModel: 'custom-gateway-model',
    recommendedModels: ['gpt-4o-mini', 'gpt-5.5'],
    cachedModels: ['gpt-5.5', 'openpet-chat-test']
  }), {
    source: 'manual',
    label: '当前来源：手动输入'
  })
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

test('buildProviderModelSelectorGroups prefers recommended display rows and marks cached duplicates', async () => {
  const { buildProviderModelSelectorGroups } = await import('../../src/control-center/src/lib/provider-model-catalog.ts')

  assert.deepEqual(buildProviderModelSelectorGroups({
    currentModel: 'gpt-5.5',
    filterText: '',
    recommendedModels: ['gpt-5.5', 'gpt-4o-mini'],
    cachedModels: ['gpt-5.5', 'gpt-4o', 'openpet-chat-test']
  }), {
    recommended: [
      { id: 'gpt-5.5', cached: true, selected: true },
      { id: 'gpt-4o-mini', cached: false, selected: false }
    ],
    cached: [
      { id: 'gpt-4o', cached: true, selected: false },
      { id: 'openpet-chat-test', cached: true, selected: false }
    ],
    manual: []
  })
})

test('buildProviderModelSelectorGroups filters rows and keeps the current manual model visible', async () => {
  const { buildProviderModelSelectorGroups } = await import('../../src/control-center/src/lib/provider-model-catalog.ts')

  assert.deepEqual(buildProviderModelSelectorGroups({
    currentModel: 'custom-gateway-model',
    filterText: 'custom',
    recommendedModels: ['gpt-5.5', 'gpt-4o-mini'],
    cachedModels: ['gpt-5.5', 'gpt-4o', 'openpet-chat-test']
  }), {
    recommended: [],
    cached: [],
    manual: [
      { id: 'custom-gateway-model', cached: false, selected: true }
    ]
  })
})
