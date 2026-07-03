const crypto = require('crypto')
const path = require('path')

const STATUS_MAP = new Map([
  ['session.started', 'working'],
  ['turn.started', 'thinking'],
  ['agent.thinking', 'thinking'],
  ['tool.started', 'working'],
  ['command.started', 'working'],
  ['approval.requested', 'waiting'],
  ['waiting_for_user', 'waiting'],
  ['blocked', 'blocked'],
  ['error', 'failed'],
  ['failed', 'failed'],
  ['turn.completed', 'completed'],
  ['session.completed', 'completed'],
  ['completed', 'completed']
])

const SAFE_STATUS = new Set(['idle', 'thinking', 'working', 'waiting', 'blocked', 'completed', 'failed'])

const sha = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex')

const sanitizeText = (value, maxLength = 180) => String(value || '')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
  .trim()
  .slice(0, maxLength)

const normalizeSessionId = (value) => {
  const raw = sanitizeText(value, 96)
  if (/^[a-zA-Z0-9_.:-]{1,96}$/.test(raw)) return raw
  return `session-${sha(raw || 'unknown').slice(0, 16)}`
}

const normalizeStatus = (payload = {}) => {
  const explicit = sanitizeText(payload.status, 32).toLowerCase()
  if (SAFE_STATUS.has(explicit)) return explicit
  const type = sanitizeText(payload.type || payload.event || payload.name, 64).toLowerCase()
  return STATUS_MAP.get(type) || 'working'
}

const normalizeCwd = (value) => {
  const raw = String(value || '')
  if (!raw) return { cwdName: '', cwdHash: '' }
  return {
    cwdName: sanitizeText(path.basename(raw), 80),
    cwdHash: sha(raw).slice(0, 16)
  }
}

const normalizeCodexEvent = (payload = {}, { now = () => new Date().toISOString() } = {}) => {
  const sessionId = normalizeSessionId(payload.sessionId || payload.session_id || payload.conversationId)
  const cwd = normalizeCwd(payload.cwd || payload.workspace || payload.project)
  return {
    adapter: 'codex',
    sessionId,
    status: normalizeStatus(payload),
    type: sanitizeText(payload.type || payload.event || payload.name || 'agent.status', 64),
    message: sanitizeText(payload.message || payload.summary || payload.statusText || ''),
    cwdName: cwd.cwdName,
    cwdHash: cwd.cwdHash,
    toolName: sanitizeText(payload.toolName || payload.tool || '', 64),
    timestamp: sanitizeText(payload.timestamp, 40) || now()
  }
}

module.exports = {
  normalizeCodexEvent,
  sanitizeText
}
