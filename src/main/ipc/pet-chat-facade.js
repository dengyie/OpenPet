const { createPetBubbleChatCoordinator } = require('./pet-bubble-chat-coordinator')
const { createPetUtteranceRecorder } = require('./pet-utterance-recorder')
const {
  createEmptyPetBubble,
  createPetChatStateController,
  normalizeMessageText,
  normalizePetBubble,
  sanitizeChatMessages,
  sanitizeDiagnosticText
} = require('./pet-chat-state')

const createPetChatFacade = ({
  getPetWindow,
  browserWindowService,
  petPackService,
  aiService,
  aiTalkService = null,
  petUtteranceLogService = null,
  petChatWindowService = null,
  petBubbleChatWindowService = null,
  recordAppLog,
  onActivePetPackChanged
}) => {
  let lastPetBubble = createEmptyPetBubble()

  const safeRecordAppLog = (entry) => {
    try {
      recordAppLog?.(entry)
    } catch (_) {
      // Logging must never break the product flow that triggered it.
    }
  }

  const getLastBubble = () => lastPetBubble
  const stateController = createPetChatStateController({
    petPackService,
    aiService,
    aiTalkService,
    petChatWindowService,
    petBubbleChatWindowService,
    getLastBubble,
    recordAppLog
  })
  const getActivePetPackId = stateController.getActivePetPackId
  const getState = stateController.getState
  const { recordPetUtterance } = createPetUtteranceRecorder({
    petUtteranceLogService,
    getActivePetPackId,
    recordAppLog
  })
  const bubbleChatCoordinator = createPetBubbleChatCoordinator({
    petBubbleChatWindowService,
    getActivePetPackId,
    getConversationMessages: stateController.getConversationMessages,
    recordAppLog
  })
  const refreshBubbleChatItems = bubbleChatCoordinator.refreshBubbleChatItems

  const notifyStateChanged = (state = getState()) => {
    petChatWindowService?.sendStateChanged?.(state)
  }

  const refreshPetPackScopedChatState = ({ reason = 'pet-pack-changed' } = {}) => {
    refreshBubbleChatItems({ reason })
    const state = getState()
    notifyStateChanged(state)
    return state
  }

  const broadcastActivePetPackChanged = ({ source = 'pet-pack-change', payload = null } = {}) => {
    const listedPetPacks = petPackService?.listPacks?.() || { activePackId: '', packs: [] }
    const nextPetPacks = payload?.petPacks || listedPetPacks
    const activePackPayload = {
      ...(payload || {}),
      activePackId: payload?.activePackId || nextPetPacks?.activePackId || '',
      petPacks: nextPetPacks
    }
    const petChatState = refreshPetPackScopedChatState({ reason: `active-pet-pack-changed:${source}` })
    const eventPayload = { ...activePackPayload, petChatState }
    onActivePetPackChanged?.(eventPayload)
    return eventPayload
  }

  const captureBubble = (payload = {}, { notify = true } = {}) => {
    const bubble = normalizePetBubble(payload)
    if (!bubble) return lastPetBubble
    lastPetBubble = bubble
    if (notify) notifyStateChanged()
    return lastPetBubble
  }

  const attachState = (response = {}, bubble = lastPetBubble) => {
    const state = getState()
    notifyStateChanged(state)
    return { ...response, bubble, state }
  }

  const handlePetSay = (payload = {}) => {
    if (payload?.source !== 'ai') {
      recordPetUtterance(payload)
    }
    captureBubble(payload)
    safeRecordAppLog({
      scope: 'pet',
      level: 'info',
      actor: 'system',
      event: 'pet.say.forwarded',
      message: 'Pet say forwarded to bubble surfaces',
      details: {
        requestId: typeof payload?.requestId === 'string' ? payload.requestId.slice(0, 120) : '',
        source: sanitizeDiagnosticText(payload?.source || ''),
        sourceSurface: sanitizeDiagnosticText(payload?.sourceSurface || payload?.source || ''),
        textChars: typeof payload?.text === 'string' ? payload.text.length : 0
      }
    })
    petBubbleChatWindowService?.showMessage?.({
      ...payload,
      kind: 'dialogue',
      role: 'pet',
      petPackId: getActivePetPackId()
    })
    if (payload?.source === 'ai') refreshBubbleChatItems({ reason: 'pet-say' })
  }

  const handlePetEvent = (payload = {}) => {
    if (!payload?.message) return
    const bubble = { text: payload.message, ttlMs: payload.ttlMs, source: payload.source }
    recordPetUtterance(bubble)
    captureBubble(bubble)
    petBubbleChatWindowService?.showMessage?.({
      ...bubble,
      kind: 'dialogue',
      role: 'pet',
      petPackId: getActivePetPackId()
    })
    refreshBubbleChatItems({ reason: 'pet-event' })
  }

  return {
    attachState,
    broadcastActivePetPackChanged,
    captureBubble,
    getActivePetPackId,
    getBubbleChatState: bubbleChatCoordinator.getBubbleChatState,
    getLastBubble,
    getState,
    handlePetEvent,
    handlePetSay,
    hideBubbleChat: bubbleChatCoordinator.hideBubbleChat,
    notifyStateChanged,
    openBubbleChat: bubbleChatCoordinator.openBubbleChat,
    dragBubbleChatWindowTo: bubbleChatCoordinator.dragBubbleChatWindowTo,
    recordPetUtterance,
    refreshBubbleChatItems,
    refreshPetPackScopedChatState,
    setBubbleChatHitTestMode: bubbleChatCoordinator.setBubbleChatHitTestMode,
    setBubbleChatInteracting: bubbleChatCoordinator.setBubbleChatInteracting,
    setBubbleChatPinned: bubbleChatCoordinator.setBubbleChatPinned,
    showLocalBubbleChatMessage: bubbleChatCoordinator.showLocalBubbleChatMessage,
    syncBubbleChatToPetWindow: bubbleChatCoordinator.syncBubbleChatToPetWindow
  }
}

module.exports = {
  createPetChatFacade,
  createEmptyPetBubble,
  normalizePetBubble,
  sanitizeChatMessages
}
