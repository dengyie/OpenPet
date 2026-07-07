const { normalizeGenerationTask } = require('./generation-task')

const PROMPT_BUILDER_VERSION = 2

const SECTION_ORDER = [
  'Asset Goal',
  'Character Identity Contract',
  'Sprite Sheet Contract',
  'Programmatic Slicing Contract',
  'Animation Contract',
  'Root And Anchor Rules',
  'Style And Quality Contract',
  'Negative Contract',
  'User Creative Brief'
]

const ACTION_SHEET_MAX_COLUMNS = 4

const MODEL_SHEET_REFERENCE_RULES = [
  'If the reference image is a model sheet, character sheet, or action reference board, use it as identity and pose guidance only.',
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

const isCanonicalFrameSynthesis = (action = {}) => String(action?.synthesisMode || '') === 'canonical-frame'

const resolveTask = ({ run, generationTask }) => {
  if (generationTask) return normalizeGenerationTask(generationTask)
  if (run?.generationTask) return normalizeGenerationTask(run.generationTask)
  if (run?.input?.generationTask) return normalizeGenerationTask(run.input.generationTask)
  const prompt = String(run?.input?.originalPrompt || run?.input?.prompt || run?.petId || 'OpenPet desktop pet').trim()
  return normalizeGenerationTask({
    mode: 'full-pet',
    targetPet: 'new',
    styleSource: 'textOnly',
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
  const columns = frameCount === 6 ? 3 : Math.max(1, Math.min(ACTION_SHEET_MAX_COLUMNS, frameCount))
  const rows = Math.max(1, Math.ceil(frameCount / columns))
  return { frameCount, columns, rows }
}

const toSentence = (value = '') => {
  const text = sanitizeCreativeBrief(value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[。！？]+$/u, '')
  return text ? `${text}.` : ''
}

const isWavingAction = (value = '') => /wave|waving|挥手|招手|挥爪|paw\s*wave/i.test(String(value || ''))

const isLocomotionAction = (value = '') => /walk|run|running|crawl|fly|flying|走|跑|奔跑|爬行|飞/i.test(String(value || ''))

const isVerticalBounceAction = (value = '') => /jump|hop|bounce|cheer|蹦|跳|弹跳|欢呼/i.test(String(value || ''))

const isPoseTransitionAction = (value = '') => /sit|lie|sleep|wake|stand|fall|坐|躺|睡|醒|站|摔|倒/i.test(String(value || ''))

const isEmoteAction = (value = '') => /emote|emoji|sparkle|heart|expression|face\s*change|表情|爱心|星星/i.test(String(value || ''))

const isReactionAction = (value = '') => /reaction|react|clicked|tap|touch|surprised|startled|hit|被点|点击|触摸|摸|反应|惊讶|吓/i.test(String(value || ''))

const inferAnimationType = (action = {}) => {
  if (action.animationType) return String(action.animationType)
  const text = `${action.name || ''} ${action.motionPrompt || ''}`
  if (isLocomotionAction(text)) return 'locomotion_loop'
  if (isVerticalBounceAction(text)) return 'vertical_bounce'
  if (isPoseTransitionAction(text)) return 'pose_transition'
  if (isWavingAction(text)) return 'stationary_loop'
  if (isReactionAction(text)) return 'reaction'
  if (isEmoteAction(text)) return 'emote'
  if (action.loop) return 'stationary_loop'
  return 'reaction'
}

const formatSpecList = (items, fallback) => {
  const values = Array.isArray(items)
    ? items.map((item) => sanitizeCreativeBrief(item)).filter(Boolean)
    : []
  const normalized = values.length > 0 ? values : fallback
  return normalized.map((item) => `- ${item}`).join('\n')
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

const buildActionFramePlan = ({ action, frameCount }) => {
  const motionPrompt = `${action?.name || ''} ${action?.motionPrompt || ''}`
  if (Array.isArray(action?.framePlan) && action.framePlan.length > 0) {
    return action.framePlan.map((frame) => sanitizeCreativeBrief(frame)).filter(Boolean)
  }
  if (isWavingAction(motionPrompt)) {
    const frames = [
      'Frame 1: neutral front-facing idle pose, both front limbs down.',
      'Frame 2: viewer-right front limb begins to lift.',
      'Frame 3: viewer-right front limb is fully raised beside the face.',
      'Frame 4: raised limb tilts slightly outward in a wave.',
      'Frame 5: raised limb tilts slightly inward in a wave.',
      'Frame 6: raised limb returns close to the neutral pose.'
    ]
    if (frameCount <= frames.length) return frames.slice(0, frameCount)
    return [
      ...frames,
      `Frames 7-${frameCount}: add small in-between motion only to the waving appendage, then settle back to the same anchored neutral pose.`
    ]
  }
  if (isLocomotionAction(motionPrompt)) {
    return [
      'Frame 1: in-place contact pose, full body visible and centered.',
      'Middle frames: cycle the locomotion parts while the character stays centered in its own cell.',
      `Frame ${frameCount}: loop-compatible contact pose with the same scale and camera angle as frame 1.`
    ]
  }
  if (isVerticalBounceAction(motionPrompt)) {
    return [
      'Frame 1: grounded anticipation pose at the original baseline.',
      'Middle frames: controlled upward motion and peak pose while preserving identity, scale, and horizontal center.',
      `Frame ${frameCount}: landing or recovery pose returning to the original baseline.`
    ]
  }
  if (isPoseTransitionAction(motionPrompt)) {
    return [
      'Frame 1: clear start pose with the character fully visible.',
      'Middle frames: readable transition poses with stable identity, colors, accessories, and proportions.',
      `Frame ${frameCount}: clear end pose with the character centered and aligned.`
    ]
  }
  if (isReactionAction(motionPrompt) || action?.animationType === 'reaction') {
    return [
      'Frame 1: neutral or anticipation pose with the character fully visible and anchored.',
      'Middle frames: quick readable reaction poses using only the listed reaction parts.',
      `Frame ${frameCount}: return to a stable readable pose with the same root anchor, scale, and identity.`
    ]
  }
  if (isEmoteAction(motionPrompt) || action?.animationType === 'emote') {
    return [
      'Frame 1: neutral expression with the character fully visible and anchored.',
      'Middle frames: small local expression or emote change while the body center and base stay stable.',
      `Frame ${frameCount}: loop-compatible expression pose with the same scale, camera angle, and character identity.`
    ]
  }
  return [
    'Frame 1: clear neutral or anticipation pose with the character fully visible.',
    'Middle frames: show the action progression with readable pose changes while keeping the body anchor stable.',
    `Frame ${frameCount}: recovery or loop-compatible return pose with the character still centered.`
  ]
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

const buildCompactProviderPrompt = ({ task, action, creativeBrief, currentPetContext }) => {
  const mode = task.mode
  const styleSource = task.styleSource
  const actionName = sanitizeCreativeBrief(action?.name || 'pose')
  const visibleStyleContext = sanitizeCreativeBrief(currentPetContext)
  const actionSheet = getActionSheetLayout(action)
  const actionSpec = getActionSpec({ action, frameCount: actionSheet.frameCount })
  const framePlan = buildActionFramePlan({ action, frameCount: actionSheet.frameCount })
  const negativePrompt = createNegativePrompt({ mode, actionName })
  if (mode !== 'single-action') {
    return [
      `Create one full-body OpenPet desktop pet sprite: ${sanitizeCreativeBrief(creativeBrief || task.characterBrief || actionName || 'cute desktop pet')}.`,
      'Create a transparent-background OpenPet source image for a future animation asset.',
      'One character only. Fully visible and centered.',
      'Use a plain clean background that is easy to cut out.',
      'Priority order: 1. Same character identity. 2. Same source visual style. 3. Clean transparent sprite source. 4. Stable root anchor, scale, and alignment. 5. Source-faithful polished rendering.',
      'Preserve identity-defining features: character type, head and face shape, eye shape and color, facial markings, body silhouette, proportions, main colors, material texture, patterns, markings, clothes, accessories, and overall source visual style.',
      ...SOURCE_STYLE_AUTHORITY_RULES,
      ...MODEL_SHEET_REFERENCE_RULES,
      'Keep about 10% padding on all sides and do not crop ears, tail, paws, limbs, accessories, or body parts.',
      'Keep lighting, texture density, and rendering detail consistent with the reference; no cast shadow or ground shadow, no floor, no scene background, no checkerboard background.',
      'no text, logo, watermark, UI, border, extra characters, sticker sheet, or extra poses.',
      `Negative prompt: ${negativePrompt}.`,
      toSentence(creativeBrief)
    ].filter(Boolean).join(' ')
  }

  if (isCanonicalFrameSynthesis(action)) {
    return [
      'Create one canonical full-body source frame for OpenPet action synthesis.',
      `Create the current character prepared for this action: ${actionName}.`,
      'This is a single approved source image, not an animation sprite sheet.',
      'OpenPet will synthesize bounded local motion from this source frame after generation.',
      '',
      'REFERENCE CHARACTER LOCK:',
      'Use the provided reference image or current pet as the identity source. Render exactly one full-body character. Do not redesign, reinterpret, replace, simplify, or create a different variant of the character.',
      'Keep the same character identity, proportions, face, palette, and overall style.',
      'Preserve identity-defining features from the source:',
      '- character type: same species, object type, or creature type as the source',
      '- head and face shape: same head silhouette and facial structure',
      '- eye shape and eye color: same eyes from the source',
      '- mouth / muzzle / facial markings: same source facial details',
      '- body silhouette and proportions: same body shape',
      '- head-to-body ratio: same source proportions adapted only as needed for readable desktop-pet scale',
      '- main colors: same palette',
      '- fur / skin / material texture: same material feel',
      '- patterns, markings, clothes, accessories: preserve all identity-defining details',
      '- overall source style: same visual medium, line or edge treatment, rendering detail, lighting, texture, and style complexity',
      ...SOURCE_STYLE_AUTHORITY_RULES,
      ...MODEL_SHEET_REFERENCE_RULES,
      visibleStyleContext ? `Current pet style context: ${visibleStyleContext}.` : '',
      styleSource === 'currentPet' || styleSource === 'referenceImage' ? 'Match the current character style as closely as possible.' : '',
      '',
      'SOURCE FRAME FORMAT:',
      '- one full-body character only',
      '- single canonical source frame',
      '- transparent background or plain clean background that is easy to cut out',
      '- no animation grid',
      '- no sprite sheet',
      '- no multiple poses',
      '- no text, labels, borders, watermark, props, scene background, floor, cast shadow, or ground shadow',
      '- no cropped ears, limbs, tail, accessories, or body parts',
      '- keep 8-12% safe padding around the character',
      '',
      'LOCAL MOTION PREPARATION:',
      `Motion intent: ${sanitizeCreativeBrief(action?.motionPrompt || actionName)}`,
      `Animation type: ${actionSpec.animationType}`,
      `View direction: ${actionSpec.viewDirection}`,
      'Pose the character so the moving part is clearly visible and separated from the body enough for local motion synthesis.',
      'Keep the root anchor at the lower center of the character, with the feet/base, torso, head, face, and identity-defining markings stable.',
      'Use a neutral or near-neutral readable pose that can be locally animated without redrawing the whole character.',
      'Animated parts OpenPet may move locally:',
      formatSpecList(actionSpec.animatedParts, ['the intended moving parts described by the action']),
      'Locked parts OpenPet must preserve:',
      formatSpecList(actionSpec.lockedParts, ['identity-defining body parts and markings']),
      '',
      'QUALITY:',
      'The character should look source-faithful, polished, clean, and suitable for a desktop pet or game companion.',
      'Keep lighting, material or fur texture, and rendering detail consistent with the reference while preserving a clean cutout silhouette.',
      '',
      `Negative prompt: ${negativePrompt}, animation sprite sheet, grid layout, multiple frames, multiple characters, character sheet, poster, collage.`,
      toSentence(creativeBrief)
    ].filter((line) => line !== '').join('\n')
  }

  return [
    'Create a transparent-background animation sprite sheet for OpenPet.',
    `Create one OpenPet action sheet of the current character doing this action: ${actionName}.`,
    'This is a game-ready character animation asset that will be sliced programmatically into separate frames. It is not a standalone illustration.',
    '',
    'REFERENCE CHARACTER LOCK:',
    'Use the provided reference image or current pet as the identity source. Render the same single character in every frame. Do not redesign, reinterpret, replace, simplify, or create a different variant of the character.',
    'Keep the same character identity, proportions, face, palette, and overall style.',
    'Preserve identity-defining features from the source:',
    '- character type: same species, object type, or creature type as the source',
    '- head and face shape: same head silhouette and facial structure',
    '- eye shape and eye color: same eyes from the source',
    '- mouth / muzzle / facial markings: same source facial details',
    '- body silhouette and proportions: same body shape',
    '- head-to-body ratio: same source proportions adapted only as needed for readable desktop-pet scale',
    '- main colors: same palette',
    '- fur / skin / material texture: same material feel',
    '- patterns, markings, clothes, accessories: preserve all identity-defining details',
    '- overall source style: same visual medium, line or edge treatment, rendering detail, lighting, texture, and style complexity',
    ...SOURCE_STYLE_AUTHORITY_RULES,
    ...MODEL_SHEET_REFERENCE_RULES,
    'The character must remain recognizable as exactly the same character in every frame.',
    visibleStyleContext ? `Current pet style context: ${visibleStyleContext}.` : '',
    styleSource === 'currentPet' || styleSource === 'referenceImage' ? 'Match the current character style as closely as possible.' : '',
    '',
    'Priority order:',
    '1. Same character identity in every frame.',
    '2. Same source visual style in every frame.',
    '3. Stable root anchor, scale, and alignment.',
    '4. Clean transparent sprite sheet layout.',
    '5. Clear readable action.',
    '',
    'SPRITE SHEET FORMAT:',
    `- ${actionSheet.frameCount} animation frames`,
    `- arranged in a clean ${actionSheet.columns} columns x ${actionSheet.rows} rows grid`,
    `Arrange exactly ${actionSheet.frameCount} sequential poses in a ${actionSheet.columns} column by ${actionSheet.rows} row grid.`,
    '- equal-sized cells',
    '- one full-body character per cell',
    '- transparent background',
    'Use a plain clean background that is easy to cut out.',
    '- transparent empty padding inside every cell',
    '- no visible grid lines',
    '- no text',
    '- no labels',
    '- no borders',
    '- no watermark',
    '- no props',
    '- no scene background',
    '- no floor',
    '- no cast shadow or ground shadow',
    '- no cropped ears, limbs, tail, accessories, or body parts',
    '- no body part may cross into another cell',
    'Every grid cell is an independent full-body sprite frame of the same character, fully visible and centered.',
    'Do not draw one large character spanning multiple grid cells; do not create a poster, collage, character sheet, or sticker sheet.',
    '',
    'PROGRAMMATIC SLICING REQUIREMENTS:',
    'This sheet is programmatically sliced into equal cells by OpenPet.',
    'The sheet will be cut into equal cells by code, so each frame must be centered inside its own cell.',
    'Keep the same character scale across all frames.',
    'Keep the same camera angle across all frames.',
    'Keep the same visual style, outline thickness, color palette, lighting, and rendering detail across all frames.',
    'Use consistent transparent padding around the character in every cell.',
    'Use equal-sized cells and keep the same foot baseline and body anchor in every frame.',
    '',
    'ANIMATION:',
    `Action name: ${actionName}`,
    `Action sheet label: ${actionName}.`,
    `Motion intent: ${sanitizeCreativeBrief(action?.motionPrompt || actionName)}`,
    `Animation type: ${actionSpec.animationType}`,
    `View direction: ${actionSpec.viewDirection}`,
    `Loop type: ${actionSpec.loopType}`,
    '',
    'Animated parts:',
    formatSpecList(actionSpec.animatedParts, ['the intended moving parts described by the action']),
    '',
    'Locked or mostly stable parts:',
    formatSpecList(actionSpec.lockedParts, ['identity-defining body parts and markings']),
    '',
    'Allowed secondary motion:',
    formatSpecList(actionSpec.secondaryMotion, ['small controlled follow-through only when it preserves alignment']),
    '',
    'Forbidden motion:',
    formatSpecList(actionSpec.forbiddenMotion, ['identity changes', 'scale changes', 'body drifting']),
    '',
    'ROOT AND ANCHOR RULES:',
    'Use a stable root anchor at the lower center of the character in every frame.',
    createAnchorRule(actionSpec.animationType),
    'Do not let the character drift, rotate, shrink, grow, or change identity between frames.',
    '',
    'FRAME-BY-FRAME MOTION PLAN:',
    ...framePlan,
    '',
    'ANIMATION QUALITY:',
    'Use smooth animation spacing.',
    'Use clear readable poses.',
    'Use small controlled changes between adjacent frames.',
    'The frames should feel like they belong to one continuous animation drawn by the same animator.',
    'The character should look source-faithful, polished, clean, and suitable for a desktop pet or game companion.',
    'Keep lighting, material or fur texture, and rendering detail consistent with the reference while preserving a clean cutout silhouette.',
    '',
    `Negative prompt: ${negativePrompt}.`,
    toSentence(creativeBrief)
  ].filter((line) => line !== '').join('\n')
}

const buildSections = ({ task, action, creativeBrief, backend, model, currentPetContext }) => {
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
  const canonicalFrameSynthesis = mode === 'single-action' && isCanonicalFrameSynthesis(action)
  const providerWording = model === 'gpt-image-2'
    ? 'Use transparent-friendly, easy cutout silhouette wording; do not depend on a provider alpha-channel parameter.'
    : 'Prefer transparent-background output when available, with a clean cutout silhouette.'

  return {
    'Asset Goal': [
      canonicalFrameSynthesis
        ? 'Create one canonical full-body source frame for OpenPet action synthesis.'
        : mode === 'single-action'
        ? 'Create a transparent-background animation sprite sheet for OpenPet.'
        : 'Create one full-body OpenPet desktop pet sprite source image.',
      'This is an OpenPet animation asset for a small floating desktop pet window, not a poster, wallpaper, avatar, scene illustration, sticker sheet, UI mockup, or character sheet.',
      'Create exactly one pet character.',
      'The pet must remain readable at 128px to 256px.',
      'Use a clean sprite-like silhouette suitable for action-frame generation and packaging.',
      `Backend: ${backend || 'unknown'}. Model: ${model || 'unknown'}.`
    ],
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
        : canonicalFrameSynthesis
          ? 'Output one canonical full-body source frame, not a multi-frame grid.'
          : `Output one action sheet containing exactly ${actionSheet.frameCount} readable poses in a ${actionSheet.columns} x ${actionSheet.rows} grid.`,
      canonicalFrameSynthesis
        ? 'Action sheet layout: single canonical source frame.'
        : mode === 'single-action'
        ? `Action sheet layout: ${actionSheet.columns} columns x ${actionSheet.rows} rows.`
        : 'Action sheet layout: single pose source.',
      canonicalFrameSynthesis
        ? 'Do not create a sprite sheet, grid, multi-pose sheet, character sheet, poster, collage, or sticker sheet.'
        : mode === 'single-action'
        ? 'Each grid cell must contain one independent full-body sequential frame of the same character with no empty required cells.'
        : 'Do not create a multi-pose sheet.',
      'The complete pet character must be fully visible and centered.',
      'Keep 8-12% safe padding on all sides.',
      'Use no cropped ears, tail, paws, limbs, accessories, props, or motion arcs.',
      canonicalFrameSynthesis
        ? 'Keep the moving part clearly visible and separated enough for local motion synthesis.'
        : mode === 'single-action' ? 'No body part may cross into another cell.' : 'No body part may touch the image edge.',
      'Use a plain clean background or transparent-friendly, easy cutout silhouette.',
      'Transparent background, no visible grid lines, no text, no labels, no borders, no watermark, no props, no scene background, no floor, no cast shadow or ground shadow, and no checkerboard background.',
      'no text, logo, watermark, UI, frame, or border.',
      providerWording,
      `Mode: ${mode}`,
      `Target: ${target}`,
      `Style source: ${styleSource}`
    ],
    'Programmatic Slicing Contract': [
      canonicalFrameSynthesis
        ? 'OpenPet will synthesize bounded local motion from this canonical source frame after generation.'
        : 'The sheet will be cut into equal cells by code, so each frame must be centered inside its own cell.',
      canonicalFrameSynthesis
        ? 'Do not ask the provider to redraw every animation frame; preserve one source-faithful character image for local motion.'
        : mode === 'single-action'
        ? 'Do not draw a single oversized character across the whole sheet; every required cell must be independently usable after slicing.'
        : 'The source image will be normalized into OpenPet frames later.',
      canonicalFrameSynthesis
        ? 'Keep the character scale, camera angle, visual style, outline thickness, color palette, lighting, and rendering detail faithful to the source.'
        : 'Keep the same character scale, camera angle, visual style, outline thickness, color palette, lighting, and rendering detail across all frames.',
      canonicalFrameSynthesis
        ? 'Use transparent padding around the full-body source character.'
        : 'Use consistent transparent padding around the character in every cell.',
      canonicalFrameSynthesis
        ? 'Keep the root anchor, body center, head, face, markings, outfit, accessories, and feet/base stable in the source pose.'
        : mode === 'single-action'
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
      canonicalFrameSynthesis
        ? `Local synthesis plan: OpenPet will synthesize bounded local motion from this source using the intended ${actionSheet.frameCount}-frame plan: ${framePlan.join(' ')}`
        : mode === 'single-action' ? `Per-frame plan: ${framePlan.join(' ')}` : 'Key pose plan: neutral source pose suitable for future animation.',
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
    return [
      `## ${sectionName}`,
      ...lines.map((line) => `- ${line}`)
    ].join('\n')
  })
  .join('\n\n')

const buildOpenPetImagePrompt = ({
  run = {},
  generationTask,
  backend = '',
  model = '',
  currentPetContext = ''
} = {}) => {
  const task = resolveTask({ run, generationTask })
  const action = firstAction(task)
  const rawBrief = String(run.input?.originalPrompt || run.input?.prompt || task.characterBrief || action?.motionPrompt || run.petId || '').trim()
  const creativeBrief = sanitizeCreativeBrief(rawBrief)
  const warnings = []
  if (hasSensitiveContent(rawBrief, creativeBrief)) warnings.push('creative_brief_sanitized')
  const sectionMap = buildSections({
    task,
    action,
    creativeBrief,
    backend,
    model,
    currentPetContext
  })
  const providerPrompt = buildCompactProviderPrompt({
    task,
    action,
    creativeBrief,
    currentPetContext
  })

  return {
    prompt: renderPrompt(sectionMap),
    providerPrompt,
    sections: SECTION_ORDER.slice(),
    warnings,
    mode: task.mode,
    actionId: action?.actionId || 'base-pose',
    promptBuilderVersion: PROMPT_BUILDER_VERSION
  }
}

module.exports = {
  PROMPT_BUILDER_VERSION,
  buildOpenPetImagePrompt,
  sanitizeCreativeBrief
}
