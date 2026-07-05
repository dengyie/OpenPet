const {
  hashSessionId,
  normalizeStatus,
  sanitizeText,
  toProjectLabel
} = require('./codex')

const HOOK_PHASES = new Map([
  ['sessionstart', 'session'],
  ['userpromptsubmit', 'turn'],
  ['pretooluse', 'tool'],
  ['permissionrequest', 'approval'],
  ['posttooluse', 'tool'],
  ['stop', 'turn']
])

const DEFAULT_MESSAGES = {
  sessionstart: 'Codex session started.',
  userpromptsubmit: 'Codex received a new prompt.',
  pretooluse: 'Codex started a tool.',
  permissionrequest: 'Codex needs approval.',
  posttooluse: 'Codex finished a tool.',
  stop: 'Codex finished this turn.'
}

const toNullableNumber = (value) => {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const normalizeHookType = (payload = {}) => sanitizeText(
  payload.hook_event_name || payload.hookEventName || payload.type || payload.event || 'codex.hook',
  64
)

const buildMessage = ({ eventName, toolName, rawMessage }) => {
  const explicit = sanitizeText(rawMessage, 160)
  if (explicit) return explicit
  const eventKey = String(eventName || '').toLowerCase()
  if (eventKey === 'pretooluse' && toolName) return `Codex is starting ${toolName}.`
  if (eventKey === 'permissionrequest' && toolName) return `Codex is waiting for ${toolName} approval.`
  if (eventKey === 'posttooluse' && toolName) return `Codex finished ${toolName}.`
  return DEFAULT_MESSAGES[eventKey] || `Codex event: ${sanitizeText(eventName, 64)}.`
}

const buildProgressLabel = ({ eventName, toolName, rawLabel }) => {
  const explicit = sanitizeText(rawLabel, 120)
  if (explicit) return explicit
  const eventKey = String(eventName || '').toLowerCase()
  if (eventKey === 'pretooluse' && toolName) return `Running ${toolName}`
  if (eventKey === 'permissionrequest' && toolName) return `Waiting for ${toolName} approval`
  if (eventKey === 'posttooluse' && toolName) return `Completed ${toolName}`
  if (eventKey === 'stop') return 'Turn completed'
  return ''
}

const isCodexHookPayload = (payload = {}) => {
  const eventName = String(
    payload.hook_event_name || payload.hookEventName || payload.type || payload.event || ''
  ).trim()
  return HOOK_PHASES.has(eventName.toLowerCase())
}

const normalizeCodexHookEvent = (payload = {}, { now = () => new Date().toISOString() } = {}) => {
  const rawSessionId = payload.session_id || payload.sessionId || payload.conversationId || payload.filePath || 'unknown-session'
  const eventName = normalizeHookType(payload)
  const toolName = sanitizeText(payload.tool_name || payload.toolName || payload.tool || '', 64)
  const eventKey = eventName.toLowerCase()
  return {
    adapter: 'codex',
    sessionId: hashSessionId(rawSessionId),
    status: normalizeStatus({
      type: eventName,
      status: payload.status || (eventKey === 'permissionrequest' ? 'waiting' : '')
    }),
    phase: HOOK_PHASES.get(eventKey) || 'session',
    type: eventName,
    message: buildMessage({
      eventName,
      toolName,
      rawMessage: payload.message || payload.summary || payload.statusText
    }),
    project: sanitizeText(payload.projectLabel || '', 96) || toProjectLabel(payload.cwd || payload.workspace || payload.project || ''),
    toolName,
    progressLabel: buildProgressLabel({
      eventName,
      toolName,
      rawLabel: payload.progress_label || payload.progressLabel
    }),
    progressStep: sanitizeText(payload.progress_step || payload.progressStep || toolName, 64),
    progressCurrent: toNullableNumber(payload.progress_current ?? payload.progressCurrent),
    progressTotal: toNullableNumber(payload.progress_total ?? payload.progressTotal),
    approvalState: sanitizeText(
      payload.approval_state || payload.approvalState || (eventKey === 'permissionrequest' ? 'requested' : ''),
      32
    ).toLowerCase(),
    lastSource: 'hook',
    active: payload.active === false ? false : undefined,
    timestamp: sanitizeText(payload.timestamp, 40) || now()
  }
}

module.exports = {
  isCodexHookPayload,
  normalizeCodexHookEvent
}
