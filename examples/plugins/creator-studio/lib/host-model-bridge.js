const { callBridge } = require('./bridge-client')
const { BackendUnavailableError } = require('./backend-adapters')

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

  const prompt = String(run.input?.originalPrompt || run.input?.prompt || '').trim() || run.petId
  const response = await callBridge('/creator/model-image-generate', {
    backend,
    prompt,
    output: {
      dataRelativeDir: `runs/${run.runId}/frames/base`
    },
    constraints: DEFAULT_CONSTRAINTS
  })

  return response.result
}

module.exports = {
  generateViaHostModelBridge
}
