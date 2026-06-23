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
const { normalizeCursorSettingsState } = require('../shared/cursor-library')
const { choosePetContextMenuPoint, estimatePetContextMenuSize } = require('./pet-context-menu')
const { showPetContextMenuWindow } = require('./pet-context-menu-window')
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
    bubbleDuration: Number(nextSettings.bubbleDuration ?? currentSettings.bubbleDuration ?? 1300),
    menuPosition: nextSettings.menuPosition || currentSettings.menuPosition || 'auto',
    autoStart: Boolean(nextSettings.autoStart ?? currentSettings.autoStart),
    selectedCursorId: cursorState.selectedCursorId,
    customCursors: cursorState.customCursors,
    customCursor: cursorState.customCursor,
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

const collectCustomCursorAssetPaths = (cursors = []) => (
  (Array.isArray(cursors) ? cursors : [])
    .map((cursor) => (typeof cursor?.assetPath === 'string' ? cursor.assetPath : ''))
    .filter(Boolean)
)

const sanitizeDiagnosticText = (value) => String(value || '')
  .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-secret]')
  .slice(0, 240)

/**
 * 注册所有 IPC 处理器。接收依赖注入对象，各 handler 只通过注入的函数访问外部能力。
 */
const registerIpcHandlers = ({ getPetWindow, petService, petPackService, aiService, aiTalkService = null, imageGenerationModelService, behaviorOrchestratorService, pluginService, pluginInstallService, pluginGithubImportService, catalogService, localHttpService, aboutService, actionService, actionImportService, cursorAssetService, appLogService, applyWindowScale, applyPetViewport = () => {},
  clampToWorkArea, getMovementState, createSettingsWindow, petMovementPolicy, browserWindowService = BrowserWindow, dialogService = dialog, ipcMainService = ipcMain, screenService = screen, appService = app, showContextMenuWindow = showPetContextMenuWindow }) => {
  let pendingActionFrameSelection = null

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
    const win = browserWindowService.fromWebContents(event.sender)
    return win.getBounds()
  })

  // 散步启动时查询窗口是否贴边，用于决定初始方向
  ipcMainService.handle(IPC.PET_GET_MOVEMENT_STATE, (event) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win) return null
    return getMovementState(win)
  })

  ipcMainService.on(IPC.PET_SET_VIEWPORT, (event, viewport) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win || !viewport) return
    applyPetViewport(win, viewport)
  })

  // 拖拽移动：直接设置窗口位置（主进程负责钳制到工作区）
  ipcMainService.on(IPC.PET_SET_POSITION, (event, point) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win || !point) return
    const next = petMovementPolicy
      ? petMovementPolicy.clampDragPosition({
          windowBounds: win.getBounds(),
          requestedTopLeft: { x: point.x, y: point.y },
          settings: petService.getSettings().petBehavior
        })
      : clampToWorkArea(win, point.x, point.y)
    win.setPosition(next.x, next.y)
  })

  ipcMainService.on(IPC.PET_SET_MOUSE_PASSTHROUGH, (event, passthrough) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win || typeof win.setIgnoreMouseEvents !== 'function') return
    if (passthrough) win.setIgnoreMouseEvents(true, { forward: true })
    else win.setIgnoreMouseEvents(false)
  })

  ipcMainService.on(IPC.PET_RECORD_APP_LOG, (_event, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return
    recordAppLog(entry)
  })

  ipcMainService.on(IPC.PET_DRAG_ENDED, (event) => {
    if (!petMovementPolicy) return
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win) return
    const currentSettings = petService.getSettings()
    const behavior = petMovementPolicy.normalizePetBehaviorSettings(currentSettings.petBehavior)
    if (!behavior.home.enabled) return
    const anchor = petMovementPolicy.createHomeAnchorFromWindow({ windowBounds: win.getBounds() })
    const savedSettings = petService.saveSettings({
      ...currentSettings,
      petBehavior: {
        ...behavior,
        home: {
          ...behavior.home,
          anchor
        }
      }
    })
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, createPetRendererSettings(savedSettings))
  })

  ipcMainService.on(IPC.PET_SET_MOUSE_PASSTHROUGH, (event, passthrough) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win || typeof win.setIgnoreMouseEvents !== 'function') return
    if (passthrough) win.setIgnoreMouseEvents(true, { forward: true })
    else win.setIgnoreMouseEvents(false)
  })

  ipcMainService.on(IPC.PET_REQUEST_FOCUS_FOR_CURSOR, (event) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win || typeof win.focus !== 'function') return
    if (win.contextMenuWindow && !win.contextMenuWindow.isDestroyed?.()) return
    if (typeof win.isFocused === 'function' && win.isFocused()) return
    if (typeof win.isMinimized === 'function' && win.isMinimized() && typeof win.restore === 'function') win.restore()
    win.focus()
    recordAppLog({
      scope: 'pet-window',
      level: 'debug',
      actor: 'system',
      event: 'pet.cursor.focus.requested',
      message: 'Pet window focus requested for custom cursor'
    })
  })

  ipcMainService.on(IPC.PET_RECORD_APP_LOG, (_event, entry = {}) => {
    if (!entry || typeof entry !== 'object') return
    recordAppLog({
      scope: 'pet-renderer',
      level: entry.level,
      actor: entry.actor,
      event: entry.event,
      message: entry.message,
      details: sanitizeDetails(entry.details)
    })
  })

  // 散步移动：增量偏移窗口，返回是否撞到边界供渲染进程决定掉头
  ipcMainService.handle(IPC.PET_MOVE_BY, (event, delta) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win || !delta) return null
    const [x, y] = win.getPosition()
    const next = petMovementPolicy
      ? petMovementPolicy.clampMoveBy({
          windowBounds: win.getBounds(),
          delta,
          settings: petService.getSettings().petBehavior
        })
      : clampToWorkArea(win, x + delta.x, y + delta.y)
    win.setPosition(next.x, next.y)
    return next
  })

  // 右键菜单"退出"
  ipcMainService.on(IPC.PET_QUIT, () => requestAppQuit('pet-renderer'))

  ipcMainService.handle(IPC.PET_SHOW_CONTEXT_MENU, (event, point = {}) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return null
    const actions = petService.getAnimations()?.actions || []
    const bounds = win.getBounds()
    const { workArea } = screenService.getDisplayMatching(bounds)
    const menuSize = estimatePetContextMenuSize(actions)
    const settings = petService.getSettings?.() || {}
    const requestedPoint = {
      x: Number(point.x),
      y: Number(point.y)
    }
    const placement = choosePetContextMenuPoint({
      petBounds: bounds,
      workArea,
      menuSize,
      menuPosition: settings.menuPosition,
      preferredPoint: requestedPoint
    })
    const sendMenuCommand = (payload) => sendToPetWindow(() => win, IPC.PET_MENU_COMMAND, payload)
    const template = [
      ...actions.map((action) => ({
        label: action.label || action.id,
        click: () => sendMenuCommand({ command: 'action', actionId: action.id })
      })),
      { type: 'separator' },
      { label: '散步', click: () => sendMenuCommand({ command: 'walk' }) },
      { label: '设置', click: () => createSettingsWindow(win) },
      { type: 'separator' },
      { label: '退出', click: () => requestAppQuit('pet-context-menu') }
    ]
    recordAppLog({
      scope: 'pet-menu',
      level: 'info',
      actor: 'user',
      event: 'pet.menu.popup',
      message: 'Pet context menu popup requested',
      details: {
        petX: bounds.x,
        petY: bounds.y,
        petWidth: bounds.width,
        petHeight: bounds.height,
        workAreaX: workArea.x,
        workAreaY: workArea.y,
        workAreaWidth: workArea.width,
        workAreaHeight: workArea.height,
        menuWidth: menuSize.width,
        menuHeight: menuSize.height,
        requestedX: requestedPoint.x,
        requestedY: requestedPoint.y,
        placement: placement.placement,
        menuX: placement.screenPoint.x,
        menuY: placement.screenPoint.y,
        popupX: placement.windowPoint.x,
        popupY: placement.windowPoint.y
      }
    })
    showContextMenuWindow({
      BrowserWindow: browserWindowService,
      parentWindow: win,
      items: template,
      point: placement.screenPoint,
      size: menuSize,
      onSelect: (item) => item?.click?.()
    })
    return placement
  })

  // 右键菜单"设置"：打开设置面板
  ipcMainService.on(IPC.SETTINGS_OPEN, () => {
    createSettingsWindow(getPetWindow())
  })

  // 设置面板启动时读取当前设置
  ipcMainService.handle(IPC.SETTINGS_GET, () => createPetRendererSettings(petService.getSettings()))

  ipcMainService.handle(IPC.SETTINGS_IMPORT_CURSOR, async (event) => {
    if (!cursorAssetService?.importCursor) throw new Error('Cursor asset import is not available')
    recordAppLog({
      scope: 'settings',
      level: 'info',
      actor: 'user',
      event: 'settings.cursor.import.opened',
      message: 'Cursor image picker opened'
    })
    try {
      const selected = await showOpenDialogForEvent(event, {
        title: '选择自定义鼠标指针图片',
        properties: ['openFile'],
        filters: [{ name: 'Cursor Images', extensions: ['png', 'webp'] }]
      })
      if (selected.canceled || !selected.filePaths[0]) {
        recordAppLog({
          scope: 'settings',
          level: 'info',
          actor: 'user',
          event: 'settings.cursor.import.canceled',
          message: 'Cursor image picker canceled'
        })
        return { canceled: true }
      }
      const cursor = await cursorAssetService.importCursor(selected.filePaths[0])
      recordAppLog({
        scope: 'settings',
        level: 'info',
        actor: 'system',
        event: 'settings.cursor.import.completed',
        message: 'Cursor image imported',
        details: {
          fileName: cursor.fileName,
          enabled: cursor.enabled
        }
      })
      return { canceled: false, cursor }
    } catch (error) {
      recordAppLog({
        scope: 'settings',
        level: 'error',
        actor: 'system',
        event: 'settings.cursor.import.failed',
        message: error.message
      })
      throw error
    }
  })

  ipcMainService.handle(IPC.ACTIONS_GET, () => petService.getPreviewAnimations())

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
    return createActionFrameImportResult({ ok: true, canceled: false, result }, petService.getPreviewAnimations())
  })

  ipcMainService.handle(IPC.ACTIONS_SAVE_CONFIG, async (_event, payload) => {
    if (payload?.triggerProposal) {
      if (!actionService?.acceptTriggerProposal) throw new Error('Action trigger proposal acceptance is not available')
      const triggerProposal = actionService.acceptTriggerProposal(payload.triggerProposal)
      const animations = triggerProposal.applied
        ? reloadAndSendAnimations(getPetWindow, petService)
        : petService.getPreviewAnimations()
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
      return createActionsMutationResult(animations, { triggerProposal })
    }
    await actionImportService.updateActionConfig(payload)
    reloadAndSendAnimations(getPetWindow, petService)
    return createActionsMutationResult(petService.getPreviewAnimations())
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
    return createActionsMutationResult(result.animations, { proposal: result.proposal })
  })

  ipcMainService.handle(IPC.ACTIONS_ACCEPT_TRIGGER_PROPOSAL, async (_event, payload) => {
    if (!actionService?.acceptTriggerProposalItem) throw new Error('Action trigger proposal inbox is not available')
    const result = actionService.acceptTriggerProposalItem(payload?.proposalId)
    const animations = result.triggerProposal?.applied
      ? reloadAndSendAnimations(getPetWindow, petService)
      : result.animations
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
    return createActionsMutationResult(animations, { proposal: result.proposal, triggerProposal: result.triggerProposal })
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
    return createActionsMutationResult(result.animations, { proposal: result.proposal })
  })

  ipcMainService.handle(IPC.ACTIONS_DELETE, async (_event, payload) => {
    await actionImportService.deleteAction(payload.actionId)
    reloadAndSendAnimations(getPetWindow, petService)
    return createActionsMutationResult(petService.getPreviewAnimations())
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
    const result = petPackService.importPack(payload.selectionId)
    const petPacks = petPackService.listPacks()
    if (result?.pack?.id && petPacks?.activePackId === result.pack.id) {
      const animations = reloadAndSendAnimations(getPetWindow, petService)
      return createPetPackMutationResult(result, petPacks, animations)
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
    const petWindow = getPetWindow()
    const previousSettings = petService.getSettings()
    const nextSettings = mergePetSettingsViewIntoHostSettings(petService.getSettings(), settings)
    if (petMovementPolicy && petWindow && !petWindow.isDestroyed()) {
      const behavior = petMovementPolicy.normalizePetBehaviorSettings(nextSettings.petBehavior)
      const currentBehavior = petMovementPolicy.normalizePetBehaviorSettings(previousSettings.petBehavior)
      const needsInitialHomeAnchor = behavior.home.enabled && !behavior.home.anchor
      if (needsInitialHomeAnchor || (!currentBehavior.home.enabled && behavior.home.enabled)) {
        behavior.home.anchor = petMovementPolicy.createHomeAnchorFromWindow({ windowBounds: petWindow.getBounds() })
      }
      nextSettings.petBehavior = behavior
    }

    const savedSettings = petService.saveSettings(nextSettings)
    const previousAssetPaths = new Set(collectCustomCursorAssetPaths(previousSettings.customCursors))
    const nextAssetPaths = new Set(collectCustomCursorAssetPaths(savedSettings.customCursors))
    const orphanedAssetPaths = Array.from(previousAssetPaths).filter((assetPath) => !nextAssetPaths.has(assetPath))
    if (orphanedAssetPaths.length > 0) cursorAssetService?.deleteAssets?.(orphanedAssetPaths)
    const rendererSettings = createPetRendererSettings(savedSettings)
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, rendererSettings)
    recordAppLog({
      scope: 'settings',
      level: 'info',
      actor: 'user',
      event: 'settings.saved',
      message: 'Settings saved',
      details: {
        grounded: Boolean(savedSettings.petBehavior?.grounded),
        homeEnabled: Boolean(savedSettings.petBehavior?.home?.enabled),
        homeRadius: savedSettings.petBehavior?.home?.radius || 'medium',
        customCursorEnabled: Boolean(savedSettings.customCursor?.enabled),
        customCursorFileName: savedSettings.customCursor?.fileName || ''
      }
    })
    return rendererSettings
  })

  ipcMainService.handle(IPC.AI_GET_CONFIG, () => aiService.getConfig())

  ipcMainService.handle(IPC.AI_SAVE_CONFIG, (_event, config) => aiService.saveConfig(config))

  ipcMainService.handle(IPC.AI_SAVE_API_KEY, (_event, apiKey) => aiService.saveApiKey(apiKey))

  ipcMainService.handle(IPC.AI_TEST_CONNECTION, () => aiService.testConnection())

  ipcMainService.handle(IPC.AI_GET_PERSONA_PROFILE, () => {
    if (!aiTalkService?.getPersonaProfile) throw new Error('AI talk persona profile is not available')
    return aiTalkService.getPersonaProfile()
  })

  ipcMainService.handle(IPC.AI_GENERATE_PERSONA_DRAFT, (_event, request) => {
    if (!aiTalkService?.generatePersonaDraft) throw new Error('AI talk persona generation is not available')
    return aiTalkService.generatePersonaDraft(request || {})
  })

  ipcMainService.handle(IPC.AI_SAVE_PERSONA_OVERRIDE, (_event, override) => {
    if (!aiTalkService?.savePersonaOverride) throw new Error('AI talk persona overrides are not available')
    return aiTalkService.savePersonaOverride(override || {})
  })

  ipcMainService.handle(IPC.AI_GET_MEMORY_PROFILE, () => {
    if (!aiTalkService?.getMemoryProfile) throw new Error('AI talk memories are not available')
    return aiTalkService.getMemoryProfile()
  })

  ipcMainService.handle(IPC.AI_DELETE_MEMORY, (_event, payload) => {
    if (!aiTalkService?.deleteMemory) throw new Error('AI talk memory deletion is not available')
    return aiTalkService.deleteMemory(payload?.memoryId || payload)
  })

  ipcMainService.handle(IPC.AI_CLEAR_PET_PACK_MEMORIES, () => {
    if (!aiTalkService?.clearPetPackMemories) throw new Error('AI talk memory clearing is not available')
    return aiTalkService.clearPetPackMemories()
  })

  ipcMainService.handle(IPC.IMAGE_GENERATION_GET_CONFIG, () => imageGenerationModelService.getConfig())

  ipcMainService.handle(IPC.IMAGE_GENERATION_SAVE_CONFIG, (_event, config) => {
    return imageGenerationModelService.saveConfig(config)
  })

  ipcMainService.handle(IPC.IMAGE_GENERATION_SAVE_API_KEY, (_event, apiKey) => {
    return imageGenerationModelService.saveCloudApiKey(apiKey)
  })

  ipcMainService.handle(IPC.IMAGE_GENERATION_CLEAR_API_KEY, () => {
    return imageGenerationModelService.clearCloudApiKey()
  })

  ipcMainService.handle(IPC.IMAGE_GENERATION_CHECK_HEALTH, (_event, payload) => {
    return imageGenerationModelService.checkHealth(payload || {})
  })

  ipcMainService.handle(IPC.AI_GET_CONVERSATION, (_event, payload) => {
    const conversationId = payload?.conversationId || payload
    return (aiTalkService || aiService).getConversation(conversationId)
  })

  ipcMainService.handle(IPC.AI_CHAT, async (_event, payload) => {
    const startedAt = Date.now()
    const messageChars = typeof payload?.message === 'string' ? payload.message.trim().length : 0
    const requestedConversationId = typeof payload?.conversationId === 'string' ? payload.conversationId.slice(0, 160) : ''
    recordAppLog({
      scope: 'ai-chat',
      level: 'info',
      actor: 'user',
      event: 'ai-chat.ipc.received',
      message: 'AI chat IPC request received',
      details: {
        requestedConversationId,
        messageChars,
        service: aiTalkService ? 'ai-talk' : 'ai'
      }
    })
    try {
      const result = await (aiTalkService || aiService).chat(payload)
      petService.say({ text: result.reply, source: 'ai' })
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
            requestedConversationId,
            conversationId: result.conversationId || '',
            elapsedMs: Date.now() - startedAt,
            replyChars: String(result.reply || '').length,
            messageCount: Array.isArray(result.messages) ? result.messages.length : 0,
            behaviorMatched: Boolean(behavior?.matched),
            actionId: behavior?.actionId || ''
          }
        })
        return response
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
          requestedConversationId,
          conversationId: result.conversationId || '',
          elapsedMs: Date.now() - startedAt,
          replyChars: String(result.reply || '').length,
          messageCount: Array.isArray(result.messages) ? result.messages.length : 0,
          actionId: action?.actionId || ''
        }
      })
      return response
    } catch (error) {
      recordAppLog({
        scope: 'ai-chat',
        level: 'error',
        actor: 'system',
        event: 'ai-chat.ipc.failed',
        message: 'AI chat IPC request failed',
        details: {
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

  ipcMainService.handle(IPC.PLUGINS_RUN_SETUP, (_event, payload) => {
    return pluginService.runSetup(payload.pluginId, payload.setupId)
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

  ipcMainService.handle(IPC.PLUGINS_CHECK_SERVICE_HEALTH, (_event, payload) => {
    return pluginService.checkServiceHealth(payload.pluginId, payload.serviceId)
  })

  ipcMainService.handle(IPC.PLUGINS_SAVE_SERVICE_HEALTH_POLICY, (_event, payload) => {
    return pluginService.saveServiceHealthPolicy(payload.pluginId, payload.serviceId, payload.policy)
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

  ipcMainService.handle(IPC.PLUGINS_INSPECT_GITHUB_REPOSITORY, async (_event, payload) => {
    if (!pluginGithubImportService?.inspectRepositoryUrl) throw new Error('GitHub plugin import is not available')
    return { canceled: false, ...await pluginGithubImportService.inspectRepositoryUrl(payload?.repositoryUrl) }
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
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, { scale })
  })

  // 设置面板关闭：清理 settingsWindow 引用
  ipcMainService.on(IPC.SETTINGS_CLOSE, (_event) => {
    const win = browserWindowService.fromWebContents(_event.sender)
    if (win) {
      const petWindow = getPetWindow()
      if (petWindow && petWindow.settingsWindow === win) {
        petWindow.settingsWindow = null
      }
      win.close()
    }
  })
}

module.exports = { createPetRendererSettings, normalizeLocalHttpConfig, reloadAndSendAnimations, registerIpcHandlers, triggerAiSemanticAction, executeBehaviorDecision }
