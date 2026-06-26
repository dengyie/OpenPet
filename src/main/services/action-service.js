const { getLegacyPetAnimations, loadLegacyPetPack } = require('../pet-pack/loader')
const path = require('path')
const { pathToFileURL } = require('url')

const SAFE_ACTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const SAFE_RELATIVE_SPRITE_PATTERN = /^[^/\\\0][^\\\0]*$/

const emptyConfig = {
  defaultAction: '',
  clickAction: '',
  actions: [],
  triggerProposalInbox: [],
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
  triggerRules: Array.isArray(config.triggerRules) ? config.triggerRules.map((rule) => ({ ...rule, condition: { ...(rule?.condition || {}) } })) : [],
  triggerProposalInbox: Array.isArray(config.triggerProposalInbox)
    ? config.triggerProposalInbox.map(normalizeTriggerProposalInboxItem)
    : []
})

const TRIGGER_PROPOSAL_TYPES = new Set(['manual', 'click', 'random', 'state', 'event', 'unbound'])
const HOST_RULE_REQUIRED_TYPES = new Set(['random', 'state', 'event'])
const TRIGGER_PROPOSAL_STATUSES = new Set(['pending', 'accepted', 'rejected', 'applied', 'pending-host-rule'])
const SAFE_TRIGGER_PROPOSAL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/
const MAX_TRIGGER_PROPOSAL_SOURCE_LENGTH = 160
const TRIGGER_RULE_TYPES = new Set(['random', 'state', 'event'])

const normalizeOptionalText = (value) => {
  if (typeof value !== 'string') return ''
  return value.slice(0, MAX_TRIGGER_PROPOSAL_SOURCE_LENGTH)
}

const normalizeTriggerProposalId = (value, fieldName = 'trigger proposal id') => {
  if (typeof value !== 'string' || !SAFE_TRIGGER_PROPOSAL_ID_PATTERN.test(value)) {
    throw new Error(`Creator ${fieldName} must be a safe id`)
  }
  return value
}

const normalizeTriggerProposalInboxItem = (item = {}) => {
  const actionId = typeof item.actionId === 'string' ? item.actionId : ''
  const type = typeof item.type === 'string' && TRIGGER_PROPOSAL_TYPES.has(item.type) ? item.type : 'unbound'
  const status = typeof item.status === 'string' && TRIGGER_PROPOSAL_STATUSES.has(item.status) ? item.status : 'pending'
  return {
    id: normalizeOptionalText(item.id || `${type}:${actionId}`),
    actionId: normalizeOptionalText(actionId),
    type,
    binding: normalizeOptionalText(item.binding),
    sourcePluginId: normalizeOptionalText(item.sourcePluginId),
    sourceRunId: normalizeOptionalText(item.sourceRunId),
    sourceCommandId: normalizeOptionalText(item.sourceCommandId),
    message: normalizeOptionalText(item.message),
    status,
    resultCode: normalizeOptionalText(item.resultCode),
    resultMessage: normalizeOptionalText(item.resultMessage),
    rejectionReason: normalizeOptionalText(item.rejectionReason),
    createdAt: normalizeOptionalText(item.createdAt),
    updatedAt: normalizeOptionalText(item.updatedAt),
    acceptedAt: normalizeOptionalText(item.acceptedAt),
    rejectedAt: normalizeOptionalText(item.rejectedAt)
  }
}

const normalizeTriggerRuleCondition = (type, condition = {}) => {
  if (type === 'random') {
    const probability = Number(condition.probability)
    return {
      probability: Number.isFinite(probability) && probability > 0 && probability <= 1 ? probability : 0.15
    }
  }
  if (type === 'state') {
    const stateKey = normalizeOptionalText(condition.stateKey || 'posture')
    const equals = normalizeOptionalText(condition.equals || 'resting')
    return { stateKey: stateKey || 'posture', equals: equals || 'resting' }
  }
  if (type === 'event') {
    const eventName = normalizeOptionalText(condition.eventName || 'pet.greeting.completed')
    return { eventName: eventName || 'pet.greeting.completed' }
  }
  return {}
}

const createTriggerRulePreviewSummary = (rule) => {
  if (rule.type === 'random') {
    return `Randomly play ${rule.actionId} at ${(Number(rule.condition?.probability || 0) * 100).toFixed(0)}% probability.`
  }
  if (rule.type === 'state') {
    return `When ${rule.condition?.stateKey || 'state'} is ${rule.condition?.equals || 'active'}, play ${rule.actionId}.`
  }
  if (rule.type === 'event') {
    return `When event ${rule.condition?.eventName || 'event'} fires, play ${rule.actionId}.`
  }
  return `Preview trigger rule for action: ${rule.actionId}`
}

const areTriggerRuleConditionsEqual = (type, left = {}, right = {}) => {
  const normalizedLeft = normalizeTriggerRuleCondition(type, left)
  const normalizedRight = normalizeTriggerRuleCondition(type, right)
  if (type === 'random') {
    return normalizedLeft.probability === normalizedRight.probability
  }
  if (type === 'state') {
    return normalizedLeft.stateKey === normalizedRight.stateKey
      && normalizedLeft.equals === normalizedRight.equals
  }
  if (type === 'event') {
    return normalizedLeft.eventName === normalizedRight.eventName
  }
  return false
}

const normalizeTriggerRule = (rule = {}) => {
  const type = String(rule.type || '')
  if (!TRIGGER_RULE_TYPES.has(type)) {
    throw new Error(`Unsupported trigger rule type: ${type || 'unknown'}`)
  }
  const actionId = normalizeActionId(rule.actionId, 'trigger rule action id')
  return {
    id: normalizeTriggerProposalId(rule.id || `rule:${type}:${actionId}`),
    type,
    actionId,
    enabled: rule.enabled !== false,
    condition: normalizeTriggerRuleCondition(type, rule.condition)
  }
}

const createActionService = ({ petPackService, loadPetPack, loadLegacyAnimations = getLegacyPetAnimations, saveLegacyAnimations, projectRoot = path.join(__dirname, '..', '..', '..'), now = () => new Date().toISOString() }) => {
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
      triggerRules: Array.isArray(config.triggerRules)
        ? config.triggerRules.map((rule) => normalizeTriggerRule(rule))
        : [],
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
      triggerRules: Array.isArray(config.triggerRules)
        ? config.triggerRules.map((rule) => normalizeTriggerRule(rule))
        : [],
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
      triggerRules: current.triggerRules || [],
      triggerProposalInbox: current.triggerProposalInbox || []
    }
    return persistMutableConfig(nextConfig)
  }

  const buildHostTriggerRule = (proposal = {}, current) => {
    const type = String(proposal.type || '')
    if (!TRIGGER_RULE_TYPES.has(type)) {
      throw new Error(`Unsupported trigger rule type: ${type || 'unknown'}`)
    }
    const actionId = normalizeActionId(proposal.actionId, 'trigger proposal action id')
    if (!current.actions.some((action) => action.id === actionId)) {
      throw new Error(`Trigger proposal action does not exist: ${actionId}`)
    }
    const binding = String(proposal.binding || '')
    if (type === 'state' && binding && binding !== 'stateRule') {
      throw new Error(`Unsupported state trigger binding: ${binding}`)
    }
    if (type === 'event' && binding && binding !== 'eventRule') {
      throw new Error(`Unsupported event trigger binding: ${binding}`)
    }
    if (type === 'random' && binding && binding !== 'randomRule') {
      throw new Error(`Unsupported random trigger binding: ${binding}`)
    }
    const existingRules = Array.isArray(current.triggerRules) ? current.triggerRules.map(normalizeTriggerRule) : []
    const duplicateRule = existingRules.find((rule) => (
      rule.type === type
      && rule.actionId === actionId
      && areTriggerRuleConditionsEqual(type, rule.condition, proposal.condition)
    ))
    if (duplicateRule) {
      return {
        rule: duplicateRule,
        summary: createTriggerRulePreviewSummary(duplicateRule),
        duplicate: true
      }
    }
    const sameTypeRules = existingRules.filter((rule) => rule.type === type && rule.actionId === actionId)
    const nextId = sameTypeRules.length === 0
      ? `rule:${type}:${actionId}`
      : `rule:${type}:${actionId}:${sameTypeRules.length + 1}`
    const rule = normalizeTriggerRule({
      id: nextId,
      type,
      actionId,
      enabled: true,
      condition: normalizeTriggerRuleCondition(type, proposal.condition)
    })
    return {
      rule,
      summary: createTriggerRulePreviewSummary(rule)
    }
  }

  const previewTriggerProposal = (proposal = {}) => {
    const current = getMutableConfig()
    const type = String(proposal.type || '')
    if (type === 'click' || type === 'manual' || type === 'unbound') {
      return acceptTriggerProposal(proposal)
    }
    const preview = buildHostTriggerRule(proposal, current)
    return {
      ok: true,
      applied: false,
      actionId: preview.rule.actionId,
      type: preview.rule.type,
      binding: '',
      code: 'preview_ready',
      message: `Preview ready for ${preview.rule.type} trigger on action: ${preview.rule.actionId}`,
      acceptedAt: now(),
      preview
    }
  }

  const acceptTriggerProposal = (proposal = {}) => {
    const actionId = normalizeActionId(proposal.actionId, 'trigger proposal action id')
    const type = String(proposal.type || '')
    if (!TRIGGER_PROPOSAL_TYPES.has(type)) {
      throw new Error(`Unsupported trigger proposal type: ${type || 'unknown'}`)
    }
    if (!getMutableConfig().actions.some((action) => action.id === actionId)) {
      throw new Error(`Trigger proposal action does not exist: ${actionId}`)
    }

    const baseResult = {
      ok: true,
      actionId,
      type,
      binding: String(proposal.binding || ''),
      acceptedAt: now(),
      sourcePluginId: normalizeOptionalText(proposal.sourcePluginId),
      sourceRunId: normalizeOptionalText(proposal.sourceRunId),
      sourceCommandId: normalizeOptionalText(proposal.sourceCommandId)
    }

    if (type === 'click') {
      const binding = proposal.binding || 'clickAction'
      if (binding !== 'clickAction') {
        throw new Error(`Unsupported click trigger binding: ${binding}`)
      }
      applyCreatorActionMutation({ clickAction: actionId, actions: [] })
      return {
        ...baseResult,
        applied: true,
        binding: 'clickAction',
        code: 'applied',
        message: `Click trigger now uses action: ${actionId}`
      }
    }

    if (type === 'manual' || type === 'unbound') {
      return {
        ...baseResult,
        applied: false,
        binding: '',
        code: 'no_binding_required',
        message: type === 'manual'
          ? `Manual action is available without changing trigger bindings: ${actionId}`
          : `Action remains imported without an automatic trigger: ${actionId}`
      }
    }

    if (HOST_RULE_REQUIRED_TYPES.has(type)) {
      const current = getMutableConfig()
      const preview = buildHostTriggerRule(proposal, current)
      if (!preview.duplicate) {
        const nextRules = [...(current.triggerRules || []).map(normalizeTriggerRule), preview.rule]
        persistMutableConfig({
          ...current,
          triggerRules: nextRules
        })
      }
      return {
        ...baseResult,
        applied: false,
        binding: '',
        code: 'rule_saved',
        message: `${type === 'state' ? 'State' : type === 'event' ? 'Event' : 'Random'} trigger rule saved for action: ${actionId}`,
        preview
      }
    }

    throw new Error(`Unsupported trigger proposal type: ${type}`)
  }

  const createTriggerProposalId = (inbox, type, actionId) => {
    const createdAt = now().replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'now'
    const baseId = `proposal:${type}:${actionId}:${createdAt}`
    const usedIds = new Set(inbox.map((item) => item.id))
    if (!usedIds.has(baseId)) return baseId
    let index = 2
    while (usedIds.has(`${baseId}:${index}`)) index += 1
    return `${baseId}:${index}`
  }

  const buildSubmittedTriggerProposal = (payload = {}, current) => {
    const actionId = normalizeActionId(payload.actionId, 'trigger proposal action id')
    const type = String(payload.type || '')
    if (!TRIGGER_PROPOSAL_TYPES.has(type)) {
      throw new Error(`Unsupported trigger proposal type: ${type || 'unknown'}`)
    }
    if (!current.actions.some((action) => action.id === actionId)) {
      throw new Error(`Trigger proposal action does not exist: ${actionId}`)
    }
    const binding = type === 'click' ? (payload.binding || 'clickAction') : ''
    if (type === 'click' && binding !== 'clickAction') {
      throw new Error(`Unsupported click trigger binding: ${binding}`)
    }
    const id = payload.id
      ? normalizeTriggerProposalId(payload.id)
      : createTriggerProposalId(current.triggerProposalInbox || [], type, actionId)
    if ((current.triggerProposalInbox || []).some((item) => item.id === id)) {
      throw new Error(`Trigger proposal id already exists: ${id}`)
    }
    return normalizeTriggerProposalInboxItem({
      id,
      actionId,
      type,
      binding,
      sourcePluginId: payload.sourcePluginId,
      sourceRunId: payload.sourceRunId,
      sourceCommandId: payload.sourceCommandId,
      message: payload.message || payload.notes,
      status: 'pending',
      createdAt: now(),
      updatedAt: now()
    })
  }

  const submitTriggerProposal = (payload = {}) => {
    const current = getMutableConfig()
    const proposal = buildSubmittedTriggerProposal(payload, current)
    const animations = persistMutableConfig({
      ...current,
      triggerRules: current.triggerRules || [],
      triggerProposalInbox: [...current.triggerProposalInbox, proposal]
    })
    return { proposal, animations }
  }

  const findTriggerProposalItem = (proposalId, status = 'pending') => {
    const id = normalizeTriggerProposalId(proposalId)
    const current = getMutableConfig()
    const index = current.triggerProposalInbox.findIndex((item) => item.id === id)
    if (index < 0) throw new Error(`Trigger proposal does not exist: ${id}`)
    const proposal = current.triggerProposalInbox[index]
    if (status && proposal.status !== status) {
      throw new Error(`Trigger proposal is not ${status}: ${id}`)
    }
    return { current, index, proposal }
  }

  const acceptTriggerProposalItem = (proposalId) => {
    const { proposal } = findTriggerProposalItem(proposalId)
    const triggerProposal = acceptTriggerProposal({
      actionId: proposal.actionId,
      type: proposal.type,
      binding: proposal.binding,
      sourcePluginId: proposal.sourcePluginId,
      sourceRunId: proposal.sourceRunId,
      sourceCommandId: proposal.sourceCommandId,
      notes: proposal.message
    })
    const nextCurrent = getMutableConfig()
    const nextIndex = nextCurrent.triggerProposalInbox.findIndex((item) => item.id === proposal.id)
    if (nextIndex < 0) throw new Error(`Trigger proposal does not exist: ${proposal.id}`)
    const status = triggerProposal.applied
      ? 'applied'
      : (triggerProposal.code === 'pending_host_rule' ? 'pending-host-rule' : 'accepted')
    const nextProposal = normalizeTriggerProposalInboxItem({
      ...nextCurrent.triggerProposalInbox[nextIndex],
      status,
      resultCode: triggerProposal.code,
      resultMessage: triggerProposal.message,
      acceptedAt: triggerProposal.acceptedAt,
      updatedAt: triggerProposal.acceptedAt
    })
    const nextInbox = nextCurrent.triggerProposalInbox.map((item, itemIndex) => (
      itemIndex === nextIndex ? nextProposal : item
    ))
    const animations = persistMutableConfig({
      ...nextCurrent,
      triggerProposalInbox: nextInbox
    })
    return { proposal: nextProposal, triggerProposal, animations }
  }

  const rejectTriggerProposalItem = (proposalId, reason = '') => {
    const { current, index, proposal } = findTriggerProposalItem(proposalId)
    const rejectedAt = now()
    const nextProposal = normalizeTriggerProposalInboxItem({
      ...proposal,
      status: 'rejected',
      rejectionReason: reason,
      rejectedAt,
      updatedAt: rejectedAt
    })
    const nextInbox = current.triggerProposalInbox.map((item, itemIndex) => (
      itemIndex === index ? nextProposal : item
    ))
    const animations = persistMutableConfig({
      ...current,
      triggerProposalInbox: nextInbox
    })
    return { proposal: nextProposal, animations }
  }

  const removeTriggerRule = (ruleId) => {
    const id = normalizeTriggerProposalId(ruleId, 'trigger rule id')
    const current = getMutableConfig()
    const nextRules = (current.triggerRules || []).map(normalizeTriggerRule).filter((rule) => rule.id !== id)
    if (nextRules.length === (current.triggerRules || []).length) {
      throw new Error(`Trigger rule does not exist: ${id}`)
    }
    return persistMutableConfig({
      ...current,
      triggerRules: nextRules
    })
  }

  const setTriggerRuleEnabled = (ruleId, enabled) => {
    const id = normalizeTriggerProposalId(ruleId, 'trigger rule id')
    const current = getMutableConfig()
    let found = false
    const nextRules = (current.triggerRules || []).map((rule) => {
      const normalized = normalizeTriggerRule(rule)
      if (normalized.id !== id) return normalized
      found = true
      return {
        ...normalized,
        enabled: Boolean(enabled)
      }
    })
    if (!found) {
      throw new Error(`Trigger rule does not exist: ${id}`)
    }
    return persistMutableConfig({
      ...current,
      triggerRules: nextRules
    })
  }

  return {
    getPetPack,
    getConfig,
    getPreviewConfig,
    listActions,
    getAction,
    reload,
    validateCreatorActionMutation,
    applyCreatorActionMutation,
    acceptTriggerProposal,
    previewTriggerProposal,
    submitTriggerProposal,
    acceptTriggerProposalItem,
    rejectTriggerProposalItem,
    removeTriggerRule,
    setTriggerRuleEnabled
  }
}

module.exports = { createActionService }
