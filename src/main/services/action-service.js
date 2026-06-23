const { getLegacyPetAnimations, loadLegacyPetPack } = require('../pet-pack/loader')
const path = require('path')
const { pathToFileURL } = require('url')

const SAFE_ACTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const SAFE_RELATIVE_SPRITE_PATTERN = /^[^/\\\0][^\\\0]*$/

const emptyConfig = {
  defaultAction: '',
  clickAction: '',
  actions: [],
  triggerProposalInbox: []
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
  triggerProposalInbox: Array.isArray(config.triggerProposalInbox)
    ? config.triggerProposalInbox.map(normalizeTriggerProposalInboxItem)
    : []
})

const TRIGGER_PROPOSAL_TYPES = new Set(['manual', 'click', 'random', 'state', 'event', 'unbound'])
const HOST_RULE_REQUIRED_TYPES = new Set(['random', 'state', 'event'])
const MAX_TRIGGER_PROPOSAL_SOURCE_LENGTH = 160

const normalizeOptionalText = (value) => {
  if (typeof value !== 'string') return ''
  return value.slice(0, MAX_TRIGGER_PROPOSAL_SOURCE_LENGTH)
}

const normalizeTriggerProposalType = (value) => {
  const type = String(value || '')
  if (!TRIGGER_PROPOSAL_TYPES.has(type)) {
    throw new Error(`Unsupported trigger proposal type: ${type || 'unknown'}`)
  }
  return type
}

const normalizeTriggerProposalPayload = (proposal = {}) => {
  const actionId = normalizeActionId(proposal.actionId, 'trigger proposal action id')
  const type = normalizeTriggerProposalType(proposal.type)
  return {
    actionId,
    type,
    binding: type === 'click' ? String(proposal.binding || 'clickAction') : String(proposal.binding || ''),
    sourcePluginId: normalizeOptionalText(proposal.sourcePluginId),
    sourceRunId: normalizeOptionalText(proposal.sourceRunId),
    sourceCommandId: normalizeOptionalText(proposal.sourceCommandId),
    notes: normalizeOptionalText(proposal.notes)
  }
}

const normalizeTriggerProposalInboxItem = (item = {}) => ({
  id: normalizeOptionalText(item.id) || 'trigger-proposal',
  ...normalizeTriggerProposalPayload(item),
  status: ['pending', 'accepted', 'rejected'].includes(item.status) ? item.status : 'pending',
  submittedAt: typeof item.submittedAt === 'string' ? item.submittedAt : '',
  ...(typeof item.decidedAt === 'string' ? { decidedAt: item.decidedAt } : {}),
  ...(typeof item.decisionReason === 'string' ? { decisionReason: normalizeOptionalText(item.decisionReason) } : {}),
  ...(item.result && typeof item.result === 'object' ? { result: { ...item.result } } : {})
})

const createActionService = ({ petPackService, loadPetPack, loadLegacyAnimations = getLegacyPetAnimations, saveLegacyAnimations, projectRoot = path.join(__dirname, '..', '..', '..'), now = () => new Date().toISOString(), createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }) => {
  let cachedPetPack = null
  let legacyConfigOverride = null

  const getPetPack = () => {
    if (cachedPetPack) return cachedPetPack
    try {
      if (loadPetPack) {
        cachedPetPack = loadPetPack()
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
          getPetAnimations: () => legacyConfigOverride || loadLegacyAnimations()
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
      triggerProposalInbox: Array.isArray(config.triggerProposalInbox)
        ? config.triggerProposalInbox.map(normalizeTriggerProposalInboxItem)
        : []
    }
  }

  const getMutableConfig = () => {
    const petPack = getPetPack()
    const config = petPack.manifest || emptyConfig
    return {
      defaultAction: config.defaultAction || '',
      clickAction: config.clickAction || '',
      actions: Array.isArray(config.actions) ? config.actions.map((action) => ({ ...action })) : [],
      triggerProposalInbox: Array.isArray(config.triggerProposalInbox)
        ? config.triggerProposalInbox.map(normalizeTriggerProposalInboxItem)
        : []
    }
  }

  const persistMutableConfig = (nextConfig) => {
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
    return normalizePersistedCreatorConfig(nextConfig)
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
      triggerProposalInbox: current.triggerProposalInbox || []
    }
    return persistMutableConfig(nextConfig)
  }

  const createTriggerProposalAcceptance = (proposal) => {
    const baseResult = {
      ok: true,
      actionId: proposal.actionId,
      type: proposal.type,
      binding: proposal.binding,
      acceptedAt: now(),
      sourcePluginId: proposal.sourcePluginId,
      sourceRunId: proposal.sourceRunId,
      sourceCommandId: proposal.sourceCommandId
    }

    if (proposal.type === 'click') {
      const binding = proposal.binding || 'clickAction'
      if (binding !== 'clickAction') {
        throw new Error(`Unsupported click trigger binding: ${binding}`)
      }
      return {
        ...baseResult,
        applied: true,
        binding: 'clickAction',
        code: 'applied',
        message: `Click trigger now uses action: ${proposal.actionId}`
      }
    }

    if (proposal.type === 'manual' || proposal.type === 'unbound') {
      return {
        ...baseResult,
        applied: false,
        binding: '',
        code: 'no_binding_required',
        message: proposal.type === 'manual'
          ? `Manual action is available without changing trigger bindings: ${proposal.actionId}`
          : `Action remains imported without an automatic trigger: ${proposal.actionId}`
      }
    }

    if (HOST_RULE_REQUIRED_TYPES.has(proposal.type)) {
      return {
        ...baseResult,
        applied: false,
        binding: '',
        code: 'pending_host_rule',
        message: `Trigger type ${proposal.type} requires a host trigger-rule editor before it can be applied.`
      }
    }

    throw new Error(`Unsupported trigger proposal type: ${proposal.type}`)
  }

  const acceptTriggerProposal = (proposal = {}) => {
    const normalizedProposal = normalizeTriggerProposalPayload(proposal)
    const actionId = normalizedProposal.actionId
    if (!getMutableConfig().actions.some((action) => action.id === actionId)) {
      throw new Error(`Trigger proposal action does not exist: ${actionId}`)
    }
    const result = createTriggerProposalAcceptance(normalizedProposal)
    if (result.applied && result.type === 'click') {
      applyCreatorActionMutation({ clickAction: actionId, actions: [] })
    }
    return result
  }

  const submitTriggerProposal = (proposal = {}) => {
    const normalizedProposal = normalizeTriggerProposalPayload(proposal)
    if (!getMutableConfig().actions.some((action) => action.id === normalizedProposal.actionId)) {
      throw new Error(`Trigger proposal action does not exist: ${normalizedProposal.actionId}`)
    }
    const current = getMutableConfig()
    const submittedAt = now()
    const item = {
      id: `trigger-proposal-${createId()}`,
      ...normalizedProposal,
      status: 'pending',
      submittedAt
    }
    const nextConfig = {
      ...current,
      triggerProposalInbox: [item, ...(current.triggerProposalInbox || [])]
    }
    const animations = persistMutableConfig(nextConfig)
    return { proposal: item, animations }
  }

  const updateTriggerProposalItem = ({ proposalId, patch }) => {
    const current = getMutableConfig()
    const index = (current.triggerProposalInbox || []).findIndex((item) => item.id === proposalId)
    if (index === -1) throw new Error(`Trigger proposal is not pending: ${proposalId}`)
    const existing = current.triggerProposalInbox[index]
    if (existing.status !== 'pending') throw new Error(`Trigger proposal is already ${existing.status}: ${proposalId}`)
    const nextItem = normalizeTriggerProposalInboxItem({ ...existing, ...patch })
    const nextInbox = current.triggerProposalInbox.map((item, itemIndex) => itemIndex === index ? nextItem : item)
    const animations = persistMutableConfig({ ...current, triggerProposalInbox: nextInbox })
    return { proposal: nextItem, animations }
  }

  const acceptTriggerProposalItem = (proposalId) => {
    const current = getMutableConfig()
    const item = (current.triggerProposalInbox || []).find((candidate) => candidate.id === proposalId)
    if (!item) throw new Error(`Trigger proposal is not pending: ${proposalId}`)
    if (item.status !== 'pending') throw new Error(`Trigger proposal is already ${item.status}: ${proposalId}`)
    if (!current.actions.some((action) => action.id === item.actionId)) {
      throw new Error(`Trigger proposal action does not exist: ${item.actionId}`)
    }
    const result = createTriggerProposalAcceptance(item)
    const decidedAt = result.acceptedAt || now()
    const nextItem = normalizeTriggerProposalInboxItem({ ...item, status: 'accepted', decidedAt, result })
    const nextInbox = current.triggerProposalInbox.map((candidate) => candidate.id === proposalId ? nextItem : candidate)
    const animations = persistMutableConfig({
      ...current,
      ...(result.applied && result.type === 'click' ? { clickAction: item.actionId } : {}),
      triggerProposalInbox: nextInbox
    })
    return { proposal: nextItem, animations, triggerProposal: result }
  }

  const rejectTriggerProposalItem = (proposalId, reason = '') => updateTriggerProposalItem({
    proposalId,
    patch: {
      status: 'rejected',
      decidedAt: now(),
      decisionReason: normalizeOptionalText(reason)
    }
  })

  return { getPetPack, getConfig, getPreviewConfig, listActions, getAction, reload, validateCreatorActionMutation, applyCreatorActionMutation, acceptTriggerProposal, submitTriggerProposal, acceptTriggerProposalItem, rejectTriggerProposalItem }
}

module.exports = { createActionService }
