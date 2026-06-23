const { getLegacyPetAnimations, loadLegacyPetPack } = require('../pet-pack/loader')
const path = require('path')
const { pathToFileURL } = require('url')

const SAFE_ACTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const SAFE_RELATIVE_SPRITE_PATTERN = /^[^/\\\0][^\\\0]*$/
const TRIGGER_RULE_TYPES = new Set(['random', 'state', 'event'])
const TRIGGER_RULE_SOURCES = new Set(['host', 'creator-proposal', 'user'])

const emptyConfig = {
  defaultAction: '',
  clickAction: '',
  actions: [],
  triggerRules: []
}

const emptyPetPack = {
  rootPath: '',
  manifest: {
    schemaVersion: 1,
    id: 'empty',
    displayName: 'Empty',
    version: '1.0.0',
    ...emptyConfig
  },
  source: {
    type: 'empty'
  }
}

const normalizeActionId = (value, fieldName = 'action id') => {
  if (typeof value !== 'string' || !SAFE_ACTION_ID_PATTERN.test(value)) {
    throw new Error(`Creator ${fieldName} must be a safe id`)
  }
  return value
}

const normalizeRelativeSprite = (value, fieldName = 'action sprite') => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Creator ${fieldName} is required`)
  }
  const normalized = value.replace(/\\/g, '/')
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..') ||
    !SAFE_RELATIVE_SPRITE_PATTERN.test(normalized)
  ) {
    throw new Error(`Creator ${fieldName} must be a safe relative path`)
  }
  return normalized
}

const normalizeCreatorAction = (action = {}) => {
  const id = normalizeActionId(action.id, 'action id')
  const sprite = normalizeRelativeSprite(action.sprite, `action(${id}).sprite`)
  const frameCount = Number(action.frameCount)
  const frameMs = Number(action.frameMs)
  const frameWidth = Number(action.frameWidth)
  const frameHeight = Number(action.frameHeight)
  if (!Number.isInteger(frameCount) || frameCount <= 0) throw new Error(`Creator action(${id}).frameCount must be a positive integer`)
  if (!Number.isInteger(frameMs) || frameMs <= 0) throw new Error(`Creator action(${id}).frameMs must be a positive integer`)
  if (!Number.isInteger(frameWidth) || frameWidth <= 0) throw new Error(`Creator action(${id}).frameWidth must be a positive integer`)
  if (!Number.isInteger(frameHeight) || frameHeight <= 0) throw new Error(`Creator action(${id}).frameHeight must be a positive integer`)
  const normalized = {
    id,
    label: action.label || id,
    kind: action.kind || 'custom',
    loop: Boolean(action.loop),
    frameCount,
    frameMs,
    frameWidth,
    frameHeight,
    sprite
  }
  if (Array.isArray(action.frameDurations)) normalized.frameDurations = action.frameDurations.slice()
  if (action.atlas && typeof action.atlas === 'object' && !Array.isArray(action.atlas)) normalized.atlas = { ...action.atlas }
  if (action.frameRow != null) normalized.frameRow = Number(action.frameRow)
  if (action.frameColumn != null) normalized.frameColumn = Number(action.frameColumn)
  return normalized
}

const collectCreatorActionValidationErrors = (action = {}) => {
  const errors = []
  const actionId = typeof action.id === 'string' && action.id ? action.id : 'unknown'

  try {
    normalizeActionId(action.id, 'action id')
  } catch (error) {
    errors.push(error.message || 'Creator action id is invalid')
  }

  try {
    normalizeRelativeSprite(action.sprite, `action(${actionId}).sprite`)
  } catch (error) {
    errors.push(error.message || 'Creator action sprite is invalid')
  }

  const frameCount = Number(action.frameCount)
  if (!Number.isInteger(frameCount) || frameCount <= 0) {
    errors.push(`Creator action(${actionId}).frameCount must be a positive integer`)
  }

  const frameMs = Number(action.frameMs)
  if (!Number.isInteger(frameMs) || frameMs <= 0) {
    errors.push(`Creator action(${actionId}).frameMs must be a positive integer`)
  }

  const frameWidth = Number(action.frameWidth)
  if (!Number.isInteger(frameWidth) || frameWidth <= 0) {
    errors.push(`Creator action(${actionId}).frameWidth must be a positive integer`)
  }

  const frameHeight = Number(action.frameHeight)
  if (!Number.isInteger(frameHeight) || frameHeight <= 0) {
    errors.push(`Creator action(${actionId}).frameHeight must be a positive integer`)
  }

  return errors
}

const normalizePersistedCreatorConfig = (config = {}) => ({
  defaultAction: String(config.defaultAction || ''),
  clickAction: String(config.clickAction || ''),
  actions: Array.isArray(config.actions) ? config.actions.map((action) => ({ ...action })) : [],
  triggerRules: Array.isArray(config.triggerRules) ? config.triggerRules.map((rule) => ({ ...rule })) : []
})

const normalizePositiveInteger = (value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) return fallback
  return number
}

const normalizeProbability = (value, fallback = 0.2) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.min(1, number))
}

const normalizeRuleText = (value, fallback) => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

const createRuleId = (type, actionId) => `rule:${type}:${actionId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`

const normalizeTriggerRule = (rule = {}, actionIds = new Set(), { now = new Date().toISOString() } = {}) => {
  const type = TRIGGER_RULE_TYPES.has(rule.type) ? rule.type : ''
  if (!type) throw new Error('Trigger rule type must be random, state, or event')
  const actionId = normalizeActionId(rule.actionId, 'trigger rule actionId')
  if (actionIds.size && !actionIds.has(actionId)) throw new Error(`Trigger rule action does not exist: ${actionId}`)

  const normalized = {
    id: typeof rule.id === 'string' && rule.id.trim() ? rule.id.trim() : createRuleId(type, actionId),
    type,
    actionId,
    label: normalizeRuleText(rule.label, `${type} trigger for ${actionId}`),
    enabled: Boolean(rule.enabled),
    source: TRIGGER_RULE_SOURCES.has(rule.source) ? rule.source : 'host',
    createdAt: typeof rule.createdAt === 'string' && rule.createdAt ? rule.createdAt : now,
    updatedAt: typeof rule.updatedAt === 'string' && rule.updatedAt ? rule.updatedAt : now
  }

  if (type === 'random') {
    normalized.intervalMs = normalizePositiveInteger(rule.intervalMs, 60000, { min: 1000, max: 24 * 60 * 60 * 1000 })
    normalized.probability = normalizeProbability(rule.probability, 0.2)
  }
  if (type === 'state') normalized.state = normalizeRuleText(rule.state ?? rule.binding, 'idle')
  if (type === 'event') normalized.eventName = normalizeRuleText(rule.eventName ?? rule.binding, 'openpet:event')

  return normalized
}

const normalizeTriggerRules = (rules = [], actionIds = new Set()) => {
  if (!Array.isArray(rules)) return []
  const seen = new Set()
  return rules.map((rule) => normalizeTriggerRule(rule, actionIds)).filter((rule) => {
    if (seen.has(rule.id)) throw new Error(`Trigger rule id is duplicated: ${rule.id}`)
    seen.add(rule.id)
    return true
  })
}

const createActionService = ({ petPackService, loadPetPack, loadLegacyAnimations = getLegacyPetAnimations, saveLegacyAnimations, projectRoot = path.join(__dirname, '..', '..', '..') }) => {
  let cachedPetPack = null
  let legacyConfigOverride = null
  let memoryConfigOverride = null

  const getPetPack = () => {
    if (cachedPetPack) return cachedPetPack
    try {
      if (loadPetPack) {
        cachedPetPack = loadPetPack()
        if (memoryConfigOverride) {
          cachedPetPack = {
            ...cachedPetPack,
            manifest: {
              ...(cachedPetPack.manifest || {}),
              ...memoryConfigOverride
            }
          }
        }
        return cachedPetPack
      }
      if (petPackService) {
        cachedPetPack = petPackService.getActivePetPack()
        return cachedPetPack
      }
      cachedPetPack = {
        ...loadLegacyPetPack({
          id: 'legacy-cat',
          displayName: 'Legacy Cat',
          getPetAnimations: () => memoryConfigOverride || legacyConfigOverride || loadLegacyAnimations()
        }),
        rootPath: projectRoot
      }
      return cachedPetPack
    } catch (error) {
      console.error('Failed to load pet pack:', error)
    }
    return emptyPetPack
  }

  const getConfig = () => {
    const petPack = getPetPack()
    const config = petPack.manifest || emptyConfig
    const spriteRoot = petPack.rootPath || projectRoot
    return {
      defaultAction: config.defaultAction || '',
      clickAction: config.clickAction || '',
      actions: Array.isArray(config.actions) ? config.actions.map((action) => ({
        ...action,
        sprite: action.sprite
          ? pathToFileURL(path.join(spriteRoot, action.sprite)).toString()
          : ''
      })) : [],
      triggerRules: normalizeTriggerRules(config.triggerRules, new Set((config.actions || []).map((action) => action.id).filter(Boolean)))
    }
  }

  const getMutableConfig = () => {
    const petPack = getPetPack()
    const config = petPack.manifest || emptyConfig
    return {
      defaultAction: config.defaultAction || '',
      clickAction: config.clickAction || '',
      actions: Array.isArray(config.actions) ? config.actions.map((action) => ({ ...action })) : [],
      triggerRules: normalizeTriggerRules(config.triggerRules, new Set((config.actions || []).map((action) => action.id).filter(Boolean)))
    }
  }

  const listActions = () => getConfig().actions

  const getAction = (actionId) => listActions().find((action) => action.id === actionId) || null

  const getPreviewConfig = () => {
    const config = getConfig()
    return {
      ...config,
      actions: config.actions.map((action) => ({
        ...action,
        previewSprite: action.sprite || ''
      }))
    }
  }

  const reload = () => {
    cachedPetPack = null
    return getConfig()
  }

  const validateCreatorActionMutation = (mutation = {}) => {
    const errors = []
    const currentConfig = getMutableConfig()
    const nextActions = Array.isArray(mutation.actions) ? mutation.actions : []
    const normalizedActions = []
    const seenMutationIds = new Set()
    for (const action of nextActions) {
      if (typeof action?.id === 'string' && action.id) {
        if (seenMutationIds.has(action.id)) {
          errors.push(`Creator action id is duplicated in mutation: ${action.id}`)
          continue
        }
        seenMutationIds.add(action.id)
      }
      const actionErrors = collectCreatorActionValidationErrors(action)
      errors.push(...actionErrors)
      if (actionErrors.length === 0) normalizedActions.push(normalizeCreatorAction(action))
    }

    const byId = new Map(currentConfig.actions.map((action) => [action.id, { ...action }]))
    normalizedActions.forEach((action) => byId.set(action.id, action))
    const mergedActions = Array.from(byId.values())

    const nextDefaultAction = mutation.defaultAction ? String(mutation.defaultAction) : currentConfig.defaultAction
    const nextClickAction = mutation.clickAction ? String(mutation.clickAction) : currentConfig.clickAction
    const ids = new Set(mergedActions.map((action) => action.id))
    if (nextDefaultAction && !ids.has(nextDefaultAction)) {
      errors.push(`Creator defaultAction does not exist: ${nextDefaultAction}`)
    }
    if (nextClickAction && !ids.has(nextClickAction)) {
      errors.push(`Creator clickAction does not exist: ${nextClickAction}`)
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings: [],
      actions: {
        defaultAction: nextDefaultAction,
        clickAction: nextClickAction,
        actions: mergedActions
      }
    }
  }

  const applyCreatorActionMutation = (mutation = {}) => {
    const validation = validateCreatorActionMutation(mutation)
    if (!validation.ok) {
      throw new Error(`Creator action mutation is invalid: ${validation.errors.join('; ')}`)
    }
    const current = getMutableConfig()
    const nextConfig = {
      defaultAction: validation.actions.defaultAction,
      clickAction: validation.actions.clickAction,
      actions: validation.actions.actions.map((action) => ({ ...action })),
      triggerRules: current.triggerRules
    }
    if (typeof saveLegacyAnimations === 'function') {
      const persistedConfig = normalizePersistedCreatorConfig(nextConfig)
      legacyConfigOverride = persistedConfig
      saveLegacyAnimations(persistedConfig)
      return reload()
    }
    if (petPackService?.updateActivePetPackManifest) {
      petPackService.updateActivePetPackManifest(normalizePersistedCreatorConfig(nextConfig))
      return reload()
    }
    memoryConfigOverride = normalizePersistedCreatorConfig(nextConfig)
    cachedPetPack = null
    return {
      ...current,
      ...nextConfig
    }
  }

  const saveConfig = ({ defaultAction, clickAction, triggerRules } = {}) => {
    const current = getMutableConfig()
    const nextDefaultAction = typeof defaultAction === 'string' ? defaultAction : current.defaultAction
    const nextClickAction = typeof clickAction === 'string' ? clickAction : current.clickAction
    const actionIds = new Set(current.actions.map((action) => action.id).filter(Boolean))
    if (nextDefaultAction && !actionIds.has(nextDefaultAction)) {
      throw new Error(`Creator defaultAction does not exist: ${nextDefaultAction}`)
    }
    if (nextClickAction && !actionIds.has(nextClickAction)) {
      throw new Error(`Creator clickAction does not exist: ${nextClickAction}`)
    }
    const nextTriggerRules = triggerRules === undefined
      ? current.triggerRules
      : normalizeTriggerRules(triggerRules, actionIds).map((rule) => ({
        ...rule,
        updatedAt: new Date().toISOString()
      }))
    const nextConfig = {
      defaultAction: nextDefaultAction,
      clickAction: nextClickAction,
      actions: current.actions.map((action) => ({ ...action })),
      triggerRules: nextTriggerRules
    }
    if (typeof saveLegacyAnimations === 'function') {
      const persistedConfig = normalizePersistedCreatorConfig(nextConfig)
      legacyConfigOverride = persistedConfig
      saveLegacyAnimations(persistedConfig)
      return reload()
    }
    if (petPackService?.updateActivePetPackManifest) {
      petPackService.updateActivePetPackManifest(normalizePersistedCreatorConfig(nextConfig))
      return reload()
    }
    memoryConfigOverride = normalizePersistedCreatorConfig(nextConfig)
    cachedPetPack = null
    return nextConfig
  }

  const saveTriggerRules = (rules = []) => {
    return saveConfig({ triggerRules: rules })
  }

  const createTriggerRuleFromProposal = ({ actionId, triggerProposal = {}, label = '' } = {}) => {
    const current = getMutableConfig()
    const actionIds = new Set(current.actions.map((action) => action.id).filter(Boolean))
    const type = triggerProposal.type
    if (!TRIGGER_RULE_TYPES.has(type)) throw new Error('Only random, state, and event trigger proposals can create host rules')
    const rule = normalizeTriggerRule({
      type,
      actionId,
      label: label || `${type} trigger for ${actionId}`,
      enabled: false,
      source: 'creator-proposal',
      binding: triggerProposal.binding,
      state: triggerProposal.state,
      eventName: triggerProposal.eventName,
      intervalMs: triggerProposal.intervalMs,
      probability: triggerProposal.probability
    }, actionIds)
    return saveTriggerRules([...current.triggerRules, rule]).triggerRules.find((item) => item.id === rule.id) || rule
  }

  return { getPetPack, getConfig, getPreviewConfig, listActions, getAction, reload, validateCreatorActionMutation, applyCreatorActionMutation, saveConfig, saveTriggerRules, createTriggerRuleFromProposal }
}

module.exports = { createActionService }
