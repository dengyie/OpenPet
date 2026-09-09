const CAPABILITY_SECRET_REFS = Object.freeze({
  chat: 'ai.default',
  vision: 'ai.vision',
  image: 'secret:model.image.openai.apiKey'
})

const getCapabilitySecretRef = (capability) => {
  const secretRef = CAPABILITY_SECRET_REFS[capability]
  if (!secretRef) throw new Error(`Unsupported Provider capability: ${capability}`)
  return secretRef
}

const assertProviderConfigPayload = (value, label = 'Provider') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} config payload must be an object`)
  }
  return value
}

const assertProviderBaseUrl = (value, label = 'Provider') => {
  let parsed
  try {
    parsed = new URL(String(value || '').trim())
  } catch (_) {
    throw new Error(`${label} Base URL must be a valid URL`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} Base URL must use HTTP or HTTPS`)
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} Base URL must not include credentials`)
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${label} Base URL must not include query or hash`)
  }
  return parsed.toString().replace(/\/+$/, '')
}

const sanitizeProviderBaseUrlForDisplay = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
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

const assertProviderModel = (value, label = 'Provider') => {
  const model = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
  if (!model) throw new Error(`${label} model is required`)
  return model
}

const validateProviderConfigInput = ({
  provider,
  baseUrl,
  model,
  label = 'AI',
  allowedProviders = ['openai-compatible']
} = {}) => {
  const normalizedProvider = String(provider || '').trim()
  if (!allowedProviders.includes(normalizedProvider)) {
    throw new Error(`Unsupported ${label} provider: ${normalizedProvider || 'empty'}`)
  }
  return {
    provider: normalizedProvider,
    baseUrl: assertProviderBaseUrl(baseUrl, label),
    model: assertProviderModel(model, label)
  }
}

const findOwnerFieldOverrides = (input, {
  topLevel = [],
  nested = {}
} = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  const fields = topLevel.filter((field) => Object.hasOwn(input, field))
  for (const [key, nestedFields] of Object.entries(nested)) {
    const nestedInput = input[key]
    if (!nestedInput || typeof nestedInput !== 'object' || Array.isArray(nestedInput)) continue
    for (const field of nestedFields) {
      if (Object.hasOwn(nestedInput, field)) fields.push(`${key}.${field}`)
    }
  }
  return fields
}

const getEndpointHost = (baseUrl) => {
  try {
    return new URL(String(baseUrl || '')).host
  } catch (_) {
    return ''
  }
}

const createProviderOperationDetails = ({
  capability,
  operation,
  config = {},
  configSource,
  requestId = '',
  outcome = ''
} = {}) => ({
  capability: String(capability || ''),
  operation: String(operation || ''),
  requestId: String(requestId || ''),
  provider: String(config.provider || ''),
  model: String(config.model || ''),
  endpointHost: getEndpointHost(config.baseUrl),
  configSource: String(configSource || capability || ''),
  ...(outcome ? { outcome: String(outcome) } : {})
})

module.exports = {
  CAPABILITY_SECRET_REFS,
  assertProviderConfigPayload,
  assertProviderBaseUrl,
  assertProviderModel,
  createProviderOperationDetails,
  findOwnerFieldOverrides,
  getCapabilitySecretRef,
  sanitizeProviderBaseUrlForDisplay,
  validateProviderConfigInput
}
