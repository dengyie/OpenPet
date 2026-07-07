const MODEL_CATALOG_SOURCE_VALUES = new Set(['none', 'saved'])
const MAX_MODEL_CATALOG_MODELS = 200
const MAX_PROVIDER_MODEL_ID_CHARS = 256

const SECRET_LIKE_MODEL_PATTERNS = [
  /\bsk-cpa-[A-Za-z0-9_-]{8,}\b/i,
  /\bsk-[A-Za-z0-9_-]{8,}\b/i,
  /\bbearer\s+[A-Za-z0-9._-]{8,}\b/i,
  /\b(?:api[_ -]?key|authorization|password|secret|[A-Za-z0-9_-]*token[A-Za-z0-9_-]*)\b\s*[:=]\s*\S+/i
]

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
  const normalizedModels = Array.from(models)
  if (sort) normalizedModels.sort()
  return normalizedModels.slice(0, MAX_MODEL_CATALOG_MODELS)
}

const buildProviderCacheKey = (capability, provider, baseUrl) => [
  String(capability || '').trim(),
  String(provider || '').trim(),
  normalizeProviderCatalogBaseUrl(baseUrl)
].join(':')

const normalizeProviderModelCatalog = (catalog = {}, options = {}) => ({
  cacheKey: typeof catalog?.cacheKey === 'string' ? catalog.cacheKey : '',
  models: uniqueModelIds(catalog?.models, options),
  fetchedAt: typeof catalog?.fetchedAt === 'string' ? catalog.fetchedAt : '',
  source: MODEL_CATALOG_SOURCE_VALUES.has(String(catalog?.source || ''))
    ? String(catalog.source)
    : 'none'
})

const getScopedProviderModelCatalog = ({ capability, provider, baseUrl, catalog, secrets = [] }) => {
  const normalizedCatalog = normalizeProviderModelCatalog(catalog, { secrets })
  const expectedCacheKey = buildProviderCacheKey(capability, provider, baseUrl)
  if (!expectedCacheKey || normalizedCatalog.cacheKey !== expectedCacheKey) {
    return normalizeProviderModelCatalog({}, { secrets })
  }
  return normalizedCatalog
}

const createSavedProviderModelCatalog = ({
  capability,
  provider,
  baseUrl,
  models,
  fetchedAt,
  secrets = []
}) => normalizeProviderModelCatalog({
  cacheKey: buildProviderCacheKey(capability, provider, baseUrl),
  models,
  fetchedAt: String(fetchedAt || '').trim(),
  source: 'saved'
}, { secrets })

module.exports = {
  buildProviderCacheKey,
  createSavedProviderModelCatalog,
  getScopedProviderModelCatalog,
  MAX_MODEL_CATALOG_MODELS,
  MAX_PROVIDER_MODEL_ID_CHARS,
  normalizeProviderModelCatalog,
  uniqueModelIds
}
