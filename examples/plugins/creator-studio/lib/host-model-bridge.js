const { callBridge } = require('./bridge-client')
const { BackendUnavailableError } = require('./backend-adapters')
const { buildOpenPetImagePrompt } = require('./openpet-prompt-builder')

const DEFAULT_CONSTRAINTS = {
  width: 1024,
  height: 1024,
  transparent: true
}

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
  if (backend === 'cloud') {
    const cloud = settings.cloud || {}
    return {
      backend: 'cloud',
      provider: String(cloud.provider || 'cloud'),
      model: String(cloud.model || ''),
      baseUrlHost: safeUrlHost(cloud.baseUrl)
    }
  }
  if (backend === 'local') {
    const local = settings.local || {}
    return {
      backend: 'local',
      provider: 'local',
      model: String(local.model || ''),
      endpointHost: safeUrlHost(local.endpoint)
    }
  }
  return {
    backend: backend || 'fixture',
    provider: backend || 'fixture',
    model: 'fixture-image'
  }
}

const generateViaHostModelBridge = async ({ backend, run }) => {
  if (!process.env.OPENPET_BRIDGE_URL || !process.env.OPENPET_BRIDGE_TOKEN) {
    throw new BackendUnavailableError({
      backend,
      message: `${backend === 'cloud' ? 'Cloud' : 'Local'} backend is not configured. Configure model settings in OpenPet before running this backend.`
    })
  }

  const settings = await readHostModelSettings()
  const modelSnapshot = createModelSnapshot({ backend, settings })
  const promptBuild = buildOpenPetImagePrompt({
    run,
    backend,
    model: modelSnapshot.model
  })
  const response = await callBridge('/creator/model-image-generate', {
    backend,
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
      warnings: promptBuild.warnings
    }
  }
}

module.exports = {
  generateViaHostModelBridge
}
