const path = require('path')
const electron = require('electron')
const { IPC } = require('../shared/ipc-channels')

const projectRoot = path.join(__dirname, '..', '..')
const DEFAULT_BUBBLE_WIDTH = 340
const DEFAULT_BUBBLE_HEIGHT = 260
const MIN_BUBBLE_WIDTH = 240
const MAX_BUBBLE_WIDTH = 380
const MAX_BUBBLE_HEIGHT = 280
const BUBBLE_GAP = 8
const WORK_AREA_MARGIN = 8
const MIN_TTL_MS = 2200
const MAX_TTL_MS = 15000

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const normalizeBubbleChatSettings = (settings = {}) => ({
  enabled: settings.enabled !== false,
  autoPopup: settings.autoPopup !== false,
  autoHide: settings.autoHide !== false,
  pinOnInteraction: settings.pinOnInteraction !== false
})

const calculateBubbleTtlMs = ({ text = '', ttlMs = 0 } = {}) => {
  const requested = Number(ttlMs)
  if (Number.isFinite(requested) && requested > 0) return clamp(Math.round(requested), MIN_TTL_MS, MAX_TTL_MS)
  const base = 2600
  const perChar = 70
  return clamp(base + Math.min(String(text || '').length, 120) * perChar, 3200, 12000)
}

const normalizePetBounds = (bounds) => {
  if (!bounds || typeof bounds !== 'object') return null
  const x = Number(bounds.x)
  const y = Number(bounds.y)
  const width = Number(bounds.width)
  const height = Number(bounds.height)
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  }
}

const getWorkAreaForPetBounds = (screenService, petBounds) => {
  const fallback = { x: 0, y: 0, width: 1440, height: 900 }
  const display = petBounds && typeof screenService?.getDisplayMatching === 'function'
    ? screenService.getDisplayMatching(petBounds)
    : screenService?.getPrimaryDisplay?.()
  return display?.workArea || fallback
}

const resolveBubbleBounds = ({ petBounds, workArea, width = DEFAULT_BUBBLE_WIDTH, height = DEFAULT_BUBBLE_HEIGHT } = {}) => {
  const area = workArea || { x: 0, y: 0, width: 1440, height: 900 }
  const resolvedWidth = Math.round(clamp(width, MIN_BUBBLE_WIDTH, Math.min(MAX_BUBBLE_WIDTH, Math.max(MIN_BUBBLE_WIDTH, area.width - WORK_AREA_MARGIN * 2))))
  const resolvedHeight = Math.round(clamp(height, 1, Math.min(MAX_BUBBLE_HEIGHT, Math.max(1, area.height - WORK_AREA_MARGIN * 2))))
  const anchor = normalizePetBounds(petBounds) || {
    x: area.x + Math.round((area.width - resolvedWidth) / 2),
    y: area.y + Math.round((area.height - resolvedHeight) / 2),
    width: resolvedWidth,
    height: resolvedHeight
  }
  const minX = area.x + WORK_AREA_MARGIN
  const maxX = Math.max(minX, area.x + area.width - resolvedWidth - WORK_AREA_MARGIN)
  const minY = area.y + WORK_AREA_MARGIN
  const maxY = Math.max(minY, area.y + area.height - resolvedHeight - WORK_AREA_MARGIN)
  const preferredX = anchor.x + Math.round((anchor.width - resolvedWidth) / 2)
  const aboveY = anchor.y - resolvedHeight - BUBBLE_GAP
  const belowY = anchor.y + anchor.height + BUBBLE_GAP
  const canFitAbove = aboveY >= minY
  return {
    x: Math.round(clamp(preferredX, minX, maxX)),
    y: Math.round(clamp(canFitAbove ? aboveY : belowY, minY, maxY)),
    width: resolvedWidth,
    height: resolvedHeight,
    placement: canFitAbove ? 'above' : 'below'
  }
}

const normalizeMessagePayload = (payload = {}) => {
  const text = String(payload.text || '').trim().replace(/\s+/g, ' ')
  if (!text) return null
  return {
    text: text.slice(0, 1000),
    source: String(payload.source || '').trim().slice(0, 120),
    ttlMs: calculateBubbleTtlMs({ text, ttlMs: payload.ttlMs }),
    petPackId: String(payload.petPackId || '').trim(),
    createdAt: typeof payload.createdAt === 'string' && payload.createdAt ? payload.createdAt : new Date().toISOString()
  }
}

const createPetBubbleChatWindowManager = ({
  getPetWindow = () => null,
  settingsService,
  BrowserWindow = electron.BrowserWindow,
  screen = electron.screen,
  appLogService
} = {}) => {
  if (!settingsService) throw new Error('settingsService is required')
  let bubbleWindow = null
  let hideTimer = null
  let allowClose = false
  let state = {
    visible: false,
    hasWindow: false,
    pinned: false,
    interacting: false,
    message: null,
    lastUserMessage: null,
    sending: false,
    error: '',
    placement: '',
    bounds: null
  }

  const recordLog = (entry) => {
    try {
      appLogService?.record?.({
        scope: 'pet-bubble-chat',
        actor: 'system',
        ...entry
      })
    } catch (_) {
      // Popup diagnostics should never break the pet runtime.
    }
  }

  const getSettings = () => normalizeBubbleChatSettings(settingsService.get?.().petBubbleChat)

  const clearHideTimer = () => {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = null
  }

  const sendStateChanged = () => {
    if (!bubbleWindow || bubbleWindow.isDestroyed?.()) return
    bubbleWindow.webContents?.send?.(IPC.PET_BUBBLE_CHAT_STATE_CHANGED, getState())
  }

  const patchState = (patch = {}) => {
    state = {
      ...state,
      ...patch,
      hasWindow: Boolean(bubbleWindow && !bubbleWindow.isDestroyed?.())
    }
    sendStateChanged()
    return getState()
  }

  const hide = ({ source = 'pet-bubble-chat' } = {}) => {
    clearHideTimer()
    if (bubbleWindow && !bubbleWindow.isDestroyed?.()) bubbleWindow.hide?.()
    patchState({ visible: false, interacting: false })
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.window.hidden',
      message: 'Pet bubble chat window hidden',
      details: { source }
    })
    return getState()
  }

  const shouldHoldVisible = () => {
    const settings = getSettings()
    return state.pinned || state.interacting || settings.autoHide === false
  }

  const scheduleAutoHide = () => {
    clearHideTimer()
    const settings = getSettings()
    if (!settings.autoHide || shouldHoldVisible() || !state.message?.ttlMs) return
    hideTimer = setTimeout(() => {
      if (!shouldHoldVisible()) hide({ source: 'auto-hide' })
    }, state.message.ttlMs)
  }

  const getPetBounds = () => {
    const petWindow = getPetWindow()
    if (!petWindow || petWindow.isDestroyed?.() || typeof petWindow.getBounds !== 'function') return null
    return normalizePetBounds(petWindow.getBounds())
  }

  const calculateBounds = () => {
    const petBounds = getPetBounds()
    return resolveBubbleBounds({
      petBounds,
      workArea: getWorkAreaForPetBounds(screen, petBounds),
      width: DEFAULT_BUBBLE_WIDTH,
      height: DEFAULT_BUBBLE_HEIGHT
    })
  }

  const syncToPetWindow = () => {
    if (!bubbleWindow || bubbleWindow.isDestroyed?.()) return getState()
    const bounds = calculateBounds()
    bubbleWindow.setBounds?.({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    })
    patchState({ bounds, placement: bounds.placement })
    return getState()
  }

  const ensureWindow = () => {
    if (bubbleWindow && !bubbleWindow.isDestroyed?.()) return bubbleWindow
    const bounds = calculateBounds()
    bubbleWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      hasShadow: false,
      title: 'OpenPet Bubble Chat',
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(projectRoot, 'src', 'main', 'pet-bubble-chat-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    bubbleWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true })
    bubbleWindow.on?.('close', (event) => {
      if (allowClose) return
      event?.preventDefault?.()
      hide({ source: 'window-close' })
    })
    bubbleWindow.once?.('closed', () => {
      bubbleWindow = null
      clearHideTimer()
      patchState({ visible: false, hasWindow: false })
    })
    bubbleWindow.once?.('ready-to-show', () => sendStateChanged())
    Promise.resolve(bubbleWindow.loadFile?.(path.join(projectRoot, 'src', 'main', 'pet-bubble-chat', 'index.html'))).catch((error) => {
      if (bubbleWindow && !bubbleWindow.isDestroyed?.()) {
        bubbleWindow.loadURL?.(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><title>OpenPet Bubble Chat</title><body>${error.message}</body>`)}`)
      }
    })
    patchState({ bounds, placement: bounds.placement })
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.window.opened',
      message: 'Pet bubble chat window opened',
      details: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        placement: bounds.placement
      }
    })
    return bubbleWindow
  }

  const showMessage = (payload = {}) => {
    const settings = getSettings()
    if (!settings.enabled || !settings.autoPopup) {
      if (state.visible) hide({ source: 'settings-disabled' })
      return getState()
    }
    const message = normalizeMessagePayload(payload)
    if (!message) return getState()
    const win = ensureWindow()
    syncToPetWindow()
    patchState({ message, visible: true })
    win.showInactive?.()
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.message.displayed',
      message: 'Pet bubble chat message displayed',
      details: {
        source: message.source,
        textChars: message.text.length,
        ttlMs: message.ttlMs
      }
    })
    scheduleAutoHide()
    return getState()
  }

  const setPinned = (pinned, { source = 'pet-bubble-chat-renderer' } = {}) => {
    patchState({ pinned: Boolean(pinned) })
    recordLog({
      level: 'info',
      event: Boolean(pinned) ? 'pet-bubble-chat.interaction.pinned' : 'pet-bubble-chat.interaction.unpinned',
      message: Boolean(pinned) ? 'Pet bubble chat pinned' : 'Pet bubble chat unpinned',
      details: { source }
    })
    scheduleAutoHide()
    return getState()
  }

  const setInteracting = (interacting, { source = 'pet-bubble-chat-renderer' } = {}) => {
    patchState({ interacting: Boolean(interacting) })
    recordLog({
      level: 'debug',
      event: 'pet-bubble-chat.interaction.changed',
      message: 'Pet bubble chat interaction state changed',
      details: { source, interacting: Boolean(interacting) }
    })
    scheduleAutoHide()
    return getState()
  }

  const setSendingState = ({ sending = false, lastUserMessage = null, error = '' } = {}) => {
    const normalizedUserMessage = lastUserMessage && typeof lastUserMessage === 'object'
      ? {
          text: String(lastUserMessage.text || '').trim().slice(0, 1000),
          createdAt: typeof lastUserMessage.createdAt === 'string' && lastUserMessage.createdAt ? lastUserMessage.createdAt : new Date().toISOString()
        }
      : state.lastUserMessage
    patchState({
      sending: Boolean(sending),
      lastUserMessage: normalizedUserMessage?.text ? normalizedUserMessage : null,
      error: String(error || '').slice(0, 240),
      interacting: Boolean(sending) || state.interacting
    })
    scheduleAutoHide()
    return getState()
  }

  const getState = () => ({
    ...state,
    hasWindow: Boolean(bubbleWindow && !bubbleWindow.isDestroyed?.()),
    visible: Boolean(bubbleWindow && !bubbleWindow.isDestroyed?.() && bubbleWindow.isVisible?.() !== false && state.visible)
  })

  electron.app?.on?.('before-quit', () => {
    allowClose = true
    clearHideTimer()
  })

  return {
    getState,
    hide,
    setInteracting,
    setPinned,
    setSendingState,
    showMessage,
    syncToPetWindow
  }
}

module.exports = {
  calculateBubbleTtlMs,
  createPetBubbleChatWindowManager,
  normalizeBubbleChatSettings,
  resolveBubbleBounds
}
