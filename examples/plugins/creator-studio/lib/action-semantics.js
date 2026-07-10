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
  if (isWavingAction(text)) return 'stationary_loop'
  if (isVerticalBounceAction(text)) return 'vertical_bounce'
  if (isLocomotionAction(text)) return 'locomotion_loop'
  if (isPoseTransitionAction(text)) return 'pose_transition'
  if (isReactionAction(text)) return 'reaction'
  if (isEmoteAction(text)) return 'emote'
  return ''
}

const inferAnimationType = (action = {}) => {
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
  if (Array.isArray(action.framePlan) && action.framePlan.length > 0) {
    return action.framePlan.map(normalizeText).filter(Boolean)
  }
  const count = Math.max(1, Number(frameCount) || 1)
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
  if (isStart) {
    if (animationType === 'locomotion_loop') return 'Pose: first contact pose of an in-place gait cycle, full body visible, with opposing locomotion limbs clearly separated.'
    if (animationType === 'vertical_bounce') return 'Pose: grounded anticipation pose at the original baseline, full body visible and ready to jump.'
    return 'Pose: full-body neutral front-facing pose, body anchored, both front paws/limbs down unless the source image clearly uses a different neutral stance.'
  }
  if (animationType === 'locomotion_loop') return 'Pose: opposite contact or passing pose of the gait cycle, with locomotion limbs visibly reversed from the start while identity, scale, and root remain stable.'
  if (animationType === 'vertical_bounce') return 'Pose: airborne peak with the full body clearly above the starting baseline; preserve identity, scale, and horizontal root alignment so the final sequence can return to the same baseline.'
  if (isWavingAction(action)) return 'Pose: full-body action pose with the waving front paw clearly changed from neutral and fully raised beside the face while the head, torso, feet/base, identity, scale, and lower-center root remain stable.'
  return `Pose: full-body action peak with the ${resolvePrimaryAnimatedPart(action)} clearly changed from neutral while identity, scale, and lower-center root remain stable.`
}

module.exports = {
  buildActionFramePlan,
  getActionText,
  getKeyframePoseInstruction,
  inferAnimationType,
  isEmoteAction,
  isLocomotionAction,
  isPoseTransitionAction,
  isReactionAction,
  isVerticalBounceAction,
  isWavingAction,
  resolvePrimaryAnimatedPart
}
