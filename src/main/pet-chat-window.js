const path = require('path')
const electron = require('electron')
const { IPC } = require('../shared/ipc-channels')

const projectRoot = path.join(__dirname, '..', '..')
const DEFAULT_CHAT_WIDTH = 360
const DEFAULT_CHAT_HEIGHT = 500
const MIN_CHAT_WIDTH = 320
const MIN_CHAT_HEIGHT = 360
const CHAT_WINDOW_GAP = 12
const WORK_AREA_MARGIN = 8

const toFiniteNumber = (value, fallback) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
)

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const normalizeBounds = (bounds) => {
  if (!bounds || typeof bounds !== 'object') return null
  const x = Number(bounds.x)
  const y = Number(bounds.y)
  const width = Number(bounds.width)
  const height = Number(bounds.height)
  if (![x, y, width, height].every(Number.isFinite)) return null
  if (width <= 0 || height <= 0) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(MIN_CHAT_WIDTH, Math.round(width)),
    height: Math.max(MIN_CHAT_HEIGHT, Math.round(height))
  }
}

const normalizeDesktopChatSettings = (desktopChat = {}) => {
  const bounds = normalizeBounds(desktopChat.bounds)
  return {
    bounds,
    hasUserBounds: Boolean(desktopChat.hasUserBounds && bounds),
    alwaysOnTop: desktopChat.alwaysOnTop !== false
  }
}

const getWorkAreaForBounds = (screenService, bounds) => {
  const fallback = { x: 0, y: 0, width: 1440, height: 900 }
  const display = bounds && typeof screenService?.getDisplayMatching === 'function'
    ? screenService.getDisplayMatching(bounds)
    : screenService?.getPrimaryDisplay?.()
  return display?.workArea || fallback
}

const clampBoundsToWorkArea = (bounds, workArea) => {
  const maxWidth = Math.max(1, workArea.width - WORK_AREA_MARGIN * 2)
  const maxHeight = Math.max(1, workArea.height - WORK_AREA_MARGIN * 2)
  const width = Math.min(Math.max(MIN_CHAT_WIDTH, bounds.width), maxWidth)
  const height = Math.min(Math.max(MIN_CHAT_HEIGHT, bounds.height), maxHeight)
  const minX = workArea.x + WORK_AREA_MARGIN
  const minY = workArea.y + WORK_AREA_MARGIN
  const maxX = Math.max(minX, workArea.x + workArea.width - width - WORK_AREA_MARGIN)
  const maxY = Math.max(minY, workArea.y + workArea.height - height - WORK_AREA_MARGIN)
  return {
    x: Math.round(clamp(bounds.x, minX, maxX)),
    y: Math.round(clamp(bounds.y, minY, maxY)),
    width: Math.round(width),
    height: Math.round(height)
  }
}

const createInitialChatBounds = ({ petBounds, workArea }) => {
  const base = {
    x: workArea.x + workArea.width - DEFAULT_CHAT_WIDTH - WORK_AREA_MARGIN,
    y: workArea.y + WORK_AREA_MARGIN,
    width: DEFAULT_CHAT_WIDTH,
    height: DEFAULT_CHAT_HEIGHT
  }
  if (!petBounds) return clampBoundsToWorkArea(base, workArea)

  const right = {
    x: petBounds.x + petBounds.width + CHAT_WINDOW_GAP,
    y: petBounds.y,
    width: DEFAULT_CHAT_WIDTH,
    height: DEFAULT_CHAT_HEIGHT
  }
  if (right.x + right.width <= workArea.x + workArea.width - WORK_AREA_MARGIN) {
    return clampBoundsToWorkArea(right, workArea)
  }

  const left = {
    ...right,
    x: petBounds.x - DEFAULT_CHAT_WIDTH - CHAT_WINDOW_GAP
  }
  if (left.x >= workArea.x + WORK_AREA_MARGIN) {
    return clampBoundsToWorkArea(left, workArea)
  }

  const below = {
    ...right,
    x: petBounds.x,
    y: petBounds.y + petBounds.height + CHAT_WINDOW_GAP
  }
  return clampBoundsToWorkArea(below, workArea)
}

const resolveChatWindowBounds = ({ desktopChat, petBounds, screen }) => {
  if (desktopChat.hasUserBounds && desktopChat.bounds) {
    return clampBoundsToWorkArea(
      desktopChat.bounds,
      getWorkAreaForBounds(screen, desktopChat.bounds)
    )
  }
  return createInitialChatBounds({
    petBounds,
    workArea: getWorkAreaForBounds(screen, petBounds)
  })
}

const createPetChatWindowManager = ({
  getPetWindow = () => null,
  settingsService,
  BrowserWindow = electron.BrowserWindow,
  screen = electron.screen,
  app = electron.app,
  appLogService,
  createSettingsWindow = () => {}
} = {}) => {
  if (!settingsService) throw new Error('settingsService is required')
  let chatWindow = null
  let allowClose = false

  const recordLog = (entry) => {
    try {
      appLogService?.record?.({
        scope: 'pet-chat',
        actor: 'system',
        ...entry
      })
    } catch (_) {
      // Chat diagnostics should never break the desktop pet.
    }
  }

  const getDesktopChatSettings = () => normalizeDesktopChatSettings(settingsService.get().desktopChat)

  const saveDesktopChatSettings = (partial = {}) => {
    const currentSettings = settingsService.get()
    const desktopChat = normalizeDesktopChatSettings({
      ...(currentSettings.desktopChat || {}),
      ...partial
    })
    settingsService.save({
      ...currentSettings,
      desktopChat
    })
    return desktopChat
  }

  const getState = () => {
    const desktopChat = getDesktopChatSettings()
    return {
      ...desktopChat,
      visible: Boolean(chatWindow && !chatWindow.isDestroyed?.() && chatWindow.isVisible?.()),
      hasWindow: Boolean(chatWindow && !chatWindow.isDestroyed?.())
    }
  }

  const sendStateChanged = (state = getState()) => {
    if (!chatWindow || chatWindow.isDestroyed?.()) return
    chatWindow.webContents?.send?.(IPC.PET_CHAT_STATE_CHANGED, state)
  }

  const saveBounds = ({ source = 'window-event' } = {}) => {
    if (!chatWindow || chatWindow.isDestroyed?.()) return getDesktopChatSettings()
    const bounds = normalizeBounds(chatWindow.getBounds?.())
    if (!bounds) return getDesktopChatSettings()
    const desktopChat = saveDesktopChatSettings({ bounds, hasUserBounds: true })
    recordLog({
      level: 'debug',
      event: 'pet-chat.window.bounds-saved',
      message: 'Pet chat window bounds saved',
      details: {
        source,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      }
    })
    sendStateChanged()
    return desktopChat
  }

  const bringToFront = () => {
    if (!chatWindow || chatWindow.isDestroyed?.()) return
    if (chatWindow.isMinimized?.()) chatWindow.restore?.()
    if (chatWindow.isVisible?.() === false) chatWindow.show?.()
    chatWindow.moveTop?.()
    chatWindow.focus?.()
    app?.focus?.({ steal: true })
  }

  const hide = ({ source = 'pet-chat' } = {}) => {
    if (!chatWindow || chatWindow.isDestroyed?.()) return getState()
    saveBounds({ source: `${source}:hide` })
    chatWindow.hide?.()
    recordLog({
      level: 'info',
      event: 'pet-chat.window.hidden',
      message: 'Pet chat window hidden',
      details: { source }
    })
    sendStateChanged()
    return getState()
  }

  const open = () => {
    if (chatWindow && !chatWindow.isDestroyed?.()) {
      bringToFront()
      recordLog({
        level: 'info',
        event: 'pet-chat.window.focused',
        message: 'Pet chat window focused'
      })
      sendStateChanged()
      return getState()
    }

    const desktopChat = getDesktopChatSettings()
    const petWindow = getPetWindow()
    const petBounds = petWindow && !petWindow.isDestroyed?.() && typeof petWindow.getBounds === 'function'
      ? petWindow.getBounds()
      : null
    const bounds = resolveChatWindowBounds({ desktopChat, petBounds, screen })

    chatWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      minWidth: MIN_CHAT_WIDTH,
      minHeight: MIN_CHAT_HEIGHT,
      frame: false,
      transparent: false,
      resizable: true,
      movable: true,
      show: false,
      alwaysOnTop: desktopChat.alwaysOnTop,
      skipTaskbar: true,
      title: 'OpenPet Chat',
      backgroundColor: '#fff8ef',
      webPreferences: {
        preload: path.join(projectRoot, 'src', 'main', 'pet-chat-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    chatWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true })
    chatWindow.on?.('move', () => saveBounds({ source: 'move' }))
    chatWindow.on?.('resize', () => saveBounds({ source: 'resize' }))
    chatWindow.on?.('close', (event) => {
      if (allowClose) return
      event?.preventDefault?.()
      hide({ source: 'window-close' })
    })
    chatWindow.once?.('closed', () => {
      chatWindow = null
    })
    chatWindow.once?.('ready-to-show', () => {
      if (!chatWindow || chatWindow.isDestroyed?.()) return
      chatWindow.show?.()
      bringToFront()
      sendStateChanged()
    })
    Promise.resolve(chatWindow.loadFile?.(path.join(projectRoot, 'src', 'main', 'pet-chat', 'index.html'))).catch((error) => {
      if (chatWindow && !chatWindow.isDestroyed?.()) {
        chatWindow.loadURL?.(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><title>OpenPet Chat</title><body style="font-family: sans-serif; padding: 16px;">聊天面板加载失败：${error.message}</body>`)}`)
      }
    })

    recordLog({
      level: 'info',
      event: 'pet-chat.window.opened',
      message: 'Pet chat window opened',
      details: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        restored: Boolean(desktopChat.hasUserBounds),
        alwaysOnTop: desktopChat.alwaysOnTop
      }
    })
    return getState()
  }

  const setAlwaysOnTop = (alwaysOnTop) => {
    const desktopChat = saveDesktopChatSettings({ alwaysOnTop: Boolean(alwaysOnTop) })
    if (chatWindow && !chatWindow.isDestroyed?.()) {
      chatWindow.setAlwaysOnTop?.(desktopChat.alwaysOnTop)
    }
    recordLog({
      level: 'info',
      event: 'pet-chat.window.topmost-changed',
      message: 'Pet chat window always-on-top changed',
      details: { alwaysOnTop: desktopChat.alwaysOnTop }
    })
    sendStateChanged()
    return getState()
  }

  const openSettings = () => {
    createSettingsWindow()
    recordLog({
      level: 'info',
      event: 'pet-chat.settings.opened',
      message: 'Control Center opened from pet chat window'
    })
    return { ok: true }
  }

  app?.on?.('before-quit', () => {
    allowClose = true
    saveBounds({ source: 'before-quit' })
  })

  return {
    getState,
    hide,
    open,
    openSettings,
    saveBounds,
    sendStateChanged,
    setAlwaysOnTop
  }
}

module.exports = {
  DEFAULT_CHAT_HEIGHT,
  DEFAULT_CHAT_WIDTH,
  MIN_CHAT_HEIGHT,
  MIN_CHAT_WIDTH,
  clampBoundsToWorkArea,
  createInitialChatBounds,
  createPetChatWindowManager,
  normalizeDesktopChatSettings,
  resolveChatWindowBounds
}
