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

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

const normalizeTextList = (value, { rejectProductLanguage = false } = {}) => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => sanitizeVisualDirective(entry))
    .filter(Boolean)
    .filter((entry) => !rejectProductLanguage || !NON_VISUAL_PRODUCT_LANGUAGE.some((pattern) => pattern.test(entry)))
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
      : 'isolated-cutout-ready'
  })
}

module.exports = {
  NON_VISUAL_PRODUCT_LANGUAGE,
  createVisualPlan
}
