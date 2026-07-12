const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { sanitizeLogText } = require('./log-safety')

const SENSITIVE_DETAIL_KEYS = new Set([
  'assetPath',
  'assetUrl',
  'apiKey',
  'authorization',
  'compiledPersonaPrompt',
  'compiledSystemPrompt',
  'filePath',
  'filePaths',
  'hiddenPrompt',
  'memoryText',
  'motionPrompt',
  'originalPrompt',
  'path',
  'prompt',
  'rawProviderReply',
  'referenceToken',
  'referenceImagePath',
  'reply',
  'selectedPath',
  'sourceDir',
  'sourcePath',
  'stylePrompt',
  'token'
])

const MAX_DETAIL_STRING_CHARS = 500
const MAX_DETAIL_DEPTH = 4
const MAX_DETAIL_ARRAY_ITEMS = 20
const REDACTED_VALUE = '[redacted]'

const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/i,
  /\bsk-cpa-[A-Za-z0-9_-]{12,}\b/i,
  /\bbearer\s+[A-Za-z0-9._-]{12,}\b/i,
  /\b(api[_ -]?key|authorization|token|password|secret)\b\s*[:=]?\s*\S{6,}/i
]

const normalizeDetailKey = (key) => String(key || '').trim()

const isSensitiveDetailKey = (key) => {
  const normalizedKey = normalizeDetailKey(key)
  if (!normalizedKey) return false
  const directKey = normalizedKey.toLowerCase()
  return Array.from(SENSITIVE_DETAIL_KEYS).some((candidate) => candidate.toLowerCase() === directKey)
}

const sanitizeStringValue = (value, { redactOnSecretMatch = false } = {}) => {
  const text = String(value)
  if (redactOnSecretMatch && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(text))) return REDACTED_VALUE
  return sanitizeLogText(text, { maxChars: MAX_DETAIL_STRING_CHARS })
}

const isMessageLikeDetailKey = (key) => {
  const normalizedKey = normalizeDetailKey(key).toLowerCase()
  return [
    'errormessage',
    'message',
    'providermessage',
    'reason',
    'stderr',
    'stdout'
  ].includes(normalizedKey)
}

const sanitizeDetailValue = (value, key = '', depth = 0) => {
  if (value == null) return value
  if (depth >= MAX_DETAIL_DEPTH) return '[truncated]'
  if (typeof value === 'string') {
    const sanitized = sanitizeStringValue(value)
    return isMessageLikeDetailKey(key) ? (sanitized || REDACTED_VALUE) : sanitized
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_DETAIL_ARRAY_ITEMS)
      .map((entry) => sanitizeDetailValue(entry, key, depth + 1))
      .filter((entry) => entry !== undefined)
  }
  if (!value || typeof value !== 'object') return undefined

  const sanitizedEntries = Object.entries(value)
    .filter(([entryKey]) => !isSensitiveDetailKey(entryKey))
    .map(([entryKey, entryValue]) => [entryKey, sanitizeDetailValue(entryValue, entryKey, depth + 1)])
    .filter(([, entryValue]) => entryValue !== undefined)

  return Object.fromEntries(sanitizedEntries)
}

const sanitizeDetails = (details = {}) => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {}
  return Object.fromEntries(Object.entries(details)
    .filter(([key]) => !isSensitiveDetailKey(key))
    .map(([key, value]) => [key, sanitizeDetailValue(value, key, 0)])
    .filter(([, value]) => value !== undefined)
  )
}

const normalizeEntry = ({ entry, clock, idFactory }) => ({
  id: entry.id || idFactory(),
  timestamp: entry.timestamp || clock().toISOString(),
  level: entry.level || 'info',
  actor: entry.actor || 'system',
  scope: entry.scope || 'app',
  event: entry.event || 'app.event',
  message: sanitizeStringValue(entry.message || '', { redactOnSecretMatch: true }),
  details: sanitizeDetails(entry.details)
})

const createAppLogService = ({ logDir, logFileName = 'openpet-app.jsonl', maxEntries = 1000, clock = () => new Date(), idFactory = () => crypto.randomUUID() }) => {
  if (!logDir) throw new Error('logDir is required')
  const logPath = path.join(logDir, logFileName)
  let entryCount = null

  const read = ({ limit = maxEntries } = {}) => {
    if (!fs.existsSync(logPath)) return []
    return fs.readFileSync(logPath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch (_) {
          return null
        }
      })
      .filter(Boolean)
      .slice(-limit)
  }

  const compact = () => {
    const entries = read({ limit: maxEntries })
    fs.writeFileSync(logPath, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf-8')
    entryCount = entries.length
  }

  const record = (entry) => {
    const normalized = normalizeEntry({ entry, clock, idFactory })
    fs.mkdirSync(logDir, { recursive: true })
    if (entryCount == null) entryCount = fs.existsSync(logPath) ? read({ limit: maxEntries + 1 }).length : 0
    fs.appendFileSync(logPath, `${JSON.stringify(normalized)}\n`, 'utf-8')
    entryCount += 1
    if (maxEntries > 0 && entryCount > maxEntries) compact()
    return normalized
  }

  return { logPath, record, read }
}

module.exports = { createAppLogService, sanitizeDetails }
