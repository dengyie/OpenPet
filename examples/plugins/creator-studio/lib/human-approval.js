const HUMAN_APPROVAL_SOURCES = new Set([
  'control-center',
  'creator-studio-dashboard'
])

const createHumanApprovalError = (message) => {
  const error = new Error(message || 'Creator Studio approval requires explicit human approval evidence')
  error.code = 'human_approval_required'
  return error
}

const normalizeHumanApproval = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createHumanApprovalError()
  }
  const approved = value.approved === true
  const source = String(value.source || '').trim()
  const approvedAt = String(value.approvedAt || '').trim()
  const evidenceVersion = Number(value.evidenceVersion)
  const hasIsoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(approvedAt)
  const approvedAtMs = approvedAt.length <= 40 && hasIsoTimestamp ? Date.parse(approvedAt) : Number.NaN
  if (
    !approved ||
    !HUMAN_APPROVAL_SOURCES.has(source) ||
    evidenceVersion !== 1 ||
    approvedAt.length > 40 ||
    !Number.isFinite(approvedAtMs) ||
    new Date(approvedAtMs).toISOString() !== approvedAt
  ) {
    throw createHumanApprovalError()
  }
  return Object.freeze({
    approved,
    source,
    approvedAt: new Date(approvedAtMs).toISOString(),
    evidenceVersion
  })
}

module.exports = {
  HUMAN_APPROVAL_SOURCES,
  normalizeHumanApproval
}
