const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const SENSITIVE_DETAIL_KEYS = new Set([
  'assetPath',
  'assetUrl',
  'filePath',
  'filePaths',
  'path',
  'selectedPath',
  'sourceDir',
  'sourcePath'
])

const sanitizeDetails = (details = {}) => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {}
  return Object.fromEntries(Object.entries(details)
    .filter(([key]) => !SENSITIVE_DETAIL_KEYS.has(key))
    .filter(([, value]) => (
      value == null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )))
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
