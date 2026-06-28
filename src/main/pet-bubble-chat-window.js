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
const MIN_TTL_MS = 6000
const MAX_TTL_MS = 30000
const MANUAL_OPEN_PROMPT = '想聊点什么？'
const MAX_DIALOGUE_ITEMS = 6
const MAX_NOTICE_ITEMS = 3
const MAX_NOTICE_BUFFER_ITEMS = 20

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const normalizeBubbleChatSettings = (settings = {}) => ({
  enabled: settings.enabled !== false,
  autoPopup: settings.autoPopup !== false,
  autoHide: settings.autoHide !== false,
  pinOnInteraction: settings.pinOnInteraction !== false
})

const calculateBubbleTtlMs = ({ text = '', ttlMs = 0, source = '' } = {}) => {
  const requested = Number(ttlMs)
  if (Number.isFinite(requested) && requested > 0) return clamp(Math.round(requested), MIN_TTL_MS, MAX_TTL_MS)
  const isDialogue = String(source || '').trim() === 'ai'
  const base = isDialogue ? 8600 : 5200
  const perChar = isDialogue ? 95 : 85
  const min = isDialogue ? 9000 : MIN_TTL_MS
  const max = isDialogue ? 24000 : 18000
  return clamp(base + Math.min(String(text || '').length, 180) * perChar, min, max)
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
  const preferredY = anchor.y + Math.round((anchor.height - resolvedHeight) / 2)
  const aboveY = anchor.y - resolvedHeight - BUBBLE_GAP
  const belowY = anchor.y + anchor.height + BUBBLE_GAP
  const leftX = anchor.x - resolvedWidth - BUBBLE_GAP
  const rightX = anchor.x + anchor.width + BUBBLE_GAP
  const centeredX = Math.round(clamp(preferredX, minX, maxX))
  const centeredY = Math.round(clamp(preferredY, minY, maxY))
  const candidates = [
    { placement: 'above', x: centeredX, y: aboveY, fits: aboveY >= minY },
    { placement: 'below', x: centeredX, y: belowY, fits: belowY <= maxY },
    { placement: 'right', x: rightX, y: centeredY, fits: rightX <= maxX },
    { placement: 'left', x: leftX, y: centeredY, fits: leftX >= minX }
  ]
  const candidate = candidates.find((item) => item.fits)
  if (candidate) {
    return {
      x: Math.round(candidate.x),
      y: Math.round(candidate.y),
      width: resolvedWidth,
      height: resolvedHeight,
      placement: candidate.placement
    }
  }

  const availableSpaces = [
    { placement: 'above', space: Math.max(0, anchor.y - BUBBLE_GAP - minY), x: centeredX, y: aboveY },
    { placement: 'below', space: Math.max(0, maxY - belowY), x: centeredX, y: belowY },
    { placement: 'right', space: Math.max(0, maxX - rightX), x: rightX, y: centeredY },
    { placement: 'left', space: Math.max(0, leftX - minX), x: leftX, y: centeredY }
  ].sort((a, b) => b.space - a.space)[0]
  return {
    x: Math.round(clamp(availableSpaces.x, minX, maxX)),
    y: Math.round(clamp(availableSpaces.y, minY, maxY)),
    width: resolvedWidth,
    height: resolvedHeight,
    placement: availableSpaces.placement
  }
}

const normalizeMessagePayload = (payload = {}) => {
  const text = String(payload.text || '').trim().replace(/\s+/g, ' ')
  if (!text) return null
  return {
    text: text.slice(0, 1000),
    source: String(payload.source || '').trim().slice(0, 120),
    ttlMs: calculateBubbleTtlMs({ text, ttlMs: payload.ttlMs, source: payload.source }),
    petPackId: String(payload.petPackId || '').trim(),
    createdAt: typeof payload.createdAt === 'string' && payload.createdAt ? payload.createdAt : new Date().toISOString()
  }
}

const classifyBubbleChatKind = ({ source } = {}) => (
  String(source || '').trim() === 'ai' ? 'dialogue' : 'notice'
)

const createBubbleItemId = ({ kind, source, createdAt, text }) => {
  const seed = `${kind}:${source || ''}:${createdAt || ''}:${text || ''}`
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0
  }
  return `bubble:${kind}:${Math.abs(hash).toString(36)}`
}

const createBubbleRequestId = () => `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const normalizeBubbleChatItem = (payload = {}) => {
  const message = normalizeMessagePayload(payload)
  if (!message) return null
  const kind = payload.kind === 'dialogue' || payload.kind === 'notice'
    ? payload.kind
    : classifyBubbleChatKind({ source: message.source })
  const role = ['user', 'pet', 'system'].includes(payload.role)
    ? payload.role
    : (kind === 'dialogue' ? 'pet' : 'system')
  const createdAt = message.createdAt
  return {
    id: typeof payload.id === 'string' && payload.id ? payload.id : createBubbleItemId({ kind, source: message.source, createdAt, text: message.text }),
    kind,
    role,
    text: message.text,
    source: message.source || (kind === 'dialogue' ? 'ai' : 'pet'),
    createdAt,
    conversationId: typeof payload.conversationId === 'string' ? payload.conversationId : '',
    messageId: typeof payload.messageId === 'string' ? payload.messageId : '',
    requestId: typeof payload.requestId === 'string' ? payload.requestId.slice(0, 120) : '',
    status: ['sending', 'sent', 'failed'].includes(payload.status) ? payload.status : 'sent',
    ttlMs: message.ttlMs,
    petPackId: message.petPackId
  }
}

const normalizeConversationMessage = (message = {}, index = 0) => {
  if (!['user', 'assistant'].includes(message?.role)) return null
  const text = String(message.content || '').trim().replace(/\s+/g, ' ')
  if (!text) return null
  const createdAt = typeof message.createdAt === 'string' && message.createdAt ? message.createdAt : new Date().toISOString()
  return {
    id: `dialogue:${message.id || index}`,
    kind: 'dialogue',
    role: message.role === 'user' ? 'user' : 'pet',
    text: text.slice(0, 1000),
    source: message.role === 'user' ? 'user' : 'ai',
    createdAt,
    conversationId: typeof message.conversationId === 'string' ? message.conversationId : '',
    messageId: typeof message.id === 'string' ? message.id : '',
    requestId: typeof message.requestId === 'string' ? message.requestId.slice(0, 120) : '',
    status: 'sent'
  }
}

const createDialogueItemsFromMessages = (messages = []) => (
  (Array.isArray(messages) ? messages : [])
    .map((message, index) => normalizeConversationMessage(message, index))
    .filter(Boolean)
    .slice(-MAX_DIALOGUE_ITEMS)
)

const sortBubbleItems = (items = []) => [...items].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
const getLatestBubbleItem = (items = [], fallback = null) => items.at(-1) || fallback || null
const getCurrentDialogueItems = (items = []) => (
  (Array.isArray(items) ? items : [])
    .filter((item) => item?.kind === 'dialogue' && item.text)
    .slice(-MAX_DIALOGUE_ITEMS)
)

const buildBubbleChatItems = ({ conversationMessages = [], noticeItems = [] } = {}) => {
  const dialogueItems = createDialogueItemsFromMessages(conversationMessages)
  const notices = (Array.isArray(noticeItems) ? noticeItems : [])
    .map((item) => normalizeBubbleChatItem({ ...item, kind: 'notice', role: item.role || 'system' }))
    .filter(Boolean)
    .slice(-MAX_NOTICE_ITEMS)
  return sortBubbleItems([...dialogueItems, ...notices])
}

const createManualOpenMessage = () => ({
  text: MANUAL_OPEN_PROMPT,
  source: 'Pet',
  ttlMs: 0,
  petPackId: '',
  createdAt: new Date().toISOString()
})

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
  let appliedHitTestInteractive = null
  let state = {
    visible: false,
    hasWindow: false,
    pinned: false,
    interacting: false,
    message: null,
    items: [],
    noticeItems: [],
    unseenCount: 0,
    hitTestInteractive: false,
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

  const applyHitTestMode = (interactive = state.hitTestInteractive) => {
    if (!bubbleWindow || bubbleWindow.isDestroyed?.() || typeof bubbleWindow.setIgnoreMouseEvents !== 'function') return
    const shouldInteract = Boolean(interactive)
    if (appliedHitTestInteractive === shouldInteract) return
    if (shouldInteract) bubbleWindow.setIgnoreMouseEvents(false)
    else bubbleWindow.setIgnoreMouseEvents(true, { forward: true })
    appliedHitTestInteractive = shouldInteract
  }

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
    patchState({ visible: false, interacting: false, hitTestInteractive: false })
    applyHitTestMode(false)
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
    applyHitTestMode(false)
    bubbleWindow.on?.('close', (event) => {
      if (allowClose) return
      event?.preventDefault?.()
      hide({ source: 'window-close' })
    })
    bubbleWindow.once?.('closed', () => {
      bubbleWindow = null
      appliedHitTestInteractive = null
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

  const open = ({ source = 'pet-bubble-chat', focus = false } = {}) => {
    const settings = getSettings()
    if (!settings.enabled) {
      recordLog({
        level: 'info',
        event: 'pet-bubble-chat.window.open-skipped',
        message: 'Pet bubble chat window open skipped by settings',
        details: { enabled: false, source }
      })
      if (state.visible) hide({ source: 'settings-disabled' })
      return getState()
    }
    const win = ensureWindow()
    syncToPetWindow()
    clearHideTimer()
    patchState({
      message: state.message || createManualOpenMessage(),
      visible: true,
      interacting: true,
      error: ''
    })
    if (focus && typeof win.show === 'function') win.show()
    else if (typeof win.showInactive === 'function') win.showInactive()
    else win.show?.()
    if (focus) {
      win.moveTop?.()
      win.focus?.()
      setHitTestMode({ interactive: true, source: 'manual-open-focus' })
    } else {
      setHitTestMode({ interactive: false, source: 'auto-open-idle' })
    }
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.window.open-requested',
      message: 'Pet bubble chat window open requested',
      details: { source, focus: Boolean(focus) }
    })
    return getState()
  }

  const rebuildItems = ({ conversationMessages = [], noticeItems = state.noticeItems, reason = 'manual' } = {}) => {
    const normalizedNotices = (Array.isArray(noticeItems) ? noticeItems : [])
      .map((item) => normalizeBubbleChatItem({ ...item, kind: 'notice', role: item.role || 'system' }))
      .filter(Boolean)
      .slice(-MAX_NOTICE_BUFFER_ITEMS)
    const items = buildBubbleChatItems({ conversationMessages, noticeItems: normalizedNotices })
    patchState({ items, noticeItems: normalizedNotices, message: getLatestBubbleItem(items, state.message) })
    recordLog({
      level: 'debug',
      event: 'pet-bubble-chat.items.updated',
      message: 'Pet bubble chat items updated',
        details: {
          reason,
          itemCount: items.length,
          noticeCount: normalizedNotices.length,
          conversationMessageCount: Array.isArray(conversationMessages) ? conversationMessages.length : 0,
          requestId: typeof state.message?.requestId === 'string' ? state.message.requestId : ''
        }
      })
    return getState()
  }

  const refreshItems = ({ conversationMessages = [], reason = 'refresh' } = {}) => (
    rebuildItems({ conversationMessages, noticeItems: state.noticeItems, reason })
  )

  const appendNoticeOrDialogue = (payload = {}) => {
    const item = normalizeBubbleChatItem(payload)
    if (!item) return getState()
    if (item.kind === 'notice') {
      const noticeItems = [...state.noticeItems, item].slice(-MAX_NOTICE_BUFFER_ITEMS)
      const items = sortBubbleItems([
        ...getCurrentDialogueItems(state.items),
        ...noticeItems.slice(-MAX_NOTICE_ITEMS)
      ])
      patchState({ message: { ...item, ttlMs: item.ttlMs }, items, noticeItems })
      recordLog({
        level: 'debug',
        event: 'pet-bubble-chat.notice.buffered',
        message: 'Pet bubble chat notice buffered',
        details: {
          source: item.source,
          textChars: item.text.length,
          noticeCount: noticeItems.length,
          requestId: item.requestId || ''
        }
      })
      return getState()
    }
    const items = sortBubbleItems([...state.items.filter((existing) => existing.kind !== 'dialogue' || existing.id !== item.id), item]).slice(-MAX_DIALOGUE_ITEMS - MAX_NOTICE_ITEMS)
    patchState({ message: { ...item, ttlMs: item.ttlMs }, items })
    return getState()
  }

  const showMessage = (payload = {}) => {
    const settings = getSettings()
    if (!settings.enabled || !settings.autoPopup) {
      recordLog({
        level: 'info',
        event: 'pet-bubble-chat.message.skipped',
        message: 'Pet bubble chat message skipped by settings',
        details: {
          enabled: Boolean(settings.enabled),
          autoPopup: Boolean(settings.autoPopup),
          source: String(payload?.source || '').slice(0, 120),
          textChars: String(payload?.text || '').length,
          requestId: typeof payload?.requestId === 'string' ? payload.requestId.slice(0, 120) : ''
        }
      })
      if (state.visible) hide({ source: 'settings-disabled' })
      return getState()
    }
    const message = normalizeMessagePayload(payload)
    if (!message) return getState()
    appendNoticeOrDialogue(message)
    const win = ensureWindow()
    syncToPetWindow()
    patchState({
      message: {
        ...(state.message || {}),
        ...message,
        requestId: typeof payload?.requestId === 'string' ? payload.requestId.slice(0, 120) : (state.message?.requestId || '')
      },
      visible: true
    })
    win.showInactive?.()
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.message.displayed',
      message: 'Pet bubble chat message displayed',
      details: {
        source: message.source,
        textChars: message.text.length,
        ttlMs: message.ttlMs,
        requestId: typeof payload?.requestId === 'string' ? payload.requestId.slice(0, 120) : ''
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

  const setHitTestMode = ({ interactive = false, source = 'pet-bubble-chat-renderer' } = {}) => {
    const shouldInteract = Boolean(interactive)
    patchState({ hitTestInteractive: shouldInteract })
    applyHitTestMode(shouldInteract)
    recordLog({
      level: 'debug',
      event: 'pet-bubble-chat.hit-test.changed',
      message: 'Pet bubble chat hit-test mode changed',
      details: { source, interactive: shouldInteract }
    })
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
      interacting: Boolean(sending) || Boolean(error) || state.interacting
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
    open,
    setInteracting,
    setHitTestMode,
    setPinned,
    setSendingState,
    appendNoticeOrDialogue,
    refreshItems,
    rebuildItems,
    showMessage,
    syncToPetWindow
  }
}

module.exports = {
  calculateBubbleTtlMs,
  buildBubbleChatItems,
  classifyBubbleChatKind,
  createBubbleRequestId,
  createPetBubbleChatWindowManager,
  createDialogueItemsFromMessages,
  normalizeBubbleChatSettings,
  normalizeBubbleChatItem,
  resolveBubbleBounds
}
