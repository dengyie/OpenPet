const { getActionSheetLayout, normalizeFrameCount } = require('./action-sheet-layout')
const { createQualityGuidanceLines } = require('./pet-generation-human-examples')
const {
  DEFAULT_FULL_BODY_SUBJECT,
  createProviderImageTask,
  sanitizeVisualDirective
} = require('./provider-image-task')
const {
  PROMPT_COMPILER_VERSION,
  compileProviderImagePrompt
} = require('./provider-image-prompt-compiler')
const { createVisualPlan } = require('./visual-plan')
const {
  buildActionFramePlan,
  getKeyframePoseInstruction,
  inferAnimationType,
  resolvePrimaryAnimatedPart
} = require('./action-semantics')

const PROMPT_BUILDER_VERSION = 6

const normalizeActionText = (value, fallback = '') => (
  sanitizeVisualDirective(value || fallback)
)

const resolveLoopIntent = (action = {}) => {
  const animationType = inferAnimationType(action)
  if (animationType === 'locomotion_loop') return 'a seamless in-place locomotion cycle'
  if (animationType === 'vertical_bounce') return 'a grounded jump that returns to the original baseline'
  if (animationType === 'stationary_loop') return 'a seamless stationary loop with a stable body root'
  if (animationType === 'pose_transition') return 'a readable transition from the starting pose to the ending pose'
  return 'a readable action with a stable identity and clear recovery'
}

const resolveViewDirection = (action = {}) => {
  const explicit = normalizeActionText(action.viewDirection)
  if (explicit) return explicit
  if (inferAnimationType(action) === 'locomotion_loop') return 'preserve the requested directional facing'
  return 'preserve the canonical viewpoint'
}

const createVisualAction = ({ action = {}, keyframeRole = '', frameCount = 0 } = {}) => {
  const normalizedRole = String(keyframeRole || '').trim().toLowerCase()
  const name = normalizeActionText(action.name, action.motionPrompt || 'the requested action')
  const moment = normalizedRole
    ? getKeyframePoseInstruction({ action, keyframeRole: normalizedRole })
    : normalizeActionText(action.motionPrompt, name)
  return {
    name,
    animationType: inferAnimationType(action),
    moment,
    viewDirection: resolveViewDirection(action),
    loopType: normalizeActionText(action.loopType, resolveLoopIntent(action)),
    movingParts: Array.isArray(action.animatedParts) && action.animatedParts.length
      ? action.animatedParts
      : [resolvePrimaryAnimatedPart(action)],
    secondaryMotion: Array.isArray(action.secondaryMotion) ? action.secondaryMotion : [],
    lockedParts: Array.isArray(action.lockedParts) && action.lockedParts.length
      ? action.lockedParts
      : ['visible identity-bearing features', 'identity markings', 'body proportions', 'character scale'],
    forbiddenMotion: Array.isArray(action.forbiddenMotion) ? action.forbiddenMotion : [],
    loopIntent: resolveLoopIntent(action),
    frameBeats: frameCount > 0 ? buildActionFramePlan({ action, frameCount }) : []
  }
}

const createCompiledResult = ({
  role,
  compiled,
  actionId = '',
  frameCount = 0,
  keyframeRole = ''
}) => ({
  role,
  version: PROMPT_BUILDER_VERSION,
  promptCompilerVersion: PROMPT_COMPILER_VERSION,
  prompt: compiled.text,
  promptCompiler: compiled.safeSummary,
  warnings: compiled.warnings,
  ...(actionId ? { actionId } : {}),
  ...(frameCount ? { frameCount } : {}),
  ...(keyframeRole ? { keyframeRole } : {})
})

const buildCharacterAnchorPrompt = ({
  model = 'gpt-image-2',
  referenceRole = 'single-character-reference',
  qualityGuidance = null,
  canvas,
  appearanceIntent = [],
  visualPlan = null,
  strategyId = '',
  requestedChanges = []
} = {}) => {
  const resolvedVisualPlan = createVisualPlan(visualPlan || {
    appearanceIntent,
    requestedChanges,
    subject: DEFAULT_FULL_BODY_SUBJECT
  })
  const task = createProviderImageTask({
    taskType: 'character-image',
    stage: 'identity',
    canvas,
    referenceRole,
    subject: DEFAULT_FULL_BODY_SUBJECT,
    appearanceIntent: resolvedVisualPlan.subject.mediumAndStyle,
    strategyId,
    requestedChanges: resolvedVisualPlan.subject.requestedVisibleChanges
  })
  const compiled = compileProviderImagePrompt({
    task,
    model,
    visualPlan: resolvedVisualPlan,
    qualityGuidance: createQualityGuidanceLines({ qualityGuidance })
  })
  return createCompiledResult({ role: 'character-anchor', compiled })
}

const buildActionKeyframePrompt = ({
  model = 'gpt-image-2',
  referenceRole = 'single-character-reference',
  action = {},
  keyframeRole = 'start',
  qualityGuidance = null,
  canvas,
  appearanceIntent = [],
  visualPlan = null,
  strategyId = '',
  requestedChanges = []
} = {}) => {
  const actionId = normalizeActionText(action.actionId, 'action')
  const normalizedKeyframeRole = String(keyframeRole || '').trim().toLowerCase() === 'start'
    ? 'start'
    : 'peak'
  const visualAction = createVisualAction({ action, keyframeRole: normalizedKeyframeRole })
  const resolvedVisualPlan = createVisualPlan(visualPlan || {
    appearanceIntent,
    requestedChanges,
    action: visualAction,
    subject: DEFAULT_FULL_BODY_SUBJECT
  })
  const task = createProviderImageTask({
    taskType: 'action-keyframe',
    stage: normalizedKeyframeRole,
    canvas,
    referenceRole,
    subject: DEFAULT_FULL_BODY_SUBJECT,
    action: visualAction,
    appearanceIntent: resolvedVisualPlan.subject.mediumAndStyle,
    strategyId,
    requestedChanges: resolvedVisualPlan.subject.requestedVisibleChanges
  })
  const compiled = compileProviderImagePrompt({
    task,
    model,
    visualPlan: resolvedVisualPlan,
    qualityGuidance: createQualityGuidanceLines({
      qualityGuidance,
      actionId: action.actionId,
      animationType: inferAnimationType(action)
    })
  })
  return createCompiledResult({
    role: 'action-keyframe',
    compiled,
    actionId,
    keyframeRole: normalizedKeyframeRole
  })
}

const buildActionAnchorPrompt = ({
  model = 'gpt-image-2',
  referenceRole = 'single-character-reference',
  action = {},
  qualityGuidance = null,
  canvas,
  appearanceIntent = [],
  visualPlan = null,
  strategyId = '',
  requestedChanges = []
} = {}) => {
  const actionId = normalizeActionText(action.actionId, 'action')
  const visualAction = createVisualAction({ action, keyframeRole: 'peak' })
  const resolvedVisualPlan = createVisualPlan(visualPlan || {
    appearanceIntent,
    requestedChanges,
    action: visualAction,
    subject: DEFAULT_FULL_BODY_SUBJECT
  })
  const task = createProviderImageTask({
    taskType: 'action-keyframe',
    stage: 'peak',
    canvas,
    referenceRole,
    subject: DEFAULT_FULL_BODY_SUBJECT,
    action: visualAction,
    appearanceIntent: resolvedVisualPlan.subject.mediumAndStyle,
    strategyId,
    requestedChanges: resolvedVisualPlan.subject.requestedVisibleChanges
  })
  const compiled = compileProviderImagePrompt({
    task,
    model,
    visualPlan: resolvedVisualPlan,
    qualityGuidance: createQualityGuidanceLines({
      qualityGuidance,
      actionId: action.actionId,
      animationType: inferAnimationType(action)
    })
  })
  return createCompiledResult({ role: 'action-anchor', compiled, actionId })
}

const buildActionSpriteRowPrompt = ({
  model = 'gpt-image-2',
  referenceRole = 'identity-and-motion-reference',
  action = {},
  qualityGuidance = null,
  canvas,
  appearanceIntent = [],
  visualPlan = null,
  strategyId = '',
  requestedChanges = []
} = {}) => {
  const actionId = normalizeActionText(action.actionId, 'action')
  const frameCount = normalizeFrameCount(action.frameCount || 6)
  const layout = getActionSheetLayout(frameCount)
  const visualAction = createVisualAction({ action, frameCount })
  const resolvedVisualPlan = createVisualPlan(visualPlan || {
    appearanceIntent,
    requestedChanges,
    action: visualAction,
    subject: DEFAULT_FULL_BODY_SUBJECT
  })
  const task = createProviderImageTask({
    taskType: 'action-frame-sheet',
    stage: 'final',
    ...(canvas ? { canvas } : {}),
    sheet: {
      frameCount,
      columns: layout.columns,
      rows: layout.rows,
      readingOrder: 'left-to-right-top-to-bottom'
    },
    referenceRole,
    subject: DEFAULT_FULL_BODY_SUBJECT,
    action: visualAction,
    appearanceIntent: resolvedVisualPlan.subject.mediumAndStyle,
    strategyId,
    requestedChanges: resolvedVisualPlan.subject.requestedVisibleChanges
  })
  const compiled = compileProviderImagePrompt({
    task,
    model,
    visualPlan: resolvedVisualPlan,
    qualityGuidance: createQualityGuidanceLines({
      qualityGuidance,
      actionId: action.actionId,
      animationType: inferAnimationType(action)
    })
  })
  return createCompiledResult({
    role: 'action-sprite-row',
    compiled,
    actionId,
    frameCount
  })
}

module.exports = {
  PROMPT_BUILDER_VERSION,
  buildActionAnchorPrompt,
  buildActionKeyframePrompt,
  buildActionSpriteRowPrompt,
  buildCharacterAnchorPrompt,
  createVisualAction
}
