const path = require('path')
const electron = require('electron')
const { IPC } = require('../shared/ipc-channels')
const { PET_VIEWPORT, applyNavigationLock } = require('./window')

const projectRoot = path.join(__dirname, '..', '..')
const PET_BUBBLE_CHAT_ENTRY_PATH = path.join(projectRoot, 'src', 'main', 'pet-bubble-chat', 'index.html')
const DEFAULT_BUBBLE_WIDTH = 340
const DEFAULT_BUBBLE_HEIGHT = 260
const MIN_BUBBLE_HEIGHT = 176
const MIN_BUBBLE_WIDTH = 240
const MAX_BUBBLE_WIDTH = 380
const MAX_BUBBLE_HEIGHT = 360
const BUBBLE_GAP_ABOVE = 2
const BUBBLE_GAP_BELOW = 8
const BUBBLE_GAP_SIDE = 4
const BUBBLE_HEAD_ANCHOR_RATIO_X = 0.5
const BUBBLE_SIDE_ANCHOR_RATIO_Y = 0.3
const BUBBLE_SIDE_WINDOW_OFFSET_RATIO_Y = 0.42
const WORK_AREA_MARGIN = 8
const MIN_TTL_MS = 6000
const MAX_TTL_MS = 30000
const MANUAL_OPEN_PROMPT = '想聊点什么？'
const MAX_DIALOGUE_ITEMS = 8
const MAX_NOTICE_ITEMS = 3
const MAX_NOTICE_BUFFER_ITEMS = 20
const DEFAULT_HISTORY_TTL_MS = 8000
const MIN_HISTORY_TTL_MS = 6000
const MAX_HISTORY_TTL_MS = 30000
const BUBBLE_ALWAYS_ON_TOP_LEVEL = 'pop-up-menu'
const BUBBLE_ANCHOR_MODE = Object.freeze({
  ANCHORED: 'anchored',
  DETACHED_TEMPORARY: 'detached-temporary'
})
const BUBBLE_ANCHOR_PROFILE = 'tight-head-anchor-v1'

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

const samePetBounds = (left, right) => {
  if (!left && !right) return true
  if (!left || !right) return false
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
}

const getWorkAreaForPetBounds = (screenService, petBounds) => {
  const fallback = { x: 0, y: 0, width: 1440, height: 900 }
  const display = petBounds && typeof screenService?.getDisplayMatching === 'function'
    ? screenService.getDisplayMatching(petBounds)
    : screenService?.getPrimaryDisplay?.()
  return display?.workArea || fallback
}

const getPetVisibleBounds = (petWindow) => {
  if (!petWindow || petWindow.isDestroyed?.() || typeof petWindow.getBounds !== 'function') return null
  const bounds = normalizePetBounds(petWindow.getBounds())
  if (!bounds) return null
  const viewport = petWindow[PET_VIEWPORT] || petWindow.__openPetViewport
  const topInset = Math.max(0, Math.round(Number(viewport?.topInset) || 0))
  if (!topInset || topInset >= bounds.height) return bounds
  return {
    ...bounds,
    y: bounds.y + topInset,
    height: Math.max(1, bounds.height - topInset)
  }
}

const getPetAnchorDetails = (petWindow) => {
  if (!petWindow || petWindow.isDestroyed?.() || typeof petWindow.getBounds !== 'function') return {}
  const rawBounds = normalizePetBounds(petWindow.getBounds())
  if (!rawBounds) return {}
  const viewport = petWindow[PET_VIEWPORT] || petWindow.__openPetViewport
  const topInset = Math.max(0, Math.round(Number(viewport?.topInset) || 0))
  const visibleBounds = getPetVisibleBounds(petWindow)
  return {
    petWindowX: rawBounds.x,
    petWindowY: rawBounds.y,
    petWindowWidth: rawBounds.width,
    petWindowHeight: rawBounds.height,
    petViewportTopInset: topInset,
    petVisibleX: visibleBounds?.x ?? rawBounds.x,
    petVisibleY: visibleBounds?.y ?? rawBounds.y,
    petVisibleWidth: visibleBounds?.width ?? rawBounds.width,
    petVisibleHeight: visibleBounds?.height ?? rawBounds.height
  }
}

const clampBubbleWindowPosition = ({ bounds, workArea } = {}) => {
  const area = workArea || { x: 0, y: 0, width: 1440, height: 900 }
  const width = Math.round(clamp(Number(bounds?.width) || DEFAULT_BUBBLE_WIDTH, MIN_BUBBLE_WIDTH, Math.max(MIN_BUBBLE_WIDTH, area.width - WORK_AREA_MARGIN * 2)))
  const height = Math.round(clamp(Number(bounds?.height) || DEFAULT_BUBBLE_HEIGHT, 1, Math.max(1, area.height - WORK_AREA_MARGIN * 2)))
  const minX = area.x + WORK_AREA_MARGIN
  const minY = area.y + WORK_AREA_MARGIN
  const maxX = Math.max(minX, area.x + area.width - width - WORK_AREA_MARGIN)
  const maxY = Math.max(minY, area.y + area.height - height - WORK_AREA_MARGIN)
  return {
    x: Math.round(clamp(Number(bounds?.x) || area.x, minX, maxX)),
    y: Math.round(clamp(Number(bounds?.y) || area.y, minY, maxY)),
    width,
    height
  }
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
  const headAnchorX = anchor.x + Math.round(anchor.width * BUBBLE_HEAD_ANCHOR_RATIO_X)
  const sideAnchorY = anchor.y + Math.round(anchor.height * BUBBLE_SIDE_ANCHOR_RATIO_Y)
  const aboveX = Math.round(clamp(headAnchorX - resolvedWidth / 2, minX, maxX))
  const belowX = Math.round(clamp(headAnchorX - resolvedWidth / 2, minX, maxX))
  const aboveY = anchor.y - resolvedHeight - BUBBLE_GAP_ABOVE
  const belowY = anchor.y + anchor.height + BUBBLE_GAP_BELOW
  const leftX = anchor.x - resolvedWidth - BUBBLE_GAP_SIDE
  const rightX = anchor.x + anchor.width + BUBBLE_GAP_SIDE
  const sideY = Math.round(clamp(sideAnchorY - resolvedHeight * BUBBLE_SIDE_WINDOW_OFFSET_RATIO_Y, minY, maxY))
  const candidates = [
    { placement: 'above', x: aboveX, y: aboveY, fits: aboveY >= minY },
    { placement: 'below', x: belowX, y: belowY, fits: belowY <= maxY },
    { placement: 'right', x: rightX, y: sideY, fits: rightX <= maxX },
    { placement: 'left', x: leftX, y: sideY, fits: leftX >= minX }
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
    { placement: 'above', space: Math.max(0, anchor.y - BUBBLE_GAP_ABOVE - minY), x: aboveX, y: aboveY },
    { placement: 'below', space: Math.max(0, maxY - belowY), x: belowX, y: belowY },
    { placement: 'right', space: Math.max(0, maxX - rightX), x: rightX, y: sideY },
    { placement: 'left', space: Math.max(0, leftX - minX), x: leftX, y: sideY }
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
    sourceSurface: String(payload.sourceSurface || payload.source || '').trim().slice(0, 120),
    ttlMs: calculateBubbleTtlMs({ text, ttlMs: payload.ttlMs, source: payload.source }),
    petPackId: String(payload.petPackId || '').trim(),
    createdAt: typeof payload.createdAt === 'string' && payload.createdAt ? payload.createdAt : new Date().toISOString()
  }
}

const classifyBubbleChatKind = ({ source } = {}) => {
  const normalizedSource = String(source || '').trim()
  if (
    normalizedSource === 'ai' ||
    normalizedSource.startsWith('ai:') ||
    normalizedSource === 'pet' ||
    normalizedSource.startsWith('pet-') ||
    normalizedSource.startsWith('pet:')
  ) {
    return 'dialogue'
  }
  return 'notice'
}

const createBubbleItemId = ({ kind, source, createdAt, text }) => {
  const seed = `${kind}:${source || ''}:${createdAt || ''}:${text || ''}`
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0
  }
  return `bubble:${kind}:${Math.abs(hash).toString(36)}`
}

const normalizeSourceLabel = ({ source = '' } = {}) => {
  const normalizedSource = String(source || '').trim()
  if (normalizedSource.startsWith('plugin:openpet.agent-awareness')) return 'Codex'
  return ''
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
    sourceLabel: normalizeSourceLabel({ source: message.source }),
    sourceSurface: message.sourceSurface || message.source || (kind === 'dialogue' ? 'ai' : 'pet'),
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

const createPendingUserItemId = () => `pending-user:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
const MAX_STREAM_PREVIEW_CHARS = 600

const normalizePendingUserMessage = (payload = {}) => {
  const text = String(payload.text || '').trim().replace(/\s+/g, ' ')
  if (!text) return null
  return {
    id: typeof payload.id === 'string' && payload.id ? payload.id : createPendingUserItemId(),
    text: text.slice(0, 1000),
    createdAt: typeof payload.createdAt === 'string' && payload.createdAt ? payload.createdAt : new Date().toISOString(),
    requestId: typeof payload.requestId === 'string' ? payload.requestId.slice(0, 120) : '',
    status: ['queued', 'sending', 'pending-merge'].includes(payload.status) ? payload.status : 'queued'
  }
}

const normalizeStreamState = (payload = {}) => {
  const status = ['started', 'streaming', 'completed', 'canceled', 'failed'].includes(payload.status)
    ? payload.status
    : 'streaming'
  const fullPartialReply = String(payload.partialReply || '')
  const partialReply = fullPartialReply.slice(-MAX_STREAM_PREVIEW_CHARS)
  return {
    requestId: typeof payload.requestId === 'string' ? payload.requestId.slice(0, 120) : '',
    conversationId: typeof payload.conversationId === 'string' ? payload.conversationId.slice(0, 240) : '',
    petPackId: typeof payload.petPackId === 'string' ? payload.petPackId.slice(0, 160) : '',
    entrypoint: typeof payload.entrypoint === 'string' ? payload.entrypoint.slice(0, 80) : '',
    status,
    partialReply,
    partialReplyChars: Number.isFinite(Number(payload.partialReplyChars)) ? Number(payload.partialReplyChars) : fullPartialReply.length,
    chunkCount: Number.isFinite(Number(payload.chunkCount)) ? Number(payload.chunkCount) : 0,
    canCancel: payload.canCancel === true && (status === 'started' || status === 'streaming'),
    errorMessage: typeof payload.errorMessage === 'string' ? payload.errorMessage.slice(0, 240) : ''
  }
}

const isActiveStreamState = (streaming = {}) => (
  streaming?.status === 'started' || streaming?.status === 'streaming'
)

const createPendingBubbleItem = (pendingMessage = {}) => ({
  id: pendingMessage.id,
  kind: 'dialogue',
  role: 'user',
  text: pendingMessage.text,
  source: 'user',
  sourceSurface: 'bubble-chat',
  createdAt: pendingMessage.createdAt,
  conversationId: '',
  messageId: '',
  requestId: pendingMessage.requestId || '',
  status: pendingMessage.status === 'pending-merge'
    ? 'failed'
    : (pendingMessage.status === 'sending' ? 'sending' : 'sent'),
  flowState: pendingMessage.status
})

const estimateBubbleHeight = (state = {}) => {
  const items = Array.isArray(state.items) ? state.items : []
  const estimatedItemsHeight = items.slice(-8).reduce((total, item) => {
    const text = String(item?.text || '')
    const estimatedLines = Math.max(1, Math.ceil(text.length / 14))
    const baseHeight = item?.kind === 'notice' ? 30 : 36
    return total + baseHeight + (estimatedLines - 1) * 18
  }, 0)
  const waitingExtra = state.awaitingReply || state.error ? 30 : 0
  const composerHeight = 72
  const verticalGaps = items.length > 0 ? Math.min(items.length, 8) * 8 : 8
  return clamp(estimatedItemsHeight + waitingExtra + composerHeight + verticalGaps, MIN_BUBBLE_HEIGHT, MAX_BUBBLE_HEIGHT)
}

const buildBubbleChatItems = ({ conversationMessages = [], noticeItems = [] } = {}) => {
  const dialogueItems = createDialogueItemsFromMessages(conversationMessages)
  const notices = (Array.isArray(noticeItems) ? noticeItems : [])
    .map((item) => normalizeBubbleChatItem({ ...item, kind: 'notice', role: item.role || 'system' }))
    .filter(Boolean)
    .slice(-MAX_NOTICE_ITEMS)
  return sortBubbleItems([...dialogueItems, ...notices])
}

const createManualOpenMessage = () => ({
  kind: 'dialogue',
  role: 'pet',
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
  let hideTimerDetails = null
  let historyTimer = null
  let allowClose = false
  let appliedHitTestInteractive = null
  let lastConversationMessages = []
  let lastPetBoundsSnapshot = null
  let syncingWindowBounds = false
  const dialogueVisibility = new Map()
  let state = {
    visible: false,
    hasWindow: false,
    pinned: false,
    autoPinned: false,
    interacting: false,
    message: null,
    items: [],
    noticeItems: [],
    transientDialogueItems: [],
    pendingUserMessages: [],
    streaming: null,
    unseenCount: 0,
    hitTestInteractive: false,
    lastUserMessage: null,
    sending: false,
    awaitingReply: false,
    error: '',
    placement: '',
    bounds: null,
    anchorMode: BUBBLE_ANCHOR_MODE.ANCHORED
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

  const isPinned = () => Boolean(state.pinned || state.autoPinned)

  const sanitizeLogText = (value, maxLength = 120) => String(value || '').slice(0, maxLength)

  const getStateLogDetails = (extra = {}) => {
    const message = state.message || {}
    const ttlMs = Number.isFinite(extra.ttlMs)
      ? extra.ttlMs
      : (Number.isFinite(message.ttlMs) ? message.ttlMs : 0)
    return {
      ...extra,
      requestId: sanitizeLogText(extra.requestId || message.requestId || ''),
      source: sanitizeLogText(extra.source || message.source || ''),
      sourceSurface: sanitizeLogText(extra.sourceSurface || message.sourceSurface || extra.source || message.source || ''),
      interactive: Boolean(state.hitTestInteractive),
      pinned: isPinned(),
      autoPinned: Boolean(state.autoPinned),
      interacting: Boolean(state.interacting),
      visible: Boolean(state.visible),
      awaitingReply: Boolean(state.awaitingReply),
      sending: Boolean(state.sending),
      anchorMode: state.anchorMode,
      ttlMs,
      reason: sanitizeLogText(extra.reason || ''),
      itemCount: Array.isArray(state.items) ? state.items.length : 0,
      noticeCount: Array.isArray(state.noticeItems) ? state.noticeItems.length : 0,
      pendingCount: Array.isArray(state.pendingUserMessages) ? state.pendingUserMessages.length : 0
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

  const clearHideTimer = (reason = 'clear') => {
    if (hideTimer) {
      clearTimeout(hideTimer)
      recordLog({
        level: 'debug',
        event: 'pet-bubble-chat.auto-hide.canceled',
        message: 'Pet bubble chat auto-hide canceled',
        details: getStateLogDetails({
          ...(hideTimerDetails || {}),
          reason
        })
      })
    }
    hideTimer = null
    hideTimerDetails = null
  }

  const clearHistoryTimer = () => {
    if (historyTimer) clearTimeout(historyTimer)
    historyTimer = null
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
    clearHideTimer('hide')
    clearHistoryTimer()
    if (bubbleWindow && !bubbleWindow.isDestroyed?.()) bubbleWindow.hide?.()
    patchState({ visible: false, interacting: false, hitTestInteractive: false })
    applyHitTestMode(false)
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.window.hidden',
      message: 'Pet bubble chat window hidden',
      details: getStateLogDetails({ source, reason: 'window-hidden' })
    })
    return getState()
  }

  const shouldHoldVisible = () => {
    const settings = getSettings()
    return isPinned() || state.interacting || state.awaitingReply || isActiveStreamState(state.streaming) || Boolean(state.error) || settings.autoHide === false
  }

  const getHoldVisibleReason = () => {
    const settings = getSettings()
    if (settings.autoHide === false) return 'auto-hide-disabled'
    if (isPinned()) return state.autoPinned && !state.pinned ? 'auto-pinned' : 'pinned'
    if (state.interacting) return 'interacting'
    if (state.awaitingReply) return 'awaiting-reply'
    if (isActiveStreamState(state.streaming)) return 'streaming'
    if (state.error) return 'error'
    return ''
  }

  const getDialogueVisibilityKey = (item = {}) => item.messageId || item.id || `${item.role}:${item.createdAt}:${item.text}`

  const markDialogueVisibility = (items = []) => {
    const now = Date.now()
    for (const item of items) {
      if (item.kind !== 'dialogue' || !item.text) continue
      const key = getDialogueVisibilityKey(item)
      const existing = dialogueVisibility.get(key)
      if (existing) continue
      const ttlMs = clamp(
        Number(item.ttlMs) || calculateBubbleTtlMs({ text: item.text, source: item.source }),
        MIN_HISTORY_TTL_MS,
        MAX_HISTORY_TTL_MS
      )
      dialogueVisibility.set(key, {
        visibleUntil: now + ttlMs,
        hidden: false
      })
    }
  }

  const refreshDialogueVisibility = (items = [], { minimumVisibleMs = DEFAULT_HISTORY_TTL_MS } = {}) => {
    const now = Date.now()
    for (const item of items) {
      if (item?.kind !== 'dialogue' || !item.text) continue
      const key = getDialogueVisibilityKey(item)
      const existing = dialogueVisibility.get(key)
      if (!existing || existing.hidden) continue
      const ttlMs = clamp(
        Number(item.ttlMs) || calculateBubbleTtlMs({ text: item.text, source: item.source }),
        MIN_HISTORY_TTL_MS,
        MAX_HISTORY_TTL_MS
      )
      dialogueVisibility.set(key, {
        ...existing,
        hidden: false,
        visibleUntil: now + Math.max(ttlMs, minimumVisibleMs)
      })
    }
  }

  const pruneDialogueVisibility = (items = []) => {
    const now = Date.now()
    if (shouldHoldVisible()) return
    for (const item of items) {
      if (item.kind !== 'dialogue' || !item.text) continue
      const key = getDialogueVisibilityKey(item)
      const existing = dialogueVisibility.get(key)
      if (!existing || existing.hidden) continue
      if (existing.visibleUntil <= now) {
        dialogueVisibility.set(key, { ...existing, hidden: true })
      }
    }
  }

  const scheduleHistoryPrune = () => {
    clearHistoryTimer()
    if (shouldHoldVisible()) return
    const candidates = Array.from(dialogueVisibility.values())
      .filter((entry) => entry && !entry.hidden && Number.isFinite(entry.visibleUntil))
      .map((entry) => entry.visibleUntil)
      .sort((a, b) => a - b)
    if (!candidates.length) return
    const delay = Math.max(100, candidates[0] - Date.now())
    historyTimer = setTimeout(() => {
      rebuildItems({
        conversationMessages: lastConversationMessages,
        noticeItems: state.noticeItems,
        reason: 'history-expired'
      })
      if (!state.items.length && !state.pendingUserMessages.length && !state.error && !state.awaitingReply && !state.interacting && !state.pinned) {
        hide({ source: 'history-expired' })
      }
    }, delay)
  }

  const scheduleAutoHide = (reason = 'schedule') => {
    clearHideTimer('reschedule')
    const settings = getSettings()
    if (!settings.autoHide) {
      recordLog({
        level: 'debug',
        event: 'pet-bubble-chat.auto-hide.skipped',
        message: 'Pet bubble chat auto-hide skipped',
        details: getStateLogDetails({ reason: 'settings-disabled' })
      })
      return
    }
    const holdReason = getHoldVisibleReason()
    if (holdReason) {
      recordLog({
        level: 'debug',
        event: 'pet-bubble-chat.auto-hide.frozen',
        message: 'Pet bubble chat auto-hide frozen',
        details: getStateLogDetails({ reason: holdReason })
      })
      return
    }
    if (!state.message?.ttlMs) {
      recordLog({
        level: 'debug',
        event: 'pet-bubble-chat.auto-hide.skipped',
        message: 'Pet bubble chat auto-hide skipped',
        details: getStateLogDetails({ reason: 'missing-ttl' })
      })
      return
    }
    hideTimerDetails = getStateLogDetails({ reason, ttlMs: state.message.ttlMs })
    recordLog({
      level: 'debug',
      event: 'pet-bubble-chat.auto-hide.scheduled',
      message: 'Pet bubble chat auto-hide scheduled',
      details: hideTimerDetails
    })
    hideTimer = setTimeout(() => {
      hideTimer = null
      const expiredDetails = hideTimerDetails || getStateLogDetails({ reason: 'auto-hide-expired' })
      hideTimerDetails = null
      if (!shouldHoldVisible()) {
        recordLog({
          level: 'debug',
          event: 'pet-bubble-chat.auto-hide.expired',
          message: 'Pet bubble chat auto-hide expired',
          details: expiredDetails
        })
        hide({ source: 'auto-hide' })
      } else {
        recordLog({
          level: 'debug',
          event: 'pet-bubble-chat.auto-hide.frozen',
          message: 'Pet bubble chat auto-hide frozen',
          details: getStateLogDetails({ reason: getHoldVisibleReason() || 'timer-expired-held' })
        })
      }
    }, state.message.ttlMs)
  }

  const getPetBounds = () => {
    const petWindow = getPetWindow()
    return getPetVisibleBounds(petWindow)
  }

  const getPetLogDetails = () => getPetAnchorDetails(getPetWindow())

  const applyWindowBounds = (bounds) => {
    if (!bubbleWindow || bubbleWindow.isDestroyed?.() || !bounds) return
    syncingWindowBounds = true
    bubbleWindow.setBounds?.({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    })
    syncingWindowBounds = false
  }

  const calculateBounds = () => {
    const petBounds = getPetBounds()
    const height = estimateBubbleHeight(state)
    return resolveBubbleBounds({
      petBounds,
      workArea: getWorkAreaForPetBounds(screen, petBounds),
      width: DEFAULT_BUBBLE_WIDTH,
      height
    })
  }

  const syncToPetWindow = () => {
    if (!bubbleWindow || bubbleWindow.isDestroyed?.()) return getState()
    const petBounds = getPetBounds()
    const height = estimateBubbleHeight(state)
    const anchoredBounds = resolveBubbleBounds({
      petBounds,
      workArea: getWorkAreaForPetBounds(screen, petBounds),
      width: DEFAULT_BUBBLE_WIDTH,
      height
    })
    const petMoved = !samePetBounds(petBounds, lastPetBoundsSnapshot)
    const shouldPreserveDetachedPosition =
      state.anchorMode === BUBBLE_ANCHOR_MODE.DETACHED_TEMPORARY &&
      !petMoved
    let nextBounds = anchoredBounds
    let nextPlacement = anchoredBounds.placement
    let nextAnchorMode = state.anchorMode

    if (shouldPreserveDetachedPosition) {
      const currentBounds = normalizePetBounds(bubbleWindow.getBounds?.())
      if (currentBounds) {
        nextBounds = {
          ...anchoredBounds,
          x: currentBounds.x,
          y: currentBounds.y
        }
        nextPlacement = 'detached-temporary'
      }
    } else if (state.anchorMode === BUBBLE_ANCHOR_MODE.DETACHED_TEMPORARY) {
      nextAnchorMode = BUBBLE_ANCHOR_MODE.ANCHORED
      nextPlacement = anchoredBounds.placement
      recordLog({
        level: 'debug',
        event: 'pet-bubble-chat.window.reanchored',
        message: 'Pet bubble chat window re-anchored to pet',
        details: getStateLogDetails({
          reason: petMoved ? 'pet-moved' : 'manual-reanchor',
          x: anchoredBounds.x,
          y: anchoredBounds.y,
          width: anchoredBounds.width,
          height: anchoredBounds.height,
          placement: anchoredBounds.placement,
          anchorProfile: BUBBLE_ANCHOR_PROFILE,
          ...getPetLogDetails()
        })
      })
    }

    applyWindowBounds(nextBounds)
    lastPetBoundsSnapshot = petBounds
    patchState({ bounds: nextBounds, placement: nextPlacement, anchorMode: nextAnchorMode })
    return getState()
  }

  const dragWindowTo = ({ x, y, source = 'pet-bubble-chat-renderer' } = {}) => {
    if (!bubbleWindow || bubbleWindow.isDestroyed?.()) return getState()
    if (!Number.isFinite(x) || !Number.isFinite(y)) return getState()
    const currentBounds = normalizePetBounds(bubbleWindow.getBounds?.()) || state.bounds || calculateBounds()
    const petBounds = getPetBounds()
    const nextBounds = clampBubbleWindowPosition({
      bounds: {
        ...currentBounds,
        x: Math.round(x),
        y: Math.round(y)
      },
      workArea: getWorkAreaForPetBounds(screen, petBounds)
    })
    applyWindowBounds(nextBounds)
    lastPetBoundsSnapshot = petBounds
    const alreadyDetached = state.anchorMode === BUBBLE_ANCHOR_MODE.DETACHED_TEMPORARY
    patchState({
      bounds: nextBounds,
      placement: 'detached-temporary',
      anchorMode: BUBBLE_ANCHOR_MODE.DETACHED_TEMPORARY,
      visible: true,
      hitTestInteractive: true
    })
    if (!alreadyDetached) {
      recordLog({
        level: 'debug',
        event: 'pet-bubble-chat.window.detached',
        message: 'Pet bubble chat window detached from pet anchor',
        details: getStateLogDetails({
          source,
          reason: 'renderer-drag',
          x: nextBounds.x,
          y: nextBounds.y,
          width: nextBounds.width,
          height: nextBounds.height,
          placement: 'detached-temporary',
          ...getPetLogDetails()
        })
      })
    }
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
      movable: true,
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
    // 气泡窗同样挂着 preload 桥：不锁导航，一次渲染进程注入就能把窗口导到远端页面并接管桥。
    applyNavigationLock(bubbleWindow, PET_BUBBLE_CHAT_ENTRY_PATH)
    bubbleWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true })
    bubbleWindow.setAlwaysOnTop?.(true, BUBBLE_ALWAYS_ON_TOP_LEVEL)
    applyHitTestMode(false)
    bubbleWindow.on?.('move', () => {
      if (syncingWindowBounds || !bubbleWindow || bubbleWindow.isDestroyed?.()) return
      const movedBounds = normalizePetBounds(bubbleWindow.getBounds?.())
      if (!movedBounds) return
      const alreadyDetached = state.anchorMode === BUBBLE_ANCHOR_MODE.DETACHED_TEMPORARY
      if (alreadyDetached) {
        state = {
          ...state,
          bounds: movedBounds,
          placement: 'detached-temporary',
          hasWindow: Boolean(bubbleWindow && !bubbleWindow.isDestroyed?.())
        }
        return
      }
      patchState({
        bounds: movedBounds,
        placement: 'detached-temporary',
        anchorMode: BUBBLE_ANCHOR_MODE.DETACHED_TEMPORARY
      })
      recordLog({
        level: 'debug',
        event: 'pet-bubble-chat.window.detached',
        message: 'Pet bubble chat window detached from pet anchor',
        details: getStateLogDetails({
          reason: 'window-moved',
          x: movedBounds.x,
          y: movedBounds.y,
          width: movedBounds.width,
          height: movedBounds.height,
          placement: 'detached-temporary',
          ...getPetLogDetails()
        })
      })
    })
    bubbleWindow.on?.('close', (event) => {
      if (allowClose) return
      event?.preventDefault?.()
      hide({ source: 'window-close' })
    })
    bubbleWindow.once?.('closed', () => {
      bubbleWindow = null
      appliedHitTestInteractive = null
      clearHideTimer('window-closed')
      patchState({ visible: false, hasWindow: false })
    })
    bubbleWindow.once?.('ready-to-show', () => sendStateChanged())
    Promise.resolve(bubbleWindow.loadFile?.(PET_BUBBLE_CHAT_ENTRY_PATH)).catch((error) => {
      if (bubbleWindow && !bubbleWindow.isDestroyed?.()) {
        bubbleWindow.loadURL?.(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><title>OpenPet Bubble Chat</title><body>${error.message}</body>`)}`)
      }
    })
    patchState({ bounds, placement: bounds.placement })
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.window.opened',
      message: 'Pet bubble chat window opened',
      details: getStateLogDetails({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        placement: bounds.placement,
        anchorProfile: BUBBLE_ANCHOR_PROFILE,
        reason: 'window-created',
        ...getPetLogDetails()
      })
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
        details: getStateLogDetails({ enabled: false, source, reason: 'settings-disabled' })
      })
      if (state.visible) hide({ source: 'settings-disabled' })
      return getState()
    }
    const win = ensureWindow()
    patchState({
      anchorMode: BUBBLE_ANCHOR_MODE.ANCHORED,
      placement: ''
    })
    syncToPetWindow()
    clearHideTimer('manual-open')
    patchState({
      message: state.message || createManualOpenMessage(),
      visible: true,
      interacting: true,
      error: ''
    })
    if (focus && typeof win.show === 'function') win.show()
    else if (typeof win.showInactive === 'function') win.showInactive()
    else win.show?.()
    win.moveTop?.()
    if (focus) {
      win.focus?.()
      setHitTestMode({ interactive: true, source: 'manual-open-focus' })
    } else {
      setHitTestMode({ interactive: false, source: 'auto-open-idle' })
    }
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.window.open-requested',
      message: 'Pet bubble chat window open requested',
      details: getStateLogDetails({
        source,
        focus: Boolean(focus),
        anchorProfile: BUBBLE_ANCHOR_PROFILE,
        reason: focus ? 'manual-focus' : 'manual-open',
        ...getPetLogDetails()
      })
    })
    return getState()
  }

  const rebuildItems = ({
    conversationMessages = [],
    noticeItems = state.noticeItems,
    transientDialogueItems = state.transientDialogueItems,
    reason = 'manual'
  } = {}) => {
    lastConversationMessages = Array.isArray(conversationMessages) ? [...conversationMessages] : []
    const normalizedNotices = (Array.isArray(noticeItems) ? noticeItems : [])
      .map((item) => normalizeBubbleChatItem({ ...item, kind: 'notice', role: item.role || 'system' }))
      .filter(Boolean)
      .slice(-MAX_NOTICE_BUFFER_ITEMS)
    const normalizedTransientDialogues = (Array.isArray(transientDialogueItems) ? transientDialogueItems : [])
      .map((item) => normalizeBubbleChatItem({ ...item, kind: 'dialogue', role: item.role || 'pet' }))
      .filter(Boolean)
      .slice(-MAX_DIALOGUE_ITEMS)
    const dialogueItems = sortBubbleItems([
      ...createDialogueItemsFromMessages(lastConversationMessages),
      ...normalizedTransientDialogues
    ])
    markDialogueVisibility(dialogueItems)
    pruneDialogueVisibility(dialogueItems)
    const visibleDialogueItems = dialogueItems
      .filter((item) => {
        const visibility = dialogueVisibility.get(getDialogueVisibilityKey(item))
        return !visibility?.hidden
      })
      .slice(-MAX_DIALOGUE_ITEMS)
    const nextTransientDialogues = normalizedTransientDialogues
      .filter((item) => {
        const visibility = dialogueVisibility.get(getDialogueVisibilityKey(item))
        return !visibility?.hidden
      })
      .slice(-MAX_DIALOGUE_ITEMS)
    const pendingItems = state.pendingUserMessages
      .map((item) => normalizePendingUserMessage(item))
      .filter(Boolean)
      .map((item) => createPendingBubbleItem(item))
    const displayNotices = normalizedNotices.slice(-MAX_NOTICE_ITEMS)
    const items = sortBubbleItems([
      ...visibleDialogueItems,
      ...pendingItems,
      ...displayNotices
    ])
    patchState({
      items,
      noticeItems: normalizedNotices,
      transientDialogueItems: nextTransientDialogues,
      message: getLatestBubbleItem(items, state.message)
    })
    syncToPetWindow()
    scheduleHistoryPrune()
    recordLog({
      level: 'debug',
      event: 'pet-bubble-chat.items.updated',
      message: 'Pet bubble chat items updated',
        details: getStateLogDetails({
          reason,
          itemCount: items.length,
          noticeCount: normalizedNotices.length,
          conversationMessageCount: Array.isArray(conversationMessages) ? conversationMessages.length : 0,
          requestId: typeof state.message?.requestId === 'string' ? state.message.requestId : ''
        })
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
      patchState({ message: { ...item, ttlMs: item.ttlMs }, noticeItems })
      const nextState = rebuildItems({
        conversationMessages: lastConversationMessages,
        noticeItems,
        transientDialogueItems: state.transientDialogueItems,
        reason: 'notice-buffered'
      })
      recordLog({
        level: 'debug',
        event: 'pet-bubble-chat.notice.buffered',
        message: 'Pet bubble chat notice buffered',
        details: getStateLogDetails({
          source: item.source,
          sourceSurface: item.sourceSurface || item.source,
          textChars: item.text.length,
          noticeCount: noticeItems.length,
          requestId: item.requestId || ''
        })
      })
      return nextState
    }
    if (item.source !== 'ai') {
      const transientDialogueItems = [
        ...state.transientDialogueItems.filter((existing) => existing.id !== item.id),
        item
      ].slice(-MAX_DIALOGUE_ITEMS)
      patchState({
        transientDialogueItems,
        message: { ...item, ttlMs: item.ttlMs }
      })
      return rebuildItems({
        conversationMessages: lastConversationMessages,
        noticeItems: state.noticeItems,
        transientDialogueItems,
        reason: 'transient-dialogue'
      })
    }
    const items = sortBubbleItems([...state.items.filter((existing) => existing.kind !== 'dialogue' || existing.id !== item.id), item]).slice(-MAX_DIALOGUE_ITEMS - MAX_NOTICE_ITEMS)
    patchState({ message: { ...item, ttlMs: item.ttlMs }, items })
    syncToPetWindow()
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
          sourceSurface: String(payload?.sourceSurface || payload?.source || '').slice(0, 120),
          textChars: String(payload?.text || '').length,
          requestId: typeof payload?.requestId === 'string' ? payload.requestId.slice(0, 120) : ''
        }
      })
      if (state.visible) hide({ source: 'settings-disabled' })
      return getState()
    }
    const message = normalizeMessagePayload(payload)
    if (!message) return getState()
    appendNoticeOrDialogue({ ...payload, ...message })
    const win = ensureWindow()
    if (!state.visible) patchState({ anchorMode: BUBBLE_ANCHOR_MODE.ANCHORED, placement: '' })
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
    win.moveTop?.()
    syncToPetWindow()
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.message.displayed',
      message: 'Pet bubble chat message displayed',
      details: getStateLogDetails({
        source: message.source,
        sourceSurface: message.sourceSurface || message.source,
        textChars: message.text.length,
        ttlMs: message.ttlMs,
        requestId: typeof payload?.requestId === 'string' ? payload.requestId.slice(0, 120) : ''
      })
    })
    scheduleAutoHide('message-displayed')
    return getState()
  }

  const setPinned = (pinned, { source = 'pet-bubble-chat-renderer' } = {}) => {
    patchState({ pinned: Boolean(pinned), autoPinned: false })
    syncToPetWindow()
    recordLog({
      level: 'info',
      event: Boolean(pinned) ? 'pet-bubble-chat.interaction.pinned' : 'pet-bubble-chat.interaction.unpinned',
      message: Boolean(pinned) ? 'Pet bubble chat pinned' : 'Pet bubble chat unpinned',
      details: getStateLogDetails({ source, reason: Boolean(pinned) ? 'pinned' : 'unpinned' })
    })
    scheduleAutoHide('pin-changed')
    scheduleHistoryPrune()
    return getState()
  }

  const setInteracting = (interacting, { source = 'pet-bubble-chat-renderer' } = {}) => {
    const nextInteracting = Boolean(interacting)
    const settings = getSettings()
    const shouldAutoPin = settings.pinOnInteraction !== false && nextInteracting && !state.pinned
    const shouldReleaseAutoPin = !nextInteracting && state.autoPinned
    patchState({
      interacting: nextInteracting,
      autoPinned: shouldAutoPin ? true : (shouldReleaseAutoPin ? false : state.autoPinned)
    })
    syncToPetWindow()
    recordLog({
      level: 'debug',
      event: 'pet-bubble-chat.interaction.changed',
      message: 'Pet bubble chat interaction state changed',
      details: getStateLogDetails({
        source,
        interacting: nextInteracting,
        reason: nextInteracting ? (shouldAutoPin ? 'interaction-started-auto-pinned' : 'interaction-started') : (shouldReleaseAutoPin ? 'interaction-ended-auto-unpinned' : 'interaction-ended')
      })
    })
    scheduleAutoHide('interaction-changed')
    scheduleHistoryPrune()
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
      details: getStateLogDetails({ source, interactive: shouldInteract, reason: shouldInteract ? 'hit-test-interactive' : 'hit-test-passthrough' })
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
      awaitingReply: Boolean(sending) || state.pendingUserMessages.some((item) => item.status === 'queued' || item.status === 'sending'),
      lastUserMessage: normalizedUserMessage?.text ? normalizedUserMessage : null,
      error: String(error || '').slice(0, 240),
      interacting: state.interacting
    })
    syncToPetWindow()
    scheduleAutoHide('sending-state-changed')
    scheduleHistoryPrune()
    return getState()
  }

  const applyStreamState = (payload = {}) => {
    const streaming = normalizeStreamState(payload)
    const active = isActiveStreamState(streaming)
    if (active) ensureWindow()
    patchState({
      streaming,
      sending: active,
      awaitingReply: active || state.pendingUserMessages.some((item) => item.status === 'queued' || item.status === 'sending'),
      error: streaming.status === 'failed' ? streaming.errorMessage : ''
    })
    if (active) {
      if (!state.visible) patchState({ visible: true, anchorMode: BUBBLE_ANCHOR_MODE.ANCHORED, placement: '' })
      if (bubbleWindow && !bubbleWindow.isDestroyed?.()) {
        syncToPetWindow()
        bubbleWindow.showInactive?.()
        bubbleWindow.moveTop?.()
      }
    }
    recordLog({
      level: streaming.status === 'failed' ? 'warn' : 'debug',
      event: 'pet-bubble-chat.stream-state.applied',
      message: 'Pet bubble chat stream state applied',
      details: getStateLogDetails({
        requestId: streaming.requestId,
        reason: streaming.status,
        partialReplyChars: streaming.partialReplyChars,
        chunkCount: streaming.chunkCount
      })
    })
    scheduleAutoHide('stream-state-changed')
    return getState()
  }

  const queueOutgoingMessage = ({ text, requestId = '' } = {}) => {
    const pending = normalizePendingUserMessage({
      text,
      requestId,
      status: state.sending ? 'queued' : 'sending'
    })
    if (!pending) return { state: getState(), shouldStartRequest: false, batchMessages: [] }
    const pendingUserMessages = [...state.pendingUserMessages, pending]
    patchState({
      pendingUserMessages,
      awaitingReply: true,
      error: '',
      lastUserMessage: { text: pending.text, createdAt: pending.createdAt }
    })
    refreshDialogueVisibility(getCurrentDialogueItems(state.items))
    recordLog({
      level: 'info',
      event: state.sending ? 'pet-bubble-chat.request.queued' : 'pet-bubble-chat.request.started',
      message: state.sending ? 'Pet bubble chat request queued' : 'Pet bubble chat request started',
      details: getStateLogDetails({
        requestId: pending.requestId,
        reason: state.sending ? 'active-request-in-flight' : 'mini-input-submit',
        messageChars: pending.text.length,
        queued: Boolean(state.sending)
      })
    })
    rebuildItems({
      conversationMessages: lastConversationMessages,
      noticeItems: state.noticeItems,
      reason: state.sending ? 'queue-outgoing-while-sending' : 'queue-outgoing'
    })
    if (state.sending) {
      return { state: getState(), shouldStartRequest: false, batchMessages: [] }
    }
    const nextPendingUserMessages = pendingUserMessages.map((item) => (
      item.status === 'pending-merge' || item.id === pending.id
        ? { ...item, status: 'sending', requestId }
        : item
    ))
    patchState({
      pendingUserMessages: nextPendingUserMessages,
      sending: true,
      awaitingReply: true
    })
    rebuildItems({
      conversationMessages: lastConversationMessages,
      noticeItems: state.noticeItems,
      reason: 'request-started'
    })
    return {
      state: getState(),
      shouldStartRequest: true,
      batchMessages: nextPendingUserMessages
        .filter((item) => item.requestId === requestId && item.status === 'sending')
        .map((item) => item.text)
    }
  }

  const completeRequest = ({ requestId = '', conversationMessages = [] } = {}) => {
    const remainingPending = state.pendingUserMessages.filter((item) => item.requestId !== requestId)
    patchState({
      pendingUserMessages: remainingPending,
      streaming: state.streaming?.requestId === requestId ? null : state.streaming,
      sending: false,
      awaitingReply: remainingPending.length > 0,
      error: ''
    })
    refreshDialogueVisibility(getCurrentDialogueItems(state.items))
    const nextState = rebuildItems({
      conversationMessages,
      noticeItems: state.noticeItems,
      reason: 'request-completed'
    })
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.request.completed',
      message: 'Pet bubble chat request completed',
      details: getStateLogDetails({
        requestId,
        reason: 'request-completed',
        conversationMessageCount: Array.isArray(conversationMessages) ? conversationMessages.length : 0
      })
    })
    return nextState
  }

  const failRequest = ({ requestId = '', error = '' } = {}) => {
    const nextPending = state.pendingUserMessages.map((item) => ({
      ...item,
      status: item.requestId === requestId || item.status === 'queued' || item.status === 'sending'
        ? 'pending-merge'
        : item.status,
      requestId: item.requestId === requestId ? '' : item.requestId
    }))
    patchState({
      pendingUserMessages: nextPending,
      streaming: state.streaming?.requestId === requestId ? null : state.streaming,
      sending: false,
      awaitingReply: nextPending.length > 0,
      error: String(error || '').slice(0, 240)
    })
    const nextState = rebuildItems({
      conversationMessages: lastConversationMessages,
      noticeItems: state.noticeItems,
      reason: 'request-failed'
    })
    recordLog({
      level: 'warn',
      event: 'pet-bubble-chat.request.failed',
      message: 'Pet bubble chat request failed',
      details: getStateLogDetails({
        requestId,
        reason: 'request-failed',
        errorChars: String(error || '').length,
        retryablePendingCount: nextPending.filter((item) => item.status === 'pending-merge').length
      })
    })
    return nextState
  }

  const startQueuedRequest = (requestId = '') => {
    if (state.sending) return []
    const queued = state.pendingUserMessages.filter((item) => item.status === 'queued' || item.status === 'pending-merge')
    if (!queued.length) return []
    const nextPendingUserMessages = state.pendingUserMessages.map((item) => (
      item.status === 'queued' || item.status === 'pending-merge'
        ? { ...item, status: 'sending', requestId }
        : item
    ))
    patchState({
      pendingUserMessages: nextPendingUserMessages,
      sending: true,
      awaitingReply: true,
      error: ''
    })
    refreshDialogueVisibility(getCurrentDialogueItems(state.items))
    recordLog({
      level: 'info',
      event: 'pet-bubble-chat.request.started',
      message: 'Pet bubble chat queued request started',
      details: getStateLogDetails({
        requestId,
        reason: 'queued-request-started',
        batchCount: queued.length,
        messageChars: queued.reduce((total, item) => total + String(item.text || '').length, 0)
      })
    })
    rebuildItems({
      conversationMessages: lastConversationMessages,
      noticeItems: state.noticeItems,
      reason: 'queued-request-started'
    })
    return nextPendingUserMessages
      .filter((item) => item.requestId === requestId && item.status === 'sending')
      .map((item) => item.text)
  }

  const getState = () => ({
    ...state,
    pinned: isPinned(),
    hasWindow: Boolean(bubbleWindow && !bubbleWindow.isDestroyed?.()),
    visible: Boolean(bubbleWindow && !bubbleWindow.isDestroyed?.() && bubbleWindow.isVisible?.() !== false && state.visible)
  })

  electron.app?.on?.('before-quit', () => {
    allowClose = true
    clearHideTimer('before-quit')
  })

  return {
    getState,
    hide,
    open,
    setInteracting,
    setHitTestMode,
    setPinned,
    setSendingState,
    applyStreamState,
    queueOutgoingMessage,
    completeRequest,
    failRequest,
    startQueuedRequest,
    appendNoticeOrDialogue,
    refreshItems,
    rebuildItems,
    showMessage,
    dragWindowTo,
    syncToPetWindow,
    getWindow: () => (bubbleWindow && !bubbleWindow.isDestroyed?.() ? bubbleWindow : null)
  }
}

module.exports = {
  calculateBubbleTtlMs,
  buildBubbleChatItems,
  clampBubbleWindowPosition,
  classifyBubbleChatKind,
  createBubbleRequestId,
  createPetBubbleChatWindowManager,
  createDialogueItemsFromMessages,
  normalizeBubbleChatSettings,
  normalizeBubbleChatItem,
  resolveBubbleBounds
}
