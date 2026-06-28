/**
 * IPC 注册模块 —— 集中注册所有主进程侧 IPC 处理器。
 *
 * 为什么独立存在：
 * — 13 条 IPC 通道的注册逻辑如果散落在 main.js 中，会淹没应用生命周期代码。
 * — 依赖通过参数注入而非直接 import，避免与 window/settings/screen 模块形成硬耦合。
 * — 修改或新增 IPC 通道时，只需改这一个文件 + shared/ipc-channels.js。
 */
const { ipcMain, BrowserWindow, app, dialog, screen } = require('electron')
const { IPC } = require('../shared/ipc-channels')
const { sanitizeDetails } = require('./services/app-log-service')
const { choosePetContextMenuPoint, estimatePetContextMenuSize, filterManualPetActions } = require('./pet-context-menu')
const { showPetContextMenuWindow } = require('./pet-context-menu-window')
const { createBubbleRequestId } = require('./pet-bubble-chat-window')
const { createLocalHttpToken } = require('./services/local-http-service')
const { registerAiIpc } = require('./ipc/register-ai-ipc')
const { registerCatalogIpc } = require('./ipc/register-catalog-ipc')
const { registerPetRuntimeIpc } = require('./ipc/register-pet-runtime-ipc')
const { registerPluginIpc } = require('./ipc/register-plugin-ipc')
const { registerSettingsIpc } = require('./ipc/register-settings-ipc')
const { registerServiceIpc } = require('./ipc/register-service-ipc')
const { registerSystemIpc } = require('./ipc/register-system-ipc')
const {
  collectCustomCursorAssetPaths,
  createPetRendererSettings,
  mergePetSettingsViewIntoHostSettings,
  normalizeLocalHttpConfig
} = require('./ipc/pet-settings-adapter')
const {
  createAiConfigView,
  createAiMemoryProfileView,
  createAiPersonaDraftView,
  createAiPersonaProfileView,
  createActionFrameImportResult,
  createActionTriggerProposalPreviewResult,
  createActionsMutationResult,
  createAboutInfoView,
  createCatalogBlocklistResult,
  createCatalogView,
  createImageGenerationApiKeyResult,
  createImageGenerationConfigView,
  createImageGenerationHealthCheckResult,
  createPetPackMutationResult,
  createPluginListView,
  createPluginMutationResult,
  createServiceStatusView,
  createUpdateCheckView
} = require('./control-center-adapters')
const { findSemanticAction } = require('./services/ai-action-orchestrator')

const MAX_PET_BUBBLE_CHARS = 80
const MAX_PET_CHAT_MESSAGES = 100

/**
 * 向宠物窗口安全推送消息的薄封装。
 * 自动检查窗口是否还存在，避免向已关闭的窗口发送消息导致异常。
 */
const sendToPetWindow = (getPetWindow, channel, data) => {
  const petWindow = getPetWindow()
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send(channel, data)
  }
}

const sendToControlCenterWindow = (getPetWindow, channel, data) => {
  const petWindow = getPetWindow()
  const controlCenterWindow = petWindow?.settingsWindow
  if (controlCenterWindow && !controlCenterWindow.isDestroyed?.()) {
    controlCenterWindow.webContents?.send?.(channel, data)
  }
}

const reloadAndSendAnimations = (getPetWindow, petService) => {
  const animations = petService.reloadAnimations()
  sendToPetWindow(getPetWindow, IPC.PET_ANIMATIONS_CHANGED, animations)
  return animations
}

const createActionsViewState = (petService, triggerRuleRuntimeService = null, animations = null) => ({
  ...(animations || petService.getPreviewAnimations()),
  triggerRuntimeDiagnostics: triggerRuleRuntimeService?.getDiagnostics?.() || {
    currentState: { actionId: '' },
    decisions: []
  }
})

const triggerAiSemanticAction = (petService, reply) => {
  const action = findSemanticAction(reply, petService.getAnimations()?.actions || [])
  if (!action) return null
  try {
    return { ...action, ...petService.playAction({ actionId: action.actionId, source: 'ai' }) }
  } catch (error) {
    return { ...action, error: error.message }
  }
}

const executeBehaviorDecision = (petService, decision) => {
  if (!decision?.matched) return decision
  if (decision.type === 'say') {
    return { ...decision, result: petService.say({ text: decision.text, source: 'ai:behavior', sourceSurface: 'ai-behavior' }) }
  }
  if (decision.type === 'setEvent') {
    return { ...decision, result: petService.setEvent({ event: decision.event, message: decision.message, source: 'ai:behavior' }) }
  }
  if (decision.type === 'playAction') {
    return { ...decision, ...petService.playAction({ actionId: decision.actionId, source: 'ai:behavior' }) }
  }
  return decision
}

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

const createPetBubbleText = (reply, behaviorIntent, bubbleSegments = []) => {
  const preferred = normalizeMessageText(behaviorIntent?.bubbleText)
  const segmented = Array.isArray(bubbleSegments) ? normalizeMessageText(bubbleSegments[0]) : ''
  const text = preferred || segmented || normalizeMessageText(reply)
  if (text.length <= MAX_PET_BUBBLE_CHARS) return text
  return `${text.slice(0, MAX_PET_BUBBLE_CHARS - 3)}...`
}

const resolvePetSaySourceSurface = ({ source = '', requestSource = '' } = {}) => {
  const normalizedRequestSource = normalizeMessageText(requestSource)
  if (normalizedRequestSource) return normalizedRequestSource
  return normalizeMessageText(source) || 'control-center'
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

/**
 * 注册所有 IPC 处理器。接收依赖注入对象，各 handler 只通过注入的函数访问外部能力。
 */
const registerIpcHandlers = ({ getPetWindow, petService, petPackService, aiService, aiTalkService = null, petUtteranceLogService = null, petBubbleChatWindowService = null, imageGenerationModelService, behaviorOrchestratorService, triggerRuleRuntimeService = null, creatorStudioDefaultFlowService = null, pluginService, pluginInstallService, pluginGithubImportService, catalogService, localHttpService, aboutService, actionService, actionImportService, cursorAssetService, appLogService, applyWindowScale, applyPetViewport = () => {},
  clampToWorkArea, getMovementState, createSettingsWindow, petMovementPolicy, petChatWindowService = null, browserWindowService = BrowserWindow, dialogService = dialog, ipcMainService = ipcMain, screenService = screen, appService = app, showContextMenuWindow = showPetContextMenuWindow }) => {
  let pendingActionFrameSelection = null
  let lastPetBubble = createEmptyPetBubble()

  const createSelectionId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

  const showOpenDialogForEvent = (event, options) => {
    const parentWindow = event?.sender && browserWindowService?.fromWebContents?.(event.sender)
    if (parentWindow && !parentWindow.isDestroyed?.()) {
      return dialogService.showOpenDialog(parentWindow, options)
    }
    return dialogService.showOpenDialog(options)
  }

  const recordAppLog = (entry) => {
    try {
      appLogService?.record?.(entry)
    } catch (_) {
      // Logging must never break the user action that triggered it.
    }
  }

  const refreshTriggerRuleRuntime = () => {
    triggerRuleRuntimeService?.refresh?.()
  }

  const getActivePetPackId = () => {
    try {
      const manifest = petPackService?.getActivePetPack?.()?.manifest || {}
      return normalizeMessageText(manifest.id) || 'legacy-cat'
    } catch (_) {
      return 'legacy-cat'
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
      recordAppLog({
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

  const getPetChatState = () => {
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

  const notifyPetChatStateChanged = (state = getPetChatState()) => {
    petChatWindowService?.sendStateChanged?.(state)
  }

  const notifyControlCenterActivePetPackChanged = (activePackId) => {
    const normalizedActivePackId = normalizeMessageText(activePackId)
    if (!normalizedActivePackId) return
    const settingsWindow = browserWindowService.getAllWindows?.().find?.((candidate) => {
      try {
        return !candidate.isDestroyed?.() && candidate.webContents?.getURL?.().includes?.('control-center')
      } catch (_) {
        return false
      }
    })
    settingsWindow?.webContents?.send?.(IPC.PET_PACKS_ACTIVE_CHANGED, { activePackId: normalizedActivePackId })
  }

  const refreshPetPackScopedChatState = ({ reason = 'pet-pack-changed' } = {}) => {
    refreshBubbleChatItems({ reason })
    const state = getPetChatState()
    notifyPetChatStateChanged(state)
    return state
  }

  const refreshBubbleChatItems = ({ reason = 'refresh' } = {}) => {
    if (petBubbleChatWindowService?.rebuildItems) {
      let conversationMessages = []
      try {
        conversationMessages = (aiTalkService || aiService)?.getConversation?.('') || []
      } catch (error) {
        recordAppLog({
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
        conversationMessages = []
      }
      return petBubbleChatWindowService.rebuildItems({ conversationMessages, noticeItems: [], reason })
    }
    if (!petBubbleChatWindowService?.refreshItems) return petBubbleChatWindowService?.getState?.() || null
    let conversationMessages = []
    try {
      conversationMessages = (aiTalkService || aiService)?.getConversation?.('') || []
    } catch (error) {
      recordAppLog({
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
      conversationMessages = []
    }
    return petBubbleChatWindowService.refreshItems({ conversationMessages, reason })
  }

  const notifyActivePetPackChanged = (event, payload = {}) => {
    const state = getPetChatState()
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
    sendToControlCenterWindow(getPetWindow, IPC.CONTROL_CENTER_ACTIVE_PET_PACK_CHANGED, activePackPayload)
    refreshPetPackScopedChatState({ reason: `active-pet-pack-changed:${source}` })
    return activePackPayload
  }

  const capturePetBubble = (payload = {}, { notify = true } = {}) => {
    const bubble = normalizePetBubble(payload)
    if (!bubble) return lastPetBubble
    lastPetBubble = bubble
    if (notify) notifyPetChatStateChanged()
    return lastPetBubble
  }

  const attachPetChatState = (response = {}, bubble = lastPetBubble) => {
    const state = getPetChatState()
    notifyPetChatStateChanged(state)
    return { ...response, bubble, state }
  }

  const assertPetChatReady = () => {
    const config = aiService?.getConfig?.() || {}
    if (!config.enabled) throw new Error('请先在 Control Center 启用 AI Provider')
    if (!config.hasApiKey) throw new Error('请先在 Control Center 保存 AI API Key')
  }

  const requestAppQuit = (source) => {
    recordAppLog({
      scope: 'app',
      level: 'info',
      actor: 'user',
      event: 'app.quit.requested',
      message: 'OpenPet quit requested',
      details: { source }
    })
    appService.quit()
  }

  const runAiChatRequest = async (payload, { source = 'control-center', entrypoint } = {}) => {
    const requestPayload = entrypoint && !payload?.entrypoint
      ? { ...payload, entrypoint }
      : payload
    const requestId = typeof requestPayload?.requestId === 'string' && requestPayload.requestId.trim()
      ? requestPayload.requestId.trim().slice(0, 120)
      : createBubbleRequestId()
    const sourceSurface = resolvePetSaySourceSurface({ source, requestSource: source })
    const startedAt = Date.now()
    const messageChars = typeof requestPayload?.message === 'string' ? requestPayload.message.trim().length : 0
    const requestedConversationId = typeof requestPayload?.conversationId === 'string' ? requestPayload.conversationId.slice(0, 160) : ''
    recordAppLog({
      scope: 'ai-chat',
      level: 'info',
      actor: 'user',
      event: 'ai-chat.ipc.received',
      message: 'AI chat IPC request received',
      details: {
        source,
        sourceSurface,
        requestId,
        requestedConversationId,
        messageChars,
        service: aiTalkService ? 'ai-talk' : 'ai'
      }
    })
    try {
      const result = await (aiTalkService || aiService).chat(requestPayload)
      const bubbleText = createPetBubbleText(result.reply, result.behaviorIntent, result.bubbleSegments)
      const bubble = bubbleText ? capturePetBubble({ text: bubbleText, source: 'ai' }, { notify: false }) : lastPetBubble
      if (bubbleText) {
        recordAppLog({
          scope: 'ai-chat',
          level: 'info',
          actor: 'system',
          event: 'ai-chat.bubble.dispatching',
          message: 'AI chat bubble dispatching to pet service',
          details: {
            source,
            sourceSurface,
            requestId,
            textChars: bubbleText.length
          }
        })
        const sayResult = petService.say({
          text: bubbleText,
          source: 'ai',
          sourceSurface,
          requestId
        })
        recordAppLog({
          scope: 'ai-chat',
          level: 'info',
          actor: 'system',
          event: 'ai-chat.bubble.dispatched',
          message: 'AI chat bubble dispatched to pet service',
          details: {
            source,
            sourceSurface,
            requestId,
            textChars: String(sayResult?.text || '').length,
            hasTtl: Number.isFinite(Number(sayResult?.ttlMs))
          }
        })
      }
      if (behaviorOrchestratorService?.getConfig?.().enabled) {
        const decision = behaviorOrchestratorService.evaluate({
          reply: result.reply,
          behaviorIntent: result.behaviorIntent,
          actions: petService.getAnimations()?.actions || []
        })
        const behavior = executeBehaviorDecision(petService, decision)
        const response = behavior?.matched && behavior.type === 'playAction'
          ? { ...result, behavior, action: behavior }
          : { ...result, behavior }
        recordAppLog({
          scope: 'ai-chat',
          level: 'info',
          actor: 'system',
          event: 'ai-chat.ipc.completed',
          message: 'AI chat IPC request completed',
          details: {
            source,
            sourceSurface,
            requestId,
            requestedConversationId,
            conversationId: result.conversationId || '',
            elapsedMs: Date.now() - startedAt,
            replyChars: String(result.reply || '').length,
            bubbleChars: bubbleText.length,
            bubbleSegmentCount: Array.isArray(result.bubbleSegments) ? result.bubbleSegments.length : 0,
            messageCount: Array.isArray(result.messages) ? result.messages.length : 0,
            behaviorMatched: Boolean(behavior?.matched),
            actionId: behavior?.actionId || ''
          }
        })
        return attachPetChatState(response, bubble)
      }
      const action = triggerAiSemanticAction(petService, result.reply)
      const response = action ? { ...result, action } : result
      recordAppLog({
        scope: 'ai-chat',
        level: 'info',
        actor: 'system',
        event: 'ai-chat.ipc.completed',
        message: 'AI chat IPC request completed',
        details: {
          source,
          sourceSurface,
          requestId,
          requestedConversationId,
          conversationId: result.conversationId || '',
          elapsedMs: Date.now() - startedAt,
          replyChars: String(result.reply || '').length,
          bubbleChars: bubbleText.length,
          bubbleSegmentCount: Array.isArray(result.bubbleSegments) ? result.bubbleSegments.length : 0,
          messageCount: Array.isArray(result.messages) ? result.messages.length : 0,
          actionId: action?.actionId || ''
        }
      })
      return attachPetChatState(response, bubble)
    } catch (error) {
      recordAppLog({
        scope: 'ai-chat',
        level: 'error',
        actor: 'system',
        event: 'ai-chat.ipc.failed',
        message: 'AI chat IPC request failed',
        details: {
          source,
          sourceSurface,
          requestId,
          requestedConversationId,
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
  }

  const getPendingActionFrameSelection = (selectionId) => {
    if (!pendingActionFrameSelection || pendingActionFrameSelection.id !== selectionId) {
      throw new Error('Selected frame folder is no longer available')
    }
    return pendingActionFrameSelection
  }

  const inspectPendingActionFrameSelection = async ({ selectionId, actionId }) => {
    const selection = getPendingActionFrameSelection(selectionId)
    const result = await actionImportService.inspectActionFrames({ sourceDir: selection.sourceDir, actionId })
    return { selectionId: selection.id, ...result }
  }

  petService.onSay?.((payload) => {
    if (payload?.source !== 'ai') {
      recordPetUtterance(payload)
    }
    capturePetBubble(payload)
    recordAppLog({
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
  })
  petService.onAction?.((payload) => {
    sendToPetWindow(getPetWindow, IPC.PET_PLAY_ACTION, payload)
    petBubbleChatWindowService?.syncToPetWindow?.()
  })
  petService.onEvent?.((payload) => {
    if (payload?.message) {
      const bubble = { text: payload.message, ttlMs: payload.ttlMs, source: payload.source }
      recordPetUtterance(bubble)
      capturePetBubble(bubble)
      petBubbleChatWindowService?.showMessage?.({
        ...bubble,
        petPackId: getActivePetPackId()
      })
      refreshBubbleChatItems({ reason: 'pet-event' })
    }
  })

  registerPetRuntimeIpc({
    ipcMainService,
    browserWindowService,
    petService,
    appService,
    screenService,
    getPetWindow,
    applyPetViewport,
    clampToWorkArea,
    getMovementState,
    createSettingsWindow,
    petMovementPolicy,
    petChatWindowService,
    petBubbleChatWindowService,
    choosePetContextMenuPoint,
    estimatePetContextMenuSize,
    filterManualPetActions,
    showContextMenuWindow,
    createPetRendererSettings,
    recordAppLog,
    requestAppQuit,
    sanitizeDetails,
    sendToPetWindow
  })

  registerSystemIpc({
    ipcMainService,
    getPetWindow,
    createSettingsWindow,
    requestAppQuit
  })

  ipcMainService.handle(IPC.PET_CHAT_GET_STATE, () => {
    return getPetChatState()
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_GET_STATE, () => {
    return petBubbleChatWindowService?.getState?.() || { visible: false, hasWindow: false }
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_OPEN, () => {
    return petBubbleChatWindowService?.open?.({ source: 'pet-renderer', focus: true }) || { visible: false, hasWindow: false }
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_SHOW_MESSAGE, (_event, payload = {}) => {
    const text = normalizeMessageText(payload?.text)
    if (!text) return petBubbleChatWindowService?.getState?.() || { visible: false, hasWindow: false }
    const state = petBubbleChatWindowService?.showMessage?.({
      text,
      ttlMs: payload?.ttlMs,
      source: normalizeMessageText(payload?.source) || 'pet-renderer',
      petPackId: getActivePetPackId()
    }) || { visible: false, hasWindow: false }
    return refreshBubbleChatItems({ reason: 'local-show-message' }) || state
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

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_SET_HIT_TEST_MODE, (_event, payload) => {
    return petBubbleChatWindowService?.setHitTestMode?.({
      interactive: Boolean(payload?.interactive),
      source: normalizeMessageText(payload?.source) || 'pet-bubble-chat-renderer'
    }) || { visible: false, hasWindow: false }
  })

  ipcMainService.handle(IPC.PET_BUBBLE_CHAT_SEND_MESSAGE, async (_event, payload = {}) => {
    const startedAt = Date.now()
    const message = typeof payload?.message === 'string' ? payload.message.trim() : ''
    const requestId = createBubbleRequestId()
    recordAppLog({
      scope: 'pet-bubble-chat',
      level: 'info',
      actor: 'user',
      event: 'pet-bubble-chat.message.started',
      message: 'Pet bubble chat message started',
      details: {
        requestId,
        messageChars: message.length
      }
    })
    try {
      assertPetChatReady()
      if (aiTalkService?.appendUserMessages) {
        aiTalkService.appendUserMessages({
          messages: [message],
          entrypoint: 'control-center'
        })
      }
      const queued = petBubbleChatWindowService?.queueOutgoingMessage?.({ text: message, requestId })
      if (!queued) {
        petBubbleChatWindowService?.setSendingState?.({
          sending: true,
          lastUserMessage: { text: message }
        })
      }
      if (queued && queued.shouldStartRequest === false) {
        recordAppLog({
          scope: 'pet-bubble-chat',
          level: 'info',
          actor: 'system',
          event: 'pet-bubble-chat.message.queued',
          message: 'Pet bubble chat message queued behind an active reply',
          details: {
            requestId,
            elapsedMs: Date.now() - startedAt
          }
        })
        return {
          conversationId: '',
          reply: '',
          bubbleSegments: [],
          queued: true,
          state: queued.state || petBubbleChatWindowService?.getState?.()
        }
      }
      const batchMessages = Array.isArray(queued?.batchMessages) && queued.batchMessages.length
        ? queued.batchMessages
        : [message]
      const runBubbleBatch = async (batchRequestId, messagesForBatch) => {
        const batchResult = await runAiChatRequest({
          message: messagesForBatch.at(-1) || '',
          messageBatch: messagesForBatch,
          entrypoint: 'control-center',
          requestId: batchRequestId,
          skipUserAppend: Boolean(aiTalkService?.appendUserMessages)
        }, { source: 'bubble-chat' })
        petBubbleChatWindowService?.completeRequest?.({
          requestId: batchRequestId,
          conversationMessages: Array.isArray(batchResult.messages) ? batchResult.messages : []
        })
        const nextRequestId = createBubbleRequestId()
        const queuedMessages = petBubbleChatWindowService?.startQueuedRequest?.(nextRequestId) || []
        if (queuedMessages.length) {
          void runBubbleBatch(nextRequestId, queuedMessages).catch((error) => {
            const safeMessage = error?.providerStatus
              ? 'AI provider returned an error response'
              : sanitizeDiagnosticText(error?.message)
            petBubbleChatWindowService?.failRequest?.({
              requestId: nextRequestId,
              error: safeMessage || 'Pet bubble chat message failed'
            })
          })
        }
        return batchResult
      }
      const result = await runBubbleBatch(requestId, batchMessages)
      if (!queued) {
        petBubbleChatWindowService?.setSendingState?.({
          sending: false,
          lastUserMessage: { text: message },
          error: ''
        })
      }
      const state = refreshBubbleChatItems({ reason: 'bubble-chat-send' }) || petBubbleChatWindowService?.getState?.()
      recordAppLog({
        scope: 'pet-bubble-chat',
        level: 'info',
        actor: 'system',
        event: 'pet-bubble-chat.message.completed',
        message: 'Pet bubble chat message completed',
        details: {
          requestId,
          elapsedMs: Date.now() - startedAt,
          providerLatencyMs: Number.isFinite(result.providerLatencyMs) ? result.providerLatencyMs : 0,
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
      if (petBubbleChatWindowService?.failRequest) {
        petBubbleChatWindowService.failRequest({
          requestId,
          error: safeMessage || 'Pet bubble chat message failed'
        })
      } else {
        petBubbleChatWindowService?.setSendingState?.({
          sending: false,
          lastUserMessage: message ? { text: message } : null,
          error: safeMessage || 'Pet bubble chat message failed'
        })
      }
      recordAppLog({
        scope: 'pet-bubble-chat',
        level: 'error',
        actor: 'system',
        event: 'pet-bubble-chat.message.failed',
        message: 'Pet bubble chat message failed',
        details: {
          requestId,
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
    const requestId = createBubbleRequestId()
    recordAppLog({
      scope: 'pet-chat',
      level: 'info',
      actor: 'user',
      event: 'pet-chat.message.started',
      message: 'Pet chat message started',
      details: {
        source,
        requestId,
        messageChars: message.length
      }
    })
    try {
      assertPetChatReady()
      const result = await runAiChatRequest({ message, entrypoint: 'control-center', requestId }, { source })
      refreshBubbleChatItems({ reason: 'pet-chat-send' })
      const state = getPetChatState()
      recordAppLog({
        scope: 'pet-chat',
        level: 'info',
        actor: 'system',
        event: 'pet-chat.message.completed',
        message: 'Pet chat message completed',
        details: {
          source,
          requestId,
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
          requestId,
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

  registerSettingsIpc({
    ipcMainService,
    petService,
    getPetWindow,
    browserWindowService,
    cursorAssetService,
    petMovementPolicy,
    showOpenDialogForEvent,
    sendToPetWindow,
    createPetRendererSettings,
    collectCustomCursorAssetPaths,
    mergePetSettingsViewIntoHostSettings,
    recordAppLog
  })

  ipcMainService.handle(IPC.ACTIONS_GET, () => createActionsViewState(petService, triggerRuleRuntimeService))

  ipcMainService.handle(IPC.ACTIONS_INSPECT_FRAMES, async (event, payload) => {
    const selected = await showOpenDialogForEvent(event, {
      title: '选择动作帧文件夹',
      properties: ['openDirectory']
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }

    const selectionId = createSelectionId()
    const sourceDir = selected.filePaths[0]
    const result = await actionImportService.inspectActionFrames({ sourceDir, actionId: payload.actionId })
    pendingActionFrameSelection = { id: selectionId, sourceDir }
    return { canceled: false, selectionId, ...result }
  })

  ipcMainService.handle(IPC.ACTIONS_REINSPECT_FRAMES, async (_event, payload) => {
    return inspectPendingActionFrameSelection({ selectionId: payload.selectionId, actionId: payload.actionId })
  })

  ipcMainService.handle(IPC.ACTIONS_CLEAR_FRAME_SELECTION, (_event, payload) => {
    if (!payload?.selectionId || pendingActionFrameSelection?.id === payload.selectionId) {
      pendingActionFrameSelection = null
    }
    return { ok: true }
  })

  ipcMainService.handle(IPC.ACTIONS_IMPORT_FRAMES, async (_event, payload) => {
    const selection = getPendingActionFrameSelection(payload.selectionId)
    const inspectionResult = await inspectPendingActionFrameSelection({ selectionId: payload.selectionId, actionId: payload.actionId })
    if (!inspectionResult.inspection.valid) {
      return createActionFrameImportResult({ ok: false, inspectionResult })
    }

    const result = await actionImportService.importActionFrames({
      sourceDir: selection.sourceDir,
      actionId: payload.actionId,
      label: payload.label
    })
    pendingActionFrameSelection = null
    reloadAndSendAnimations(getPetWindow, petService)
    return createActionFrameImportResult(
      { ok: true, canceled: false, result },
      createActionsViewState(petService, triggerRuleRuntimeService)
    )
  })

  ipcMainService.handle(IPC.ACTIONS_SAVE_CONFIG, async (_event, payload) => {
    if (payload?.triggerProposal) {
      if (!actionService?.acceptTriggerProposal) throw new Error('Action trigger proposal acceptance is not available')
      const triggerProposal = actionService.acceptTriggerProposal(payload.triggerProposal)
      const animations = triggerProposal.applied
        ? reloadAndSendAnimations(getPetWindow, petService)
        : petService.getPreviewAnimations()
      if (triggerProposal.applied) refreshTriggerRuleRuntime()
      recordAppLog({
        scope: 'actions',
        level: 'info',
        actor: 'user',
        event: 'actions.trigger-proposal.accepted',
        message: 'Action trigger proposal accepted',
        details: {
          actionId: triggerProposal.actionId,
          type: triggerProposal.type,
          binding: triggerProposal.binding,
          applied: triggerProposal.applied,
          code: triggerProposal.code,
          sourcePluginId: triggerProposal.sourcePluginId || '',
          sourceRunId: triggerProposal.sourceRunId || '',
          sourceCommandId: triggerProposal.sourceCommandId || ''
        }
      })
      return createActionsMutationResult(createActionsViewState(petService, triggerRuleRuntimeService, animations), { triggerProposal })
    }
    await actionImportService.updateActionConfig(payload)
    reloadAndSendAnimations(getPetWindow, petService)
    refreshTriggerRuleRuntime()
    return createActionsMutationResult(createActionsViewState(petService, triggerRuleRuntimeService))
  })

  ipcMainService.handle(IPC.ACTIONS_PREVIEW_TRIGGER_PROPOSAL, async (_event, payload) => {
    if (!actionService?.previewTriggerProposal) throw new Error('Action trigger proposal preview is not available')
    const triggerProposal = actionService.previewTriggerProposal(payload)
    return createActionTriggerProposalPreviewResult(triggerProposal)
  })

  ipcMainService.handle(IPC.ACTIONS_SUBMIT_TRIGGER_PROPOSAL, async (_event, payload) => {
    if (!actionService?.submitTriggerProposal) throw new Error('Action trigger proposal inbox is not available')
    const result = actionService.submitTriggerProposal(payload)
    recordAppLog({
      scope: 'actions',
      level: 'info',
      actor: 'plugin',
      event: 'actions.trigger-proposal.submitted',
      message: 'Action trigger proposal submitted',
      details: {
        proposalId: result.proposal.id,
        actionId: result.proposal.actionId,
        type: result.proposal.type,
        sourcePluginId: result.proposal.sourcePluginId || '',
        sourceRunId: result.proposal.sourceRunId || '',
        sourceCommandId: result.proposal.sourceCommandId || ''
      }
    })
    return createActionsMutationResult(
      createActionsViewState(petService, triggerRuleRuntimeService, result.animations),
      { proposal: result.proposal }
    )
  })

  ipcMainService.handle(IPC.ACTIONS_ACCEPT_TRIGGER_PROPOSAL, async (_event, payload) => {
    if (!actionService?.acceptTriggerProposalItem) throw new Error('Action trigger proposal inbox is not available')
    const result = actionService.acceptTriggerProposalItem(payload?.proposalId)
    const animations = result.triggerProposal?.applied
      ? reloadAndSendAnimations(getPetWindow, petService)
      : result.animations
    if (result.triggerProposal?.applied) refreshTriggerRuleRuntime()
    recordAppLog({
      scope: 'actions',
      level: 'info',
      actor: 'user',
      event: 'actions.trigger-proposal.inbox.accepted',
      message: 'Action trigger proposal accepted from inbox',
      details: {
        proposalId: result.proposal.id,
        actionId: result.proposal.actionId,
        type: result.proposal.type,
        applied: Boolean(result.triggerProposal?.applied),
        code: result.triggerProposal?.code || ''
      }
    })
    return createActionsMutationResult(
      createActionsViewState(petService, triggerRuleRuntimeService, animations),
      { proposal: result.proposal, triggerProposal: result.triggerProposal }
    )
  })

  ipcMainService.handle(IPC.ACTIONS_REJECT_TRIGGER_PROPOSAL, async (_event, payload) => {
    if (!actionService?.rejectTriggerProposalItem) throw new Error('Action trigger proposal inbox is not available')
    const result = actionService.rejectTriggerProposalItem(payload?.proposalId, payload?.reason)
    recordAppLog({
      scope: 'actions',
      level: 'info',
      actor: 'user',
      event: 'actions.trigger-proposal.inbox.rejected',
      message: 'Action trigger proposal rejected from inbox',
      details: {
        proposalId: result.proposal.id,
        actionId: result.proposal.actionId,
        type: result.proposal.type
      }
    })
    return createActionsMutationResult(
      createActionsViewState(petService, triggerRuleRuntimeService, result.animations),
      { proposal: result.proposal }
    )
  })

  ipcMainService.handle(IPC.ACTIONS_UPDATE_TRIGGER_RULE, async (_event, payload) => {
    if (!actionService?.setTriggerRuleStatus) throw new Error('Action trigger rule management is not available')
    const result = actionService.setTriggerRuleStatus(payload?.ruleId, payload?.status)
    recordAppLog({
      scope: 'actions',
      level: 'info',
      actor: 'user',
      event: 'actions.trigger-rule.updated',
      message: 'Action trigger rule status updated',
      details: {
        ruleId: result.rule.id,
        actionId: result.rule.actionId,
        type: result.rule.type,
        status: result.rule.status
      }
    })
    refreshTriggerRuleRuntime()
    return {
      animations: createActionsViewState(petService, triggerRuleRuntimeService, result.animations),
      rule: result.rule
    }
  })

  ipcMainService.handle(IPC.ACTIONS_DELETE_TRIGGER_RULE, async (_event, payload) => {
    if (!actionService?.deleteTriggerRule) throw new Error('Action trigger rule management is not available')
    const result = actionService.deleteTriggerRule(payload?.ruleId)
    recordAppLog({
      scope: 'actions',
      level: 'info',
      actor: 'user',
      event: 'actions.trigger-rule.deleted',
      message: 'Action trigger rule deleted',
      details: {
        ruleId: result.rule.id,
        actionId: result.rule.actionId,
        type: result.rule.type,
        status: result.rule.status
      }
    })
    refreshTriggerRuleRuntime()
    return {
      animations: createActionsViewState(petService, triggerRuleRuntimeService, result.animations),
      rule: result.rule
    }
  })

  ipcMainService.handle(IPC.ACTIONS_DELETE, async (_event, payload) => {
    await actionImportService.deleteAction(payload.actionId)
    reloadAndSendAnimations(getPetWindow, petService)
    refreshTriggerRuleRuntime()
    return createActionsMutationResult(createActionsViewState(petService, triggerRuleRuntimeService))
  })

  ipcMainService.handle(IPC.PET_PACKS_LIST, () => petPackService.listPacks())

  ipcMainService.handle(IPC.PET_PACKS_INSPECT_DIRECTORY, async (event) => {
    const selected = await showOpenDialogForEvent(event, {
      title: '选择 Pet Pack 文件夹或 Codex Pet 包',
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'Pet Pack Package', extensions: ['zip'] }]
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
    return { canceled: false, ...petPackService.inspectPackSource(selected.filePaths[0]) }
  })

  ipcMainService.handle(IPC.PET_PACKS_CLEAR_SELECTION, (_event, payload) => {
    return petPackService.clearPendingSelection(payload?.selectionId)
  })

  ipcMainService.handle(IPC.PET_PACKS_IMPORT, (_event, payload) => {
    const previousActivePackId = petPackService?.listPacks?.()?.activePackId || ''
    const result = petPackService.importPack(payload.selectionId)
    const petPacks = petPackService.listPacks()
    if (result?.pack?.id && petPacks?.activePackId === result.pack.id) {
      const animations = reloadAndSendAnimations(getPetWindow, petService)
      refreshTriggerRuleRuntime()
      if (previousActivePackId !== petPacks.activePackId) {
        broadcastActivePetPackChanged({
          source: IPC.PET_PACKS_IMPORT,
          payload: createPetPackMutationResult(
            result,
            petPacks,
            createActionsViewState(petService, triggerRuleRuntimeService, animations)
          )
        })
      }
      return createPetPackMutationResult(
        result,
        petPacks,
        createActionsViewState(petService, triggerRuleRuntimeService, animations)
      )
    }
    return createPetPackMutationResult(result, petPacks)
  })

  ipcMainService.handle(IPC.PET_PACKS_EXPORT, async (event, payload) => {
    const selected = await showOpenDialogForEvent(event, {
      title: '选择 Pet Pack 导出目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
    return { canceled: false, ...petPackService.exportPack(payload.packId, selected.filePaths[0]) }
  })

  ipcMainService.handle(IPC.PET_PACKS_SET_ACTIVE, (event, payload) => {
    const result = petPackService.setActivePack(payload.packId)
    reloadAndSendAnimations(getPetWindow, petService)
    refreshTriggerRuleRuntime()
    const animations = createActionsViewState(petService, triggerRuleRuntimeService)
    const petPacks = petPackService.listPacks()
    const mutationResult = createPetPackMutationResult(result, petPacks, animations)
    notifyActivePetPackChanged(event, mutationResult)
    broadcastActivePetPackChanged({ source: IPC.PET_PACKS_SET_ACTIVE, payload: mutationResult })
    return mutationResult
  })

  ipcMainService.handle(IPC.PET_PACKS_REMOVE, (_event, payload) => {
    const previousActivePackId = petPackService?.listPacks?.()?.activePackId || ''
    const result = petPackService.removePack(payload.packId)
    const mutationResult = createPetPackMutationResult(result, petPackService.listPacks())
    if (previousActivePackId !== mutationResult.petPacks?.activePackId) {
      broadcastActivePetPackChanged({ source: IPC.PET_PACKS_REMOVE, payload: mutationResult })
    }
    return mutationResult
  })

  ipcMainService.handle(IPC.ABOUT_GET_INFO, () => createAboutInfoView(aboutService.getInfo()))

  ipcMainService.handle(IPC.ABOUT_CHECK_UPDATES, async () => createUpdateCheckView(await aboutService.checkForUpdates()))

  registerAiIpc({
    ipcMainService,
    aiService,
    aiTalkService,
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
  })

  registerPluginIpc({
    ipcMainService,
    dialogService,
    creatorStudioDefaultFlowService,
    pluginService,
    pluginInstallService,
    pluginGithubImportService,
    createPluginListView,
    createPluginMutationResult
  })

  registerServiceIpc({
    ipcMainService,
    petService,
    localHttpService,
    normalizeLocalHttpConfig,
    createLocalHttpToken,
    createServiceStatusView
  })

  registerCatalogIpc({
    ipcMainService,
    catalogService,
    getPetWindow,
    petService,
    reloadAndSendAnimations,
    refreshTriggerRuleRuntime,
    getActionsViewState: () => createActionsViewState(petService, triggerRuleRuntimeService),
    createCatalogView,
    createCatalogBlocklistResult
  })

  return {
    broadcastActivePetPackChanged
  }
}

module.exports = { createPetRendererSettings, normalizeLocalHttpConfig, reloadAndSendAnimations, registerIpcHandlers, triggerAiSemanticAction, executeBehaviorDecision }
