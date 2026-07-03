const shell = document.getElementById('bubble-shell')
const toolbar = document.getElementById('bubble-toolbar')
const closeButton = document.getElementById('close-button')
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

const hasTextSelection = () => Boolean(String(window.getSelection?.() || '').trim())

const createFallbackItem = (message = {}) => ({
  id: message.id || `fallback:${message.createdAt || ''}:${message.source || ''}:${message.text || ''}`,
  kind: message.kind === 'dialogue' ? 'dialogue' : 'notice',
  role: ['user', 'pet', 'system'].includes(message.role) ? message.role : 'pet',
  text: String(message.text || ''),
  source: message.source || 'Pet',
  createdAt: message.createdAt || '',
  flowState: message.flowState || ''
})

const getRenderableItems = (state = {}) => {
  const items = Array.isArray(state.items) && state.items.length
    ? state.items.filter((item) => item?.text)
    : (state.message?.text ? [createFallbackItem(state.message)] : [])
  const userText = String(state.lastUserMessage?.text || '').trim()
  if (!userText || items.some((item) => item.role === 'user' && item.text === userText)) return items
  return [
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
}

const getItemKey = (item = {}, index = 0) => (
  item.id || `${item.kind || ''}:${item.role || ''}:${item.source || ''}:${item.createdAt || ''}:${item.text || ''}:${item.status || ''}:${item.flowState || ''}:${index}`
)

const getSourceLabel = (item = {}) => {
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
  currentState.error
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
    currentState.error
  )
)

const shouldAcceptHitTest = () => {
  const hasDraft = Boolean(miniInput.value.trim())
  const focused = document.activeElement === miniInput
  return scrollingHistory ||
    canUseWindowControls() ||
    hovering ||
    focused ||
    hasDraft ||
    hasTextSelection() ||
    Boolean(currentState.sending) ||
    Boolean(currentState.error) ||
    canScrollHistory()
}

const scrollToLatest = () => {
  if (!bubbleStream) return
  bubbleStream.scrollTop = bubbleStream.scrollHeight || 0
}

const scrollBubbleStreamBy = (deltaY = 0) => {
  if (!bubbleStream || !Number.isFinite(deltaY) || deltaY === 0) return
  bubbleStream.scrollTop = Math.max(0, (bubbleStream.scrollTop || 0) + deltaY)
}

const isComposerTarget = (target) => {
  if (!target || typeof target.closest !== 'function') return false
  return Boolean(target.closest('#mini-input-form'))
}

const handleBubbleWheel = (event) => {
  event.preventDefault?.()
  event.stopPropagation?.()
  expanded = true
  scrollingHistory = true
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
  scrollBubbleStreamBy(event.deltaY)
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

    const label = document.createElement('span')
    label.className = 'bubble-item-source'
    label.textContent = getSourceLabel(item)

    const text = document.createElement('p')
    text.className = 'bubble-item-text'
    text.textContent = item.text

    node.appendChild(label)
    node.appendChild(text)
    if (flowState === 'sending' || flowState === 'queued') {
      const pending = document.createElement('span')
      pending.className = 'bubble-item-meta'
      pending.textContent = '...'
      node.appendChild(pending)
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
    localUnseenCount = 0
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
  if (itemsChanged || !holdScroll) scrollToLatest()
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
  const hasDraft = Boolean(miniInput.value.trim())
  const focused = document.activeElement === miniInput
  const shouldInteract = hovering || focused || hasDraft || hasTextSelection() || Boolean(currentState.sending) || Boolean(currentState.error)
  if (!shouldInteract) expanded = false
  setInteracting(shouldInteract)
  setHitTestMode(shouldAcceptHitTest(), 'renderer-interaction-sync')
  renderState(currentState)
}

document.addEventListener('mouseenter', () => {
  hovering = true
  expanded = true
  setInteracting(true)
  setHitTestMode(true, 'renderer-mouseenter')
  renderState(currentState)
})
document.addEventListener('mouseleave', () => {
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

document.addEventListener('dblclick', () => {
  expanded = true
  setInteracting(true)
  setHitTestMode(true, 'renderer-double-click')
  renderState(currentState)
})

newMessageButton?.addEventListener('click', (event) => {
  event.stopPropagation()
  localUnseenCount = 0
  scrollToLatest()
  updateUnseenButton()
})

bubbleStream?.addEventListener('wheel', handleBubbleWheel)

document.addEventListener('wheel', (event) => {
  if (isComposerTarget(event.target)) {
    event.preventDefault?.()
    event.stopPropagation?.()
    return
  }
  handleBubbleWheel(event)
}, { passive: false, capture: true })

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

toolbar?.addEventListener('mouseenter', () => {
  setHitTestMode(true, 'renderer-toolbar-hover')
})

window.addEventListener('focus', refreshState)
window.petBubbleChatAPI.onStateChanged((state) => {
  renderState(state)
  syncPassiveHitTestMode('renderer-state-changed')
})
refreshState()
