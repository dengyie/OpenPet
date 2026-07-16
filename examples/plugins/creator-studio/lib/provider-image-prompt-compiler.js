const {
  createProviderImageTask,
  createTaskError,
  sanitizeVisualDirective
} = require('./provider-image-task')

const PROMPT_COMPILER_VERSION = 2
const MAX_PROMPT_LENGTH = 12000

const FORBIDDEN_PROMPT_PATTERNS = Object.freeze([
  Object.freeze({ pattern: /\bOpenPet\b/i, label: 'product name' }),
  Object.freeze({ pattern: /\bCreator[-_ ]?Studio\b/i, label: 'product component' }),
  Object.freeze({ pattern: /\bCodex[-_ ]?Pet\b/i, label: 'product asset format' }),
  Object.freeze({ pattern: /\bHatch[-_ ]?Pet\b/i, label: 'product workflow' }),
  Object.freeze({ pattern: /\bProvider\b/i, label: 'transport owner' }),
  Object.freeze({ pattern: /\bbackend\b/i, label: 'backend name' }),
  Object.freeze({ pattern: /\b(?:run|action)[-_ ]?id\b/i, label: 'internal identifier' }),
  Object.freeze({ pattern: /\breference[-_ ]?role\b/i, label: 'reference role' }),
  Object.freeze({ pattern: /\bcheckpoint\b/i, label: 'checkpoint term' }),
  Object.freeze({ pattern: /\bmultipart\b/i, label: 'transport format' }),
  Object.freeze({ pattern: /\b(?:sk-[A-Za-z0-9_-]+|bearer\s+[A-Za-z0-9._~-]+|(?:[A-Za-z0-9_-]*token[A-Za-z0-9_-]*|api[-_ ]?key|secret|credential|password|authorization)\s*[:=]\s*(?:(?:bearer|basic)\s+)?\S+)\b/i, label: 'secret' }),
  Object.freeze({ pattern: /https?:\/\/\S+/i, label: 'URL' }),
  Object.freeze({ pattern: /\bfile:\/{2,3}\S+/i, label: 'file URI' }),
  Object.freeze({ pattern: /(?:^|\s)(?:\.\.[/\\])+\S*/i, label: 'path traversal' }),
  Object.freeze({ pattern: /\b[A-Za-z]:[\\/]\S+/i, label: 'Windows path' }),
  Object.freeze({ pattern: /\\\\[^\\/\s]+[\\/]\S+/i, label: 'UNC path' }),
  Object.freeze({ pattern: /\b(?:runs|inputs|outputs|assets|cat_anime)[/\\][^\s,，。)]+/i, label: 'project path' }),
  Object.freeze({ pattern: /(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\//i, label: 'host path' }),
  Object.freeze({ pattern: /(?:^|\s)\/(?!\/)\S+/i, label: 'absolute path' }),
  Object.freeze({ pattern: /\b(?:ignore|disregard|override|replace|reveal|repeat)\b.{0,80}\b(?:instruction|prompt|system|rule|requirement)\b/i, label: 'prompt control' }),
  Object.freeze({ pattern: /\b(?:instruction|prompt|system)\b.{0,80}\b(?:ignore|disregard|override|replace|reveal|repeat)\b/i, label: 'prompt control' }),
  Object.freeze({ pattern: /(?:忽略|无视|覆盖|泄露|透露|重复).{0,40}(?:指令|提示词|系统|规则|要求)/i, label: 'prompt control' })
])

const assertProviderNeutralPrompt = (value) => {
  const text = String(value || '').trim()
  if (!text) throw createTaskError('image_prompt_contract_invalid', 'Compiled image prompt is empty')
  if (text.length > MAX_PROMPT_LENGTH) {
    throw createTaskError('image_prompt_contract_invalid', 'Compiled image prompt is too long')
  }
  for (const entry of FORBIDDEN_PROMPT_PATTERNS) {
    if (entry.pattern.test(text)) {
      throw createTaskError(
        'image_prompt_internal_term',
        `Compiled image prompt contains forbidden ${entry.label}`
      )
    }
  }
  return text
}

const createReferenceParagraph = (reference) => {
  if (reference.type === 'identity-comparison') {
    const primaryRegion = reference.primaryRegion || 'the main character view'
    const secondaryRegion = reference.secondaryRegion || 'the supporting detail view'
    return [
      'Use the attached image as the complete visual reference.',
      `It contains ${primaryRegion} and ${secondaryRegion}.`,
      `Match the pose scale and framing of ${primaryRegion} while preserving the visible face, eyes, markings, colors, accessories, material or fur texture, body proportions, silhouette, lighting, and rendering style shown across the reference.`,
      'If written appearance details conflict with the image, follow the image.',
      'Do not reproduce the reference layout, repeated views, presentation spacing, labels, borders, or panel background.'
    ].join(' ')
  }
  if (reference.type === 'identity-and-motion') {
    return [
      'Use the attached image as the complete visual reference.',
      'It contains one identity view followed by ordered pose examples.',
      'Use the identity view for appearance and use the pose examples for the starting pose, motion direction, and motion extreme.',
      'If written appearance details conflict with the image, follow the image.',
      'Do not reproduce the reference layout, repeated views, presentation spacing, labels, borders, or panel background.'
    ].join(' ')
  }
  return [
    'Use the attached character as the exact identity and visual-style reference.',
    'Preserve every clearly visible identity feature, proportion, color, marking, accessory, material, lighting choice, and rendering characteristic.',
    'If written appearance details conflict with the image, follow the image.'
  ].join(' ')
}

const createIdentityLock = (task) => {
  const locks = Array.isArray(task.styleLocks) ? task.styleLocks.filter(Boolean) : []
  if (!locks.length) return ''
  return `Keep the ${locks.join(', ')}.`
}

const createFramingParagraph = (subject) => [
  `Place the character at the ${subject.rootAnchor.replace('-', ' ')} of the canvas.`,
  'Keep the complete body, ears, paws, limbs, tail, hair, clothing, and accessories visible.',
  `Fill approximately ${subject.targetOccupancyPercent}% of the canvas height and keep about ${subject.safePaddingPercent}% clear padding on every side.`,
  'Do not crop or let any body part touch an image edge.'
].join(' ')

const createRequestedChangesParagraph = (task) => {
  const changes = Array.isArray(task.requestedChanges)
    ? task.requestedChanges.map(sanitizeVisualDirective).filter(Boolean)
    : []
  if (!changes.length) return ''
  return `Apply these bounded visual adjustments while preserving every fixed requirement: ${changes.join('; ')}.`
}

const createAppearanceIntentParagraph = (task) => {
  const intent = Array.isArray(task.appearanceIntent) ? task.appearanceIntent.filter(Boolean) : []
  if (!intent.length) return ''
  return `Apply this requested visual treatment only where it does not conflict with the attached character identity: ${intent.join('; ')}.`
}

const createGuidanceParagraph = (qualityGuidance) => {
  const lines = Array.isArray(qualityGuidance)
    ? qualityGuidance.map(sanitizeVisualDirective).filter(Boolean).slice(0, 12)
    : []
  if (!lines.length) return ''
  return `Additional visual-quality guidance: ${lines.join(' ')}`
}

const createSingleImageGoal = (task) => {
  if (task.taskType === 'character-image') {
    return 'Draw one complete full-body character in a calm, readable identity pose with the face and distinguishing features clearly visible.'
  }
  const moment = String(task.action?.moment || '').trim()
  const name = String(task.action?.name || '').trim()
  const stageDescription = task.stage === 'start'
    ? 'This is the starting pose before the main motion.'
    : task.stage === 'peak'
      ? 'This is the clearest motion extreme.'
      : task.stage === 'repair'
        ? 'This is a corrected replacement image.'
        : 'This is the required action pose.'
  return [
    `Draw one complete full-body character${name ? ` performing ${name}` : ''}.`,
    moment ? `Show this exact visible moment: ${moment}.` : '',
    stageDescription
  ].filter(Boolean).join(' ')
}

const createSingleImageExclusions = () => [
  'Do not add text, labels, a logo, watermark, border, panel, grid, second character, duplicate pose, prop, scenery, floor, cast shadow, or visible background.',
  'Do not change the species, face, eyes, markings, colors, accessories, clothing, body proportions, or rendering style.',
  'Do not add or remove limbs, ears, paws, wings, tail parts, clothing, or accessories.'
].join(' ')

const createFixedSingleImageContract = (task) => [
  createFramingParagraph(task.subject),
  'Return one clean isolated full-body character on a transparent background.',
  createSingleImageExclusions()
].join('\n\n')

const createSingleImageBrief = (task, qualityGuidance) => [
  `Create exactly one ${task.canvas.width} x ${task.canvas.height} image with a ${task.canvas.aspectRatio} aspect ratio.`,
  createSingleImageGoal(task),
  createReferenceParagraph(task.referenceInterpretation),
  createIdentityLock(task),
  createAppearanceIntentParagraph(task),
  createRequestedChangesParagraph(task),
  createGuidanceParagraph(qualityGuidance),
  createFixedSingleImageContract(task)
].filter(Boolean).join('\n\n')

const createFramePlanParagraph = (task) => {
  const framePlan = Array.isArray(task.action?.framePlan)
    ? task.action.framePlan.filter(Boolean)
    : []
  if (!framePlan.length) {
    return 'Create a visibly progressive action sequence with a clear start, readable motion extreme, and loop-compatible ending.'
  }
  return ['Required motion moments:', ...framePlan.map((line, index) => `${index + 1}. ${line}`)].join('\n')
}

const createMovingPartsParagraph = (task) => {
  const movingParts = Array.isArray(task.action?.movingParts) ? task.action.movingParts.filter(Boolean) : []
  const lockedParts = Array.isArray(task.action?.lockedParts) ? task.action.lockedParts.filter(Boolean) : []
  return [
    movingParts.length ? `Animate these parts clearly: ${movingParts.join(', ')}.` : '',
    lockedParts.length ? `Keep these features stable: ${lockedParts.join(', ')}.` : '',
    task.action?.loopIntent ? `Sequence intent: ${task.action.loopIntent}.` : ''
  ].filter(Boolean).join(' ')
}

const createFixedFrameSheetContract = (task) => [
  `Arrange exactly ${task.sheet.frameCount} full-body frames in ${task.sheet.columns} columns and ${task.sheet.rows} rows, ordered from left to right and then top to bottom.`,
  'Use equal invisible cells. Put one complete character pose in each required cell and leave every unused cell completely empty and transparent.',
  `Keep the same lower-center root, viewpoint, scale, identity, lighting, and approximately ${task.subject.safePaddingPercent}% clear cell padding in every frame.`,
  'Return one transparent animation frame sheet with no visible grid lines, labels, borders, numbers, text, logo, watermark, props, scenery, floor, cast shadow, duplicated placeholder frames, or character parts crossing between cells.'
].join('\n\n')

const createFrameSheetBrief = (task, qualityGuidance) => [
  `Create exactly one ${task.canvas.width} x ${task.canvas.height} image with a ${task.canvas.aspectRatio} aspect ratio.`,
  `Draw a complete animation frame sheet${task.action?.name ? ` for ${task.action.name}` : ''}.`,
  createReferenceParagraph(task.referenceInterpretation),
  createIdentityLock(task),
  createAppearanceIntentParagraph(task),
  createMovingPartsParagraph(task),
  createFramePlanParagraph(task),
  createRequestedChangesParagraph(task),
  createGuidanceParagraph(qualityGuidance),
  createFixedFrameSheetContract(task)
].filter(Boolean).join('\n\n')

const normalizeCompilerTask = (task = {}) => createProviderImageTask({
  taskType: task.taskType,
  stage: task.stage,
  canvas: task.canvas,
  sheet: task.sheet,
  referenceInterpretation: task.referenceInterpretation,
  subject: task.subject,
  action: task.action,
  styleLocks: task.styleLocks,
  appearanceIntent: task.appearanceIntent,
  strategyId: task.strategyId,
  requestedChanges: task.requestedChanges
})

const compileProviderImagePrompt = ({ task, qualityGuidance = [] } = {}) => {
  const normalizedTask = normalizeCompilerTask(task)
  const text = assertProviderNeutralPrompt(
    normalizedTask.taskType === 'action-frame-sheet'
      ? createFrameSheetBrief(normalizedTask, qualityGuidance)
      : createSingleImageBrief(normalizedTask, qualityGuidance)
  )
  return Object.freeze({
    version: PROMPT_COMPILER_VERSION,
    taskType: normalizedTask.taskType,
    text,
    safeSummary: Object.freeze({
      promptCompilerVersion: PROMPT_COMPILER_VERSION,
      taskType: normalizedTask.taskType,
      stage: normalizedTask.stage,
      width: normalizedTask.canvas.width,
      height: normalizedTask.canvas.height,
      aspectRatio: normalizedTask.canvas.aspectRatio,
      referenceImageCount: 1,
      requestedOutputCount: 1,
      promptSafety: 'provider-neutral',
      ...(normalizedTask.strategyId ? { strategyId: normalizedTask.strategyId } : {})
    }),
    warnings: Object.freeze([])
  })
}

module.exports = {
  FORBIDDEN_PROMPT_PATTERNS,
  PROMPT_COMPILER_VERSION,
  assertProviderNeutralPrompt,
  compileProviderImagePrompt,
  createReferenceParagraph
}
