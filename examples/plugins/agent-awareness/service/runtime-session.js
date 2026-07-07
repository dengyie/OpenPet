const { sanitizeText } = require('./adapters/codex')
const { normalizeGitSummary } = require('./git-summary')
const { normalizeUsageSummary } = require('./usage-summary')

const SAFE_PHASES = new Set(['session', 'turn', 'tool', 'approval', 'progress'])
const INACTIVE_STATUSES = new Set(['idle', 'completed', 'failed'])
const HOOK_TYPES = new Set([
  'sessionstart',
  'userpromptsubmit',
  'pretooluse',
  'permissionrequest',
  'posttooluse',
  'stop'
])

const toNullableNumber = (value) => {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const normalizePhase = ({ phase = '', type = '', status = '' } = {}) => {
  const explicit = sanitizeText(phase, 32).toLowerCase()
  if (SAFE_PHASES.has(explicit)) return explicit
  const safeType = sanitizeText(type, 64).toLowerCase()
  if (safeType === 'permissionrequest' || safeType.startsWith('approval.')) return 'approval'
  if (safeType === 'pretooluse' || safeType === 'posttooluse' || safeType.startsWith('tool.')) return 'tool'
  if (safeType === 'userpromptsubmit' || safeType.startsWith('turn.')) return 'turn'
  if (safeType.includes('progress')) return 'progress'
  if (sanitizeText(status, 32).toLowerCase() === 'waiting') return 'approval'
  return 'session'
}

const normalizeSource = ({ lastSource = '', source = '', type = '' } = {}) => {
  const explicit = sanitizeText(lastSource || source, 32).toLowerCase()
  if (explicit === 'hook' || explicit === 'poller') return explicit
  const safeType = sanitizeText(type, 64).toLowerCase()
  return HOOK_TYPES.has(safeType) ? 'hook' : 'poller'
}

const normalizeApprovalState = ({ approvalState = '', phase = '', type = '', status = '' } = {}) => {
  const explicit = sanitizeText(approvalState, 32).toLowerCase()
  if (explicit) return explicit
  const normalizedPhase = normalizePhase({ phase, type, status })
  const safeType = sanitizeText(type, 64).toLowerCase()
  const safeStatus = sanitizeText(status, 32).toLowerCase()
  if (normalizedPhase === 'approval' || safeType === 'permissionrequest' || safeType === 'approval.requested' || safeStatus === 'waiting') {
    return 'requested'
  }
  return ''
}

const normalizeRuntimeEvent = (event = {}, { now = () => new Date().toISOString() } = {}) => {
  const status = sanitizeText(event.status, 32).toLowerCase() || 'working'
  const phase = normalizePhase({ phase: event.phase, type: event.type, status })
  const usage = normalizeUsageSummary(event.usage || event)
  const git = normalizeGitSummary(event.git || event)
  return {
    adapter: sanitizeText(event.adapter || 'codex', 32) || 'codex',
    sessionId: sanitizeText(event.sessionId, 64),
    project: sanitizeText(event.project, 96),
    status,
    phase,
    type: sanitizeText(event.type || 'session.updated', 64) || 'session.updated',
    message: sanitizeText(event.message, 160),
    toolName: sanitizeText(event.toolName, 64),
    progressLabel: sanitizeText(event.progressLabel, 120),
    progressStep: sanitizeText(event.progressStep, 64),
    progressCurrent: toNullableNumber(event.progressCurrent),
    progressTotal: toNullableNumber(event.progressTotal),
    approvalState: normalizeApprovalState({
      approvalState: event.approvalState,
      phase,
      type: event.type,
      status
    }),
    active: typeof event.active === 'boolean' ? event.active : !INACTIVE_STATUSES.has(status),
    lastSource: normalizeSource({
      lastSource: event.lastSource,
      source: event.source,
      type: event.type
    }),
    usage,
    git,
    summary: normalizeSessionSummary({
      event,
      git,
      phase,
      project: sanitizeText(event.project, 96),
      progressLabel: sanitizeText(event.progressLabel, 120),
      status,
      toolName: sanitizeText(event.toolName, 64),
      type: sanitizeText(event.type || 'session.updated', 64) || 'session.updated',
      message: sanitizeText(event.message, 160)
    }),
    timestamp: sanitizeText(event.timestamp, 40) || now()
  }
}

const buildCurrentStep = ({
  phase = '',
  progressLabel = '',
  source = {},
  status = '',
  toolName = '',
  type = ''
} = {}) => {
  const explicit = sanitizeText(source.currentStep || '', 80)
  const safeProgressLabel = sanitizeText(progressLabel, 80)
  const safeToolName = sanitizeText(toolName, 64)
  const safeType = sanitizeText(type, 80)
  const safePhase = sanitizeText(phase, 32)
  const safeStatus = sanitizeText(status, 32)
  const explicitLooksGenerated = explicit && (explicit === safeType || explicit === safePhase)
  if (safeProgressLabel && (!explicit || explicitLooksGenerated)) return safeProgressLabel
  if (safeToolName && (!explicit || explicitLooksGenerated)) return `Tool: ${safeToolName}`
  if (safePhase === 'approval' && (!explicit || explicitLooksGenerated)) return 'Awaiting approval'
  if (safeStatus === 'completed' && (!explicit || explicitLooksGenerated)) return 'Completed'
  return explicit || safeType || safePhase
}

const normalizeSessionSummary = ({
  event = {},
  git = null,
  phase = '',
  project = '',
  progressLabel = '',
  status = '',
  toolName = '',
  type = '',
  message = ''
} = {}) => {
  const source = event.summary && typeof event.summary === 'object' ? event.summary : {}
  const title = sanitizeText(source.title || '', 120) || (
    project && git?.branch ? `${project} on ${git.branch}` : project
  )
  const currentStep = buildCurrentStep({
    phase,
    progressLabel,
    source,
    status,
    toolName,
    type
  })
  const recentProgressHint = sanitizeText(
    source.recentProgressHint || progressLabel || message || (project ? `Working in ${project}` : ''),
    160
  )
  const normalized = {
    title,
    currentStep,
    recentProgressHint
  }
  return Object.values(normalized).some(Boolean) ? normalized : null
}

const createRuntimeSession = (previousSession, event, { now = () => new Date().toISOString() } = {}) => {
  const normalized = normalizeRuntimeEvent(event, { now })
  const approvalState = normalized.phase === 'approval'
    ? normalized.approvalState
    : ''
  const usage = normalized.usage || previousSession?.usage || null
  const git = normalized.git || previousSession?.git || null
  const previousSummary = previousSession?.summary || {}
  const normalizedSummary = normalized.summary || {}
  const normalizedTitleIsProjectOnly = normalizedSummary.title &&
    normalized.project &&
    normalizedSummary.title === normalized.project &&
    previousSummary.title &&
    previousSummary.title !== normalizedSummary.title
  const summary = {
    title: normalizedTitleIsProjectOnly
      ? previousSummary.title
      : (normalizedSummary.title || previousSummary.title || ''),
    currentStep: normalizedSummary.currentStep || previousSummary.currentStep || '',
    recentProgressHint: normalizedSummary.recentProgressHint || previousSummary.recentProgressHint || ''
  }
  return {
    adapter: normalized.adapter || previousSession?.adapter || 'codex',
    sessionId: normalized.sessionId || previousSession?.sessionId || '',
    project: normalized.project || previousSession?.project || '',
    status: normalized.status || previousSession?.status || 'working',
    phase: normalized.phase || previousSession?.phase || 'session',
    type: normalized.type || previousSession?.type || 'session.updated',
    message: normalized.message || previousSession?.message || '',
    toolName: normalized.toolName || previousSession?.toolName || '',
    progressLabel: normalized.progressLabel || previousSession?.progressLabel || '',
    progressStep: normalized.progressStep || previousSession?.progressStep || '',
    progressCurrent: normalized.progressCurrent ?? previousSession?.progressCurrent ?? null,
    progressTotal: normalized.progressTotal ?? previousSession?.progressTotal ?? null,
    approvalState,
    active: typeof normalized.active === 'boolean'
      ? normalized.active
      : (typeof previousSession?.active === 'boolean' ? previousSession.active : true),
    lastSource: normalized.lastSource || previousSession?.lastSource || 'poller',
    usage,
    git,
    summary: Object.values(summary).some(Boolean) ? summary : null,
    timestamp: normalized.timestamp || previousSession?.timestamp || now()
  }
}

const createRuntimeHistoryEntry = (session = {}) => ({
  phase: String(session.phase || ''),
  type: String(session.type || ''),
  status: String(session.status || ''),
  message: String(session.message || ''),
  project: String(session.project || ''),
  toolName: String(session.toolName || ''),
  progressLabel: String(session.progressLabel || ''),
  progressStep: String(session.progressStep || ''),
  progressCurrent: session.progressCurrent ?? null,
  progressTotal: session.progressTotal ?? null,
  approvalState: String(session.approvalState || ''),
  lastSource: String(session.lastSource || ''),
  usage: session.usage || null,
  git: session.git || null,
  summary: session.summary || null,
  timestamp: String(session.timestamp || '')
})

module.exports = {
  createRuntimeHistoryEntry,
  createRuntimeSession,
  normalizePhase,
  normalizeRuntimeEvent
}
