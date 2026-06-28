const { IPC } = require('../../shared/ipc-channels')

const registerAiIpc = ({
  ipcMainService,
  aiService,
  aiTalkService = null,
  imageGenerationModelService,
  behaviorOrchestratorService,
  petService,
  runAiChatRequest,
  createAiConfigView,
  createAiPersonaProfileView,
  createAiPersonaDraftView,
  createAiMemoryProfileView,
  createImageGenerationConfigView,
  createImageGenerationApiKeyResult,
  createImageGenerationHealthCheckResult
}) => {
  ipcMainService.handle(IPC.AI_GET_CONFIG, () => createAiConfigView(aiService.getConfig()))
  ipcMainService.handle(IPC.AI_SAVE_CONFIG, (_event, config) => createAiConfigView(aiService.saveConfig(config)))
  ipcMainService.handle(IPC.AI_SAVE_API_KEY, (_event, apiKey) => aiService.saveApiKey(apiKey))
  ipcMainService.handle(IPC.AI_TEST_CONNECTION, () => aiService.testConnection())

  ipcMainService.handle(IPC.AI_GET_PERSONA_PROFILE, async () => {
    if (!aiTalkService?.getPersonaProfile) throw new Error('AI talk persona profile is not available')
    return createAiPersonaProfileView(await aiTalkService.getPersonaProfile())
  })

  ipcMainService.handle(IPC.AI_GENERATE_PERSONA_DRAFT, async (_event, request) => {
    if (!aiTalkService?.generatePersonaDraft) throw new Error('AI talk persona generation is not available')
    return createAiPersonaDraftView(await aiTalkService.generatePersonaDraft(request || {}))
  })

  ipcMainService.handle(IPC.AI_SAVE_PERSONA_OVERRIDE, async (_event, override) => {
    if (!aiTalkService?.savePersonaOverride) throw new Error('AI talk persona overrides are not available')
    return createAiPersonaProfileView(await aiTalkService.savePersonaOverride(override || {}))
  })

  ipcMainService.handle(IPC.AI_GET_MEMORY_PROFILE, async () => {
    if (!aiTalkService?.getMemoryProfile) throw new Error('AI talk memories are not available')
    return createAiMemoryProfileView(await aiTalkService.getMemoryProfile())
  })

  ipcMainService.handle(IPC.AI_DELETE_MEMORY, async (_event, payload) => {
    if (!aiTalkService?.deleteMemory) throw new Error('AI talk memory deletion is not available')
    return createAiMemoryProfileView(await aiTalkService.deleteMemory(payload?.memoryId || payload))
  })

  ipcMainService.handle(IPC.AI_CLEAR_PET_PACK_MEMORIES, async () => {
    if (!aiTalkService?.clearPetPackMemories) throw new Error('AI talk memory clearing is not available')
    return createAiMemoryProfileView(await aiTalkService.clearPetPackMemories())
  })

  ipcMainService.handle(IPC.AI_TALK_GET_TRACE_SUMMARY, (_event, payload) => {
    if (!aiTalkService?.getLatestTraceSummary) throw new Error('AI talk trace summary is not available')
    return aiTalkService.getLatestTraceSummary(payload || {})
  })

  ipcMainService.handle(IPC.AI_TALK_EXPORT_TRACE, (_event, payload) => {
    if (!aiTalkService?.exportTrace) throw new Error('AI talk trace export is not available')
    return aiTalkService.exportTrace(payload || {})
  })

  ipcMainService.handle(IPC.IMAGE_GENERATION_GET_CONFIG, () => createImageGenerationConfigView(imageGenerationModelService.getConfig()))
  ipcMainService.handle(IPC.IMAGE_GENERATION_SAVE_CONFIG, (_event, config) => createImageGenerationConfigView(imageGenerationModelService.saveConfig(config)))
  ipcMainService.handle(IPC.IMAGE_GENERATION_SAVE_API_KEY, (_event, apiKey) => createImageGenerationApiKeyResult(imageGenerationModelService.saveCloudApiKey(apiKey)))
  ipcMainService.handle(IPC.IMAGE_GENERATION_CLEAR_API_KEY, () => createImageGenerationApiKeyResult(imageGenerationModelService.clearCloudApiKey()))
  ipcMainService.handle(IPC.IMAGE_GENERATION_CHECK_HEALTH, async (_event, payload) => (
    createImageGenerationHealthCheckResult(await imageGenerationModelService.checkHealth(payload || {}))
  ))

  ipcMainService.handle(IPC.AI_GET_CONVERSATION, (_event, payload) => {
    const conversationId = payload?.conversationId || payload
    return (aiTalkService || aiService).getConversation(conversationId)
  })

  ipcMainService.handle(IPC.AI_CHAT, async (_event, payload) => runAiChatRequest(payload, { source: 'control-center' }))

  ipcMainService.handle(IPC.AI_EXPORT_TRACE_DIAGNOSTICS, (_event, payload) => {
    if (!aiTalkService?.exportTraceDiagnostics) throw new Error('AI talk trace diagnostics are not available')
    return aiTalkService.exportTraceDiagnostics({
      filters: payload || {},
      behaviorDecisions: behaviorOrchestratorService.getConfig?.().decisions || []
    })
  })

  ipcMainService.handle(IPC.AI_BEHAVIOR_GET, () => behaviorOrchestratorService.getConfig())
  ipcMainService.handle(IPC.AI_BEHAVIOR_SAVE, (_event, payload) => behaviorOrchestratorService.saveConfig(payload))
  ipcMainService.handle(IPC.AI_BEHAVIOR_DRY_RUN, (_event, payload) => (
    behaviorOrchestratorService.dryRun({
      ...payload,
      actions: petService.getAnimations()?.actions || []
    })
  ))
  ipcMainService.handle(IPC.AI_BEHAVIOR_REPLAY_DECISION, (_event, payload) => (
    behaviorOrchestratorService.replayDecision({
      decisionId: payload?.decisionId,
      actions: petService.getAnimations()?.actions || []
    })
  ))
  ipcMainService.handle(IPC.AI_BEHAVIOR_EXPORT_DIAGNOSTICS, () => behaviorOrchestratorService.exportDiagnostics())
  ipcMainService.handle(IPC.AI_BEHAVIOR_CLEAR_DECISIONS, () => behaviorOrchestratorService.clearDecisions())
}

module.exports = { registerAiIpc }
