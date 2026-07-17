const { sanitizeVisualDirective } = require('./provider-image-task')

const MAX_PLAN_ITEMS = 12
const NON_VISUAL_PRODUCT_LANGUAGE = Object.freeze([
  /\breusable\b/i,
  /\bdesktop[- ]?pet\b/i,
  /\bnamed\b/i,
  /\bactivation\b/i,
  /\bapproval\b/i,
  /\bimport(?:ing)?\b/i,
  /\bpackag(?:e|ing)\b/i,
  /\bruntime\b/i,
  /\batlas\b/i,
  /\bapplication\b/i
])

const VISUAL_INTENT_BOUNDARY = /\b(?:with|featuring|wearing|showing|depicting|rendered(?:\s+in)?|drawn(?:\s+in)?|painted(?:\s+in)?|styled(?:\s+as)?|using)\b[\s\S]*/i

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

const stripNonVisualProductLanguage = (value) => {
  const text = sanitizeVisualDirective(value)
  if (!text) return ''
  if (!NON_VISUAL_PRODUCT_LANGUAGE.some((pattern) => pattern.test(text))) return text
  const visibleTail = text.match(VISUAL_INTENT_BOUNDARY)?.[0] || ''
  if (!visibleTail) return ''
  return NON_VISUAL_PRODUCT_LANGUAGE
    .reduce((result, pattern) => result.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), ' '), visibleTail)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()
}

const containsNonVisualProductLanguage = (value) => (
  Array.isArray(value) && value.some((entry) => {
    const text = sanitizeVisualDirective(entry)
    return Boolean(text && NON_VISUAL_PRODUCT_LANGUAGE.some((pattern) => pattern.test(text)))
  })
)

const normalizeTextList = (value, { rejectProductLanguage = false } = {}) => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => rejectProductLanguage
      ? stripNonVisualProductLanguage(entry)
      : sanitizeVisualDirective(entry))
    .filter(Boolean)
    .slice(0, MAX_PLAN_ITEMS)
}

const createVisualPlan = (input = {}) => {
  const existingSubject = input.subject && typeof input.subject === 'object' ? input.subject : {}
  const appearanceIntent = input.appearanceIntent || existingSubject.mediumAndStyle || []
  const requestedChanges = input.requestedChanges || existingSubject.requestedVisibleChanges || []
  const action = input.action || null
  const subject = input.composition && typeof input.composition === 'object'
    ? input.composition
    : existingSubject
  const backgroundIntent = input.backgroundIntent || 'isolated-cutout-ready'
  const warnings = new Set(Array.isArray(input.warnings) ? input.warnings.map(String).filter(Boolean) : [])
  if (
    containsNonVisualProductLanguage(appearanceIntent) ||
    containsNonVisualProductLanguage(requestedChanges)
  ) {
    warnings.add('visual_plan_product_language_removed')
  }
  const normalizedAction = action && typeof action === 'object'
    ? {
        name: sanitizeVisualDirective(action.name),
        animationType: sanitizeVisualDirective(action.animationType),
        viewDirection: sanitizeVisualDirective(action.viewDirection),
        loopType: sanitizeVisualDirective(action.loopType),
        primaryMotion: normalizeTextList(action.movingParts || action.primaryMotion),
        secondaryMotion: normalizeTextList(action.secondaryMotion),
        forbiddenMotion: normalizeTextList(action.forbiddenMotion),
        lockedFeatures: normalizeTextList(action.lockedParts || action.lockedFeatures)
      }
    : null

  return deepFreeze({
    version: 1,
    subject: {
      kind: 'character',
      visibleIdentityFeatures: normalizeTextList(existingSubject.visibleIdentityFeatures),
      visibleAccessories: normalizeTextList(existingSubject.visibleAccessories),
      mediumAndStyle: normalizeTextList(appearanceIntent, { rejectProductLanguage: true }),
      requestedVisibleChanges: normalizeTextList(requestedChanges, { rejectProductLanguage: true })
    },
    action: normalizedAction,
    composition: {
      framing: String(subject.framing || 'full-body'),
      rootAnchor: String(subject.rootAnchor || 'lower-center'),
      targetOccupancyPercent: Math.round(Number(subject.targetOccupancyPercent) || 78),
      safePaddingPercent: Math.round(Number(subject.safePaddingPercent) || 10)
    },
    backgroundIntent: backgroundIntent === 'isolated-cutout-ready'
      ? backgroundIntent
      : 'isolated-cutout-ready',
    warnings: [...warnings]
  })
}

module.exports = {
  NON_VISUAL_PRODUCT_LANGUAGE,
  containsNonVisualProductLanguage,
  createVisualPlan,
  stripNonVisualProductLanguage
}
