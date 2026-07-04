const createDashboardRuntime = ({
  documentRef = typeof document !== 'undefined' ? document : null,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null
} = {}) => {
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  const sanitizeDisplayText = (value = '') => String(value || '')
    .replace(/\bhttps?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s]*)?/gi, '[local-url]')
    .replace(/\b(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s]*)?/gi, '[local-url]')
    .replace(/\[::1\](?::\d+)?(?:\/[^\s]*)?/gi, '[local-url]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted-key]')
    .replace(/(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/[^\s,，。)]+/g, '[path]')
    .replace(/[A-Za-z]:\\[^\s,，。)]+/g, '[path]')
    .trim()

  const STATUS_META = {
    idle: { label: 'Idle', tone: 'neutral' },
    thinking: { label: 'Thinking', tone: 'info' },
    working: { label: 'Working', tone: 'info' },
    waiting: { label: 'Waiting', tone: 'warning' },
    blocked: { label: 'Blocked', tone: 'danger' },
    failed: { label: 'Failed', tone: 'danger' },
    completed: { label: 'Completed', tone: 'success' }
  }

  const formatNumber = (value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? new Intl.NumberFormat('en-US').format(numeric) : '0'
  }

  const formatTimestamp = (value) => {
    if (!value) return 'No recent activity'
    const numeric = Date.parse(String(value))
    if (!Number.isFinite(numeric)) return escapeHtml(String(value))
    return new Date(numeric).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusMeta = (status) => STATUS_META[String(status || '').toLowerCase()] || {
    label: String(status || 'Unknown') || 'Unknown',
    tone: 'neutral'
  }

  const summarizeHookMode = (hookMode = {}) => {
    if (hookMode.installed) return 'Installed'
    if (hookMode.planAvailable) return hookMode.tokenConfigured ? 'Plan ready' : 'Plan drafted'
    return 'Not installed'
  }

  const describeUnknownBreakdown = (diagnostics = {}) => {
    const parts = []
    const content = Number(diagnostics.ignoredContentRecordCount) || 0
    const metadata = Number(diagnostics.ignoredMetadataRecordCount) || 0
    const unsupported = Number(diagnostics.unsupportedLifecycleRecordCount) || 0
    if (content > 0) parts.push(`${formatNumber(content)} content`)
    if (metadata > 0) parts.push(`${formatNumber(metadata)} metadata`)
    if (unsupported > 0) parts.push(`${formatNumber(unsupported)} unsupported`)
    return parts.length ? parts.join(' · ') : 'No ignored rollout records'
  }

  const getActiveSessionCount = (sessions = []) => sessions.filter((session) => {
    const status = String(session.status || '').toLowerCase()
    return !['idle', 'completed', 'failed'].includes(status)
  }).length

  const buildDashboardViewModel = ({ health = {}, sessionsPayload = {} } = {}) => {
    const sessions = Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : []
    const diagnostics = health.diagnostics || {}
    const hookMode = health.hookMode || {}
    const codexPoller = health.codexPoller || {}
    const latestTimestamp = diagnostics.lastEventAt || sessions[0]?.timestamp || ''
    const activeSessionCount = Number.isFinite(Number(diagnostics.activeSessionCount))
      ? Number(diagnostics.activeSessionCount)
      : getActiveSessionCount(sessions)

    return {
      serviceOk: health.ok === true,
      summary: [
        {
          label: 'Tracked Sessions',
          value: formatNumber(sessions.length),
          detail: `${formatNumber(activeSessionCount)} active now`
        },
        {
          label: 'Observed Events',
          value: formatNumber(diagnostics.totalEvents),
          detail: `${formatNumber(diagnostics.seenCount)} rollout events derived`
        },
        {
          label: 'Last Update',
          value: formatTimestamp(latestTimestamp),
          detail: latestTimestamp ? 'Latest sanitized event timestamp' : 'Waiting for the first safe event'
        },
        {
          label: 'Hook Mode',
          value: summarizeHookMode(hookMode),
          detail: hookMode.ingestAuthRequired ? 'Bearer token required for POST /api/events' : 'Polling-only by default'
        }
      ],
      healthRows: [
        {
          label: 'Service',
          value: health.service || 'agent-awareness',
          detail: health.ok ? 'Healthy' : 'Unavailable',
          tone: health.ok ? 'success' : 'danger'
        },
        {
          label: 'Poller',
          value: codexPoller.enabled ? 'Enabled' : 'Disabled',
          detail: diagnostics.lastScanAt ? `Last scan ${formatTimestamp(diagnostics.lastScanAt)}` : 'No scan recorded yet',
          tone: codexPoller.lastError ? 'danger' : codexPoller.enabled ? 'success' : 'neutral'
        },
        {
          label: 'Unknown Records',
          value: formatNumber(diagnostics.unknownRecordCount),
          detail: describeUnknownBreakdown(diagnostics),
          tone: Number(diagnostics.unknownRecordCount) > 0 ? 'warning' : 'neutral'
        },
        {
          label: 'Malformed Records',
          value: formatNumber(diagnostics.malformedRecordCount),
          detail: 'Skipped safely during parsing',
          tone: Number(diagnostics.malformedRecordCount) > 0 ? 'warning' : 'neutral'
        },
        {
          label: 'Hook State',
          value: summarizeHookMode(hookMode),
          detail: hookMode.planAvailable ? 'Local plan file exists' : 'No hook plan generated yet',
          tone: hookMode.installed ? 'success' : hookMode.planAvailable ? 'info' : 'neutral'
        },
        {
          label: 'Last Error',
          value: diagnostics.lastError ? 'Attention needed' : 'None',
          detail: sanitizeDisplayText(diagnostics.lastError || 'No recent poller errors'),
          tone: diagnostics.lastError ? 'danger' : 'success'
        }
      ],
      sessions: sessions.map((session) => ({
        project: sanitizeDisplayText(session.project || 'Unknown project'),
        sessionId: session.sessionId || '',
        message: sanitizeDisplayText(session.message || 'No sanitized message'),
        timestamp: formatTimestamp(session.timestamp),
        status: getStatusMeta(session.status),
        lastEvent: session.type || 'session.updated',
        timeline: Array.isArray(session.history)
          ? session.history.slice(-4).reverse().map((entry) => ({
            type: entry.type || 'session.updated',
            status: getStatusMeta(entry.status),
            message: sanitizeDisplayText(entry.message || 'No sanitized message'),
            timestamp: formatTimestamp(entry.timestamp)
          }))
          : []
      }))
    }
  }

  const renderSummary = (summary = []) => summary.map((item) => `
    <article class="metric">
      <p class="metric-label">${escapeHtml(item.label)}</p>
      <p class="metric-value">${escapeHtml(sanitizeDisplayText(item.value))}</p>
      <p class="metric-detail">${escapeHtml(sanitizeDisplayText(item.detail))}</p>
    </article>
  `).join('')

  const renderHealthRows = (rows = []) => rows.map((row) => `
    <article class="health-row">
      <div>
        <p class="health-label">${escapeHtml(row.label)}</p>
        <p class="health-value">${escapeHtml(sanitizeDisplayText(row.value))}</p>
      </div>
      <div>
        <span class="status-badge tone-${escapeHtml(row.tone)}">${escapeHtml(sanitizeDisplayText(row.detail))}</span>
      </div>
    </article>
  `).join('')

  const renderTimeline = (timeline = []) => {
    if (!timeline.length) return '<p class="timeline-empty">No timeline yet.</p>'
    return `<ol class="timeline">${timeline.map((entry) => `
      <li class="timeline-item">
        <div class="timeline-row">
          <span class="status-badge tone-${escapeHtml(entry.status.tone)}">${escapeHtml(entry.status.label)}</span>
          <span class="timeline-type">${escapeHtml(sanitizeDisplayText(entry.type))}</span>
        </div>
        <p class="timeline-message">${escapeHtml(sanitizeDisplayText(entry.message))}</p>
        <p class="timeline-time">${escapeHtml(entry.timestamp)}</p>
      </li>
    `).join('')}</ol>`
  }

  const renderSessions = (sessions = []) => {
    if (!sessions.length) {
      return '<p class="empty-state">No sanitized agent sessions observed yet.</p>'
    }
    return sessions.map((session) => `
      <article class="session" data-testid="agent-session">
        <header class="session-header">
          <div>
            <p class="session-project">${escapeHtml(sanitizeDisplayText(session.project))}</p>
            <p class="session-meta">${escapeHtml(sanitizeDisplayText(session.sessionId))} · ${escapeHtml(session.timestamp)}</p>
          </div>
          <span class="status-badge tone-${escapeHtml(session.status.tone)}">${escapeHtml(session.status.label)}</span>
        </header>
        <div class="session-body">
          <p class="session-label">Last Event</p>
          <p class="session-event">${escapeHtml(sanitizeDisplayText(session.lastEvent))}</p>
          <p class="session-message">${escapeHtml(sanitizeDisplayText(session.message))}</p>
        </div>
        <div class="session-body">
          <p class="session-label">Recent Timeline</p>
          ${renderTimeline(session.timeline)}
        </div>
      </article>
    `).join('')
  }

  const renderDashboard = (viewModel) => ({
    statusLine: viewModel.serviceOk ? 'Service healthy' : 'Service unavailable',
    summaryHtml: renderSummary(viewModel.summary),
    healthHtml: renderHealthRows(viewModel.healthRows),
    sessionsHtml: renderSessions(viewModel.sessions)
  })

  const load = async () => {
    if (!fetchImpl) throw new Error('Fetch is not available')
    const [healthResponse, sessionsResponse] = await Promise.all([
      fetchImpl('/health', { headers: { 'Cache-Control': 'no-store' } }),
      fetchImpl('/api/sessions', { headers: { 'Cache-Control': 'no-store' } })
    ])
    const health = await healthResponse.json()
    const sessionsPayload = await sessionsResponse.json()
    return buildDashboardViewModel({ health, sessionsPayload })
  }

  const mount = async () => {
    if (!documentRef) return
    const statusNode = documentRef.querySelector('#status-line')
    const summaryNode = documentRef.querySelector('#summary')
    const healthNode = documentRef.querySelector('#health')
    const sessionsNode = documentRef.querySelector('#sessions')
    const refreshButton = documentRef.querySelector('#refresh')

    const renderError = (message) => {
      if (statusNode) statusNode.textContent = message || 'Dashboard failed to load'
      if (summaryNode) summaryNode.innerHTML = '<p class="empty-state">Unable to load summary.</p>'
      if (healthNode) healthNode.innerHTML = '<p class="empty-state">Unable to load diagnostics.</p>'
      if (sessionsNode) sessionsNode.innerHTML = '<p class="empty-state">Unable to load sessions.</p>'
    }

    const refresh = async () => {
      if (statusNode) statusNode.textContent = 'Refreshing…'
      try {
        const viewModel = await load()
        const rendered = renderDashboard(viewModel)
        if (statusNode) statusNode.textContent = rendered.statusLine
        if (summaryNode) summaryNode.innerHTML = rendered.summaryHtml
        if (healthNode) healthNode.innerHTML = rendered.healthHtml
        if (sessionsNode) sessionsNode.innerHTML = rendered.sessionsHtml
      } catch (error) {
        renderError(error?.message || 'Dashboard failed to load')
      }
    }

    refreshButton?.addEventListener('click', () => { refresh().catch(() => {}) })
    await refresh()
  }

  return {
    buildDashboardViewModel,
    escapeHtml,
    mount,
    renderDashboard,
    renderHealthRows,
    renderSessions,
    renderSummary,
    renderTimeline
  }
}

const dashboardRuntime = createDashboardRuntime()

if (typeof document !== 'undefined') {
  dashboardRuntime.mount().catch(() => {})
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createDashboardRuntime
  }
}
