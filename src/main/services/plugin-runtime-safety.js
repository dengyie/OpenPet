const truncateSanitizedText = (value, maxLength = 0) => {
  const limit = Number(maxLength)
  if (!Number.isFinite(limit) || limit <= 0 || value.length <= limit) return value
  if (limit <= 3) return value.slice(0, limit)
  return `${value.slice(0, limit - 3).trimEnd()}...`
}

const sanitizePluginCommandText = (value = '', options = {}) => {
  const {
    maxLength = 0,
    redactStandaloneTokenWords = true
  } = options || {}
  let sanitized = String(value || '')
  sanitized = sanitized.replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
  sanitized = sanitized.replace(/\b(api[_ -]?key|authorization|password|secret)\b\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,，。)]+)/gi, '$1=[redacted-secret]')
  sanitized = sanitized.replace(/\bbearer\s+\S+/gi, 'Bearer [redacted-secret]')
  sanitized = sanitized.replace(/\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\b\s*[:=]\s*[^\s,，。)]+/gi, '[redacted-token]=[redacted-secret]')
  if (redactStandaloneTokenWords) {
    sanitized = sanitized.replace(/\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\b/gi, '[redacted-token]')
  }
  sanitized = sanitized.replace(/\[redacted-token\]\s*[:=]\s*[^\s,，。)]+/gi, '[redacted-token]=[redacted-secret]')
  sanitized = sanitized.replace(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/\b(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/\[::1\](?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/[^\s,，。)]+/g, '[redacted-path]')
  sanitized = sanitized.replace(/[A-Za-z]:\\[^\s,，。)]+/g, '[redacted-path]')
  sanitized = sanitized.replace(/\[\[redacted-token\]\]/g, '[redacted-token]')
  return truncateSanitizedText(sanitized.trim(), maxLength)
}

const isPluginCommandOutputKey = (key = '') => /^(error|stderr|stdout)$/i.test(String(key || ''))

const isSensitivePluginResultKey = (key = '') => /^(?:api[_-]?key|authorization|credential|password|secret|.*(?:secret|token)|authorization\s*:\s*bearer\s+\S+)$/i.test(String(key || ''))

const REDACTED_KEY = '[redacted-key]'

const uniqueRedactedKey = (usedKeys) => {
  if (!usedKeys.has(REDACTED_KEY)) return REDACTED_KEY
  let suffix = 2
  while (usedKeys.has(`${REDACTED_KEY.slice(0, -1)}-${suffix}]`)) suffix += 1
  return `${REDACTED_KEY.slice(0, -1)}-${suffix}]`
}

const sanitizePluginCommandResultValue = (value, key = '') => {
  if (isSensitivePluginResultKey(key) && value !== null && value !== undefined) return '[redacted-secret]'
  if (typeof value === 'string') {
    return isPluginCommandOutputKey(key)
      ? sanitizePluginCommandText(value)
      : sanitizePluginCommandText(value, { redactStandaloneTokenWords: false })
  }
  if (Array.isArray(value)) {
    const entryKey = String(key || '').toLowerCase() === 'credentials' ? 'credential' : key
    return value.map((entry) => sanitizePluginCommandResultValue(entry, entryKey))
  }
  if (!value || typeof value !== 'object') return value
  const entries = Object.entries(value)
  const usedKeys = new Set(entries
    .filter(([entryKey]) => !isSensitivePluginResultKey(entryKey))
    .map(([entryKey]) => entryKey))
  return Object.fromEntries(entries.map(([entryKey, entryValue]) => {
    const outputKey = isSensitivePluginResultKey(entryKey) ? uniqueRedactedKey(usedKeys) : entryKey
    usedKeys.add(outputKey)
    return [outputKey, sanitizePluginCommandResultValue(entryValue, entryKey)]
  }))
}

module.exports = {
  sanitizePluginCommandResultValue,
  sanitizePluginCommandText
}
