const shell = document.getElementById('bubble-shell')
const bubbleCard = document.querySelector('.bubble-card')
const closeButton = document.getElementById('close-button')
const codexDetailsButton = document.getElementById('codex-details-button')
const bubbleStream = document.getElementById('bubble-stream')
const bubbleItems = document.getElementById('bubble-items')
const newMessageButton = document.getElementById('new-message-button')
const lastUserMessage = document.getElementById('last-user-message')
const errorMessage = document.getElementById('error-message')
const inputForm = document.getElementById('mini-input-form')
const miniInput = document.getElementById('mini-input')
const sendButton = document.getElementById('send-button')

let currentState = {}
let expanded = false
let hovering = false
let localUnseenCount = 0
let lastItemSignature = ''
let lastItemCount = 0
let scrollingHistory = false
let scrollInteractionTimer = null
let dragState = null
const DRAG_START_DISTANCE_PX = 4

const hasTextSelection = () => Boolean(String(window.getSelection?.() || '').trim())

const normalizeSourceLabel = (source = '') => {
  const normalizedSource = String(source || '').trim()
  if (normalizedSource.startsWith('plugin:openpet.agent-awareness')) return 'Codex'
  return ''
}

const createFallbackItem = (message = {}) => ({
  id: message.id || `fallback:${message.createdAt || ''}:${message.source || ''}:${message.text || ''}`,
  kind: message.kind === 'dialogue' ? 'dialogue' : 'notice',
  role: ['user', 'pet', 'system'].includes(message.role) ? message.role : 'pet',
  text: String(message.text || ''),
  source: message.source || 'Pet',
  sourceLabel: message.sourceLabel || normalizeSourceLabel(message.source),
  createdAt: message.createdAt || '',
  flowState: message.flowState || ''
})

const getRenderableItems = (state = {}) => {
  const items = Array.isArray(state.items) && state.items.length
    ? state.items.filter((item) => item?.text)
    : (state.message?.text ? [createFallbackItem(state.message)] : [])
  const userText = String(state.lastUserMessage?.text || '').trim()
  const withLocalUser = !userText || items.some((item) => item.role === 'user' && item.text === userText)
    ? items
    : [
    ...items,
    {
      id: `local-user:${state.lastUserMessage?.createdAt || userText}`,
      kind: 'dialogue',
      role: 'user',
      text: userText,
      source: 'user',
      createdAt: state.lastUserMessage?.createdAt || '',
      status: state.sending ? 'sending' : 'sent',
      flowState: state.sending ? 'sending' : 'sent'
    }
  ]
  const streaming = state.streaming && typeof state.streaming === 'object' ? state.streaming : null
  if (!streaming?.requestId) return withLocalUser
  const status = ['started', 'streaming', 'completed', 'canceled', 'failed'].includes(streaming.status)
    ? streaming.status
    : 'streaming'
  const statusText = status === 'canceled'
    ? '已取消'
    : (status === 'failed' ? (streaming.errorMessage || '回复失败') : '正在回复...')
  const partialReply = String(streaming.partialReply || statusText)
  const partialReplyChars = Number.isFinite(Number(streaming.partialReplyChars))
    ? Number(streaming.partialReplyChars)
    : partialReply.length
  const chunkCount = Math.max(0, Number(streaming.chunkCount) || 0)
  return [
    ...withLocalUser,
    {
      id: `stream:${streaming.requestId}:${status}:${chunkCount}:${partialReplyChars}`,
      kind: 'dialogue',
      role: 'pet',
      text: partialReply,
      source: 'ai',
      sourceLabel: 'Pet',
      createdAt: '',
      status,
      flowState: status,
      requestId: streaming.requestId,
      canCancel: streaming.canCancel === true
    }
  ]
}

const getItemKey = (item = {}, index = 0) => (
  item.id || `${item.kind || ''}:${item.role || ''}:${item.source || ''}:${item.createdAt || ''}:${item.text || ''}:${item.status || ''}:${item.flowState || ''}:${index}`
)

const getSourceLabel = (item = {}) => {
  const sourceLabel = String(item.sourceLabel || '').trim()
  if (sourceLabel) return sourceLabel
  const normalizedSourceLabel = normalizeSourceLabel(item.source)
  if (normalizedSourceLabel) return normalizedSourceLabel
  if (!item?.text) return 'Pet'
  if (item.kind === 'notice') return item.source || '提示'
  if (item.role === 'user') return '你'
  if (item.role === 'pet') return item.source === 'ai' ? 'Pet' : (item.source || 'Pet')
  return item.source || '提示'
}

const shouldHoldScroll = () => Boolean(
  currentState.pinned ||
  currentState.interacting ||
  scrollingHistory ||
  hovering ||
  document.activeElement === miniInput ||
  miniInput.value.trim() ||
  hasTextSelection() ||
  currentState.sending ||
  currentState.error ||
  currentState.streaming?.canCancel
)

const canScrollHistory = () => {
  const itemCount = Array.isArray(currentState.items) ? currentState.items.length : 0
  return itemCount > 1
}

const canUseWindowControls = () => Boolean(
  currentState.visible &&
  (
    (Array.isArray(currentState.items) && currentState.items.length > 0) ||
    currentState.awaitingReply ||
    Boolean(currentState.streaming?.requestId) ||
    currentState.error
  )
)

const shouldAcceptHitTest = () => {
  const hasDraft = Boolean(miniInput.value.trim())
  const focused = document.activeElement === miniInput
  return Boolean(dragState) ||
    scrollingHistory ||
    canUseWindowControls() ||
    hovering ||
    focused ||
    hasDraft ||
    hasTextSelection() ||
    Boolean(currentState.sending) ||
    Boolean(currentState.streaming?.canCancel) ||
    Boolean(currentState.error) ||
    canScrollHistory()
}

const scrollToLatest = () => {
  if (!bubbleStream) return
  bubbleStream.scrollTop = bubbleStream.scrollHeight || 0
}

const isNearLatest = () => {
  if (!bubbleStream) return true
  const scrollHeight = Number(bubbleStream.scrollHeight) || 0
  const scrollTop = Math.max(0, Number(bubbleStream.scrollTop) || 0)
  const clientHeight = Math.max(0, Number(bubbleStream.clientHeight) || 0)
  if (scrollHeight <= 0) return true
  const remaining = scrollHeight - clientHeight - scrollTop
  return remaining <= 28
}

const isComposerTarget = (target) => {
  if (!target || typeof target.closest !== 'function') return false
  return Boolean(target.closest('#mini-input-form'))
}

const isBubbleDragTarget = (target) => {
  if (!target || typeof target.closest !== 'function') return false
  if (target.closest('#close-button, #new-message-button, textarea, button')) return false
  return Boolean(target.closest(
    '.bubble-card, #bubble-shell, #bubble-stream, #bubble-items, .bubble-item, #last-user-message, #error-message, #mini-input-form'
  ))
}

const isSelectableBubbleTarget = (target) => {
  if (!target || typeof target.closest !== 'function') return false
  return Boolean(target.closest('.bubble-item-text, .bubble-item-source, .bubble-item-meta, #last-user-message, #error-message'))
}

const setDraggingUi = (dragging) => {
  bubbleCard?.classList?.toggle('dragging', dragging)
}

const sameBounds = (left, right) => Boolean(
  left &&
  right &&
  left.x === right.x &&
  left.y === right.y
)

const applyDragStatePatch = (patch = {}) => {
  if (!patch || typeof patch !== 'object') return
  currentState = {
    ...currentState,
    ...patch
  }
}

const flushDragMove = () => {
  if (!dragState?.queuedBounds) return
  const nextBounds = dragState.queuedBounds
  dragState.queuedBounds = null
  window.petBubbleChatAPI.dragWindowTo({
    x: nextBounds.x,
    y: nextBounds.y,
    source: 'renderer-drag-move'
  }).then((state) => {
    if (dragState) dragState.lastCommittedBounds = nextBounds
    applyDragStatePatch(state)
    if (dragState?.queuedBounds) scheduleDragMove()
  }).catch(() => {})
}

const scheduleDragMove = () => {
  if (!dragState || dragState.frameScheduled) return
  dragState.frameScheduled = true
  window.requestAnimationFrame(() => {
    if (dragState) dragState.frameScheduled = false
    flushDragMove()
  })
}

const flushFinalDragMove = (bounds, source) => {
  if (!bounds || sameBounds(bounds, dragState?.lastCommittedBounds)) return
  window.petBubbleChatAPI.dragWindowTo({
    x: bounds.x,
    y: bounds.y,
    source
  }).then((state) => {
    applyDragStatePatch(state)
  }).catch(() => {})
}

const handleBubbleWheel = (event) => {
  expanded = true
  scrollingHistory = true
  syncUiInteractionState()
  if (scrollInteractionTimer) window.clearTimeout(scrollInteractionTimer)
  scrollInteractionTimer = window.setTimeout(() => {
    scrollingHistory = false
    syncUiInteractionState()
  }, 180)
  const hadHitTest = Boolean(currentState.hitTestInteractive)
  currentState = {
    ...currentState,
    hitTestInteractive: true
  }
  if (!hadHitTest) setHitTestMode(true, 'renderer-bubble-wheel')
}

const updateUnseenButton = () => {
  if (!newMessageButton) return
  newMessageButton.hidden = localUnseenCount <= 0
  newMessageButton.textContent = localUnseenCount > 1
    ? `有 ${localUnseenCount} 条新消息`
    : '有新消息'
}

const renderBubbleItems = (items = []) => {
  const nodes = items.map((item, index) => {
    const node = document.createElement('li')
    const role = item.role || 'system'
    const kind = item.kind || 'notice'
    const status = item.status || 'sent'
    const flowState = item.flowState || ''
    node.className = `bubble-item bubble-item--${kind} bubble-item--${role} bubble-item--${status}${flowState ? ` bubble-item--flow-${flowState}` : ''}`
    node.dataset.itemId = getItemKey(item, index)
    if (item.requestId) node.dataset.requestId = item.requestId

    const label = document.createElement('span')
    label.className = 'bubble-item-source'
    label.textContent = getSourceLabel(item)

    const text = document.createElement('p')
    text.className = 'bubble-item-text'
    text.textContent = item.text

    node.appendChild(label)
    node.appendChild(text)
    if (item.canCancel) {
      const cancel = document.createElement('button')
      cancel.className = 'cancel-stream-button'
      cancel.textContent = '停止'
      node.appendChild(cancel)
    } else if (flowState === 'sending' || flowState === 'queued' || flowState === 'streaming' || flowState === 'started') {
      const pending = document.createElement('span')
      pending.className = 'bubble-item-meta'
      pending.textContent = '...'
      node.appendChild(pending)
    } else if (flowState === 'canceled') {
      const canceled = document.createElement('span')
      canceled.className = 'bubble-item-meta'
      canceled.textContent = '已取消'
      node.appendChild(canceled)
    } else if (flowState === 'pending-merge') {
      const pending = document.createElement('span')
      pending.className = 'bubble-item-meta'
      pending.textContent = '待补发'
      node.appendChild(pending)
    }
    return node
  })
  if (typeof bubbleItems.replaceChildren === 'function') bubbleItems.replaceChildren(...nodes)
  else {
    bubbleItems.textContent = ''
    nodes.forEach((node) => bubbleItems.appendChild(node))
  }
}

const renderState = (state = {}) => {
  const wasNearLatest = isNearLatest()
  const nextAwaitingReply = Object.prototype.hasOwnProperty.call(state, 'awaitingReply')
    ? Boolean(state.awaitingReply)
    : (state.sending === false ? false : currentState.awaitingReply)
  currentState = {
    ...currentState,
    ...state,
    awaitingReply: nextAwaitingReply,
    message: state.message === null ? null : (state.message || currentState.message || null)
  }
  const items = getRenderableItems(currentState)
  const signature = items.map(getItemKey).join('|')
  const holdScroll = shouldHoldScroll()
  let itemsChanged = false
  if (signature !== lastItemSignature) {
    itemsChanged = true
    if (holdScroll && !wasNearLatest) {
      localUnseenCount += Math.max(1, items.length - lastItemCount)
    } else {
      localUnseenCount = 0
    }
    lastItemSignature = signature
    lastItemCount = items.length
  } else if (!holdScroll) {
    localUnseenCount = 0
  }

  if (itemsChanged) renderBubbleItems(items)
  const composerHint = currentState.error
    ? '宠物刚才没接住，再试一次'
    : (currentState.awaitingReply ? '宠物正在回复…' : '')
  lastUserMessage.hidden = !composerHint
  lastUserMessage.textContent = composerHint
  errorMessage.hidden = !currentState.error
  errorMessage.textContent = currentState.error || ''
  inputForm.classList.toggle('expanded', expanded || Boolean(miniInput.value.trim()) || currentState.awaitingReply)
  miniInput.disabled = false
  sendButton.disabled = !miniInput.value.trim()
  sendButton.textContent = currentState.awaitingReply ? '继续发送' : '发送'
  shell.hidden = !items.length && !currentState.error && !currentState.sending && !currentState.awaitingReply
  if ((itemsChanged && (!holdScroll || wasNearLatest)) || !holdScroll) scrollToLatest()
  updateUnseenButton()
}

const refreshState = async () => {
  try {
    renderState(await window.petBubbleChatAPI.getState())
    syncPassiveHitTestMode('renderer-refresh-state')
  } catch (_) {
    renderState({})
  }
}

const setInteracting = (interacting) => {
  window.petBubbleChatAPI.setInteracting(interacting).then(renderState).catch(() => {})
}

const setHitTestMode = (interactive, source = 'pet-bubble-chat-renderer') => {
  window.petBubbleChatAPI.setHitTestMode?.({ interactive, source }).then(renderState).catch(() => {})
}

const syncPassiveHitTestMode = (source = 'renderer-state-sync') => {
  const interactive = shouldAcceptHitTest()
  if (Boolean(currentState.hitTestInteractive) === interactive) return
  setHitTestMode(interactive, source)
}

const syncUiInteractionState = () => {
  const dragging = Boolean(dragState)
  const hasDraft = Boolean(miniInput.value.trim())
  const focused = document.activeElement === miniInput
  const shouldInteract = dragging || hovering || focused || hasDraft || scrollingHistory || hasTextSelection() || Boolean(currentState.sending) || Boolean(currentState.error)
  if (!shouldInteract) expanded = false
  setInteracting(shouldInteract)
  setHitTestMode(shouldAcceptHitTest(), 'renderer-interaction-sync')
  renderState(currentState)
}

bubbleCard?.addEventListener('mouseenter', () => {
  hovering = true
  expanded = true
  setInteracting(true)
  setHitTestMode(true, 'renderer-mouseenter')
  renderState(currentState)
})

const findRequestIdTarget = (target) => {
  let node = target
  while (node) {
    if (node.dataset?.requestId) return node
    node = node.parentNode
  }
  return null
}

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('.cancel-stream-button')
  if (!button) return
  event.preventDefault?.()
  event.stopPropagation?.()
  const item = findRequestIdTarget(button)
  const requestId = item?.dataset?.requestId || ''
  if (!requestId) return
  window.petBubbleChatAPI.cancelMessage?.({ requestId }).then(renderState).catch(() => {})
})
bubbleCard?.addEventListener('mouseleave', () => {
  if (dragState) return
  hovering = false
  syncUiInteractionState()
})
document.addEventListener('selectionchange', () => {
  if (hasTextSelection()) expanded = true
  syncUiInteractionState()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (expanded || miniInput.value) {
      miniInput.value = ''
      expanded = false
      setInteracting(false)
      setHitTestMode(false, 'renderer-escape-collapse')
      renderState(currentState)
      return
    }
    window.petBubbleChatAPI.hide()
  }
})

closeButton?.addEventListener('click', (event) => {
  event.preventDefault?.()
  event.stopPropagation?.()
  window.petBubbleChatAPI.hide({ source: 'bubble-close-button' })
})

codexDetailsButton?.addEventListener('click', async (event) => {
  event.preventDefault?.()
  event.stopPropagation?.()
  expanded = true
  setInteracting(true)
  setHitTestMode(true, 'renderer-codex-details')
  try {
    await window.petBubbleChatAPI.openAgentAwarenessDetails?.()
    if (currentState.error) renderState({ ...currentState, error: '' })
  } catch (error) {
    renderState({
      ...currentState,
      error: error?.message || 'Codex 详情暂时不可用。'
    })
  } finally {
    syncUiInteractionState()
  }
})

bubbleCard?.addEventListener('pointerdown', (event) => {
  if (!isBubbleDragTarget(event.target)) return
  if (!Number.isFinite(event.screenX) || !Number.isFinite(event.screenY)) return
  if (!currentState?.bounds) return
  dragState = {
    pointerId: event.pointerId,
    originScreenX: event.screenX,
    originScreenY: event.screenY,
    originBounds: { ...currentState.bounds },
    startedFromSelectableContent: isSelectableBubbleTarget(event.target),
    dragging: false,
    lastCommittedBounds: null,
    queuedBounds: null,
    frameScheduled: false
  }
  hovering = true
  expanded = true
  setInteracting(true)
  setHitTestMode(true, 'renderer-drag-prepare')
  event.target?.setPointerCapture?.(event.pointerId)
})

document.addEventListener('pointermove', (event) => {
  if (!dragState) return
  if (dragState.pointerId !== undefined && event.pointerId !== undefined && dragState.pointerId !== event.pointerId) return
  const deltaX = event.screenX - dragState.originScreenX
  const deltaY = event.screenY - dragState.originScreenY
  if (!dragState.dragging) {
    if (dragState.startedFromSelectableContent && hasTextSelection()) return
    if (Math.hypot(deltaX, deltaY) < DRAG_START_DISTANCE_PX) return
    dragState.dragging = true
    event.preventDefault?.()
    event.stopPropagation?.()
    setDraggingUi(true)
    setInteracting(true)
    setHitTestMode(true, 'renderer-drag-start')
  }
  const nextX = dragState.originBounds.x + Math.round(event.screenX - dragState.originScreenX)
  const nextY = dragState.originBounds.y + Math.round(event.screenY - dragState.originScreenY)
  dragState.queuedBounds = { x: nextX, y: nextY }
  applyDragStatePatch({
    bounds: {
      ...(currentState.bounds || dragState.originBounds),
      x: nextX,
      y: nextY
    },
    anchorMode: 'detached-temporary',
    hitTestInteractive: true
  })
  scheduleDragMove()
})

const finishDrag = (event, source) => {
  if (!dragState) return
  if (dragState.pointerId !== undefined && event?.pointerId !== undefined && dragState.pointerId !== event.pointerId) return
  const finalBounds = dragState.dragging && Number.isFinite(event?.screenX) && Number.isFinite(event?.screenY)
    ? {
        x: dragState.originBounds.x + Math.round(event.screenX - dragState.originScreenX),
        y: dragState.originBounds.y + Math.round(event.screenY - dragState.originScreenY)
      }
    : dragState.queuedBounds
  const wasDragging = Boolean(dragState.dragging)
  if (wasDragging && finalBounds) flushFinalDragMove(finalBounds, source)
  dragState = null
  setDraggingUi(false)
  if (!hovering) expanded = false
  if (wasDragging) setHitTestMode(true, source)
  syncUiInteractionState()
}

document.addEventListener('pointerup', (event) => finishDrag(event, 'renderer-drag-end'))
document.addEventListener('pointercancel', (event) => finishDrag(event, 'renderer-drag-cancel'))

document.addEventListener('dblclick', () => {
  expanded = true
  setInteracting(true)
  setHitTestMode(true, 'renderer-double-click')
  renderState(currentState)
})

newMessageButton?.addEventListener('click', (event) => {
  event.stopPropagation()
  localUnseenCount = 0
  scrollingHistory = false
  scrollToLatest()
  syncUiInteractionState()
  updateUnseenButton()
})

bubbleStream?.addEventListener('wheel', handleBubbleWheel)

miniInput?.addEventListener('focus', () => {
  expanded = true
  setInteracting(true)
  setHitTestMode(true, 'renderer-input-focus')
  renderState(currentState)
})

miniInput?.addEventListener('input', () => {
  expanded = true
  syncUiInteractionState()
  renderState(currentState)
})

miniInput?.addEventListener('blur', () => {
  syncUiInteractionState()
})

miniInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    inputForm.requestSubmit()
  }
})

miniInput?.addEventListener('wheel', (event) => {
  event.preventDefault?.()
  event.stopPropagation?.()
})

inputForm?.addEventListener('wheel', (event) => {
  event.preventDefault?.()
  event.stopPropagation?.()
})

inputForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const message = miniInput.value.trim()
  if (!message) return
  miniInput.value = ''
  expanded = true
  renderState({
    ...currentState,
    sending: true,
    awaitingReply: true,
    error: '',
    lastUserMessage: { text: message, createdAt: new Date().toISOString() }
  })
  setHitTestMode(true, 'renderer-send-started')
  try {
    const result = await window.petBubbleChatAPI.sendMessage({ message })
    renderState(result.state || {})
    miniInput.blur?.()
  } catch (error) {
    renderState({ ...currentState, sending: false, error: error?.message || '发送失败，请检查 AI Provider 设置。' })
  } finally {
    syncUiInteractionState()
  }
})

window.addEventListener('focus', refreshState)
window.petBubbleChatAPI.onStateChanged((state) => {
  renderState(state)
  syncPassiveHitTestMode('renderer-state-changed')
})
refreshState()
