const DEFAULT_VERSION = '1.0.0'
const DEFAULT_SCHEMA_VERSION = 1
const MIN_FRAME_MS = 16
const MAX_FRAME_MS = 5000

const inferActionKind = (actionId) => {
  if (/idle|bai|stand/i.test(actionId)) return 'idle'
  if (/eat|click/i.test(actionId)) return 'click'
  if (/wave|hello|greet/i.test(actionId)) return 'greeting'
  if (/think|thinking/i.test(actionId)) return 'thinking'
  if (/work|working|run/i.test(actionId)) return 'working'
  if (/wait|waiting/i.test(actionId)) return 'waiting'
  if (/success|done|ok/i.test(actionId)) return 'success'
  if (/fail|error|broken/i.test(actionId)) return 'failure'
  return 'custom'
}

const assertNonEmptyString = (value, fieldName) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`pet pack ${fieldName} must be a non-empty string`)
  }
}

const assertSafeRelativePath = (value, fieldName) => {
  assertNonEmptyString(value, fieldName)
  const normalized = value.replace(/\\/g, '/')
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`pet pack ${fieldName} must be a safe relative path`)
  }
  return normalized
}

const toPositiveInteger = (value, fieldName, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`pet pack ${fieldName} must be an integer between ${min} and ${max}`)
  }
  return number
}

const normalizeAction = (action) => {
  assertNonEmptyString(action?.id, 'action.id')
  const sprite = assertSafeRelativePath(action?.sprite, `action(${action.id}).sprite`)

  return {
    id: action.id,
    label: action.label || action.id,
    kind: action.kind || inferActionKind(action.id),
    loop: Boolean(action.loop),
    frameCount: toPositiveInteger(action.frameCount, `action(${action.id}).frameCount`),
    frameMs: toPositiveInteger(action.frameMs, `action(${action.id}).frameMs`, { min: MIN_FRAME_MS, max: MAX_FRAME_MS }),
    frameWidth: toPositiveInteger(action.frameWidth, `action(${action.id}).frameWidth`),
    frameHeight: toPositiveInteger(action.frameHeight, `action(${action.id}).frameHeight`),
    sprite
  }
}

const normalizePetPackManifest = (manifest) => {
  assertNonEmptyString(manifest?.id, 'id')

  const actions = Array.isArray(manifest.actions) ? manifest.actions.map(normalizeAction) : []
  if (!actions.length) throw new Error('pet pack must include at least one action')

  const defaultAction = manifest.defaultAction || actions[0].id
  const clickAction = manifest.clickAction || defaultAction
  if (!actions.some((action) => action.id === defaultAction)) {
    throw new Error(`pet pack defaultAction does not exist: ${defaultAction}`)
  }
  if (!actions.some((action) => action.id === clickAction)) {
    throw new Error(`pet pack clickAction does not exist: ${clickAction}`)
  }

  return {
    schemaVersion: Number(manifest.schemaVersion || DEFAULT_SCHEMA_VERSION),
    id: manifest.id,
    displayName: manifest.displayName || manifest.id,
    version: manifest.version || DEFAULT_VERSION,
    defaultAction,
    clickAction,
    actions
  }
}

module.exports = { inferActionKind, normalizeAction, normalizePetPackManifest }
