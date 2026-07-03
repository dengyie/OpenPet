const { normalizeGenerationTask } = require('./generation-task')

const PROMPT_BUILDER_VERSION = 1

const SECTION_ORDER = [
  'Intent',
  'OpenPet Runtime Contract',
  'Canvas And Boundary Rules',
  'Background And Transparency Policy',
  'Character Shape Language',
  'Generation Mode',
  'Action Requirements',
  'Style Consistency',
  'Output Requirements',
  'Negative Constraints',
  'User Creative Brief'
]

const ACTION_SHEET_MAX_COLUMNS = 4

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
  const columns = Math.max(1, Math.min(ACTION_SHEET_MAX_COLUMNS, frameCount))
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

const buildCompactProviderPrompt = ({ task, action, creativeBrief, currentPetContext }) => {
  const mode = task.mode
  const styleSource = task.styleSource
  const actionName = sanitizeCreativeBrief(action?.name || 'pose')
  const visibleStyleContext = sanitizeCreativeBrief(currentPetContext)
  const actionSheet = getActionSheetLayout(action)
  const sentences = [
    mode === 'full-pet'
      ? `Create one full-body OpenPet desktop pet sprite: ${sanitizeCreativeBrief(creativeBrief || task.characterBrief || actionName || 'cute desktop pet')}.`
      : `Create one OpenPet action sheet of the current character doing this action: ${actionName}.`,
    mode === 'single-action'
      ? 'Keep the same character identity, proportions, face, palette, and overall style.'
      : 'Use cute compact proportions, a clear face, and simple readable shapes.',
    mode === 'single-action'
      ? `Arrange exactly ${actionSheet.frameCount} sequential poses in a ${actionSheet.columns} column by ${actionSheet.rows} row grid.`
      : 'One character only. Fully visible and centered.',
    mode === 'single-action'
      ? 'Each grid cell must contain one full-body pose of the same character, fully visible and centered.'
      : 'Keep about 10% padding on all sides and do not crop ears, tail, paws, limbs, or accessories.',
    'Keep about 10% padding on all sides and do not crop ears, tail, paws, limbs, or accessories.',
    'Readable at small desktop size with a clean silhouette and stable body center.',
    'Use a plain clean background that is easy to cut out. No scene background.',
    mode === 'single-action'
      ? 'No text, logo, watermark, UI, labels, panel borders, extra characters, or extra bonus poses outside the required grid.'
      : 'No text, logo, watermark, UI, border, extra characters, sticker sheet, or extra poses.',
    mode === 'single-action'
      ? action?.loop
        ? 'Show clear motion progression from anticipation to action to recovery, with the first and last pose compatible for a seamless loop.'
        : 'Show clear motion progression from neutral to action to recovery, with readable pose changes across the grid.'
      : action?.loop
        ? 'Make the pose balanced and loop-friendly.'
        : 'Make the pose clear, balanced, and easy to read.',
    styleSource === 'currentPet' || styleSource === 'referenceImage'
      ? 'Match the current character style as closely as possible.'
      : '',
    visibleStyleContext ? `Current pet style context: ${visibleStyleContext}.` : '',
    mode === 'single-action' ? `Action sheet label: ${actionName}.` : '',
    mode === 'single-action' ? toSentence(creativeBrief) : ''
  ].filter(Boolean)
  return sentences.join(' ')
}

const buildSections = ({ task, action, creativeBrief, backend, model, currentPetContext }) => {
  const mode = task.mode
  const target = task.targetPet
  const styleSource = task.styleSource
  const actionName = sanitizeCreativeBrief(action?.name || 'Base Pose')
  const actionId = sanitizeCreativeBrief(action?.actionId || 'base-pose')
  const motionPrompt = sanitizeCreativeBrief(action?.motionPrompt || actionName)
  const actionSheet = getActionSheetLayout(action)
  const providerWording = model === 'gpt-image-2'
    ? 'Use transparent-friendly, easy cutout silhouette wording; do not depend on a provider alpha-channel parameter.'
    : 'Prefer transparent-background output when available, with a clean cutout silhouette.'

  return {
    Intent: [
      'You are generating an OpenPet desktop pet sprite asset.',
      'This image is for a small floating desktop pet window, not a poster, wallpaper, avatar, scene illustration, sticker sheet, UI mockup, or character sheet.'
    ],
    'OpenPet Runtime Contract': [
      'Create exactly one pet character.',
      'The pet must remain readable at 128px to 256px.',
      'Use a clean sprite-like silhouette suitable for later action-frame generation and packaging.',
      `Backend: ${backend || 'unknown'}. Model: ${model || 'unknown'}.`
    ],
    'Canvas And Boundary Rules': [
      'The complete pet character must be fully visible and centered.',
      'Keep 8-12% safe padding on all sides.',
      'Use no cropped ears, tail, paws, limbs, accessories, props, or motion arcs.',
      'No body part may touch the image edge.',
      'Use a stable body center, simple orthographic or mild 3/4 view, and avoid extreme perspective, close-up framing, half-body framing, or dynamic camera angles.'
    ],
    'Background And Transparency Policy': [
      'Make a clean PNG-friendly sprite source.',
      'Use a plain clean background or transparent-friendly, easy cutout silhouette.',
      'No scene background.',
      providerWording
    ],
    'Character Shape Language': [
      'Use a compact desktop-pet body with a slightly oversized head for readability.',
      'Keep a clear face, simple readable expression, simple limbs, visible paws, ears, tail, or equivalent identity features.',
      'Prefer large readable shapes instead of tiny details.',
      'Keep stable ground contact or a stable floating posture.',
      'Avoid extra limbs, duplicate heads, merged paws, malformed tail, or unclear face.'
    ],
    'Generation Mode': [
      `Mode: ${mode}`,
      `Target: ${target}`,
      `Style source: ${styleSource}`,
      mode === 'full-pet'
        ? 'Create a coherent new pet identity with a body structure that can support multiple future actions.'
        : 'Create a sequential action sheet that stays readable as an OpenPet sprite animation source.',
      mode === 'full-pet'
        ? 'Use a neutral base pose unless the creative brief explicitly asks otherwise.'
        : 'Do not redesign the pet; only change the required pose/action and preserve identity across all frames.'
    ],
    'Action Requirements': [
      `Action ID: ${actionId}`,
      `Action name: ${actionName}`,
      `Motion intent: ${motionPrompt}`,
      `Loop policy: ${describeLoop(action)}`,
      `Frame count intent: ${action?.frameCount || 12}`,
      mode === 'single-action'
        ? `Action sheet layout: ${actionSheet.columns} columns x ${actionSheet.rows} rows`
        : 'Action sheet layout: single pose source',
      `Trigger: ${describeTrigger(action)}`,
      'Key pose plan: anticipation, primary action pose, readable exaggeration, and recovery or loop return.',
      action?.loop
        ? 'For looping actions, start and end pose should be compatible, motion should not drift across the canvas, and body center should remain stable.'
        : 'For one-shot actions, start from neutral, perform the action clearly, then return to neutral or end in a clear final pose.'
    ],
    'Style Consistency': [
      styleSource === 'currentPet'
        ? "Keep the current pet's style, proportions, palette, facial design, and line work."
        : 'Define a new pet style that remains simple, readable, and reusable for future OpenPet actions.',
      styleSource === 'currentPet'
        ? 'Preserve the same character identity, same proportions, same line weight, same palette, same camera angle, and same visual complexity.'
        : 'Use a distinctive but simple palette and avoid single-use details that prevent future animation.',
      currentPetContext ? `Current pet context: ${sanitizeCreativeBrief(currentPetContext)}` : ''
    ].filter(Boolean),
    'Output Requirements': [
      mode === 'full-pet'
        ? 'Output one centered pet sprite source image.'
        : `Output one action sheet containing exactly ${actionSheet.frameCount} readable poses in a ${actionSheet.columns} x ${actionSheet.rows} grid.`,
      mode === 'full-pet'
        ? 'Do not create a multi-pose sheet.'
        : 'Each grid cell must contain one sequential frame of the same character with no empty required cells.',
      'Do not add labels, annotations, UI chrome, or borders.',
      mode === 'full-pet'
        ? 'The result should be suitable for OpenPet action frame generation.'
        : 'The result should be suitable for direct OpenPet action frame slicing.'
    ],
    'Negative Constraints': [
      'No background scene, floor, furniture, room, landscape, or unrelated props.',
      'no text, logo, watermark, signature, UI, frame, or border.',
      mode === 'full-pet'
        ? 'No extra characters, no sticker sheet, no multiple poses in one image.'
        : 'No extra characters, no decorative sticker sheet layout, no empty required cells, and no extra bonus poses beyond the required action grid.',
      'No cropped body parts, close-up portrait, realistic noisy fur, tiny unreadable ornamentation, heavy shadow, complex lighting, strong perspective, malformed limbs, duplicate limbs, extra tails, or merged facial features.'
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
