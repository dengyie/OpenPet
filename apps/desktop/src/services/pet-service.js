const PET_SAY = 'pet:say'
const PET_ACTION = 'pet:action'
const PET_EVENT = 'pet:event'
const { createCompanionIntentBroker } = require('./companion-intent-broker-service')
const { STATUSES } = require('./companion-intent-policy')

const createPetRequestId = () => `pet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const normalizeText = (value) => String(value || '').trim()

const normalizeSourceSurface = ({ sourceSurface, source }) => {
  const normalizedSurface = normalizeText(sourceSurface).slice(0, 120)
  if (normalizedSurface) return normalizedSurface
  return normalizeText(source).slice(0, 120)
}

const createPetIntentDispatcher = ({ eventBus, now = Date.now, resolveAttentionPresentation = () => null } = {}) => (intent, decision = {}) => {
  if (intent.lane === 'dialogue') {
    eventBus?.emit(PET_SAY, intent.payload)
    return
  }
  if (intent.lane === 'action') {
    eventBus?.emit(PET_ACTION, intent.payload)
    return
  }
  if (intent.lane === 'attention') {
    const status = decision.selectedStatus || intent.status || 'idle'
    const presentation = resolveAttentionPresentation(status)
    if (presentation?.actionId) {
      eventBus?.emit(PET_ACTION, {
        actionId: presentation.actionId,
        expression: presentation.expression,
        presentationStatus: status,
        source: 'attention:agent-awareness',
        sessionKey: intent.sessionKey
      })
    }
    eventBus?.emit(PET_EVENT, {
      type: `agent:${status}`,
      message: typeof intent.payload?.message === 'string' ? intent.payload.message : '',
      ttlMs: Math.max(0, Number(decision.selectedExpiresAt || 0) - now()),
      source: 'agent-awareness'
    })
    return
  }
  eventBus?.emit(PET_EVENT, intent.payload)
}

const createPetService = ({
  eventBus,
  settingsService,
  actionService,
  appLogService = null,
  requestIdFactory = createPetRequestId,
  now = Date.now,
  companionIntentBroker: injectedBroker = null,
  createCompanionIntentBroker: brokerFactory = createCompanionIntentBroker,
  companionAudioLeaseService = null
}) => {
  const attentionSequences = new Map()
  const companionIntentBroker = injectedBroker || brokerFactory({
    now,
    dispatch: createPetIntentDispatcher({
      eventBus,
      now,
      resolveAttentionPresentation: (status) => actionService.resolvePresentation?.(status)
    })
  })

  const getSnapshot = () => ({
    settings: settingsService.get(),
    actions: actionService.getConfig()
  })

  const recordLog = (entry) => {
    try {
      appLogService?.record?.({
        actor: 'system',
        scope: 'pet',
        ...entry
      })
    } catch (_) {
      // Pet diagnostics must never break runtime mutations.
    }
  }

  const getAnimations = () => actionService.getConfig()

  const getPreviewAnimations = () => actionService.getPreviewConfig?.() || actionService.getConfig()

  const reloadAnimations = () => actionService.reload?.() || actionService.getConfig()

  const getSettings = () => settingsService.get()

  const saveSettings = (settings) => settingsService.save(settings)

  const applySettings = (settings) => settingsService.applyInMemory(settings)

  // 原子读改写：updater 在保存时刻拿到最新快照，避免并发写互相覆盖。
  const updateSettings = (updater) => settingsService.update(updater)

  const previewSettings = (settings) => settingsService.preview(settings)

  const getAction = (actionId) => actionService.getAction(actionId)

  const say = ({ text, ttlMs, source, requestId, sourceSurface } = {}) => {
    const normalizedRequestId = normalizeText(requestId).slice(0, 120) || requestIdFactory()
    const payload = {
      text: String(text || ''),
      ttlMs,
      source,
      sourceSurface: normalizeSourceSurface({ sourceSurface, source }),
      requestId: normalizedRequestId
    }
    recordLog({
      level: 'info',
      event: 'pet.say.ingress',
      message: 'Pet say ingress received',
      details: {
        requestId: normalizedRequestId,
        source: normalizeText(source).slice(0, 120),
        sourceSurface: payload.sourceSurface,
        textChars: payload.text.length,
        hasTtl: Number.isFinite(Number(ttlMs)),
        ttlMs: Number.isFinite(Number(ttlMs)) ? Number(ttlMs) : 0
      }
    })
    companionIntentBroker.submit({
      lane: 'dialogue',
      source: normalizeText(source).slice(0, 120) || 'pet-service',
      sourceSurface: payload.sourceSurface,
      requestId: normalizedRequestId,
      ttlMs,
      payload
    })
    return payload
  }

  const onSay = (listener) => eventBus?.on(PET_SAY, listener)

  const playAction = ({ actionId, source } = {}) => {
    const requestedAction = actionService.getAction(actionId)
    const fallbackAction = requestedAction ? null : actionService.getAction('idle')
    if (!requestedAction && !fallbackAction) throw new Error(`Unknown action: ${actionId}`)
    const payload = requestedAction
      ? { actionId, source }
      : { actionId: 'idle', requestedActionId: actionId, fallback: true, source }
    const actionType = ['manual', 'click', 'user'].includes(normalizeText(source).toLowerCase())
      ? normalizeText(source).toLowerCase()
      : 'autonomous'
    companionIntentBroker.submit({
      lane: 'action',
      source: normalizeText(source).slice(0, 120) || 'pet-service',
      sourceSurface: 'pet-action',
      type: actionType,
      dedupeKey: actionType === 'autonomous' ? normalizeText(actionId).slice(0, 128) : '',
      payload,
      ttlMs: 12000
    })
    return payload
  }

  const setEvent = ({ type, message, ttlMs, source, eventId } = {}) => {
    const payload = { type, message, ttlMs, source }
    companionIntentBroker.submit({
      lane: 'notice',
      source: normalizeText(source).slice(0, 120) || 'pet-service',
      sourceSurface: normalizeSourceSurface({ source }),
      type,
      dedupeKey: normalizeText(eventId).slice(0, 128),
      ttlMs,
      payload
    })
    return payload
  }

  const submitAttentionState = ({ sessionKey, status, eventId, ttlMs, activeTurn = undefined } = {}) => {
    const normalizedSessionKey = normalizeText(sessionKey).slice(0, 64)
    const normalizedStatus = normalizeText(status).toLowerCase()
    if (!/^[a-f0-9]{12}$/.test(normalizedSessionKey)) throw new TypeError('Agent attention sessionKey must be a pseudonymous 12 character hash')
    if (!STATUSES.includes(normalizedStatus)) throw new TypeError('Agent attention status is unsupported')
    const sequence = (attentionSequences.get(normalizedSessionKey) || 0) + 1
    attentionSequences.set(normalizedSessionKey, sequence)
    if (attentionSequences.size > 40) attentionSequences.delete(attentionSequences.keys().next().value)
    return companionIntentBroker.submit({
      lane: 'attention',
      source: 'agent-awareness',
      sourceSurface: 'agent-awareness',
      sessionKey: normalizedSessionKey,
      sourceSequence: sequence,
      status: normalizedStatus,
      dedupeKey: normalizeText(eventId).slice(0, 128),
      ttlMs,
      payload: {
        ...(typeof activeTurn === 'boolean' ? { activeTurn } : {})
      }
    })
  }

  const getCompanionSnapshot = () => ({
    ...companionIntentBroker.getSnapshot(),
    audioLease: companionAudioLeaseService?.getSnapshot?.() || {
      active: false,
      ownerId: '',
      role: '',
      source: '',
      clipId: '',
      signalId: '',
      expiresAt: 0
    }
  })
  const setFocusedSession = (sessionKey) => companionIntentBroker.setFocusedSession(sessionKey)
  const clearIntentSource = (source) => companionIntentBroker.clearSource(source)
  const dispose = () => {
    companionIntentBroker.dispose()
    companionAudioLeaseService?.dispose?.()
  }

  const onAction = (listener) => eventBus?.on(PET_ACTION, listener)

  const onEvent = (listener) => eventBus?.on(PET_EVENT, listener)

  return {
    getSnapshot,
    getAnimations,
    getPreviewAnimations,
    reloadAnimations,
    getSettings,
    saveSettings,
    applySettings,
    updateSettings,
    previewSettings,
    getAction,
    say,
    onSay,
    playAction,
    onAction,
    setEvent,
    onEvent,
    submitAttentionState,
    setFocusedSession,
    getCompanionSnapshot,
    clearIntentSource,
    requestAudioLease: (payload) => companionAudioLeaseService?.request?.(payload) || { granted: false, reason: 'unavailable' },
    releaseAudioLease: (payload) => companionAudioLeaseService?.release?.(payload) || { released: false, reason: 'unavailable' },
    heartbeatAudioLease: (payload) => companionAudioLeaseService?.heartbeat?.(payload) || { renewed: false, reason: 'unavailable' },
    dispose
  }
}

module.exports = { PET_SAY, PET_ACTION, PET_EVENT, createPetIntentDispatcher, createPetRequestId, createPetService }
