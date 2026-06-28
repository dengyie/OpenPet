const { ipcMain, BrowserWindow, app, dialog, screen } = require('electron')
const { IPC } = require('../../shared/ipc-channels')
const { sanitizeDetails } = require('../services/app-log-service')
const { normalizeCursorSettingsState } = require('../../shared/cursor-library')
const { choosePetContextMenuPoint, estimatePetContextMenuSize } = require('../pet-context-menu')
const { showPetContextMenuWindow } = require('../pet-context-menu-window')
const { calculateBubbleTtlMs } = require('../pet-bubble-chat-window')
const {
  createActionFrameImportResult,
  createActionsMutationResult,
  createAboutInfoView,
  createCatalogBlocklistResult,
  createPetPackMutationResult,
  createPluginMutationResult,
  createServiceStatusView,
  createUpdateCheckView
} = require('../control-center-adapters')
const { findSemanticAction } = require('../services/ai-action-orchestrator')
const { createLocalHttpToken } = require('../services/local-http-service')
const { registerPetIpc } = require('./register-pet-ipc')
const { registerChatIpc } = require('./register-chat-ipc')
const { registerSettingsIpc } = require('./register-settings-ipc')
const { registerPluginIpc } = require('./register-plugin-ipc')
const { registerSystemIpc } = require('./register-system-ipc')

const MAX_PET_BUBBLE_CHARS = 80
const MAX_PET_CHAT_MESSAGES = 100

const createPetRendererSettings = (settings = {}) => {
  const cursorState = normalizeCursorSettingsState(settings)
  return {
    scale: settings.scale,
    walkSpeed: settings.walkSpeed,
    walkDuration: settings.walkDuration,
    bubbleDuration: settings.bubbleDuration,
    menuPosition: settings.menuPosition || 'auto',
    selectedCursorId: cursorState.selectedCursorId,
    customCursor: cursorState.customCursor,
    customCursors: cursorState.customCursors,
    grounded: Boolean(settings.petBehavior?.grounded),
    home: {
      enabled: Boolean(settings.petBehavior?.home?.enabled),
      radius: settings.petBehavior?.home?.radius || 'medium',
      hasAnchor: Boolean(settings.petBehavior?.home?.anchor)
    },
    petBubbleChat: {
      enabled: settings.petBubbleChat?.enabled !== false,
      autoPopup: settings.petBubbleChat?.autoPopup !== false,
      autoHide: settings.petBubbleChat?.autoHide !== false,
      pinOnInteraction: settings.petBubbleChat?.pinOnInteraction !== false
    }
  }
}

const mergePetSettingsViewIntoHostSettings = (currentSettings = {}, nextSettings = {}) => {
  const currentHome = currentSettings.petBehavior?.home || {}
  const nextHome = nextSettings.home || {}
  const cursorState = normalizeCursorSettingsState({
    selectedCursorId: nextSettings.selectedCursorId ?? currentSettings.selectedCursorId,
    customCursors: nextSettings.customCursors ?? currentSettings.customCursors,
    customCursor: nextSettings.customCursor ?? currentSettings.customCursor
  })
  return {
    ...currentSettings,
    scale: Number(nextSettings.scale ?? currentSettings.scale ?? 1),
    walkSpeed: Number(nextSettings.walkSpeed ?? currentSettings.walkSpeed ?? 2),
    walkDuration: Number(nextSettings.walkDuration ?? currentSettings.walkDuration ?? 15000),
    bubbleDuration: Number(nextSettings.bubbleDuration ?? currentSettings.bubbleDuration ?? 6000),
    menuPosition: nextSettings.menuPosition || currentSettings.menuPosition || 'auto',
    autoStart: Boolean(nextSettings.autoStart ?? currentSettings.autoStart),
    selectedCursorId: cursorState.selectedCursorId,
    customCursors: cursorState.customCursors,
    customCursor: cursorState.customCursor,
    petBubbleChat: {
      ...(currentSettings.petBubbleChat || {}),
      ...(nextSettings.petBubbleChat || {}),
      enabled: nextSettings.petBubbleChat?.enabled ?? currentSettings.petBubbleChat?.enabled ?? true,
      autoPopup: nextSettings.petBubbleChat?.autoPopup ?? currentSettings.petBubbleChat?.autoPopup ?? true,
      autoHide: nextSettings.petBubbleChat?.autoHide ?? currentSettings.petBubbleChat?.autoHide ?? true,
      pinOnInteraction: nextSettings.petBubbleChat?.pinOnInteraction ?? currentSettings.petBubbleChat?.pinOnInteraction ?? true
    },
    petBehavior: {
      ...(currentSettings.petBehavior || {}),
      grounded: Boolean(nextSettings.grounded),
      home: {
        ...(currentHome || {}),
        enabled: Boolean(nextHome.enabled),
        radius: nextHome.radius || currentHome.radius || 'medium',
        anchor: currentHome.anchor || null
      }
    }
  }
}

const normalizeLocalHttpConfig = (currentConfig = {}, nextConfig = {}) => {
  const enabled = Boolean(nextConfig.enabled)
  const token = nextConfig.token || currentConfig.token || (enabled ? createLocalHttpToken() : '')
  return {
    ...currentConfig,
    ...nextConfig,
    host: '127.0.0.1',
    port: Number(nextConfig.port ?? currentConfig.port ?? 0),
    enabled,
    token
  }
}

const sendToPetWindow = (getPetWindow, channel, data) => {
  const petWindow = getPetWindow()
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send(channel, data)
  }
}

const reloadAndSendAnimations = (getPetWindow, petService) => {
  const animations = petService.reloadAnimations()
  sendToPetWindow(getPetWindow, IPC.PET_ANIMATIONS_CHANGED, animations)
  return animations
}

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
  if (decision.type === 'say') return { ...decision, result: petService.say({ text: decision.text, source: 'ai:behavior' }) }
  if (decision.type === 'setEvent') return { ...decision, result: petService.setEvent({ event: decision.event, message: decision.message, source: 'ai:behavior' }) }
  if (decision.type === 'playAction') return { ...decision, ...petService.playAction({ actionId: decision.actionId, source: 'ai:behavior' }) }
  return decision
}

const collectCustomCursorAssetPaths = (cursors = []) => (
  (Array.isArray(cursors) ? cursors : [])
    .map((cursor) => (typeof cursor?.assetPath === 'string' ? cursor.assetPath : ''))
    .filter(Boolean)
)

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

const createPetBubbleText = (reply, behaviorIntent) => {
  const preferred = normalizeMessageText(behaviorIntent?.bubbleText)
  const text = preferred || normalizeMessageText(reply)
  if (text.length <= MAX_PET_BUBBLE_CHARS) return text
  return `${text.slice(0, MAX_PET_BUBBLE_CHARS - 3)}...`
}

const normalizeBubbleSegments = (segments = [], fallback = '') => {
  const normalized = (Array.isArray(segments) ? segments : [])
    .map((segment) => normalizeMessageText(segment))
    .filter(Boolean)
  if (normalized.length) return normalized
  const fallbackText = normalizeMessageText(fallback)
  return fallbackText ? [fallbackText] : []
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

const registerIpcHandlers = ({
  getPetWindow,
  petService,
  petPackService,
  aiService,
  aiTalkService = null,
  petUtteranceLogService = null,
  petBubbleChatWindowService = null,
  imageGenerationModelService,
  behaviorOrchestratorService,
  pluginService,
  pluginInstallService,
  pluginGithubImportService,
  catalogService,
  localHttpService,
  aboutService,
  actionService,
  actionImportService,
  cursorAssetService,
  appLogService,
  applyWindowScale,
  applyPetViewport = () => {},
  clampToWorkArea,
  getMovementState,
  createSettingsWindow,
  petMovementPolicy,
  petChatWindowService = null,
  browserWindowService = BrowserWindow,
  dialogService = dialog,
  ipcMainService = ipcMain,
  screenService = screen,
  appService = app,
  showContextMenuWindow = showPetContextMenuWindow,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}) => {
  const state = {
    pendingActionFrameSelection: null,
    lastPetBubble: createEmptyPetBubble(),
    pendingAiBubbleTimers: []
  }

  const sendToControlCenterWindow = (channel, data) => {
    const petWindow = getPetWindow()
    const settingsWindow = petWindow?.settingsWindow
    if (settingsWindow && !settingsWindow.isDestroyed?.()) {
      settingsWindow.webContents?.send?.(channel, data)
    }
  }

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
    } catch (_) {}
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
    const config = aiService?.getConfig?.() || {}
    let profile = {}
    let messages = []
    try {
      profile = aiTalkService?.getPersonaProfile?.() || {}
    } catch (_) {}
    try {
      messages = (aiTalkService || aiService)?.getConversation?.('') || []
    } catch (_) {}
    const enabled = Boolean(config.enabled)
    const hasApiKey = Boolean(config.hasApiKey)
    const ready = enabled && hasApiKey
    return {
      available: Boolean(petChatWindowService),
      ...windowState,
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
        reason: ready ? '' : (enabled ? '请先在 Control Center 保存 AI API Key' : '请先在 Control Center 启用 AI Provider')
      },
      bubble: state.lastPetBubble,
      messages: sanitizeChatMessages(messages)
    }
  }

  const notifyPetChatStateChanged = (chatState = getPetChatState()) => {
    petChatWindowService?.sendStateChanged?.(chatState)
  }

  const clearPendingAiBubbleTimers = () => {
    state.pendingAiBubbleTimers.forEach((timer) => clearTimeoutFn(timer))
    state.pendingAiBubbleTimers = []
  }

  const dispatchAiBubbleSegments = (segments = []) => {
    clearPendingAiBubbleTimers()
    const normalizedSegments = normalizeBubbleSegments(segments)
    if (!normalizedSegments.length) return null
    let cumulativeDelayMs = 0
    let firstPayload = null
    normalizedSegments.forEach((segment, index) => {
      const ttlMs = calculateBubbleTtlMs({ text: segment })
      const payload = { text: segment, source: 'ai', ttlMs }
      if (index === 0) {
        firstPayload = petService.say(payload)
      } else {
        const timer = setTimeoutFn(() => {
          state.pendingAiBubbleTimers = state.pendingAiBubbleTimers.filter((candidate) => candidate !== timer)
          petService.say(payload)
        }, cumulativeDelayMs)
        timer?.unref?.()
        state.pendingAiBubbleTimers.push(timer)
      }
      cumulativeDelayMs += ttlMs
    })
    return firstPayload
  }

  const capturePetBubble = (payload = {}, { notify = true } = {}) => {
    const bubble = normalizePetBubble(payload)
    if (!bubble) return state.lastPetBubble
    state.lastPetBubble = bubble
    if (notify) notifyPetChatStateChanged()
    return state.lastPetBubble
  }

  const attachPetChatState = (response = {}, bubble = state.lastPetBubble) => {
    const chatState = getPetChatState()
    notifyPetChatStateChanged(chatState)
    return { ...response, bubble, state: chatState }
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
    const requestPayload = entrypoint && !payload?.entrypoint ? { ...payload, entrypoint } : payload
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
        requestedConversationId,
        messageChars,
        service: aiTalkService ? 'ai-talk' : 'ai'
      }
    })
    try {
      const result = await (aiTalkService || aiService).chat(requestPayload)
      const bubbleSegments = normalizeBubbleSegments(result.bubbleSegments, createPetBubbleText(result.reply, result.behaviorIntent))
      const dispatchedBubble = dispatchAiBubbleSegments(bubbleSegments)
      const currentBubbleText = String(dispatchedBubble?.text || bubbleSegments[0] || '')
      const bubble = currentBubbleText
        ? capturePetBubble({ text: currentBubbleText, source: 'ai', ttlMs: dispatchedBubble?.ttlMs }, { notify: false })
        : state.lastPetBubble
      if (bubbleSegments.length) {
        recordAppLog({
          scope: 'ai-chat',
          level: 'info',
          actor: 'system',
          event: 'ai-chat.bubble.dispatching',
          message: 'AI chat bubble dispatching to pet service',
          details: { source, textChars: currentBubbleText.length, segmentCount: bubbleSegments.length }
        })
        recordAppLog({
          scope: 'ai-chat',
          level: 'info',
          actor: 'system',
          event: 'ai-chat.bubble.dispatched',
          message: 'AI chat bubble dispatched to pet service',
          details: { source, textChars: currentBubbleText.length, hasTtl: Number.isFinite(Number(dispatchedBubble?.ttlMs)) }
        })
      }
      if (behaviorOrchestratorService?.getConfig?.().enabled) {
        const decision = behaviorOrchestratorService.evaluate({
          reply: result.reply,
          behaviorIntent: result.behaviorIntent,
          actions: petService.getAnimations()?.actions || []
        })
        aiTalkService?.attachBehaviorTrace?.(result.traceId, decision)
        const behavior = executeBehaviorDecision(petService, decision)
        const response = behavior?.matched && behavior.type === 'playAction' ? { ...result, behavior, action: behavior } : { ...result, behavior }
        recordAppLog({
          scope: 'ai-chat',
          level: 'info',
          actor: 'system',
          event: 'ai-chat.ipc.completed',
          message: 'AI chat IPC request completed',
          details: {
            source,
            requestedConversationId,
            conversationId: result.conversationId || '',
            elapsedMs: Date.now() - startedAt,
            replyChars: String(result.reply || '').length,
            bubbleChars: currentBubbleText.length,
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
          requestedConversationId,
          conversationId: result.conversationId || '',
          elapsedMs: Date.now() - startedAt,
          replyChars: String(result.reply || '').length,
          bubbleChars: currentBubbleText.length,
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
          requestedConversationId,
          elapsedMs: Date.now() - startedAt,
          errorName: sanitizeDiagnosticText(error?.name || 'Error'),
          errorMessage: error?.providerStatus ? 'AI provider returned an error response' : sanitizeDiagnosticText(error?.message),
          providerStatus: error?.providerStatus || 0,
          providerCode: error?.providerCode || ''
        }
      })
      throw error
    }
  }

  const getPendingActionFrameSelection = (selectionId) => {
    if (!state.pendingActionFrameSelection || state.pendingActionFrameSelection.id !== selectionId) {
      throw new Error('Selected frame folder is no longer available')
    }
    return state.pendingActionFrameSelection
  }

  const inspectPendingActionFrameSelection = async ({ selectionId, actionId }) => {
    const selection = getPendingActionFrameSelection(selectionId)
    const result = await actionImportService.inspectActionFrames({ sourceDir: selection.sourceDir, actionId })
    return { selectionId: selection.id, ...result }
  }

  const context = {
    state,
    getPetWindow,
    petService,
    petPackService,
    aiService,
    aiTalkService,
    petUtteranceLogService,
    petBubbleChatWindowService,
    imageGenerationModelService,
    behaviorOrchestratorService,
    pluginService,
    pluginInstallService,
    pluginGithubImportService,
    catalogService,
    localHttpService,
    aboutService,
    actionService,
    actionImportService,
    cursorAssetService,
    appLogService,
    applyWindowScale,
    applyPetViewport,
    clampToWorkArea,
    getMovementState,
    createSettingsWindow,
    petMovementPolicy,
    petChatWindowService,
    browserWindowService,
    dialogService,
    ipcMainService,
    screenService,
    appService,
    showContextMenuWindow,
    choosePetContextMenuPoint,
    estimatePetContextMenuSize,
    sanitizeDetails,
    helpers: {
      sendToPetWindow,
      sendToControlCenterWindow,
      createSelectionId,
      showOpenDialogForEvent,
      recordAppLog,
      getActivePetPackId,
      recordPetUtterance,
      getPetChatState,
      notifyPetChatStateChanged,
      clearPendingAiBubbleTimers,
      dispatchAiBubbleSegments,
      capturePetBubble,
      attachPetChatState,
      assertPetChatReady,
      requestAppQuit,
      runAiChatRequest,
      getPendingActionFrameSelection,
      inspectPendingActionFrameSelection,
      setPendingActionFrameSelection: (selection) => { state.pendingActionFrameSelection = selection },
      clearPendingActionFrameSelection: () => { state.pendingActionFrameSelection = null },
      normalizeMessageText,
      sanitizeDiagnosticText,
      collectCustomCursorAssetPaths,
      createPetRendererSettings,
      mergePetSettingsViewIntoHostSettings,
      normalizeLocalHttpConfig,
      reloadAndSendAnimations,
      createActionFrameImportResult,
      createActionsMutationResult,
      createAboutInfoView,
      createCatalogBlocklistResult,
      createPetPackMutationResult,
      createPluginMutationResult,
      createServiceStatusView,
      createUpdateCheckView,
      createLocalHttpToken
    },
    createPetPackMutationResult
  }

  registerPetIpc(context)
  registerChatIpc(context)
  registerSettingsIpc(context)
  registerPluginIpc(context)
  registerSystemIpc(context)
}

module.exports = {
  createPetRendererSettings,
  normalizeLocalHttpConfig,
  reloadAndSendAnimations,
  registerIpcHandlers,
  triggerAiSemanticAction,
  executeBehaviorDecision
}
