const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildProviderCacheKey,
  getScopedProviderModelCatalog,
  uniqueModelIds
} = require('../../src/main/services/provider-model-catalog')

const MAX_MODEL_CATALOG_MODELS = 200
const MAX_PROVIDER_MODEL_ID_CHARS = 256

test('buildProviderCacheKey strips credentials and query fragments from provider URLs', () => {
  assert.equal(
    buildProviderCacheKey('chat', 'openai-compatible', 'https://user:pass@example.test/v1?token=secret#frag'),
    'chat:openai-compatible:https://example.test/v1'
  )
})

test('getScopedProviderModelCatalog only returns catalogs that match the sanitized owner key', () => {
  assert.deepEqual(
    getScopedProviderModelCatalog({
      capability: 'chat',
      provider: 'openai-compatible',
      baseUrl: 'https://example.test/v1',
      catalog: {
        cacheKey: 'chat:openai-compatible:https://user:pass@example.test/v1?token=secret',
        models: ['gpt-5.5'],
        fetchedAt: '2026-07-04T08:00:00.000Z',
        source: 'saved'
      }
    }),
    {
      cacheKey: '',
      models: [],
      fetchedAt: '',
      source: 'none'
    }
  )
})

test('uniqueModelIds strips control characters before deduping provider model ids', () => {
  assert.deepEqual(
    uniqueModelIds(['gpt-image-2\0', 'gpt-image-2', ' gemini-image\t', '\n']),
    ['gemini-image', 'gpt-image-2']
  )
})
