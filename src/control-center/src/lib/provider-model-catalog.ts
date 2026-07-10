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

export type ProviderModelSelectorRow = {
  id: string
  cached: boolean
  selected: boolean
}

export type ProviderModelSelectorGroups = {
  recommended: ProviderModelSelectorRow[]
  cached: ProviderModelSelectorRow[]
  manual: ProviderModelSelectorRow[]
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

export const buildProviderModelSelectorGroups = ({
  currentModel,
  filterText = '',
  recommendedModels = [],
  cachedModels = []
}: {
  currentModel: string
  filterText?: string
  recommendedModels?: string[]
  cachedModels?: string[]
}): ProviderModelSelectorGroups => {
  const normalizedCurrentModel = String(currentModel || '').trim()
  const normalizedFilter = String(filterText || '').trim().toLowerCase()
  const recommended = uniqueModelOptions(recommendedModels)
  const cached = uniqueModelOptions(cachedModels)
  const matchesFilter = (modelId: string) => (
    !normalizedFilter || modelId.toLowerCase().includes(normalizedFilter)
  )
  const toRow = (modelId: string): ProviderModelSelectorRow => ({
    id: modelId,
    cached: cached.includes(modelId),
    selected: Boolean(normalizedCurrentModel) && modelId === normalizedCurrentModel
  })

  const recommendedRows = recommended
    .filter(matchesFilter)
    .map(toRow)
  const cachedRows = cached
    .filter((modelId) => !recommended.includes(modelId))
    .filter(matchesFilter)
    .map(toRow)
  const manualRows = normalizedCurrentModel
    && !recommended.includes(normalizedCurrentModel)
    && !cached.includes(normalizedCurrentModel)
    && matchesFilter(normalizedCurrentModel)
    ? [toRow(normalizedCurrentModel)]
    : []

  return {
    recommended: recommendedRows,
    cached: cachedRows,
    manual: manualRows
  }
}
