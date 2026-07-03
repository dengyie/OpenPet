const sessionsEl = document.querySelector('#sessions')
const refreshButton = document.querySelector('#refresh')

const appendText = (element, text) => {
  element.appendChild(document.createTextNode(String(text || '')))
}

const renderSessions = (sessions) => {
  sessionsEl.replaceChildren()
  if (!sessions.length) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    appendText(empty, 'No agent events received yet.')
    sessionsEl.appendChild(empty)
    return
  }
  for (const session of sessions) {
    const article = document.createElement('article')
    article.className = 'session'
    const header = document.createElement('div')
    const status = document.createElement('strong')
    appendText(status, session.status)
    const meta = document.createElement('span')
    appendText(meta, `${session.adapter} · ${session.cwdName || 'unknown project'}`)
    const message = document.createElement('p')
    appendText(message, session.message || 'No message')
    const updatedAt = document.createElement('small')
    appendText(updatedAt, session.updatedAt || '')
    header.append(status, meta)
    article.append(header, message, updatedAt)
    sessionsEl.appendChild(article)
  }
}

const loadSessions = async () => {
  sessionsEl.textContent = 'Loading...'
  const response = await fetch('/api/sessions')
  const body = await response.json()
  renderSessions(body.sessions || [])
}

refreshButton.addEventListener('click', () => {
  loadSessions().catch((error) => {
    sessionsEl.textContent = error.message || 'Failed to load sessions'
  })
})

loadSessions().catch((error) => {
  sessionsEl.textContent = error.message || 'Failed to load sessions'
})
