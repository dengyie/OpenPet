const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SELECTION_AUTHORITIES = new Set(['automatic', 'human-override'])

const normalizeCode = (value) => String(value || '')
  .trim()
  .replace(/[^A-Za-z0-9:_-]/g, '_')
  .slice(0, 120)

const uniqueCodes = (values = []) => [...new Set(
  (Array.isArray(values) ? values : [])
    .map(normalizeCode)
    .filter(Boolean)
)].slice(0, 32)

const createDecisionError = (code, message) => {
  const error = new Error(message)
  error.code = code
  return error
}

const normalizeCandidateDecision = ({
  candidate = {},
  technicalEligible = candidate?.technicalEligible,
  recommended = candidate?.recommended,
  technicalFailureCodes = candidate?.technicalFailureCodes,
  qualityWarningCodes = candidate?.qualityWarningCodes
} = {}) => ({
  ...candidate,
  technicalEligible: technicalEligible === true,
  recommended: recommended === true,
  technicalFailureCodes: uniqueCodes(technicalFailureCodes),
  qualityWarningCodes: uniqueCodes(qualityWarningCodes)
})

const normalizeStoredCandidateDecision = (candidate = {}) => {
  const technicalEligible = typeof candidate.technicalEligible === 'boolean'
    ? candidate.technicalEligible
    : candidate.eligible === true
  const recommended = typeof candidate.recommended === 'boolean'
    ? candidate.recommended
    : candidate.eligible === true
  return normalizeCandidateDecision({
    candidate,
    technicalEligible,
    recommended,
    technicalFailureCodes: candidate.technicalFailureCodes || (technicalEligible ? [] : candidate.failureCodes),
    qualityWarningCodes: candidate.qualityWarningCodes || (technicalEligible && !recommended
      ? (candidate.gate?.failures || candidate.failureCodes)
      : [])
  })
}

const assertHumanCandidateSelection = ({
  candidate,
  expectedHash,
  qualityOverride = false,
  acknowledgedWarningCodes = []
} = {}) => {
  const normalized = normalizeCandidateDecision({ candidate })
  const candidateHash = String(normalized.sha256 || '').trim().toLowerCase()
  const requestedHash = String(expectedHash || '').trim().toLowerCase()
  if (!SHA256_PATTERN.test(candidateHash) || candidateHash !== requestedHash) {
    throw createDecisionError('candidate_hash_mismatch', 'Candidate hash does not match the retained asset')
  }
  if (normalized.technicalEligible !== true) {
    throw createDecisionError('candidate_technically_unusable', 'Candidate is technically unusable')
  }
  if (normalized.recommended !== true) {
    if (qualityOverride !== true) {
      throw createDecisionError('quality_override_acknowledgement_required', 'Candidate quality override acknowledgement is required')
    }
    const expectedWarnings = normalized.qualityWarningCodes.slice().sort()
    const acknowledgedWarnings = uniqueCodes(acknowledgedWarningCodes).sort()
    if (
      expectedWarnings.length !== acknowledgedWarnings.length ||
      expectedWarnings.some((warning, index) => warning !== acknowledgedWarnings[index])
    ) {
      throw createDecisionError('quality_override_evidence_stale', 'Candidate quality warning evidence has changed')
    }
  }
  return normalized
}

const createCandidateSelection = ({
  candidate,
  expectedHash,
  authority,
  qualityOverride = false,
  acknowledgedWarningCodes = [],
  now = () => new Date().toISOString()
} = {}) => {
  const selectionAuthority = String(authority || '').trim()
  if (!SELECTION_AUTHORITIES.has(selectionAuthority)) {
    throw createDecisionError('candidate_selection_authority_invalid', 'Candidate selection authority is invalid')
  }
  const normalized = selectionAuthority === 'human-override'
    ? assertHumanCandidateSelection({ candidate, expectedHash, qualityOverride, acknowledgedWarningCodes })
    : normalizeCandidateDecision({ candidate })
  const candidateHash = String(normalized.sha256 || '').trim().toLowerCase()
  if (!SHA256_PATTERN.test(candidateHash) || candidateHash !== String(expectedHash || '').trim().toLowerCase()) {
    throw createDecisionError('candidate_hash_mismatch', 'Candidate hash does not match the retained asset')
  }
  if (selectionAuthority === 'automatic' && (normalized.technicalEligible !== true || normalized.recommended !== true)) {
    throw createDecisionError('candidate_not_recommended', 'Automatic selection requires a recommended technical candidate')
  }
  const isQualityOverride = selectionAuthority === 'human-override' && normalized.recommended !== true
  return {
    candidateId: String(normalized.candidateId || '').trim().slice(0, 128),
    sha256: candidateHash,
    selectionAuthority,
    qualityOverride: isQualityOverride,
    acknowledgedWarningCodes: isQualityOverride ? normalized.qualityWarningCodes.slice().sort() : [],
    selectedAt: String(now())
  }
}

module.exports = {
  assertHumanCandidateSelection,
  createCandidateSelection,
  normalizeCandidateDecision,
  normalizeStoredCandidateDecision,
  uniqueCodes
}
