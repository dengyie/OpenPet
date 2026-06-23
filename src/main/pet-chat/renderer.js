const statusEl = document.getElementById('window-status')
const topmostButton = document.getElementById('topmost-button')
const settingsButton = document.getElementById('settings-button')
const closeButton = document.getElementById('close-button')

const renderWindowState = (state = {}) => {
  const alwaysOnTop = state.alwaysOnTop !== false
  statusEl.textContent = alwaysOnTop ? '已置顶' : '未置顶'
  topmostButton.textContent = alwaysOnTop ? '取消置顶' : '置顶'
  topmostButton.classList.toggle('active', alwaysOnTop)
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

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.petChatAPI.hide()
})

window.petChatAPI.onStateChanged(renderWindowState)
refreshState()
