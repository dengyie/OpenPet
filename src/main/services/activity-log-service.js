const fs = require('fs')
const path = require('path')

const DEFAULT_ACTIVITY_LOG = 'activity.log'
const DEFAULT_ERROR_LOG = 'activity-error.log'
const MAX_STRING_LENGTH = 2000
const SENSITIVE_KEY_PATTERN = /token|api[-_]?key|authorization|cookie|secret|password|private[-_]?storage/i
const PRESERVED_STATUS_KEY_PATTERN = /^has[A-Z0-9_]/
const PRESERVED_REFERENCE_KEY_PATTERN = /ref$/i

const sanitizeValue = (value, key = '') => {
  if (PRESERVED_STATUS_KEY_PATTERN.test(key) && typeof value === 'boolean') return value
  if (PRESERVED_REFERENCE_KEY_PATTERN.test(key) && typeof value === 'string') return value
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted]'
  if (value == null) return value
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item))
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeValue(entryValue, entryKey)
    ]))
  }
  return String(value)
}

const normalizeLevel = (level) => {
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') return level
  return 'info'
}

const appendJsonLine = (filePath, entry) => {
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf-8')
}

const createActivityLogService = ({
  logDir,
  activityLogName = DEFAULT_ACTIVITY_LOG,
  errorLogName = DEFAULT_ERROR_LOG,
  clock = () => new Date(),
  mirrorToConsole = false,
  consoleService = console
} = {}) => {
  if (!logDir) throw new Error('Activity log directory is required')
  fs.mkdirSync(logDir, { recursive: true })

  const activityLogPath = path.join(logDir, activityLogName)
  const errorLogPath = path.join(logDir, errorLogName)
  let nextId = 1

  const mirror = (entry) => {
    if (!mirrorToConsole) return
    const line = `[OpenPet][activity] ${entry.timestamp} ${entry.level} ${entry.category} ${entry.action}${entry.message ? ` - ${entry.message}` : ''}`
    if (entry.level === 'error') consoleService.error?.(line)
    else if (entry.level === 'warn') consoleService.warn?.(line)
    else consoleService.log?.(line)
  }

  const record = ({
    level = 'info',
    category = 'app',
    action = 'event',
    source = 'main',
    message = '',
    details = {}
  } = {}) => {
    const entry = {
      id: nextId,
      timestamp: clock().toISOString(),
      level: normalizeLevel(level),
      category: String(category || 'app'),
      action: String(action || 'event'),
      source: String(source || 'main'),
      message: String(message || ''),
      details: sanitizeValue(details)
    }
    nextId += 1

    appendJsonLine(activityLogPath, entry)
    if (entry.level === 'warn' || entry.level === 'error') appendJsonLine(errorLogPath, entry)
    mirror(entry)
    return entry
  }

  const getPaths = () => ({ activityLogPath, errorLogPath, logDir })

  return { record, getPaths, sanitize: sanitizeValue }
}

module.exports = { createActivityLogService, sanitizeValue }
