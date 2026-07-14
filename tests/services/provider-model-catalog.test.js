const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildProviderCacheKey,
  getScopedProviderModelCatalog
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

test('getScopedProviderModelCatalog sanitizes persisted model ids with the active owner secret', () => {
  const apiKey = 'sk-persisted-secret-123456'
  const catalog = getScopedProviderModelCatalog({
    capability: 'chat',
    provider: 'openai-compatible',
    baseUrl: 'https://example.test/v1',
    secrets: [apiKey],
    catalog: {
      cacheKey: 'chat:openai-compatible:https://example.test/v1',
      models: [
        apiKey,
        `Bearer ${apiKey}`,
        `api_key=${apiKey}`,
        `model-${'x'.repeat(MAX_PROVIDER_MODEL_ID_CHARS + 1)}`,
        '000-safe-model\u0000',
        ...Array.from({ length: MAX_MODEL_CATALOG_MODELS + 20 }, (_, index) => `safe-${index}`)
      ],
      fetchedAt: '2026-07-04T08:00:00.000Z',
      source: 'saved'
    }
  })

  assert.equal(catalog.models.length, MAX_MODEL_CATALOG_MODELS)
  assert.equal(catalog.models.includes('000-safe-model'), true)
  assert.equal(catalog.models.some((model) => model.includes(apiKey)), false)
  assert.equal(catalog.models.some((model) => model.length > MAX_PROVIDER_MODEL_ID_CHARS), false)
})
