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
  if (
    !approved ||
    !HUMAN_APPROVAL_SOURCES.has(source) ||
    evidenceVersion !== 1 ||
    !Number.isFinite(Date.parse(approvedAt))
  ) {
    throw createHumanApprovalError()
  }
  return Object.freeze({ approved, source, approvedAt, evidenceVersion })
}

module.exports = {
  HUMAN_APPROVAL_SOURCES,
  normalizeHumanApproval
}
