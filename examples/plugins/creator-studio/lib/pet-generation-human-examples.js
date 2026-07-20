const fs = require('node:fs')
const path = require('node:path')
const { OFFICIAL_FULL_PET_ACTION_IDS } = require('./full-pet-row-contract')

const HUMAN_EXAMPLE_VERSION = 1
const DEFAULT_HUMAN_EXAMPLES_PATH = path.join(
  __dirname,
  '..',
  'quality',
  'pet-generation-human-examples.json'
)
const HUMAN_DECISIONS = new Set(['approved', 'rejected'])
const HUMAN_REASON_CODES = new Set([
  'identity-drift',
  'semantic-mismatch',
  'static-motion',
  'transform-only-motion',
  'edge-contact',
  'background-contamination',
  'baseline-instability',
  'scale-instability',
  'direction-mismatch'
])
const HUMAN_METRIC_KEYS = new Set([
  'identityDescriptorDistance',
  'identityMeanRgbDistance',
  'centroidDrift',
  'baselineDrift',
  'sizeDrift',
  'upperMotionRatio',
  'lowerMotionRatio',
  'identityCoreAverageMotionRatio',
  'identityCoreMaxMotionRatio'
])
const QUALITY_GUIDANCE_PHRASES = Object.freeze({
  'identity-drift': 'Preserve the exact species, silhouette, proportions, markings, palette, material treatment, and accessories from the identity reference.',
  'semantic-mismatch': 'Make the requested action peak immediately readable and distinct from every other state.',
  'static-motion': 'Author genuine pose progression; do not repeat one pose.',
  'transform-only-motion': 'Do not simulate motion by only translating, scaling, rotating, or recoloring one base sprite.',
  'edge-contact': 'Keep the complete body inside clear safe edge padding.',
  'background-contamination': 'Return one isolated character with no floor, shadow, scenery, labels, or border.',
  'baseline-instability': 'Keep a stable lower-center root except where vertical action semantics require movement.',
  'scale-instability': 'Keep character scale consistent across the sequence.',
  'direction-mismatch': 'Preserve the requested facing direction throughout the directional row.'
})
const GLOBAL_GUIDANCE_REASONS = new Set([
  'identity-drift',
  'edge-contact',
  'background-contamination',
  'scale-instability'
])
const SEQUENCE_GUIDANCE_REASONS = new Set(['static-motion', 'transform-only-motion'])
const GROUNDED_GUIDANCE_REASONS = new Set(['baseline-instability'])
const OFFICIAL_ACTION_IDS = new Set(OFFICIAL_FULL_PET_ACTION_IDS)

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

const readRegistry = (registryPath) => {
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'))
  } catch (error) {
    throw new Error(`Pet generation human example registry must be valid JSON: ${error?.message || error}`)
  }
}

const normalizeReasonCodes = (value, exampleId) => {
  if (!Array.isArray(value)) throw new Error(`Human quality example ${exampleId} reasonCodes must be an array`)
  const reasonCodes = []
  for (const entry of value) {
    const reasonCode = normalizeText(entry)
    if (!HUMAN_REASON_CODES.has(reasonCode)) {
      throw new Error(`Human quality example ${exampleId} has unknown reason code: ${reasonCode || '(missing)'}`)
    }
    if (!reasonCodes.includes(reasonCode)) reasonCodes.push(reasonCode)
  }
  return reasonCodes
}

const normalizeMetrics = (value, exampleId) => {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Human quality example ${exampleId} metrics must be an object`)
  }
  const metrics = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (!HUMAN_METRIC_KEYS.has(key)) {
      throw new Error(`Human quality example ${exampleId} has unknown metric: ${key}`)
    }
    const metric = Number(rawValue)
    if (!Number.isFinite(metric)) {
      throw new Error(`Human quality example ${exampleId} metric ${key} must be finite`)
    }
    metrics[key] = metric
  }
  return metrics
}

const normalizeExample = (value, index) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Human quality example ${index + 1} must be an object`)
  }
  const id = normalizeText(value.id)
  if (!id) throw new Error(`Human quality example ${index + 1} id is required`)
  const actionId = normalizeText(value.actionId)
  if (!OFFICIAL_ACTION_IDS.has(actionId)) {
    throw new Error(`Human quality example ${id} has unknown actionId: ${actionId || '(missing)'}`)
  }
  const decision = normalizeText(value.decision)
  if (!HUMAN_DECISIONS.has(decision)) {
    throw new Error(`Human quality example ${id} has invalid decision: ${decision || '(missing)'}`)
  }
  const reasonCodes = normalizeReasonCodes(value.reasonCodes, id)
  if (decision === 'approved' && reasonCodes.length > 0) {
    throw new Error(`Approved human quality example ${id} must not contain rejection reason codes`)
  }
  if (decision === 'rejected' && reasonCodes.length === 0) {
    throw new Error(`Rejected human quality example ${id} requires at least one reason code`)
  }
  const evidenceRelativePath = createSafeRelativePath(value.evidenceRelativePath)
  if (!evidenceRelativePath) {
    throw new Error(`Human quality example ${id} evidenceRelativePath must be a safe relative path`)
  }
  return Object.freeze({
    id,
    actionId,
    decision,
    reasonCodes: Object.freeze(reasonCodes),
    evidenceRelativePath,
    metrics: Object.freeze(normalizeMetrics(value.metrics, id))
  })
}

const loadHumanQualityExamples = ({ registryPath = DEFAULT_HUMAN_EXAMPLES_PATH } = {}) => {
  const resolvedPath = path.resolve(registryPath)
  const raw = readRegistry(resolvedPath)
  if (Number(raw?.version) !== HUMAN_EXAMPLE_VERSION) {
    throw new Error(`Unsupported pet generation human example registry version: ${raw?.version}`)
  }
  const datasetId = normalizeText(raw?.datasetId)
  if (!datasetId) throw new Error('Pet generation human example registry datasetId is required')
  if (!Array.isArray(raw?.examples)) throw new Error('Pet generation human example registry examples must be an array')
  const examples = raw.examples.map(normalizeExample)
  const seenIds = new Set()
  for (const example of examples) {
    if (seenIds.has(example.id)) throw new Error(`Duplicate human quality example id: ${example.id}`)
    seenIds.add(example.id)
  }
  return Object.freeze({
    version: HUMAN_EXAMPLE_VERSION,
    datasetId,
    updatedAt: normalizeText(raw.updatedAt),
    examples: Object.freeze(examples)
  })
}

const createReasonCountMap = () => Object.fromEntries(
  [...HUMAN_REASON_CODES].map((reasonCode) => [reasonCode, 0])
)

const createQualityGuidanceSummary = (registry) => {
  const examples = Array.isArray(registry?.examples) ? registry.examples : []
  const reasonCounts = createReasonCountMap()
  const byActionId = {}
  for (const example of examples) {
    if (!byActionId[example.actionId]) byActionId[example.actionId] = createReasonCountMap()
    for (const reasonCode of example.reasonCodes) {
      reasonCounts[reasonCode] += 1
      byActionId[example.actionId][reasonCode] += 1
    }
  }
  return Object.freeze({
    datasetId: normalizeText(registry?.datasetId),
    totalExamples: examples.length,
    reasonCounts: Object.freeze(reasonCounts),
    byActionId: Object.freeze(Object.fromEntries(
      Object.entries(byActionId).map(([actionId, counts]) => [actionId, Object.freeze(counts)])
    ))
  })
}

const resolveGuidanceReasonCodes = ({ qualityGuidance, actionId = '', animationType = '' } = {}) => {
  const globalCounts = qualityGuidance?.reasonCounts || {}
  const actionCounts = qualityGuidance?.byActionId?.[normalizeText(actionId)] || {}
  const normalizedAnimationType = normalizeText(animationType)
  return [...HUMAN_REASON_CODES].filter((reasonCode) => {
    if (Number(actionCounts[reasonCode]) > 0) return true
    if (Number(globalCounts[reasonCode]) <= 0) return false
    if (GLOBAL_GUIDANCE_REASONS.has(reasonCode)) return true
    if (SEQUENCE_GUIDANCE_REASONS.has(reasonCode)) return Boolean(normalizedAnimationType)
    if (GROUNDED_GUIDANCE_REASONS.has(reasonCode)) {
      return ['stationary_loop', 'locomotion_loop', 'vertical_bounce'].includes(normalizedAnimationType)
    }
    if (reasonCode === 'direction-mismatch') return normalizedAnimationType === 'locomotion_loop'
    return false
  })
}

const createQualityGuidanceLines = ({ qualityGuidance, actionId = '', animationType = '' } = {}) => (
  resolveGuidanceReasonCodes({ qualityGuidance, actionId, animationType })
    .map((reasonCode) => QUALITY_GUIDANCE_PHRASES[reasonCode])
    .filter(Boolean)
)

module.exports = {
  DEFAULT_HUMAN_EXAMPLES_PATH,
  HUMAN_DECISIONS,
  HUMAN_EXAMPLE_VERSION,
  HUMAN_METRIC_KEYS,
  HUMAN_REASON_CODES,
  QUALITY_GUIDANCE_PHRASES,
  createQualityGuidanceLines,
  createQualityGuidanceSummary,
  loadHumanQualityExamples,
  resolveGuidanceReasonCodes
}
