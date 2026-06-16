/**
 * IPC 注册模块 —— 集中注册所有主进程侧 IPC 处理器。
 *
 * 为什么独立存在：
 * — 13 条 IPC 通道的注册逻辑如果散落在 main.js 中，会淹没应用生命周期代码。
 * — 依赖通过参数注入而非直接 import，避免与 window/settings/screen 模块形成硬耦合。
 * — 修改或新增 IPC 通道时，只需改这一个文件 + shared/ipc-channels.js。
 */
const { ipcMain, BrowserWindow, app, dialog } = require('electron')
const { IPC } = require('../shared/ipc-channels')
const {
  createActionFrameImportResult,
  createActionsMutationResult,
  createAboutInfoView,
  createCatalogBlocklistResult,
  createPetPackMutationResult,
  createPluginMutationResult,
  createServiceStatusView,
  createUpdateCheckView
} = require('./control-center-adapters')
const { findSemanticAction } = require('./services/ai-action-orchestrator')
const { createLocalHttpToken } = require('./services/local-http-service')

const createPetRendererSettings = (settings = {}) => ({
  scale: settings.scale,
  walkSpeed: settings.walkSpeed,
  walkDuration: settings.walkDuration,
  bubbleDuration: settings.bubbleDuration
})

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
  if (decision.type === 'say') {
    return { ...decision, result: petService.say({ text: decision.text, source: 'ai:behavior' }) }
  }
  if (decision.type === 'setEvent') {
    return { ...decision, result: petService.setEvent({ event: decision.event, message: decision.message, source: 'ai:behavior' }) }
  }
  if (decision.type === 'playAction') {
    return { ...decision, ...petService.playAction({ actionId: decision.actionId, source: 'ai:behavior' }) }
  }
  return decision
}

/**
 * 注册所有 IPC 处理器。接收依赖注入对象，各 handler 只通过注入的函数访问外部能力。
 */
const registerIpcHandlers = ({ getPetWindow, petService, petPackService, aiService, behaviorOrchestratorService, pluginService, pluginInstallService, catalogService, localHttpService, aboutService, actionImportService, applyWindowScale,
  clampToWorkArea, getMovementState, createSettingsWindow, dialogService = dialog, ipcMainService = ipcMain }) => {
  let pendingActionFrameSelection = null

  const createSelectionId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

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
    sendToPetWindow(getPetWindow, IPC.PET_SAY, payload)
  })
  petService.onAction?.((payload) => {
    sendToPetWindow(getPetWindow, IPC.PET_PLAY_ACTION, payload)
  })
  petService.onEvent?.((payload) => {
    if (payload?.message) sendToPetWindow(getPetWindow, IPC.PET_SAY, { text: payload.message, ttlMs: payload.ttlMs, source: payload.source })
  })

  // 渲染进程启动时请求动作列表（通过 preload 暴露的 getAnimations 调用）
  ipcMainService.handle(IPC.PET_GET_ANIMATIONS, () => petService.getAnimations())

  // 拖拽开始时读取窗口位置，用于计算鼠标偏移
  ipcMainService.handle(IPC.PET_GET_BOUNDS, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win.getBounds()
  })

  // 散步启动时查询窗口是否贴边，用于决定初始方向
  ipcMainService.handle(IPC.PET_GET_MOVEMENT_STATE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    return getMovementState(win)
  })

  // 拖拽移动：直接设置窗口位置（主进程负责钳制到工作区）
  ipcMainService.on(IPC.PET_SET_POSITION, (event, point) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !point) return
    const next = clampToWorkArea(win, point.x, point.y)
    win.setPosition(next.x, next.y)
  })

  // 散步移动：增量偏移窗口，返回是否撞到边界供渲染进程决定掉头
  ipcMainService.handle(IPC.PET_MOVE_BY, (event, delta) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !delta) return null
    const [x, y] = win.getPosition()
    const next = clampToWorkArea(win, x + delta.x, y + delta.y)
    win.setPosition(next.x, next.y)
    return next
  })

  // 右键菜单"退出"
  ipcMainService.on(IPC.PET_QUIT, () => app.quit())

  // 右键菜单"设置"：打开设置面板
  ipcMainService.on(IPC.SETTINGS_OPEN, () => {
    createSettingsWindow(getPetWindow())
  })

  // 设置面板启动时读取当前设置
  ipcMainService.handle(IPC.SETTINGS_GET, () => petService.getSettings())

  ipcMainService.handle(IPC.ACTIONS_GET, () => petService.getPreviewAnimations())

  ipcMainService.handle(IPC.ACTIONS_INSPECT_FRAMES, async (_event, payload) => {
    const selected = await dialogService.showOpenDialog({
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
    return createActionFrameImportResult({ ok: true, canceled: false, result }, petService.getPreviewAnimations())
  })

  ipcMainService.handle(IPC.ACTIONS_SAVE_CONFIG, async (_event, payload) => {
    await actionImportService.updateActionConfig(payload)
    reloadAndSendAnimations(getPetWindow, petService)
    return createActionsMutationResult(petService.getPreviewAnimations())
  })

  ipcMainService.handle(IPC.ACTIONS_DELETE, async (_event, payload) => {
    await actionImportService.deleteAction(payload.actionId)
    reloadAndSendAnimations(getPetWindow, petService)
    return createActionsMutationResult(petService.getPreviewAnimations())
  })

  ipcMainService.handle(IPC.PET_PACKS_LIST, () => petPackService.listPacks())

  ipcMainService.handle(IPC.PET_PACKS_INSPECT_DIRECTORY, async () => {
    const selected = await dialogService.showOpenDialog({
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
    const result = petPackService.importPack(payload.selectionId)
    return createPetPackMutationResult(result, petPackService.listPacks())
  })

  ipcMainService.handle(IPC.PET_PACKS_EXPORT, async (_event, payload) => {
    const selected = await dialogService.showOpenDialog({
      title: '选择 Pet Pack 导出目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
    return { canceled: false, ...petPackService.exportPack(payload.packId, selected.filePaths[0]) }
  })

  ipcMainService.handle(IPC.PET_PACKS_SET_ACTIVE, (_event, payload) => {
    const result = petPackService.setActivePack(payload.packId)
    reloadAndSendAnimations(getPetWindow, petService)
    const animations = petService.getPreviewAnimations()
    const petPacks = petPackService.listPacks()
    return createPetPackMutationResult(result, petPacks, animations)
  })

  ipcMainService.handle(IPC.PET_PACKS_REMOVE, (_event, payload) => {
    const result = petPackService.removePack(payload.packId)
    return createPetPackMutationResult(result, petPackService.listPacks())
  })

  // 设置面板点击"保存"：持久化并通知宠物窗口应用变更
  ipcMainService.handle(IPC.SETTINGS_SAVE, (_event, settings) => {
    const savedSettings = petService.saveSettings(settings)
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, createPetRendererSettings(savedSettings))
    applyWindowScale(getPetWindow(), savedSettings.scale)
    return savedSettings
  })

  ipcMainService.handle(IPC.AI_GET_CONFIG, () => aiService.getConfig())

  ipcMainService.handle(IPC.AI_SAVE_CONFIG, (_event, config) => aiService.saveConfig(config))

  ipcMainService.handle(IPC.AI_SAVE_API_KEY, (_event, apiKey) => aiService.saveApiKey(apiKey))

  ipcMainService.handle(IPC.AI_TEST_CONNECTION, () => aiService.testConnection())

  ipcMainService.handle(IPC.AI_GET_CONVERSATION, (_event, payload) => {
    return aiService.getConversation(payload?.conversationId || payload)
  })

  ipcMainService.handle(IPC.AI_CHAT, async (_event, payload) => {
    const result = await aiService.chat(payload)
    petService.say({ text: result.reply, source: 'ai' })
    if (behaviorOrchestratorService?.getConfig?.().enabled) {
      const decision = behaviorOrchestratorService.evaluate({
        reply: result.reply,
        behaviorIntent: result.behaviorIntent,
        actions: petService.getAnimations()?.actions || []
      })
      const behavior = executeBehaviorDecision(petService, decision)
      return behavior?.matched && behavior.type === 'playAction'
        ? { ...result, behavior, action: behavior }
        : { ...result, behavior }
    }
    const action = triggerAiSemanticAction(petService, result.reply)
    return action ? { ...result, action } : result
  })

  ipcMainService.handle(IPC.AI_BEHAVIOR_GET, () => behaviorOrchestratorService.getConfig())

  ipcMainService.handle(IPC.AI_BEHAVIOR_SAVE, (_event, payload) => behaviorOrchestratorService.saveConfig(payload))

  ipcMainService.handle(IPC.AI_BEHAVIOR_DRY_RUN, (_event, payload) => {
    return behaviorOrchestratorService.dryRun({
      ...payload,
      actions: petService.getAnimations()?.actions || []
    })
  })

  ipcMainService.handle(IPC.AI_BEHAVIOR_REPLAY_DECISION, (_event, payload) => {
    return behaviorOrchestratorService.replayDecision({
      decisionId: payload?.decisionId,
      actions: petService.getAnimations()?.actions || []
    })
  })

  ipcMainService.handle(IPC.AI_BEHAVIOR_EXPORT_DIAGNOSTICS, () => behaviorOrchestratorService.exportDiagnostics())

  ipcMainService.handle(IPC.AI_BEHAVIOR_CLEAR_DECISIONS, () => behaviorOrchestratorService.clearDecisions())

  ipcMainService.handle(IPC.PLUGINS_LIST, () => pluginService.listPlugins())

  ipcMainService.handle(IPC.PLUGINS_SET_ENABLED, (_event, payload) => {
    return pluginService.setEnabled(payload.pluginId, payload.enabled)
  })

  ipcMainService.handle(IPC.PLUGINS_SAVE_CONFIG, (_event, payload) => {
    return pluginService.saveConfig(payload.pluginId, payload.config)
  })

  ipcMainService.handle(IPC.PLUGINS_RUN_COMMAND, (_event, payload) => {
    return pluginService.runCommand(payload.pluginId, payload.commandId, payload.payload)
  })

  ipcMainService.handle(IPC.PLUGINS_OPEN_DASHBOARD, (_event, payload) => {
    return pluginService.openDashboard(payload.pluginId, payload.dashboardId)
  })

  ipcMainService.handle(IPC.PLUGINS_START_SERVICE, (_event, payload) => {
    return pluginService.startService(payload.pluginId, payload.serviceId)
  })

  ipcMainService.handle(IPC.PLUGINS_STOP_SERVICE, (_event, payload) => {
    return pluginService.stopService(payload.pluginId, payload.serviceId)
  })

  ipcMainService.handle(IPC.PLUGINS_INSPECT_PACKAGE, async () => {
    const selected = await dialogService.showOpenDialog({
      title: '选择插件目录或 OpenPet 插件包',
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: 'OpenPet Plugin Package', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
    return { canceled: false, ...pluginInstallService.inspectPluginPackage(selected.filePaths[0]) }
  })

  ipcMainService.handle(IPC.PLUGINS_CLEAR_SELECTION, (_event, payload) => {
    return pluginInstallService.clearPendingSelection(payload?.selectionId)
  })

  ipcMainService.handle(IPC.PLUGINS_INSTALL, (_event, payload) => {
    const result = pluginInstallService.installPlugin(payload.selectionId)
    return createPluginMutationResult(result, pluginService.listPlugins())
  })

  ipcMainService.handle(IPC.PLUGINS_UPDATE, (_event, payload) => {
    const result = pluginInstallService.updatePlugin(payload.selectionId)
    return createPluginMutationResult(result, pluginService.listPlugins())
  })

  ipcMainService.handle(IPC.PLUGINS_UNINSTALL, (_event, payload) => {
    const result = pluginInstallService.uninstallPlugin(payload.pluginId, { removeStorage: Boolean(payload.removeStorage) })
    return createPluginMutationResult(result, pluginService.listPlugins())
  })

  ipcMainService.handle(IPC.PLUGINS_GET_LOGS, (_event, filters) => pluginService.getLogs(filters))

  ipcMainService.handle(IPC.PLUGINS_EXPORT_LOGS, (_event, filters) => pluginService.exportLogs(filters))

  ipcMainService.handle(IPC.PLUGINS_CLEAR_LOGS, () => pluginService.clearLogs())

  ipcMainService.handle(IPC.PLUGINS_CLEAR_STORAGE, (_event, payload) => pluginService.clearStorage(payload.pluginId))

  const getServiceStatusView = () => createServiceStatusView(
    petService.getSettings().localHttp,
    localHttpService.getStatus()
  )

  ipcMainService.handle(IPC.SERVICE_GET_STATUS, getServiceStatusView)

  ipcMainService.handle(IPC.SERVICE_GET_LOGS, (_event, filters) => localHttpService.getLogs(filters))

  ipcMainService.handle(IPC.SERVICE_EXPORT_LOGS, (_event, filters) => localHttpService.exportLogs(filters))

  ipcMainService.handle(IPC.SERVICE_CLEAR_LOGS, () => localHttpService.clearLogs())

  ipcMainService.handle(IPC.SERVICE_ROTATE_TOKEN, async () => {
    const currentSettings = petService.getSettings()
    const nextConfig = normalizeLocalHttpConfig(currentSettings.localHttp, {
      ...currentSettings.localHttp,
      token: createLocalHttpToken()
    })
    const runtime = nextConfig.enabled
      ? await localHttpService.start(nextConfig)
      : localHttpService.getStatus()
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createServiceStatusView(savedSettings.localHttp, localHttpService.getStatus() || runtime)
  })

  ipcMainService.handle(IPC.SERVICE_REVOKE_MCP_SESSIONS, () => {
    const mcp = localHttpService.revokeMcpSessions()
    return createServiceStatusView(petService.getSettings().localHttp, { ...localHttpService.getStatus(), mcp })
  })

  ipcMainService.handle(IPC.SERVICE_SAVE_CONFIG, async (_event, config) => {
    const currentSettings = petService.getSettings()
    const nextConfig = normalizeLocalHttpConfig(currentSettings.localHttp, config)
    const runtime = nextConfig.enabled
      ? await localHttpService.start(nextConfig)
      : await localHttpService.stop()
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createServiceStatusView(savedSettings.localHttp, localHttpService.getStatus() || runtime)
  })

  ipcMainService.handle(IPC.ABOUT_GET_INFO, () => createAboutInfoView(aboutService.getInfo()))

  ipcMainService.handle(IPC.ABOUT_CHECK_UPDATES, async () => createUpdateCheckView(await aboutService.checkForUpdates()))

  ipcMainService.handle(IPC.CATALOG_GET, () => catalogService.listCatalog())

  ipcMainService.handle(IPC.CATALOG_PREPARE_INSTALL, (_event, payload) => catalogService.prepareInstall(payload))

  ipcMainService.handle(IPC.CATALOG_INSTALL_SELECTION, (_event, payload) => {
    const result = catalogService.installSelection(payload.selectionId)
    if (result.kind === 'pet-pack' && result.petPacks?.activePackId === result.itemId) {
      reloadAndSendAnimations(getPetWindow, petService)
      return { ...result, animations: petService.getPreviewAnimations(), catalog: catalogService.listCatalog() }
    }
    return { ...result, catalog: catalogService.listCatalog() }
  })

  ipcMainService.handle(IPC.CATALOG_CLEAR_SELECTION, (_event, payload) => catalogService.clearSelection(payload?.selectionId))

  ipcMainService.handle(IPC.CATALOG_ADD_BLOCKLIST, (_event, payload) => {
    const blocklist = catalogService.addBlocklistEntry(payload)
    return createCatalogBlocklistResult(catalogService.listCatalog(), blocklist)
  })

  ipcMainService.handle(IPC.CATALOG_REMOVE_BLOCKLIST, (_event, payload) => {
    const blocklist = catalogService.removeBlocklistEntry(payload)
    return createCatalogBlocklistResult(catalogService.listCatalog(), blocklist)
  })

  // 设置面板拖动滑块：实时预览缩放（不持久化）
  ipcMainService.on(IPC.SETTINGS_PREVIEW_SCALE, (_event, scale) => {
    petService.previewSettings({ scale })
    applyWindowScale(getPetWindow(), scale)
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, { scale })
  })

  // 设置面板关闭：清理 settingsWindow 引用
  ipcMainService.on(IPC.SETTINGS_CLOSE, (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    if (win) {
      const petWindow = getPetWindow()
      if (petWindow && petWindow.settingsWindow === win) {
        petWindow.settingsWindow = null
      }
      win.close()
    }
  })
}

module.exports = { createPetRendererSettings, normalizeLocalHttpConfig, registerIpcHandlers, triggerAiSemanticAction, executeBehaviorDecision }
