const crypto = require('node:crypto')

const normalizeText = (value) => String(value || '').trim()

const createMotionPreset = ({ actionId, id, phases }) => Object.freeze({
  actionId,
  id,
  frameCount: phases.length,
  phases: Object.freeze(phases.map((phase) => Object.freeze({ ...phase })))
})

const MOTION_PRESETS = Object.freeze({
  'idle-subtle-loop-v1': createMotionPreset({
    actionId: 'idle',
    id: 'idle-subtle-loop-v1',
    phases: [
      { id: 'canonical-neutral', prompt: 'match the accepted neutral pose and body root' },
      { id: 'inhale', prompt: 'begin one subtle breathing or source-appropriate secondary movement' },
      { id: 'secondary-motion', prompt: 'continue the small local movement without translating the body' },
      { id: 'peak', prompt: 'reach the quiet motion peak while preserving identity and scale' },
      { id: 'settle', prompt: 'settle toward the accepted neutral pose' },
      { id: 'canonical-return', prompt: 'return to the accepted neutral pose for a seamless loop' }
    ]
  }),
  'running-right-gait-v1': createMotionPreset({
    actionId: 'running-right',
    id: 'running-right-gait-v1',
    phases: [
      { id: 'contact', prompt: 'right-facing first contact pose with opposing locomotion limbs separated' },
      { id: 'down', prompt: 'right-facing down pose with readable weight absorption' },
      { id: 'passing', prompt: 'right-facing first passing pose with the support limb under the body' },
      { id: 'up', prompt: 'right-facing first up pose before the next contact' },
      { id: 'opposite-contact', prompt: 'right-facing opposite contact pose with limb positions reversed' },
      { id: 'opposite-down', prompt: 'right-facing opposite down pose with clear weight transfer' },
      { id: 'opposite-passing', prompt: 'right-facing opposite passing pose with exchanged limb roles' },
      { id: 'loop-close', prompt: 'right-facing loop-closing up pose that returns smoothly to frame 1' }
    ]
  }),
  'waving-four-phase-v1': createMotionPreset({
    actionId: 'waving',
    id: 'waving-four-phase-v1',
    phases: [
      { id: 'neutral', prompt: 'neutral anchored pose with the greeting limb down' },
      { id: 'lift', prompt: 'begin lifting the source-appropriate greeting limb' },
      { id: 'peak', prompt: 'readable raised-limb greeting peak beside the face' },
      { id: 'return', prompt: 'return the greeting limb toward the neutral pose' }
    ]
  }),
  'jumping-five-phase-v1': createMotionPreset({
    actionId: 'jumping',
    id: 'jumping-five-phase-v1',
    phases: [
      { id: 'anticipation', prompt: 'grounded anticipation at the original horizontal root' },
      { id: 'takeoff', prompt: 'clear takeoff with the body leaving the baseline' },
      { id: 'airborne-peak', prompt: 'highest airborne pose with preserved anatomical scale' },
      { id: 'landing', prompt: 'landing pose returning to the original horizontal root' },
      { id: 'grounded-recovery', prompt: 'grounded recovery that closes the loop' }
    ]
  }),
  'failed-eight-phase-v1': createMotionPreset({
    actionId: 'failed',
    id: 'failed-eight-phase-v1',
    phases: [
      { id: 'neutral', prompt: 'neutral anchored state' },
      { id: 'recognition', prompt: 'recognize the failed outcome with a readable local reaction' },
      { id: 'compression', prompt: 'compress the pose without changing anatomical scale' },
      { id: 'dejected-peak', prompt: 'clearest dejected failure pose' },
      { id: 'hold', prompt: 'briefly hold the failure pose' },
      { id: 'recovery-start', prompt: 'begin recovering while the root stays fixed' },
      { id: 'recovery', prompt: 'continue returning toward neutral' },
      { id: 'loop-close', prompt: 'close the loop at the original root and scale' }
    ]
  }),
  'waiting-six-phase-v1': createMotionPreset({
    actionId: 'waiting',
    id: 'waiting-six-phase-v1',
    phases: [
      { id: 'neutral', prompt: 'neutral patient pose' },
      { id: 'attention-shift', prompt: 'small source-appropriate attention shift' },
      { id: 'patient-hold', prompt: 'patient hold distinct from the quiet idle' },
      { id: 'secondary-motion', prompt: 'small waiting-specific secondary movement' },
      { id: 'settle', prompt: 'settle toward the neutral pose' },
      { id: 'neutral-return', prompt: 'return to neutral for a seamless loop' }
    ]
  }),
  'working-six-phase-v1': createMotionPreset({
    actionId: 'running',
    id: 'working-six-phase-v1',
    phases: [
      { id: 'neutral-work', prompt: 'neutral focused work pose' },
      { id: 'engage', prompt: 'engage in the in-place work motion' },
      { id: 'work-peak-a', prompt: 'first readable work peak' },
      { id: 'transition', prompt: 'transition to the complementary work pose' },
      { id: 'work-peak-b', prompt: 'second complementary work peak' },
      { id: 'loop-close', prompt: 'return toward the focused starting pose' }
    ]
  }),
  'review-six-phase-v1': createMotionPreset({
    actionId: 'review',
    id: 'review-six-phase-v1',
    phases: [
      { id: 'neutral', prompt: 'neutral anchored pose' },
      { id: 'inspect-start', prompt: 'begin a deliberate inspection motion' },
      { id: 'inspect-peak', prompt: 'clearest readable inspection pose' },
      { id: 'decision-beat', prompt: 'small decision or acknowledgement beat' },
      { id: 'settle', prompt: 'settle toward the starting pose' },
      { id: 'neutral-return', prompt: 'return to neutral for a seamless loop' }
    ]
  })
})

const DEFAULT_MOTION_PRESET_BY_ACTION = Object.freeze(Object.fromEntries(
  Object.values(MOTION_PRESETS).map((preset) => [preset.actionId, preset.id])
))

const getDefaultMotionPresetId = (actionId) => DEFAULT_MOTION_PRESET_BY_ACTION[normalizeText(actionId)] || ''

const expandMotionPreset = ({ actionId, motionPresetId, motionParameters = {}, frameCount } = {}) => {
  const normalizedActionId = normalizeText(actionId)
  const preset = MOTION_PRESETS[normalizeText(motionPresetId)]
  if (!preset || preset.actionId !== normalizedActionId) {
    throw new Error(`Unsupported motion preset for ${normalizedActionId || 'action'}`)
  }
  if (Number(frameCount) !== preset.frameCount) {
    throw new Error(`Motion preset ${preset.id} requires ${preset.frameCount} frames`)
  }
  const allowedParameters = new Set(['intensity', 'leadSide'])
  for (const key of Object.keys(motionParameters || {})) {
    if (!allowedParameters.has(key)) throw new Error(`Motion preset contains unknown motion parameter ${key}`)
  }
  const intensity = normalizeText(motionParameters.intensity || 'normal')
  const leadSide = normalizeText(motionParameters.leadSide || 'viewer-left')
  if (!new Set(['subtle', 'normal']).has(intensity)) throw new Error('Motion preset intensity is invalid')
  if (!new Set(['viewer-left', 'viewer-right']).has(leadSide)) throw new Error('Motion preset leadSide is invalid')
  const semanticChecks = preset.phases.map((phase) => phase.id)
  const framePlan = preset.phases.map((phase, index) => (
    `Frame ${index + 1}: ${phase.prompt}; use ${intensity} intensity and let ${leadSide} lead where a side is required.`
  ))
  const payload = {
    version: 1,
    actionId: normalizedActionId,
    motionPresetId: preset.id,
    motionParameters: { intensity, leadSide },
    framePlan,
    movingParts: [resolvePrimaryAnimatedPart({ actionId: normalizedActionId })],
    lockedParts: getDefaultLockedParts({ actionId: normalizedActionId }),
    semanticChecks
  }
  return Object.freeze({
    ...payload,
    hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  })
}

const getActionText = (action = {}) => [
  action.actionId,
  action.name,
  action.motionPrompt
].map(normalizeText).filter(Boolean).join(' ')

const getActionIdentityText = (action = {}) => [
  action.actionId,
  action.name
].map(normalizeText).filter(Boolean).join(' ')

const getActionId = (action = {}) => normalizeText(action?.actionId).toLowerCase()

const isWorkStateAction = (value = '') => (
  typeof value === 'object' && getActionId(value) === 'running'
)

const isIdleAction = (value = '') => /(^|\s)(idle|idling|resting-idle)(\s|$)|待机|空闲/i.test(
  typeof value === 'object' ? getActionText(value) : normalizeText(value)
)

const isWavingAction = (value = '') => /wave|waving|挥手|招手|挥爪|paw\s*wave/i.test(
  typeof value === 'object' ? getActionText(value) : normalizeText(value)
)

const isLocomotionAction = (value = '') => {
  if (typeof value === 'object') {
    if (isWorkStateAction(value)) return false
    if (['running-right', 'running-left'].includes(getActionId(value))) return true
  }
  return /walk|run|running|crawl|fly|flying|走|跑|奔跑|爬行|飞/i.test(
    typeof value === 'object' ? getActionText(value) : normalizeText(value)
  )
}

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
  if (isWorkStateAction(action)) return 'stationary_loop'
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

const getDefaultLockedParts = (action = {}) => {
  if (isIdleAction(action)) {
    return [
      'face',
      'eyes',
      'identity markings',
      'body proportions',
      'character scale',
      'torso center',
      'foot baseline',
      'lower-center root',
      'horizontal cell placement'
    ]
  }
  if (isVerticalBounceAction(action) || inferAnimationType(action) === 'vertical_bounce') {
    return [
      'face',
      'eyes',
      'identity markings',
      'body proportions',
      'character scale',
      'horizontal root alignment',
      'silhouette volume'
    ]
  }
  return ['face', 'eyes', 'identity markings', 'body proportions', 'character scale']
}

const resolvePrimaryAnimatedPart = (action = {}) => {
  if (isWorkStateAction(action)) return 'visible attention features and one small identity-safe processing or scanning motion'
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
  work_state: Object.freeze([
    'neutral focused pose with the complete character anchored at the lower-center root',
    'begin one small readable processing or scanning motion using visible attention features',
    'reach the clearest focused work-state moment without changing viewpoint or body root',
    'shift the small processing or scanning motion to its complementary position',
    'return toward the neutral focused pose while preserving identity and scale',
    'settle into the starting focused pose for a seamless stationary loop'
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
  const custom = Array.isArray(action.framePlan) ? action.framePlan.map(stripFramePrefix).filter(Boolean) : []
  const animationType = inferAnimationType(action)
  const phases = custom.length >= 2
    ? custom
    : isWorkStateAction(action)
      ? ACTION_PHASES.work_state
      : isIdleAction(action)
        ? ACTION_PHASES.idle
        : isWavingAction(action)
          ? ACTION_PHASES.wave
          : ACTION_PHASES[animationType] || ACTION_PHASES.reaction
  return expandPhases(phases, count).map((description, index) => `Frame ${index + 1}: ${description}.`)
}

const getKeyframePoseInstruction = ({ action = {}, keyframeRole = 'start' } = {}) => {
  const isStart = /start|first|neutral/i.test(normalizeText(keyframeRole))
  const animationType = inferAnimationType(action)
  if (isWorkStateAction(action)) {
    return isStart
      ? 'Pose: neutral focused work-state pose with the full body anchored and the canonical viewpoint preserved.'
      : 'Pose: clearest processing, focus, or scanning moment using only a small identity-safe local motion while the body root, scale, and viewpoint remain fixed.'
  }
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
  MOTION_PRESETS,
  buildActionFramePlan,
  expandMotionPreset,
  getActionText,
  getDefaultMotionPresetId,
  getDefaultLockedParts,
  getKeyframePoseInstruction,
  inferAnimationType,
  isEmoteAction,
  isIdleAction,
  isLocomotionAction,
  isPoseTransitionAction,
  isReactionAction,
  isVerticalBounceAction,
  isWavingAction,
  isWorkStateAction,
  resolvePrimaryAnimatedPart
}
