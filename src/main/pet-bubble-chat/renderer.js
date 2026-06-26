const shell = document.getElementById('bubble-shell')
const sourceLabel = document.getElementById('source-label')
const bubbleStream = document.getElementById('bubble-stream')
const bubbleItems = document.getElementById('bubble-items')
const newMessageButton = document.getElementById('new-message-button')
const openFullChatButton = document.getElementById('open-full-chat-button')
const pinButton = document.getElementById('pin-button')
const closeButton = document.getElementById('close-button')
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

const hasTextSelection = () => Boolean(String(window.getSelection?.() || '').trim())

const createFallbackItem = (message = {}) => ({
  id: message.id || `fallback:${message.createdAt || ''}:${message.source || ''}:${message.text || ''}`,
  kind: message.kind === 'dialogue' ? 'dialogue' : 'notice',
  role: ['user', 'pet', 'system'].includes(message.role) ? message.role : 'pet',
  text: String(message.text || ''),
  source: message.source || 'Pet',
  createdAt: message.createdAt || ''
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
      status: state.sending ? 'sending' : 'sent'
    }
  ]
}

const getItemKey = (item = {}, index = 0) => (
  item.id || `${item.kind || ''}:${item.role || ''}:${item.source || ''}:${item.createdAt || ''}:${item.text || ''}:${index}`
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
  hovering ||
  document.activeElement === miniInput ||
  miniInput.value.trim() ||
  hasTextSelection() ||
  currentState.sending ||
  currentState.error
)

const scrollToLatest = () => {
  if (!bubbleStream) return
  bubbleStream.scrollTop = bubbleStream.scrollHeight || 0
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
    node.className = `bubble-item bubble-item--${kind} bubble-item--${role} bubble-item--${status}`
    node.dataset.itemId = getItemKey(item, index)

    const label = document.createElement('span')
    label.className = 'bubble-item-source'
    label.textContent = getSourceLabel(item)

    const text = document.createElement('p')
    text.className = 'bubble-item-text'
    text.textContent = item.text

    node.appendChild(label)
    node.appendChild(text)
    return node
  })
  if (typeof bubbleItems.replaceChildren === 'function') bubbleItems.replaceChildren(...nodes)
  else {
    bubbleItems.textContent = ''
    nodes.forEach((node) => bubbleItems.appendChild(node))
  }
}

const renderState = (state = {}) => {
  currentState = {
    ...currentState,
    ...state,
    message: state.message === null ? null : (state.message || currentState.message || null)
  }
  const items = getRenderableItems(currentState)
  const signature = items.map(getItemKey).join('|')
  const holdScroll = shouldHoldScroll()
  if (signature !== lastItemSignature) {
    if (holdScroll) {
      if (items.length < lastItemCount) localUnseenCount = 0
      else localUnseenCount += Math.max(1, items.length - lastItemCount)
    } else {
      localUnseenCount = 0
    }
    lastItemSignature = signature
    lastItemCount = items.length
  } else if (!holdScroll) {
    localUnseenCount = 0
  }

  renderBubbleItems(items)
  sourceLabel.textContent = getSourceLabel(items.at(-1) || currentState.message || {})
  pinButton.setAttribute('aria-pressed', currentState.pinned ? 'true' : 'false')
  pinButton.textContent = currentState.pinned ? '已定格' : '定格'
  lastUserMessage.hidden = true
  lastUserMessage.textContent = ''
  errorMessage.hidden = !currentState.error
  errorMessage.textContent = currentState.error || ''
  inputForm.classList.toggle('expanded', expanded || Boolean(miniInput.value.trim()) || currentState.sending)
  miniInput.disabled = Boolean(currentState.sending)
  sendButton.disabled = Boolean(currentState.sending) || !miniInput.value.trim()
  sendButton.textContent = currentState.sending ? '发送中' : '发送'
  shell.hidden = !items.length && !currentState.error && !currentState.sending
  if (!holdScroll) scrollToLatest()
  updateUnseenButton()
}

const refreshState = async () => {
  try {
    renderState(await window.petBubbleChatAPI.getState())
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

const syncUiInteractionState = () => {
  const hasDraft = Boolean(miniInput.value.trim())
  const focused = document.activeElement === miniInput
  const shouldInteract = hovering || focused || hasDraft || hasTextSelection() || Boolean(currentState.sending) || Boolean(currentState.error)
  if (!shouldInteract) expanded = false
  setInteracting(shouldInteract)
  setHitTestMode(shouldInteract, 'renderer-interaction-sync')
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

document.addEventListener('click', () => {
  expanded = true
  setInteracting(true)
  setHitTestMode(true, 'renderer-click')
  renderState(currentState)
})

pinButton.addEventListener('click', async (event) => {
  event.stopPropagation()
  renderState(await window.petBubbleChatAPI.setPinned(!currentState.pinned))
})

closeButton.addEventListener('click', (event) => {
  event.stopPropagation()
  window.petBubbleChatAPI.hide()
})

newMessageButton.addEventListener('click', (event) => {
  event.stopPropagation()
  localUnseenCount = 0
  scrollToLatest()
  updateUnseenButton()
})

openFullChatButton.addEventListener('click', async (event) => {
  event.stopPropagation()
  try {
    await window.petBubbleChatAPI.openFullChat?.()
    expanded = false
    setInteracting(false)
    setHitTestMode(false, 'renderer-open-full-chat')
    window.petBubbleChatAPI.hide()
  } catch (_) {
    expanded = true
    setInteracting(true)
    setHitTestMode(true, 'renderer-open-full-chat-failed')
  }
})

miniInput.addEventListener('focus', () => {
  expanded = true
  setInteracting(true)
  setHitTestMode(true, 'renderer-input-focus')
  renderState(currentState)
})

miniInput.addEventListener('input', () => {
  expanded = true
  syncUiInteractionState()
  renderState(currentState)
})

miniInput.addEventListener('blur', () => {
  syncUiInteractionState()
})

miniInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    inputForm.requestSubmit()
  }
})

inputForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const message = miniInput.value.trim()
  if (!message || currentState.sending) return
  miniInput.value = ''
  expanded = true
  renderState({ ...currentState, sending: true, error: '', lastUserMessage: { text: message, createdAt: new Date().toISOString() } })
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
window.petBubbleChatAPI.onStateChanged(renderState)
refreshState()
