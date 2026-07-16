const { normalizeGenerationTask } = require('./generation-task')
const { getActionSheetLayout: resolveActionSheetLayout } = require('./action-sheet-layout')
const { createQualityGuidanceLines } = require('./pet-generation-human-examples')
const {
  DEFAULT_FULL_BODY_SUBJECT,
  createProviderImageTask
} = require('./provider-image-task')
const {
  PROMPT_COMPILER_VERSION,
  compileProviderImagePrompt
} = require('./provider-image-prompt-compiler')
const {
  buildActionFramePlan,
  inferAnimationType,
  isEmoteAction,
  isLocomotionAction,
  isPoseTransitionAction,
  isReactionAction,
  isVerticalBounceAction,
  isWavingAction
} = require('./action-semantics')

const PROMPT_BUILDER_VERSION = 5

const SECTION_ORDER = [
  'Asset Goal',
  'Character Identity Contract',
  'Sprite Sheet Contract',
  'Programmatic Slicing Contract',
  'Animation Contract',
  'Root And Anchor Rules',
  'Style And Quality Contract',
  'Human-Reviewed Quality Guidance',
  'Negative Contract',
  'User Creative Brief'
]

const MODEL_SHEET_REFERENCE_RULES = [
  'If the reference image is a model sheet, character sheet, or action reference board, use it as identity and pose guidance only.',
  'For OpenPet final action reference boards, source identity panels are the highest identity authority; action pose panels are motion guidance only.',
  'Use the front, side, back, and action pose views to preserve the same body volume, markings, face, eye color, fur or material palette, tail shape, limb proportions, and pose vocabulary.',
  'Do not copy reference labels, text, captions, borders, sheet layout, beige background, guide lines, multiple view panels, or board presentation style into the output.',
  'Use the action poses in the reference only as pose vocabulary; generate the requested OpenPet asset format, not a duplicate of the reference sheet.'
]

const SOURCE_STYLE_AUTHORITY_RULES = [
  "Reference style is authoritative: keep the source image's visual medium, rendering detail, lighting, and texture unless the user explicitly asks for a style change.",
  'Do not force a cartoon conversion, cute simplification, 3D conversion, pixel-art conversion, or realism conversion when the reference uses a different style.',
  'Preserve distinctive eyes from the reference, including iris color, pupil shape, catchlights, eyelids, and expression; do not simplify them into generic black dots or hollow eyes.',
  "OpenPet compatibility means a clean cutout, stable anchor, readable small-window scale, and safe padding; it does not override the user's reference identity or style."
]

const sanitizeCreativeBrief = (value = '') => {
  let sanitized = String(value || '')
  sanitized = sanitized.replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
  sanitized = sanitized.replace(/\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\b/gi, '[redacted-token]')
  sanitized = sanitized.replace(/\[redacted-token\]\s*[:=]\s*[^\s,，。)]+/gi, '[redacted-token]=[redacted-secret]')
  sanitized = sanitized.replace(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/\b(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/\[::1\](?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/[^\s,，。)]+/g, '[redacted-path]')
  sanitized = sanitized.replace(/[A-Za-z]:\\[^\s,，。)]+/g, '[redacted-path]')
  return sanitized.trim()
}

const hasSensitiveContent = (before, after) => String(before || '') !== String(after || '')

const firstAction = (task) => Array.isArray(task?.actions) && task.actions.length > 0 ? task.actions[0] : null

const resolveTask = ({ run, generationTask }) => {
  if (generationTask) return normalizeGenerationTask(generationTask)
  if (run?.generationTask) return normalizeGenerationTask(run.generationTask)
  if (run?.input?.generationTask) return normalizeGenerationTask(run.input.generationTask)
  const prompt = String(run?.input?.originalPrompt || run?.input?.prompt || run?.petId || 'reusable desktop character').trim()
  return normalizeGenerationTask({
    mode: 'full-pet',
    targetPet: 'new',
    styleSource: 'referenceImage',
    characterBrief: prompt,
    actions: [{
      actionId: 'base-pose',
      name: 'Base Pose',
      motionPrompt: 'neutral base pose',
      loop: true,
      frameCount: 12,
      triggerProposal: { type: 'state', binding: 'idle' }
    }]
  })
}

const describeLoop = (action) => action?.loop ? 'looping' : 'one-shot'

const describeTrigger = (action) => {
  const trigger = action?.triggerProposal || { type: 'unbound' }
  return [
    sanitizeCreativeBrief(trigger.type || 'unbound'),
    trigger.binding ? `binding=${sanitizeCreativeBrief(trigger.binding)}` : '',
    trigger.notes ? `notes=${sanitizeCreativeBrief(trigger.notes)}` : '',
    trigger.ruleSpec?.summary ? `rule=${sanitizeCreativeBrief(trigger.ruleSpec.summary)}` : ''
  ].filter(Boolean).join(', ')
}

const getActionSheetLayout = (action) => {
  const frameCount = Math.max(1, Number(action?.frameCount) || 1)
  const { columns, rows } = resolveActionSheetLayout(frameCount, frameCount)
  return { frameCount, columns, rows }
}

const getActionSpec = ({ action = {}, frameCount }) => {
  const motionText = `${action.name || ''} ${action.motionPrompt || ''}`
  const animationType = inferAnimationType(action)
  const waving = isWavingAction(motionText)
  const viewDirection = sanitizeCreativeBrief(action.viewDirection || (animationType === 'locomotion_loop' ? 'side-facing or requested view' : 'front-facing'))
  const loopType = sanitizeCreativeBrief(action.loopType || (action.loop ? 'looping animation' : 'one-shot animation'))
  const customAnimatedParts = Array.isArray(action.animatedParts) && action.animatedParts.length > 0
    ? action.animatedParts
    : []
  const defaultAnimatedParts = waving
    ? ['viewer-right front limb, hand, paw, wing, arm, or equivalent waving appendage']
    : animationType === 'locomotion_loop'
      ? ['legs, arms, wings, or locomotion parts']
      : animationType === 'vertical_bounce'
        ? ['whole character vertical position according to the frame plan', 'small limb follow-through']
        : animationType === 'pose_transition'
          ? ['parts needed for the requested pose transition']
          : animationType === 'reaction'
            ? ['facial expression, head, ears, limbs, or equivalent reaction parts']
            : animationType === 'emote'
              ? ['facial expression, eyes, mouth, cheeks, small limbs, or equivalent emote parts']
              : ['the intended moving parts described by the action']
  const animatedParts = waving
    ? [...new Set([...defaultAnimatedParts, ...customAnimatedParts])]
    : (customAnimatedParts.length > 0 ? customAnimatedParts : defaultAnimatedParts)
  const lockedParts = Array.isArray(action.lockedParts) && action.lockedParts.length > 0
    ? action.lockedParts
    : animationType === 'locomotion_loop'
      ? ['face', 'identity-defining features', 'body scale', 'camera angle', 'color palette', 'accessories and markings']
      : ['head', 'face', 'torso', 'body center', 'feet/base position', 'body proportions', 'outfit', 'accessories', 'markings', 'overall silhouette']
  const secondaryMotion = Array.isArray(action.secondaryMotion) && action.secondaryMotion.length > 0
    ? action.secondaryMotion
    : animationType === 'stationary_loop'
      ? ['very subtle shoulder, ear, cheek, tail, or cute bounce motion only if it does not change identity or anchor stability']
      : animationType === 'locomotion_loop'
        ? ['subtle body bob that keeps the character centered in each cell']
        : animationType === 'reaction'
          ? ['brief squash, stretch, head bob, or limb follow-through only if the character returns to a stable readable pose']
          : animationType === 'emote'
            ? ['tiny head, cheek, ear, or shoulder motion only if it stays local and preserves the root anchor']
            : ['small controlled follow-through that preserves identity, scale, and frame alignment']
  const forbiddenMotion = Array.isArray(action.forbiddenMotion) && action.forbiddenMotion.length > 0
    ? action.forbiddenMotion
    : [
        'body drifting between cells',
        'identity changes',
        'face changes that redesign the character',
        'scale changes',
        'camera angle changes',
        'new limbs',
        'new props',
        'body parts crossing cell boundaries',
        ...(animationType === 'emote' ? ['No extra symbols, props, stickers, speech bubbles, or floating decorative effects unless explicitly requested'] : [])
      ]
  return {
    animationType,
    viewDirection,
    loopType,
    animatedParts,
    lockedParts,
    secondaryMotion,
    forbiddenMotion
  }
}

const createAnchorRule = (animationType) => {
  if (animationType === 'locomotion_loop') {
    return 'Keep the character centered in each cell for an in-place looping animation. The legs, arms, wings, or locomotion parts may cycle, but the body scale, camera angle, identity, and silhouette must remain consistent. Do not draw a background path or ground.'
  }
  if (animationType === 'vertical_bounce') {
    return 'The character may move vertically according to the frame plan, but must keep the same scale, same view, same proportions, and same identity. Keep the character centered horizontally in every cell. The landing frame must return to the original baseline.'
  }
  if (animationType === 'pose_transition') {
    return 'Create a clear transition from the start pose to the end pose. The character identity, style, colors, proportions, and accessories must remain stable. The root position should stay visually consistent unless the action naturally changes height.'
  }
  if (animationType === 'reaction') {
    return 'Reaction poses may be expressive, but the root anchor, body scale, character identity, and camera angle must remain consistent. The action should return to a stable readable pose without drifting across cells.'
  }
  if (animationType === 'emote') {
    return 'Keep emote motion mostly local to the face, head, or small expressive parts. Keep the body center, feet/base, scale, camera angle, outfit, accessories, and identity-defining markings aligned across frames.'
  }
  return 'Keep the root, body center, head center, feet/base, and overall silhouette aligned across frames. Only the listed animated parts may move.'
}

const createNegativePrompt = ({ mode, actionName }) => {
  const generic = [
    'different character',
    'redesigned character',
    'inconsistent identity',
    'changing species',
    'changing face',
    'changing eye color',
    'lost iris color',
    'lost eye highlights',
    'generic black-dot eyes',
    'hollow eyes',
    'changing body shape',
    'changing proportions',
    'changing head size',
    'changing outfit',
    'missing accessories',
    'extra accessories',
    'extra limbs',
    'missing limbs',
    'duplicated limbs',
    'malformed hands',
    'malformed paws',
    'disconnected body parts',
    'broken anatomy',
    'side view when front view is requested',
    'back view',
    'different camera angle',
    'inconsistent scale',
    'inconsistent line art',
    'inconsistent lighting',
    'inconsistent color palette',
    'cropped character',
    'cut off ears',
    'cut off tail',
    'cut off feet',
    'body parts crossing cell boundaries',
    'multiple characters in one cell',
    'duplicate characters',
    'background scene',
    'floor',
    'furniture',
    'props',
    'text',
    'labels',
    'watermark',
    'visible grid lines',
    'borders',
    'checkerboard background',
    'cast shadow',
    'ground shadow',
    'motion blur',
    'messy layout',
    'uneven cells',
    'non-transparent background',
    'unrequested style conversion',
    'unrequested 3D render',
    'low quality',
    'blurry',
    'noisy'
  ]
  if (mode === 'single-action') return generic.join(', ')
  return [...generic, 'multiple poses in one image', `unrelated ${sanitizeCreativeBrief(actionName || 'action')} props`].join(', ')
}

const buildSections = ({ task, action, creativeBrief, backend, model, currentPetContext, qualityGuidance }) => {
  const mode = task.mode
  const target = task.targetPet
  const styleSource = task.styleSource
  const actionName = sanitizeCreativeBrief(action?.name || 'Base Pose')
  const actionId = sanitizeCreativeBrief(action?.actionId || 'base-pose')
  const motionPrompt = sanitizeCreativeBrief(action?.motionPrompt || actionName)
  const actionSheet = getActionSheetLayout(action)
  const actionSpec = getActionSpec({ action, frameCount: actionSheet.frameCount })
  const framePlan = buildActionFramePlan({ action, frameCount: actionSheet.frameCount })
  const negativePrompt = createNegativePrompt({ mode, actionName })
  const providerWording = model === 'gpt-image-2'
    ? 'Use transparent-friendly, easy cutout silhouette wording; do not depend on a provider alpha-channel parameter.'
    : 'Prefer transparent-background output when available, with a clean cutout silhouette.'
  const qualityGuidanceLines = createQualityGuidanceLines({
    qualityGuidance,
    actionId: action?.actionId || ''
  })

  return {
    'Asset Goal': [
      mode === 'single-action'
        ? 'Create a transparent-background animation sprite sheet for OpenPet.'
        : 'Create one full-body OpenPet desktop pet sprite source image.',
      mode === 'single-action'
        ? 'Generate complete provider-generated action frames; OpenPet will only slice frames and run QA, not synthesize missing motion.'
        : '',
      'This is an OpenPet animation asset for a small floating desktop pet window, not a poster, wallpaper, avatar, scene illustration, sticker sheet, UI mockup, or character sheet.',
      'Create exactly one pet character.',
      'The pet must remain readable at 128px to 256px.',
      'Use a clean sprite-like silhouette suitable for action-frame generation and packaging.',
      `Backend: ${backend || 'unknown'}. Model: ${model || 'unknown'}.`
    ].filter(Boolean),
    'Character Identity Contract': [
      styleSource === 'referenceImage'
        ? 'Use the provided reference image as the identity source.'
        : styleSource === 'currentPet'
          ? 'Use the current pet as the identity source.'
          : 'Derive the identity from the creative brief.',
      'Render the same single character in every frame. Do not redesign, reinterpret, replace, simplify, or create a different variant of the character.',
      'Keep the same character identity, proportions, face, palette, and overall style.',
      'Preserve character type, head and face shape, eye shape and eye color, mouth, muzzle, facial markings, body silhouette, proportions, head-to-body ratio, main colors, material texture, patterns, markings, clothes, accessories, and overall source visual style.',
      ...SOURCE_STYLE_AUTHORITY_RULES,
      ...MODEL_SHEET_REFERENCE_RULES,
      styleSource === 'currentPet'
        ? "Keep the current pet's style, proportions, palette, facial design, and line work."
        : 'Keep a distinctive but simple identity that remains reusable for future OpenPet actions.',
      currentPetContext ? `Current pet context: ${sanitizeCreativeBrief(currentPetContext)}` : ''
    ].filter(Boolean),
    'Sprite Sheet Contract': [
      mode === 'full-pet'
        ? 'Output one centered pet sprite source image.'
        : `Output one action sheet containing exactly ${actionSheet.frameCount} readable poses in a ${actionSheet.columns} x ${actionSheet.rows} grid.`,
      mode === 'single-action'
        ? `Action sheet layout: ${actionSheet.columns} columns x ${actionSheet.rows} rows.`
        : 'Action sheet layout: single pose source.',
      mode === 'single-action'
        ? 'Each grid cell must contain one independent full-body sequential frame of the same character with no empty required cells.'
        : 'Do not create a multi-pose sheet.',
      'The complete pet character must be fully visible and centered.',
      'Keep 8-12% safe padding on all sides.',
      'Use no cropped ears, tail, paws, limbs, accessories, props, or motion arcs.',
      mode === 'single-action' ? 'No body part may cross into another cell.' : 'No body part may touch the image edge.',
      'Use a plain clean background or transparent-friendly, easy cutout silhouette.',
      'Transparent background, no visible grid lines, no text, no labels, no borders, no watermark, no props, no scene background, no floor, no cast shadow or ground shadow, and no checkerboard background.',
      'no text, logo, watermark, UI, frame, or border.',
      providerWording,
      `Mode: ${mode}`,
      `Target: ${target}`,
      `Style source: ${styleSource}`
    ],
    'Programmatic Slicing Contract': [
      mode === 'single-action'
        ? 'The sheet will be cut into equal cells by code, so each frame must be centered inside its own cell.'
        : 'The source image will be normalized into OpenPet frames later.',
      mode === 'single-action'
        ? 'Do not draw a single oversized character across the whole sheet; every required cell must be independently usable after slicing.'
        : 'Keep the source character cleanly framed for later OpenPet normalization.',
      'Keep the same character scale, camera angle, visual style, outline thickness, color palette, lighting, and rendering detail across all frames.',
      mode === 'single-action'
        ? 'Use consistent transparent padding around the character in every cell.'
        : 'Use transparent padding around the full-body source character.',
      mode === 'single-action'
        ? 'Keep equal cell sizes, stable foot baseline, stable body anchor, stable scale, and safe padding in every frame.'
        : 'Keep a stable body center, simple orthographic or mild 3/4 view, and avoid extreme perspective, close-up framing, half-body framing, or dynamic camera angles.'
    ],
    'Animation Contract': [
      `Action ID: ${actionId}`,
      `Action name: ${actionName}`,
      `Motion intent: ${motionPrompt}`,
      `Animation type: ${actionSpec.animationType}`,
      `View direction: ${actionSpec.viewDirection}`,
      `Loop type: ${actionSpec.loopType}`,
      `Loop policy: ${describeLoop(action)}`,
      `Frame count intent: ${action?.frameCount || 12}`,
      `Trigger: ${describeTrigger(action)}`,
      `Animated parts: ${actionSpec.animatedParts.map(sanitizeCreativeBrief).join(', ')}`,
      `Locked or mostly stable parts: ${actionSpec.lockedParts.map(sanitizeCreativeBrief).join(', ')}`,
      `Allowed secondary motion: ${actionSpec.secondaryMotion.map(sanitizeCreativeBrief).join(', ')}`,
      `Forbidden motion: ${actionSpec.forbiddenMotion.map(sanitizeCreativeBrief).join(', ')}`,
      mode === 'single-action' ? `Per-frame plan: ${framePlan.join(' ')}` : 'Key pose plan: neutral source pose suitable for future animation.',
      action?.loop
        ? 'For looping actions, start and end pose should be compatible, motion should not drift across the canvas, and body center should remain stable.'
        : 'For one-shot actions, start from neutral, perform the action clearly, then return to neutral or end in a clear final pose.'
    ],
    'Root And Anchor Rules': [
      'Use a stable root anchor at the lower center of the character in every frame.',
      createAnchorRule(actionSpec.animationType),
      'Do not let the character drift, rotate, shrink, grow, or change identity between frames.'
    ],
    'Style And Quality Contract': [
      'Use smooth animation spacing.',
      'Use clear readable poses and small controlled changes between adjacent frames.',
      'The frames should feel like they belong to one continuous animation drawn by the same animator.',
      'Use the source body and head proportions unless a tiny readability adjustment is necessary for the desktop-pet window.',
      'Keep a clear face, simple readable expression, simple limbs, visible paws, ears, tail, or equivalent identity features.',
      'Keep lighting, material or fur texture, and rendering detail consistent with the reference while preserving a clean cutout silhouette.',
      'Avoid heavy shadow, complex lighting, malformed limbs, duplicate heads, merged paws, malformed tail, or unclear face.'
    ],
    'Human-Reviewed Quality Guidance': qualityGuidanceLines,
    'Negative Contract': [
      `Negative prompt: ${negativePrompt}.`
    ],
    'User Creative Brief': [
      creativeBrief || sanitizeCreativeBrief(task.characterBrief) || actionName || 'Create an OpenPet desktop pet.'
    ]
  }
}

const renderPrompt = (sectionMap) => SECTION_ORDER
  .map((sectionName) => {
    const lines = sectionMap[sectionName] || []
    if (sectionName === 'Human-Reviewed Quality Guidance' && lines.length === 0) return ''
    return [
      `## ${sectionName}`,
      ...lines.map((line) => `- ${line}`)
    ].join('\n')
  })
  .filter(Boolean)
  .join('\n\n')

const buildOpenPetImagePrompt = ({
  run = {},
  generationTask,
  backend = '',
  model = '',
  currentPetContext = '',
  qualityGuidance = null,
  constraints = { width: 1024, height: 1024 },
  referenceRole = 'single-character-reference',
  strategyId = '',
  requestedChanges = []
} = {}) => {
  const task = resolveTask({ run, generationTask })
  const action = firstAction(task)
  const rawBrief = String(run.input?.originalPrompt || run.input?.prompt || task.characterBrief || action?.motionPrompt || run.petId || '').trim()
  const creativeBrief = sanitizeCreativeBrief(rawBrief)
  const appearanceIntent = String(task.characterBrief || '').trim()
    ? [String(task.characterBrief).trim()]
    : []
  const warnings = []
  if (hasSensitiveContent(rawBrief, creativeBrief)) warnings.push('creative_brief_sanitized')
  const sectionMap = buildSections({
    task,
    action,
    creativeBrief,
    backend,
    model,
    currentPetContext,
    qualityGuidance
  })
  const actionSheet = getActionSheetLayout(action)
  const imageTask = createProviderImageTask({
    taskType: task.mode === 'single-action' ? 'action-frame-sheet' : 'character-image',
    stage: task.mode === 'single-action' ? 'final' : 'identity',
    ...(task.mode === 'single-action' ? {} : { canvas: constraints }),
    ...(task.mode === 'single-action'
      ? {
          sheet: {
            frameCount: actionSheet.frameCount,
            columns: actionSheet.columns,
            rows: actionSheet.rows,
            readingOrder: 'left-to-right-top-to-bottom'
          },
          action: {
            name: action?.name || action?.motionPrompt || 'the requested action',
            moment: action?.motionPrompt || action?.name || 'the requested action',
            movingParts: getActionSpec({ action, frameCount: actionSheet.frameCount }).animatedParts,
            lockedParts: getActionSpec({ action, frameCount: actionSheet.frameCount }).lockedParts,
            loopIntent: action?.loop
              ? 'a seamless loop that returns to the starting pose'
              : 'a readable action with a clear ending pose',
            framePlan: buildActionFramePlan({ action, frameCount: actionSheet.frameCount })
          }
        }
      : {}),
    referenceRole,
    subject: DEFAULT_FULL_BODY_SUBJECT,
    appearanceIntent,
    strategyId,
    requestedChanges
  })
  const compiled = compileProviderImagePrompt({
    task: imageTask,
    qualityGuidance: createQualityGuidanceLines({
      qualityGuidance,
      actionId: action?.actionId || ''
    })
  })

  return {
    prompt: renderPrompt(sectionMap),
    providerPrompt: compiled.text,
    promptCompiler: compiled.safeSummary,
    sections: SECTION_ORDER.slice(),
    warnings: [...warnings, ...compiled.warnings],
    mode: task.mode,
    actionId: action?.actionId || 'base-pose',
    promptBuilderVersion: PROMPT_BUILDER_VERSION,
    promptCompilerVersion: PROMPT_COMPILER_VERSION
  }
}

module.exports = {
  PROMPT_BUILDER_VERSION,
  buildOpenPetImagePrompt,
  sanitizeCreativeBrief
}
