const DEFAULT_HATCH_PET_BUDGETS = Object.freeze({
  maxIdentityRegenerations: 1,
  maxActionAttemptsPerAction: 3,
  maxEvaluationAttemptsPerArtifact: 2,
  maxProviderCalls: 64,
  maxElapsedMs: 3600000,
  maxEstimatedCost: null
})

const DEFAULT_HATCH_PET_AGENT_CONFIG = Object.freeze({
  enabled: false,
  executionMode: 'shadow',
  configMode: 'follow-chat',
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyRef: 'ai.hatch-pet',
  systemPromptVersion: 1,
  requireIdentityReviewBeforeActions: false,
  budgets: DEFAULT_HATCH_PET_BUDGETS
})

const HATCH_PET_CONFIG_MODES = new Set(['follow-chat', 'override'])
const HATCH_PET_EXECUTION_MODES = new Set(['shadow', 'bounded'])
const HATCH_PET_DECISIONS = new Set([
  'generate-identity',
  'retry-identity',
  'generate-action',
  'retry-action',
  'switch-image-model',
  'accept-stage',
  'omit-optional-action',
  'request-user-input',
  'request-human-review',
  'stop-run'
])

const SAFE_ACTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/
const SAFE_REASON_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/
const ALLOWED_DECISION_KEYS = new Set([
  'schemaVersion',
  'decision',
  'scope',
  'imageModel',
  'strategy',
  'reasonCodes',
  'confidence'
])

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const clampInteger = (value, fallback, min, max) => {
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.trunc(parsed)))
    : fallback
}

const normalizeText = (value, fallback = '', maxChars = 160) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return (normalized || fallback).slice(0, maxChars)
}

const normalizeBaseUrl = (value, fallback) => (
  normalizeText(value, fallback, 2048).replace(/\/+$/, '')
)

const sanitizeBaseUrlForDisplay = (value) => {
  const raw = normalizeText(value, '', 2048)
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    const pathname = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${pathname === '/' ? '' : pathname}`
  } catch (_) {
    return raw
      .replace(/^([a-z]+:\/\/)([^/@]+)@/i, '$1')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
  }
}

const normalizeEstimatedCost = (value) => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.min(10000, Math.max(0.01, parsed))
}

const normalizeHatchPetBudgets = (value = {}) => {
  const source = isPlainObject(value) ? value : {}
  return {
    maxIdentityRegenerations: clampInteger(
      source.maxIdentityRegenerations,
      DEFAULT_HATCH_PET_BUDGETS.maxIdentityRegenerations,
      0,
      3
    ),
    maxActionAttemptsPerAction: clampInteger(
      source.maxActionAttemptsPerAction,
      DEFAULT_HATCH_PET_BUDGETS.maxActionAttemptsPerAction,
      1,
      6
    ),
    maxEvaluationAttemptsPerArtifact: clampInteger(
      source.maxEvaluationAttemptsPerArtifact,
      DEFAULT_HATCH_PET_BUDGETS.maxEvaluationAttemptsPerArtifact,
      1,
      3
    ),
    maxProviderCalls: clampInteger(
      source.maxProviderCalls,
      DEFAULT_HATCH_PET_BUDGETS.maxProviderCalls,
      1,
      200
    ),
    maxElapsedMs: clampInteger(
      source.maxElapsedMs,
      DEFAULT_HATCH_PET_BUDGETS.maxElapsedMs,
      60000,
      14400000
    ),
    maxEstimatedCost: normalizeEstimatedCost(source.maxEstimatedCost)
  }
}

const normalizeHatchPetAgentConfig = (value = {}) => {
  const source = isPlainObject(value) ? value : {}
  const configMode = HATCH_PET_CONFIG_MODES.has(source.configMode)
    ? source.configMode
    : DEFAULT_HATCH_PET_AGENT_CONFIG.configMode
  const executionMode = HATCH_PET_EXECUTION_MODES.has(source.executionMode)
    ? source.executionMode
    : DEFAULT_HATCH_PET_AGENT_CONFIG.executionMode
  return {
    enabled: source.enabled === true,
    executionMode,
    configMode,
    provider: normalizeText(source.provider, DEFAULT_HATCH_PET_AGENT_CONFIG.provider),
    baseUrl: normalizeBaseUrl(source.baseUrl, DEFAULT_HATCH_PET_AGENT_CONFIG.baseUrl),
    model: normalizeText(source.model, DEFAULT_HATCH_PET_AGENT_CONFIG.model),
    apiKeyRef: normalizeText(source.apiKeyRef, DEFAULT_HATCH_PET_AGENT_CONFIG.apiKeyRef),
    systemPromptVersion: clampInteger(source.systemPromptVersion, 1, 1, 20),
    requireIdentityReviewBeforeActions: source.requireIdentityReviewBeforeActions === true,
    budgets: normalizeHatchPetBudgets(source.budgets)
  }
}

const resolveHatchPetCompletionConfig = ({ aiConfig = {}, hatchPetConfig = {} } = {}) => {
  const normalized = normalizeHatchPetAgentConfig(hatchPetConfig)
  if (normalized.configMode === 'follow-chat') {
    return {
      provider: normalizeText(aiConfig.provider, 'openai-compatible'),
      baseUrl: normalizeBaseUrl(aiConfig.baseUrl, 'https://api.openai.com/v1'),
      model: normalizeText(aiConfig.model, 'gpt-4o-mini'),
      apiKeyRef: normalizeText(aiConfig.apiKeyRef, 'ai.default'),
      source: 'chat-fallback'
    }
  }
  return {
    provider: normalized.provider,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    apiKeyRef: normalized.apiKeyRef,
    source: 'hatch-pet-override'
  }
}

const createInvalidDecisionError = (reason) => {
  const safeReason = String(reason || 'invalid value')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'invalid value'
  return new Error(`Invalid hatch-pet decision: ${safeReason}`)
}

const assertAllowedKeys = (value, allowed, label) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw createInvalidDecisionError(`${label} contains unknown field ${key}`)
  }
}

const requireBoundedText = (value, label, { required = true, maxChars = 160 } = {}) => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) throw createInvalidDecisionError(`${label} is required`)
  if (text.length > maxChars) throw createInvalidDecisionError(`${label} is too long`)
  return text
}

const validateHatchPetDecision = (value, context = {}) => {
  if (!isPlainObject(value)) throw createInvalidDecisionError('decision must be an object')
  assertAllowedKeys(value, ALLOWED_DECISION_KEYS, 'decision')
  if (value.schemaVersion !== 1) throw createInvalidDecisionError('schemaVersion must be 1')

  const decision = requireBoundedText(value.decision, 'decision')
  if (!HATCH_PET_DECISIONS.has(decision)) throw createInvalidDecisionError('decision is unsupported')
  const legalDecisions = new Set(Array.isArray(context.legalDecisions) ? context.legalDecisions : [])
  if (!legalDecisions.has(decision)) throw createInvalidDecisionError('decision is illegal for the current state')

  const scopeSource = value.scope == null ? {} : value.scope
  if (!isPlainObject(scopeSource)) throw createInvalidDecisionError('scope must be an object')
  assertAllowedKeys(scopeSource, new Set(['actionId']), 'scope')
  const actionId = requireBoundedText(scopeSource.actionId, 'scope.actionId', { required: false, maxChars: 80 })
  if (actionId && !SAFE_ACTION_ID_PATTERN.test(actionId)) {
    throw createInvalidDecisionError('scope.actionId is invalid')
  }

  let imageModel
  if (value.imageModel != null) {
    if (!isPlainObject(value.imageModel)) throw createInvalidDecisionError('imageModel must be an object')
    assertAllowedKeys(value.imageModel, new Set(['provider', 'model']), 'imageModel')
    imageModel = {
      provider: requireBoundedText(value.imageModel.provider, 'imageModel.provider'),
      model: requireBoundedText(value.imageModel.model, 'imageModel.model')
    }
  }

  let strategy
  if (value.strategy != null) {
    if (!isPlainObject(value.strategy)) throw createInvalidDecisionError('strategy must be an object')
    assertAllowedKeys(
      value.strategy,
      new Set(['promptStrategyId', 'referenceStrategyId', 'requestedChanges']),
      'strategy'
    )
    const requestedChanges = Array.isArray(value.strategy.requestedChanges)
      ? value.strategy.requestedChanges
      : null
    if (!requestedChanges) throw createInvalidDecisionError('strategy.requestedChanges must be an array')
    if (requestedChanges.length > 8) throw createInvalidDecisionError('strategy.requestedChanges has too many items')
    strategy = {
      promptStrategyId: requireBoundedText(value.strategy.promptStrategyId, 'strategy.promptStrategyId'),
      referenceStrategyId: requireBoundedText(value.strategy.referenceStrategyId, 'strategy.referenceStrategyId'),
      requestedChanges: requestedChanges.map((change, index) => (
        requireBoundedText(change, `strategy.requestedChanges[${index}]`, { maxChars: 240 })
      ))
    }
  }

  if (!Array.isArray(value.reasonCodes)) throw createInvalidDecisionError('reasonCodes must be an array')
  if (value.reasonCodes.length > 12) throw createInvalidDecisionError('reasonCodes has too many items')
  const reasonCodes = value.reasonCodes.map((reasonCode, index) => {
    const normalized = requireBoundedText(reasonCode, `reasonCodes[${index}]`, { maxChars: 80 })
    if (!SAFE_REASON_CODE_PATTERN.test(normalized)) {
      throw createInvalidDecisionError(`reasonCodes[${index}] is invalid`)
    }
    return normalized
  })

  const confidence = Number(value.confidence)
  if (!Number.isFinite(confidence)) throw createInvalidDecisionError('confidence must be a number')

  return {
    schemaVersion: 1,
    decision,
    scope: actionId ? { actionId } : {},
    ...(imageModel ? { imageModel } : {}),
    ...(strategy ? { strategy } : {}),
    reasonCodes,
    confidence: Math.min(1, Math.max(0, confidence))
  }
}

const createHatchPetAgentPublicConfig = (value, hasApiKey = false) => {
  const normalized = normalizeHatchPetAgentConfig(value)
  return {
    ...normalized,
    baseUrl: sanitizeBaseUrlForDisplay(normalized.baseUrl),
    hasApiKey: Boolean(hasApiKey)
  }
}

module.exports = {
  DEFAULT_HATCH_PET_AGENT_CONFIG,
  DEFAULT_HATCH_PET_BUDGETS,
  HATCH_PET_CONFIG_MODES,
  HATCH_PET_DECISIONS,
  HATCH_PET_EXECUTION_MODES,
  createHatchPetAgentPublicConfig,
  normalizeHatchPetAgentConfig,
  normalizeHatchPetBudgets,
  resolveHatchPetCompletionConfig,
  validateHatchPetDecision
}
