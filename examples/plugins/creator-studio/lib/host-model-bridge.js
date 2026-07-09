const { callBridge } = require('./bridge-client')
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
  if (!normalized || normalized.startsWith('/') || normalized.includes('../')) return ''
  return normalized
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
  addCandidate(preferredModel)
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

const resolveRunReferenceImages = ({ dataDir, run }) => {
  if (!dataDir || !run || typeof run !== 'object') return []
  const referenceInput = run.input?.referenceImage
  const relativePath = createSafeRelativePath(referenceInput?.relativePath)
  if (!relativePath) return []
  return [{
    path: path.join(dataDir, relativePath),
    fileName: String(referenceInput?.fileName || referenceInput?.originalFileName || 'canonical-reference.png').trim() || 'canonical-reference.png',
    relativePath,
    metadataRelativePath: createSafeRelativePath(referenceInput?.metadataRelativePath),
    sha256: String(referenceInput?.contentHash || '').trim(),
    role: 'canonical-reference'
  }]
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

const createGenerationAttemptRecord = ({ model, ok, error = '' }) => ({
  model: normalizeModelName(model),
  ok: Boolean(ok),
  ...(error ? { error: String(error).slice(0, 240) } : {})
})

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
  let lastError = null
  for (const model of modelCandidates) {
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
      attempts.push(createGenerationAttemptRecord({ model, ok: true }))
      return {
        response,
        selectedModel: model,
        attempts
      }
    } catch (error) {
      attempts.push(createGenerationAttemptRecord({ model, ok: false, error: error?.message || error }))
      lastError = error
      if (!shouldRetryWithAnotherModel(error)) break
    }
  }
  if (lastError && typeof lastError === 'object') {
    lastError.modelAttempts = attempts
  }
  throw lastError || new Error('Creator Studio image generation failed')
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
  const promptBuild = buildOpenPetImagePrompt({
    run,
    backend: normalizedBackend,
    model: configuredModelSnapshot.model
  })
  const providerPrompt = String(promptBuild.providerPrompt || promptBuild.prompt || '')
  const promptPreviewText = providerPrompt
  const requestedTimeoutMs = Math.max(Number(settings.timeoutMs) || 0, CREATOR_PROVIDER_MIN_TIMEOUT_MS)
  const referenceImages = resolveRunReferenceImages({ dataDir, run })
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
    if (error && typeof error === 'object') {
      error.partialGenerationResult = {
        ...attemptResult,
        modelAttempts: Array.isArray(error.modelAttempts) ? error.modelAttempts : modelAttempts
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
    modelAttempts
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
  generateViaHostModelBridge
}
