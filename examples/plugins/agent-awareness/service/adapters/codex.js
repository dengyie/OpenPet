const crypto = require('crypto')
const path = require('path')

const TYPE_STATUS_MAP = new Map([
  ['session.discovered', 'idle'],
  ['turn.started', 'thinking'],
  ['tool.started', 'working'],
  ['approval.requested', 'waiting'],
  ['turn.blocked', 'blocked'],
  ['turn.failed', 'failed'],
  ['turn.completed', 'completed'],
  ['session.updated', 'working']
])

const SAFE_STATUSES = new Set(['idle', 'thinking', 'working', 'waiting', 'blocked', 'completed', 'failed'])

const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex')

const sanitizeText = (value, maxLength = 120) => String(value || '')
  .replace(/\bhttps?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s)]*)?/gi, '[local-url]')
  .replace(/\b(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s)]*)?/gi, '[local-url]')
  .replace(/\[::1\](?::\d+)?(?:\/[^\s)]*)?/gi, '[local-url]')
  .replace(/\bhttps?:\/\/[^\s)]+/gi, '[url]')
  .replace(/\bfile:\/\/[^\s)]+/gi, '[path]')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
  .replace(/(?:\/Users\/|\/private\/|\/tmp\/|\/var\/folders\/|[A-Za-z]:\\)[^\s)]+/g, '[path]')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength)

const hashSessionId = (rawSessionId) => sha256(`openpet-agent-session\0${String(rawSessionId || '')}`).slice(0, 12)

const toProjectLabel = (rawPath) => {
  const normalized = String(rawPath || '').trim()
  if (!normalized) return ''
  const baseName = sanitizeText(path.basename(normalized), 80) || 'project'
  const hash = sha256(`openpet-agent-project\0${normalized}`).slice(0, 6)
  return `${baseName} #${hash}`
}

const normalizeStatus = ({ type = '', status = '' } = {}) => {
  const explicit = sanitizeText(status, 32).toLowerCase()
  if (SAFE_STATUSES.has(explicit)) return explicit
  const safeType = sanitizeText(type, 64).toLowerCase()
  return TYPE_STATUS_MAP.get(safeType) || 'working'
}

const toNullableNumber = (value) => {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const normalizeCodexEvent = (payload = {}, { now = () => new Date().toISOString() } = {}) => {
  const rawSessionId = payload.sessionId || payload.session_id || payload.conversationId || payload.filePath || 'unknown-session'
  const type = sanitizeText(payload.type || payload.event || payload.name || 'session.updated', 64)
  const project = sanitizeText(payload.projectLabel || '', 96) || toProjectLabel(payload.cwd || payload.workspace || payload.project || '')
  return {
    adapter: 'codex',
    sessionId: hashSessionId(rawSessionId),
    status: normalizeStatus({ type, status: payload.status }),
    type,
    message: sanitizeText(payload.message || payload.summary || payload.statusText || '', 160),
    project,
    toolName: sanitizeText(payload.toolName || payload.tool || '', 64),
    phase: sanitizeText(payload.phase || '', 32),
    progressLabel: sanitizeText(payload.progressLabel || '', 120),
    progressStep: sanitizeText(payload.progressStep || '', 64),
    progressCurrent: toNullableNumber(payload.progressCurrent),
    progressTotal: toNullableNumber(payload.progressTotal),
    approvalState: sanitizeText(payload.approvalState || '', 32).toLowerCase(),
    lastSource: sanitizeText(payload.lastSource || payload.source || '', 32).toLowerCase(),
    active: payload.active === false ? false : undefined,
    timestamp: sanitizeText(payload.timestamp, 40) || now()
  }
}

module.exports = {
  hashSessionId,
  normalizeCodexEvent,
  normalizeStatus,
  sanitizeText,
  toProjectLabel
}
