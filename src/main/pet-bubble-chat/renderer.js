const shell = document.getElementById('bubble-shell')
const sourceLabel = document.getElementById('source-label')
const messageText = document.getElementById('message-text')
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

const renderState = (state = {}) => {
  currentState = {
    ...currentState,
    ...state,
    message: state.message === null ? null : (state.message || currentState.message || null)
  }
  const message = currentState.message || {}
  sourceLabel.textContent = message.source || 'Pet'
  messageText.textContent = message.text || '...'
  pinButton.setAttribute('aria-pressed', currentState.pinned ? 'true' : 'false')
  pinButton.textContent = currentState.pinned ? '已定格' : '定格'
  const userText = currentState.lastUserMessage?.text || ''
  lastUserMessage.hidden = !userText
  lastUserMessage.textContent = userText ? `你：${userText}` : ''
  errorMessage.hidden = !currentState.error
  errorMessage.textContent = currentState.error || ''
  inputForm.classList.toggle('expanded', expanded || Boolean(miniInput.value.trim()) || currentState.sending)
  miniInput.disabled = Boolean(currentState.sending)
  sendButton.disabled = Boolean(currentState.sending) || !miniInput.value.trim()
  sendButton.textContent = currentState.sending ? '发送中' : '发送'
  shell.hidden = !message.text
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

const hasTextSelection = () => Boolean(String(window.getSelection?.() || '').trim())

const syncUiInteractionState = () => {
  const hasDraft = Boolean(miniInput.value.trim())
  const focused = document.activeElement === miniInput
  const shouldInteract = hovering || focused || hasDraft || hasTextSelection() || Boolean(currentState.sending) || Boolean(currentState.error)
  if (!shouldInteract) expanded = false
  setInteracting(shouldInteract)
  renderState(currentState)
}

document.addEventListener('mouseenter', () => {
  hovering = true
  expanded = true
  setInteracting(true)
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
      renderState(currentState)
      return
    }
    window.petBubbleChatAPI.hide()
  }
})

document.addEventListener('click', () => {
  expanded = true
  setInteracting(true)
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

miniInput.addEventListener('focus', () => {
  expanded = true
  setInteracting(true)
  renderState(currentState)
})

miniInput.addEventListener('input', () => {
  expanded = true
  setInteracting(Boolean(miniInput.value.trim()) || document.activeElement === miniInput)
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
