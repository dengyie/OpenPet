const { callBridge } = require('./bridge-client')
const { buildAnchorReferenceBoard } = require('./anchor-reference-board')
const {
  buildActionAnchorPrompt,
  buildCharacterAnchorPrompt
} = require('./anchor-prompt-builder')
const { buildOpenPetImagePrompt, sanitizeCreativeBrief } = require('./openpet-prompt-builder')
const { FIXTURE_BACKEND, PROVIDER_BACKEND, normalizeCreatorBackend } = require('./backend-mode')
const { GENERATED_FULL_PET_ACTION_IDS } = require('./full-pet-basic-actions')
const fs = require('fs')
const path = require('path')

const DEFAULT_CONSTRAINTS = {
  width: 1024,
  height: 1024,
  transparent: true
}

const CREATOR_PROVIDER_MIN_TIMEOUT_MS = 300000
const BASIC_ACTION_POSE_TIMEOUT_MS = 300000
const FALLBACK_MODEL_MIN_TIMEOUT_MS = 600000
const PROMPT_PREVIEW_MAX_LENGTH = 8000
const KNOWN_FALLBACK_IMAGE_MODELS = [
  'gpt-image-2',
  'gpt-image-1.5'
]

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

const isLikelyImageModel = (value) => (
  /(image|banana|imagine)/i.test(normalizeModelName(value))
)

const isSupportedOpenAiCompatibleEditModel = (value) => (
  /^(gpt-image-(1\.5|2)|grok-imagine-image(?:-quality)?)$/i.test(normalizeModelName(value))
)

const isEligibleFallbackModel = ({ settings = {}, candidate = '' }) => {
  const normalized = normalizeModelName(candidate)
  if (!normalized) return false
  const provider = normalizeModelName(settings?.provider).toLowerCase()
  if (provider === 'openai-compatible' || provider === 'openai') {
    return isSupportedOpenAiCompatibleEditModel(normalized)
  }
  return isLikelyImageModel(normalized)
}

const buildModelCandidateList = ({ settings = {}, preferredModel = '' }) => {
  const candidates = []
  const seen = new Set()
  const addCandidate = (value) => {
    const normalized = normalizeModelName(value)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    candidates.push(normalized)
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

const shouldRetryWithAnotherModel = (error) => {
  const message = String(error?.message || error || '').trim().toLowerCase()
  if (
    message.includes('api key is missing') ||
    message.includes('provider backend is not configured') ||
    message.includes('openpet bridge is not available') ||
    message.includes('allowed data directory')
  ) {
    return false
  }
  return (
    message.includes('timed out') ||
    message.includes('fetch failed') ||
    message.includes('socks5') ||
    message.includes('cannot complete') ||
    message.includes('generation failed with http') ||
    message.includes('returned no outputs') ||
    ((message.includes('model') || message.includes('provider')) &&
      (message.includes('unsupported') || message.includes('not found')))
  )
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
    .find(Boolean)
  const resolved = anchorReference || resolveOriginalReferenceImage({ dataDir, run })
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

const createDefaultConditioningSummary = ({ model, referenceImages = [] }) => ({
  mode: referenceImages.length > 0 ? 'image-edit' : 'text-to-image',
  endpoint: referenceImages.length > 0 ? '/images/edits' : '/images/generations',
  referenceImageCount: referenceImages.length,
  references: referenceImages.map((referenceImage) => ({
    fileName: referenceImage.fileName,
    relativePath: referenceImage.relativePath,
    metadataRelativePath: referenceImage.metadataRelativePath,
    role: referenceImage.role
  })),
  model: String(model || '')
})

const createPromptBuilderSummary = ({ promptBuild, promptPreviewText }) => ({
  version: promptBuild.promptBuilderVersion,
  mode: promptBuild.mode,
  actionId: promptBuild.actionId,
  sections: promptBuild.sections,
  warnings: promptBuild.warnings,
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

const sumAttemptDurationsMs = (attempts = []) => attempts.reduce((total, attempt) => (
  total + Math.max(0, Number(attempt?.durationMs) || 0)
), 0)

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
  error = ''
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

const findGenerationAction = (run = {}, actionId) => {
  const actions = Array.isArray(run?.generationTask?.actions)
    ? run.generationTask.actions
    : Array.isArray(run?.input?.generationTask?.actions)
      ? run.input.generationTask.actions
      : []
  return actions.find((action) => action?.actionId === actionId) || null
}

const createFullPetActionPosePrompt = ({ run = {}, actionId }) => {
  const action = findGenerationAction(run, actionId) || { actionId, name: actionId, motionPrompt: actionId }
  const characterBrief = sanitizeCreativeBrief(run?.generationTask?.characterBrief || run?.input?.generationTask?.characterBrief || run?.input?.originalPrompt || run?.input?.prompt || run?.petId || 'OpenPet desktop pet')
  const actionName = sanitizeCreativeBrief(action.name || actionId)
  const motionPrompt = sanitizeCreativeBrief(action.motionPrompt || actionName)
  return [
    `Create one centered OpenPet desktop pet sprite source for the character: ${characterBrief}.`,
    `Pose/action: ${actionName}.`,
    `Motion intent: ${motionPrompt}.`,
    'Keep the same character identity, proportions, face, palette, and style as the reference image.',
    'Output one full-body pose only, not a grid, sticker sheet, comic panel, UI mockup, text, logo, or watermark.',
    'Keep the complete pet visible and centered with 8-12% padding, clean silhouette, and a plain transparent-friendly background.',
    'This image will be normalized into one row of an OpenPet spritesheet.'
  ].join(' ')
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
  ...(result.error ? { error: result.error } : {})
})

const generateWithModelFallback = async ({
  prompt,
  requestedTimeoutMs,
  referenceImages,
  runId,
  dataRelativeDir,
  settings,
  preferredModel
}) => {
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
  if (lastError && typeof lastError === 'object') {
    lastError.modelAttempts = attempts
  }
  throw lastError || new Error('Creator Studio image generation failed')
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
    modelAttempts
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
  const characterAnchor = createAnchorRecordFromOutput({
    output: characterOutput,
    role: 'character-anchor',
    promptRelativePath: characterPromptFile.relativePath,
    model: characterAttempt.selectedModel,
    modelAttempts: characterAttempt.attempts
  })
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
  if (shouldGenerateActionAnchors(run) && characterAnchor) {
    const characterReferenceImage = {
      path: path.join(dataDir, characterAnchor.relativePath),
      fileName: characterAnchor.fileName || 'character-anchor.png',
      relativePath: characterAnchor.relativePath,
      role: 'character-anchor'
    }
    for (const action of getRunActions(run)) {
      const actionId = createSafeFileSegment(action?.actionId, 'action')
      const actionPromptBuild = buildActionAnchorPrompt({
        characterBrief,
        referenceRole: 'character-anchor',
        action
      })
      const promptFile = writeAnchorPromptFile({
        dataDir,
        relativePath: path.join('runs', run.runId, 'prompts', 'anchors', 'actions', `${actionId}-anchor.md`).replace(/\\/g, '/'),
        prompt: actionPromptBuild.prompt
      })
      const actionAttempt = await generateWithFallbackImpl({
        settings,
        preferredModel: selectedModel,
        model: selectedModel,
        prompt: actionPromptBuild.prompt,
        requestedTimeoutMs,
        referenceImages: [characterReferenceImage],
        runId: run.runId,
        dataRelativeDir: path.join('runs', run.runId, 'anchors', 'actions', `${actionId}-anchor`).replace(/\\/g, '/')
      })
      const actionOutput = getFirstExistingOutput({ dataDir, response: actionAttempt.response })
      if (!actionOutput) throw new Error(`Creator Studio action anchor generation returned no outputs for ${actionId}`)
      const actionAnchor = createAnchorRecordFromOutput({
        output: actionOutput,
        role: 'action-anchor',
        actionId,
        promptRelativePath: promptFile.relativePath,
        model: actionAttempt.selectedModel,
        modelAttempts: actionAttempt.attempts
      })
      if (actionAnchor) {
        actionAnchors.push(actionAnchor)
        stages.push({
          stage: 'action-anchor',
          actionId,
          ok: true,
          referenceRole: 'character-anchor',
          referenceRoles: ['character-anchor'],
          timeoutMs: Math.max(0, Number(requestedTimeoutMs) || 0),
          durationMs: sumAttemptDurationsMs(actionAnchor.modelAttempts),
          outputRelativePath: actionAnchor.relativePath,
          promptRelativePath: actionAnchor.promptRelativePath,
          model: actionAnchor.model,
          modelAttempts: actionAnchor.modelAttempts,
          outputCount: 1
        })
        const finalActionBoard = await buildAnchorReferenceBoard({
          dataDir,
          runId: run.runId,
          sourceReferences: [{
            path: compositeBoard.path,
            fileName: path.basename(compositeBoard.relativePath),
            relativePath: compositeBoard.relativePath,
            role: 'source-identity-reference'
          }, {
            path: path.join(dataDir, actionAnchor.relativePath),
            fileName: actionAnchor.fileName || `${actionId}-anchor.png`,
            relativePath: actionAnchor.relativePath,
            role: 'action-pose-reference'
          }],
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
  settings,
  selectedModel,
  requestedTimeoutMs,
  referenceImages
}) => {
  try {
    const actionAttempt = await generateWithModelFallback({
      settings,
      preferredModel: selectedModel,
      prompt: createFullPetActionPosePrompt({ run, actionId }),
      requestedTimeoutMs: Math.min(requestedTimeoutMs, BASIC_ACTION_POSE_TIMEOUT_MS),
      referenceImages,
      runId: run.runId,
      dataRelativeDir: `runs/${run.runId}/frames/base/${actionId}`
    })
    const actionResponse = actionAttempt.response
    const outputs = filterExistingGeneratedOutputs({
      dataDir,
      outputs: Array.isArray(actionResponse?.result?.outputs) ? actionResponse.result.outputs : []
    })
    return {
      actionId,
      ok: outputs.length > 0,
      outputCount: outputs.length,
      model: actionAttempt.selectedModel,
      modelAttempts: actionAttempt.attempts,
      outputs: outputs.map((output) => ({
        ...output,
        actionId
      }))
    }
  } catch (error) {
    return {
      actionId,
      ok: false,
      outputCount: 0,
      outputs: [],
      model: '',
      modelAttempts: Array.isArray(error?.modelAttempts) ? error.modelAttempts : [],
      error: String(error?.message || 'Action source generation failed').slice(0, 240)
    }
  }
}

const generateFullPetBasicActionSources = async ({
  dataDir,
  run,
  settings,
  selectedModel,
  requestedTimeoutMs,
  referenceImages
}) => {
  const actionResults = await Promise.all(
    GENERATED_FULL_PET_ACTION_IDS.map((actionId) => generateFullPetBasicActionSource({
      actionId,
      dataDir,
      run,
      settings,
      selectedModel,
      requestedTimeoutMs,
      referenceImages
    }))
  )

  return {
    outputs: actionResults.flatMap((result) => result.outputs),
    basicActionGeneration: {
      attemptedActionIds: GENERATED_FULL_PET_ACTION_IDS.slice(),
      attempts: actionResults.map(summarizeBasicActionAttempt)
    }
  }
}

const hasUsableLocalReferenceImages = (referenceImages = []) => (
  Array.isArray(referenceImages) &&
  referenceImages.length > 0 &&
  referenceImages.every((referenceImage) => {
    const sourcePath = String(referenceImage?.path || '').trim()
    return sourcePath && fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile()
  })
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
  const configuredModelSnapshot = createModelSnapshot({ backend: normalizedBackend, settings })
  const requestedTimeoutMs = Math.max(Number(settings.timeoutMs) || 0, CREATOR_PROVIDER_MIN_TIMEOUT_MS)
  const originalReferenceImages = resolveOriginalReferenceImage({ dataDir, run })
    ? [resolveOriginalReferenceImage({ dataDir, run })]
    : []
  let anchorReferences = null
  let anchorGeneration = null
  let runForGeneration = run
  if (hasAnchorEligibleRunReference(run) && hasUsableLocalReferenceImages(originalReferenceImages)) {
    const generatedAnchors = await generateAnchorReferences({
      dataDir,
      run,
      settings,
      selectedModel: configuredModelSnapshot.model,
      requestedTimeoutMs,
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
  const providerPrompt = String(promptBuild.providerPrompt || promptBuild.prompt || '')
  const promptPreviewText = providerPrompt
  const firstActionForReference = Array.isArray(runForGeneration?.generationTask?.actions)
    ? runForGeneration.generationTask.actions[0]
    : Array.isArray(runForGeneration?.input?.generationTask?.actions)
      ? runForGeneration.input.generationTask.actions[0]
      : null
  const referenceImages = resolveRunReferenceImages({
    dataDir,
    run: runForGeneration,
    stage: 'final',
    actionId: firstActionForReference?.actionId || ''
  })
  const defaultConditioning = createDefaultConditioningSummary({
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
    promptBuilder
  }
  if (anchorReferences) attemptResult.anchorReferences = anchorReferences
  if (anchorGeneration) attemptResult.anchorGeneration = anchorGeneration
  const providerAnchorStages = getProviderAnchorStages(anchorGeneration)
  if (providerAnchorStages.length > 0) attemptResult.generationStages = providerAnchorStages
  let response
  let selectedModel = configuredModelSnapshot.model
  let modelAttempts = []
  try {
    const generationAttempt = await generateWithModelFallback({
      settings,
      preferredModel: configuredModelSnapshot.model,
      prompt: providerPrompt,
      requestedTimeoutMs,
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
      timeoutMs: requestedTimeoutMs,
      durationMs: sumAttemptDurationsMs(failedAttempts),
      model: configuredModelSnapshot.model,
      modelAttempts: failedAttempts,
      error: error?.message || error
    })
    if (error && typeof error === 'object') {
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
  const result = {
    ...attemptResult,
    ...response.result,
    conditioning: response?.result?.conditioning || defaultConditioning,
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
        timeoutMs: requestedTimeoutMs,
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

  const baseOutputs = Array.isArray(result.outputs) ? result.outputs : []
  const fullPetBasicActionSources = await generateFullPetBasicActionSources({
    dataDir,
    run,
    settings,
    selectedModel,
    requestedTimeoutMs,
    referenceImages
  })

  return {
    ...result,
    outputs: [...baseOutputs, ...fullPetBasicActionSources.outputs],
    basicActionGeneration: fullPetBasicActionSources.basicActionGeneration
  }
}

module.exports = {
  createFullPetActionPosePrompt,
  generateAnchorReferences,
  generateViaHostModelBridge,
  resolveRunReferenceImages
}
