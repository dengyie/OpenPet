const normalizeText = (value) => String(value || '').trim()

const getActionText = (action = {}) => [
  action.actionId,
  action.name,
  action.motionPrompt
].map(normalizeText).filter(Boolean).join(' ')

const getActionIdentityText = (action = {}) => [
  action.actionId,
  action.name
].map(normalizeText).filter(Boolean).join(' ')

const isIdleAction = (value = '') => /(^|\s)(idle|idling|resting-idle)(\s|$)|待机|空闲/i.test(
  typeof value === 'object' ? getActionText(value) : normalizeText(value)
)

const isWavingAction = (value = '') => /wave|waving|挥手|招手|挥爪|paw\s*wave/i.test(
  typeof value === 'object' ? getActionText(value) : normalizeText(value)
)

const isLocomotionAction = (value = '') => /walk|run|running|crawl|fly|flying|走|跑|奔跑|爬行|飞/i.test(
  typeof value === 'object' ? getActionText(value) : normalizeText(value)
)

const isVerticalBounceAction = (value = '') => /jump|hop|bounce|cheer|蹦|跳|弹跳|欢呼/i.test(
  typeof value === 'object' ? getActionText(value) : normalizeText(value)
)

const isPoseTransitionAction = (value = '') => /sit|lie|sleep|wake|stand|fall|坐|躺|睡|醒|站|摔|倒/i.test(
  typeof value === 'object' ? getActionText(value) : normalizeText(value)
)

const isEmoteAction = (value = '') => /emote|emoji|sparkle|heart|expression|face\s*change|表情|爱心|星星/i.test(
  typeof value === 'object' ? getActionText(value) : normalizeText(value)
)

const isReactionAction = (value = '') => /reaction|react|clicked|tap|touch|surprised|startled|hit|被点|点击|触摸|摸|反应|惊讶|吓/i.test(
  typeof value === 'object' ? getActionText(value) : normalizeText(value)
)

const inferAnimationTypeFromText = (value = '') => {
  const text = normalizeText(value)
  if (!text) return ''
  if (isIdleAction(text)) return 'stationary_loop'
  if (isWavingAction(text)) return 'stationary_loop'
  if (isVerticalBounceAction(text)) return 'vertical_bounce'
  if (isLocomotionAction(text)) return 'locomotion_loop'
  if (isPoseTransitionAction(text)) return 'pose_transition'
  if (isReactionAction(text)) return 'reaction'
  if (isEmoteAction(text)) return 'emote'
  return ''
}

const inferAnimationType = (action = {}) => {
  if (isIdleAction(action)) return 'stationary_loop'
  const explicit = normalizeText(action.animationType)
  if (explicit) return explicit
  const identityType = inferAnimationTypeFromText(getActionIdentityText(action))
  if (identityType) return identityType
  const promptType = inferAnimationTypeFromText(action.motionPrompt)
  if (promptType) return promptType
  if (action.loop) return 'stationary_loop'
  return 'reaction'
}

const resolvePrimaryAnimatedPart = (action = {}) => {
  if (isIdleAction(action)) return 'subtle breathing or another small identity-safe local motion only'
  const custom = Array.isArray(action.animatedParts)
    ? action.animatedParts.map(normalizeText).filter(Boolean)
    : []
  if (custom[0]) return custom[0]
  const animationType = inferAnimationType(action)
  if (isWavingAction(action)) return 'the selected visible waving appendage'
  if (animationType === 'locomotion_loop') return 'the visible locomotion appendages and supporting body motion'
  if (animationType === 'vertical_bounce') return 'the whole-body vertical pose and visible landing supports'
  if (animationType === 'pose_transition') return 'the visible body parts required by the pose transition'
  if (animationType === 'emote') return 'the visible expressive features'
  return 'the visible parts required to communicate the reaction'
}

const ACTION_PHASES = Object.freeze({
  idle: Object.freeze([
    'match the canonical identity pose, viewpoint, silhouette, scale, markings, accessories, and lower-center root',
    'begin one subtle identity-safe local motion without moving the body root',
    'reach the quiet local-motion peak while preserving the canonical silhouette',
    'return from the local-motion peak without changing scale or viewpoint',
    'settle back into the canonical starting pose for a seamless quiet loop'
  ]),
  wave: Object.freeze([
    'neutral anchored pose with the selected waving appendage at rest',
    'begin lifting the selected waving appendage while the body root stays fixed',
    'raise the selected waving appendage into a clearly readable greeting pose',
    'tilt the raised appendage outward at the wave peak',
    'tilt the raised appendage inward while beginning to lower it',
    'return close to the neutral anchored starting pose'
  ]),
  locomotion_loop: Object.freeze([
    'first in-place contact pose with opposing visible locomotion appendages clearly separated',
    'down pose with readable weight absorption and the root kept in place',
    'first passing pose with supporting and moving appendages exchanging roles',
    'first up pose with a small body rise before the next contact',
    'opposite contact pose with the visible appendage pattern reversed',
    'opposite down pose with readable weight transfer',
    'opposite passing pose with supporting and moving appendages exchanged',
    'loop-closing up-to-contact transition that returns smoothly to the first pose'
  ]),
  vertical_bounce: Object.freeze([
    'grounded neutral pose at the original baseline',
    'anticipation compression at the original baseline',
    'lift-off pose beginning clear upward movement',
    'airborne rise with the full character separated from the baseline',
    'highest airborne peak with stable horizontal alignment',
    'controlled descent toward the original baseline',
    'landing compression at the original baseline',
    'recovery pose returning to the starting alignment'
  ]),
  pose_transition: Object.freeze([
    'clear complete starting pose',
    'early transition away from the starting pose',
    'readable midpoint with stable identity and proportions',
    'late transition approaching the requested final pose',
    'clear complete final pose with the character centered and aligned'
  ]),
  emote: Object.freeze([
    'neutral readable expression with the character anchored',
    'expression begins using only the permitted visible expressive features',
    'expression rises toward the requested emotion',
    'clearest expression peak',
    'expression begins to recover while identity remains stable',
    'loop-compatible return toward the neutral expression'
  ]),
  reaction: Object.freeze([
    'neutral or anticipation pose with the character fully visible and anchored',
    'reaction begins in the permitted visible parts',
    'reaction rises toward the requested state',
    'clearest readable reaction peak',
    'controlled recovery with the same root anchor and scale',
    'settled ending pose compatible with the requested loop or stop'
  ])
})

const stripFramePrefix = (value) => normalizeText(value).replace(/^Frame\s+\d+\s*:\s*/i, '').replace(/[.。]+$/, '')

const expandPhases = (phases, count) => {
  const normalized = phases.map(stripFramePrefix).filter(Boolean)
  if (!normalized.length) return ACTION_PHASES.reaction.slice(0, Math.min(count, ACTION_PHASES.reaction.length))
  if (count === 1) return [normalized[0]]
  return Array.from({ length: count }, (_, index) => {
    const position = (index * (normalized.length - 1)) / (count - 1)
    const lowerIndex = Math.floor(position)
    const upperIndex = Math.ceil(position)
    if (lowerIndex === upperIndex) return normalized[lowerIndex]
    const fraction = position - lowerIndex
    if (fraction < 0.34) return normalized[lowerIndex]
    if (fraction > 0.66) return normalized[upperIndex]
    return `controlled in-between pose from ${normalized[lowerIndex]} toward ${normalized[upperIndex]}`
  })
}

const buildActionFramePlan = ({ action = {}, frameCount = 6 } = {}) => {
  const count = Math.max(1, Number(frameCount) || 1)
  const custom = Array.isArray(action.framePlan)
    ? action.framePlan.map(stripFramePrefix).filter(Boolean)
    : []
  const animationType = inferAnimationType(action)
  const phases = custom.length >= 2
    ? custom
    : isIdleAction(action)
      ? ACTION_PHASES.idle
      : isWavingAction(action)
        ? ACTION_PHASES.wave
        : ACTION_PHASES[animationType] || ACTION_PHASES.reaction
  return expandPhases(phases, count).map((description, index) => (
    `Frame ${index + 1}: ${description}.`
  ))
}

const getKeyframePoseInstruction = ({ action = {}, keyframeRole = 'start' } = {}) => {
  const isStart = /start|first|neutral/i.test(normalizeText(keyframeRole))
  const animationType = inferAnimationType(action)
  if (isIdleAction(action)) {
    return isStart
      ? 'Pose: match the canonical reference pose and viewpoint as closely as possible; do not force a new front-facing view or change limb placement merely to neutralize the pose.'
      : 'Pose: preserve the canonical pose and silhouette with only one subtle identity-safe local change; no action extreme, large appendage movement, or body-root motion.'
  }
  if (isStart) {
    if (animationType === 'locomotion_loop') return 'Pose: first contact pose of an in-place gait cycle, full body visible, with opposing visible locomotion appendages clearly separated.'
    if (animationType === 'vertical_bounce') return 'Pose: grounded anticipation pose at the original baseline, full body visible and ready to jump.'
    return 'Pose: full-body neutral pose with the body anchored and visible motion appendages at rest unless the source image clearly uses a different neutral stance.'
  }
  if (animationType === 'locomotion_loop') return 'Pose: opposite contact or passing pose of the gait cycle, with visible locomotion appendages reversed from the start while identity, scale, and root remain stable.'
  if (animationType === 'vertical_bounce') return 'Pose: airborne peak with the full body clearly above the starting baseline; preserve identity, scale, and horizontal root alignment so the final sequence can return to the same baseline.'
  if (isWavingAction(action)) return 'Pose: full-body action pose with the selected visible waving appendage clearly changed from neutral and fully raised into a readable greeting while the rest of the identity, scale, and lower-center root remain stable.'
  return `Pose: full-body action peak with the ${resolvePrimaryAnimatedPart(action)} clearly changed from neutral while identity, scale, and lower-center root remain stable.`
}

module.exports = {
  buildActionFramePlan,
  getActionText,
  getKeyframePoseInstruction,
  inferAnimationType,
  isEmoteAction,
  isIdleAction,
  isLocomotionAction,
  isPoseTransitionAction,
  isReactionAction,
  isVerticalBounceAction,
  isWavingAction,
  resolvePrimaryAnimatedPart
}
