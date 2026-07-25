const { callBridge } = require('./bridge-client')
const { appendRunLog } = require('./run-store')
const { FULL_PET_WORKFLOW_MAX_DURATION_MS } = require('./full-pet-workflow-contract')
const { areSpriteCandidatesDuplicates, runQualityFirstAction } = require('./quality-first-action-runner')
const { archiveCandidateRevision, writeCandidateRecord } = require('./sprite-candidate-store')
const { createQualityFirstFullPetOrchestrator } = require('./quality-first-full-pet-orchestrator')
const { createProviderImageTask } = require('./provider-image-task')
const { compileProviderImagePrompt } = require('./provider-image-prompt-compiler')
const { createSpriteAssetPlan } = require('./sprite-asset-plan')
const { createCharacterAnchorGrid } = require('./character-anchor-grid')
const { createActionReferenceBoard } = require('./action-reference-board')
const { processSpriteSheet } = require('./sprite-frame-processor')
const { createCharacterScaleProfile, measureBodyMask } = require('./character-scale-profile')
const { analyzeSpriteCandidate } = require('./sprite-candidate-qa')
const { createSpriteImageDescriptors } = require('./sprite-image-descriptor')
const {
  createActionEvaluatorBoard,
  createCanonicalEvaluatorBoard,
  createFinalPackageEvaluatorBoard
} = require('./hatch-pet-sprite-review-board')
const {
  buildActionSpriteReferenceBoard,
  buildAnchorReferenceBoard
} = require('./anchor-reference-board')
const {
  buildActionAnchorPrompt,
  buildActionKeyframePrompt,
  buildActionSpriteRowPrompt,
  buildCharacterAnchorPrompt
} = require('./anchor-prompt-builder')
const { buildOpenPetImagePrompt, sanitizeCreativeBrief } = require('./openpet-prompt-builder')
const { FIXTURE_BACKEND, PROVIDER_BACKEND, normalizeCreatorBackend } = require('./backend-mode')
const {
  averageIdentityDescriptors,
  createIdentityDescriptor,
  identityDescriptorDistance
} = require('./identity-descriptor')
const { getOfficialFullPetRow } = require('./full-pet-row-contract')
const {
  readActionCheckpoints,
  resolveReusableActionResult,
  writeActionCheckpoint
} = require('./full-pet-action-checkpoints')
const {
  removeOpaqueEdgeBackground,
  sanitizeNearTransparentPixels
} = require('./edge-background-cutout')
const { buildRealAtlasFromGeneratedImage, validateGeneratedImageOutput } = require('./real-atlas-builder')
const { createCreatorStudioMetadata, sha256, writeZip } = require('./fake-hatch-pet')
const { loadPetGenerationGovernance } = require('./pet-generation-governance')
const {
  createQualityProfileEvidence,
  getDefaultQualityProfile
} = require('./pet-generation-quality-profile')
const {
  DEFAULT_PROVIDER_ART_APPROVALS_PATH,
  loadProviderArtApprovals,
  resolveProviderArtReadiness
} = require('./provider-art-approval')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const DEFAULT_CONSTRAINTS = {
  width: 1024,
  height: 1024,
  transparent: true
}

const CREATOR_PROVIDER_MIN_TIMEOUT_MS = 300000
const PROMPT_PREVIEW_MAX_LENGTH = 8000
const DIRECT_SOURCE_ACTION_ANCHOR_CANDIDATE_COUNT = 3

const ACTION_ANCHOR_CANDIDATE_VARIANTS = Object.freeze([
  {
    id: 'source-faithful-key-pose',
    requestedChanges: ['preserve every visible face, eye, color, and marking detail while making the requested pose immediately readable']
  },
  {
    id: 'clean-cutout-motion-readable',
    requestedChanges: ['use a clean full-body silhouette with a strong readable action pose and an unchanged body root']
  },
  {
    id: 'identity-locked-desktop-sprite',
    requestedChanges: ['keep the full body centered with a stable lower-center root, exact material detail, and one obvious moving part']
  }
])

const safeUrlHost = (value) => {
  try {
    return new URL(String(value || '')).host
  } catch (_) {
    return ''
  }
}

const createSafeRelativePath = (value) => {
  const normalized = String(value || '').trim().replace(/\\/g, '/')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..')
  ) return ''
  return normalized
}

const createSafeFileSegment = (value, fallback = 'anchor') => {
  const normalized = String(value || '').trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || fallback
}

const normalizeModelName = (value) => String(value || '')
  .replace(/[\u0000-\u001F\u007F]/g, '')
  .trim()

const loadConfiguredProviderArtApprovals = () => loadProviderArtApprovals({
  registryPath: String(process.env.OPENPET_PROVIDER_ART_APPROVALS_PATH || '').trim() || DEFAULT_PROVIDER_ART_APPROVALS_PATH
})

const resolveProviderArtReadinessForModels = ({ settings, models, governance, approvals }) => {
  const provider = normalizeModelName(settings?.provider || 'openai-compatible')
  const normalizedModels = [...new Set(
    (Array.isArray(models) ? models : [models])
      .map(normalizeModelName)
      .filter(Boolean)
  )]
  const readinessByModel = normalizedModels.map((model) => resolveProviderArtReadiness({
    approvals,
    provider,
    model,
    qualityProfile: governance.qualityProfile,
    datasetId: governance.humanRegistry.datasetId
  }))
  const unapprovedModels = readinessByModel
    .filter((entry) => !entry.approved)
    .map((entry) => entry.model)
  if (readinessByModel.length === 0 || unapprovedModels.length > 0) {
    return Object.freeze({
      level: 'technical-chain-ready',
      approved: false,
      reason: readinessByModel.length === 0
        ? 'no-generation-model-evidence'
        : 'unapproved-generation-models',
      provider,
      models: Object.freeze(normalizedModels),
      unapprovedModels: Object.freeze(unapprovedModels),
      qualityProfileId: governance.qualityProfile.id,
      datasetId: governance.humanRegistry.datasetId
    })
  }
  const approvalIds = readinessByModel.map((entry) => entry.approvalId)
  const evidenceRelativePaths = readinessByModel.map((entry) => entry.evidenceRelativePath)
  return Object.freeze({
    level: 'production-art-ready',
    approved: true,
    provider,
    models: Object.freeze(normalizedModels),
    ...(approvalIds.length === 1 ? { approvalId: approvalIds[0] } : {}),
    approvalIds: Object.freeze(approvalIds),
    ...(evidenceRelativePaths.length === 1 ? { evidenceRelativePath: evidenceRelativePaths[0] } : {}),
    evidenceRelativePaths: Object.freeze(evidenceRelativePaths),
    qualityProfileId: governance.qualityProfile.id,
    datasetId: governance.humanRegistry.datasetId
  })
}

const getSuccessfulGenerationModels = ({ primaryModel = '', stages = [] } = {}) => [...new Set([
  normalizeModelName(primaryModel),
  ...(Array.isArray(stages) ? stages : [])
    .filter((stage) => stage?.ok !== false)
    .map((stage) => normalizeModelName(stage?.model))
].filter(Boolean))]

const buildHostPromptCandidateModels = ({ settings = {}, preferredModel = '' }) => {
  const candidates = []
  const seen = new Set()
  const addCandidate = (value) => {
    const model = normalizeModelName(value)
    const key = model.toLowerCase()
    if (!model || seen.has(key)) return
    seen.add(key)
    candidates.push(model)
  }
  addCandidate(preferredModel)
  const verifiedModels = new Set(
    (Array.isArray(settings?.creatorWorkflowModelPolicy?.verifiedModels)
      ? settings.creatorWorkflowModelPolicy.verifiedModels
      : [])
      .map((model) => normalizeModelName(model).toLowerCase())
      .filter(Boolean)
  )
  for (const fallbackModel of Array.isArray(settings?.creatorWorkflowModelPolicy?.fallbackModels)
    ? settings.creatorWorkflowModelPolicy.fallbackModels
    : []) {
    if (verifiedModels.has(normalizeModelName(fallbackModel).toLowerCase())) addCandidate(fallbackModel)
  }
  return candidates
}

const createReferenceImageFromRecord = ({ dataDir, record = {}, fallbackFileName = 'reference.png', fallbackRole = 'reference-image' }) => {
  const relativePath = createSafeRelativePath(record?.relativePath)
  if (!dataDir || !relativePath) return null
  const fileName = String(record?.fileName || path.basename(relativePath) || fallbackFileName).trim() || fallbackFileName
  return {
    path: path.join(dataDir, relativePath),
    fileName,
    relativePath,
    metadataRelativePath: createSafeRelativePath(record?.metadataRelativePath),
    sha256: String(record?.contentHash || record?.sha256 || '').trim(),
    role: String(record?.role || fallbackRole).trim() || fallbackRole
  }
}

const isUsableLocalReferenceImage = ({ dataDir, referenceImage }) => {
  const sourcePath = String(referenceImage?.path || '').trim()
  if (!dataDir || !sourcePath || !fs.existsSync(sourcePath)) return false
  try {
    const root = fs.realpathSync.native(path.resolve(dataDir))
    const source = fs.realpathSync.native(path.resolve(sourcePath))
    const relative = path.relative(root, source)
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(source).isFile()) return false
    const recordedSha256 = String(referenceImage?.sha256 || '').trim().toLowerCase()
    if (/^[a-f0-9]{64}$/.test(recordedSha256)) {
      const actualSha256 = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')
      if (actualSha256 !== recordedSha256) return false
    }
    return true
  } catch (_) {
    return false
  }
}

const resolveOriginalReferenceImage = ({ dataDir, run }) => {
  const referenceInput = run?.input?.referenceImage
  if (!referenceInput) return null
  return createReferenceImageFromRecord({
    dataDir,
    record: {
      ...referenceInput,
      fileName: referenceInput.fileName || referenceInput.originalFileName || 'canonical-reference.png',
      role: 'canonical-reference'
    },
    fallbackFileName: 'canonical-reference.png',
    fallbackRole: 'canonical-reference'
  })
}

const findActionAnchorRecord = ({ anchorReferences, actionId }) => {
  const normalizedActionId = String(actionId || '').trim()
  if (!normalizedActionId || !Array.isArray(anchorReferences?.actionAnchors)) return null
  return anchorReferences.actionAnchors.find((anchor) => String(anchor?.actionId || '').trim() === normalizedActionId) || null
}

const findFinalActionBoardRecord = ({ anchorReferences, actionId }) => {
  const normalizedActionId = String(actionId || '').trim()
  if (!normalizedActionId || !Array.isArray(anchorReferences?.finalActionBoards)) return null
  return anchorReferences.finalActionBoards.find((board) => String(board?.actionId || '').trim() === normalizedActionId) || null
}

const resolveAnchorReferenceCandidates = ({ run, stage = 'final', actionId = '' }) => {
  const anchorReferences = run?.artifacts?.anchorReferences
  if (!anchorReferences || typeof anchorReferences !== 'object') return []
  const characterAnchor = anchorReferences.characterAnchor || null
  const compositeBoard = anchorReferences.compositeBoard || null
  const actionAnchor = findActionAnchorRecord({ anchorReferences, actionId })
  const finalActionBoard = findFinalActionBoardRecord({ anchorReferences, actionId })
  if (stage === 'character-anchor') return [compositeBoard]
  if (stage === 'action-anchor') return [characterAnchor, compositeBoard]
  return [finalActionBoard, actionAnchor, characterAnchor, compositeBoard]
}

const resolveRunReferenceImages = ({ dataDir, run, stage = 'final', actionId = '' }) => {
  if (!dataDir || !run || typeof run !== 'object') return []
  const anchorReference = resolveAnchorReferenceCandidates({ run, stage, actionId })
    .map((record) => createReferenceImageFromRecord({
      dataDir,
      record,
      fallbackFileName: 'anchor-reference.png',
      fallbackRole: 'anchor-reference'
    }))
    .find((referenceImage) => isUsableLocalReferenceImage({ dataDir, referenceImage }))
  const originalReference = resolveOriginalReferenceImage({ dataDir, run })
  const resolved = anchorReference || (
    isUsableLocalReferenceImage({ dataDir, referenceImage: originalReference })
      ? originalReference
      : null
  )
  return resolved ? [resolved] : []
}

const resolveRequiredRunReferenceImages = ({ dataDir, run, stage = 'final', actionId = '' }) => {
  const references = resolveRunReferenceImages({ dataDir, run, stage, actionId })
  assertExactlyOneProviderReferenceImage(references)
  return references
}

const readHostModelSettings = async () => {
  try {
    const response = await callBridge('/creator/model-settings')
    return response.config || {}
  } catch (_) {
    return {}
  }
}

const requestHatchPetSpritePlan = async ({ runId, userIntent, budgetLedger = null } = {}) => {
  const response = await callBridge('/creator/hatch-pet/plan', {
    runId: String(runId || ''),
    userIntent: String(userIntent || ''),
    ...(budgetLedger ? { budgetLedger } : {})
  })
  if (!response?.result?.proposal) throw new Error('Hatch-pet sprite planner returned no proposal')
  return response.result
}

const requestHatchPetSpriteEvaluation = async ({ runId, scope, board, qa, budgetLedger = null } = {}) => {
  const response = await callBridge('/creator/hatch-pet/evaluate', {
    runId: String(runId || ''),
    scope: String(scope || ''),
    board: {
      relativePath: String(board?.relativePath || ''),
      sha256: String(board?.sha256 || ''),
      regions: Array.isArray(board?.regions) ? board.regions : []
    },
    qa: qa && typeof qa === 'object' ? qa : {},
    ...(budgetLedger ? { budgetLedger } : {})
  })
  if (!response?.result?.gate) throw new Error('Hatch-pet sprite evaluator returned no gate')
  return response.result
}

const resolveQualityFirstDataPath = ({ dataDir, relativePath, label }) => {
  const normalized = String(relativePath || '').trim().replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`${label} path is invalid`)
  }
  const root = path.resolve(dataDir)
  const target = path.resolve(root, normalized)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error(`${label} must stay inside the Creator Studio data directory`)
  }
  return target
}

const resolveQualityFirstInputPath = ({ dataDir, filePath, label }) => {
  const root = fs.realpathSync.native(path.resolve(dataDir))
  const target = path.resolve(String(filePath || ''))
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`${label} is missing`)
  const realTarget = fs.realpathSync.native(target)
  const relative = path.relative(root, realTarget)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the Creator Studio data directory`)
  }
  return realTarget
}

const evaluateQualityFirstFinalPackage = async ({
  dataDir,
  runId,
  sourcePath,
  canonicalPath,
  spritesheetPath,
  atlasQaPath,
  requestEvaluation = requestHatchPetSpriteEvaluation
} = {}) => {
  const safeSourcePath = resolveQualityFirstInputPath({ dataDir, filePath: sourcePath, label: 'Quality-first source' })
  const safeCanonicalPath = resolveQualityFirstInputPath({ dataDir, filePath: canonicalPath, label: 'Quality-first canonical' })
  const safeSpritesheetPath = resolveQualityFirstInputPath({ dataDir, filePath: spritesheetPath, label: 'Quality-first atlas' })
  const safeAtlasQaPath = resolveQualityFirstInputPath({ dataDir, filePath: atlasQaPath, label: 'Quality-first atlas QA' })
  const atlasQa = JSON.parse(fs.readFileSync(safeAtlasQaPath, 'utf8'))
  if (atlasQa?.ok !== true) {
    const error = new Error('Quality-first final package requires passing atlas QA')
    error.code = 'final_package_atlas_qa_failed'
    throw error
  }
  const actionReviewPath = resolveQualityFirstDataPath({
    dataDir,
    relativePath: atlasQa?.visualReview?.contactSheet,
    label: 'Quality-first action review'
  })
  const outputPath = path.join(dataDir, 'runs', String(runId || ''), 'evaluations', 'final-package-review-board.png')
  const board = await createFinalPackageEvaluatorBoard({
    sourcePath: safeSourcePath,
    canonicalPath: safeCanonicalPath,
    actionReviewPath,
    atlasPath: safeSpritesheetPath,
    outputPath
  })
  const evaluated = await requestEvaluation({
    runId,
    scope: 'final-package',
    board: {
      relativePath: path.relative(dataDir, board.path).replace(/\\/g, '/'),
      sha256: board.sha256,
      regions: board.regions
    },
    qa: {
      ok: true,
      failures: [],
      metrics: {
        atlasVisiblePixels: Math.max(0, Number(atlasQa.visiblePixels) || 0),
        availableActionCount: Array.isArray(atlasQa?.basicActions?.availableActionIds)
          ? atlasQa.basicActions.availableActionIds.length
          : 0
      }
    }
  })
  if (evaluated?.gate?.ok !== true) {
    const failures = Array.isArray(evaluated?.gate?.failures) ? evaluated.gate.failures.map(String).slice(0, 32) : ['final-package-visual-gate-failed']
    const error = new Error(`Quality-first final package visual gate failed: ${failures.join(', ')}`)
    error.code = 'final_package_visual_gate_failed'
    error.gate = evaluated?.gate || null
    error.evidenceRelativePath = String(evaluated?.evidenceRelativePath || '')
    throw error
  }
  return {
    gate: evaluated.gate,
    evidenceRelativePath: String(evaluated.evidenceRelativePath || '').replace(/\\/g, '/'),
    boardRelativePath: path.relative(dataDir, board.path).replace(/\\/g, '/'),
    boardSha256: board.sha256
  }
}

const createDefaultConditioningSummary = ({ model, referenceImages = [], promptCompiler = null }) => {
  assertExactlyOneProviderReferenceImage(referenceImages)
  return {
    mode: 'image-edit',
    endpoint: '/images/edits',
    referenceImageCount: 1,
    multipartImageField: 'image',
    requestedOutputCount: 1,
    ...(promptCompiler ? { promptCompiler } : {}),
    references: referenceImages.map((referenceImage) => ({
      fileName: referenceImage.fileName,
      relativePath: referenceImage.relativePath,
      metadataRelativePath: referenceImage.metadataRelativePath,
      role: referenceImage.role
    })),
    model: String(model || '')
  }
}

const createKeyframeSpriteRowConditioningSummary = ({ model, referenceImages = [], promptCompiler = null }) => {
  assertExactlyOneProviderReferenceImage(referenceImages)
  return {
    mode: 'image-edit',
    endpoint: '/images/edits',
    referenceImageCount: 1,
    multipartImageField: 'image',
    requestedOutputCount: 1,
    ...(promptCompiler ? { promptCompiler } : {}),
    references: referenceImages.map((referenceImage) => ({
      fileName: referenceImage.fileName,
      relativePath: referenceImage.relativePath,
      metadataRelativePath: referenceImage.metadataRelativePath,
      role: referenceImage.role
    })),
    model: String(model || '')
  }
}

const createPromptBuilderSummary = ({ promptBuild, promptPreviewText }) => ({
  version: promptBuild.promptBuilderVersion,
  mode: promptBuild.mode,
  actionId: promptBuild.actionId,
  sections: promptBuild.sections,
  warnings: promptBuild.warnings,
  ...(promptBuild.promptCompiler ? { promptCompiler: promptBuild.promptCompiler } : {}),
  promptPreview: {
    text: promptPreviewText.slice(0, PROMPT_PREVIEW_MAX_LENGTH),
    truncated: promptPreviewText.length > PROMPT_PREVIEW_MAX_LENGTH,
    maxLength: PROMPT_PREVIEW_MAX_LENGTH
  }
})

const createModelSnapshot = ({ backend, settings }) => {
  const normalizedBackend = normalizeCreatorBackend(backend, FIXTURE_BACKEND)
  if (normalizedBackend !== FIXTURE_BACKEND) {
    return {
      backend: PROVIDER_BACKEND,
      provider: String(settings.provider || 'openai-compatible'),
      model: String(settings.model || ''),
      baseUrlHost: safeUrlHost(settings.baseUrl)
    }
  }
  return {
    backend: FIXTURE_BACKEND,
    provider: FIXTURE_BACKEND,
    model: 'fixture-image'
  }
}

const listReferenceRoles = (referenceImages = []) => (
  Array.isArray(referenceImages)
    ? referenceImages.map((referenceImage) => String(referenceImage?.role || 'reference-image').trim() || 'reference-image')
    : []
)

const createProviderReferenceContractError = (code, message) => {
  const error = new Error(message)
  error.code = code
  return error
}

const assertExactlyOneProviderReferenceImage = (referenceImages = []) => {
  if (!Array.isArray(referenceImages) || referenceImages.length === 0) {
    throw createProviderReferenceContractError(
      'reference_image_required',
      'Creator Studio image generation requires exactly one local reference image'
    )
  }
  if (referenceImages.length !== 1) {
    throw createProviderReferenceContractError(
      'reference_image_count_invalid',
      'Creator Studio image generation requires exactly one local reference image; build one local reference image before calling the image service'
    )
  }
}

const sumAttemptDurationsMs = (attempts = []) => attempts.reduce((total, attempt) => (
  total + Math.max(0, Number(attempt?.durationMs) || 0)
), 0)

const resolveGenerationStageTimeout = ({ requestedTimeoutMs, deadlineMs = 0, nowMs = Date.now() }) => {
  const requested = Math.max(1, Number(requestedTimeoutMs) || CREATOR_PROVIDER_MIN_TIMEOUT_MS)
  if (!deadlineMs) return requested
  const remainingMs = Math.floor(Number(deadlineMs) - Number(nowMs))
  if (remainingMs <= 0) {
    throw new Error('Creator Studio generation exceeded the full-pet workflow time budget')
  }
  return Math.max(1, Math.min(requested, remainingMs))
}

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0))

const roundMetric = (value, digits = 4) => {
  const factor = 10 ** digits
  return Math.round((Number(value) || 0) * factor) / factor
}

const sha256File = (filePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(filePath))
  .digest('hex')

const collectQualityFirstCandidateArtifacts = ({ dataDir, candidate = {} } = {}) => {
  const artifacts = Array.isArray(candidate.artifacts) ? candidate.artifacts.slice() : []
  const seen = new Set(artifacts.map((artifact) => `${String(artifact?.role || '')}\n${path.resolve(String(artifact?.path || ''))}`))
  const append = (role, filePath) => {
    const absolute = path.resolve(String(filePath || ''))
    const relative = path.relative(path.resolve(String(dataDir || '')), absolute)
    if (!filePath || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return
    const key = `${role}\n${absolute}`
    if (seen.has(key)) return
    seen.add(key)
    artifacts.push({ role, path: absolute, sha256: sha256File(absolute) })
  }
  append('raw-sheet', candidate.rawPath)
  append('prompt', candidate.promptRelativePath ? path.join(dataDir, candidate.promptRelativePath) : '')
  append('evaluation-evidence', candidate.evaluationEvidenceRelativePath ? path.join(dataDir, candidate.evaluationEvidenceRelativePath) : '')
  append('evaluator-board', candidate.outputDir ? path.join(candidate.outputDir, 'evaluator-board.png') : '')
  return artifacts
}

const writeJsonFile = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const createGenerationAttemptRecord = ({
  model,
  ok,
  error = '',
  timeoutMs = 0,
  referenceImages = [],
  durationMs = 0,
  requestId = '',
  traceContext = null
}) => ({
  model: normalizeModelName(model),
  ok: Boolean(ok),
  timeoutMs: Math.max(0, Number(timeoutMs) || 0),
  durationMs: Math.max(0, Number(durationMs) || 0),
  referenceImageCount: Array.isArray(referenceImages) ? referenceImages.length : 0,
  referenceRoles: listReferenceRoles(referenceImages),
  ...(requestId ? { requestId: createSafeFileSegment(requestId, '') } : {}),
  ...(traceContext && typeof traceContext === 'object' ? { traceContext: {
    runId: createSafeFileSegment(traceContext.runId, ''),
    actionId: createSafeFileSegment(traceContext.actionId, ''),
    stage: createSafeFileSegment(traceContext.stage, ''),
    candidateId: createSafeFileSegment(traceContext.candidateId, '')
  } } : {}),
  ...(error ? { error: String(error).slice(0, 240) } : {})
})

const createProviderGenerationStage = ({
  stage,
  actionId = '',
  ok,
  referenceImages = [],
  timeoutMs = 0,
  durationMs = 0,
  model = '',
  modelAttempts = [],
  outputRelativePath = '',
  promptRelativePath = '',
  outputCount = 0,
  error = '',
  adopted = false,
  quality = null,
  qualityProfile = null
}) => {
  const referenceRoles = listReferenceRoles(referenceImages)
  const requestIds = Array.isArray(modelAttempts)
    ? [...new Set(modelAttempts.map((attempt) => String(attempt?.requestId || '')).filter(Boolean))]
    : []
  return {
    stage,
    ...(actionId ? { actionId } : {}),
    ok: Boolean(ok),
    referenceRole: referenceRoles[0] || '',
    referenceRoles,
    timeoutMs: Math.max(0, Number(timeoutMs) || 0),
    durationMs: Math.max(0, Number(durationMs) || 0),
    model: normalizeModelName(model),
    modelAttempts: Array.isArray(modelAttempts) ? modelAttempts : [],
    requestIds,
    outputRelativePath: createSafeRelativePath(outputRelativePath),
    promptRelativePath: createSafeRelativePath(promptRelativePath),
    outputCount: Math.max(0, Number(outputCount) || 0),
    ...(qualityProfile ? { qualityProfile: createQualityProfileEvidence(qualityProfile) } : {}),
    ...(adopted ? { adopted: true } : {}),
    ...(quality ? { quality } : {}),
    ...(error ? { error: String(error).slice(0, 240) } : {})
  }
}

const getProviderAnchorStages = (anchorGeneration = {}) => (
  Array.isArray(anchorGeneration?.stages)
    ? anchorGeneration.stages.filter((stage) => (
      stage?.stage === 'character-anchor' || stage?.stage === 'action-anchor'
    ))
    : []
)

const isFullPetRun = (run = {}) => String(run?.generationTask?.mode || run?.input?.generationTask?.mode || '').trim() === 'full-pet'

const isSingleActionRun = (run = {}) => String(run?.generationTask?.mode || run?.input?.generationTask?.mode || '').trim() === 'single-action'

const resolveCompiledPromptConstraints = (promptBuild = {}) => ({
  width: Number(promptBuild?.promptCompiler?.width) || DEFAULT_CONSTRAINTS.width,
  height: Number(promptBuild?.promptCompiler?.height) || DEFAULT_CONSTRAINTS.height,
  transparent: promptBuild?.promptCompiler?.backgroundStrategy === 'direct-transparent-output',
  backgroundStrategy: String(promptBuild?.promptCompiler?.backgroundStrategy || '').trim()
})

const callHostImageGenerate = ({
  expectedModel,
  prompt,
  promptCompiler,
  promptVariants = [],
  requestedTimeoutMs,
  referenceImages,
  runId,
  traceContext = null,
  dataRelativeDir,
  constraints = DEFAULT_CONSTRAINTS
}) => {
  assertExactlyOneProviderReferenceImage(referenceImages)
  return callBridge('/creator/model-image-generate', {
    runId: String(runId || ''),
    traceContext: {
      ...(traceContext && typeof traceContext === 'object' ? traceContext : {}),
      runId: String(runId || '')
    },
    expectedModel,
    prompt,
    promptCompiler,
    promptVariants,
    timeoutMs: requestedTimeoutMs,
    referenceImages,
    output: {
      dataRelativeDir
    },
    constraints
  })
}

const filterExistingGeneratedOutputs = ({ dataDir, outputs = [] }) => outputs.filter((output) => {
  const relativePath = createSafeRelativePath(output?.dataRelativePath)
  return Boolean(relativePath && fs.existsSync(path.join(dataDir, relativePath)))
})

const generateWithModelFallback = async ({
  settings = {},
  prompt,
  promptCompiler = null,
  constraints = DEFAULT_CONSTRAINTS,
  requestedTimeoutMs,
  referenceImages,
  runId,
  traceContext = null,
  dataRelativeDir,
  preferredModel,
  buildPromptForModel = null,
  callHostImageGenerateImpl = callHostImageGenerate
}) => {
  assertExactlyOneProviderReferenceImage(referenceImages)
  const startedAtMs = Date.now()
  const effectiveTimeoutMs = Math.max(1, Number(requestedTimeoutMs) || CREATOR_PROVIDER_MIN_TIMEOUT_MS)
  const candidateModels = buildHostPromptCandidateModels({ settings, preferredModel })
  const promptVariants = candidateModels.map((model, index) => {
    const promptBuild = typeof buildPromptForModel === 'function'
      ? buildPromptForModel(model)
      : index === 0
        ? { prompt, promptCompiler }
        : null
    if (!promptBuild) return null
    return {
      model,
      prompt: String(promptBuild.providerPrompt || promptBuild.prompt || '').trim(),
      promptCompiler: promptBuild.promptCompiler || null,
      constraints: promptBuild.promptCompiler ? resolveCompiledPromptConstraints(promptBuild) : { ...constraints }
    }
  }).filter((variant) => variant?.prompt)
  const primaryVariant = promptVariants.find((variant) => (
    normalizeModelName(variant.model).toLowerCase() === normalizeModelName(preferredModel).toLowerCase()
  )) || promptVariants[0] || { model: preferredModel, prompt, promptCompiler, constraints }
  try {
    const response = await callHostImageGenerateImpl({
      expectedModel: normalizeModelName(preferredModel),
      prompt: primaryVariant.prompt,
      promptCompiler: primaryVariant.promptCompiler,
      promptVariants,
      requestedTimeoutMs: effectiveTimeoutMs,
      referenceImages,
      runId,
      traceContext,
      dataRelativeDir,
      constraints: primaryVariant.constraints
    })
    const selectedModel = normalizeModelName(response?.result?.model) || normalizeModelName(preferredModel)
    const hostAttempts = Array.isArray(response?.result?.modelAttempts)
      ? response.result.modelAttempts.map((attempt) => createGenerationAttemptRecord({
          model: attempt?.model,
          ok: attempt?.ok,
          error: attempt?.error,
          timeoutMs: attempt?.timeoutMs,
          referenceImages,
          durationMs: attempt?.durationMs,
          requestId: attempt?.requestId || response?.result?.requestId,
          traceContext: attempt?.traceContext || response?.result?.traceContext || traceContext
        }))
      : []
    return {
      response,
      selectedModel,
      attempts: hostAttempts.length ? hostAttempts : [createGenerationAttemptRecord({
        model: selectedModel,
        ok: true,
        timeoutMs: effectiveTimeoutMs,
        referenceImages,
        durationMs: Date.now() - startedAtMs,
        requestId: response?.result?.requestId,
        traceContext: response?.result?.traceContext || traceContext
      })]
    }
  } catch (error) {
    if (error && typeof error === 'object') {
      error.modelAttempts = [createGenerationAttemptRecord({
        model: preferredModel,
        ok: false,
        error: error?.message || error,
        timeoutMs: effectiveTimeoutMs,
        referenceImages,
        durationMs: Date.now() - startedAtMs,
        requestId: error?.requestId,
        traceContext
      })]
    }
    throw error
  }
}

const writeAnchorPromptFile = ({ dataDir, relativePath, prompt }) => {
  const safeRelativePath = createSafeRelativePath(relativePath)
  if (!safeRelativePath) throw new Error('Creator Studio anchor prompt path is invalid')
  const promptPath = path.join(dataDir, safeRelativePath)
  fs.mkdirSync(path.dirname(promptPath), { recursive: true })
  fs.writeFileSync(promptPath, `${String(prompt || '').trim()}\n`)
  return {
    path: promptPath,
    relativePath: safeRelativePath
  }
}

const getFirstExistingOutput = ({ dataDir, response }) => {
  const outputs = filterExistingGeneratedOutputs({
    dataDir,
    outputs: Array.isArray(response?.result?.outputs) ? response.result.outputs : []
  })
  return outputs[0] || null
}

const createCandidateFileSegment = (index, candidateId) => (
  `${String(index + 1).padStart(2, '0')}-${createSafeFileSegment(candidateId, `candidate-${index + 1}`)}`
)

const distanceRgb = (a = {}, b = {}) => {
  const dr = (Number(a.r) || 0) - (Number(b.r) || 0)
  const dg = (Number(a.g) || 0) - (Number(b.g) || 0)
  const db = (Number(a.b) || 0) - (Number(b.b) || 0)
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db))
}

const readImageMaskMetrics = async (filePath) => {
  const decoded = await sharp(filePath)
    .ensureAlpha()
    .resize({
      width: 256,
      height: 256,
      fit: 'inside',
      withoutEnlargement: true
    })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { data, info } = decoded
  const width = Number(info.width) || 0
  const height = Number(info.height) || 0
  const totalPixels = width * height
  if (!width || !height || totalPixels <= 0) {
    return {
      width,
      height,
      visiblePixels: 0,
      coverage: 0,
      edgeRatio: 1,
      minPaddingRatio: 0,
      centerOffsetRatio: 1,
      meanRgb: { r: 0, g: 0, b: 0 },
      bounds: null
    }
  }

  let alphaVisiblePixels = 0
  const edgeSample = { r: 0, g: 0, b: 0, count: 0 }
  const edgeWidth = Math.max(2, Math.round(Math.min(width, height) * 0.02))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = ((y * width) + x) * 4
      const alpha = data[index + 3]
      if (alpha > 24) alphaVisiblePixels += 1
      const onEdge = x < edgeWidth || y < edgeWidth || x >= width - edgeWidth || y >= height - edgeWidth
      if (onEdge && alpha > 24) {
        edgeSample.r += data[index]
        edgeSample.g += data[index + 1]
        edgeSample.b += data[index + 2]
        edgeSample.count += 1
      }
    }
  }
  const hasUsefulTransparency = alphaVisiblePixels < totalPixels * 0.96
  const edgeMean = edgeSample.count > 0
    ? {
        r: edgeSample.r / edgeSample.count,
        g: edgeSample.g / edgeSample.count,
        b: edgeSample.b / edgeSample.count
      }
    : { r: 255, g: 255, b: 255 }
  const useAlphaMask = hasUsefulTransparency

  let visiblePixels = 0
  let edgePixels = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let sumX = 0
  let sumY = 0
  const rgb = { r: 0, g: 0, b: 0 }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = ((y * width) + x) * 4
      const alpha = data[index + 3]
      if (alpha <= 24) continue
      const isForeground = useAlphaMask || distanceRgb({
        r: data[index],
        g: data[index + 1],
        b: data[index + 2]
      }, edgeMean) > 28
      if (!isForeground) continue
      visiblePixels += 1
      sumX += x
      sumY += y
      rgb.r += data[index]
      rgb.g += data[index + 1]
      rgb.b += data[index + 2]
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (x < edgeWidth || y < edgeWidth || x >= width - edgeWidth || y >= height - edgeWidth) {
        edgePixels += 1
      }
    }
  }

  if (visiblePixels < totalPixels * 0.01 && !useAlphaMask && alphaVisiblePixels > 0) {
    return readImageMaskMetricsFromAlpha({ data, width, height, totalPixels, edgeWidth })
  }

  if (visiblePixels <= 0) {
    return {
      width,
      height,
      visiblePixels: 0,
      coverage: 0,
      edgeRatio: 1,
      minPaddingRatio: 0,
      centerOffsetRatio: 1,
      meanRgb: { r: 0, g: 0, b: 0 },
      bounds: null
    }
  }

  const boundsWidth = maxX - minX + 1
  const boundsHeight = maxY - minY + 1
  const centroidX = sumX / visiblePixels
  const centroidY = sumY / visiblePixels
  const targetCenterX = width * 0.5
  const targetCenterY = height * 0.54
  const centerOffsetRatio = Math.sqrt(
    ((centroidX - targetCenterX) / width) ** 2 +
    ((centroidY - targetCenterY) / height) ** 2
  )
  const minPadding = Math.min(minX, minY, width - maxX - 1, height - maxY - 1)
  return {
    width,
    height,
    visiblePixels,
    coverage: visiblePixels / totalPixels,
    edgeRatio: edgePixels / visiblePixels,
    minPaddingRatio: minPadding / Math.min(width, height),
    centerOffsetRatio,
    meanRgb: {
      r: rgb.r / visiblePixels,
      g: rgb.g / visiblePixels,
      b: rgb.b / visiblePixels
    },
    bounds: {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: boundsWidth,
      height: boundsHeight,
      centroidX,
      centroidY
    },
    identityDescriptor: createIdentityDescriptor({
      data,
      info,
      bounds: { left: minX, top: minY, right: maxX, bottom: maxY, width: boundsWidth, height: boundsHeight },
      alphaThreshold: 24
    })
  }
}

const inspectImageAlpha = async (sourceInput) => {
  const decoded = await sharp(sourceInput)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixelCount = decoded.info.width * decoded.info.height
  let transparentPixels = 0
  let opaquePixels = 0
  for (let index = 3; index < decoded.data.length; index += decoded.info.channels) {
    const alpha = decoded.data[index]
    if (alpha <= 24) transparentPixels += 1
    if (alpha >= 250) opaquePixels += 1
  }
  return {
    pixelCount,
    transparentPixels,
    opaquePixels,
    fullyOpaque: pixelCount > 0 && opaquePixels === pixelCount
  }
}

const prepareGeneratedKeyframeOutput = async (filePath) => {
  const before = await inspectImageAlpha(filePath)
  const backgroundRemoval = await removeOpaqueEdgeBackground(filePath)
  const sanitized = await sanitizeNearTransparentPixels(backgroundRemoval?.buffer || filePath)
  fs.writeFileSync(filePath, sanitized)
  const after = await inspectImageAlpha(filePath)
  const safe = !before.fullyOpaque || after.transparentPixels > 0
  return {
    safe,
    backgroundRemoved: Boolean(backgroundRemoval?.removed),
    backgroundRemovedPixelRatio: roundMetric(backgroundRemoval?.removedPixelRatio, 6),
    wasFullyOpaque: before.fullyOpaque,
    transparentPixelRatio: roundMetric(
      after.pixelCount > 0 ? after.transparentPixels / after.pixelCount : 0,
      6
    ),
    failureCondition: safe ? '' : 'background-not-safely-removable'
  }
}

const readImageMaskMetricsFromAlpha = ({ data, width, height, totalPixels, edgeWidth }) => {
  let visiblePixels = 0
  let edgePixels = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let sumX = 0
  let sumY = 0
  const rgb = { r: 0, g: 0, b: 0 }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = ((y * width) + x) * 4
      const alpha = data[index + 3]
      if (alpha <= 24) continue
      visiblePixels += 1
      sumX += x
      sumY += y
      rgb.r += data[index]
      rgb.g += data[index + 1]
      rgb.b += data[index + 2]
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (x < edgeWidth || y < edgeWidth || x >= width - edgeWidth || y >= height - edgeWidth) {
        edgePixels += 1
      }
    }
  }
  if (visiblePixels <= 0) {
    return {
      width,
      height,
      visiblePixels: 0,
      coverage: 0,
      edgeRatio: 1,
      minPaddingRatio: 0,
      centerOffsetRatio: 1,
      meanRgb: { r: 0, g: 0, b: 0 },
      bounds: null
    }
  }
  const centroidX = sumX / visiblePixels
  const centroidY = sumY / visiblePixels
  const minPadding = Math.min(minX, minY, width - maxX - 1, height - maxY - 1)
  return {
    width,
    height,
    visiblePixels,
    coverage: visiblePixels / totalPixels,
    edgeRatio: edgePixels / visiblePixels,
    minPaddingRatio: minPadding / Math.min(width, height),
    centerOffsetRatio: Math.sqrt(
      ((centroidX - (width * 0.5)) / width) ** 2 +
      ((centroidY - (height * 0.54)) / height) ** 2
    ),
    meanRgb: {
      r: rgb.r / visiblePixels,
      g: rgb.g / visiblePixels,
      b: rgb.b / visiblePixels
    },
    bounds: {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      centroidX,
      centroidY
    },
    identityDescriptor: createIdentityDescriptor({
      data,
      info: { width, height, channels: 4 },
      bounds: {
        left: minX,
        top: minY,
        right: maxX,
        bottom: maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      },
      alphaThreshold: 24
    })
  }
}

const shouldAllowWideActionAnchor = (action = {}) => {
  const text = [
    action?.actionId,
    action?.name,
    action?.motionPrompt,
    action?.animationType
  ].map((value) => String(value || '').toLowerCase()).join(' ')
  return /\b(lying|lie|sleep|rest|stretch|crouch|loaf|roll|crawl)\b/.test(text)
}

const scoreActionAnchorMetrics = ({
  metrics,
  referenceMetrics,
  action = {},
  qualityProfile = getDefaultQualityProfile()
}) => {
  if (!metrics || !metrics.visiblePixels) return 0
  let score = 100
  const coverage = Number(metrics.coverage) || 0
  if (coverage > 0.58) score -= 10 + ((coverage - 0.58) * 145)
  if (coverage < 0.08) score -= 14 + ((0.08 - coverage) * 180)
  score -= Math.min(36, (Number(metrics.edgeRatio) || 0) * 620)
  if ((Number(metrics.minPaddingRatio) || 0) < 0.035) {
    score -= 10 + ((0.035 - (Number(metrics.minPaddingRatio) || 0)) * 520)
  }
  score -= Math.min(24, (Number(metrics.centerOffsetRatio) || 0) * 120)
  if (referenceMetrics?.visiblePixels) {
    score -= Math.min(30, (distanceRgb(metrics.meanRgb, referenceMetrics.meanRgb) / 441.7) * 34)
    const descriptorDistance = identityDescriptorDistance(metrics.identityDescriptor, referenceMetrics.identityDescriptor)
    if (descriptorDistance > qualityProfile.keyframe.maxIdentityDescriptorDistance) {
      score -= Math.min(100, 55 + (descriptorDistance - qualityProfile.keyframe.maxIdentityDescriptorDistance))
    }
  }
  const boundsWidth = Number(metrics.bounds?.width) || 0
  const boundsHeight = Number(metrics.bounds?.height) || 0
  const aspectRatio = boundsWidth > 0 && boundsHeight > 0 ? boundsWidth / boundsHeight : 1
  if (!shouldAllowWideActionAnchor(action) && aspectRatio > 1.08) {
    score -= Math.min(48, 18 + ((aspectRatio - 1.08) * 70))
    const imageHeight = Number(metrics.height) || 0
    const boundsHeightRatio = imageHeight > 0 ? boundsHeight / imageHeight : 0
    if (boundsHeightRatio > 0 && boundsHeightRatio < 0.68) {
      score -= Math.min(25, 8 + ((0.68 - boundsHeightRatio) * 70))
    }
  }
  return clampNumber(score, 0, 100)
}

const summarizeActionAnchorMetrics = (metrics = {}) => {
  const value = metrics && typeof metrics === 'object' ? metrics : {}
  return {
    width: Math.max(0, Number(value.width) || 0),
    height: Math.max(0, Number(value.height) || 0),
    visiblePixels: Math.max(0, Number(value.visiblePixels) || 0),
    coverage: roundMetric(value.coverage),
    edgeRatio: roundMetric(value.edgeRatio),
    minPaddingRatio: roundMetric(value.minPaddingRatio),
    centerOffsetRatio: roundMetric(value.centerOffsetRatio),
    meanRgb: {
      r: Math.round(Number(value.meanRgb?.r) || 0),
      g: Math.round(Number(value.meanRgb?.g) || 0),
      b: Math.round(Number(value.meanRgb?.b) || 0)
    },
    identityDescriptor: value.identityDescriptor
      ? {
          aspectRatio: roundMetric(value.identityDescriptor.aspectRatio),
          regions: Array.isArray(value.identityDescriptor.regions)
            ? value.identityDescriptor.regions.map((region) => ({
                r: Math.round(Number(region?.r) || 0),
                g: Math.round(Number(region?.g) || 0),
                b: Math.round(Number(region?.b) || 0)
              }))
            : []
        }
      : null,
    bounds: value.bounds
      ? {
          left: Math.round(Number(value.bounds.left) || 0),
          top: Math.round(Number(value.bounds.top) || 0),
          right: Math.round(Number(value.bounds.right) || 0),
          bottom: Math.round(Number(value.bounds.bottom) || 0),
          width: Math.round(Number(value.bounds.width) || 0),
          height: Math.round(Number(value.bounds.height) || 0),
          centroidX: roundMetric(value.bounds.centroidX, 2),
          centroidY: roundMetric(value.bounds.centroidY, 2)
        }
      : null
  }
}

const evaluateActionKeyframeQuality = ({
  metrics,
  referenceMetrics,
  action = {},
  backgroundPreparation = { safe: true },
  qualityProfile = getDefaultQualityProfile()
}) => {
  const keyframeLimits = qualityProfile.keyframe
  const rawScore = scoreActionAnchorMetrics({ metrics, referenceMetrics, action, qualityProfile })
  const identityColorDistance = referenceMetrics?.visiblePixels
    ? distanceRgb(metrics?.meanRgb, referenceMetrics.meanRgb)
    : 0
  const descriptorDistance = referenceMetrics?.visiblePixels
    ? identityDescriptorDistance(metrics?.identityDescriptor, referenceMetrics.identityDescriptor)
    : 0
  const compositionFailures = []
  if (!backgroundPreparation?.safe) compositionFailures.push(
    backgroundPreparation?.failureCondition || 'background-not-safely-removable'
  )
  if (!metrics?.visiblePixels) compositionFailures.push('no-visible-pixels')
  if (Number(metrics?.coverage) < 0.03) compositionFailures.push('coverage-low')
  if (Number(metrics?.coverage) > 0.75) compositionFailures.push('coverage-high')
  if (Number(metrics?.edgeRatio) > 0.015) compositionFailures.push('edge-ratio-high')
  if (Number(metrics?.minPaddingRatio) < 0.01) compositionFailures.push('padding-low')
  if (Number(metrics?.centerOffsetRatio) > 0.35) compositionFailures.push('center-offset-high')
  const identityFailures = []
  if (identityColorDistance > keyframeLimits.maxIdentityMeanRgbDistance) identityFailures.push('identity-color-distance-high')
  if (descriptorDistance > keyframeLimits.maxActionIdentityDescriptorDistance) {
    identityFailures.push('identity-descriptor-distance-high')
  }
  const scoreFailures = rawScore < keyframeLimits.minActionKeyframeScore
    ? ['raw-score-below-minimum']
    : []
  const safeComposition = compositionFailures.length === 0
  const identityConsistent = identityFailures.length === 0
  const score = safeComposition && identityConsistent ? rawScore : 0
  const failureConditions = [...new Set([
    ...compositionFailures,
    ...identityFailures,
    ...scoreFailures
  ])]
  return {
    ok: failureConditions.length === 0 && score >= keyframeLimits.minActionKeyframeScore,
    score: roundMetric(score, 2),
    rawScore: roundMetric(rawScore, 2),
    safeComposition,
    identityConsistent,
    identityColorDistance: roundMetric(identityColorDistance, 2),
    identityDescriptorDistance: roundMetric(descriptorDistance, 2),
    maxIdentityDescriptorDistance: keyframeLimits.maxActionIdentityDescriptorDistance,
    minAcceptableScore: keyframeLimits.minActionKeyframeScore,
    qualityProfile: createQualityProfileEvidence(qualityProfile),
    failureConditions,
    backgroundPreparation,
    metrics: summarizeActionAnchorMetrics(metrics),
    ...(referenceMetrics ? { referenceMetrics: summarizeActionAnchorMetrics(referenceMetrics) } : {})
  }
}

const createAnchorRecordFromOutput = ({ output, role, actionId = '', promptRelativePath = '', model = '', modelAttempts = [] }) => {
  const relativePath = createSafeRelativePath(output?.dataRelativePath)
  if (!relativePath) return null
  return {
    ...(actionId ? { actionId } : {}),
    role,
    relativePath,
    fileName: path.basename(relativePath),
    promptRelativePath: createSafeRelativePath(promptRelativePath),
    model: normalizeModelName(model),
    modelAttempts,
    ...(output?.mimeType ? { mimeType: String(output.mimeType) } : {}),
    ...(output?.sha256 ? { sha256: String(output.sha256) } : {})
  }
}

const resolveAnchorCharacterBrief = (run = {}) => sanitizeCreativeBrief(
  run?.generationTask?.characterBrief ||
  run?.input?.generationTask?.characterBrief ||
  run?.input?.originalPrompt ||
  run?.input?.prompt ||
  run?.petId ||
  'reusable full-body desktop character'
)

const resolveProviderAppearanceIntent = (run = {}) => {
  const characterBrief = String(
    run?.generationTask?.characterBrief ||
    run?.input?.generationTask?.characterBrief ||
    ''
  ).trim()
  return characterBrief ? [characterBrief] : []
}

const getRunActions = (run = {}) => {
  if (Array.isArray(run?.generationTask?.actions)) return run.generationTask.actions
  if (Array.isArray(run?.input?.generationTask?.actions)) return run.input.generationTask.actions
  return []
}

const shouldGenerateActionAnchors = (run = {}) => {
  const mode = String(run?.generationTask?.mode || run?.input?.generationTask?.mode || '').trim()
  return mode === 'single-action'
}

const isCanonicalFrameAction = (action = {}) => String(action?.synthesisMode || '').trim() === 'canonical-frame'

const shouldUseDirectSourceBoardForActionAnchor = (action = {}) => isCanonicalFrameAction(action)

const shouldSkipCharacterAnchorForActions = (run = {}) => {
  if (!shouldGenerateActionAnchors(run)) return false
  const actions = getRunActions(run)
  return actions.length > 0 && actions.every((action) => shouldUseDirectSourceBoardForActionAnchor(action))
}

const createCanonicalProviderOnlyAnchorReferences = () => ({
  version: 1,
  sourcePriority: 'image-first',
  compositeBoard: null,
  characterAnchor: null,
  actionAnchors: [],
  finalActionBoards: []
})

const createKeyframeRecordFromOutput = ({
  output,
  actionId = '',
  keyframeRole = 'start',
  promptRelativePath = '',
  model = '',
  modelAttempts = [],
  quality = null
}) => {
  const relativePath = createSafeRelativePath(output?.dataRelativePath)
  if (!relativePath) return null
  const normalizedKeyframeRole = String(keyframeRole || 'start').trim().toLowerCase() === 'start'
    ? 'start'
    : 'peak'
  const role = normalizedKeyframeRole === 'start'
    ? 'action-start-keyframe'
    : 'action-peak-keyframe'
  return {
    ...(actionId ? { actionId } : {}),
    keyframeRole: normalizedKeyframeRole,
    role,
    relativePath,
    fileName: path.basename(relativePath),
    promptRelativePath: createSafeRelativePath(promptRelativePath),
    model: normalizeModelName(model),
    modelAttempts,
    ...(quality ? { quality } : {}),
    ...(output?.mimeType ? { mimeType: String(output.mimeType) } : {}),
    ...(output?.sha256 ? { sha256: String(output.sha256) } : {})
  }
}

const createOutputFromGeneratedPath = ({ dataDir, output }) => {
  const relativePath = createSafeRelativePath(output?.dataRelativePath)
  if (!relativePath) return null
  const outputPath = path.join(dataDir, relativePath)
  if (!fs.existsSync(outputPath)) return null
  return {
    dataRelativePath: relativePath,
    mimeType: String(output?.mimeType || 'image/png'),
    sha256: output?.sha256 || sha256File(outputPath)
  }
}

const createFailedActionKeyframeCandidateQuality = (
  error,
  qualityProfile = getDefaultQualityProfile()
) => ({
  ok: false,
  score: 0,
  rawScore: 0,
  safeComposition: false,
  identityConsistent: false,
  identityColorDistance: 0,
  identityDescriptorDistance: 0,
  maxIdentityDescriptorDistance: qualityProfile.keyframe.maxActionIdentityDescriptorDistance,
  minAcceptableScore: qualityProfile.keyframe.minActionKeyframeScore,
  qualityProfile: createQualityProfileEvidence(qualityProfile),
  failureConditions: ['candidate-processing-failed'],
  backgroundPreparation: null,
  metrics: summarizeActionAnchorMetrics(),
  error: String(error?.message || error || 'Candidate processing failed').slice(0, 240)
})

const createActionKeyframeCandidateSelection = ({ candidates, selectedCandidateIndex = -1 }) => ({
  version: 1,
  mode: 'single-provider-response-quality-selection',
  candidateCount: candidates.length,
  selectedCandidateIndex,
  candidates: candidates.map((candidate) => ({
    candidateIndex: candidate.candidateIndex,
    outputRelativePath: createSafeRelativePath(candidate.output?.dataRelativePath),
    selected: candidate.candidateIndex === selectedCandidateIndex,
    quality: candidate.quality
  }))
})


const SOFT_IDENTITY_DESCRIPTOR_RETRY_BAND = Object.freeze({
  minExclusive: 70,
  maxInclusive: 80
})

const isSoftIdentityDescriptorRetryEligible = (quality = null) => {
  if (!quality || quality.ok === true) return false
  if (quality.safeComposition === false) return false
  const failures = Array.isArray(quality.failureConditions) ? quality.failureConditions : []
  if (!failures.includes('identity-descriptor-distance-high')) return false
  if (failures.includes('raw-score-below-minimum')) return false
  if (failures.includes('identity-color-distance-high')) return false
  const distance = Number(quality.identityDescriptorDistance)
  if (!Number.isFinite(distance)) return false
  return distance > SOFT_IDENTITY_DESCRIPTOR_RETRY_BAND.minExclusive &&
    distance <= SOFT_IDENTITY_DESCRIPTOR_RETRY_BAND.maxInclusive
}

const createSoftIdentityRetryRequestedChanges = ({
  action = {},
  keyframeRole = 'start',
  quality = null
} = {}) => {
  const actionLabel = String(action?.name || action?.actionId || 'the action').trim() || 'the action'
  const roleLabel = String(keyframeRole || 'start').trim().toLowerCase() === 'peak' ? 'peak' : 'start'
  const distance = Number(quality?.identityDescriptorDistance)
  const distanceHint = Number.isFinite(distance)
    ? ` The previous candidate was only mildly off identity (descriptor distance about ${distance.toFixed(1)}).`
    : ''
  return [
    `Retry the ${roleLabel} pose for ${actionLabel} with a stronger identity lock against the attached reference.`,
    'Preserve the exact face, eyes, markings, colors, accessories, silhouette volume, body proportions, and character scale from the identity reference.',
    'Keep the same lower-center root and foot baseline; stay in place with no cross-cell translation.',
    `Only adjust the requested ${roleLabel} pose mechanics; do not redesign the character.${distanceHint}`
  ]
}

const generateActionKeyframe = async ({
  dataDir,
  run,
  settings,
  selectedModel,
  requestedTimeoutMs,
  action,
  keyframeRole = 'start',
  referenceImages = [],
  qualityReferenceImages = referenceImages,
  generationDeadlineMs = 0,
  qualityProfile = getDefaultQualityProfile(),
  qualityGuidance = null,
  generateWithFallbackImpl = generateWithModelFallback,
  evaluateActionKeyframeQualityImpl = evaluateActionKeyframeQuality
}) => {
  const normalizedKeyframeRole = String(keyframeRole || 'start').trim().toLowerCase() === 'start'
    ? 'start'
    : 'peak'
  assertExactlyOneProviderReferenceImage(referenceImages)
  const actionId = createSafeFileSegment(action?.actionId, 'action')
  const stageName = normalizedKeyframeRole === 'start'
    ? 'action-start-keyframe'
    : 'action-peak-keyframe'
  const promptBuild = buildActionKeyframePrompt({
    appearanceIntent: resolveProviderAppearanceIntent(run),
    referenceRole: listReferenceRoles(referenceImages).join(', ') || 'canonical-reference',
    action,
    keyframeRole: normalizedKeyframeRole,
    qualityGuidance,
    canvas: DEFAULT_CONSTRAINTS
  })
  const promptFile = writeAnchorPromptFile({
    dataDir,
    relativePath: path.join(
      'runs',
      run.runId,
      'prompts',
      'keyframes',
      'actions',
      `${actionId}-${normalizedKeyframeRole}-keyframe.md`
    ).replace(/\\/g, '/'),
    prompt: promptBuild.prompt
  })
  let stageTimeoutMs = Math.max(1, Number(requestedTimeoutMs) || CREATOR_PROVIDER_MIN_TIMEOUT_MS)
  let attempt = null
  let materializedOutput = null
  let quality = null
  let keyframe = null
  let candidateSelection = null
  let candidateCount = 0
  let selectedPromptRelativePath = promptFile.relativePath
  let selectedPromptCompiler = promptBuild.promptCompiler
  try {
    stageTimeoutMs = resolveGenerationStageTimeout({ requestedTimeoutMs, deadlineMs: generationDeadlineMs })
    attempt = await generateWithFallbackImpl({
      settings,
      preferredModel: selectedModel,
      model: selectedModel,
      prompt: promptBuild.prompt,
      promptCompiler: promptBuild.promptCompiler,
      constraints: resolveCompiledPromptConstraints(promptBuild),
      requestedTimeoutMs: stageTimeoutMs,
      referenceImages,
      runId: run.runId,
      traceContext: { runId: run.runId, actionId, stage: stageName },
      dataRelativeDir: path.join(
        'runs',
        run.runId,
        'keyframes',
        'actions',
        `${actionId}-${normalizedKeyframeRole}-keyframe`
      ).replace(/\\/g, '/')
    })
    const outputs = filterExistingGeneratedOutputs({
      dataDir,
      outputs: Array.isArray(attempt.response?.result?.outputs) ? attempt.response.result.outputs : []
    })
    candidateCount = outputs.length
    if (!outputs.length) throw new Error(`Creator Studio ${normalizedKeyframeRole} keyframe generation returned no outputs for ${actionId}`)
    const referencePath = String((qualityReferenceImages[0] || referenceImages[0])?.path || '').trim()
    const referenceMetrics = referencePath && fs.existsSync(referencePath)
      ? await readImageMaskMetrics(referencePath)
      : null
    const candidates = []
    for (const [candidateIndex, output] of outputs.entries()) {
      const candidateOutput = createOutputFromGeneratedPath({ dataDir, output })
      if (!candidateOutput) continue
      try {
        const candidatePath = path.join(dataDir, candidateOutput.dataRelativePath)
        const backgroundPreparation = await prepareGeneratedKeyframeOutput(candidatePath)
        candidateOutput.sha256 = sha256File(candidatePath)
        const metrics = await readImageMaskMetrics(candidatePath)
        candidates.push({
          candidateIndex,
          output: candidateOutput,
          quality: evaluateActionKeyframeQualityImpl({
            metrics,
            referenceMetrics,
            action,
            backgroundPreparation,
            qualityProfile
          })
        })
      } catch (error) {
        candidates.push({
          candidateIndex,
          output: candidateOutput,
          quality: createFailedActionKeyframeCandidateQuality(error, qualityProfile)
        })
      }
    }
    if (!candidates.length) throw new Error(`Creator Studio ${normalizedKeyframeRole} keyframe output was not materialized for ${actionId}`)
    const passingCandidates = candidates
      .filter((candidate) => candidate.quality.ok)
      .sort((left, right) => Number(right.quality.score) - Number(left.quality.score))
    let selectedCandidate = passingCandidates[0] || null
    let diagnosticCandidate = selectedCandidate || [...candidates]
      .sort((left, right) => Number(right.quality.rawScore) - Number(left.quality.rawScore))[0]
    materializedOutput = diagnosticCandidate.output
    quality = diagnosticCandidate.quality
    candidateSelection = createActionKeyframeCandidateSelection({
      candidates,
      selectedCandidateIndex: selectedCandidate?.candidateIndex ?? -1
    })
    keyframe = createKeyframeRecordFromOutput({
      output: materializedOutput,
      actionId,
      keyframeRole: normalizedKeyframeRole,
      promptRelativePath: selectedPromptRelativePath,
      promptCompiler: selectedPromptCompiler,
      model: attempt.selectedModel,
      modelAttempts: attempt.attempts,
      quality
    })
    keyframe.candidateSelection = candidateSelection
    if (!selectedCandidate && isSoftIdentityDescriptorRetryEligible(diagnosticCandidate?.quality)) {
      const softRetryPromptBuild = buildActionKeyframePrompt({
        appearanceIntent: resolveProviderAppearanceIntent(run),
        referenceRole: listReferenceRoles(referenceImages).join(', ') || 'canonical-reference',
        action,
        keyframeRole: normalizedKeyframeRole,
        qualityGuidance,
        canvas: DEFAULT_CONSTRAINTS,
        requestedChanges: createSoftIdentityRetryRequestedChanges({
          action,
          keyframeRole: normalizedKeyframeRole,
          quality: diagnosticCandidate.quality
        })
      })
      const softRetryPromptRelativePath = path.join(
          'runs',
          run.runId,
          'prompts',
          'keyframes',
          'actions',
          `${actionId}-${normalizedKeyframeRole}-keyframe-soft-retry.md`
        ).replace(/\\/g, '/')
      writeAnchorPromptFile({
        dataDir,
        relativePath: softRetryPromptRelativePath,
        prompt: softRetryPromptBuild.prompt
      })
      selectedPromptRelativePath = softRetryPromptRelativePath
      selectedPromptCompiler = softRetryPromptBuild.promptCompiler || selectedPromptCompiler
      const softRetryAttempt = await generateWithFallbackImpl({
        settings,
        preferredModel: selectedModel,
        model: selectedModel,
        prompt: softRetryPromptBuild.prompt,
        promptCompiler: softRetryPromptBuild.promptCompiler,
        constraints: resolveCompiledPromptConstraints(softRetryPromptBuild),
        requestedTimeoutMs: stageTimeoutMs,
        referenceImages,
        runId: run.runId,
        dataRelativeDir: path.join(
          'runs',
          run.runId,
          'keyframes',
          'actions',
          `${actionId}-${normalizedKeyframeRole}-keyframe-soft-retry`
        ).replace(/\\/g, '/')
      })
      attempt = {
        ...softRetryAttempt,
        attempts: [
          ...(Array.isArray(attempt?.attempts) ? attempt.attempts : []),
          ...(Array.isArray(softRetryAttempt?.attempts) ? softRetryAttempt.attempts : [])
        ]
      }
      const softRetryOutputs = filterExistingGeneratedOutputs({
        dataDir,
        outputs: Array.isArray(softRetryAttempt.response?.result?.outputs)
          ? softRetryAttempt.response.result.outputs
          : []
      })
      candidateCount += softRetryOutputs.length
      for (const [retryIndex, output] of softRetryOutputs.entries()) {
        const candidateOutput = createOutputFromGeneratedPath({ dataDir, output })
        if (!candidateOutput) continue
        const candidateIndex = candidates.length + retryIndex
        try {
          const candidatePath = path.join(dataDir, candidateOutput.dataRelativePath)
          const backgroundPreparation = await prepareGeneratedKeyframeOutput(candidatePath)
          candidateOutput.sha256 = sha256File(candidatePath)
          const metrics = await readImageMaskMetrics(candidatePath)
          candidates.push({
            candidateIndex,
            output: candidateOutput,
            quality: evaluateActionKeyframeQualityImpl({
              metrics,
              referenceMetrics,
              action,
              backgroundPreparation,
              qualityProfile
            }),
            softIdentityRetry: true
          })
        } catch (error) {
          candidates.push({
            candidateIndex,
            output: candidateOutput,
            quality: createFailedActionKeyframeCandidateQuality(error, qualityProfile),
            softIdentityRetry: true
          })
        }
      }
      const softPassingCandidates = candidates
        .filter((candidate) => candidate.quality.ok)
        .sort((left, right) => Number(right.quality.score) - Number(left.quality.score))
      selectedCandidate = softPassingCandidates[0] || null
      diagnosticCandidate = selectedCandidate || [...candidates]
        .sort((left, right) => Number(right.quality.rawScore) - Number(left.quality.rawScore))[0]
      materializedOutput = diagnosticCandidate.output
      quality = diagnosticCandidate.quality
      candidateSelection = createActionKeyframeCandidateSelection({
        candidates,
        selectedCandidateIndex: selectedCandidate?.candidateIndex ?? -1
      })
      keyframe = createKeyframeRecordFromOutput({
        output: materializedOutput,
        actionId,
        keyframeRole: normalizedKeyframeRole,
        promptRelativePath: selectedPromptRelativePath,
        promptCompiler: selectedPromptCompiler,
        model: attempt.selectedModel,
        modelAttempts: attempt.attempts,
        quality
      })
      keyframe.candidateSelection = candidateSelection
      keyframe.softIdentityRetry = true
    }
    if (!selectedCandidate) {
      const failureConditions = [...new Set(candidates.flatMap((candidate) => candidate.quality.failureConditions || []))]
      throw new Error(
        `Creator Studio ${normalizedKeyframeRole} keyframe quality for ${actionId} had no passing candidates; failed conditions: ${failureConditions.join(', ')}`
      )
    }
    const referenceImage = {
      path: path.join(dataDir, materializedOutput.dataRelativePath),
      fileName: path.basename(materializedOutput.dataRelativePath),
      relativePath: materializedOutput.dataRelativePath,
      role: keyframe.role
    }
    return {
      ok: true,
      actionId,
      keyframe,
      referenceImage,
      promptRelativePath: selectedPromptRelativePath,
      promptCompiler: selectedPromptCompiler,
      model: attempt.selectedModel,
      modelAttempts: attempt.attempts,
      stage: createProviderGenerationStage({
        stage: stageName,
        actionId,
        ok: true,
        referenceImages,
        timeoutMs: stageTimeoutMs,
        durationMs: sumAttemptDurationsMs(attempt.attempts),
        model: attempt.selectedModel,
        modelAttempts: attempt.attempts,
        outputRelativePath: materializedOutput.dataRelativePath,
        promptRelativePath: selectedPromptRelativePath,
        outputCount: candidateCount,
        qualityProfile
      })
    }
  } catch (error) {
    const modelAttempts = Array.isArray(error?.modelAttempts)
      ? error.modelAttempts
      : Array.isArray(attempt?.attempts)
        ? attempt.attempts
        : []
    return {
      ok: false,
      actionId,
      keyframe,
      referenceImage: null,
      promptRelativePath: selectedPromptRelativePath,
      error: String(error?.message || `${normalizedKeyframeRole} keyframe generation failed`),
      model: attempt?.selectedModel || selectedModel,
      modelAttempts,
      stage: createProviderGenerationStage({
        stage: stageName,
        actionId,
        ok: false,
        referenceImages,
        timeoutMs: stageTimeoutMs,
        durationMs: sumAttemptDurationsMs(modelAttempts),
        model: attempt?.selectedModel || selectedModel,
        modelAttempts,
        outputRelativePath: materializedOutput?.dataRelativePath || '',
        promptRelativePath: selectedPromptRelativePath,
        outputCount: candidateCount,
        quality,
        qualityProfile,
        error: error?.message || error
      })
    }
  }
}

const generateKeyframeActionSpriteRow = async ({
  dataDir,
  run,
  settings,
  selectedModel,
  requestedTimeoutMs,
  action,
  originalReferenceImages = [],
  qualityReferenceImages = originalReferenceImages,
  generationDeadlineMs = 0,
  qualityProfile = getDefaultQualityProfile(),
  qualityGuidance = null,
  generateWithFallbackImpl = generateWithModelFallback
}) => {
  assertExactlyOneProviderReferenceImage(originalReferenceImages)
  const actionId = createSafeFileSegment(action?.actionId, 'action')
  const normalizedOriginalReferenceImages = originalReferenceImages.map((reference) => ({
    ...reference,
    role: String(reference?.role || 'canonical-reference').trim() || 'canonical-reference'
  }))
  const normalizedQualityReferenceImages = (
    Array.isArray(qualityReferenceImages) && qualityReferenceImages.length > 0
      ? qualityReferenceImages
      : normalizedOriginalReferenceImages
  ).map((reference) => ({
    ...reference,
    role: String(reference?.role || 'canonical-quality-reference').trim() || 'canonical-quality-reference'
  }))
  const startKeyframeResult = await generateActionKeyframe({
    dataDir,
    run,
    settings,
    selectedModel,
    requestedTimeoutMs,
    action,
    keyframeRole: 'start',
    referenceImages: normalizedOriginalReferenceImages,
    qualityReferenceImages: normalizedQualityReferenceImages,
    generationDeadlineMs,
    qualityProfile,
    qualityGuidance,
    generateWithFallbackImpl
  })
  if (!startKeyframeResult) {
    throw createProviderReferenceContractError(
      'reference_image_required',
      'Action keyframe generation requires exactly one reference image'
    )
  }
  if (!startKeyframeResult.ok) {
    return {
      ok: false,
      actionId,
      output: null,
      model: selectedModel,
      modelAttempts: startKeyframeResult.modelAttempts || [],
      promptRelativePath: startKeyframeResult.promptRelativePath,
      keyframes: [startKeyframeResult.keyframe].filter(Boolean),
      referenceImages: normalizedOriginalReferenceImages,
      stages: [startKeyframeResult.stage].filter(Boolean),
      error: String(startKeyframeResult.error || `Creator Studio start keyframe generation failed for ${actionId}`).slice(0, 240)
    }
  }
  const peakConditioningBoard = await buildAnchorReferenceBoard({
    dataDir,
    runId: run.runId,
    sourceReferences: [
      normalizedOriginalReferenceImages[0],
      startKeyframeResult.referenceImage
    ].filter(Boolean),
    characterBrief: resolveAnchorCharacterBrief(run),
    outputRelativeDir: path.join('runs', run.runId, 'inputs', 'keyframes', 'actions').replace(/\\/g, '/'),
    boardRole: 'action-peak-conditioning-board',
    fileBaseName: `${actionId}-peak-conditioning-board`,
    qualityProfile,
    qualityGuidance,
    actionId
  })
  const peakConditioningReferenceImage = {
    path: peakConditioningBoard.path,
    fileName: path.basename(peakConditioningBoard.relativePath),
    relativePath: peakConditioningBoard.relativePath,
    metadataRelativePath: peakConditioningBoard.metadataRelativePath,
    role: 'action-peak-conditioning-board'
  }
  const peakKeyframeResult = await generateActionKeyframe({
    dataDir,
    run,
    settings,
    selectedModel,
    requestedTimeoutMs,
    action,
    keyframeRole: 'peak',
    referenceImages: [peakConditioningReferenceImage],
    qualityReferenceImages: normalizedQualityReferenceImages,
    generationDeadlineMs,
    qualityProfile,
    qualityGuidance,
    generateWithFallbackImpl
  })
  if (!peakKeyframeResult.ok) {
    return {
      ok: false,
      actionId,
      output: null,
      model: selectedModel,
      modelAttempts: [
        ...(startKeyframeResult.modelAttempts || []),
        ...(peakKeyframeResult.modelAttempts || [])
      ],
      promptRelativePath: peakKeyframeResult.promptRelativePath,
      keyframes: [startKeyframeResult.keyframe, peakKeyframeResult.keyframe].filter(Boolean),
      referenceImages: [startKeyframeResult.referenceImage].filter(Boolean),
      stages: [startKeyframeResult.stage, peakKeyframeResult.stage].filter(Boolean),
      error: String(peakKeyframeResult.error || `Creator Studio peak keyframe generation failed for ${actionId}`).slice(0, 240)
    }
  }
  const conditioningBoard = await buildActionSpriteReferenceBoard({
    dataDir,
    runId: run.runId,
    sourceReferences: [
      normalizedOriginalReferenceImages[0],
      startKeyframeResult.referenceImage,
      peakKeyframeResult.referenceImage
    ].filter(Boolean),
    action,
    characterBrief: resolveAnchorCharacterBrief(run),
    outputRelativeDir: path.join('runs', run.runId, 'inputs', 'keyframes', 'actions').replace(/\\/g, '/'),
    boardRole: 'keyframe-action-reference-board',
    fileBaseName: `${actionId}-row-reference-board`,
    qualityProfile,
    qualityGuidance
  })
  const referenceBoard = {
    role: conditioningBoard.role,
    relativePath: conditioningBoard.relativePath,
    metadataRelativePath: conditioningBoard.metadataRelativePath,
    fileName: path.basename(conditioningBoard.relativePath)
  }
  const conditioningBoardReferenceImage = {
    path: conditioningBoard.path,
    fileName: path.basename(conditioningBoard.relativePath),
    relativePath: conditioningBoard.relativePath,
    metadataRelativePath: conditioningBoard.metadataRelativePath,
    role: 'keyframe-action-reference-board'
  }
  const promptBuild = buildActionSpriteRowPrompt({
    appearanceIntent: resolveProviderAppearanceIntent(run),
    referenceRole: 'keyframe-action-reference-board',
    action,
    qualityGuidance
  })
  const promptFile = writeAnchorPromptFile({
    dataDir,
    relativePath: path.join('runs', run.runId, 'prompts', 'keyframes', 'actions', `${actionId}-sprite-row.md`).replace(/\\/g, '/'),
    prompt: promptBuild.prompt
  })
  let finalStageTimeoutMs = Math.max(1, Number(requestedTimeoutMs) || CREATOR_PROVIDER_MIN_TIMEOUT_MS)
  let providerOutputCount = 0
  try {
    finalStageTimeoutMs = resolveGenerationStageTimeout({ requestedTimeoutMs, deadlineMs: generationDeadlineMs })
    const attempt = await generateWithFallbackImpl({
      settings,
      preferredModel: selectedModel,
      model: selectedModel,
      prompt: promptBuild.prompt,
      promptCompiler: promptBuild.promptCompiler,
      constraints: resolveCompiledPromptConstraints(promptBuild),
      requestedTimeoutMs: finalStageTimeoutMs,
      referenceImages: [conditioningBoardReferenceImage],
      runId: run.runId,
      traceContext: { runId: run.runId, actionId, stage: 'action-sprite-row' },
      dataRelativeDir: path.join('runs', run.runId, 'frames', 'base', `${actionId}-keyframe-row`).replace(/\\/g, '/')
    })
    const outputs = filterExistingGeneratedOutputs({
      dataDir,
      outputs: Array.isArray(attempt.response?.result?.outputs)
        ? attempt.response.result.outputs
        : []
    })
    providerOutputCount = outputs.length
    if (outputs.length !== 1) {
      const error = new Error(
        `Creator Studio keyframe sprite row generation requires exactly one complete provider output for ${actionId}; received ${outputs.length}`
      )
      error.modelAttempts = attempt.attempts
      error.providerOutputCount = outputs.length
      throw error
    }
    const materializedOutput = createOutputFromGeneratedPath({ dataDir, output: outputs[0] })
    if (!materializedOutput) throw new Error(`Creator Studio keyframe sprite row output was not materialized for ${actionId}`)
    const stage = createProviderGenerationStage({
      stage: 'final-image',
      actionId,
      ok: true,
      referenceImages: [conditioningBoardReferenceImage],
      timeoutMs: finalStageTimeoutMs,
      durationMs: sumAttemptDurationsMs(attempt.attempts),
      model: attempt.selectedModel,
      modelAttempts: attempt.attempts,
      outputRelativePath: materializedOutput.dataRelativePath,
      promptRelativePath: promptFile.relativePath,
      outputCount: providerOutputCount,
      qualityProfile
    })
    return {
      ok: true,
      actionId,
      output: materializedOutput,
      model: attempt.selectedModel,
      modelAttempts: [
        ...(startKeyframeResult.modelAttempts || []),
        ...(peakKeyframeResult.modelAttempts || []),
        ...(attempt.attempts || [])
      ],
      promptRelativePath: promptFile.relativePath,
      promptCompiler: promptBuild.promptCompiler,
      keyframes: [
        startKeyframeResult.keyframe,
        peakKeyframeResult.keyframe
      ].filter(Boolean),
      referenceImages: [conditioningBoardReferenceImage],
      referenceBoard,
      finalStage: stage,
      stages: [
        startKeyframeResult.stage,
        peakKeyframeResult.stage,
        stage
      ].filter(Boolean)
    }
  } catch (error) {
    const modelAttempts = Array.isArray(error?.modelAttempts) ? error.modelAttempts : []
    const failedStage = createProviderGenerationStage({
      stage: 'final-image',
      actionId,
      ok: false,
      referenceImages: [conditioningBoardReferenceImage],
      timeoutMs: finalStageTimeoutMs,
      durationMs: sumAttemptDurationsMs(modelAttempts),
      model: selectedModel,
      modelAttempts,
      promptRelativePath: promptFile.relativePath,
      outputCount: Number(error?.providerOutputCount ?? providerOutputCount) || 0,
      qualityProfile,
      error: error?.message || error
    })
    return {
      ok: false,
      actionId,
      output: null,
      model: selectedModel,
      modelAttempts: [
        ...(startKeyframeResult.modelAttempts || []),
        ...(peakKeyframeResult.modelAttempts || []),
        ...modelAttempts
      ],
      promptRelativePath: promptFile.relativePath,
      promptCompiler: promptBuild.promptCompiler,
      keyframes: [
        startKeyframeResult.keyframe,
        peakKeyframeResult.keyframe
      ].filter(Boolean),
      referenceImages: [conditioningBoardReferenceImage],
      referenceBoard,
      finalStage: failedStage,
      stages: [
        startKeyframeResult.stage,
        peakKeyframeResult.stage,
        failedStage
      ].filter(Boolean),
      error: String(error?.message || error).slice(0, 240)
    }
  }
}

const createCandidateSelectionSummary = ({
  candidates,
  selectedCandidate,
  qualityProfile = getDefaultQualityProfile()
}) => ({
  version: 1,
  mode: 'direct-source-action-anchor-multi-candidate',
  candidateCount: candidates.length,
  minAcceptableScore: qualityProfile.keyframe.minActionAnchorScore,
  qualityProfile: createQualityProfileEvidence(qualityProfile),
  selectedCandidateId: selectedCandidate?.candidateId || '',
  selectedCandidateRelativePath: createSafeRelativePath(selectedCandidate?.relativePath),
  selectedScore: roundMetric(selectedCandidate?.score, 2),
  acceptable: Number(selectedCandidate?.score || 0) >= qualityProfile.keyframe.minActionAnchorScore,
  candidates: candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    promptRelativePath: createSafeRelativePath(candidate.promptRelativePath),
    outputRelativePath: createSafeRelativePath(candidate.relativePath),
    model: normalizeModelName(candidate.model),
    ok: Boolean(candidate.ok),
    score: roundMetric(candidate.score, 2),
    acceptable: Number(candidate.score || 0) >= qualityProfile.keyframe.minActionAnchorScore,
    selected: candidate.candidateId === selectedCandidate?.candidateId,
    metrics: summarizeActionAnchorMetrics(candidate.metrics),
    ...(candidate.error ? { error: String(candidate.error).slice(0, 240) } : {})
  }))
})

const materializeSelectedActionAnchorCandidate = ({ dataDir, runId, actionId, selectedCandidate }) => {
  const stableRelativeDir = path.join('runs', runId, 'anchors', 'actions', `${actionId}-anchor`).replace(/\\/g, '/')
  const stableRelativePath = path.join(stableRelativeDir, '0001.png').replace(/\\/g, '/')
  const stablePath = path.join(dataDir, stableRelativePath)
  fs.mkdirSync(path.dirname(stablePath), { recursive: true })
  fs.copyFileSync(path.join(dataDir, selectedCandidate.relativePath), stablePath)
  return {
    dataRelativePath: stableRelativePath,
    mimeType: selectedCandidate.mimeType || 'image/png',
    sha256: sha256File(stablePath)
  }
}

const generateDirectSourceActionAnchorCandidateSet = async ({
  dataDir,
  run,
  settings,
  selectedModel,
  requestedTimeoutMs,
  actionId,
  action,
  actionReferenceImage,
  qualityGuidance = null,
  qualityProfile = getDefaultQualityProfile(),
  generateWithFallbackImpl
}) => {
  const referenceMetrics = await readImageMaskMetrics(actionReferenceImage.path)
  const candidates = []
  const candidateVariants = ACTION_ANCHOR_CANDIDATE_VARIANTS.slice(0, DIRECT_SOURCE_ACTION_ANCHOR_CANDIDATE_COUNT)
  for (const [index, candidateVariant] of candidateVariants.entries()) {
    const candidateId = candidateVariant.id
    const candidateSegment = createCandidateFileSegment(index, candidateId)
    const candidatePromptBuild = buildActionAnchorPrompt({
      referenceRole: actionReferenceImage.role,
      action,
      qualityGuidance,
      canvas: DEFAULT_CONSTRAINTS,
      appearanceIntent: resolveProviderAppearanceIntent(run),
      strategyId: candidateVariant.id,
      requestedChanges: candidateVariant.requestedChanges
    })
    const prompt = candidatePromptBuild.prompt
    const promptFile = writeAnchorPromptFile({
      dataDir,
      relativePath: path.join(
        'runs',
        run.runId,
        'prompts',
        'anchors',
        'actions',
        `${actionId}-anchor-candidates`,
        `${candidateSegment}.md`
      ).replace(/\\/g, '/'),
      prompt
    })
    try {
      const attempt = await generateWithFallbackImpl({
        settings,
        preferredModel: selectedModel,
        model: selectedModel,
        prompt,
        promptCompiler: candidatePromptBuild.promptCompiler,
        constraints: resolveCompiledPromptConstraints(candidatePromptBuild),
        requestedTimeoutMs,
        referenceImages: [actionReferenceImage],
        runId: run.runId,
        dataRelativeDir: path.join(
          'runs',
          run.runId,
          'anchors',
          'actions',
          `${actionId}-anchor-candidates`,
          candidateSegment
        ).replace(/\\/g, '/')
      })
      const output = getFirstExistingOutput({ dataDir, response: attempt.response })
      if (!output) throw new Error(`Creator Studio action anchor candidate ${candidateId} returned no outputs for ${actionId}`)
      const relativePath = createSafeRelativePath(output.dataRelativePath)
      const metrics = await readImageMaskMetrics(path.join(dataDir, relativePath))
      const score = scoreActionAnchorMetrics({ metrics, referenceMetrics, action, qualityProfile })
      candidates.push({
        candidateId,
        ok: true,
        relativePath,
        mimeType: output.mimeType || 'image/png',
        sha256: output.sha256 || '',
        promptRelativePath: promptFile.relativePath,
        model: attempt.selectedModel,
        attempts: (Array.isArray(attempt.attempts) ? attempt.attempts : []).map((entry) => ({
          ...entry,
          candidateId
        })),
        metrics,
        score
      })
    } catch (error) {
      candidates.push({
        candidateId,
        ok: false,
        relativePath: '',
        promptRelativePath: promptFile.relativePath,
        model: selectedModel,
        attempts: (Array.isArray(error?.modelAttempts) ? error.modelAttempts : []).map((entry) => ({
          ...entry,
          candidateId
        })),
        metrics: null,
        score: 0,
        error: error?.message || error
      })
    }
  }

  const successfulCandidates = candidates.filter((candidate) => candidate.ok && candidate.relativePath)
  if (successfulCandidates.length === 0) {
    const error = new Error(`Creator Studio action anchor generation returned no usable candidates for ${actionId}`)
    error.modelAttempts = candidates.flatMap((candidate) => candidate.attempts || [])
    throw error
  }
  const selectedCandidate = successfulCandidates
    .slice()
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))[0]
  const selectionSummary = createCandidateSelectionSummary({
    candidates,
    selectedCandidate,
    qualityProfile
  })
  const selectionRelativePath = path.join(
    'runs',
    run.runId,
    'anchors',
    'actions',
    `${actionId}-anchor`,
    'selection.json'
  ).replace(/\\/g, '/')
  writeJsonFile(path.join(dataDir, selectionRelativePath), selectionSummary)
  const selection = {
    ...selectionSummary,
    metadataRelativePath: selectionRelativePath
  }
  if (!selection.acceptable) {
    const error = new Error(
      `Creator Studio action anchor candidate selection for ${actionId} scored ${selection.selectedScore} below the minimum acceptable score ${qualityProfile.keyframe.minActionAnchorScore}; see ${selectionRelativePath}`
    )
    error.modelAttempts = candidates.flatMap((candidate) => candidate.attempts || [])
    error.candidateSelection = selection
    throw error
  }

  const stableOutput = materializeSelectedActionAnchorCandidate({
    dataDir,
    runId: run.runId,
    actionId,
    selectedCandidate
  })

  return {
    output: stableOutput,
    promptRelativePath: selectedCandidate.promptRelativePath,
    model: selectedCandidate.model,
    attempts: candidates.flatMap((candidate) => candidate.attempts || []),
    selection
  }
}

const generateAnchorReferences = async ({
  dataDir,
  run,
  settings = {},
  selectedModel = '',
  requestedTimeoutMs,
  originalReferenceImages = [],
  qualityProfile = getDefaultQualityProfile(),
  qualityGuidance = null,
  generateWithFallbackImpl = generateWithModelFallback
}) => {
  const references = Array.isArray(originalReferenceImages) ? originalReferenceImages.filter(Boolean) : []
  if (!dataDir || !run?.runId) throw new Error('Creator Studio anchor generation context is invalid')
  if (references.length === 0) {
    throw createProviderReferenceContractError(
      'reference_image_required',
      'Creator Studio anchor generation requires a local reference image'
    )
  }

  const characterBrief = resolveAnchorCharacterBrief(run)
  const compositeBoard = await buildAnchorReferenceBoard({
    dataDir,
    runId: run.runId,
    sourceReferences: references,
    characterBrief,
    qualityProfile,
    qualityGuidance
  })
  const stages = [{
    stage: 'composite-reference-board',
    referenceRole: references.length === 1
      ? String(references[0]?.role || 'canonical-reference')
      : 'multiple-source-references',
    referenceRoles: references.map((reference) => String(reference?.role || 'reference-image')),
    outputRelativePath: compositeBoard.relativePath,
    metadataRelativePath: compositeBoard.metadataRelativePath,
    sourceCount: compositeBoard.sourceCount,
    renderedSourceCount: compositeBoard.renderedSourceCount,
    qualityProfile: createQualityProfileEvidence(qualityProfile)
  }]
  const compositeReferenceImage = {
    path: compositeBoard.path,
    fileName: path.basename(compositeBoard.relativePath),
    relativePath: compositeBoard.relativePath,
    metadataRelativePath: compositeBoard.metadataRelativePath,
    role: 'composite-reference-board'
  }

  let characterAnchor = null
  if (!shouldSkipCharacterAnchorForActions(run)) {
    const characterPromptBuild = buildCharacterAnchorPrompt({
      appearanceIntent: resolveProviderAppearanceIntent(run),
      referenceRole: 'composite-reference-board',
      qualityGuidance,
      canvas: DEFAULT_CONSTRAINTS
    })
    const characterPromptFile = writeAnchorPromptFile({
      dataDir,
      relativePath: path.join('runs', run.runId, 'prompts', 'anchors', 'character-anchor.md').replace(/\\/g, '/'),
      prompt: characterPromptBuild.prompt
    })
    const characterAttempt = await generateWithFallbackImpl({
      settings,
      preferredModel: selectedModel,
      model: selectedModel,
      prompt: characterPromptBuild.prompt,
      promptCompiler: characterPromptBuild.promptCompiler,
      constraints: resolveCompiledPromptConstraints(characterPromptBuild),
      requestedTimeoutMs,
      referenceImages: [compositeReferenceImage],
      runId: run.runId,
      traceContext: { runId: run.runId, stage: 'character-anchor' },
      dataRelativeDir: path.join('runs', run.runId, 'anchors', 'character-anchor').replace(/\\/g, '/')
    })
    const characterOutput = getFirstExistingOutput({ dataDir, response: characterAttempt.response })
    if (!characterOutput) throw new Error('Creator Studio character anchor generation returned no outputs')
    characterAnchor = createAnchorRecordFromOutput({
      output: characterOutput,
      role: 'character-anchor',
      promptRelativePath: characterPromptFile.relativePath,
      model: characterAttempt.selectedModel,
      modelAttempts: characterAttempt.attempts
    })
  }
  if (characterAnchor) {
    stages.push({
      stage: 'character-anchor',
      ok: true,
      referenceRole: 'composite-reference-board',
      referenceRoles: ['composite-reference-board'],
      timeoutMs: Math.max(0, Number(requestedTimeoutMs) || 0),
      durationMs: sumAttemptDurationsMs(characterAnchor.modelAttempts),
      outputRelativePath: characterAnchor.relativePath,
      promptRelativePath: characterAnchor.promptRelativePath,
      model: characterAnchor.model,
      modelAttempts: characterAnchor.modelAttempts,
      outputCount: 1,
      qualityProfile: createQualityProfileEvidence(qualityProfile)
    })
  }

  const actionAnchors = []
  const finalActionBoards = []
  if (shouldGenerateActionAnchors(run) && (characterAnchor || shouldSkipCharacterAnchorForActions(run))) {
    const characterReferenceImage = {
      path: characterAnchor ? path.join(dataDir, characterAnchor.relativePath) : compositeReferenceImage.path,
      fileName: characterAnchor ? (characterAnchor.fileName || 'character-anchor.png') : compositeReferenceImage.fileName,
      relativePath: characterAnchor ? characterAnchor.relativePath : compositeReferenceImage.relativePath,
      metadataRelativePath: characterAnchor ? '' : compositeReferenceImage.metadataRelativePath,
      role: characterAnchor ? 'character-anchor' : 'source-action-reference-board'
    }
    for (const action of getRunActions(run)) {
      const actionId = createSafeFileSegment(action?.actionId, 'action')
      const actionReferenceImage = shouldUseDirectSourceBoardForActionAnchor(action)
        ? {
            ...compositeReferenceImage,
            role: 'source-action-reference-board'
          }
        : characterReferenceImage
      const actionReferenceRole = actionReferenceImage.role
      const actionPromptBuild = buildActionAnchorPrompt({
        appearanceIntent: resolveProviderAppearanceIntent(run),
        referenceRole: actionReferenceRole,
        action,
        qualityGuidance,
        canvas: DEFAULT_CONSTRAINTS
      })
      const promptFile = writeAnchorPromptFile({
        dataDir,
        relativePath: path.join('runs', run.runId, 'prompts', 'anchors', 'actions', `${actionId}-anchor.md`).replace(/\\/g, '/'),
        prompt: actionPromptBuild.prompt
      })
      let actionOutput
      let actionModel = ''
      let actionAttempts = []
      let candidateSelection = null
      if (shouldUseDirectSourceBoardForActionAnchor(action)) {
        const candidateSet = await generateDirectSourceActionAnchorCandidateSet({
          dataDir,
          run,
          settings,
          selectedModel,
          requestedTimeoutMs,
          actionId,
          action,
          actionReferenceImage,
          qualityGuidance,
          qualityProfile,
          generateWithFallbackImpl
        })
        actionOutput = candidateSet.output
        actionModel = candidateSet.model
        actionAttempts = candidateSet.attempts
        candidateSelection = candidateSet.selection
      } else {
        const actionAttempt = await generateWithFallbackImpl({
          settings,
          preferredModel: selectedModel,
          model: selectedModel,
          prompt: actionPromptBuild.prompt,
          promptCompiler: actionPromptBuild.promptCompiler,
          constraints: resolveCompiledPromptConstraints(actionPromptBuild),
          requestedTimeoutMs,
          referenceImages: [actionReferenceImage],
          runId: run.runId,
          traceContext: { runId: run.runId, actionId, stage: 'action-anchor' },
          dataRelativeDir: path.join('runs', run.runId, 'anchors', 'actions', `${actionId}-anchor`).replace(/\\/g, '/')
        })
        actionOutput = getFirstExistingOutput({ dataDir, response: actionAttempt.response })
        actionModel = actionAttempt.selectedModel
        actionAttempts = actionAttempt.attempts
      }
      if (!actionOutput) throw new Error(`Creator Studio action anchor generation returned no outputs for ${actionId}`)
      const actionAnchor = createAnchorRecordFromOutput({
        output: actionOutput,
        role: 'action-anchor',
        actionId,
        promptRelativePath: promptFile.relativePath,
        model: actionModel,
        modelAttempts: actionAttempts
      })
      if (actionAnchor) {
        if (candidateSelection) {
          actionAnchor.metadataRelativePath = candidateSelection.metadataRelativePath
          actionAnchor.candidateSelection = candidateSelection
        }
        actionAnchors.push(actionAnchor)
        stages.push({
          stage: 'action-anchor',
          actionId,
          ok: true,
          referenceRole: actionReferenceRole,
          referenceRoles: [actionReferenceRole],
          timeoutMs: Math.max(0, Number(requestedTimeoutMs) || 0),
          durationMs: sumAttemptDurationsMs(actionAnchor.modelAttempts),
          outputRelativePath: actionAnchor.relativePath,
          promptRelativePath: actionAnchor.promptRelativePath,
          model: actionAnchor.model,
          modelAttempts: actionAnchor.modelAttempts,
          outputCount: 1,
          qualityProfile: createQualityProfileEvidence(qualityProfile),
          ...(candidateSelection ? { candidateSelection } : {})
        })
        const finalActionBoard = await buildAnchorReferenceBoard({
          dataDir,
          runId: run.runId,
          sourceReferences: [
            ...references.map((reference, referenceIndex) => ({
              ...reference,
              role: referenceIndex === 0
                ? 'source-identity-reference'
                : 'source-identity-supplemental-reference'
            })),
            {
              path: path.join(dataDir, actionAnchor.relativePath),
              fileName: actionAnchor.fileName || `${actionId}-anchor.png`,
              relativePath: actionAnchor.relativePath,
              role: 'action-pose-reference'
            }
          ],
          characterBrief: [
            characterBrief,
            `Action ${actionId}: source identity panel is authoritative; action pose panel is motion guidance only.`
          ].filter(Boolean).join(' '),
          outputRelativeDir: path.join('runs', run.runId, 'inputs', 'anchors', 'actions').replace(/\\/g, '/'),
          boardRole: 'final-action-reference-board',
          fileBaseName: `${actionId}-final-reference-board`,
          qualityProfile,
          qualityGuidance,
          actionId
        })
        const finalActionBoardRecord = {
          actionId,
          role: finalActionBoard.role,
          relativePath: finalActionBoard.relativePath,
          metadataRelativePath: finalActionBoard.metadataRelativePath,
          fileName: path.basename(finalActionBoard.relativePath)
        }
        finalActionBoards.push(finalActionBoardRecord)
        stages.push({
          stage: 'final-action-reference-board',
          actionId,
          referenceRole: 'source-identity-reference',
          referenceRoles: ['source-identity-reference', 'action-pose-reference'],
          outputRelativePath: finalActionBoardRecord.relativePath,
          metadataRelativePath: finalActionBoardRecord.metadataRelativePath,
          sourceCount: finalActionBoard.sourceCount,
          renderedSourceCount: finalActionBoard.renderedSourceCount,
          qualityProfile: createQualityProfileEvidence(qualityProfile)
        })
      }
    }
  }

  return {
    anchorReferences: {
      version: 1,
      sourcePriority: 'image-first',
      compositeBoard: {
        role: compositeBoard.role,
        relativePath: compositeBoard.relativePath,
        metadataRelativePath: compositeBoard.metadataRelativePath,
        fileName: path.basename(compositeBoard.relativePath)
      },
      characterAnchor,
      actionAnchors,
      finalActionBoards
    },
    anchorGeneration: {
      skipped: false,
      characterAnchorModel: characterAnchor?.model || '',
      actionAnchorCount: actionAnchors.length,
      stages
    }
  }
}

const createGeneratedOutputReferenceImage = ({ dataDir, output, role = 'generated-base-identity-reference' }) => {
  const materialized = createOutputFromGeneratedPath({ dataDir, output })
  if (!materialized) return null
  return {
    path: path.join(dataDir, materialized.dataRelativePath),
    fileName: path.basename(materialized.dataRelativePath),
    relativePath: materialized.dataRelativePath,
    role
  }
}

const hasUsableLocalReferenceImages = (referenceImages = [], dataDir = '') => (
  Array.isArray(referenceImages) &&
  referenceImages.length > 0 &&
  referenceImages.every((referenceImage) => (
    isUsableLocalReferenceImage({ dataDir, referenceImage })
  ))
)

const createFullPetActionIdentityContext = async ({
  dataDir,
  run,
  baseOutputs = [],
  originalReferenceImages = [],
  qualityProfile = getDefaultQualityProfile(),
  qualityGuidance = null
}) => {
  if (baseOutputs.length > 1) {
    throw new Error(
      `Creator Studio full-pet action identity requires exactly one canonical generated output; received ${baseOutputs.length}`
    )
  }
  const canonicalReference = createGeneratedOutputReferenceImage({
    dataDir,
    output: baseOutputs[0],
    role: 'canonical-generated-identity'
  })
  const usableOriginal = hasUsableLocalReferenceImages(originalReferenceImages, dataDir)
    ? originalReferenceImages[0]
    : null
  if (!canonicalReference) {
    const references = usableOriginal ? [usableOriginal] : []
    return {
      referenceImages: references,
      qualityReferenceImages: references,
      evidence: null
    }
  }
  const sourceReferences = [
    canonicalReference,
    usableOriginal
      ? {
          ...usableOriginal,
          role: 'original-source-identity'
        }
      : null
  ].filter(Boolean)
  if (sourceReferences.length === 1) {
    return {
      referenceImages: [canonicalReference],
      qualityReferenceImages: [canonicalReference],
      evidence: {
        role: canonicalReference.role,
        relativePath: canonicalReference.relativePath,
        metadataRelativePath: '',
        qualityReferenceRole: canonicalReference.role,
        qualityReferenceRelativePath: canonicalReference.relativePath
      }
    }
  }
  const board = await buildAnchorReferenceBoard({
    dataDir,
    runId: run.runId,
    sourceReferences,
    characterBrief: [
      resolveAnchorCharacterBrief(run),
      'Canonical generated identity is the pose, framing, scale, and cross-row continuity authority; original source remains the visible-detail authority.'
    ].filter(Boolean).join(' '),
    outputRelativeDir: path.join('runs', run.runId, 'inputs', 'keyframes', 'identity').replace(/\\/g, '/'),
    boardRole: 'full-pet-action-identity-board',
    fileBaseName: 'full-pet-action-identity-board',
    qualityProfile,
    qualityGuidance
  })
  const boardReference = {
    path: board.path,
    fileName: path.basename(board.relativePath),
    relativePath: board.relativePath,
    metadataRelativePath: board.metadataRelativePath,
    role: board.role
  }
  return {
    referenceImages: [boardReference],
    qualityReferenceImages: [canonicalReference],
    evidence: {
      role: board.role,
      relativePath: board.relativePath,
      metadataRelativePath: board.metadataRelativePath,
      qualityReferenceRole: canonicalReference.role,
      qualityReferenceRelativePath: canonicalReference.relativePath
    }
  }
}

const hasAnchorEligibleRunReference = (run = {}) => {
  const referenceImage = run?.input?.referenceImage
  return Number(referenceImage?.width) > 0 && Number(referenceImage?.height) > 0
}

const CANONICAL_DIVERSITY_PROFILES = Object.freeze([
  'identity-faithful-balanced-v1',
  'silhouette-readability-v1',
  'small-scale-detail-v1',
  'identity-safe-alternate-neutral-v1'
])

const createCanonicalRequestedChanges = (diversityProfileId) => {
  if (diversityProfileId === 'silhouette-readability-v1') {
    return ['preserve the exact source identity while keeping the full-body silhouette readable at small runtime size']
  }
  if (diversityProfileId === 'small-scale-detail-v1') {
    return ['preserve the source-authentic high-value markings and distinguishing details at small runtime size']
  }
  if (diversityProfileId === 'identity-safe-alternate-neutral-v1') {
    return [
      'preserve the exact referenced identity, proportions, markings, accessories, palette, rendering medium, and subject lighting while creating a visibly different calm neutral presentation with small source-compatible limb separation, a subtle natural head angle, and a clean readable silhouette; use no action gesture or redesigned expression, do not change the view or hide identity-bearing features, and do not change the rendering style'
    ]
  }
  return ['preserve the exact source identity and rendering style with balanced full-body framing']
}

const createQualityFirstRecoveryBundle = async ({ dataDir, run, actionResults = {}, reason = 'idle_generation_failed' } = {}) => {
  const root = path.resolve(String(dataDir || ''))
  const runId = String(run?.runId || '').trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(runId)) throw new Error('Quality-first recovery runId is invalid')
  const runDir = path.resolve(root, 'runs', runId)
  if (!runDir.startsWith(`${root}${path.sep}`) || !fs.existsSync(runDir)) throw new Error('Quality-first recovery run does not exist')
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (path.relative(runDir, absolutePath).split(path.sep)[0] === 'recovery') continue
        visit(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/')
      const stat = fs.statSync(absolutePath)
      files.push({ relativePath, sha256: sha256File(absolutePath), byteSize: stat.size })
    }
  }
  visit(runDir)
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  const relativePath = `runs/${runId}/recovery/recovery.json`
  const outputPath = path.resolve(root, relativePath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const manifest = {
    version: 1,
    runId,
    reason: String(reason || 'idle_generation_failed').slice(0, 160),
    planHash: String(run?.qualityFirst?.planHash || '').slice(0, 128),
    createdAt: new Date().toISOString(),
    importable: false,
    actionResults,
    files
  }
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`)
    fs.renameSync(temporaryPath, outputPath)
  } finally {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
    } catch (_) {}
  }
  return {
    reason: manifest.reason,
    relativePath,
    sha256: sha256File(outputPath),
    byteSize: fs.statSync(outputPath).size,
    assetCount: files.length
  }
}

const generateCanonicalCandidatePool = async ({
  generateCandidate,
  persistCandidate = () => {},
  maxDispatches = 4
} = {}) => {
  if (typeof generateCandidate !== 'function') throw new Error('Canonical candidate pool requires a generation callback')
  const candidates = []
  const distinctCandidates = []
  const limit = Math.min(4, Math.max(3, Number(maxDispatches) || 4))
  for (let dispatchIndex = 1; dispatchIndex <= limit && distinctCandidates.length < 3; dispatchIndex += 1) {
    const diversityProfileId = CANONICAL_DIVERSITY_PROFILES[Math.min(dispatchIndex - 1, CANONICAL_DIVERSITY_PROFILES.length - 1)]
    const attemptKind = dispatchIndex <= 3 ? 'initial' : 'duplicate-replacement'
    const generated = await generateCandidate({
      candidateId: `canonical-${dispatchIndex}`,
      dispatchIndex,
      attemptKind,
      diversityProfileId
    })
    const sha256 = String(generated?.sha256 || '')
    const duplicateOf = distinctCandidates.find((candidate) => (
      candidate.sha256 === sha256 || areSpriteCandidatesDuplicates(candidate, generated, {
        perceptualHashDistance: 4,
        identityDescriptorDistance: 0.08,
        alphaMaskDistance: 0.08,
        meanColorDistance: 0.08
      })
    ))
    const duplicate = Boolean(duplicateOf)
    const technicalEligible = generated?.eligible === true
    const candidate = {
      ...generated,
      candidateId: String(generated?.candidateId || `canonical-${dispatchIndex}`),
      dispatchIndex,
      attemptKind,
      diversityProfileId,
      technicalEligible,
      eligible: technicalEligible,
      diversityStatus: duplicate ? 'duplicate' : 'distinct',
      failureCodes: Array.isArray(generated?.failureCodes) ? [...new Set(generated.failureCodes)] : [],
      ...(duplicate ? {
        duplicateOfCandidateId: duplicateOf.candidateId,
        duplicateOfSha256: duplicateOf.sha256
      } : {})
    }
    candidates.push(candidate)
    if (candidate.eligible && !duplicate && sha256) distinctCandidates.push(candidate)
    await persistCandidate(candidate)
  }
  return { version: 1, dispatchCount: candidates.length, distinctEligibleCount: distinctCandidates.length, candidates }
}

const evaluateCanonicalCandidatePool = async ({
  pool,
  dataDir,
  runId,
  sourcePath,
  createBoard = createCanonicalEvaluatorBoard,
  requestEvaluation = requestHatchPetSpriteEvaluation,
  persistCandidate = async () => {}
} = {}) => {
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : []
  const evaluable = candidates.filter((candidate) => (
    candidate?.technicalEligible !== false &&
    candidate?.eligible === true &&
    candidate?.path &&
    candidate?.sha256
  ))
  if (evaluable.length === 0) {
    return {
      ...pool,
      passingCandidateCount: 0,
      candidates: candidates.map((candidate) => ({ ...candidate, eligible: false, disposition: 'unusable' }))
    }
  }
  const evaluatorBoardPath = path.join(dataDir, `runs/${runId}/evaluations/canonical-comparison-board.png`)
  const board = await createBoard({ sourcePath, candidates: evaluable, outputPath: evaluatorBoardPath })
  const evaluation = await requestEvaluation({
    runId,
    scope: 'canonical-comparison',
    board: {
      relativePath: path.relative(dataDir, board.path).replace(/\\/g, '/'),
      sha256: board.sha256,
      regions: board.regions
    },
    qa: {
      ok: true,
      failures: [],
      metrics: {
        candidateCount: evaluable.length,
        distinctCandidateCount: Math.max(0, Number(pool?.distinctEligibleCount) || 0)
      }
    }
  })
  for (const candidate of evaluable) {
    const candidateEvaluation = evaluation.evaluation?.candidates?.find((entry) => entry.candidateId === candidate.candidateId)
    const candidateGate = evaluation.gate?.candidateGates?.[candidate.candidateId]
    candidate.evaluation = candidateEvaluation || null
    candidate.gate = candidateGate || { ok: false, outcome: 'cannot-evaluate', failures: ['canonical-comparison-result-missing'] }
    candidate.eligible = candidate.gate.ok === true
    candidate.score = Number(candidateEvaluation?.scores?.overall) || 0
    candidate.failureCodes = [...new Set([...(candidate.failureCodes || []), ...(candidate.gate.failures || [])])]
    candidate.disposition = candidate.eligible
      ? (candidate.duplicateOfCandidateId ? 'duplicate-alternate' : 'alternate')
      : 'unusable'
    candidate.evaluationEvidenceRelativePath = evaluation.evidenceRelativePath
    await persistCandidate(candidate)
  }
  const normalizedCandidates = candidates.map((candidate) => (
    evaluable.includes(candidate)
      ? candidate
      : { ...candidate, eligible: false, disposition: 'unusable' }
  ))
  return {
    ...pool,
    passingCandidateCount: normalizedCandidates.filter((candidate) => candidate.eligible === true).length,
    candidates: normalizedCandidates,
    evaluationEvidenceRelativePath: evaluation.evidenceRelativePath,
    evaluatorBoardRelativePath: path.relative(dataDir, board.path).replace(/\\/g, '/')
  }
}

const generateSelectedFullPetAction = (options = {}) => runQualityFirstAction(options)

const createQualityFirstHostRuntime = async ({ dataDir, run, planOverride = null } = {}) => {
  const settings = await readHostModelSettings()
  const sourceReference = resolveOriginalReferenceImage({ dataDir, run })
  if (!isUsableLocalReferenceImage({ dataDir, referenceImage: sourceReference })) {
    throw createProviderReferenceContractError('reference_image_required', 'Quality-first generation requires one usable local reference image')
  }
  const planResult = planOverride ? {
    proposal: null,
    budgetLedger: null,
    requireIdentityReviewBeforeActions: run?.qualityFirst?.requireIdentityReviewBeforeActions === true
  } : await requestHatchPetSpritePlan({
    runId: run.runId,
    userIntent: run.input?.originalPrompt || run.input?.prompt || ''
  })
  const plan = planOverride || createSpriteAssetPlan({
    version: 1,
    revision: 1,
    character: { assetClass: planResult.proposal.assetClass },
    actions: planResult.proposal.actions,
    qualityProfile: { id: 'pet-generation-default-v2', sourceDatasetId: '' }
  })
  const planRelativePath = `runs/${run.runId}/sprite-plan.json`
  writeJsonFile(path.join(dataDir, planRelativePath), plan)
  const qualityProfile = require('./pet-generation-quality-profile').getQualityFirstQualityProfile()
  const persistedScaleProfilePath = path.join(dataDir, `runs/${run.runId}/character-scale-profile.json`)
  const readPersistedScaleProfile = () => {
    try {
      const value = JSON.parse(fs.readFileSync(persistedScaleProfilePath, 'utf8'))
      if (!value || typeof value !== 'object' || !/^[a-f0-9]{64}$/.test(String(value.hash || ''))) return null
      const { hash: recordedHash, ...profileWithoutHash } = value
      const computedHash = crypto.createHash('sha256').update(JSON.stringify(profileWithoutHash)).digest('hex')
      return computedHash === recordedHash ? value : null
    } catch (_) {
      return null
    }
  }
  const canonicalMetrics = async (candidate) => {
    const decoded = await sharp(candidate.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return measureBodyMask({ data: decoded.data, width: decoded.info.width, height: decoded.info.height, characterClass: plan.character.assetClass })
  }
  const generateCanonicalCandidate = async ({ candidateId, diversityProfileId }) => {
    const task = createProviderImageTask({
      taskType: 'character-image',
      stage: 'identity',
      canvas: { width: 1024, height: 1024 },
      referenceRole: sourceReference.role,
      subject: { count: 1, framing: 'full-body', targetOccupancyPercent: 72, safePaddingPercent: 12, rootAnchor: 'lower-center' },
      strategyId: diversityProfileId,
      requestedChanges: createCanonicalRequestedChanges(diversityProfileId)
    })
    const buildPromptForModel = (model) => {
      const compiled = compileProviderImagePrompt({ task, model })
      return { prompt: compiled.text, promptCompiler: compiled.safeSummary }
    }
    const compiled = buildPromptForModel(String(settings.model || 'gpt-image-2'))
    const promptRelativePath = `runs/${run.runId}/prompts/quality-first/${candidateId}.txt`
    fs.mkdirSync(path.dirname(path.join(dataDir, promptRelativePath)), { recursive: true })
    fs.writeFileSync(path.join(dataDir, promptRelativePath), `${compiled.prompt}\n`)
    try {
      const generated = await generateWithModelFallback({
        settings,
        preferredModel: String(settings.model || ''),
        prompt: compiled.prompt,
        promptCompiler: compiled.promptCompiler,
        buildPromptForModel,
        constraints: resolveCompiledPromptConstraints(compiled),
        requestedTimeoutMs: Math.max(Number(settings.timeoutMs) || 0, CREATOR_PROVIDER_MIN_TIMEOUT_MS),
        referenceImages: [sourceReference],
        runId: run.runId,
        traceContext: { runId: run.runId, stage: 'canonical-candidate', candidateId },
        dataRelativeDir: `runs/${run.runId}/candidates/canonical/${candidateId}/raw`
      })
      const outputs = Array.isArray(generated.response?.result?.outputs) ? generated.response.result.outputs : []
      if (outputs.length !== 1) throw new Error('canonical candidate requires exactly one Provider output')
      const output = outputs[0]
      const outputPath = path.join(dataDir, output.dataRelativePath)
      const cutout = await prepareGeneratedKeyframeOutput(outputPath)
      const metrics = await readImageMaskMetrics(outputPath)
      const eligible = cutout.safe && metrics.visiblePixels > 0 && metrics.edgeRatio === 0 && metrics.minPaddingRatio >= 0.05
      const sha256 = sha256File(outputPath)
      const descriptors = await createSpriteImageDescriptors({ imagePath: outputPath })
      return {
        candidateId,
        sha256,
        path: outputPath,
        relativePath: output.dataRelativePath,
        promptRelativePath,
        model: generated.selectedModel,
        eligible,
        score: eligible ? Math.round((1 - metrics.centerOffsetRatio) * 100) : 0,
        canonicalMetrics: await canonicalMetrics({ path: outputPath }),
        descriptors,
        artifacts: [{ role: 'raw-canonical', path: outputPath, sha256 }],
        provider: generated.response?.provider || settings.provider,
        requestId: generated.response?.result?.requestId || generated.attempts?.at(-1)?.requestId || '',
        traceContext: generated.response?.result?.traceContext || { runId: run.runId, stage: 'canonical-candidate', candidateId },
        modelAttempts: generated.attempts,
        failureCodes: eligible ? [] : [cutout.failureCondition || 'canonical-technical-qa-failed']
      }
    } catch (error) {
      const modelAttempts = Array.isArray(error?.modelAttempts) ? error.modelAttempts.slice(0, 16) : []
      return {
        candidateId,
        sha256: '',
        eligible: false,
        score: 0,
        promptRelativePath,
        descriptors: { perceptualHash: candidateId, identityDescriptor: [0], alphaMaskDescriptor: [0] },
        requestId: String(modelAttempts.at(-1)?.requestId || ''),
        traceContext: { runId: run.runId, stage: 'canonical-candidate', candidateId },
        modelAttempts,
        failureCodes: [String(error?.code || 'canonical-generation-failed').replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 120)]
      }
    }
  }
  const persistCanonicalCandidate = async (candidate) => {
    const artifacts = candidate.path
      ? collectQualityFirstCandidateArtifacts({
          dataDir,
          candidate: { ...candidate, artifacts: [{ role: 'raw-canonical', path: candidate.path, sha256: candidate.sha256 }] }
        })
      : []
    const record = writeCandidateRecord({
      dataDir,
      runId: run.runId,
      scope: 'canonical',
      candidate: {
        ...candidate,
        ...(artifacts.length ? { artifacts } : {})
      }
    })
    candidate.candidateRecordRelativePath = record.relativePath
  }
  const canonicalPool = async () => {
    const pool = await generateCanonicalCandidatePool({
      generateCandidate: generateCanonicalCandidate,
      persistCandidate: persistCanonicalCandidate
    })
    return evaluateCanonicalCandidatePool({
      pool,
      dataDir,
      runId: run.runId,
      sourcePath: sourceReference.path,
      persistCandidate: persistCanonicalCandidate
    })
  }
  const runAction = async ({ actionId, canonical, profile }) => {
    const action = plan.actions.find((entry) => entry.actionId === actionId)
    if (!action) return { ok: false, actionId, disposition: 'omitted', failureCode: 'action_not_in_plan', candidates: [] }
    const actionProfile = profile || readPersistedScaleProfile()
    const reusable = resolveReusableActionResult({
      dataDir,
      runId: run.runId,
      actionId,
      planHash: plan.hash,
      canonicalHash: canonical?.sha256,
      profileHash: actionProfile?.hash,
      processorVersion: 1,
      qualityProfileHash: qualityProfile.hash,
      requireBindings: true
    })
    if (reusable) {
      const frames = reusable.row.frames.map((frame, index) => ({
        ...frame,
        index: Number.isInteger(frame.frameIndex) ? frame.frameIndex : (Number.isInteger(frame.index) ? frame.index : index),
        durationMs: Number(frame.durationMs) || 120
      }))
      return {
        ok: true,
        actionId,
        disposition: 'accepted',
        checkpointReused: true,
        selectedCandidateId: `checkpoint-${actionId}`,
        selectedCandidate: {
          candidateId: `checkpoint-${actionId}`,
          model: String(reusable.model || ''),
          processed: { frames },
          qa: { ok: true, failures: [] },
          gate: { ok: true, outcome: 'pass', failures: [] }
        },
        candidates: []
      }
    }
    const anchorPath = path.join(dataDir, `runs/${run.runId}/references/${actionId}/anchor-grid.png`)
    const boardPath = path.join(dataDir, `runs/${run.runId}/references/${actionId}/action-reference-board.png`)
    const canonicalPath = path.join(dataDir, canonical.relativePath)
    await createCharacterAnchorGrid({ masterPath: canonicalPath, layout: action.layout, outputPath: anchorPath, dataDir, planRevision: plan.revision })
    await createActionReferenceBoard({ anchorGridPath: anchorPath, sourceDetailPath: sourceReference.path, outputPath: boardPath, dataDir, metadata: { actionId, planHash: plan.hash } })
    const boardRelativePath = path.relative(dataDir, boardPath).replace(/\\/g, '/')
    const runner = await generateSelectedFullPetAction({
      context: { actionId, duplicateThresholds: { perceptualHashDistance: 4, identityDescriptorDistance: 0.08, alphaMaskDistance: 0.08 } },
      reserveCreativeDispatch: async () => {},
      generateCandidate: async ({ candidateId }) => {
        const task = createProviderImageTask({
          taskType: 'action-frame-sheet',
          stage: 'final',
          canvas: action.layout.canvas,
          sheet: { frameCount: action.frameCount, columns: action.layout.columns, rows: action.layout.rows, readingOrder: 'left-to-right-top-to-bottom' },
          referenceRole: 'action-reference-board',
          subject: { count: 1, framing: 'full-body', targetOccupancyPercent: 72, safePaddingPercent: 10, rootAnchor: 'lower-center' },
          action: { name: actionId, moment: action.framePlan.join('; '), movingParts: action.movingParts, lockedParts: action.fixedParts, loopIntent: 'closed loop', framePlan: action.framePlan },
          actionClass: action.actionClass,
          anchorPolicy: action.anchorPolicy,
          componentPolicy: action.componentPolicy,
          effectPolicy: action.effectPolicy,
          motionPresetId: action.motionPresetId,
          framePlanVersion: action.framePlanVersion
        })
        const buildPromptForModel = (model) => {
          const compiled = compileProviderImagePrompt({ task, model })
          return { prompt: compiled.text, promptCompiler: compiled.safeSummary }
        }
        const compiled = buildPromptForModel(String(settings.model || 'gpt-image-2'))
        const promptRelativePath = `runs/${run.runId}/prompts/quality-first/${actionId}-${candidateId}.txt`
        fs.mkdirSync(path.dirname(path.join(dataDir, promptRelativePath)), { recursive: true })
        fs.writeFileSync(path.join(dataDir, promptRelativePath), `${compiled.prompt}\n`)
        const generated = await generateWithModelFallback({ settings, preferredModel: String(settings.model || ''), prompt: compiled.prompt, promptCompiler: compiled.promptCompiler, buildPromptForModel, constraints: resolveCompiledPromptConstraints(compiled), requestedTimeoutMs: Math.max(Number(settings.timeoutMs) || 0, CREATOR_PROVIDER_MIN_TIMEOUT_MS), referenceImages: [{ ...sourceReference, path: boardPath, relativePath: boardRelativePath, role: 'action-reference-board' }], runId: run.runId, traceContext: { runId: run.runId, actionId, stage: 'action-candidate', candidateId }, dataRelativeDir: `runs/${run.runId}/candidates/${actionId}/${candidateId}/raw` })
        const output = generated.response?.result?.outputs?.length === 1 ? generated.response.result.outputs[0] : null
        if (!output) throw new Error('action candidate requires exactly one Provider output')
        const rawPath = path.join(dataDir, output.dataRelativePath)
        const outputDir = path.join(dataDir, `runs/${run.runId}/candidates/${actionId}/${candidateId}/processed`)
        return { candidateId, rawPath, promptRelativePath, model: generated.selectedModel, requestId: generated.response?.result?.requestId || generated.attempts?.at(-1)?.requestId || '', traceContext: generated.response?.result?.traceContext || { runId: run.runId, actionId, stage: 'action-candidate', candidateId }, modelAttempts: generated.attempts, sha256: sha256File(rawPath), descriptors: await createSpriteImageDescriptors({ imagePath: rawPath }), actionPolicy: { anchorPolicy: action.anchorPolicy }, outputDir }
      },
      processCandidate: async (candidate) => {
        const processed = await processSpriteSheet({ inputPath: candidate.rawPath, outputDir: candidate.outputDir, layout: action.layout, profile: actionProfile, actionPolicy: { ...action, actionId } })
        const qa = analyzeSpriteCandidate({ actionId, rawMetrics: processed.metrics, profile: actionProfile, actionPolicy: action })
        return { ...candidate, processed, qa, artifacts: [{ role: 'raw-sheet', path: candidate.rawPath, sha256: candidate.sha256 }, { role: 'processed-sheet', path: processed.processedSheet.path, sha256: processed.processedSheet.sha256 }, { role: 'contact-sheet', path: processed.contactSheet.path, sha256: processed.contactSheet.sha256 }, { role: 'gif', path: processed.gif.path, sha256: processed.gif.sha256 }] }
      },
      evaluateCandidate: async (candidate) => {
        const evaluatorBoardPath = path.join(candidate.outputDir, 'evaluator-board.png')
        const board = await createActionEvaluatorBoard({ sourcePath: sourceReference.path, canonicalPath, candidateFrames: candidate.processed.frames, outputPath: evaluatorBoardPath })
        const evaluation = await requestHatchPetSpriteEvaluation({ runId: run.runId, scope: actionId === 'jumping' ? 'airborne-action' : 'grounded-action', board: { relativePath: path.relative(dataDir, board.path).replace(/\\/g, '/'), sha256: board.sha256, regions: board.regions }, qa: candidate.qa })
        return { evaluation: evaluation.evaluation, gate: evaluation.gate, evaluationEvidenceRelativePath: evaluation.evidenceRelativePath }
      },
      persistCandidate: async (candidate) => {
        const record = writeCandidateRecord({
          dataDir,
          runId: run.runId,
          scope: `action-${actionId}`,
          candidate: { ...candidate, artifacts: collectQualityFirstCandidateArtifacts({ dataDir, candidate }) }
        })
        candidate.candidateRecordRelativePath = record.relativePath
      },
      archiveCandidateRevision: async () => archiveCandidateRevision({ dataDir, runId: run.runId, scope: `action-${actionId}`, reason: 'reason-directed-repair' })
    })
    return runner
  }
  const persistActionResult = async ({ actionId, result, canonical, profile }) => {
    if (result?.checkpointReused === true) {
      return readActionCheckpoints({ dataDir, runId: run.runId }).actions?.[actionId] || null
    }
    const actionPolicy = plan.actions.find((entry) => entry.actionId === actionId)
    const officialRow = getOfficialFullPetRow(actionId)
    const selected = result?.selectedCandidate
    const candidateEvidence = [selected, ...(Array.isArray(result?.candidates) ? result.candidates : [])].filter((candidate) => candidate && typeof candidate === 'object')
    const requestIds = [...new Set(candidateEvidence.flatMap((candidate) => [
      candidate.requestId,
      ...(Array.isArray(candidate.modelAttempts) ? candidate.modelAttempts.map((attempt) => attempt?.requestId) : [])
    ]).map(String).filter((value) => value && value !== 'undefined'))].slice(0, 16)
    const modelAttempts = candidateEvidence.flatMap((candidate) => Array.isArray(candidate.modelAttempts) ? candidate.modelAttempts : []).slice(0, 16)
    const frames = Array.isArray(selected?.processed?.frames) ? selected.processed.frames : []
    const safeFrames = frames.filter((frame) => frame?.path && fs.existsSync(frame.path))
    const packageFrameDir = path.join(dataDir, `runs/${run.runId}/quality-first/frames/${actionId}`)
    fs.mkdirSync(packageFrameDir, { recursive: true })
    const packagedFrames = []
    for (const [index, frame] of safeFrames.entries()) {
      const metadata = await sharp(frame.path).metadata()
      const packagedPath = path.join(packageFrameDir, `${String(index + 1).padStart(2, '0')}.png`)
      if (metadata.width === 192 && metadata.height === 208) {
        fs.copyFileSync(frame.path, packagedPath)
      } else {
        await sharp({ create: { width: 192, height: 208, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
          .composite([{ input: frame.path, left: 32, top: 40 }])
          .png()
          .toFile(packagedPath)
      }
      packagedFrames.push({
        path: packagedPath,
        index: Number.isInteger(frame.index) ? frame.index : index,
        durationMs: officialRow?.durations?.[index] || actionPolicy?.durations?.[index] || 120
      })
    }
    const checkpointResult = {
      actionId,
      ok: result?.ok === true && safeFrames.length > 0,
      outputCount: safeFrames.length,
      model: selected?.model || '',
      requestIds,
      ...(modelAttempts.length ? { modelAttempts } : {}),
      generationStages: [{
        actionId,
        stage: 'action-candidate',
        ok: result?.ok === true,
        requestIds
      }],
      failureConditions: result?.ok === true ? [] : [String(result?.failureCode || 'action_quality_gate_failed')],
      error: result?.ok === true ? '' : String(result?.failureCode || 'action_quality_gate_failed'),
      bindings: {
        planHash: String(plan.hash || '').slice(0, 128),
        canonicalHash: String(canonical?.sha256 || '').slice(0, 128),
        profileHash: String(profile?.hash || '').slice(0, 128),
        processorVersion: 1,
        qualityProfileHash: String(qualityProfile?.hash || '').slice(0, 128)
      },
      row: packagedFrames.length > 0 ? {
        actionId,
        quality: actionId === 'running-left' ? 'approved-mirror' : 'row-real',
        frames: packagedFrames.map((frame) => ({
          path: frame.path,
          frameIndex: frame.index,
          durationMs: frame.durationMs
        }))
      } : undefined
    }
    return writeActionCheckpoint({ dataDir, runId: run.runId, result: checkpointResult })
  }
  const finalizePackage = async ({ canonical }) => {
    const checkpoints = readActionCheckpoints({ dataDir, runId: run.runId })
    const officialRows = Object.values(checkpoints.actions || {})
      .filter((entry) => entry?.ok === true && entry.row?.frames?.length)
      .map((entry) => ({
        actionId: entry.actionId,
        quality: entry.row.quality,
        sourceRelativePath: entry.row.frames[0].relativePath,
        frames: entry.row.frames.map((frame) => ({
          path: path.resolve(dataDir, frame.relativePath),
          index: frame.frameIndex,
          durationMs: frame.durationMs
        }))
      }))
    if (!officialRows.some((row) => row.actionId === 'idle')) return null
    const atlasGenerationResult = {
      outputs: [{ dataRelativePath: canonical.relativePath }]
    }
    const outputDir = path.join(dataDir, `runs/${run.runId}/quality-first/package`)
    const qaDir = path.join(dataDir, `runs/${run.runId}/quality-first/qa`)
    const packaged = await buildRealAtlasFromGeneratedImage({
      dataDir,
      generationResult: atlasGenerationResult,
      outputDir,
      qaDir,
      officialRows,
      qualityProfile
    })
    const visualEvaluation = await evaluateQualityFirstFinalPackage({
      dataDir,
      runId: run.runId,
      sourcePath: sourceReference.path,
      canonicalPath: path.join(dataDir, canonical.relativePath),
      spritesheetPath: packaged.spritesheetPath,
      atlasQaPath: packaged.atlasQaPath
    })
    const generatedImage = {
      ok: true,
      backend: PROVIDER_BACKEND,
      provider: String(settings.provider || 'openai-compatible'),
      model: String(canonical.model || settings.model || ''),
      generatedAt: new Date().toISOString(),
      conditioning: {
        mode: 'image-edit',
        endpoint: '/images/edits',
        referenceImageCount: 1,
        requestedOutputCount: 1
      },
      outputs: [{
        dataRelativePath: canonical.relativePath,
        mimeType: 'image/png',
        sha256: canonical.sha256
      }]
    }
    const creatorStudio = createCreatorStudioMetadata(run)
    const petJsonPath = path.join(outputDir, 'pet.json')
    fs.writeFileSync(petJsonPath, `${JSON.stringify({
      id: run.petId,
      displayName: run.input?.petName || run.petId,
      description: run.input?.prompt || `A generated pet named ${run.input?.petName || run.petId}.`,
      spritesheetPath: 'spritesheet.webp',
      requiredActionIds: packaged.basicActions?.requiredRealActionIds || ['idle'],
      availableActionIds: packaged.basicActions?.availableActionIds || ['idle'],
      omittedActionIds: packaged.basicActions?.omittedActionIds || [],
      actionAvailability: packaged.basicActions?.actionAvailability || {},
      ...(creatorStudio ? { creatorStudio } : {}),
      generatedImage,
      imageGeneration: {
        backend: PROVIDER_BACKEND,
        provider: generatedImage.provider,
        model: generatedImage.model,
        generatedAt: generatedImage.generatedAt,
        pipeline: 'quality-first-v1'
      }
    }, null, 2)}\n`)
    const bundlePath = path.join(outputDir, `${run.petId}.codex-pet.zip`)
    writeZip(outputDir, bundlePath)
    return {
      spritesheetRelativePath: path.relative(dataDir, packaged.spritesheetPath).replace(/\\/g, '/'),
      atlasQaRelativePath: path.relative(dataDir, packaged.atlasQaPath).replace(/\\/g, '/'),
      sourceQaRelativePath: path.relative(dataDir, packaged.sourceQaPath).replace(/\\/g, '/'),
      petJsonRelativePath: path.relative(dataDir, petJsonPath).replace(/\\/g, '/'),
      bundleRelativePath: path.relative(dataDir, bundlePath).replace(/\\/g, '/'),
      basicActions: packaged.basicActions,
      spritesheetSha256: sha256File(packaged.spritesheetPath),
      bundleSha256: sha256(bundlePath),
      visualEvaluation,
      artifacts: {
        outputDir,
        petJson: petJsonPath,
        spritesheet: packaged.spritesheetPath,
        bundle: bundlePath,
        qa: packaged.atlasQaPath,
        sourceImageQa: packaged.sourceQaPath,
        generatedImage
      }
    }
  }
  const persistScaleProfile = async ({ profile }) => {
    const relativePath = `runs/${run.runId}/character-scale-profile.json`
    writeJsonFile(path.join(dataDir, relativePath), profile)
    return { relativePath, hash: String(profile?.hash || '') }
  }
  const mirrorRunningLeft = async ({ source }) => {
    const selected = source?.selectedCandidate
    const sourceFrames = Array.isArray(selected?.processed?.frames) ? selected.processed.frames : []
    const outputDir = path.join(dataDir, `runs/${run.runId}/candidates/running-left/mirror`)
    fs.mkdirSync(outputDir, { recursive: true })
    const mirroredFrames = []
    for (const [index, frame] of sourceFrames.entries()) {
      const outputPath = path.join(outputDir, `${String(index + 1).padStart(2, '0')}.png`)
      await sharp(frame.path).flop().png().toFile(outputPath)
      mirroredFrames.push({ ...frame, path: outputPath, index })
    }
    return {
      ok: mirroredFrames.length === sourceFrames.length && mirroredFrames.length > 0,
      actionId: 'running-left',
      mirroredFrom: 'running-right',
      selectedCandidateId: `${source.selectedCandidateId || 'running-right'}-mirror`,
      selectedCandidate: {
        model: selected?.model || '',
        processed: { frames: mirroredFrames },
        qa: { ok: mirroredFrames.length > 0, failures: [] },
        gate: { ok: mirroredFrames.length > 0, outcome: 'pass', failures: [] }
      },
      candidates: []
    }
  }
  const createRecoveryBundle = ({ run: recoveryRun, actionResults, reason }) => createQualityFirstRecoveryBundle({
    dataDir,
    run: recoveryRun,
    actionResults,
    reason
  })
  const createRuntimeCharacterScaleProfile = async ({ canonical, idle }) => {
    if (idle?.checkpointReused === true) {
      const persisted = readPersistedScaleProfile()
      if (persisted) return persisted
    }
    return createCharacterScaleProfile({
      canonicalMetrics: canonical.canonicalMetrics,
      idleMetrics: idle.selectedCandidate?.processed?.metrics?.frames || [],
      characterClass: plan.character.assetClass,
      anchorPolicy: 'compact-contact-root-v1',
      canonicalMasterSha256: canonical.sha256,
      idleCheckpointSha256: idle.selectedCandidateId,
      processorVersion: 1
    })
  }
  const orchestrator = createQualityFirstFullPetOrchestrator({
    generateCanonicalCandidatePool: canonicalPool,
    runQualityFirstAction: runAction,
    createCharacterScaleProfile: createRuntimeCharacterScaleProfile,
    mirrorRunningLeft,
    persistActionResult,
    persistScaleProfile,
    finalizePackage,
    createRecoveryBundle,
    recordEvent: ({ scope, status, actionId, candidateCount, failureCode }) => {
      if (scope !== 'action') return
      const safeActionId = String(actionId || '').replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 120)
      const event = `quality-first.action.${status}`
      try {
        appendRunLog({
          dataDir,
          runId: run.runId,
          level: status === 'failed' ? 'error' : 'info',
          event,
          message: status === 'started'
            ? `Quality-first action ${safeActionId} generation started`
            : status === 'completed'
              ? `Quality-first action ${safeActionId} generation completed`
              : `Quality-first action ${safeActionId} generation failed`,
          data: {
            actionId: safeActionId,
            ...(Number.isInteger(candidateCount) ? { candidateCount } : {}),
            ...(status === 'failed' ? { failureCode: String(failureCode || 'action_quality_gate_failed').replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 120) } : {})
          }
        })
      } catch (_) {
        // Diagnostics are supplementary evidence; a journal write failure must not abort generation.
      }
    },
    now: () => new Date().toISOString()
  })
  return {
    plan,
    planResult,
    requireIdentityReviewBeforeActions: planResult.requireIdentityReviewBeforeActions === true,
    orchestrator,
    sourceReference,
    planRelativePath,
    createCharacterScaleProfile: createRuntimeCharacterScaleProfile,
    runAction,
    mirrorRunningLeft,
    createRecoveryBundle,
    persistActionResult,
    finalizePackage,
    persistScaleProfile
  }
}

const generateViaHostModelBridge = async ({ backend, run, dataDir }) => {
  const normalizedBackend = normalizeCreatorBackend(backend, FIXTURE_BACKEND)
  if (isFullPetRun(run)) {
    const error = new Error('Creator Studio legacy full-pet host generation has been removed; use quality-first-v1 orchestration')
    error.code = 'legacy_full_pet_pipeline_removed'
    throw error
  }
  if (!process.env.OPENPET_BRIDGE_URL || !process.env.OPENPET_BRIDGE_TOKEN) {
    const { BackendUnavailableError } = require('./backend-adapters')
    throw new BackendUnavailableError({
      backend: normalizedBackend,
      message: 'Provider backend is not configured. Configure model settings in OpenPet before running provider generation.'
    })
  }

  const settings = await readHostModelSettings()
  const governance = loadPetGenerationGovernance()
  const providerArtApprovals = loadConfiguredProviderArtApprovals()
  const { qualityProfile, qualityGuidance } = governance
  const generationDeadlineMs = isFullPetRun(run)
    ? Date.now() + FULL_PET_WORKFLOW_MAX_DURATION_MS
    : 0
  const configuredModelSnapshot = createModelSnapshot({ backend: normalizedBackend, settings })
  const initialArtReadiness = resolveProviderArtReadinessForModels({
    settings,
    models: [],
    governance,
    approvals: providerArtApprovals
  })
  const requestedTimeoutMs = Math.max(Number(settings.timeoutMs) || 0, CREATOR_PROVIDER_MIN_TIMEOUT_MS)
  const originalReferenceImage = resolveOriginalReferenceImage({ dataDir, run })
  const originalReferenceImages = isUsableLocalReferenceImage({ dataDir, referenceImage: originalReferenceImage })
    ? [originalReferenceImage]
    : []
  if (originalReferenceImages.length === 0) {
    throw createProviderReferenceContractError(
      'reference_image_required',
      'Creator Studio generation requires one usable local reference image'
    )
  }
  assertExactlyOneProviderReferenceImage(originalReferenceImages)
  const firstActionForReference = Array.isArray(run?.generationTask?.actions)
    ? run.generationTask.actions[0]
    : Array.isArray(run?.input?.generationTask?.actions)
      ? run.input.generationTask.actions[0]
      : null
  const canonicalSingleAction = isSingleActionRun(run) && Boolean(firstActionForReference)
  const useCanonicalProviderKeyframePath = Boolean(
    canonicalSingleAction &&
    hasAnchorEligibleRunReference(run) &&
    hasUsableLocalReferenceImages(originalReferenceImages, dataDir)
  )
  let anchorReferences = null
  let anchorGeneration = null
  let runForGeneration = run
  if (useCanonicalProviderKeyframePath) {
    anchorReferences = createCanonicalProviderOnlyAnchorReferences()
    runForGeneration = {
      ...run,
      artifacts: {
        ...(run.artifacts || {}),
        anchorReferences
      }
    }
  } else if (hasAnchorEligibleRunReference(run) && hasUsableLocalReferenceImages(originalReferenceImages, dataDir)) {
    const generatedAnchors = await generateAnchorReferences({
      dataDir,
      run,
      settings,
      selectedModel: configuredModelSnapshot.model,
      requestedTimeoutMs: resolveGenerationStageTimeout({ requestedTimeoutMs, deadlineMs: generationDeadlineMs }),
      originalReferenceImages,
      qualityProfile,
      qualityGuidance
    })
    anchorReferences = generatedAnchors.anchorReferences
    anchorGeneration = generatedAnchors.anchorGeneration
    if (anchorReferences) {
      runForGeneration = {
        ...run,
        artifacts: {
          ...(run.artifacts || {}),
          anchorReferences
        }
      }
    }
  }
  const buildPromptForModel = (model) => buildOpenPetImagePrompt({
    run: runForGeneration,
    backend: normalizedBackend,
    model,
    qualityGuidance,
    constraints: DEFAULT_CONSTRAINTS,
    referenceRole: String(originalReferenceImages[0]?.role || 'single-character-reference')
  })
  const promptBuild = buildPromptForModel(configuredModelSnapshot.model)
  const providerPrompt = String(promptBuild.providerPrompt || promptBuild.prompt || '')
  const promptPreviewText = providerPrompt
  const keyframeSpriteRow = canonicalSingleAction
    ? await generateKeyframeActionSpriteRow({
        dataDir,
        run,
        settings,
        selectedModel: configuredModelSnapshot.model,
        requestedTimeoutMs,
        action: firstActionForReference,
        originalReferenceImages,
        qualityProfile,
        qualityGuidance
      })
    : null
  const referenceImages = keyframeSpriteRow?.ok
    ? keyframeSpriteRow.referenceImages
    : resolveRequiredRunReferenceImages({
        dataDir,
        run: runForGeneration,
        stage: 'final',
        actionId: firstActionForReference?.actionId || ''
      })
  const defaultConditioning = keyframeSpriteRow?.ok
    ? createKeyframeSpriteRowConditioningSummary({
        model: keyframeSpriteRow.model || configuredModelSnapshot.model,
        referenceImages: keyframeSpriteRow.referenceImages,
        promptCompiler: keyframeSpriteRow.promptCompiler
      })
    : createDefaultConditioningSummary({
        model: configuredModelSnapshot.model,
        referenceImages,
        promptCompiler: promptBuild.promptCompiler
      })
  const promptBuilder = createPromptBuilderSummary({
    promptBuild,
    promptPreviewText
  })
  const attemptResult = {
    backend: normalizedBackend,
    model: configuredModelSnapshot.model,
    conditioning: defaultConditioning,
    outputs: [],
    usage: {
      estimatedCostUsd: 0
    },
    modelSnapshot: configuredModelSnapshot,
    promptBuilder,
    qualityGovernance: governance.evidence,
    artReadiness: initialArtReadiness
  }
  if (anchorReferences) attemptResult.anchorReferences = anchorReferences
  if (anchorGeneration) attemptResult.anchorGeneration = anchorGeneration
  const providerAnchorStages = getProviderAnchorStages(anchorGeneration)
  const keyframeSpriteRowStages = keyframeSpriteRow
    ? (Array.isArray(keyframeSpriteRow.stages)
        ? keyframeSpriteRow.stages.filter(Boolean)
        : [keyframeSpriteRow.finalStage].filter(Boolean))
    : []
  if (providerAnchorStages.length > 0 || keyframeSpriteRowStages.length > 0) {
    attemptResult.generationStages = [
      ...providerAnchorStages,
      ...keyframeSpriteRowStages
    ]
  }
  if (canonicalSingleAction && keyframeSpriteRow == null) {
    const actionId = createSafeFileSegment(firstActionForReference?.actionId, 'action')
    const error = new Error(
      `Creator Studio keyframe sprite row could not be prepared for ${actionId}; provider complete sprite rows are required for deliverable action generation.`
    )
    error.keyframeSpriteRow = {
      ok: false,
      actionId,
      error: 'keyframe sprite row reference could not be prepared'
    }
    const partialGenerationStages = providerAnchorStages
    error.partialGenerationResult = {
      ...attemptResult,
      artReadiness: resolveProviderArtReadinessForModels({
        settings,
        models: getSuccessfulGenerationModels({ stages: partialGenerationStages }),
        governance,
        approvals: providerArtApprovals
      }),
      outputs: [],
      generationStages: partialGenerationStages,
      keyframeSpriteRow: error.keyframeSpriteRow,
      ...(anchorReferences ? { anchorReferences } : {}),
      ...(anchorGeneration ? { anchorGeneration } : {})
    }
    throw error
  }
  if (keyframeSpriteRow && keyframeSpriteRow.ok === false) {
    const actionId = createSafeFileSegment(firstActionForReference?.actionId, 'action')
    const detail = String(keyframeSpriteRow.error || 'Creator Studio keyframe sprite row generation failed')
    const error = new Error(
      canonicalSingleAction
        ? `Creator Studio keyframe sprite row could not be prepared for ${actionId}; provider complete sprite rows are required for deliverable action generation. Provider error: ${detail}`
        : detail
    )
    error.keyframeSpriteRow = {
      ok: false,
      actionId: keyframeSpriteRow.actionId,
      promptRelativePath: keyframeSpriteRow.promptRelativePath,
      error: keyframeSpriteRow.error || '',
      keyframes: Array.isArray(keyframeSpriteRow.keyframes) ? keyframeSpriteRow.keyframes : [],
      ...(keyframeSpriteRow.referenceBoard ? { referenceBoard: keyframeSpriteRow.referenceBoard } : {})
    }
    const partialGenerationStages = [
      ...providerAnchorStages,
      ...keyframeSpriteRowStages
    ]
    error.partialGenerationResult = {
      ...attemptResult,
      artReadiness: resolveProviderArtReadinessForModels({
        settings,
        models: getSuccessfulGenerationModels({ stages: partialGenerationStages }),
        governance,
        approvals: providerArtApprovals
      }),
      conditioning: createKeyframeSpriteRowConditioningSummary({
        model: configuredModelSnapshot.model,
        referenceImages: keyframeSpriteRow.referenceImages,
        promptCompiler: keyframeSpriteRow.promptCompiler
      }),
      outputs: [],
      generationStages: partialGenerationStages,
      keyframeSpriteRow: error.keyframeSpriteRow,
      ...(anchorReferences ? { anchorReferences } : {}),
      ...(anchorGeneration ? { anchorGeneration } : {})
    }
    throw error
  }
  if (keyframeSpriteRow?.ok) {
    const keyframeArtReadiness = resolveProviderArtReadinessForModels({
      settings,
      models: getSuccessfulGenerationModels({
        primaryModel: keyframeSpriteRow.model || configuredModelSnapshot.model,
        stages: keyframeSpriteRowStages
      }),
      governance,
      approvals: providerArtApprovals
    })
    return {
      ...attemptResult,
      artReadiness: keyframeArtReadiness,
      outputs: keyframeSpriteRow.output ? [keyframeSpriteRow.output] : [],
      ok: Boolean(keyframeSpriteRow.output),
      requestId: '',
      provider: String(settings.provider || 'openai-compatible'),
      generatedAt: new Date().toISOString(),
      model: keyframeSpriteRow.model || configuredModelSnapshot.model,
      modelAttempts: keyframeSpriteRow.modelAttempts || [],
      generationStages: [
        ...providerAnchorStages,
        ...keyframeSpriteRowStages
      ],
      keyframeSpriteRow: {
        ok: true,
        actionId: keyframeSpriteRow.actionId,
        outputRelativePath: keyframeSpriteRow.output?.dataRelativePath || '',
        promptRelativePath: keyframeSpriteRow.promptRelativePath,
        model: keyframeSpriteRow.model,
        keyframes: Array.isArray(keyframeSpriteRow.keyframes) ? keyframeSpriteRow.keyframes : [],
        ...(keyframeSpriteRow.referenceBoard ? { referenceBoard: keyframeSpriteRow.referenceBoard } : {})
      },
      ...(anchorReferences ? { anchorReferences } : {}),
      ...(anchorGeneration ? { anchorGeneration } : {})
    }
  }
  let response
  let selectedModel = configuredModelSnapshot.model
  let modelAttempts = []
  let baseStageTimeoutMs = requestedTimeoutMs
  try {
    baseStageTimeoutMs = resolveGenerationStageTimeout({ requestedTimeoutMs, deadlineMs: generationDeadlineMs })
    const generationAttempt = await generateWithModelFallback({
      settings,
      preferredModel: configuredModelSnapshot.model,
      prompt: providerPrompt,
      promptCompiler: promptBuild.promptCompiler,
      buildPromptForModel,
      constraints: resolveCompiledPromptConstraints(promptBuild),
      requestedTimeoutMs: baseStageTimeoutMs,
      referenceImages,
      runId: run.runId,
      traceContext: { runId: run.runId, actionId: firstActionForReference?.actionId || '', stage: 'final-image' },
      dataRelativeDir: `runs/${run.runId}/frames/base`
    })
    response = generationAttempt.response
    selectedModel = generationAttempt.selectedModel
    modelAttempts = generationAttempt.attempts
  } catch (error) {
    const failedAttempts = Array.isArray(error?.modelAttempts) ? error.modelAttempts : modelAttempts
    const failedFinalStage = createProviderGenerationStage({
      stage: 'final-image',
      ok: false,
      referenceImages,
      timeoutMs: baseStageTimeoutMs,
      durationMs: sumAttemptDurationsMs(failedAttempts),
      model: configuredModelSnapshot.model,
      modelAttempts: failedAttempts,
      qualityProfile,
      error: error?.message || error
    })
    if (error && typeof error === 'object') {
      const partialGenerationStages = [
        ...providerAnchorStages,
        failedFinalStage
      ]
      error.partialGenerationResult = {
        ...attemptResult,
        artReadiness: resolveProviderArtReadinessForModels({
          settings,
          models: getSuccessfulGenerationModels({ stages: partialGenerationStages }),
          governance,
          approvals: providerArtApprovals
        }),
        modelAttempts: failedAttempts,
        generationStages: partialGenerationStages
      }
    }
    throw error
  }

  const modelSnapshot = {
    ...configuredModelSnapshot,
    model: selectedModel
  }
  const artReadiness = resolveProviderArtReadinessForModels({
    settings,
    models: getSuccessfulGenerationModels({
      primaryModel: selectedModel,
      stages: providerAnchorStages
    }),
    governance,
    approvals: providerArtApprovals
  })
  const result = {
    ...attemptResult,
    ...response.result,
    conditioning: response?.result?.conditioning || defaultConditioning,
    qualityGovernance: governance.evidence,
    artReadiness,
    modelSnapshot,
    promptBuilder,
    model: selectedModel,
    modelAttempts,
    generationStages: [
      ...providerAnchorStages,
      createProviderGenerationStage({
        stage: 'final-image',
        ok: true,
        referenceImages,
        timeoutMs: baseStageTimeoutMs,
        durationMs: sumAttemptDurationsMs(modelAttempts),
        model: selectedModel,
        modelAttempts,
        outputCount: Array.isArray(response?.result?.outputs) ? response.result.outputs.length : 0,
        qualityProfile
      })
    ],
    ...(anchorReferences ? { anchorReferences } : {}),
    ...(anchorGeneration ? { anchorGeneration } : {})
  }

  return result
}

module.exports = {
  __testInternals: {
    buildHostPromptCandidateModels,
    assertExactlyOneProviderReferenceImage,
    createFullPetActionIdentityContext,
    collectQualityFirstCandidateArtifacts,
    createCanonicalRequestedChanges,
    evaluateCanonicalCandidatePool,
    createSoftIdentityRetryRequestedChanges,
    generateActionKeyframe,
    generateWithModelFallback,
    evaluateActionKeyframeQuality,
    getSuccessfulGenerationModels,
    isSoftIdentityDescriptorRetryEligible,
    prepareGeneratedKeyframeOutput,
    generateCanonicalCandidatePool,
    generateSelectedFullPetAction,
    createQualityFirstHostRuntime,
    requestHatchPetSpriteEvaluation,
    requestHatchPetSpritePlan,
    resolveProviderArtReadinessForModels,
    resolveGenerationStageTimeout,
    scoreActionAnchorMetrics,
    SOFT_IDENTITY_DESCRIPTOR_RETRY_BAND
  },
  generateAnchorReferences,
  generateCanonicalCandidatePool,
  generateSelectedFullPetAction,
  createQualityFirstRecoveryBundle,
  createQualityFirstHostRuntime,
  evaluateQualityFirstFinalPackage,
  generateViaHostModelBridge,
  requestHatchPetSpriteEvaluation,
  requestHatchPetSpritePlan,
  resolveRequiredRunReferenceImages,
  resolveRunReferenceImages,
  FULL_PET_WORKFLOW_MAX_DURATION_MS
}
