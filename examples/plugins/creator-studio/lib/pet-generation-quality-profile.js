const fs = require('node:fs')
const path = require('node:path')

const QUALITY_PROFILE_VERSION = 1
const DEFAULT_QUALITY_PROFILE_ID = 'pet-generation-default-v1'
const QUALITY_FIRST_QUALITY_PROFILE_ID = 'pet-generation-default-v2'

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

const DEFAULT_QUALITY_PROFILE = deepFreeze({
  version: QUALITY_PROFILE_VERSION,
  id: DEFAULT_QUALITY_PROFILE_ID,
  sourceDatasetId: '',
  reviewEvidenceRelativePath: '',
  row: {
    visibleAlphaThreshold: 8,
    safeMarginPx: 4,
    maxAlphaCoverage: 0.9,
    maxCentroidDrift: 40,
    maxBaselineDrift: 30,
    maxSizeDrift: 0.35,
    minWavingUpperMotionRatio: 0.01,
    minLocomotionLowerMotionRatio: 0.01,
    maxIdentityCoreAverageMotionRatio: 0.32,
    maxIdentityCorePairMotionRatio: 0.5,
    maxIdentityMeanRgbDistance: 120,
    maxIdentityDescriptorDistance: 90,
    minJumpExcursion: 8,
    maxJumpReturnDrift: 6
  },
  keyframe: {
    maxIdentityDescriptorDistance: 90,
    maxActionIdentityDescriptorDistance: 70,
    minActionAnchorScore: 50,
    minActionKeyframeScore: 30,
    maxIdentityMeanRgbDistance: 120
  }
})

const QUALITY_FIRST_QUALITY_PROFILE = deepFreeze({
  version: 2,
  id: QUALITY_FIRST_QUALITY_PROFILE_ID,
  sourceDatasetId: '',
  reviewEvidenceRelativePath: '',
  identity: {
    maxDescriptorDistance: 90,
    maxMeanRgbDistance: 120,
    minCanonicalScore: 88
  },
  groundedCompact: {
    maxBodyScaleCv: 0.08,
    maxAnchorYStd: 0.05,
    maxCrossActionScaleDrift: 0.08,
    maxEdgeContactFrames: 0,
    maxPasteClampedFrames: 0
  },
  groundedElongated: {
    maxBodyScaleCv: 0.1,
    maxContactBandStd: 0.07,
    maxCrossActionScaleDrift: 0.1,
    maxEdgeContactFrames: 0,
    maxPasteClampedFrames: 0
  },
  floating: {
    maxBodyScaleCv: 0.1,
    maxCoreCentroidStd: 0.08,
    maxCrossActionScaleDrift: 0.1,
    maxEdgeContactFrames: 0,
    maxPasteClampedFrames: 0
  },
  airborne: {
    maxBodyScaleCv: 0.1,
    maxHorizontalRootDrift: 0.08,
    maxCrossActionScaleDrift: 0.1,
    maxEdgeContactFrames: 0,
    maxPasteClampedFrames: 0
  },
  crossAction: {
    maxScaleDrift: 0.08,
    maxIdentityDescriptorDistance: 90,
    maxAdjacentActionScaleDrift: 0.08
  },
  atlas: {
    maxEmptyRequiredRows: 0,
    maxEdgeContactFrames: 0,
    maxPasteClampedFrames: 0,
    minRequiredActionCoverage: 1
  },
  visual: {
    confidence: 0.8,
    canonical: { identity: 90, silhouette: 85, smallScale: 82, completeness: 95, style: 85, overall: 88 },
    groundedAction: { identity: 88, actionReadability: 85, crossFrame: 85, crossAction: 85, smallScale: 80, style: 85, overall: 86 },
    airborneAction: { identity: 88, actionReadability: 88, crossFrame: 85, crossAction: 85, smallScale: 80, style: 85, overall: 86 },
    finalPackage: { identity: 88, actionDistinctness: 85, crossAction: 88, smallScale: 80, style: 85, overall: 88 }
  }
})

const PROFILE_LIMITS = Object.freeze({
  row: Object.freeze({
    visibleAlphaThreshold: [0, 254],
    safeMarginPx: [0, 96],
    maxAlphaCoverage: [0.01, 1],
    maxCentroidDrift: [0, 192],
    maxBaselineDrift: [0, 208],
    maxSizeDrift: [0, 1],
    minWavingUpperMotionRatio: [0, 1],
    minLocomotionLowerMotionRatio: [0, 1],
    maxIdentityCoreAverageMotionRatio: [0, 1],
    maxIdentityCorePairMotionRatio: [0, 1],
    maxIdentityMeanRgbDistance: [0, 441.7],
    maxIdentityDescriptorDistance: [0, 500],
    minJumpExcursion: [0, 208],
    maxJumpReturnDrift: [0, 208]
  }),
  keyframe: Object.freeze({
    maxIdentityDescriptorDistance: [0, 500],
    maxActionIdentityDescriptorDistance: [0, 500],
    minActionAnchorScore: [0, 100],
    minActionKeyframeScore: [0, 100],
    maxIdentityMeanRgbDistance: [0, 441.7]
  })
})

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

const normalizeThresholdGroup = ({ groupName, value }) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Pet generation quality profile ${groupName} thresholds must be an object`)
  }
  const expected = PROFILE_LIMITS[groupName]
  const actualKeys = Object.keys(value).sort()
  const expectedKeys = Object.keys(expected).sort()
  if (actualKeys.join('\n') !== expectedKeys.join('\n')) {
    throw new Error(`Pet generation quality profile ${groupName} thresholds must contain exactly: ${expectedKeys.join(', ')}`)
  }
  return Object.fromEntries(expectedKeys.map((key) => {
    const number = Number(value[key])
    const [minimum, maximum] = expected[key]
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      throw new Error(`Pet generation quality profile ${groupName}.${key} must be between ${minimum} and ${maximum}`)
    }
    return [key, number]
  }))
}

const getDefaultQualityProfile = () => DEFAULT_QUALITY_PROFILE
const getQualityFirstQualityProfile = () => QUALITY_FIRST_QUALITY_PROFILE

const loadQualityProfile = ({ profilePath = '', humanRegistry = null } = {}) => {
  const requestedPath = normalizeText(profilePath)
  if (!requestedPath) return DEFAULT_QUALITY_PROFILE
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(path.resolve(requestedPath), 'utf8'))
  } catch (error) {
    throw new Error(`Pet generation quality profile must be valid JSON: ${error?.message || error}`)
  }
  if (Number(raw?.version) !== QUALITY_PROFILE_VERSION) {
    throw new Error(`Unsupported pet generation quality profile version: ${raw?.version}`)
  }
  const id = normalizeText(raw.id)
  if (!id || id === DEFAULT_QUALITY_PROFILE_ID) {
    throw new Error('Calibrated pet generation quality profile requires a unique non-default id')
  }
  const sourceDatasetId = normalizeText(raw.sourceDatasetId)
  if (!sourceDatasetId || sourceDatasetId !== normalizeText(humanRegistry?.datasetId)) {
    throw new Error('Calibrated pet generation quality profile sourceDatasetId must match the loaded human review registry')
  }
  const reviewEvidenceRelativePath = createSafeRelativePath(raw.reviewEvidenceRelativePath)
  if (!reviewEvidenceRelativePath) {
    throw new Error('Calibrated pet generation quality profile requires a safe reviewEvidenceRelativePath')
  }
  const allowedTopLevelKeys = ['id', 'keyframe', 'reviewEvidenceRelativePath', 'row', 'sourceDatasetId', 'version']
  const topLevelKeys = Object.keys(raw).sort()
  if (topLevelKeys.join('\n') !== allowedTopLevelKeys.sort().join('\n')) {
    throw new Error(`Pet generation quality profile must contain exactly: ${allowedTopLevelKeys.join(', ')}`)
  }
  return deepFreeze({
    version: QUALITY_PROFILE_VERSION,
    id,
    sourceDatasetId,
    reviewEvidenceRelativePath,
    row: normalizeThresholdGroup({ groupName: 'row', value: raw.row }),
    keyframe: normalizeThresholdGroup({ groupName: 'keyframe', value: raw.keyframe })
  })
}

const createQualityProfileEvidence = (profile = DEFAULT_QUALITY_PROFILE) => Object.freeze({
  version: Number(profile?.version) || QUALITY_PROFILE_VERSION,
  id: normalizeText(profile?.id) || DEFAULT_QUALITY_PROFILE_ID,
  sourceDatasetId: normalizeText(profile?.sourceDatasetId)
})

module.exports = {
  DEFAULT_QUALITY_PROFILE_ID,
  QUALITY_FIRST_QUALITY_PROFILE_ID,
  PROFILE_LIMITS,
  QUALITY_PROFILE_VERSION,
  createQualityProfileEvidence,
  getDefaultQualityProfile,
  getQualityFirstQualityProfile,
  loadQualityProfile
}
