const DEFAULT_PROVIDER_RESPONSE_LIMITS = Object.freeze({
  jsonBytes: 2 * 1024 * 1024,
  streamBytes: 4 * 1024 * 1024,
  replyBytes: 1024 * 1024,
  imageJsonBytes: 32 * 1024 * 1024,
  imageBytes: 24 * 1024 * 1024
})

const normalizeByteLimit = (value, fallback) => {
  const normalized = Number(value)
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : fallback
}

const normalizeProviderResponseLimits = (limits = {}) => Object.freeze({
  jsonBytes: normalizeByteLimit(limits.jsonBytes, DEFAULT_PROVIDER_RESPONSE_LIMITS.jsonBytes),
  streamBytes: normalizeByteLimit(limits.streamBytes, DEFAULT_PROVIDER_RESPONSE_LIMITS.streamBytes),
  replyBytes: normalizeByteLimit(limits.replyBytes, DEFAULT_PROVIDER_RESPONSE_LIMITS.replyBytes),
  imageJsonBytes: normalizeByteLimit(limits.imageJsonBytes, DEFAULT_PROVIDER_RESPONSE_LIMITS.imageJsonBytes),
  imageBytes: normalizeByteLimit(limits.imageBytes, DEFAULT_PROVIDER_RESPONSE_LIMITS.imageBytes)
})

module.exports = {
  DEFAULT_PROVIDER_RESPONSE_LIMITS,
  normalizeProviderResponseLimits
}
