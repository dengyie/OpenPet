import type { ProviderModelCatalogViewState } from '../../../shared/openpet-contracts'

const uniqueModelOptions = (items: string[]) => {
  const models: string[] = []
  for (const item of items) {
    const modelId = String(item || '').trim()
    if (!modelId || models.includes(modelId)) continue
    models.push(modelId)
  }
  return models
}

export const mergeRecommendedAndCachedModels = ({
  currentModel,
  recommendedModels = [],
  cachedModels = []
}: {
  currentModel: string
  recommendedModels?: string[]
  cachedModels?: string[]
}) => uniqueModelOptions([
  ...cachedModels,
  ...recommendedModels,
  String(currentModel || '').trim()
])

export const formatProviderModelCatalogMeta = (catalog: ProviderModelCatalogViewState) => {
  if (!Array.isArray(catalog.models) || !catalog.models.length) {
    return '还没有缓存模型列表，先保存并刷新模型。'
  }
  if (!catalog.fetchedAt) {
    return `已缓存 ${catalog.models.length} 个模型。`
  }
  const fetchedAt = new Date(catalog.fetchedAt)
  const fetchedLabel = Number.isNaN(fetchedAt.getTime())
    ? catalog.fetchedAt
    : fetchedAt.toLocaleString()
  return `已缓存 ${catalog.models.length} 个模型 · 最近刷新 ${fetchedLabel}`
}
