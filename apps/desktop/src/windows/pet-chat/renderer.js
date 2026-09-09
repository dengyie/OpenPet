const statusEl = document.getElementById('window-status')
const bubbleChatButton = document.getElementById('bubble-chat-button')
const bubblePinButton = document.getElementById('bubble-pin-button')
const topmostButton = document.getElementById('topmost-button')
const settingsButton = document.getElementById('settings-button')
const closeButton = document.getElementById('close-button')
const bubbleStrip = document.getElementById('bubble-strip')
const bubbleText = document.getElementById('bubble-text')
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

const normalizeStreaming = (streaming = null) => {
  if (!streaming || typeof streaming !== 'object' || !streaming.requestId) return null
  const status = ['started', 'streaming', 'completed', 'canceled', 'failed'].includes(streaming.status)
    ? streaming.status
    : 'streaming'
  const fallback = status === 'canceled'
    ? '已取消'
    : (status === 'failed' ? (streaming.errorMessage || '回复失败') : '正在回复...')
  return {
    requestId: String(streaming.requestId),
    status,
    text: String(streaming.partialReply || fallback),
    canCancel: streaming.canCancel === true && (status === 'started' || status === 'streaming')
  }
}

const renderMessages = (messages = [], streaming = null) => {
  const streamItem = normalizeStreaming(streaming)
  if ((!Array.isArray(messages) || !messages.length) && !streamItem) {
    messagesEl.innerHTML = [
      '<article class="empty-state">',
      '<span>扩展聊天面板已经就位。</span>',
      '<small>这里显示当前宠物包的主会话历史和较长对话。</small>',
      '</article>'
    ].join('')
    return
  }
  const messageHtml = (Array.isArray(messages) ? messages : []).map((message) => [
    `<article class="message ${message.role === 'user' ? 'user' : 'assistant'}">`,
    `<span>${message.role === 'user' ? '你' : '宠物'}</span>`,
    `<p>${escapeHtml(message.content).replaceAll('\n', '<br>')}</p>`,
    '</article>'
  ].join('')).join('')
  const streamingHtml = streamItem
    ? [
        `<article class="message assistant streaming" data-request-id="${escapeHtml(streamItem.requestId)}" data-status="${escapeHtml(streamItem.status)}">`,
        '<span>宠物</span>',
        `<p>${escapeHtml(streamItem.text).replaceAll('\n', '<br>')}</p>`,
        streamItem.canCancel ? '<button type="button" class="cancel-stream-button">停止</button>' : '',
        '</article>'
      ].join('')
    : ''
  messagesEl.innerHTML = messageHtml + streamingHtml
  messagesEl.scrollTop = messagesEl.scrollHeight
}

const renderBubble = (bubble = {}) => {
  const text = String(bubble.text || '').trim()
  bubbleStrip.hidden = !text
  bubbleText.textContent = text
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
    bubble: {
      ...(currentState.bubble || {}),
      ...(state.bubble || {})
    },
    messages: Array.isArray(state.messages) ? state.messages : currentState.messages,
    streaming: Object.prototype.hasOwnProperty.call(state, 'streaming') ? state.streaming : currentState.streaming
  }
  const alwaysOnTop = currentState.alwaysOnTop !== false
  const bubblePinned = currentState.bubbleChat?.pinned === true
  const petName = currentState.petPack?.displayName || currentState.petPack?.id || '当前宠物'
  const aiReady = currentState.ai?.ready === true
  statusEl.textContent = aiReady
    ? `${petName} · ${currentState.ai?.model || 'AI'}`
    : (currentState.ai?.reason || (alwaysOnTop ? '已置顶' : '未置顶'))
  topmostButton.textContent = alwaysOnTop ? '取消置顶' : '置顶'
  topmostButton.classList.toggle('active', alwaysOnTop)
  bubblePinButton.textContent = bubblePinned ? '取消定格' : '定格轻气泡'
  bubblePinButton.classList.toggle('active', bubblePinned)
  chatInput.disabled = sending || !aiReady
  sendButton.disabled = sending || !aiReady || !chatInput.value.trim()
  chatInput.placeholder = aiReady
    ? '输入消息，Enter 发送，Shift+Enter 换行'
    : (currentState.ai?.reason || '请先配置 AI Provider')
  renderBubble(currentState.bubble || {})
  renderMessages(currentState.messages || [], currentState.streaming)
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

bubbleChatButton.addEventListener('click', async () => {
  try {
    await window.petChatAPI.openBubbleChat?.()
    window.petChatAPI.hide()
  } catch (_) {
    // Keep the full chat window available when the bubble handoff fails.
  }
})

bubblePinButton.addEventListener('click', async () => {
  try {
    if (currentState.bubbleChat?.visible !== true) {
      await window.petChatAPI.openBubbleChat?.()
    }
    const pinned = currentState.bubbleChat?.pinned === true
    renderWindowState(await window.petChatAPI.setBubblePinned?.(!pinned))
  } catch (_) {
    // Keep the full chat window available when the bubble pin toggle fails.
  }
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

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('.cancel-stream-button')
  if (!button) return
  event.preventDefault?.()
  event.stopPropagation?.()
  const item = button.closest?.('[data-request-id]')
  const requestId = item?.getAttribute?.('data-request-id') || item?.dataset?.requestId || ''
  if (!requestId) return
  window.petChatAPI.cancelMessage?.({ requestId }).then(renderWindowState).catch(() => {})
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.petChatAPI.hide()
})

window.addEventListener('focus', refreshState)

window.petChatAPI.onStateChanged(renderWindowState)
refreshState()
