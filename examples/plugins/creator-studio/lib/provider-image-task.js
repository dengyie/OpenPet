const TASK_TYPES = new Set(['character-image', 'action-keyframe', 'action-frame-sheet'])
const STAGES = new Set(['identity', 'start', 'peak', 'final', 'repair'])
const REFERENCE_TYPES = new Set(['single-character', 'identity-comparison', 'identity-and-motion'])
const ACTION_CLASSES = new Set(['grounded-subtle-loop', 'grounded-locomotion', 'grounded-gesture', 'airborne-arc', 'grounded-state-loop', 'grounded-work-loop'])
const ANCHOR_POLICIES = new Set(['compact-contact-root-v1', 'elongated-envelope-root-v1', 'floating-core-centroid-v1', 'action-relative-root-v1'])
const COMPONENT_POLICIES = new Set(['reference-guided-body-v1'])
const EFFECT_POLICIES = new Set(['forbid-detached-effects'])
const MAX_VISUAL_DIRECTIVE_LENGTH = 240
const MAX_VISUAL_DIRECTIVES = 12
const MAX_APPEARANCE_INTENT_DIRECTIVES = 6
const MIN_CANVAS_EDGE = 64
const MAX_CANVAS_EDGE = 4096

const PROVIDER_CANVASES = Object.freeze({
  square: Object.freeze({ width: 1024, height: 1024 }),
  landscape: Object.freeze({ width: 1536, height: 1024 }),
  portrait: Object.freeze({ width: 1024, height: 1536 })
})

const DEFAULT_FULL_BODY_SUBJECT = Object.freeze({
  count: 1,
  framing: 'full-body',
  targetOccupancyPercent: 78,
  safePaddingPercent: 10,
  rootAnchor: 'lower-center'
})

const DEFAULT_STYLE_LOCKS = Object.freeze([
  'same visible identity-bearing features',
  'same visible markings and colors',
  'same material, surface, or texture rendering',
  'same body proportions and silhouette',
  'same visible accessories or garments when present',
  'same subject lighting and rendering style'
])

const INTERNAL_VISUAL_TEXT = /\b(?:openpet|creator[-_ ]?studio|codex[-_ ]?pet|hatch[-_ ]?pet|provider|backend|run[-_ ]?id|action[-_ ]?id|checkpoint|multipart|reference[-_ ]?role)\b/gi
const SECRET_LIKE_TEXT = /\b(?:sk-[A-Za-z0-9_-]+|bearer\s+[A-Za-z0-9._~-]+|(?:[A-Za-z0-9_-]*token[A-Za-z0-9_-]*|api[-_ ]?key|secret|credential|password|authorization)\s*[:=]\s*(?:(?:bearer|basic)\s+)?\S+)\b/gi
const TOKEN_IDENTIFIER_TEXT = /\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\b/gi
const HOST_PATH_TEXT = /(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/[^\s,，。)]+/g
const URL_TEXT = /https?:\/\/\S+/gi
const FILE_URI_TEXT = /\bfile:\/{2,3}\S+/gi
const TRAVERSAL_TEXT = /(?:^|\s)(?:\.\.[/\\])+\S*/g
const WINDOWS_PATH_TEXT = /\b[A-Za-z]:[\\/]\S+/g
const UNC_PATH_TEXT = /\\\\[^\\/\s]+[\\/]\S+/g
const PROJECT_RELATIVE_PATH_TEXT = /\b(?:runs|inputs|outputs|assets|cat_anime)[/\\][^\s,，。)]+/gi
const POSIX_ABSOLUTE_PATH_TEXT = /(?:^|\s)\/(?!\/)\S+/g

const UNSAFE_APPEARANCE_INTENT_PATTERNS = Object.freeze([
  Object.freeze({ pattern: /\b(?:openpet|creator[-_ ]?studio|codex[-_ ]?pet|hatch[-_ ]?pet|provider|backend|run[-_ ]?id|action[-_ ]?id|checkpoint|multipart|reference[-_ ]?role)\b/i, label: 'internal term' }),
  Object.freeze({ pattern: /\b(?:sk-[A-Za-z0-9_-]+|bearer\s+[A-Za-z0-9._~-]+|(?:[A-Za-z0-9_-]*token[A-Za-z0-9_-]*|api[-_ ]?key|secret|credential|password|authorization)\s*[:=]\s*(?:(?:bearer|basic)\s+)?\S+)\b/i, label: 'secret' }),
  Object.freeze({ pattern: /\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\b/i, label: 'token identifier' }),
  Object.freeze({ pattern: /https?:\/\/\S+/i, label: 'URL' }),
  Object.freeze({ pattern: /\bfile:\/{2,3}\S+/i, label: 'file URI' }),
  Object.freeze({ pattern: /(?:^|\s)(?:\.\.[/\\])+\S*/i, label: 'path traversal' }),
  Object.freeze({ pattern: /\b[A-Za-z]:[\\/]\S+/i, label: 'Windows path' }),
  Object.freeze({ pattern: /\\\\[^\\/\s]+[\\/]\S+/i, label: 'UNC path' }),
  Object.freeze({ pattern: /\b(?:runs|inputs|outputs|assets|cat_anime)[/\\][^\s,，。)]+/i, label: 'project path' }),
  Object.freeze({ pattern: /(?:^|\s)\/(?!\/)\S+/i, label: 'absolute path' }),
  Object.freeze({ pattern: /\b(?:ignore|disregard|override|replace|reveal|repeat)\b.{0,80}\b(?:instruction|prompt|system|rule|requirement)\b/i, label: 'prompt control' }),
  Object.freeze({ pattern: /\b(?:instruction|prompt|system)\b.{0,80}\b(?:ignore|disregard|override|replace|reveal|repeat)\b/i, label: 'prompt control' }),
  Object.freeze({ pattern: /(?:忽略|无视|覆盖|泄露|透露|重复).{0,40}(?:指令|提示词|系统|规则|要求)/i, label: 'prompt control' })
])

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))

const createTaskError = (code, message) => {
  const error = new Error(String(message || 'Image task is invalid'))
  error.code = String(code || 'image_prompt_contract_invalid')
  return error
}

const assertAllowedKeys = (value, allowedKeys, label) => {
  if (!isPlainObject(value)) throw createTaskError('image_prompt_contract_invalid', `${label} must be an object`)
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw createTaskError('image_prompt_contract_invalid', `${label}.${key} is not allowed`)
    }
  }
}

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

const greatestCommonDivisor = (left, right) => {
  let a = Math.abs(Number(left) || 0)
  let b = Math.abs(Number(right) || 0)
  while (b) {
    const next = a % b
    a = b
    b = next
  }
  return a || 1
}

const reduceRatio = (width, height) => {
  const divisor = greatestCommonDivisor(width, height)
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`
}

const createCanvas = ({ width, height } = {}) => {
  const normalizedWidth = Number(width)
  const normalizedHeight = Number(height)
  if (
    !Number.isInteger(normalizedWidth) ||
    normalizedWidth < MIN_CANVAS_EDGE ||
    normalizedWidth > MAX_CANVAS_EDGE
  ) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task width is invalid')
  }
  if (
    !Number.isInteger(normalizedHeight) ||
    normalizedHeight < MIN_CANVAS_EDGE ||
    normalizedHeight > MAX_CANVAS_EDGE
  ) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task height is invalid')
  }
  return deepFreeze({
    width: normalizedWidth,
    height: normalizedHeight,
    aspectRatio: reduceRatio(normalizedWidth, normalizedHeight)
  })
}

const resolveProviderCanvasForLayout = ({ columns, rows } = {}) => {
  const normalizedColumns = Number(columns)
  const normalizedRows = Number(rows)
  if (!Number.isInteger(normalizedColumns) || normalizedColumns < 1) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task sheet columns are invalid')
  }
  if (!Number.isInteger(normalizedRows) || normalizedRows < 1) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task sheet rows are invalid')
  }
  const preset = normalizedColumns > normalizedRows
    ? PROVIDER_CANVASES.landscape
    : normalizedRows > normalizedColumns
      ? PROVIDER_CANVASES.portrait
      : PROVIDER_CANVASES.square
  return createCanvas(preset)
}

const sanitizeVisualDirective = (value) => String(value || '')
  .replace(/[\u0000-\u001F\u007F]/g, ' ')
  .replace(SECRET_LIKE_TEXT, ' ')
  .replace(TOKEN_IDENTIFIER_TEXT, ' ')
  .replace(URL_TEXT, ' ')
  .replace(FILE_URI_TEXT, ' ')
  .replace(TRAVERSAL_TEXT, ' ')
  .replace(WINDOWS_PATH_TEXT, ' ')
  .replace(UNC_PATH_TEXT, ' ')
  .replace(PROJECT_RELATIVE_PATH_TEXT, ' ')
  .replace(HOST_PATH_TEXT, ' ')
  .replace(POSIX_ABSOLUTE_PATH_TEXT, ' ')
  .replace(INTERNAL_VISUAL_TEXT, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_VISUAL_DIRECTIVE_LENGTH)

const normalizeVisualDirectives = (value, fallback = []) => {
  const source = Array.isArray(value) ? value : fallback
  return source
    .map(sanitizeVisualDirective)
    .filter(Boolean)
    .slice(0, MAX_VISUAL_DIRECTIVES)
}

const normalizeAppearanceIntent = (value) => {
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task appearance intent must be an array')
  }
  return value.slice(0, MAX_APPEARANCE_INTENT_DIRECTIVES).map((entry) => {
    if (typeof entry !== 'string') {
      throw createTaskError('image_prompt_contract_invalid', 'Image task appearance intent must contain text')
    }
    const raw = entry.trim()
    const unsafe = UNSAFE_APPEARANCE_INTENT_PATTERNS.find(({ pattern }) => pattern.test(raw))
    if (unsafe) {
      throw createTaskError('image_prompt_contract_invalid', `Image task appearance intent contains forbidden ${unsafe.label}`)
    }
    return sanitizeVisualDirective(raw)
  }).filter(Boolean)
}

const resolveReferenceInterpretation = (referenceRole = '') => {
  const role = String(referenceRole || '').trim().toLowerCase()
  if (role === 'full-pet-action-identity-board') {
    return deepFreeze({
      type: 'identity-comparison',
      primaryRegion: 'the larger primary character view',
      secondaryRegion: 'the smaller source-detail view',
      ignorePresentationLayout: true
    })
  }
  if (/composite-reference-board|source-action-reference-board/.test(role)) {
    return deepFreeze({
      type: 'identity-comparison',
      primaryRegion: 'the main identity view',
      secondaryRegion: 'the supporting identity views',
      ignorePresentationLayout: true
    })
  }
  if (/keyframe-action-reference-board|action-peak-conditioning-board/.test(role)) {
    return deepFreeze({
      type: 'identity-and-motion',
      primaryRegion: 'the identity view',
      secondaryRegion: 'the ordered pose examples',
      ignorePresentationLayout: true
    })
  }
  return deepFreeze({
    type: 'single-character',
    primaryRegion: 'the attached character',
    secondaryRegion: '',
    ignorePresentationLayout: false
  })
}

const normalizeReferenceInterpretation = (value, referenceRole = '') => {
  if (value == null) return resolveReferenceInterpretation(referenceRole)
  assertAllowedKeys(
    value,
    new Set(['type', 'primaryRegion', 'secondaryRegion', 'ignorePresentationLayout']),
    'referenceInterpretation'
  )
  const type = String(value.type || '')
  if (!REFERENCE_TYPES.has(type)) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task reference interpretation is invalid')
  }
  return deepFreeze({
    type,
    primaryRegion: sanitizeVisualDirective(value.primaryRegion),
    secondaryRegion: sanitizeVisualDirective(value.secondaryRegion),
    ignorePresentationLayout: Boolean(value.ignorePresentationLayout)
  })
}

const normalizeSheet = (value) => {
  if (value == null) return null
  assertAllowedKeys(
    value,
    new Set(['frameCount', 'columns', 'rows', 'readingOrder']),
    'sheet'
  )
  const frameCount = Number(value.frameCount)
  const columns = Number(value.columns)
  const rows = Number(value.rows)
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 32) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task frame count is invalid')
  }
  if (!Number.isInteger(columns) || columns < 1 || columns > 32) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task sheet columns are invalid')
  }
  if (!Number.isInteger(rows) || rows < 1 || rows > 32) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task sheet rows are invalid')
  }
  if (columns * rows < frameCount) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task sheet has fewer cells than frames')
  }
  const readingOrder = String(value.readingOrder || 'left-to-right-top-to-bottom')
  if (readingOrder !== 'left-to-right-top-to-bottom') {
    throw createTaskError('image_prompt_contract_invalid', 'Image task sheet reading order is invalid')
  }
  return deepFreeze({ frameCount, columns, rows, readingOrder })
}

const normalizeSubject = (value = DEFAULT_FULL_BODY_SUBJECT) => {
  assertAllowedKeys(
    value,
    new Set(['count', 'framing', 'targetOccupancyPercent', 'safePaddingPercent', 'rootAnchor']),
    'subject'
  )
  const count = Number(value.count ?? 1)
  const framing = String(value.framing || 'full-body')
  const targetOccupancyPercent = Number(value.targetOccupancyPercent ?? 78)
  const safePaddingPercent = Number(value.safePaddingPercent ?? 10)
  const rootAnchor = String(value.rootAnchor || 'lower-center')
  if (count !== 1 || framing !== 'full-body' || rootAnchor !== 'lower-center') {
    throw createTaskError('image_prompt_contract_invalid', 'Image task subject contract is invalid')
  }
  if (!Number.isFinite(targetOccupancyPercent) || targetOccupancyPercent < 60 || targetOccupancyPercent > 90) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task subject occupancy is invalid')
  }
  if (!Number.isFinite(safePaddingPercent) || safePaddingPercent < 5 || safePaddingPercent > 20) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task safe padding is invalid')
  }
  return deepFreeze({
    count,
    framing,
    targetOccupancyPercent: Math.round(targetOccupancyPercent),
    safePaddingPercent: Math.round(safePaddingPercent),
    rootAnchor
  })
}

const createFrameCell = ({ frame, sheet }) => {
  if (!sheet) return ''
  const index = frame - 1
  return `row ${Math.floor(index / sheet.columns) + 1} column ${(index % sheet.columns) + 1}`
}

const normalizeFrameBeats = (value, sheet) => {
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task action frame beats must be an array')
  }
  const normalized = value.map((entry, index) => {
    const frame = index + 1
    if (typeof entry === 'string') {
      return {
        frame,
        cell: createFrameCell({ frame, sheet }),
        beat: sanitizeVisualDirective(entry.replace(/^Frame\s+\d+\s*:\s*/i, ''))
      }
    }
    assertAllowedKeys(entry, new Set(['frame', 'cell', 'beat']), `action.frameBeats[${index}]`)
    const normalizedFrame = Number(entry.frame)
    if (!Number.isInteger(normalizedFrame) || normalizedFrame !== frame) {
      throw createTaskError('image_prompt_frame_plan_incomplete', 'Image task frame beats must be contiguous from frame 1')
    }
    const expectedCell = createFrameCell({ frame, sheet })
    const providedCell = sanitizeVisualDirective(entry.cell)
    if (sheet && providedCell && providedCell !== expectedCell) {
      throw createTaskError('image_prompt_frame_plan_incomplete', 'Image task frame beat cell does not match sheet geometry')
    }
    return {
      frame,
      cell: expectedCell || providedCell,
      beat: sanitizeVisualDirective(entry.beat)
    }
  })
  if (sheet && normalized.length !== sheet.frameCount) {
    throw createTaskError('image_prompt_frame_plan_incomplete', 'Image task frame beats must cover every required frame')
  }
  if (normalized.some((entry) => !entry.beat)) {
    throw createTaskError('image_prompt_frame_plan_incomplete', 'Image task frame beat text is required')
  }
  return normalized
}

const normalizeAction = (value, sheet) => {
  if (value == null) return null
  assertAllowedKeys(
    value,
    new Set([
      'name',
      'animationType',
      'moment',
      'viewDirection',
      'loopType',
      'movingParts',
      'secondaryMotion',
      'lockedParts',
      'forbiddenMotion',
      'loopIntent',
      'framePlan',
      'frameBeats'
    ]),
    'action'
  )
  const frameBeats = normalizeFrameBeats(value.frameBeats ?? value.framePlan, sheet)
  return deepFreeze({
    name: sanitizeVisualDirective(value.name),
    animationType: sanitizeVisualDirective(value.animationType),
    moment: sanitizeVisualDirective(value.moment),
    viewDirection: sanitizeVisualDirective(value.viewDirection),
    loopType: sanitizeVisualDirective(value.loopType),
    movingParts: normalizeVisualDirectives(value.movingParts),
    secondaryMotion: normalizeVisualDirectives(value.secondaryMotion),
    lockedParts: normalizeVisualDirectives(value.lockedParts),
    forbiddenMotion: normalizeVisualDirectives(value.forbiddenMotion),
    loopIntent: sanitizeVisualDirective(value.loopIntent),
    frameBeats: deepFreeze(frameBeats)
  })
}

const createProviderImageTask = (input = {}) => {
  assertAllowedKeys(
    input,
    new Set([
      'taskType',
      'stage',
      'canvas',
      'sheet',
      'referenceRole',
      'referenceInterpretation',
      'subject',
      'action',
      'styleLocks',
      'appearanceIntent',
      'strategyId',
      'requestedChanges',
      'actionClass',
      'anchorPolicy',
      'componentPolicy',
      'effectPolicy',
      'motionPresetId',
      'framePlanVersion'
    ]),
    'imageTask'
  )
  const taskType = String(input.taskType || '')
  const stage = String(input.stage || '')
  if (!TASK_TYPES.has(taskType)) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task type is invalid')
  }
  if (!STAGES.has(stage)) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task stage is invalid')
  }
  const sheet = normalizeSheet(input.sheet)
  if (taskType === 'action-frame-sheet' && !sheet) {
    throw createTaskError('image_prompt_contract_invalid', 'Action frame sheet task requires sheet geometry')
  }
  if (taskType !== 'action-frame-sheet' && sheet) {
    throw createTaskError('image_prompt_contract_invalid', 'Single image task must not contain sheet geometry')
  }
  const hasQualityFirstPolicy = Boolean(
    input.actionClass ||
    input.anchorPolicy ||
    input.componentPolicy ||
    input.effectPolicy ||
    input.motionPresetId ||
    input.framePlanVersion
  )
  const canvas = input.canvas
    ? createCanvas(input.canvas)
    : sheet && hasQualityFirstPolicy
      ? createCanvas(PROVIDER_CANVASES.square)
      : sheet
      ? resolveProviderCanvasForLayout(sheet)
      : createCanvas(PROVIDER_CANVASES.square)
  if (hasQualityFirstPolicy && (canvas.width !== canvas.height || canvas.width !== PROVIDER_CANVASES.square.width)) {
    throw createTaskError('image_prompt_contract_invalid', 'Quality-first action policy requires a square 1024 canvas')
  }
  const action = normalizeAction(input.action, sheet)
  if (taskType !== 'character-image' && !action) {
    throw createTaskError('image_prompt_contract_invalid', 'Action image task requires a visual action')
  }
  const strategyId = String(input.strategyId || '').trim()
  if (strategyId && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(strategyId)) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task strategy is invalid')
  }
  let qualityFirstPolicy = {}
  if (hasQualityFirstPolicy) {
    if (taskType !== 'action-frame-sheet') {
      throw createTaskError('image_prompt_contract_invalid', 'Quality-first action policy requires a frame sheet task')
    }
    const actionClass = String(input.actionClass || '')
    const anchorPolicy = String(input.anchorPolicy || '')
    const componentPolicy = String(input.componentPolicy || '')
    const effectPolicy = String(input.effectPolicy || '')
    const motionPresetId = String(input.motionPresetId || '').trim()
    const framePlanVersion = Number(input.framePlanVersion)
    if (!ACTION_CLASSES.has(actionClass)) throw createTaskError('image_prompt_contract_invalid', 'Image task actionClass is invalid')
    if (!ANCHOR_POLICIES.has(anchorPolicy)) throw createTaskError('image_prompt_contract_invalid', 'Image task anchorPolicy is invalid')
    if (!COMPONENT_POLICIES.has(componentPolicy)) throw createTaskError('image_prompt_contract_invalid', 'Image task componentPolicy is invalid')
    if (!EFFECT_POLICIES.has(effectPolicy)) throw createTaskError('image_prompt_contract_invalid', 'Image task effectPolicy is invalid')
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(motionPresetId)) throw createTaskError('image_prompt_contract_invalid', 'Image task motionPresetId is invalid')
    if (framePlanVersion !== 1) throw createTaskError('image_prompt_contract_invalid', 'Image task framePlanVersion is invalid')
    qualityFirstPolicy = {
      actionClass,
      anchorPolicy,
      componentPolicy,
      effectPolicy,
      motionPresetId,
      framePlanVersion
    }
  }
  return deepFreeze({
    version: 3,
    taskType,
    stage,
    canvas,
    sheet,
    referenceInterpretation: normalizeReferenceInterpretation(
      input.referenceInterpretation,
      input.referenceRole
    ),
    subject: normalizeSubject(input.subject || DEFAULT_FULL_BODY_SUBJECT),
    action,
    styleLocks: normalizeVisualDirectives(input.styleLocks, DEFAULT_STYLE_LOCKS),
    appearanceIntent: normalizeAppearanceIntent(input.appearanceIntent),
    strategyId,
    requestedChanges: normalizeVisualDirectives(input.requestedChanges),
    ...qualityFirstPolicy
  })
}

module.exports = {
  DEFAULT_FULL_BODY_SUBJECT,
  DEFAULT_STYLE_LOCKS,
  ACTION_CLASSES,
  ANCHOR_POLICIES,
  COMPONENT_POLICIES,
  EFFECT_POLICIES,
  PROVIDER_CANVASES,
  UNSAFE_APPEARANCE_INTENT_PATTERNS,
  createCanvas,
  createProviderImageTask,
  createTaskError,
  resolveProviderCanvasForLayout,
  resolveReferenceInterpretation,
  sanitizeVisualDirective
}
