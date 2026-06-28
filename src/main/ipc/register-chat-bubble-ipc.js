const { IPC } = require('../../shared/ipc-channels')

const createBubbleChatFallbackState = () => ({ visible: false, hasWindow: false })

const registerChatBubbleIpc = (context) => {
  const {
    ipcMainService,
    petBubbleChatWindowService,
    helpers
  } = context
  const {
    normalizeMessageText,
    getActivePetPackId,
    assertPetChatReady,
    runAiChatRequest,
    recordAppLog,
    sanitizeDiagnosticText
  } = helpers

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_GET_STATE, () => {
    return petBubbleChatWindowService?.getState?.() || createBubbleChatFallbackState()
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_OPEN, () => {
    return petBubbleChatWindowService?.open?.({ source: 'pet-renderer', focus: true }) || createBubbleChatFallbackState()
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_SHOW_MESSAGE, (_event, payload = {}) => {
    const text = normalizeMessageText(payload?.text)
    if (!text) return petBubbleChatWindowService?.getState?.() || createBubbleChatFallbackState()
    return petBubbleChatWindowService?.showMessage?.({
      text,
      ttlMs: payload?.ttlMs,
      source: normalizeMessageText(payload?.source) || 'pet-renderer',
      petPackId: getActivePetPackId()
    }) || createBubbleChatFallbackState()
  })

  ipcMainService.on(IPC.PET_BUBBLE_CHAT_HIDE, () => {
    petBubbleChatWindowService?.hide?.({ source: 'pet-bubble-chat-renderer' })
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_SET_PINNED, (_event, payload) => {
    return petBubbleChatWindowService?.setPinned?.(Boolean(payload?.pinned), { source: 'pet-bubble-chat-renderer' }) || createBubbleChatFallbackState()
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_SET_INTERACTING, (_event, payload) => {
    return petBubbleChatWindowService?.setInteracting?.(Boolean(payload?.interacting), { source: 'pet-bubble-chat-renderer' }) || createBubbleChatFallbackState()
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_SEND_MESSAGE, async (_event, payload = {}) => {
    const startedAt = Date.now()
    const message = typeof payload?.message === 'string' ? payload.message.trim() : ''
    recordAppLog({
      scope: 'pet-bubble-chat',
      level: 'info',
      actor: 'user',
      event: 'pet-bubble-chat.message.started',
      message: 'Pet bubble chat message started',
      details: {
        messageChars: message.length
      }
    })
    try {
      assertPetChatReady()
      petBubbleChatWindowService?.setSendingState?.({
        sending: true,
        lastUserMessage: { text: message }
      })
      const result = await runAiChatRequest({ message, entrypoint: 'control-center' }, { source: 'bubble-chat' })
      const state = petBubbleChatWindowService?.setSendingState?.({
        sending: false,
        lastUserMessage: { text: message },
        error: ''
      }) || petBubbleChatWindowService?.getState?.()
      recordAppLog({
        scope: 'pet-bubble-chat',
        level: 'info',
        actor: 'system',
        event: 'pet-bubble-chat.message.completed',
        message: 'Pet bubble chat message completed',
        details: {
          elapsedMs: Date.now() - startedAt,
          conversationId: result.conversationId || '',
          replyChars: String(result.reply || '').length,
          messageCount: Array.isArray(result.messages) ? result.messages.length : 0,
          actionId: result.action?.actionId || result.behavior?.actionId || ''
        }
      })
      return { ...result, state }
    } catch (error) {
      const safeMessage = error?.providerStatus
        ? 'AI provider returned an error response'
        : sanitizeDiagnosticText(error?.message)
      petBubbleChatWindowService?.setSendingState?.({
        sending: false,
        lastUserMessage: message ? { text: message } : null,
        error: safeMessage || 'Pet bubble chat message failed'
      })
      recordAppLog({
        scope: 'pet-bubble-chat',
        level: 'error',
        actor: 'system',
        event: 'pet-bubble-chat.message.failed',
        message: 'Pet bubble chat message failed',
        details: {
          elapsedMs: Date.now() - startedAt,
          errorName: sanitizeDiagnosticText(error?.name || 'Error'),
          errorMessage: safeMessage,
          providerStatus: error?.providerStatus || 0,
          providerCode: error?.providerCode || ''
        }
      })
      throw error
    }
  })
}

module.exports = {
  registerChatBubbleIpc
}
