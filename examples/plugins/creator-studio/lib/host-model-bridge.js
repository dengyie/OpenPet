const { callBridge } = require('./bridge-client')
const { BackendUnavailableError } = require('./backend-adapters')
const { buildOpenPetImagePrompt } = require('./openpet-prompt-builder')

const DEFAULT_CONSTRAINTS = {
  width: 1024,
  height: 1024,
  transparent: true
}

const generateViaHostModelBridge = async ({ backend, run }) => {
  if (!process.env.OPENPET_BRIDGE_URL || !process.env.OPENPET_BRIDGE_TOKEN) {
    throw new BackendUnavailableError({
      backend,
      message: `${backend === 'cloud' ? 'Cloud' : 'Local'} backend is not configured. Configure model settings in OpenPet before running this backend.`
    })
  }

  const promptBuild = buildOpenPetImagePrompt({
    run,
    backend,
    model: backend === 'cloud'
      ? run.input?.cloudModel
      : run.input?.localModel
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
