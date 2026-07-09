const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const sanitizeText = (value, maxLength = 120) => String(value || '')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength)

const toFiniteNumber = (value) => {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const toTokenCount = (value) => {
  const numeric = toFiniteNumber(value)
  if (numeric == null || numeric < 0) return null
  return Math.round(numeric)
}

const pickNumber = (source, keys) => {
  for (const key of keys) {
    const numeric = toFiniteNumber(source?.[key])
    if (numeric != null) return numeric
  }
  return null
}

const pickTokenCount = (source, keys) => {
  for (const key of keys) {
    const numeric = toTokenCount(source?.[key])
    if (numeric != null) return numeric
  }
  return null
}

const roundCost = (value) => {
  const numeric = toFiniteNumber(value)
  if (numeric == null || numeric < 0) return null
  return Math.round(numeric * 1_000_000) / 1_000_000
}

const roundPercent = (value) => {
  const numeric = toFiniteNumber(value)
  if (numeric == null) return null
  return Math.round(clamp(numeric, 0, 100) * 100) / 100
}

const normalizeUsageSummary = (value = {}) => {
  const source = value?.usage && typeof value.usage === 'object' ? value.usage : value
  if (!source || typeof source !== 'object') return null

  const inputTokens = pickTokenCount(source, ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens'])
  const outputTokens = pickTokenCount(source, ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens'])
  const cachedInputTokens = pickTokenCount(source, ['cachedInputTokens', 'cached_input_tokens', 'cachedPromptTokens', 'cached_prompt_tokens'])
  const explicitTotalTokens = pickTokenCount(source, ['totalTokens', 'total_tokens'])
  const totalTokens = explicitTotalTokens ?? (
    inputTokens != null || outputTokens != null
      ? (inputTokens || 0) + (outputTokens || 0)
      : null
  )
  const contextWindow = pickTokenCount(source, ['contextWindow', 'context_window', 'contextLimit', 'context_limit'])
  const explicitContextUsedPercent = pickNumber(source, ['contextUsedPercent', 'context_used_percent'])
  const contextUsedPercent = explicitContextUsedPercent != null
    ? roundPercent(explicitContextUsedPercent)
    : (totalTokens != null && contextWindow ? roundPercent((totalTokens / contextWindow) * 100) : null)
  const estimatedCostUsd = roundCost(pickNumber(source, [
    'estimatedCostUsd',
    'estimated_cost_usd',
    'costUsd',
    'cost_usd'
  ]))
  const currency = sanitizeText(source.currency || (estimatedCostUsd != null ? 'USD' : ''), 8).toUpperCase()

  const normalized = {
    inputTokens: inputTokens ?? null,
    outputTokens: outputTokens ?? null,
    cachedInputTokens: cachedInputTokens ?? null,
    totalTokens: totalTokens ?? null,
    contextWindow: contextWindow ?? null,
    contextUsedPercent: contextUsedPercent ?? null,
    estimatedCostUsd: estimatedCostUsd ?? null,
    currency
  }

  return Object.values(normalized).some((entry) => entry !== null && entry !== '')
    ? normalized
    : null
}

module.exports = {
  normalizeUsageSummary
}
