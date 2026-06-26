const { callBridge } = require('./bridge-client')
const { BackendUnavailableError } = require('./backend-adapters')
const { buildOpenPetImagePrompt } = require('./openpet-prompt-builder')
const { FIXTURE_BACKEND, PROVIDER_BACKEND, normalizeCreatorBackend } = require('./backend-mode')

const DEFAULT_CONSTRAINTS = {
  width: 1024,
  height: 1024,
  transparent: true
}

const PROMPT_PREVIEW_MAX_LENGTH = 8000

const safeUrlHost = (value) => {
  try {
    return new URL(String(value || '')).host
  } catch (_) {
    return ''
  }
}

const readHostModelSettings = async () => {
  try {
    const response = await callBridge('/creator/model-settings')
    return response.config || {}
  } catch (_) {
    return {}
  }
}

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

const generateViaHostModelBridge = async ({ backend, run }) => {
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
  const promptPreviewText = String(promptBuild.prompt || '')
  const response = await callBridge('/creator/model-image-generate', {
    prompt: promptBuild.prompt,
    output: {
      dataRelativeDir: `runs/${run.runId}/frames/base`
    },
    constraints: DEFAULT_CONSTRAINTS
  })

  return {
    ...response.result,
    modelSnapshot,
    promptBuilder: {
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
    }
  }
}

module.exports = {
  generateViaHostModelBridge
}
