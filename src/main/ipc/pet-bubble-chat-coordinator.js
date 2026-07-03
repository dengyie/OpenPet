const {
  normalizeMessageText,
  sanitizeDiagnosticText
} = require('./pet-chat-state')

const createPetBubbleChatCoordinator = ({
  petBubbleChatWindowService = null,
  getActivePetPackId,
  getConversationMessages,
  recordAppLog
}) => {
  const safeRecordAppLog = (entry) => {
    try {
      recordAppLog?.(entry)
    } catch (_) {
      // Logging must never break the product flow that triggered it.
    }
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

  const hideBubbleChat = (payload = {}) => {
    petBubbleChatWindowService?.hide?.({
      source: normalizeMessageText(payload?.source) || 'pet-bubble-chat-renderer'
    })
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

  const dragBubbleChatWindowTo = (payload = {}) => (
    petBubbleChatWindowService?.dragWindowTo?.({
      x: Number(payload?.x),
      y: Number(payload?.y),
      source: normalizeMessageText(payload?.source) || 'pet-bubble-chat-renderer'
    }) || { visible: false, hasWindow: false }
  )

  const syncBubbleChatToPetWindow = () => {
    petBubbleChatWindowService?.syncToPetWindow?.()
  }

  return {
    getBubbleChatState,
    hideBubbleChat,
    openBubbleChat,
    dragBubbleChatWindowTo,
    refreshBubbleChatItems,
    setBubbleChatHitTestMode,
    setBubbleChatInteracting,
    setBubbleChatPinned,
    showLocalBubbleChatMessage,
    syncBubbleChatToPetWindow
  }
}

module.exports = {
  createPetBubbleChatCoordinator
}
