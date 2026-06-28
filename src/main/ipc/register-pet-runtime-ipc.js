const { IPC } = require('../../shared/ipc-channels')

const registerPetRuntimeIpc = ({
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
  showContextMenuWindow,
  createPetRendererSettings,
  recordAppLog,
  requestAppQuit,
  sanitizeDetails,
  sendToPetWindow
}) => {
  ipcMainService.handle(IPC.PET_GET_ANIMATIONS, () => petService.getAnimations())

  ipcMainService.handle(IPC.PET_GET_BOUNDS, (event) => {
    const win = browserWindowService.fromWebContents(event.sender)
    return win.getBounds()
  })

  ipcMainService.handle(IPC.PET_GET_MOVEMENT_STATE, (event) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win) return null
    return getMovementState(win)
  })

  ipcMainService.on(IPC.PET_SET_VIEWPORT, (event, viewport) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win || !viewport) return
    applyPetViewport(win, viewport)
    petBubbleChatWindowService?.syncToPetWindow?.()
  })

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
    petBubbleChatWindowService?.syncToPetWindow?.()
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
    petBubbleChatWindowService?.syncToPetWindow?.()
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
    win.moveTop?.()
    appService.focus?.({ steal: true })
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
    petBubbleChatWindowService?.syncToPetWindow?.()
    return next
  })

  ipcMainService.handle(IPC.PET_SHOW_CONTEXT_MENU, (event, point = {}) => {
    const win = browserWindowService.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return null
    const actions = petService.getAnimations()?.actions || []
    const bounds = win.getBounds()
    const { workArea } = screenService.getDisplayMatching(bounds)
    const menuSize = estimatePetContextMenuSize(actions, { extraItemCount: petChatWindowService ? 1 : 0 })
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
      ...(petChatWindowService ? [{ label: '打开扩展聊天面板', click: () => petChatWindowService.open?.() }] : []),
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
}

module.exports = { registerPetRuntimeIpc }
