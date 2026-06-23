const DEFAULT_VERSION = '1.0.0'
const DEFAULT_SCHEMA_VERSION = 1
const MIN_FRAME_MS = 16
const MAX_FRAME_MS = 5000
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

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

const assertSafeId = (value, fieldName) => {
  assertNonEmptyString(value, fieldName)
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error(`pet pack ${fieldName} must be a safe id`)
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

const optionalString = (value) => (typeof value === 'string' ? value.trim() : '')

const assertPersonaString = (persona, fieldName) => {
  const value = persona?.[fieldName]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`pet pack persona.${fieldName} must be a non-empty string`)
  }
  return value.trim()
}

const assertPersonaStringList = (persona, fieldName) => {
  const value = persona?.[fieldName]
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`pet pack persona.${fieldName} must be a non-empty string array`)
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`pet pack persona.${fieldName}[${index}] must be a non-empty string`)
    }
    return item.trim()
  })
}

const normalizePersona = (persona) => {
  if (persona == null) return null
  if (!persona || typeof persona !== 'object' || Array.isArray(persona)) {
    throw new Error('pet pack persona must be an object')
  }
  return {
    name: assertPersonaString(persona, 'name'),
    identity: assertPersonaString(persona, 'identity'),
    tone: assertPersonaString(persona, 'tone'),
    coreTraits: assertPersonaStringList(persona, 'coreTraits'),
    speakingStyle: assertPersonaString(persona, 'speakingStyle'),
    relationshipToUser: assertPersonaString(persona, 'relationshipToUser'),
    actionStyle: assertPersonaString(persona, 'actionStyle'),
    boundaries: assertPersonaStringList(persona, 'boundaries')
  }
}

const normalizeProvenance = (manifest = {}) => {
  const nested = manifest.provenance && typeof manifest.provenance === 'object' && !Array.isArray(manifest.provenance)
    ? manifest.provenance
    : {}
  return {
    sourceUrl: optionalString(manifest.sourceUrl ?? nested.sourceUrl),
    assetAuthor: optionalString(manifest.assetAuthor ?? nested.assetAuthor),
    license: optionalString(manifest.license ?? nested.license),
    licenseUrl: optionalString(manifest.licenseUrl ?? nested.licenseUrl),
    importedAt: optionalString(manifest.importedAt ?? nested.importedAt),
    originalFormat: optionalString(manifest.originalFormat ?? nested.originalFormat)
  }
}

const toPositiveInteger = (value, fieldName, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`pet pack ${fieldName} must be an integer between ${min} and ${max}`)
  }
  return number
}

const normalizeAction = (action) => {
  assertSafeId(action?.id, 'action.id')
  const sprite = assertSafeRelativePath(action?.sprite, `action(${action.id}).sprite`)
  const frameCount = toPositiveInteger(action.frameCount, `action(${action.id}).frameCount`)
  const frameMs = toPositiveInteger(action.frameMs, `action(${action.id}).frameMs`, { min: MIN_FRAME_MS, max: MAX_FRAME_MS })
  const normalized = {
    id: action.id,
    label: action.label || action.id,
    kind: action.kind || inferActionKind(action.id),
    loop: Boolean(action.loop),
    frameCount,
    frameMs,
    frameWidth: toPositiveInteger(action.frameWidth, `action(${action.id}).frameWidth`),
    frameHeight: toPositiveInteger(action.frameHeight, `action(${action.id}).frameHeight`),
    sprite
  }

  if (action.frameRow != null) {
    normalized.frameRow = toPositiveInteger(action.frameRow, `action(${action.id}).frameRow`, { min: 0 })
  }
  if (action.frameColumn != null) {
    normalized.frameColumn = toPositiveInteger(action.frameColumn, `action(${action.id}).frameColumn`, { min: 0 })
  }
  if (Array.isArray(action.frameDurations)) {
    if (action.frameDurations.length !== frameCount) {
      throw new Error(`pet pack action(${action.id}).frameDurations must match frameCount`)
    }
    normalized.frameDurations = action.frameDurations.map((duration, index) => (
      toPositiveInteger(duration, `action(${action.id}).frameDurations[${index}]`, { min: MIN_FRAME_MS, max: MAX_FRAME_MS })
    ))
  }
  if (action.atlas && typeof action.atlas === 'object' && !Array.isArray(action.atlas)) {
    normalized.atlas = {
      columns: toPositiveInteger(action.atlas.columns, `action(${action.id}).atlas.columns`),
      rows: toPositiveInteger(action.atlas.rows, `action(${action.id}).atlas.rows`),
      width: toPositiveInteger(action.atlas.width, `action(${action.id}).atlas.width`),
      height: toPositiveInteger(action.atlas.height, `action(${action.id}).atlas.height`)
    }
  }

  return normalized
}

const normalizePositiveInteger = (value, fieldName, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value == null) return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`pet pack ${fieldName} must be an integer between ${min} and ${max}`)
  }
  return number
}

const normalizeProbability = (value, fieldName, fallback = 0.2) => {
  if (value == null) return fallback
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`pet pack ${fieldName} must be a number between 0 and 1`)
  }
  return number
}

const normalizeTriggerRuleText = (value, fallback) => {
  const text = optionalString(value)
  return text || fallback
}

const normalizeTriggerRule = (rule, actionIds) => {
  const type = optionalString(rule?.type)
  if (!['random', 'state', 'event'].includes(type)) {
    throw new Error('pet pack triggerRules[].type must be random, state, or event')
  }
  assertSafeId(rule?.actionId, 'triggerRules[].actionId')
  if (!actionIds.has(rule.actionId)) {
    throw new Error(`pet pack triggerRules[].actionId does not exist: ${rule.actionId}`)
  }
  const normalized = {
    id: normalizeTriggerRuleText(rule.id, `rule:${type}:${rule.actionId}`),
    type,
    actionId: rule.actionId,
    label: normalizeTriggerRuleText(rule.label, `${type} trigger for ${rule.actionId}`),
    enabled: Boolean(rule.enabled),
    source: ['host', 'creator-proposal', 'user'].includes(rule.source) ? rule.source : 'host',
    createdAt: normalizeTriggerRuleText(rule.createdAt, ''),
    updatedAt: normalizeTriggerRuleText(rule.updatedAt, '')
  }
  if (type === 'random') {
    normalized.intervalMs = normalizePositiveInteger(rule.intervalMs, 'triggerRules[].intervalMs', 60000, { min: 1000, max: 24 * 60 * 60 * 1000 })
    normalized.probability = normalizeProbability(rule.probability, 'triggerRules[].probability', 0.2)
  }
  if (type === 'state') normalized.state = normalizeTriggerRuleText(rule.state, 'idle')
  if (type === 'event') normalized.eventName = normalizeTriggerRuleText(rule.eventName, 'openpet:event')
  return normalized
}

const normalizeTriggerRules = (rules, actionIds) => {
  if (!Array.isArray(rules)) return []
  const seen = new Set()
  return rules.map((rule) => normalizeTriggerRule(rule, actionIds)).map((rule) => {
    if (seen.has(rule.id)) throw new Error(`pet pack triggerRules[].id is duplicated: ${rule.id}`)
    seen.add(rule.id)
    return rule
  })
}

const normalizePetPackManifest = (manifest) => {
  assertSafeId(manifest?.id, 'id')

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
  const actionIds = new Set(actions.map((action) => action.id))

  return {
    schemaVersion: Number(manifest.schemaVersion || DEFAULT_SCHEMA_VERSION),
    id: manifest.id,
    displayName: manifest.displayName || manifest.id,
    version: manifest.version || DEFAULT_VERSION,
    provenance: normalizeProvenance(manifest),
    persona: normalizePersona(manifest.persona),
    defaultAction,
    clickAction,
    actions,
    triggerRules: normalizeTriggerRules(manifest.triggerRules, actionIds)
  }
}

module.exports = { inferActionKind, normalizeAction, normalizePersona, normalizePetPackManifest, normalizeProvenance, normalizeTriggerRule }
