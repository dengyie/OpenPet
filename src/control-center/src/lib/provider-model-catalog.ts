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

export type ProviderModelOptionSource = 'recommended' | 'cached' | 'manual'

export type ProviderModelOption = {
  id: string
  source: ProviderModelOptionSource
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

export const buildProviderModelOptions = ({
  currentModel,
  recommendedModels = [],
  cachedModels = []
}: {
  currentModel: string
  recommendedModels?: string[]
  cachedModels?: string[]
}): ProviderModelOption[] => {
  const normalizedCurrentModel = String(currentModel || '').trim()
  const recommended = uniqueModelOptions(recommendedModels)
  const cached = uniqueModelOptions(cachedModels)
  const all = mergeRecommendedAndCachedModels({
    currentModel: normalizedCurrentModel,
    recommendedModels: recommended,
    cachedModels: cached
  })

  return all.map((id) => {
    if (recommended.includes(id)) return { id, source: 'recommended' }
    if (cached.includes(id)) return { id, source: 'cached' }
    return { id, source: 'manual' }
  })
}

export const describeCurrentModelSource = ({
  currentModel,
  recommendedModels = [],
  cachedModels = []
}: {
  currentModel: string
  recommendedModels?: string[]
  cachedModels?: string[]
}) => {
  const normalizedCurrentModel = String(currentModel || '').trim()
  if (!normalizedCurrentModel) {
    return {
      source: 'manual' as const,
      label: '当前来源：未设置'
    }
  }
  if (uniqueModelOptions(recommendedModels).includes(normalizedCurrentModel)) {
    return {
      source: 'recommended' as const,
      label: '当前来源：推荐模型'
    }
  }
  if (uniqueModelOptions(cachedModels).includes(normalizedCurrentModel)) {
    return {
      source: 'cached' as const,
      label: '当前来源：缓存模型'
    }
  }
  return {
    source: 'manual' as const,
    label: '当前来源：手动输入'
  }
}

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
