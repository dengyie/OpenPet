const { createTaskError } = require('./provider-image-task')

const freezeProfile = (profile) => Object.freeze({ ...profile })

const GPT_IMAGE_2_PROFILE = freezeProfile({
  id: 'gpt-image-2-v1',
  model: 'gpt-image-2',
  promptRenderer: 'gpt-image-2-v1',
  imageConditioning: 'required',
  adjustableInputFidelity: false,
  supportsDirectTransparency: false,
  cutoutStrategy: 'solid-background-then-local-removal',
  supportsDedicatedNegativePrompt: false,
  requestedOutputCount: 1
})

const TRANSPARENT_GPT_IMAGE_PROFILE = freezeProfile({
  id: 'gpt-image-edit-transparent-v1',
  model: 'gpt-image-1.x',
  promptRenderer: 'structured-image-edit-v1',
  imageConditioning: 'required',
  adjustableInputFidelity: true,
  supportsDirectTransparency: true,
  cutoutStrategy: 'direct-transparent-output',
  supportsDedicatedNegativePrompt: false,
  requestedOutputCount: 1
})

const GENERIC_OPAQUE_IMAGE_PROFILE = freezeProfile({
  id: 'generic-image-edit-v1',
  model: '',
  promptRenderer: 'structured-image-edit-v1',
  imageConditioning: 'required',
  adjustableInputFidelity: false,
  supportsDirectTransparency: false,
  cutoutStrategy: 'solid-background-then-local-removal',
  supportsDedicatedNegativePrompt: false,
  requestedOutputCount: 1
})

const normalizeModel = (value) => String(value || '').trim().toLowerCase()

const resolveImageModelCapabilities = (model) => {
  const normalized = normalizeModel(model)
  if (normalized === 'gpt-image-2') return GPT_IMAGE_2_PROFILE
  if (normalized === 'gpt-image-1' || normalized === 'gpt-image-1.5') {
    return Object.freeze({ ...TRANSPARENT_GPT_IMAGE_PROFILE, model: normalized })
  }
  if (normalized) {
    return Object.freeze({
      ...GENERIC_OPAQUE_IMAGE_PROFILE,
      id: `generic-image-edit-v1:${normalized.slice(0, 80)}`,
      model: normalized
    })
  }
  throw createTaskError(
    'image_prompt_capability_conflict',
    'Selected image model has no registered prompt capability profile'
  )
}

module.exports = {
  GPT_IMAGE_2_PROFILE,
  GENERIC_OPAQUE_IMAGE_PROFILE,
  TRANSPARENT_GPT_IMAGE_PROFILE,
  resolveImageModelCapabilities
}
