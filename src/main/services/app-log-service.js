const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

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
  'path',
  'rawProviderReply',
  'referenceToken',
  'selectedPath',
  'sourceDir',
  'sourcePath',
  'token'
])

const MAX_DETAIL_STRING_CHARS = 500
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

const sanitizeStringValue = (value) => {
  const text = String(value)
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(text))) return REDACTED_VALUE
  if (text.length <= MAX_DETAIL_STRING_CHARS) return text
  return `${text.slice(0, MAX_DETAIL_STRING_CHARS)}...[truncated]`
}

const sanitizeDetails = (details = {}) => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {}
  return Object.fromEntries(Object.entries(details)
    .filter(([key]) => !isSensitiveDetailKey(key))
    .filter(([, value]) => (
      value == null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ))
    .map(([key, value]) => {
      if (typeof value === 'string') return [key, sanitizeStringValue(value)]
      return [key, value]
    }))
}

const normalizeEntry = ({ entry, clock, idFactory }) => ({
  id: entry.id || idFactory(),
  timestamp: entry.timestamp || clock().toISOString(),
  level: entry.level || 'info',
  actor: entry.actor || 'system',
  scope: entry.scope || 'app',
  event: entry.event || 'app.event',
  message: entry.message || '',
  details: sanitizeDetails(entry.details)
})

const createAppLogService = ({ logDir, logFileName = 'openpet-app.jsonl', maxEntries = 1000, clock = () => new Date(), idFactory = () => crypto.randomUUID() }) => {
  if (!logDir) throw new Error('logDir is required')
  const logPath = path.join(logDir, logFileName)

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
  }

  const record = (entry) => {
    const normalized = normalizeEntry({ entry, clock, idFactory })
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(logPath, `${JSON.stringify(normalized)}\n`, 'utf-8')
    if (maxEntries > 0 && read({ limit: maxEntries + 1 }).length > maxEntries) compact()
    return normalized
  }

  return { logPath, record, read }
}

module.exports = { createAppLogService, sanitizeDetails }
