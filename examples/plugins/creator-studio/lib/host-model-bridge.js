const { callBridge } = require('./bridge-client')
const { BackendUnavailableError } = require('./backend-adapters')
const { buildOpenPetImagePrompt } = require('./openpet-prompt-builder')
const { FIXTURE_BACKEND, PROVIDER_BACKEND, normalizeCreatorBackend } = require('./backend-mode')
const path = require('path')

const DEFAULT_CONSTRAINTS = {
  width: 1024,
  height: 1024,
  transparent: true
}

const CREATOR_PROVIDER_MIN_TIMEOUT_MS = 300000
const PROMPT_PREVIEW_MAX_LENGTH = 8000

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

const generateViaHostModelBridge = async ({ backend, run, dataDir }) => {
  const normalizedBackend = normalizeCreatorBackend(backend, FIXTURE_BACKEND)
  if (!process.env.OPENPET_BRIDGE_URL || !process.env.OPENPET_BRIDGE_TOKEN) {
    throw new BackendUnavailableError({
      backend: normalizedBackend,
      message: 'Provider backend is not configured. Configure model settings in OpenPet before running provider generation.'
    })
  }

  const settings = await readHostModelSettings()
  const modelSnapshot = createModelSnapshot({ backend: normalizedBackend, settings })
  const promptBuild = buildOpenPetImagePrompt({
    run,
    backend: normalizedBackend,
    model: modelSnapshot.model
  })
  const providerPrompt = String(promptBuild.providerPrompt || promptBuild.prompt || '')
  const promptPreviewText = providerPrompt
  const requestedTimeoutMs = Math.max(Number(settings.timeoutMs) || 0, CREATOR_PROVIDER_MIN_TIMEOUT_MS)
  const referenceImages = resolveRunReferenceImages({ dataDir, run })
  const defaultConditioning = createDefaultConditioningSummary({
    model: modelSnapshot.model,
    referenceImages
  })
  const promptBuilder = createPromptBuilderSummary({
    promptBuild,
    promptPreviewText
  })
  const attemptResult = {
    backend: normalizedBackend,
    model: modelSnapshot.model,
    conditioning: defaultConditioning,
    outputs: [],
    usage: {
      estimatedCostUsd: 0
    },
    modelSnapshot,
    promptBuilder
  }
  let response
  try {
    response = await callBridge('/creator/model-image-generate', {
      prompt: providerPrompt,
      timeoutMs: requestedTimeoutMs,
      referenceImages,
      output: {
        dataRelativeDir: `runs/${run.runId}/frames/base`
      },
      constraints: DEFAULT_CONSTRAINTS
    })
  } catch (error) {
    if (error && typeof error === 'object') {
      error.partialGenerationResult = attemptResult
    }
    throw error
  }

  return {
    ...attemptResult,
    ...response.result,
    conditioning: response?.result?.conditioning || defaultConditioning,
    modelSnapshot,
    promptBuilder
  }
}

module.exports = {
  generateViaHostModelBridge
}
