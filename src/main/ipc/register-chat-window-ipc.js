const { IPC } = require('../../shared/ipc-channels')

const registerChatWindowIpc = (context) => {
  const {
    ipcMainService,
    petChatWindowService,
    helpers
  } = context
  const {
    getPetChatState,
    assertPetChatReady,
    runAiChatRequest,
    recordAppLog,
    sanitizeDiagnosticText
  } = helpers

  ipcMainService.handle(IPC.PET_CHAT_GET_STATE, () => getPetChatState())

  ipcMainService.handle(IPC.PET_CHAT_OPEN, () => {
    petChatWindowService?.open?.()
    return getPetChatState()
  })

  ipcMainService.on(IPC.PET_CHAT_HIDE, () => {
    petChatWindowService?.hide?.({ source: 'pet-chat-renderer' })
  })

  ipcMainService.handle(IPC.PET_CHAT_SET_ALWAYS_ON_TOP, (_event, payload) => {
    if (!petChatWindowService?.setAlwaysOnTop) return { available: false }
    petChatWindowService.setAlwaysOnTop(Boolean(payload?.alwaysOnTop))
    return getPetChatState()
  })

  ipcMainService.on(IPC.PET_CHAT_OPEN_SETTINGS, () => {
    petChatWindowService?.openSettings?.()
  })

  ipcMainService.handle(IPC.PET_CHAT_SEND_MESSAGE, async (_event, payload = {}) => {
    const startedAt = Date.now()
    const message = typeof payload?.message === 'string' ? payload.message.trim() : ''
    const source = payload?.source === 'control-center' ? 'control-center' : 'pet-chat'
    recordAppLog({
      scope: 'pet-chat',
      level: 'info',
      actor: 'user',
      event: 'pet-chat.message.started',
      message: 'Pet chat message started',
      details: {
        source,
        messageChars: message.length
      }
    })
    try {
      assertPetChatReady()
      const result = await runAiChatRequest({ message, entrypoint: 'control-center' }, { source })
      const state = getPetChatState()
      recordAppLog({
        scope: 'pet-chat',
        level: 'info',
        actor: 'system',
        event: 'pet-chat.message.completed',
        message: 'Pet chat message completed',
        details: {
          source,
          elapsedMs: Date.now() - startedAt,
          conversationId: result.conversationId || '',
          messageCount: Array.isArray(result.messages) ? result.messages.length : 0,
          replyChars: String(result.reply || '').length,
          actionId: result.action?.actionId || result.behavior?.actionId || ''
        }
      })
      return { ...result, state }
    } catch (error) {
      recordAppLog({
        scope: 'pet-chat',
        level: 'error',
        actor: 'system',
        event: 'pet-chat.message.failed',
        message: 'Pet chat message failed',
        details: {
          source,
          elapsedMs: Date.now() - startedAt,
          errorName: sanitizeDiagnosticText(error?.name || 'Error'),
          errorMessage: error?.providerStatus
            ? 'AI provider returned an error response'
            : sanitizeDiagnosticText(error?.message),
          providerStatus: error?.providerStatus || 0,
          providerCode: error?.providerCode || ''
        }
      })
      throw error
    }
  })
}

module.exports = {
  registerChatWindowIpc
}
