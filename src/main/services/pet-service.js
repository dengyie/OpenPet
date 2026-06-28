const PET_SAY = 'pet:say'
const PET_ACTION = 'pet:action'
const PET_EVENT = 'pet:event'

const createPetRequestId = () => `pet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const normalizeText = (value) => String(value || '').trim()

const normalizeSourceSurface = ({ sourceSurface, source }) => {
  const normalizedSurface = normalizeText(sourceSurface).slice(0, 120)
  if (normalizedSurface) return normalizedSurface
  return normalizeText(source).slice(0, 120)
}

const createPetService = ({ eventBus, settingsService, actionService, appLogService = null, requestIdFactory = createPetRequestId }) => {
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
    eventBus?.emit(PET_SAY, payload)
    return payload
  }

  const onSay = (listener) => eventBus?.on(PET_SAY, listener)

  const playAction = ({ actionId, source } = {}) => {
    if (!actionService.getAction(actionId)) throw new Error(`Unknown action: ${actionId}`)
    const payload = { actionId, source }
    eventBus?.emit(PET_ACTION, payload)
    return payload
  }

  const setEvent = ({ type, message, ttlMs, source } = {}) => {
    const payload = { type, message, ttlMs, source }
    eventBus?.emit(PET_EVENT, payload)
    return payload
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
    previewSettings,
    getAction,
    say,
    onSay,
    playAction,
    onAction,
    setEvent,
    onEvent
  }
}

module.exports = { PET_SAY, PET_ACTION, PET_EVENT, createPetRequestId, createPetService }
