const crypto = require('crypto')

const VALID_MODES = new Set(['single-action', 'full-pet'])
const VALID_TARGET_PETS = new Set(['current', 'new'])
const VALID_STYLE_SOURCES = new Set(['currentPet', 'referenceImage'])
const VALID_TRIGGER_TYPES = new Set(['manual', 'click', 'random', 'state', 'event', 'unbound'])
const HOST_RULE_TRIGGER_TYPES = new Set(['random', 'state', 'event'])
const VALID_ANIMATION_TYPES = new Set(['stationary_loop', 'locomotion_loop', 'vertical_bounce', 'pose_transition', 'reaction', 'emote'])
const SAFE_ACTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const MAX_ACTION_FRAME_COUNT = 32
const MAX_TRIGGER_SPEC_TEXT_LENGTH = 240
const MAX_ACTION_SPEC_TEXT_LENGTH = 240

const hashActionId = (value) => `action-${crypto.createHash('sha1').update(String(value || 'action')).digest('hex').slice(0, 8)}`

const clampFrameCount = (value, fallback) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(Math.round(number), 1), MAX_ACTION_FRAME_COUNT)
}

const sanitizeTriggerSpecText = (value, fallback = '') => String(typeof value === 'string' ? value : fallback)
  .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
  .replace(/\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\b/gi, '[redacted-token]')
  .replace(/\[redacted-token\]\s*[:=]\s*[^\s,，。)]+/gi, '[redacted-token]=[redacted-secret]')
  .replace(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  .replace(/(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/[^\s,，。)]+/g, '[redacted-path]')
  .slice(0, MAX_TRIGGER_SPEC_TEXT_LENGTH)

const createTriggerRuleSpec = (proposal = {}) => {
  const type = String(proposal.type || 'unbound')
  if (!HOST_RULE_TRIGGER_TYPES.has(type)) return undefined
  const ruleSpec = proposal.ruleSpec && typeof proposal.ruleSpec === 'object' ? proposal.ruleSpec : {}
  const summary = sanitizeTriggerSpecText(
    ruleSpec.summary || proposal.notes,
    type === 'random'
      ? 'Use as a host-owned random or occasional behavior.'
      : type === 'state'
        ? 'Use when a host-owned state predicate matches.'
        : 'Use when a host-owned event is received.'
  )
  if (type === 'random') {
    const schedule = ruleSpec.schedule && typeof ruleSpec.schedule === 'object' ? ruleSpec.schedule : {}
    const mode = schedule.mode === 'interval' ? 'interval' : 'opportunistic'
    const intervalMs = Number(schedule.intervalMs)
    return {
      schemaVersion: 1,
      type,
      summary,
      schedule: {
        mode,
        ...(mode === 'interval' && Number.isFinite(intervalMs) && intervalMs > 0
          ? { intervalMs: Math.min(Math.round(intervalMs), 24 * 60 * 60 * 1000) }
          : {})
      }
    }
  }
  if (type === 'state') {
    const state = ruleSpec.state && typeof ruleSpec.state === 'object' ? ruleSpec.state : {}
    return {
      schemaVersion: 1,
      type,
      summary,
      state: {
        predicate: sanitizeTriggerSpecText(state.predicate || proposal.binding, 'host.state.available'),
        source: sanitizeTriggerSpecText(state.source, 'creator-studio')
      }
    }
  }
  const event = ruleSpec.event && typeof ruleSpec.event === 'object' ? ruleSpec.event : {}
  return {
    schemaVersion: 1,
    type,
    summary,
    event: {
      name: sanitizeTriggerSpecText(event.name || proposal.binding, 'openpet.event'),
      source: sanitizeTriggerSpecText(event.source, 'creator-studio')
    }
  }
}

const normalizeTriggerProposal = (proposal = {}) => {
  const type = String(proposal.type || 'unbound')
  if (!VALID_TRIGGER_TYPES.has(type)) throw new Error(`Creator Studio trigger type is invalid: ${type}`)
  const ruleSpec = createTriggerRuleSpec({ ...proposal, type })
  return {
    type,
    ...(proposal.binding ? { binding: String(proposal.binding) } : {}),
    ...(proposal.notes ? { notes: String(proposal.notes) } : {}),
    ...(ruleSpec ? { ruleSpec } : {})
  }
}

const sanitizeActionSpecText = (value = '') => sanitizeTriggerSpecText(value, '').slice(0, MAX_ACTION_SPEC_TEXT_LENGTH)

const normalizeSpecList = (value) => (
  Array.isArray(value)
    ? value.map(sanitizeActionSpecText).filter(Boolean).slice(0, 12)
    : []
)

const normalizeAction = (action = {}, index = 0) => {
  const name = String(action.name || `Action ${index + 1}`).trim() || `Action ${index + 1}`
  const actionId = String(action.actionId || hashActionId(name)).trim()
  if (!SAFE_ACTION_ID_PATTERN.test(actionId)) throw new Error(`Creator Studio actionId is invalid: ${actionId}`)
  const loop = Boolean(action.loop)
  const animationType = String(action.animationType || '').trim()
  if (animationType && !VALID_ANIMATION_TYPES.has(animationType)) {
    throw new Error(`Creator Studio animationType is invalid: ${animationType}`)
  }
  return {
    actionId,
    name,
    motionPrompt: String(action.motionPrompt || name).trim() || name,
    loop,
    frameCount: clampFrameCount(action.frameCount, loop ? 12 : 16),
    transparentBackground: action.transparentBackground !== false,
    ...(animationType ? { animationType } : {}),
    ...(action.viewDirection ? { viewDirection: sanitizeActionSpecText(action.viewDirection) } : {}),
    ...(action.loopType ? { loopType: sanitizeActionSpecText(action.loopType) } : {}),
    ...(normalizeSpecList(action.animatedParts).length > 0 ? { animatedParts: normalizeSpecList(action.animatedParts) } : {}),
    ...(normalizeSpecList(action.lockedParts).length > 0 ? { lockedParts: normalizeSpecList(action.lockedParts) } : {}),
    ...(normalizeSpecList(action.secondaryMotion).length > 0 ? { secondaryMotion: normalizeSpecList(action.secondaryMotion) } : {}),
    ...(normalizeSpecList(action.forbiddenMotion).length > 0 ? { forbiddenMotion: normalizeSpecList(action.forbiddenMotion) } : {}),
    ...(normalizeSpecList(action.framePlan).length > 0 ? { framePlan: normalizeSpecList(action.framePlan) } : {}),
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
  const styleSource = String(task.styleSource || (mode === 'single-action' ? 'currentPet' : 'referenceImage'))
  if (!VALID_STYLE_SOURCES.has(styleSource)) throw new Error(`Creator Studio styleSource is invalid: ${styleSource}`)
  const actions = Array.isArray(task.actions)
      ? task.actions.map(normalizeAction).map((action) => (
          mode === 'single-action'
            ? { ...action, synthesisMode: 'canonical-frame' }
            : action
        ))
      : []
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
  createTriggerRuleSpec,
  hashActionId,
  normalizeGenerationTask
}
