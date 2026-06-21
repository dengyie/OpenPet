const crypto = require('crypto')

const VALID_MODES = new Set(['single-action', 'full-pet'])
const VALID_TARGET_PETS = new Set(['current', 'new'])
const VALID_STYLE_SOURCES = new Set(['currentPet', 'referenceImage', 'textOnly'])
const VALID_TRIGGER_TYPES = new Set(['manual', 'click', 'random', 'state', 'event', 'unbound'])
const SAFE_ACTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const MAX_ACTION_FRAME_COUNT = 32

const hashActionId = (value) => `action-${crypto.createHash('sha1').update(String(value || 'action')).digest('hex').slice(0, 8)}`

const clampFrameCount = (value, fallback) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(Math.round(number), 1), MAX_ACTION_FRAME_COUNT)
}

const normalizeTriggerProposal = (proposal = {}) => {
  const type = String(proposal.type || 'unbound')
  if (!VALID_TRIGGER_TYPES.has(type)) throw new Error(`Creator Studio trigger type is invalid: ${type}`)
  return {
    type,
    ...(proposal.binding ? { binding: String(proposal.binding) } : {}),
    ...(proposal.notes ? { notes: String(proposal.notes) } : {})
  }
}

const normalizeAction = (action = {}, index = 0) => {
  const name = String(action.name || `Action ${index + 1}`).trim() || `Action ${index + 1}`
  const actionId = String(action.actionId || hashActionId(name)).trim()
  if (!SAFE_ACTION_ID_PATTERN.test(actionId)) throw new Error(`Creator Studio actionId is invalid: ${actionId}`)
  const loop = Boolean(action.loop)
  return {
    actionId,
    name,
    motionPrompt: String(action.motionPrompt || name).trim() || name,
    loop,
    frameCount: clampFrameCount(action.frameCount, loop ? 12 : 16),
    transparentBackground: action.transparentBackground !== false,
    triggerProposal: normalizeTriggerProposal(action.triggerProposal)
  }
}

const normalizeQuestion = (question = {}) => ({
  id: String(question.id || ''),
  question: String(question.question || ''),
  options: Array.isArray(question.options) ? question.options.map(String) : []
})

const normalizeGenerationTask = (task = {}) => {
  const mode = String(task.mode || 'single-action')
  if (!VALID_MODES.has(mode)) throw new Error(`Creator Studio generation mode is invalid: ${mode}`)
  const targetPet = String(task.targetPet || (mode === 'single-action' ? 'current' : 'new'))
  if (!VALID_TARGET_PETS.has(targetPet)) throw new Error(`Creator Studio targetPet is invalid: ${targetPet}`)
  const styleSource = String(task.styleSource || (mode === 'single-action' ? 'currentPet' : 'textOnly'))
  if (!VALID_STYLE_SOURCES.has(styleSource)) throw new Error(`Creator Studio styleSource is invalid: ${styleSource}`)
  const actions = Array.isArray(task.actions) ? task.actions.map(normalizeAction) : []
  if (actions.length === 0) throw new Error('Creator Studio generation task requires at least one action')
  return {
    mode,
    targetPet,
    styleSource,
    characterBrief: String(task.characterBrief || (styleSource === 'currentPet' ? 'Keep the current pet style, proportions, palette, and line work consistent.' : '')).trim(),
    actions,
    questions: Array.isArray(task.questions) ? task.questions.map(normalizeQuestion).filter((question) => question.id && question.question) : []
  }
}

module.exports = {
  hashActionId,
  normalizeGenerationTask
}
