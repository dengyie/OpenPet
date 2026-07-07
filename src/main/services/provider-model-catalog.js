const MODEL_CATALOG_SOURCE_VALUES = new Set(['none', 'saved'])
const MAX_MODEL_CATALOG_MODELS = 200

const normalizeProviderCatalogBaseUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    const normalizedPath = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${normalizedPath === '/' ? '' : normalizedPath}`
  } catch (_) {
    return raw
      .replace(/^([a-z]+:\/\/)([^/@]+)@/i, '$1')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
  }
}

const normalizeProviderModelId = (value) => String(value || '')
  .replace(/[\u0000-\u001F\u007F]/g, '')
  .trim()

const uniqueModelIds = (items = []) => {
  /** @type {string[]} */
  const models = []
  for (const item of Array.isArray(items) ? items : []) {
    const modelId = normalizeProviderModelId(item)
    if (!modelId || models.includes(modelId)) continue
    models.push(modelId)
    if (models.length >= MAX_MODEL_CATALOG_MODELS) break
  }
  return models.sort()
}

const buildProviderCacheKey = (capability, provider, baseUrl) => [
  String(capability || '').trim(),
  String(provider || '').trim(),
  normalizeProviderCatalogBaseUrl(baseUrl)
].join(':')

const normalizeProviderModelCatalog = (catalog = {}) => ({
  cacheKey: typeof catalog?.cacheKey === 'string' ? catalog.cacheKey : '',
  models: uniqueModelIds(catalog?.models),
  fetchedAt: typeof catalog?.fetchedAt === 'string' ? catalog.fetchedAt : '',
  source: MODEL_CATALOG_SOURCE_VALUES.has(String(catalog?.source || ''))
    ? String(catalog.source)
    : 'none'
})

const getScopedProviderModelCatalog = ({ capability, provider, baseUrl, catalog }) => {
  const normalizedCatalog = normalizeProviderModelCatalog(catalog)
  const expectedCacheKey = buildProviderCacheKey(capability, provider, baseUrl)
  if (!expectedCacheKey || normalizedCatalog.cacheKey !== expectedCacheKey) {
    return normalizeProviderModelCatalog()
  }
  return normalizedCatalog
}

const createSavedProviderModelCatalog = ({
  capability,
  provider,
  baseUrl,
  models,
  fetchedAt
}) => normalizeProviderModelCatalog({
  cacheKey: buildProviderCacheKey(capability, provider, baseUrl),
  models,
  fetchedAt: String(fetchedAt || '').trim(),
  source: 'saved'
})

module.exports = {
  buildProviderCacheKey,
  createSavedProviderModelCatalog,
  getScopedProviderModelCatalog,
  normalizeProviderModelCatalog,
  uniqueModelIds
}
