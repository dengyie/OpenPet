const { IPC } = require('../../shared/ipc-channels')

const registerChatAiIpc = (context) => {
  const { ipcMainService } = context

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
  ipcMainService.handle(IPC.AI_CHAT, async (_event, payload) => context.helpers.runAiChatRequest(payload, { source: 'control-center' }))
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
  registerChatAiIpc
}
