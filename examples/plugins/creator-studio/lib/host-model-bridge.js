const { callBridge } = require('./bridge-client')
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
const { GENERATED_FULL_PET_ACTION_IDS } = require('./full-pet-basic-actions')
const { getActionSheetLayout } = require('./action-sheet-layout')
const { inferAnimationType } = require('./action-semantics')
const {
  averageIdentityDescriptors,
  createIdentityDescriptor,
  identityDescriptorDistance
} = require('./identity-descriptor')
const { extractRowStripFrames } = require('./full-pet-row-extractor')
const { FULL_PET_ROW_QUALITY, getOfficialFullPetRow } = require('./full-pet-row-contract')
const { validateGeneratedImageOutput } = require('./real-atlas-builder')
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
const BASIC_ACTION_MIN_TIMEOUT_MS = 300000
const FALLBACK_MODEL_MIN_TIMEOUT_MS = 600000
const FULL_PET_WORKFLOW_MAX_DURATION_MS = 90 * 60 * 1000
const MAX_IDENTITY_DESCRIPTOR_DISTANCE = 90
const PROMPT_PREVIEW_MAX_LENGTH = 8000
const DIRECT_SOURCE_ACTION_ANCHOR_CANDIDATE_COUNT = 3
const MIN_ACCEPTABLE_ACTION_ANCHOR_SCORE = 50
const MIN_ACCEPTABLE_ACTION_KEYFRAME_SCORE = 30
const KNOWN_FALLBACK_IMAGE_MODELS = [
  'gpt-image-2',
  'gpt-image-1.5'
]

const ACTION_ANCHOR_CANDIDATE_VARIANTS = Object.freeze([
  {
    id: 'source-faithful-key-pose',
    guidance: 'Candidate guidance: prioritize exact source-image identity, green/eye/facial/marking fidelity when visible, and a clear single action key pose.'
  },
  {
    id: 'clean-cutout-motion-readable',
    guidance: 'Candidate guidance: prioritize a clean full-body cutout with no floor or shadow, strong readable raised-paw silhouette, and unchanged body/head/root anchor.'
  },
  {
    id: 'identity-locked-desktop-sprite',
    guidance: 'Candidate guidance: prioritize desktop-pet usability: centered full body, stable lower-center root, source-faithful fur/material detail, and one obvious moving paw.'
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
  const normalizedPreferredModel = normalizeModelName(preferredModel)
  const hasHostWorkflowModelPolicy = Boolean(
    settings?.creatorWorkflowModelPolicy &&
    Array.isArray(settings.creatorWorkflowModelPolicy.verifiedModels)
  )
  const hostPolicyVerifiedModels = Array.isArray(settings?.creatorWorkflowModelPolicy?.verifiedModels)
    ? settings.creatorWorkflowModelPolicy.verifiedModels
    : []
  const hostPolicyFallbackModels = Array.isArray(settings?.creatorWorkflowModelPolicy?.fallbackModels)
    ? settings.creatorWorkflowModelPolicy.fallbackModels
    : []
  if (hasHostWorkflowModelPolicy) {
    const preferredModelVerified = normalizedPreferredModel &&
      hostPolicyVerifiedModels.some((candidate) => normalizeModelName(candidate) === normalizedPreferredModel)
    if (preferredModelVerified) addCandidate(normalizedPreferredModel)
    for (const candidate of hostPolicyVerifiedModels) addCandidate(candidate)
    for (const candidate of hostPolicyFallbackModels) addCandidate(candidate)
    return candidates
  }
  addCandidate(normalizedPreferredModel)
  for (const candidate of KNOWN_FALLBACK_IMAGE_MODELS) {
    if (isEligibleFallbackModel({ settings, candidate })) addCandidate(candidate)
  }
  const discoveredModels = Array.isArray(settings?.modelCatalog?.models) ? settings.modelCatalog.models : []
  for (const candidate of discoveredModels) {
    if (isEligibleFallbackModel({ settings, candidate })) addCandidate(candidate)
  }
  return candidates
}

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

const readHostModelSettings = async () => {
  try {
    const response = await callBridge('/creator/model-settings')
    return response.config || {}
  } catch (_) {
    return {}
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

const createKeyframeSpriteRowConditioningSummary = ({ model, referenceImages = [] }) => ({
  mode: 'provider-keyframe-sprite-row',
  endpoint: '/images/edits',
  referenceImageCount: Array.isArray(referenceImages) ? referenceImages.length : 0,
  references: Array.isArray(referenceImages)
    ? referenceImages.map((referenceImage) => ({
        fileName: referenceImage.fileName,
        relativePath: referenceImage.relativePath,
        metadataRelativePath: referenceImage.metadataRelativePath,
        role: referenceImage.role
      }))
    : [],
  model: String(model || '')
})

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

const assertSingleProviderReferenceImage = (referenceImages = []) => {
  if (!Array.isArray(referenceImages) || referenceImages.length <= 1) return
  throw new Error('Creator Studio provider image requests support at most one local reference image; build one conditioning board before calling the image provider.')
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
  durationMs = 0
}) => ({
  model: normalizeModelName(model),
  ok: Boolean(ok),
  timeoutMs: Math.max(0, Number(timeoutMs) || 0),
  durationMs: Math.max(0, Number(durationMs) || 0),
  referenceImageCount: Array.isArray(referenceImages) ? referenceImages.length : 0,
  referenceRoles: listReferenceRoles(referenceImages),
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
  adopted = false
}) => {
  const referenceRoles = listReferenceRoles(referenceImages)
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
    outputRelativePath: createSafeRelativePath(outputRelativePath),
    promptRelativePath: createSafeRelativePath(promptRelativePath),
    outputCount: Math.max(0, Number(outputCount) || 0),
    ...(adopted ? { adopted: true } : {}),
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

const findGenerationAction = (run = {}, actionId) => {
  const actions = Array.isArray(run?.generationTask?.actions)
    ? run.generationTask.actions
    : Array.isArray(run?.input?.generationTask?.actions)
      ? run.input.generationTask.actions
      : []
  return actions.find((action) => action?.actionId === actionId) || null
}

const callHostImageGenerate = ({ prompt, requestedTimeoutMs, referenceImages, runId, dataRelativeDir, model }) => callBridge('/creator/model-image-generate', {
  model,
  prompt,
  timeoutMs: requestedTimeoutMs,
  referenceImages,
  output: {
    dataRelativeDir
  },
  constraints: DEFAULT_CONSTRAINTS
})

const callHostImageGenerate = ({
  expectedModel,
  prompt,
  promptCompiler,
  promptVariants = [],
  requestedTimeoutMs,
  referenceImages,
  runId,
  dataRelativeDir,
  constraints = DEFAULT_CONSTRAINTS
}) => {
  assertExactlyOneProviderReferenceImage(referenceImages)
  return callBridge('/creator/model-image-generate', {
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

const summarizeBasicActionAttempt = (result) => ({
  actionId: result.actionId,
  ok: result.ok,
  outputCount: result.outputCount,
  ...(result.model ? { model: result.model } : {}),
  ...(Array.isArray(result.modelAttempts) && result.modelAttempts.length > 0 ? { modelAttempts: result.modelAttempts } : {}),
  ...(Array.isArray(result.failureConditions) && result.failureConditions.length > 0
    ? { failureConditions: result.failureConditions.slice(0, 8).map((value) => String(value).slice(0, 160)) }
    : {}),
  ...(result.error ? { error: result.error } : {})
})

const averageKeyframeIdentityMeanRgb = (keyframes = []) => {
  const values = Array.isArray(keyframes)
    ? keyframes.map((keyframe) => keyframe?.quality?.metrics?.meanRgb).filter(Boolean)
    : []
  if (values.length === 0) return null
  return values.reduce((accumulator, value) => ({
    r: accumulator.r + (Number(value.r) || 0) / values.length,
    g: accumulator.g + (Number(value.g) || 0) / values.length,
    b: accumulator.b + (Number(value.b) || 0) / values.length
  }), { r: 0, g: 0, b: 0 })
}

const averageKeyframeIdentityDescriptor = (keyframes = []) => averageIdentityDescriptors(
  Array.isArray(keyframes)
    ? keyframes.map((keyframe) => keyframe?.quality?.metrics?.identityDescriptor).filter(Boolean)
    : []
)

const generateWithModelFallback = async ({
  settings = {},
  prompt,
  promptCompiler = null,
  constraints = DEFAULT_CONSTRAINTS,
  requestedTimeoutMs,
  referenceImages,
  runId,
  dataRelativeDir,
  preferredModel,
  buildPromptForModel = null,
  callHostImageGenerateImpl = callHostImageGenerate
}) => {
  assertSingleProviderReferenceImage(referenceImages)
  const attempts = []
  const modelCandidates = buildModelCandidateList({ settings, preferredModel })
  if (modelCandidates.length === 0) {
    throw new Error('Creator Studio one-click generation has no verified image model available')
  }
  let lastError = null
  for (const model of modelCandidates) {
    const startedAtMs = Date.now()
    try {
      const effectiveTimeoutMs = normalizeModelName(model) === normalizeModelName(preferredModel)
        ? requestedTimeoutMs
        : Math.max(Number(requestedTimeoutMs) || 0, FALLBACK_MODEL_MIN_TIMEOUT_MS)
      const response = await callHostImageGenerate({
        model,
        prompt,
        requestedTimeoutMs: effectiveTimeoutMs,
        referenceImages,
        runId,
        dataRelativeDir
      })
      attempts.push(createGenerationAttemptRecord({
        model,
        ok: true,
        timeoutMs: effectiveTimeoutMs,
        referenceImages,
        durationMs: Date.now() - startedAtMs
      }))
      return {
        response,
        selectedModel: model,
        attempts
      }
    } catch (error) {
      attempts.push(createGenerationAttemptRecord({
        model,
        ok: false,
        error: error?.message || error,
        timeoutMs: normalizeModelName(model) === normalizeModelName(preferredModel)
          ? requestedTimeoutMs
          : Math.max(Number(requestedTimeoutMs) || 0, FALLBACK_MODEL_MIN_TIMEOUT_MS),
        referenceImages,
        durationMs: Date.now() - startedAtMs
      }))
      lastError = error
      if (!shouldRetryWithAnotherModel(error)) break
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
  requestedChanges = [],
  generateWithFallbackImpl = generateWithModelFallback
}) => {
  const normalizedKeyframeRole = String(keyframeRole || 'start').trim().toLowerCase() === 'start'
    ? 'start'
    : 'peak'
  assertExactlyOneProviderReferenceImage(referenceImages)
  const actionId = createSafeFileSegment(action?.actionId, 'action')
  const stageName = normalizedKeyframeRole === 'start'
    ? 'action-start-keyframe'
    : 'action-peak-keyframe'
  const buildPromptForModel = (model) => buildActionKeyframePrompt({
    model,
    appearanceIntent: resolveProviderAppearanceIntent(run),
    referenceRole: listReferenceRoles(referenceImages).join(', ') || 'canonical-reference',
    action,
    keyframeRole: normalizedKeyframeRole,
    qualityGuidance,
    canvas: DEFAULT_CONSTRAINTS,
    requestedChanges
  })
  const promptBuild = buildPromptForModel(selectedModel)
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
  try {
    stageTimeoutMs = resolveGenerationStageTimeout({ requestedTimeoutMs, deadlineMs: generationDeadlineMs })
    attempt = await generateWithFallbackImpl({
      settings,
      preferredModel: selectedModel,
      model: selectedModel,
      prompt: promptBuild.prompt,
      promptCompiler: promptBuild.promptCompiler,
      buildPromptForModel,
      constraints: resolveCompiledPromptConstraints(promptBuild),
      requestedTimeoutMs: stageTimeoutMs,
      referenceImages,
      runId: run.runId,
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
          quality: evaluateActionKeyframeQuality({
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
    const selectedCandidate = passingCandidates[0] || null
    const diagnosticCandidate = selectedCandidate || [...candidates]
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
      promptRelativePath: promptFile.relativePath,
      promptCompiler: promptBuild.promptCompiler,
      model: attempt.selectedModel,
      modelAttempts: attempt.attempts,
      quality
    })
    keyframe.candidateSelection = candidateSelection
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
      promptRelativePath: promptFile.relativePath,
      promptCompiler: promptBuild.promptCompiler,
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
        promptRelativePath: promptFile.relativePath,
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
      promptRelativePath: promptFile.relativePath,
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
        promptRelativePath: promptFile.relativePath,
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
  requestedChanges = [],
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
    requestedChanges,
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
    requestedChanges,
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
  const buildPromptForModel = (model) => buildActionSpriteRowPrompt({
    model,
    appearanceIntent: resolveProviderAppearanceIntent(run),
    referenceRole: 'keyframe-action-reference-board',
    action,
    qualityGuidance,
    requestedChanges
  })
  const promptBuild = buildPromptForModel(selectedModel)
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
      buildPromptForModel,
      constraints: resolveCompiledPromptConstraints(promptBuild),
      requestedTimeoutMs: finalStageTimeoutMs,
      referenceImages: [conditioningBoardReferenceImage],
      runId: run.runId,
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
    const buildPromptForModel = (model) => buildActionAnchorPrompt({
      model,
      referenceRole: actionReferenceImage.role,
      action,
      qualityGuidance,
      canvas: DEFAULT_CONSTRAINTS,
      appearanceIntent: resolveProviderAppearanceIntent(run),
      strategyId: candidateVariant.id,
      requestedChanges: candidateVariant.requestedChanges
    })
    const candidatePromptBuild = buildPromptForModel(selectedModel)
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
        buildPromptForModel,
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
    const buildCharacterPromptForModel = (model) => buildCharacterAnchorPrompt({
      model,
      appearanceIntent: resolveProviderAppearanceIntent(run),
      referenceRole: 'composite-reference-board',
      qualityGuidance,
      canvas: DEFAULT_CONSTRAINTS
    })
    const characterPromptBuild = buildCharacterPromptForModel(selectedModel)
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
      buildPromptForModel: buildCharacterPromptForModel,
      constraints: resolveCompiledPromptConstraints(characterPromptBuild),
      requestedTimeoutMs,
      referenceImages: [compositeReferenceImage],
      runId: run.runId,
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
      const buildActionPromptForModel = (model) => buildActionAnchorPrompt({
        model,
        appearanceIntent: resolveProviderAppearanceIntent(run),
        referenceRole: actionReferenceRole,
        action,
        qualityGuidance,
        canvas: DEFAULT_CONSTRAINTS
      })
      const actionPromptBuild = buildActionPromptForModel(selectedModel)
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
          buildPromptForModel: buildActionPromptForModel,
          constraints: resolveCompiledPromptConstraints(actionPromptBuild),
          requestedTimeoutMs,
          referenceImages: [actionReferenceImage],
          runId: run.runId,
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

const addCandidateGuidanceToPrompt = ({ prompt, candidate }) => [
  String(prompt || '').trim(),
  String(candidate?.guidance || '').trim()
].filter(Boolean).join('\n\n')

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

const scoreActionAnchorMetrics = ({ metrics, referenceMetrics, action = {} }) => {
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
    if (descriptorDistance > MAX_IDENTITY_DESCRIPTOR_DISTANCE) {
      score -= Math.min(100, 55 + (descriptorDistance - MAX_IDENTITY_DESCRIPTOR_DISTANCE))
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
  'OpenPet desktop pet'
)

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

const generateActionKeyframe = async ({
  dataDir,
  run,
  settings,
  selectedModel,
  requestedTimeoutMs,
  action,
  keyframeRole = 'start',
  referenceImages = [],
  generationDeadlineMs = 0,
  generateWithFallbackImpl = generateWithModelFallback
}) => {
  const normalizedKeyframeRole = String(keyframeRole || 'start').trim().toLowerCase() === 'start'
    ? 'start'
    : 'peak'
  if (!Array.isArray(referenceImages) || referenceImages.length === 0) return null
  const actionId = createSafeFileSegment(action?.actionId, 'action')
  const stageName = normalizedKeyframeRole === 'start'
    ? 'action-start-keyframe'
    : 'action-peak-keyframe'
  const promptBuild = buildActionKeyframePrompt({
    characterBrief: resolveAnchorCharacterBrief(run),
    referenceRole: listReferenceRoles(referenceImages).join(', ') || 'canonical-reference',
    action,
    keyframeRole: normalizedKeyframeRole
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
  try {
    stageTimeoutMs = resolveGenerationStageTimeout({ requestedTimeoutMs, deadlineMs: generationDeadlineMs })
    const attempt = await generateWithFallbackImpl({
      settings,
      preferredModel: selectedModel,
      model: selectedModel,
      prompt: promptBuild.prompt,
      requestedTimeoutMs: stageTimeoutMs,
      referenceImages,
      runId: run.runId,
      dataRelativeDir: path.join(
        'runs',
        run.runId,
        'keyframes',
        'actions',
        `${actionId}-${normalizedKeyframeRole}-keyframe`
      ).replace(/\\/g, '/')
    })
    const output = getFirstExistingOutput({ dataDir, response: attempt.response })
    if (!output) throw new Error(`Creator Studio ${normalizedKeyframeRole} keyframe generation returned no outputs for ${actionId}`)
    const materializedOutput = createOutputFromGeneratedPath({ dataDir, output })
    if (!materializedOutput) throw new Error(`Creator Studio ${normalizedKeyframeRole} keyframe output was not materialized for ${actionId}`)
    const keyframePath = path.join(dataDir, materializedOutput.dataRelativePath)
    const metrics = await readImageMaskMetrics(keyframePath)
    const referencePath = String(referenceImages[0]?.path || '').trim()
    const referenceMetrics = referencePath && fs.existsSync(referencePath)
      ? await readImageMaskMetrics(referencePath)
      : null
    const rawScore = scoreActionAnchorMetrics({ metrics, referenceMetrics, action })
    const identityColorDistance = referenceMetrics?.visiblePixels
      ? distanceRgb(metrics.meanRgb, referenceMetrics.meanRgb)
      : 0
    const safeComposition = Boolean(
      metrics?.visiblePixels &&
      Number(metrics.coverage) >= 0.03 &&
      Number(metrics.coverage) <= 0.75 &&
      Number(metrics.edgeRatio) <= 0.015 &&
      Number(metrics.minPaddingRatio) >= 0.01 &&
      Number(metrics.centerOffsetRatio) <= 0.35 &&
      identityColorDistance <= 120
    )
    const score = safeComposition ? rawScore : 0
    const quality = {
      ok: score >= MIN_ACCEPTABLE_ACTION_KEYFRAME_SCORE,
      score: roundMetric(score, 2),
      rawScore: roundMetric(rawScore, 2),
      safeComposition,
      identityColorDistance: roundMetric(identityColorDistance, 2),
      minAcceptableScore: MIN_ACCEPTABLE_ACTION_KEYFRAME_SCORE,
      metrics: summarizeActionAnchorMetrics(metrics),
      ...(referenceMetrics ? { referenceMetrics: summarizeActionAnchorMetrics(referenceMetrics) } : {})
    }
    if (!quality.ok) {
      throw new Error(
        `Creator Studio ${normalizedKeyframeRole} keyframe quality for ${actionId} scored ${quality.score} below ${MIN_ACCEPTABLE_ACTION_KEYFRAME_SCORE}`
      )
    }
    const keyframe = createKeyframeRecordFromOutput({
      output: materializedOutput,
      actionId,
      keyframeRole: normalizedKeyframeRole,
      promptRelativePath: promptFile.relativePath,
      model: attempt.selectedModel,
      modelAttempts: attempt.attempts,
      quality
    })
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
      promptRelativePath: promptFile.relativePath,
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
        promptRelativePath: promptFile.relativePath,
        outputCount: 1
      })
    }
  } catch (error) {
    const modelAttempts = Array.isArray(error?.modelAttempts) ? error.modelAttempts : []
    return {
      ok: false,
      actionId,
      keyframe: null,
      referenceImage: null,
      promptRelativePath: promptFile.relativePath,
      error: String(error?.message || `${normalizedKeyframeRole} keyframe generation failed`),
      model: selectedModel,
      modelAttempts,
      stage: createProviderGenerationStage({
        stage: stageName,
        actionId,
        ok: false,
        referenceImages,
        timeoutMs: stageTimeoutMs,
        durationMs: sumAttemptDurationsMs(modelAttempts),
        model: selectedModel,
        modelAttempts,
        promptRelativePath: promptFile.relativePath,
        outputCount: 0,
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
  generationDeadlineMs = 0,
  generateWithFallbackImpl = generateWithModelFallback
}) => {
  if (originalReferenceImages.length === 0) return null
  const actionId = createSafeFileSegment(action?.actionId, 'action')
  const normalizedOriginalReferenceImages = originalReferenceImages.map((reference) => ({
    ...reference,
    role: String(reference?.role || 'canonical-reference').trim() || 'canonical-reference'
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
    generationDeadlineMs,
    generateWithFallbackImpl
  })
  if (!startKeyframeResult) return null
  if (!startKeyframeResult.ok) {
    return {
      ok: false,
      actionId,
      output: null,
      model: selectedModel,
      modelAttempts: startKeyframeResult.modelAttempts || [],
      promptRelativePath: startKeyframeResult.promptRelativePath,
      keyframes: [],
      referenceImages: [],
      stages: [startKeyframeResult.stage].filter(Boolean),
      error: String(startKeyframeResult.error || `Creator Studio start keyframe generation failed for ${actionId}`).slice(0, 240)
    }
  }
  const peakKeyframeResult = await generateActionKeyframe({
    dataDir,
    run,
    settings,
    selectedModel,
    requestedTimeoutMs,
    action,
    keyframeRole: 'peak',
    referenceImages: normalizedOriginalReferenceImages,
    generationDeadlineMs,
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
      keyframes: [startKeyframeResult.keyframe].filter(Boolean),
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
    fileBaseName: `${actionId}-row-reference-board`
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
    characterBrief: resolveAnchorCharacterBrief(run),
    referenceRole: 'keyframe-action-reference-board',
    action
  })
  const promptFile = writeAnchorPromptFile({
    dataDir,
    relativePath: path.join('runs', run.runId, 'prompts', 'keyframes', 'actions', `${actionId}-sprite-row.md`).replace(/\\/g, '/'),
    prompt: promptBuild.prompt
  })
  let finalStageTimeoutMs = Math.max(1, Number(requestedTimeoutMs) || CREATOR_PROVIDER_MIN_TIMEOUT_MS)
  try {
    finalStageTimeoutMs = resolveGenerationStageTimeout({ requestedTimeoutMs, deadlineMs: generationDeadlineMs })
    const attempt = await generateWithFallbackImpl({
      settings,
      preferredModel: selectedModel,
      model: selectedModel,
      prompt: promptBuild.prompt,
      requestedTimeoutMs: finalStageTimeoutMs,
      referenceImages: [conditioningBoardReferenceImage],
      runId: run.runId,
      dataRelativeDir: path.join('runs', run.runId, 'frames', 'base', `${actionId}-keyframe-row`).replace(/\\/g, '/')
    })
    const output = getFirstExistingOutput({ dataDir, response: attempt.response })
    if (!output) throw new Error(`Creator Studio keyframe sprite row generation returned no outputs for ${actionId}`)
    const materializedOutput = createOutputFromGeneratedPath({ dataDir, output })
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
      outputCount: 1
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
      outputCount: 0,
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

const createCandidateSelectionSummary = ({ candidates, selectedCandidate }) => ({
  version: 1,
  mode: 'direct-source-action-anchor-multi-candidate',
  candidateCount: candidates.length,
  minAcceptableScore: MIN_ACCEPTABLE_ACTION_ANCHOR_SCORE,
  selectedCandidateId: selectedCandidate?.candidateId || '',
  selectedCandidateRelativePath: createSafeRelativePath(selectedCandidate?.relativePath),
  selectedScore: roundMetric(selectedCandidate?.score, 2),
  acceptable: Number(selectedCandidate?.score || 0) >= MIN_ACCEPTABLE_ACTION_ANCHOR_SCORE,
  candidates: candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    promptRelativePath: createSafeRelativePath(candidate.promptRelativePath),
    outputRelativePath: createSafeRelativePath(candidate.relativePath),
    model: normalizeModelName(candidate.model),
    ok: Boolean(candidate.ok),
    score: roundMetric(candidate.score, 2),
    acceptable: Number(candidate.score || 0) >= MIN_ACCEPTABLE_ACTION_ANCHOR_SCORE,
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
  actionPromptBuild,
  actionReferenceImage,
  generateWithFallbackImpl
}) => {
  const referenceMetrics = await readImageMaskMetrics(actionReferenceImage.path)
  const candidates = []
  const candidateVariants = ACTION_ANCHOR_CANDIDATE_VARIANTS.slice(0, DIRECT_SOURCE_ACTION_ANCHOR_CANDIDATE_COUNT)
  for (const [index, candidateVariant] of candidateVariants.entries()) {
    const candidateId = candidateVariant.id
    const candidateSegment = createCandidateFileSegment(index, candidateId)
    const prompt = addCandidateGuidanceToPrompt({
      prompt: actionPromptBuild.prompt,
      candidate: candidateVariant
    })
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
      const score = scoreActionAnchorMetrics({ metrics, referenceMetrics, action })
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
    selectedCandidate
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
      `Creator Studio action anchor candidate selection for ${actionId} scored ${selection.selectedScore} below the minimum acceptable score ${MIN_ACCEPTABLE_ACTION_ANCHOR_SCORE}; see ${selectionRelativePath}`
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
  generateWithFallbackImpl = generateWithModelFallback
}) => {
  const references = Array.isArray(originalReferenceImages) ? originalReferenceImages.filter(Boolean) : []
  if (!dataDir || !run?.runId || references.length === 0) {
    return {
      anchorReferences: null,
      anchorGeneration: {
        skipped: true,
        reason: 'missing-reference'
      }
    }
  }

  const characterBrief = resolveAnchorCharacterBrief(run)
  const compositeBoard = await buildAnchorReferenceBoard({
    dataDir,
    runId: run.runId,
    sourceReferences: references,
    characterBrief
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
    renderedSourceCount: compositeBoard.renderedSourceCount
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
      characterBrief,
      referenceRole: 'composite-reference-board'
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
      requestedTimeoutMs,
      referenceImages: [compositeReferenceImage],
      runId: run.runId,
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
      outputCount: 1
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
        characterBrief,
        referenceRole: actionReferenceRole,
        action
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
          actionPromptBuild,
          actionReferenceImage,
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
          requestedTimeoutMs,
          referenceImages: [actionReferenceImage],
          runId: run.runId,
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
          fileBaseName: `${actionId}-final-reference-board`
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
          renderedSourceCount: finalActionBoard.renderedSourceCount
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

const generateFullPetBasicActionSource = async ({
  actionId,
  dataDir,
  run,
  settings = {},
  selectedModel,
  requestedTimeoutMs,
  referenceImages,
  generationDeadlineMs = 0
}) => {
  let providerRow = null
  try {
    const safeActionId = createSafeFileSegment(actionId, 'action')
    const officialRow = getOfficialFullPetRow(safeActionId)
    const sourceAction = findGenerationAction(run, safeActionId) || {
      actionId: safeActionId,
      name: safeActionId,
      motionPrompt: safeActionId,
      loop: true
    }
    const action = {
      ...sourceAction,
      actionId: safeActionId,
      frameCount: Number(officialRow?.frameCount) || Number(sourceAction.frameCount) || 6,
      animationType: inferAnimationType(sourceAction),
      synthesisMode: 'canonical-frame'
    }
    providerRow = await generateKeyframeActionSpriteRow({
      dataDir,
      run,
      settings,
      selectedModel,
      requestedTimeoutMs: Math.max(requestedTimeoutMs, BASIC_ACTION_MIN_TIMEOUT_MS),
      action,
      originalReferenceImages: referenceImages,
      generationDeadlineMs
    })
    if (!providerRow?.ok || !providerRow.output) {
      const error = new Error(providerRow?.error || `Creator Studio official row generation failed for ${safeActionId}`)
      error.modelAttempts = providerRow?.modelAttempts || []
      throw error
    }
    const materializedOutput = createOutputFromGeneratedPath({ dataDir, output: providerRow.output })
    if (!materializedOutput) throw new Error(`Creator Studio official row output was not materialized for ${safeActionId}`)
    const stripPath = path.join(dataDir, materializedOutput.dataRelativePath)
    const extracted = await extractRowStripFrames({
      stripPath,
      actionId: safeActionId,
      outputDir: path.join(dataDir, 'runs', run.runId, 'official-row-frames', safeActionId),
      dataDir,
      layout: getActionSheetLayout(action.frameCount)
    })
    return {
      actionId: safeActionId,
      ok: true,
      outputCount: 1,
      model: providerRow.model,
      modelAttempts: providerRow.modelAttempts,
      sourceRelativePath: materializedOutput.dataRelativePath,
      generationStages: providerRow.stages || [],
      keyframes: providerRow.keyframes || [],
      referenceBoard: providerRow.referenceBoard || null,
      row: {
        actionId: safeActionId,
        sourceRelativePath: materializedOutput.dataRelativePath,
        quality: FULL_PET_ROW_QUALITY.ROW_REAL,
        identityReferenceMeanRgb: averageKeyframeIdentityMeanRgb(providerRow.keyframes),
        identityReferenceDescriptor: averageKeyframeIdentityDescriptor(providerRow.keyframes),
        frames: extracted.frames
      },
      outputs: []
    }
  } catch (error) {
    const failedQuality = Array.isArray(providerRow?.stages)
      ? providerRow.stages.find((stage) => stage?.ok === false && stage?.quality)?.quality
      : null
    return {
      actionId,
      ok: false,
      outputCount: 0,
      outputs: [],
      row: null,
      model: '',
      modelAttempts: Array.isArray(error?.modelAttempts) ? error.modelAttempts : [],
      generationStages: Array.isArray(providerRow?.stages) ? providerRow.stages : [],
      error: String(error?.message || 'Action source generation failed').slice(0, 240)
    }
  }
}

const generateFullPetBasicActionSources = async ({
  dataDir,
  run,
  settings = {},
  selectedModel,
  requestedTimeoutMs,
  referenceImages,
  generationDeadlineMs = 0
}) => {
  const actionResults = []
  for (const actionId of GENERATED_FULL_PET_ACTION_IDS) {
    const result = await generateFullPetBasicActionSource({
      actionId,
      dataDir,
      run,
      settings,
      selectedModel,
      requestedTimeoutMs,
      referenceImages,
      generationDeadlineMs
    })
    actionResults.push(result)
    if (!result.ok) {
      const error = new Error(result.error || `Creator Studio official row generation failed for ${actionId}`)
      error.partialActionSources = {
        officialRows: {
          version: 1,
          mode: 'official-full-pet-provider-rows',
          rows: actionResults.map((entry) => entry.row).filter(Boolean)
        },
        basicActionGeneration: {
          attemptedActionIds: actionResults.map((entry) => entry.actionId),
          attempts: actionResults.map(summarizeBasicActionAttempt)
        },
        generationStages: actionResults.flatMap((entry) => entry.generationStages || [])
      }
      throw error
    }
  }

  return {
    outputs: [],
    officialRows: {
      version: 1,
      mode: 'official-full-pet-provider-rows',
      rows: actionResults.map((result) => result.row).filter(Boolean)
    },
    basicActionGeneration: {
      attemptedActionIds: GENERATED_FULL_PET_ACTION_IDS.slice(),
      attempts: actionResults.map(summarizeBasicActionAttempt)
    },
    generationStages: actionResults.flatMap((result) => result.generationStages || [])
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

const hasAnchorEligibleRunReference = (run = {}) => {
  const referenceImage = run?.input?.referenceImage
  return Number(referenceImage?.width) > 0 && Number(referenceImage?.height) > 0
}

const generateViaHostModelBridge = async ({ backend, run, dataDir }) => {
  const normalizedBackend = normalizeCreatorBackend(backend, FIXTURE_BACKEND)
  if (!process.env.OPENPET_BRIDGE_URL || !process.env.OPENPET_BRIDGE_TOKEN) {
    const { BackendUnavailableError } = require('./backend-adapters')
    throw new BackendUnavailableError({
      backend: normalizedBackend,
      message: 'Provider backend is not configured. Configure model settings in OpenPet before running provider generation.'
    })
  }

  const settings = await readHostModelSettings()
  const generationDeadlineMs = isFullPetRun(run)
    ? Date.now() + FULL_PET_WORKFLOW_MAX_DURATION_MS
    : 0
  const configuredModelSnapshot = createModelSnapshot({ backend: normalizedBackend, settings })
  const requestedTimeoutMs = Math.max(Number(settings.timeoutMs) || 0, CREATOR_PROVIDER_MIN_TIMEOUT_MS)
  const originalReferenceImage = resolveOriginalReferenceImage({ dataDir, run })
  const originalReferenceImages = isUsableLocalReferenceImage({ dataDir, referenceImage: originalReferenceImage })
    ? [originalReferenceImage]
    : []
  const expectsReferenceImage = Boolean(
    run?.input?.referenceImage ||
    run?.generationTask?.styleSource === 'referenceImage' ||
    run?.input?.generationTask?.styleSource === 'referenceImage'
  )
  if (expectsReferenceImage && originalReferenceImages.length === 0) {
    throw new Error('Creator Studio reference image is missing or unusable; reference-image generation must fail closed.')
  }
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
      originalReferenceImages
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
  const promptBuild = buildOpenPetImagePrompt({
    run: runForGeneration,
    backend: normalizedBackend,
    model: configuredModelSnapshot.model
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
        originalReferenceImages
      })
    : null
  const referenceImages = keyframeSpriteRow?.ok
    ? keyframeSpriteRow.referenceImages
    : resolveRunReferenceImages({
        dataDir,
        run: runForGeneration,
        stage: 'final',
        actionId: firstActionForReference?.actionId || ''
      })
  const defaultConditioning = keyframeSpriteRow?.ok
    ? createKeyframeSpriteRowConditioningSummary({
        model: keyframeSpriteRow.model || configuredModelSnapshot.model,
        referenceImages: keyframeSpriteRow.referenceImages
      })
    : createDefaultConditioningSummary({
        model: configuredModelSnapshot.model,
        referenceImages
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
    error.partialGenerationResult = {
      ...attemptResult,
      outputs: [],
      generationStages: providerAnchorStages,
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
    error.partialGenerationResult = {
      ...attemptResult,
      conditioning: createKeyframeSpriteRowConditioningSummary({
        model: configuredModelSnapshot.model,
        referenceImages: keyframeSpriteRow.referenceImages
      }),
      outputs: [],
      generationStages: [
        ...providerAnchorStages,
        ...keyframeSpriteRowStages
      ],
      keyframeSpriteRow: error.keyframeSpriteRow,
      ...(anchorReferences ? { anchorReferences } : {}),
      ...(anchorGeneration ? { anchorGeneration } : {})
    }
    throw error
  }
  if (keyframeSpriteRow?.ok) {
    return {
      ...attemptResult,
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
      requestedTimeoutMs: baseStageTimeoutMs,
      referenceImages,
      runId: run.runId,
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
      error: error?.message || error
    })
    if (error && typeof error === 'object') {
      const partialGenerationStages = [
        ...providerAnchorStages,
        failedFinalStage
      ]
      error.partialGenerationResult = {
        ...attemptResult,
        modelAttempts: failedAttempts,
        generationStages: [
          ...providerAnchorStages,
          failedFinalStage
        ]
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
        outputCount: Array.isArray(response?.result?.outputs) ? response.result.outputs.length : 0
      })
    ],
    ...(anchorReferences ? { anchorReferences } : {}),
    ...(anchorGeneration ? { anchorGeneration } : {})
  }

  if (!isFullPetRun(run)) return result

  await validateGeneratedImageOutput({
    dataDir,
    generationResult: result
  })
  const baseOutputs = Array.isArray(result.outputs) ? result.outputs : []
  const officialActionReferenceImages = hasUsableLocalReferenceImages(originalReferenceImages, dataDir)
    ? originalReferenceImages
    : [createGeneratedOutputReferenceImage({
        dataDir,
        output: baseOutputs[0],
        role: 'canonical-reference'
      })].filter(Boolean)
  let fullPetBasicActionSources
  try {
    fullPetBasicActionSources = await generateFullPetBasicActionSources({
      dataDir,
      run,
      settings,
      selectedModel,
      requestedTimeoutMs,
      referenceImages: officialActionReferenceImages,
      generationDeadlineMs
    })
  } catch (error) {
    const partialSources = error?.partialActionSources || {
      officialRows: { version: 1, mode: 'official-full-pet-provider-rows', rows: [] },
      basicActionGeneration: { attemptedActionIds: [], attempts: [] },
      generationStages: []
    }
    error.partialGenerationResult = {
      ...result,
      outputs: baseOutputs,
      officialRows: partialSources.officialRows,
      basicActionGeneration: partialSources.basicActionGeneration,
      generationStages: [
        ...(Array.isArray(result.generationStages) ? result.generationStages : []),
        ...(Array.isArray(partialSources.generationStages) ? partialSources.generationStages : [])
      ]
    }
    throw error
  }
  const generatedOfficialRows = Array.isArray(fullPetBasicActionSources.officialRows?.rows)
    ? fullPetBasicActionSources.officialRows.rows
    : []
  const failedOfficialRowAttempts = Array.isArray(fullPetBasicActionSources.basicActionGeneration?.attempts)
    ? fullPetBasicActionSources.basicActionGeneration.attempts.filter((attempt) => !attempt.ok)
    : []
  const fullPetResult = {
    ...result,
    outputs: baseOutputs,
    officialRows: fullPetBasicActionSources.officialRows,
    basicActionGeneration: fullPetBasicActionSources.basicActionGeneration,
    generationStages: [
      ...(Array.isArray(result.generationStages) ? result.generationStages : []),
      ...(Array.isArray(fullPetBasicActionSources.generationStages) ? fullPetBasicActionSources.generationStages : [])
    ]
  }
  if (
    generatedOfficialRows.length !== GENERATED_FULL_PET_ACTION_IDS.length ||
    failedOfficialRowAttempts.length > 0
  ) {
    const missingActionIds = GENERATED_FULL_PET_ACTION_IDS.filter((actionId) => (
      !generatedOfficialRows.some((row) => row?.actionId === actionId)
    ))
    const failedActionIds = failedOfficialRowAttempts.map((attempt) => attempt.actionId).filter(Boolean)
    const error = new Error(
      `Creator Studio full-pet official row generation failed; missing or failed rows: ${[...new Set([...missingActionIds, ...failedActionIds])].join(', ')}`
    )
    error.partialGenerationResult = fullPetResult
    throw error
  }

  return fullPetResult
}

module.exports = {
  __testInternals: {
    buildModelCandidateList,
    resolveGenerationStageTimeout,
    scoreActionAnchorMetrics
  },
  generateAnchorReferences,
  generateViaHostModelBridge,
  resolveRunReferenceImages
}
