const fs = require('node:fs')
const path = require('node:path')

const PROVIDER_ART_APPROVAL_VERSION = 1
const DEFAULT_PROVIDER_ART_APPROVALS_PATH = path.join(
  __dirname,
  '..',
  'quality',
  'provider-art-approvals.json'
)

const normalizeText = (value) => String(value || '').trim()

const createSafeRelativePath = (value) => {
  const normalized = normalizeText(value).replace(/\\/g, '/')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..')
  ) return ''
  return normalized
}

const normalizeApproval = (value, index) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Provider art approval ${index + 1} must be an object`)
  }
  const allowedKeys = [
    'datasetId',
    'decision',
    'evidenceRelativePath',
    'id',
    'model',
    'provider',
    'qualityProfileId',
    'reviewedAt'
  ]
  const actualKeys = Object.keys(value).sort()
  if (actualKeys.join('\n') !== allowedKeys.join('\n')) {
    throw new Error(`Provider art approval ${index + 1} must contain exactly: ${allowedKeys.join(', ')}`)
  }
  const approval = {
    id: normalizeText(value.id),
    provider: normalizeText(value.provider),
    model: normalizeText(value.model),
    qualityProfileId: normalizeText(value.qualityProfileId),
    datasetId: normalizeText(value.datasetId),
    decision: normalizeText(value.decision),
    reviewedAt: normalizeText(value.reviewedAt),
    evidenceRelativePath: createSafeRelativePath(value.evidenceRelativePath)
  }
  for (const field of ['id', 'provider', 'model', 'qualityProfileId', 'datasetId', 'reviewedAt']) {
    if (!approval[field]) throw new Error(`Provider art approval ${index + 1} ${field} is required`)
  }
  if (approval.decision !== 'approved') {
    throw new Error(`Provider art approval ${approval.id} decision must be approved`)
  }
  if (Number.isNaN(Date.parse(approval.reviewedAt))) {
    throw new Error(`Provider art approval ${approval.id} reviewedAt must be a valid timestamp`)
  }
  if (!approval.evidenceRelativePath) {
    throw new Error(`Provider art approval ${approval.id} evidenceRelativePath must be a safe relative path`)
  }
  return Object.freeze(approval)
}

const loadProviderArtApprovals = ({ registryPath = DEFAULT_PROVIDER_ART_APPROVALS_PATH } = {}) => {
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(path.resolve(registryPath), 'utf8'))
  } catch (error) {
    throw new Error(`Provider art approval registry must be valid JSON: ${error?.message || error}`)
  }
  if (Number(raw?.version) !== PROVIDER_ART_APPROVAL_VERSION) {
    throw new Error(`Unsupported Provider art approval registry version: ${raw?.version}`)
  }
  if (!Array.isArray(raw?.approvals)) throw new Error('Provider art approval registry approvals must be an array')
  const approvals = raw.approvals.map(normalizeApproval)
  const ids = new Set()
  const matchKeys = new Set()
  for (const approval of approvals) {
    if (ids.has(approval.id)) throw new Error(`Duplicate Provider art approval id: ${approval.id}`)
    ids.add(approval.id)
    const matchKey = [
      approval.provider,
      approval.model,
      approval.qualityProfileId,
      approval.datasetId
    ].join('\n')
    if (matchKeys.has(matchKey)) {
      throw new Error(`Duplicate Provider art approval match for ${approval.provider}/${approval.model}`)
    }
    matchKeys.add(matchKey)
  }
  return Object.freeze({
    version: PROVIDER_ART_APPROVAL_VERSION,
    updatedAt: normalizeText(raw.updatedAt),
    approvals: Object.freeze(approvals)
  })
}

const resolveProviderArtReadiness = ({
  approvals,
  provider,
  model,
  qualityProfile,
  datasetId
}) => {
  const normalizedProvider = normalizeText(provider)
  const normalizedModel = normalizeText(model)
  const qualityProfileId = normalizeText(qualityProfile?.id)
  const normalizedDatasetId = normalizeText(datasetId)
  const match = (Array.isArray(approvals?.approvals) ? approvals.approvals : [])
    .find((approval) => (
      approval.provider === normalizedProvider &&
      approval.model === normalizedModel &&
      approval.qualityProfileId === qualityProfileId &&
      approval.datasetId === normalizedDatasetId
    ))
  if (!match) {
    return Object.freeze({
      level: 'technical-chain-ready',
      approved: false,
      reason: 'no-matching-human-art-approval',
      provider: normalizedProvider,
      model: normalizedModel,
      qualityProfileId,
      datasetId: normalizedDatasetId
    })
  }
  return Object.freeze({
    level: 'production-art-ready',
    approved: true,
    approvalId: match.id,
    evidenceRelativePath: match.evidenceRelativePath,
    provider: normalizedProvider,
    model: normalizedModel,
    qualityProfileId,
    datasetId: normalizedDatasetId
  })
}

module.exports = {
  DEFAULT_PROVIDER_ART_APPROVALS_PATH,
  PROVIDER_ART_APPROVAL_VERSION,
  loadProviderArtApprovals,
  resolveProviderArtReadiness
}
