const shell = document.getElementById('bubble-shell')
const sourceLabel = document.getElementById('source-label')
const messageText = document.getElementById('message-text')
const pinButton = document.getElementById('pin-button')
const closeButton = document.getElementById('close-button')

let currentState = {}

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

document.addEventListener('mouseenter', () => setInteracting(true))
document.addEventListener('mouseleave', () => setInteracting(false))
document.addEventListener('selectionchange', () => {
  const hasSelection = Boolean(String(window.getSelection?.() || '').trim())
  if (hasSelection) setInteracting(true)
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.petBubbleChatAPI.hide()
})

document.addEventListener('click', () => setInteracting(true))

pinButton.addEventListener('click', async (event) => {
  event.stopPropagation()
  renderState(await window.petBubbleChatAPI.setPinned(!currentState.pinned))
})

closeButton.addEventListener('click', (event) => {
  event.stopPropagation()
  window.petBubbleChatAPI.hide()
})

window.addEventListener('focus', refreshState)
window.petBubbleChatAPI.onStateChanged(renderState)
refreshState()
