const crypto = require('node:crypto')

const { OFFICIAL_FULL_PET_ROWS } = require('./full-pet-row-contract')
const { expandMotionPreset, getDefaultMotionPresetId } = require('./action-semantics')
const { getSpriteLayout } = require('./action-sheet-layout')

const CHARACTER_CLASSES = new Set([
  'grounded-compact-character',
  'grounded-elongated-character',
  'floating-character'
])

const ACTION_CLASS_BY_ID = Object.freeze({
  idle: 'grounded-subtle-loop',
  'running-right': 'grounded-locomotion',
  waving: 'grounded-gesture',
  jumping: 'airborne-arc',
  failed: 'grounded-state-loop',
  waiting: 'grounded-subtle-loop',
  running: 'grounded-work-loop',
  review: 'grounded-state-loop'
})

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

const normalizeText = (value, fallback = '') => String(value == null ? fallback : value).trim()

const assertObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
}

const assertAllowedKeys = (value, allowed, label) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown field ${key}`)
  }
}

const normalizePositiveInteger = (value, fallback, label) => {
  const parsed = Number(value == null ? fallback : value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`)
  return parsed
}

const resolveAnchorPolicy = ({ assetClass, actionId }) => {
  if (actionId === 'jumping') return 'action-relative-root-v1'
  if (assetClass === 'floating-character') return 'floating-core-centroid-v1'
  if (assetClass === 'grounded-elongated-character') return 'elongated-envelope-root-v1'
  return 'compact-contact-root-v1'
}

const normalizeMotionParameters = (value) => {
  const source = value == null ? {} : value
  assertObject(source, 'motionParameters')
  assertAllowedKeys(source, new Set(['intensity', 'leadSide']), 'motionParameters')
  return {
    intensity: normalizeText(source.intensity, 'normal'),
    leadSide: normalizeText(source.leadSide, 'viewer-left')
  }
}

const normalizeCharacter = (value = {}) => {
  assertObject(value, 'character')
  assertAllowedKeys(value, new Set(['assetClass', 'view', 'renderingMedium', 'canonicalPose', 'identityLocks', 'bodyEffectPolicy']), 'character')
  const assetClass = normalizeText(value.assetClass, 'grounded-compact-character')
  if (!CHARACTER_CLASSES.has(assetClass)) throw new Error('character assetClass is invalid')
  const identityLocks = Array.isArray(value.identityLocks)
    ? value.identityLocks.map((entry) => normalizeText(entry)).filter(Boolean).slice(0, 24)
    : []
  const bodyEffectPolicy = normalizeText(value.bodyEffectPolicy, 'body-only')
  if (bodyEffectPolicy !== 'body-only') throw new Error('character bodyEffectPolicy is invalid')
  return {
    assetClass,
    view: normalizeText(value.view, 'source-matched'),
    renderingMedium: normalizeText(value.renderingMedium, 'source-matched'),
    canonicalPose: normalizeText(value.canonicalPose, 'neutral-full-body'),
    identityLocks,
    bodyEffectPolicy
  }
}

const normalizeAction = ({ input, character }) => {
  assertObject(input, 'action')
  assertAllowedKeys(input, new Set(['actionId', 'motionPresetId', 'motionParameters']), 'action')
  const actionId = normalizeText(input.actionId)
  const row = OFFICIAL_FULL_PET_ROWS.find((entry) => entry.id === actionId)
  if (!row || actionId === 'running-left') throw new Error(`action ${actionId || '(missing)'} is not a generated official action`)
  const motionPresetId = normalizeText(input.motionPresetId, getDefaultMotionPresetId(actionId))
  const motionParameters = normalizeMotionParameters(input.motionParameters)
  const expanded = expandMotionPreset({
    actionId,
    motionPresetId,
    motionParameters,
    frameCount: row.frameCount
  })
  const layout = getSpriteLayout(row.frameCount)
  const actionClass = ACTION_CLASS_BY_ID[actionId]
  const planAction = {
    actionId,
    frameCount: row.frameCount,
    layout,
    actionClass,
    anchorPolicy: resolveAnchorPolicy({ assetClass: character.assetClass, actionId }),
    scalePolicy: 'shared-character-profile',
    componentPolicy: 'reference-guided-body-v1',
    effectPolicy: 'forbid-detached-effects',
    loopPolicy: 'closed-loop',
    motionPresetId,
    motionParameters: expanded.motionParameters,
    framePlanVersion: 1,
    framePlan: expanded.framePlan,
    movingParts: expanded.movingParts,
    fixedParts: expanded.lockedParts,
    semanticChecks: expanded.semanticChecks,
    framePlanHash: expanded.hash
  }
  return deepFreeze(planAction)
}

const DEFAULT_BUDGETS = Object.freeze({
  requiredDistinctCanonicalCandidates: 3,
  maxCanonicalDispatches: 4,
  requiredDistinctInitialCandidatesPerAction: 2,
  maxDuplicateReplacementDispatchesPerAction: 1,
  maxRepairDispatchesPerAction: 1,
  maxEvaluationAttemptsPerArtifact: 2,
  maxPlannerCalls: 34,
  maxEvaluatorCalls: 68,
  maxProviderCalls: 72,
  maxElapsedMs: 43_200_000
})

const normalizeBudgets = (value = {}) => {
  assertObject(value, 'budgets')
  assertAllowedKeys(value, new Set(Object.keys(DEFAULT_BUDGETS)), 'budgets')
  const next = {}
  for (const [key, fallback] of Object.entries(DEFAULT_BUDGETS)) {
    next[key] = normalizePositiveInteger(value[key], fallback, `budgets.${key}`)
  }
  return next
}

const createSpriteAssetPlan = (input = {}) => {
  assertObject(input, 'sprite plan')
  assertAllowedKeys(input, new Set(['version', 'revision', 'character', 'canonical', 'actions', 'qualityProfile', 'budgets']), 'sprite plan')
  if (Number(input.version || 1) !== 1) throw new Error('sprite plan version is unsupported')
  const version = 1
  const revision = normalizePositiveInteger(input.revision, 1, 'sprite plan revision')
  const character = normalizeCharacter(input.character)
  const canonical = input.canonical == null ? {
    candidateCount: 3,
    maxDispatches: 4,
    canvas: { width: 1024, height: 1024 },
    targetOccupancyPercent: 72,
    safePaddingPercent: 12,
    rootAnchor: 'lower-center'
  } : input.canonical
  assertObject(canonical, 'canonical')
  assertAllowedKeys(canonical, new Set(['candidateCount', 'maxDispatches', 'canvas', 'targetOccupancyPercent', 'safePaddingPercent', 'rootAnchor']), 'canonical')
  if (Number(canonical.candidateCount) !== 3 || Number(canonical.maxDispatches) !== 4) throw new Error('canonical candidate budget is invalid')
  if (canonical.canvas?.width !== 1024 || canonical.canvas?.height !== 1024) throw new Error('canonical canvas is invalid')
  if (canonical.rootAnchor !== 'lower-center') throw new Error('canonical rootAnchor is invalid')
  const qualityProfile = input.qualityProfile == null ? { id: 'pet-generation-default-v2', sourceDatasetId: '' } : input.qualityProfile
  assertObject(qualityProfile, 'qualityProfile')
  assertAllowedKeys(qualityProfile, new Set(['id', 'sourceDatasetId']), 'qualityProfile')
  const rawActions = Array.isArray(input.actions) && input.actions.length
    ? input.actions
    : OFFICIAL_FULL_PET_ROWS.filter((row) => row.id !== 'running-left').map((row) => ({ actionId: row.id }))
  const seen = new Set()
  const actions = rawActions.map((action) => {
    const id = normalizeText(action?.actionId)
    if (seen.has(id)) throw new Error(`duplicate action ${id}`)
    seen.add(id)
    return normalizeAction({ input: action, character })
  })
  const budgets = normalizeBudgets(input.budgets)
  const base = {
    version,
    revision,
    character,
    canonical: {
      candidateCount: 3,
      maxDispatches: 4,
      canvas: { width: 1024, height: 1024 },
      targetOccupancyPercent: Number(canonical.targetOccupancyPercent),
      safePaddingPercent: Number(canonical.safePaddingPercent),
      rootAnchor: 'lower-center'
    },
    actions,
    qualityProfile: {
      id: normalizeText(qualityProfile.id, 'pet-generation-default-v2'),
      sourceDatasetId: normalizeText(qualityProfile.sourceDatasetId)
    },
    budgets
  }
  return deepFreeze({
    ...base,
    hash: crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex')
  })
}

module.exports = {
  ACTION_CLASS_BY_ID,
  CHARACTER_CLASSES,
  DEFAULT_BUDGETS,
  createSpriteAssetPlan,
  resolveAnchorPolicy
}
