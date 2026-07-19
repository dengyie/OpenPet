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
  if (isIdleAction(action)) return 'subtle chest breathing, blink, ear movement, and tail-tip motion only'
  const custom = Array.isArray(action.animatedParts)
    ? action.animatedParts.map(normalizeText).filter(Boolean)
    : []
  if (custom[0]) return custom[0]
  const animationType = inferAnimationType(action)
  if (isWavingAction(action)) return 'waving front paw'
  if (animationType === 'locomotion_loop') return 'legs, arms, wings, tail, and locomotion parts'
  if (animationType === 'vertical_bounce') return 'whole-body vertical pose and landing limbs'
  if (animationType === 'pose_transition') return 'body parts required by the pose transition'
  if (animationType === 'emote') return 'face, eyes, mouth, ears, and small expressive parts'
  return 'head, face, ears, limbs, and reaction parts'
}

const buildActionFramePlan = ({ action = {}, frameCount = 6 } = {}) => {
  const count = Math.max(1, Number(frameCount) || 1)
  if (isIdleAction(action)) {
    if (count === 1) {
      return ['Frame 1: match the canonical identity pose, viewpoint, silhouette, scale, markings, accessories, foot baseline, and lower-center root exactly; stay in place with no cross-cell translation.']
    }
    if (count === 2) {
      return [
        'Frame 1: match the canonical identity pose, viewpoint, silhouette, scale, markings, accessories, foot baseline, and lower-center root exactly; stay in place with no cross-cell translation.',
        'Frame 2: add only a subtle breathing, blink, ear, or tail-tip change that can loop directly back to frame 1 without moving the body root, foot baseline, scale, or horizontal placement.'
      ]
    }
    return [
      'Frame 1: match the canonical identity pose, viewpoint, silhouette, scale, markings, accessories, foot baseline, and lower-center root exactly; stay in place with no cross-cell translation.',
      `Frame ${Math.max(2, Math.ceil(count / 2))}: add only a subtle breathing, blink, ear, or tail-tip change without moving the body root, foot baseline, scale, horizontal placement, or redesigning any feature.`,
      `Frame ${count}: settle back to the canonical frame-1 pose for a seamless quiet loop with the same foot baseline, body scale, and lower-center root.`
    ]
  }
  if (Array.isArray(action.framePlan) && action.framePlan.length > 0) {
    return action.framePlan.map(normalizeText).filter(Boolean)
  }
  if (isWavingAction(action)) {
    if (count <= 1) {
      return ['Frame 1: readable raised-paw wave pose with the full character visible and anchored.']
    }
    if (count === 2) {
      return [
        'Frame 1: start pose, neutral front-facing idle pose with both front limbs down.',
        'Frame 2: peak wave pose with the viewer-right front limb fully raised beside the face; loop playback returns directly to frame 1.'
      ]
    }
    if (count === 3) {
      return [
        'Frame 1: start pose, neutral front-facing idle pose with both front limbs down.',
        'Frame 2: peak pose, viewer-right front limb is fully raised beside the face.',
        'Frame 3: return pose, raised limb returns close to the neutral starting pose.'
      ]
    }
    if (count === 4) {
      return [
        'Frame 1: start pose, neutral front-facing idle pose with both front limbs down.',
        'Frame 2: viewer-right front limb begins to lift.',
        'Frame 3: peak pose, viewer-right front limb is fully raised beside the face and tilts outward in a readable wave.',
        'Frame 4: return pose, raised limb returns close to the neutral starting pose.'
      ]
    }
    if (count === 5) {
      return [
        'Frame 1: start pose, neutral front-facing idle pose with both front limbs down.',
        'Frame 2: viewer-right front limb begins to lift.',
        'Frame 3: peak pose, viewer-right front limb is fully raised beside the face.',
        'Frame 4: raised limb tilts inward while beginning to lower.',
        'Frame 5: return pose, raised limb returns close to the neutral starting pose.'
      ]
    }
    const frames = [
      'Frame 1: start pose, neutral front-facing idle pose with both front limbs down.',
      'Frame 2: viewer-right front limb begins to lift.',
      'Frame 3: peak pose, viewer-right front limb is fully raised beside the face.',
      'Frame 4: raised limb tilts slightly outward in a wave.',
      'Frame 5: raised limb tilts slightly inward in a wave.',
      'Frame 6: return pose, raised limb returns close to the neutral starting pose.'
    ]
    if (count === frames.length) return frames
    return [
      ...frames,
      `Frames 7-${count}: add controlled in-between motion to the waving appendage and settle back to the anchored neutral pose.`
    ]
  }
  if (inferAnimationType(action) === 'locomotion_loop') {
    if (count >= 8) {
      return [
        'Frame 1: first contact pose, front and rear locomotion limbs reach opposing extremes.',
        'Frame 2: down pose, body absorbs weight while the limbs begin to pass.',
        'Frame 3: first passing pose, supporting limb is under the body and the opposite limb swings forward.',
        'Frame 4: first up pose, body rises slightly before the next contact.',
        'Frame 5: opposite contact pose, limb positions clearly reverse from frame 1.',
        'Frame 6: opposite down pose with readable weight transfer.',
        'Frame 7: opposite passing pose, supporting and swinging limbs exchange roles.',
        `Frame ${count}: loop-closing up/contact transition that returns smoothly to frame 1.`
      ]
    }
    return [
      'Frame 1: in-place contact pose with opposing locomotion limbs clearly separated.',
      `Frame ${Math.max(2, Math.ceil(count / 2))}: opposite contact or passing pose with the limb pattern visibly reversed.`,
      `Frame ${count}: loop-closing contact transition at the same root anchor and body scale as frame 1.`
    ]
  }
  if (inferAnimationType(action) === 'vertical_bounce') {
    return [
      'Frame 1: grounded anticipation pose at the original baseline.',
      `Frame ${Math.max(2, Math.ceil(count / 2))}: airborne peak with clear vertical separation from the starting baseline.`,
      `Frame ${count}: landing and recovery pose returning to the original baseline.`
    ]
  }
  if (inferAnimationType(action) === 'pose_transition') {
    return [
      'Frame 1: clear start pose with the full character visible.',
      `Frame ${Math.max(2, Math.ceil(count / 2))}: readable transition pose with stable identity and proportions.`,
      `Frame ${count}: clear end pose with the character centered and aligned.`
    ]
  }
  if (inferAnimationType(action) === 'emote') {
    return [
      'Frame 1: neutral expression with the character fully visible and anchored.',
      `Frame ${Math.max(2, Math.ceil(count / 2))}: clearest expression peak using local face and head motion.`,
      `Frame ${count}: loop-compatible expression recovery with the same body anchor and identity.`
    ]
  }
  return [
    'Frame 1: neutral or anticipation pose with the character fully visible and anchored.',
    `Frame ${Math.max(2, Math.ceil(count / 2))}: clearest reaction peak using the requested reaction parts.`,
    `Frame ${count}: recovery pose with the same root anchor, scale, and identity.`
  ]
}

const getKeyframePoseInstruction = ({ action = {}, keyframeRole = 'start' } = {}) => {
  const isStart = /start|first|neutral/i.test(normalizeText(keyframeRole))
  const animationType = inferAnimationType(action)
  if (isIdleAction(action)) {
    return isStart
      ? 'Pose: match the canonical reference pose and viewpoint as closely as possible; lock lower-center root, foot baseline, scale, and proportions; do not re-frame or translate the body.'
      : 'Pose: preserve the canonical pose and silhouette with only a subtle breathing, blink, ear, or tail-tip change; keep lower-center root, foot baseline, scale, and proportions; no large motion or translation.'
  }
  if (isStart) {
    if (animationType === 'locomotion_loop') return 'Pose: first contact pose of an in-place gait cycle, full body visible, with opposing locomotion limbs clearly separated.'
    if (animationType === 'vertical_bounce') return 'Pose: grounded anticipation pose at the original baseline, full body visible and ready to jump; preserve exact identity silhouette, markings, eyes, accessories, proportions, and horizontal root.'
    return 'Pose: full-body neutral front-facing pose, body anchored at the lower-center root with locked foot baseline and body scale, both front paws/limbs down unless the source image clearly uses a different neutral stance.'
  }
  if (animationType === 'locomotion_loop') return 'Pose: opposite contact or passing pose of the gait cycle, with locomotion limbs visibly reversed from the start while identity, scale, and root remain stable.'
  if (animationType === 'vertical_bounce') return 'Pose: airborne peak with the full body clearly above the starting baseline; preserve exact identity silhouette, markings, eyes, accessories, proportions, scale, and horizontal root for a same-baseline landing.'
  if (isWavingAction(action)) return 'Pose: full-body action pose with the waving front paw clearly changed from neutral and fully raised beside the face while the head, torso, feet/base, identity, scale, and lower-center root remain stable.'
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
  resolvePrimaryAnimatedPart
}
