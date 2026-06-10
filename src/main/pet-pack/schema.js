const DEFAULT_VERSION = '1.0.0'
const DEFAULT_SCHEMA_VERSION = 1

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

const normalizeAction = (action) => {
  assertNonEmptyString(action?.id, 'action.id')
  assertNonEmptyString(action?.sprite, `action(${action.id}).sprite`)

  return {
    id: action.id,
    label: action.label || action.id,
    kind: action.kind || inferActionKind(action.id),
    loop: Boolean(action.loop),
    frameCount: Number(action.frameCount || 1),
    frameMs: Number(action.frameMs || 100),
    frameWidth: Number(action.frameWidth || 0),
    frameHeight: Number(action.frameHeight || 0),
    sprite: action.sprite
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
