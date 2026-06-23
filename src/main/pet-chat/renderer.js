const statusEl = document.getElementById('window-status')
const topmostButton = document.getElementById('topmost-button')
const settingsButton = document.getElementById('settings-button')
const closeButton = document.getElementById('close-button')
const messagesEl = document.getElementById('messages')
const chatInput = document.getElementById('chat-input')
const sendButton = document.getElementById('send-button')

let currentState = {}
let sending = false

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const renderMessages = (messages = []) => {
  if (!Array.isArray(messages) || !messages.length) {
    messagesEl.innerHTML = [
      '<article class="empty-state">',
      '<span>喵，聊天面板已经就位。</span>',
      '<small>这里会显示当前宠物包的主会话历史。</small>',
      '</article>'
    ].join('')
    return
  }
  messagesEl.innerHTML = messages.map((message) => [
    `<article class="message ${message.role === 'user' ? 'user' : 'assistant'}">`,
    `<span>${message.role === 'user' ? '你' : '宠物'}</span>`,
    `<p>${escapeHtml(message.content).replaceAll('\n', '<br>')}</p>`,
    '</article>'
  ].join('')).join('')
  messagesEl.scrollTop = messagesEl.scrollHeight
}

const renderWindowState = (state = {}) => {
  currentState = {
    ...currentState,
    ...state,
    ai: {
      ...(currentState.ai || {}),
      ...(state.ai || {})
    },
    petPack: {
      ...(currentState.petPack || {}),
      ...(state.petPack || {})
    },
    messages: Array.isArray(state.messages) ? state.messages : currentState.messages
  }
  const alwaysOnTop = currentState.alwaysOnTop !== false
  const petName = currentState.petPack?.displayName || currentState.petPack?.id || '当前宠物'
  const aiReady = currentState.ai?.ready === true
  statusEl.textContent = aiReady
    ? `${petName} · ${currentState.ai?.model || 'AI'}`
    : (currentState.ai?.reason || (alwaysOnTop ? '已置顶' : '未置顶'))
  topmostButton.textContent = alwaysOnTop ? '取消置顶' : '置顶'
  topmostButton.classList.toggle('active', alwaysOnTop)
  chatInput.disabled = sending || !aiReady
  sendButton.disabled = sending || !aiReady || !chatInput.value.trim()
  chatInput.placeholder = aiReady
    ? '输入消息，Enter 发送，Shift+Enter 换行'
    : (currentState.ai?.reason || '请先配置 AI Provider')
  renderMessages(currentState.messages || [])
}

const refreshState = async () => {
  try {
    renderWindowState(await window.petChatAPI.getState())
  } catch (_) {
    statusEl.textContent = '状态不可用'
  }
}

topmostButton.addEventListener('click', async () => {
  const nextAlwaysOnTop = !topmostButton.classList.contains('active')
  renderWindowState(await window.petChatAPI.setAlwaysOnTop(nextAlwaysOnTop))
})

settingsButton.addEventListener('click', () => {
  window.petChatAPI.openSettings()
})

closeButton.addEventListener('click', () => {
  window.petChatAPI.hide()
})

const sendDraft = async () => {
  const message = chatInput.value.trim()
  if (!message || sending || currentState.ai?.ready !== true) return
  sending = true
  const optimisticMessages = [...(currentState.messages || []), { role: 'user', content: message }]
  chatInput.value = ''
  renderWindowState({ ...currentState, messages: optimisticMessages })
  try {
    const result = await window.petChatAPI.sendMessage({ message })
    renderWindowState(result.state || {
      ...currentState,
      messages: Array.isArray(result.messages)
        ? result.messages
        : [...optimisticMessages, { role: 'assistant', content: result.reply || '' }]
    })
  } catch (error) {
    renderWindowState({
      ...currentState,
      messages: [
        ...optimisticMessages,
        { role: 'assistant', content: error?.message || '发送失败，请检查 AI Provider 设置。' }
      ]
    })
  } finally {
    sending = false
    renderWindowState(currentState)
    chatInput.focus()
  }
}

chatInput.addEventListener('input', () => {
  sendButton.disabled = sending || currentState.ai?.ready !== true || !chatInput.value.trim()
})

chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendDraft()
  }
})

sendButton.addEventListener('click', sendDraft)

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.petChatAPI.hide()
})

window.addEventListener('focus', refreshState)

window.petChatAPI.onStateChanged(renderWindowState)
refreshState()
