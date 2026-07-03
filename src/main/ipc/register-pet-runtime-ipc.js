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
  filterManualPetActions,
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

  ipcMainService.handle(IPC.PET_PLAY_ACTION, (_event, payload = {}) => ({
    ok: true,
    ...petService.playAction({
      actionId: payload?.actionId,
      source: 'control-center:create-preview'
    })
  }))

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
    const manualActions = filterManualPetActions(actions)
    const bounds = win.getBounds()
    const { workArea } = screenService.getDisplayMatching(bounds)
    const settings = petService.getSettings?.() || {}
    const requestedPoint = {
      x: Number(point.x),
      y: Number(point.y)
    }
    const sendMenuCommand = (payload) => sendToPetWindow(() => win, IPC.PET_MENU_COMMAND, payload)
    const template = []
    if (manualActions.length > 0) {
      template.push({
        type: 'submenu',
        label: '动作',
        submenu: [
          {
            type: 'action',
            label: '散步',
            onSelect: () => sendMenuCommand({ command: 'walk' })
          },
          ...manualActions.map((action) => ({
            type: 'action',
            label: action.label || action.id,
            onSelect: () => sendMenuCommand({ command: 'action', actionId: action.id })
          }))
        ]
      })
    }
    if (petBubbleChatWindowService || petChatWindowService) {
      template.push({
        type: 'action',
        label: '和宠物聊天',
        onSelect: () => {
          if (petBubbleChatWindowService?.open) {
            const bubbleState = petBubbleChatWindowService.open({ source: 'pet-context-menu', focus: true })
            if (bubbleState?.visible || bubbleState?.hasWindow) return
          }
          petChatWindowService?.open?.()
        }
      })
    }
    if (template.length > 0) template.push({ type: 'separator' })
    template.push({
      type: 'action',
      label: '设置',
      onSelect: () => createSettingsWindow(win)
    })
    template.push({ type: 'separator' })
    template.push({
      type: 'action',
      label: '退出',
      onSelect: () => requestAppQuit('pet-context-menu')
    })
    const menuSize = estimatePetContextMenuSize(template)
    const placement = choosePetContextMenuPoint({
      petBounds: bounds,
      workArea,
      menuSize,
      menuPosition: settings.menuPosition,
      preferredPoint: requestedPoint
    })
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
      onSubmenuOpen: (details = {}) => {
        recordAppLog({
          scope: 'pet-menu',
          level: 'info',
          actor: 'user',
          event: 'pet.menu.submenu.popup',
          message: 'Pet context submenu popup requested',
          details: {
            label: String(details.label || ''),
            placement: String(details.placement || ''),
            parentMenuX: Number(details.parentMenuBounds?.x || 0),
            parentMenuY: Number(details.parentMenuBounds?.y || 0),
            parentMenuWidth: Number(details.parentMenuBounds?.width || 0),
            parentMenuHeight: Number(details.parentMenuBounds?.height || 0),
            petX: Number(details.petBounds?.x || 0),
            petY: Number(details.petBounds?.y || 0),
            petWidth: Number(details.petBounds?.width || 0),
            petHeight: Number(details.petBounds?.height || 0),
            workAreaX: Number(details.workArea?.x || 0),
            workAreaY: Number(details.workArea?.y || 0),
            workAreaWidth: Number(details.workArea?.width || 0),
            workAreaHeight: Number(details.workArea?.height || 0),
            submenuX: Number(details.submenuBounds?.x || 0),
            submenuY: Number(details.submenuBounds?.y || 0),
            submenuWidth: Number(details.submenuBounds?.width || 0),
            submenuHeight: Number(details.submenuBounds?.height || 0),
            rightFits: Boolean(details.rightCandidate?.fitsHorizontally),
            rightX: Number(details.rightCandidate?.screenPoint?.x || 0),
            rightY: Number(details.rightCandidate?.screenPoint?.y || 0),
            rightOverlapArea: Number(details.rightCandidate?.overlapArea || 0),
            leftFits: Boolean(details.leftCandidate?.fitsHorizontally),
            leftX: Number(details.leftCandidate?.screenPoint?.x || 0),
            leftY: Number(details.leftCandidate?.screenPoint?.y || 0),
            leftOverlapArea: Number(details.leftCandidate?.overlapArea || 0)
          }
        })
      },
      onSelect: (item) => item?.onSelect?.()
    })
    return placement
  })
}

module.exports = { registerPetRuntimeIpc }
