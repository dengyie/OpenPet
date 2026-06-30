const { IPC } = require('../../shared/ipc-channels')

const MAX_PET_CHAT_MESSAGES = 100

const sanitizeDiagnosticText = (value) => String(value || '')
  .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-secret]')
  .slice(0, 240)

const normalizeMessageText = (value) => String(value || '').trim().replace(/\s+/g, ' ')

const createEmptyPetBubble = () => ({
  text: '',
  source: '',
  ttlMs: 0,
  updatedAt: ''
})

const normalizePetBubble = (payload = {}) => {
  const text = normalizeMessageText(payload?.text)
  if (!text) return null
  return {
    text,
    source: sanitizeDiagnosticText(payload?.source || ''),
    ttlMs: Number.isFinite(Number(payload?.ttlMs)) ? Number(payload.ttlMs) : 0,
    updatedAt: new Date().toISOString()
  }
}

const sanitizeChatMessages = (messages = []) => (
  (Array.isArray(messages) ? messages : [])
    .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string')
    .slice(-MAX_PET_CHAT_MESSAGES)
    .map((message) => ({
      id: typeof message.id === 'string' ? message.id : '',
      role: message.role,
      content: message.content,
      createdAt: typeof message.createdAt === 'string' ? message.createdAt : ''
    }))
)

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
  sendToControlCenterWindow
}) => {
  let lastPetBubble = createEmptyPetBubble()

  const safeRecordAppLog = (entry) => {
    try {
      recordAppLog?.(entry)
    } catch (_) {
      // Logging must never break the product flow that triggered it.
    }
  }

  const getActivePetPackId = () => {
    try {
      const manifest = petPackService?.getActivePetPack?.()?.manifest || {}
      return normalizeMessageText(manifest.id) || 'legacy-cat'
    } catch (_) {
      return 'legacy-cat'
    }
  }

  const getConversationMessages = (reason) => {
    try {
      return (aiTalkService || aiService)?.getConversation?.('') || []
    } catch (error) {
      safeRecordAppLog({
        scope: 'pet-bubble-chat',
        level: 'warn',
        actor: 'system',
        event: 'pet-bubble-chat.items.refresh-failed',
        message: 'Pet bubble chat items refresh failed',
        details: {
          reason,
          errorName: sanitizeDiagnosticText(error?.name || 'Error'),
          errorMessage: sanitizeDiagnosticText(error?.message)
        }
      })
      return []
    }
  }

  const recordPetUtterance = (payload = {}) => {
    if (!petUtteranceLogService?.record) return null
    try {
      return petUtteranceLogService.record({
        petPackId: getActivePetPackId(),
        text: payload.text || payload.message || '',
        source: payload.source || '',
        ttlMs: payload.ttlMs
      })
    } catch (error) {
      safeRecordAppLog({
        scope: 'pet-utterance',
        level: 'error',
        actor: 'system',
        event: 'pet-utterance.record.failed',
        message: 'Pet utterance recording failed',
        details: {
          errorName: sanitizeDiagnosticText(error?.name || 'Error'),
          errorMessage: sanitizeDiagnosticText(error?.message)
        }
      })
      return null
    }
  }

  const getState = () => {
    const windowState = petChatWindowService?.getState?.() || {}
    const bubbleChatState = petBubbleChatWindowService?.getState?.() || { visible: false, hasWindow: false }
    const config = aiService?.getConfig?.() || {}
    let profile = {}
    let messages = []
    let conversationId = ''
    try {
      profile = aiTalkService?.getPersonaProfile?.() || {}
    } catch (_) {
      profile = {}
    }
    try {
      messages = (aiTalkService || aiService)?.getConversation?.('') || []
    } catch (_) {
      messages = []
    }
    if (profile?.petPackId) {
      conversationId = `control-center:${profile.petPackId}:main`
    }
    const enabled = Boolean(config.enabled)
    const hasApiKey = Boolean(config.hasApiKey)
    const ready = enabled && hasApiKey
    return {
      available: Boolean(petChatWindowService),
      ...windowState,
      conversationId,
      petPack: {
        id: profile.petPackId || '',
        displayName: profile.petPackDisplayName || profile.petPackId || ''
      },
      ai: {
        enabled,
        hasApiKey,
        ready,
        provider: config.provider || '',
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        reason: ready
          ? ''
          : (enabled ? '请先在 Control Center 保存 AI API Key' : '请先在 Control Center 启用 AI Provider')
      },
      bubble: lastPetBubble,
      bubbleChat: {
        visible: Boolean(bubbleChatState.visible),
        hasWindow: Boolean(bubbleChatState.hasWindow),
        pinned: Boolean(bubbleChatState.pinned),
        placement: typeof bubbleChatState.placement === 'string' ? bubbleChatState.placement : ''
      },
      messages: sanitizeChatMessages(messages)
    }
  }

  const notifyStateChanged = (state = getState()) => {
    petChatWindowService?.sendStateChanged?.(state)
  }

  const notifyControlCenterActivePetPackChanged = (activePackId) => {
    const normalizedActivePackId = normalizeMessageText(activePackId)
    if (!normalizedActivePackId) return
    const settingsWindow = browserWindowService?.getAllWindows?.().find?.((candidate) => {
      try {
        return !candidate.isDestroyed?.() && candidate.webContents?.getURL?.().includes?.('control-center')
      } catch (_) {
        return false
      }
    })
    settingsWindow?.webContents?.send?.(IPC.PET_PACKS_ACTIVE_CHANGED, { activePackId: normalizedActivePackId })
  }

  const refreshBubbleChatItems = ({ reason = 'refresh' } = {}) => {
    const conversationMessages = getConversationMessages(reason)
    try {
      if (petBubbleChatWindowService?.rebuildItems) {
        return petBubbleChatWindowService.rebuildItems({ conversationMessages, noticeItems: [], reason })
      }
      if (!petBubbleChatWindowService?.refreshItems) return petBubbleChatWindowService?.getState?.() || null
      return petBubbleChatWindowService.refreshItems({ conversationMessages, reason })
    } catch (error) {
      safeRecordAppLog({
        scope: 'pet-bubble-chat',
        level: 'warn',
        actor: 'system',
        event: 'pet-bubble-chat.items.refresh-failed',
        message: 'Pet bubble chat items refresh failed',
        details: {
          reason,
          errorName: sanitizeDiagnosticText(error?.name || 'Error'),
          errorMessage: sanitizeDiagnosticText(error?.message)
        }
      })
      return petBubbleChatWindowService?.getState?.() || null
    }
  }

  const refreshPetPackScopedChatState = ({ reason = 'pet-pack-changed' } = {}) => {
    refreshBubbleChatItems({ reason })
    const state = getState()
    notifyStateChanged(state)
    return state
  }

  const notifyActivePetPackChanged = (event, payload = {}) => {
    const state = getState()
    event?.sender?.send?.(IPC.PET_PACKS_ACTIVE_CHANGED, {
      activePackId: payload.activePackId || state.petPack.id || '',
      pack: payload.pack || null,
      petChatState: state
    })
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
    notifyControlCenterActivePetPackChanged(activePackPayload.activePackId)
    sendToControlCenterWindow?.(getPetWindow, IPC.CONTROL_CENTER_ACTIVE_PET_PACK_CHANGED, activePackPayload)
    refreshPetPackScopedChatState({ reason: `active-pet-pack-changed:${source}` })
    return activePackPayload
  }

  const captureBubble = (payload = {}, { notify = true } = {}) => {
    const bubble = normalizePetBubble(payload)
    if (!bubble) return lastPetBubble
    lastPetBubble = bubble
    if (notify) notifyStateChanged()
    return lastPetBubble
  }

  const getLastBubble = () => lastPetBubble

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
      petPackId: getActivePetPackId()
    })
    refreshBubbleChatItems({ reason: 'pet-event' })
  }

  const getBubbleChatState = () => petBubbleChatWindowService?.getState?.() || { visible: false, hasWindow: false }

  const openBubbleChat = () => petBubbleChatWindowService?.open?.({ source: 'pet-renderer', focus: true }) || { visible: false, hasWindow: false }

  const showLocalBubbleChatMessage = (payload = {}) => {
    const text = normalizeMessageText(payload?.text)
    if (!text) return getBubbleChatState()
    const state = petBubbleChatWindowService?.showMessage?.({
      text,
      ttlMs: payload?.ttlMs,
      source: normalizeMessageText(payload?.source) || 'pet-renderer',
      petPackId: getActivePetPackId()
    }) || { visible: false, hasWindow: false }
    return refreshBubbleChatItems({ reason: 'local-show-message' }) || state
  }

  const hideBubbleChat = () => {
    petBubbleChatWindowService?.hide?.({ source: 'pet-bubble-chat-renderer' })
  }

  const setBubbleChatPinned = (payload) => (
    petBubbleChatWindowService?.setPinned?.(Boolean(payload?.pinned), { source: 'pet-bubble-chat-renderer' }) ||
    { visible: false, hasWindow: false }
  )

  const setBubbleChatInteracting = (payload) => (
    petBubbleChatWindowService?.setInteracting?.(Boolean(payload?.interacting), { source: 'pet-bubble-chat-renderer' }) ||
    { visible: false, hasWindow: false }
  )

  const setBubbleChatHitTestMode = (payload = {}) => (
    petBubbleChatWindowService?.setHitTestMode?.({
      interactive: Boolean(payload?.interactive),
      source: normalizeMessageText(payload?.source) || 'pet-bubble-chat-renderer'
    }) || { visible: false, hasWindow: false }
  )

  const syncBubbleChatToPetWindow = () => {
    petBubbleChatWindowService?.syncToPetWindow?.()
  }

  return {
    attachState,
    broadcastActivePetPackChanged,
    captureBubble,
    getActivePetPackId,
    getBubbleChatState,
    getLastBubble,
    getState,
    handlePetEvent,
    handlePetSay,
    hideBubbleChat,
    notifyActivePetPackChanged,
    notifyStateChanged,
    openBubbleChat,
    recordPetUtterance,
    refreshBubbleChatItems,
    refreshPetPackScopedChatState,
    setBubbleChatHitTestMode,
    setBubbleChatInteracting,
    setBubbleChatPinned,
    showLocalBubbleChatMessage,
    syncBubbleChatToPetWindow
  }
}

module.exports = {
  createPetChatFacade,
  createEmptyPetBubble,
  normalizePetBubble,
  sanitizeChatMessages
}
