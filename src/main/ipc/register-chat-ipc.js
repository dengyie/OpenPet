const { IPC } = require('../../shared/ipc-channels')

const registerChatIpc = (context) => {
  const {
    ipcMainService,
    petBubbleChatWindowService,
    petChatWindowService,
    helpers
  } = context
  const {
    getPetChatState,
    normalizeMessageText,
    getActivePetPackId,
    assertPetChatReady,
    runAiChatRequest,
    recordAppLog,
    sanitizeDiagnosticText
  } = helpers

  ipcMainService.handle(IPC.PET_CHAT_GET_STATE, () => getPetChatState())

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_GET_STATE, () => {
    return petBubbleChatWindowService?.getState?.() || { visible: false, hasWindow: false }
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_OPEN, () => {
    return petBubbleChatWindowService?.open?.({ source: 'pet-renderer', focus: true }) || { visible: false, hasWindow: false }
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_SHOW_MESSAGE, (_event, payload = {}) => {
    const text = normalizeMessageText(payload?.text)
    if (!text) return petBubbleChatWindowService?.getState?.() || { visible: false, hasWindow: false }
    return petBubbleChatWindowService?.showMessage?.({
      text,
      ttlMs: payload?.ttlMs,
      source: normalizeMessageText(payload?.source) || 'pet-renderer',
      petPackId: getActivePetPackId()
    }) || { visible: false, hasWindow: false }
  })

  ipcMainService.on(IPC.PET_BUBBLE_CHAT_HIDE, () => {
    petBubbleChatWindowService?.hide?.({ source: 'pet-bubble-chat-renderer' })
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_SET_PINNED, (_event, payload) => {
    return petBubbleChatWindowService?.setPinned?.(Boolean(payload?.pinned), { source: 'pet-bubble-chat-renderer' }) || { visible: false, hasWindow: false }
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_SET_INTERACTING, (_event, payload) => {
    return petBubbleChatWindowService?.setInteracting?.(Boolean(payload?.interacting), { source: 'pet-bubble-chat-renderer' }) || { visible: false, hasWindow: false }
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

  ipcMainService.handle(IPC.AI_GET_CONFIG, () => context.aiService.getConfig())
  ipcMainService.handle(IPC.AI_SAVE_CONFIG, (_event, config) => context.aiService.saveConfig(config))
  ipcMainService.handle(IPC.AI_SAVE_API_KEY, (_event, apiKey) => context.aiService.saveApiKey(apiKey))
  ipcMainService.handle(IPC.AI_TEST_CONNECTION, () => context.aiService.testConnection())

  ipcMainService.handle(IPC.AI_GET_PERSONA_PROFILE, () => {
    if (!context.aiTalkService?.getPersonaProfile) throw new Error('AI talk persona profile is not available')
    return context.aiTalkService.getPersonaProfile()
  })
  ipcMainService.handle(IPC.AI_GENERATE_PERSONA_DRAFT, (_event, request) => {
    if (!context.aiTalkService?.generatePersonaDraft) throw new Error('AI talk persona generation is not available')
    return context.aiTalkService.generatePersonaDraft(request || {})
  })
  ipcMainService.handle(IPC.AI_SAVE_PERSONA_OVERRIDE, (_event, override) => {
    if (!context.aiTalkService?.savePersonaOverride) throw new Error('AI talk persona overrides are not available')
    return context.aiTalkService.savePersonaOverride(override || {})
  })
  ipcMainService.handle(IPC.AI_GET_MEMORY_PROFILE, () => {
    if (!context.aiTalkService?.getMemoryProfile) throw new Error('AI talk memories are not available')
    return context.aiTalkService.getMemoryProfile()
  })
  ipcMainService.handle(IPC.AI_DELETE_MEMORY, (_event, payload) => {
    if (!context.aiTalkService?.deleteMemory) throw new Error('AI talk memory deletion is not available')
    return context.aiTalkService.deleteMemory(payload?.memoryId || payload)
  })
  ipcMainService.handle(IPC.AI_CLEAR_PET_PACK_MEMORIES, () => {
    if (!context.aiTalkService?.clearPetPackMemories) throw new Error('AI talk memory clearing is not available')
    return context.aiTalkService.clearPetPackMemories()
  })
  ipcMainService.handle(IPC.AI_EXPORT_TRACES, () => {
    if (!context.aiTalkService?.exportTraces) throw new Error('AI talk trace export is not available')
    return context.aiTalkService.exportTraces()
  })

  ipcMainService.handle(IPC.IMAGE_GENERATION_GET_CONFIG, () => context.imageGenerationModelService.getConfig())
  ipcMainService.handle(IPC.IMAGE_GENERATION_SAVE_CONFIG, (_event, config) => context.imageGenerationModelService.saveConfig(config))
  ipcMainService.handle(IPC.IMAGE_GENERATION_SAVE_API_KEY, (_event, apiKey) => context.imageGenerationModelService.saveCloudApiKey(apiKey))
  ipcMainService.handle(IPC.IMAGE_GENERATION_CLEAR_API_KEY, () => context.imageGenerationModelService.clearCloudApiKey())
  ipcMainService.handle(IPC.IMAGE_GENERATION_CHECK_HEALTH, (_event, payload) => context.imageGenerationModelService.checkHealth(payload || {}))

  ipcMainService.handle(IPC.AI_GET_CONVERSATION, (_event, payload) => {
    const conversationId = payload?.conversationId || payload
    return (context.aiTalkService || context.aiService).getConversation(conversationId)
  })
  ipcMainService.handle(IPC.AI_CHAT, async (_event, payload) => runAiChatRequest(payload, { source: 'control-center' }))
  ipcMainService.handle(IPC.AI_BEHAVIOR_GET, () => context.behaviorOrchestratorService.getConfig())
  ipcMainService.handle(IPC.AI_BEHAVIOR_SAVE, (_event, payload) => context.behaviorOrchestratorService.saveConfig(payload))
  ipcMainService.handle(IPC.AI_BEHAVIOR_DRY_RUN, (_event, payload) => {
    return context.behaviorOrchestratorService.dryRun({
      ...payload,
      actions: context.petService.getAnimations()?.actions || []
    })
  })
  ipcMainService.handle(IPC.AI_BEHAVIOR_REPLAY_DECISION, (_event, payload) => {
    return context.behaviorOrchestratorService.replayDecision({
      decisionId: payload?.decisionId,
      actions: context.petService.getAnimations()?.actions || []
    })
  })
  ipcMainService.handle(IPC.AI_BEHAVIOR_EXPORT_DIAGNOSTICS, () => context.behaviorOrchestratorService.exportDiagnostics())
  ipcMainService.handle(IPC.AI_BEHAVIOR_CLEAR_DECISIONS, () => context.behaviorOrchestratorService.clearDecisions())
}

module.exports = {
  registerChatIpc
}
