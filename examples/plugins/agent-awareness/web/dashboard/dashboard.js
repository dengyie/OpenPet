const createDashboardRuntime = ({
  documentRef = typeof document !== 'undefined' ? document : null,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  locationRef = typeof window !== 'undefined' ? window.location : null
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

  const formatPercent = (value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? `${Math.round(numeric * 100) / 100}%` : ''
  }

  const formatCost = ({ amount, currency = 'USD' } = {}) => {
    const numeric = Number(amount)
    if (!Number.isFinite(numeric)) return ''
    return `$${numeric.toFixed(6)} ${sanitizeDisplayText(currency || 'USD')}`
  }

  const getFirstQueryValue = (value) => {
    if (Array.isArray(value)) return value[0]
    return value
  }

  const normalizeQueryText = (value, maxLength = 128) => sanitizeDisplayText(getFirstQueryValue(value) || '').slice(0, maxLength)

  const parseDashboardQuery = (search = '') => {
    const query = {}
    const rawSearch = String(search || '')
    const trimmedSearch = rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch
    if (!trimmedSearch) return query
    const params = new URLSearchParams(trimmedSearch)
    for (const [key, value] of params.entries()) {
      if (!query[key]) query[key] = value
    }
    return query
  }

  const normalizeDashboardQuery = (query = {}) => {
    if (typeof query === 'string') return normalizeDashboardQuery(parseDashboardQuery(query))
    if (typeof URLSearchParams !== 'undefined' && query instanceof URLSearchParams) {
      return normalizeDashboardQuery(Object.fromEntries(query.entries()))
    }
    if (!query || typeof query !== 'object') {
      return { view: '', sessionId: '' }
    }
    const normalizedView = normalizeQueryText(query.view, 32).toLowerCase()
    return {
      view: normalizedView === 'details' ? 'details' : '',
      sessionId: normalizeQueryText(query.sessionId, 128)
    }
  }

  const buildDetailHref = (sessionId = '') => `?view=details&sessionId=${encodeURIComponent(normalizeQueryText(sessionId, 128))}`

  const getCurrentDashboardQuery = () => normalizeDashboardQuery(locationRef?.search || '')

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

  const describeUsage = (usage = {}) => {
    if (!usage || typeof usage !== 'object') return 'No usage metadata yet'
    const parts = []
    if (Number.isFinite(Number(usage.totalTokens))) parts.push(`${formatNumber(usage.totalTokens)} tokens`)
    if (Number.isFinite(Number(usage.contextUsedPercent))) parts.push(`${formatPercent(usage.contextUsedPercent)} context`)
    const cost = formatCost({ amount: usage.estimatedCostUsd, currency: usage.currency })
    if (cost) parts.push(cost)
    return parts.length ? parts.join(' · ') : 'No usage metadata yet'
  }

  const describeGit = (git = {}) => {
    if (!git || typeof git !== 'object') return 'No git metadata yet'
    const branch = sanitizeDisplayText(git.branch || 'unknown branch')
    const dirtyCount = Number(git.dirtyCount) || 0
    const state = git.dirty ? `${formatNumber(dirtyCount)} files changed` : 'clean'
    const remote = []
    if (Number(git.ahead) > 0) remote.push(`ahead ${formatNumber(git.ahead)}`)
    if (Number(git.behind) > 0) remote.push(`behind ${formatNumber(git.behind)}`)
    return [branch, state, ...remote].filter(Boolean).join(' · ')
  }

  const getActiveSessionCount = (sessions = []) => sessions.filter((session) => {
    const status = String(session.status || '').toLowerCase()
    return !['idle', 'completed', 'failed'].includes(status)
  }).length

  const buildDashboardViewModel = ({ health = {}, sessionsPayload = {}, query = {} } = {}) => {
    const sessions = Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : []
    const diagnostics = health.diagnostics || {}
    const hookMode = health.hookMode || {}
    const codexPoller = health.codexPoller || {}
    const latestTimestamp = diagnostics.lastEventAt || sessions[0]?.timestamp || ''
    const activeSessionCount = Number.isFinite(Number(diagnostics.activeSessionCount))
      ? Number(diagnostics.activeSessionCount)
      : getActiveSessionCount(sessions)
    const normalizedQuery = normalizeDashboardQuery(query)
    const detailMode = normalizedQuery.view === 'details'
    const requestedSessionId = normalizedQuery.sessionId
    const hasRequestedSessionId = detailMode && Boolean(requestedSessionId)
    const visibleSessions = hasRequestedSessionId
      ? sessions.filter((session) => String(session.sessionId || '') === requestedSessionId)
      : sessions
    const detailFound = !hasRequestedSessionId || visibleSessions.length > 0
    const detailNotice = !detailMode
      ? ''
      : hasRequestedSessionId
        ? detailFound
          ? `Focused Session: ${requestedSessionId}`
          : ''
        : 'Showing latest sanitized session details.'

    return {
      detailFound,
      detailMode,
      detailNotice,
      requestedSessionId,
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
        },
        {
          label: 'Usage Tokens',
          value: formatNumber(diagnostics.usageTotalTokens),
          detail: 'Sanitized metadata only'
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
      sessions: visibleSessions.map((session) => ({
        detailHref: buildDetailHref(session.sessionId || ''),
        project: sanitizeDisplayText(session.project || 'Unknown project'),
        sessionId: session.sessionId || '',
        message: sanitizeDisplayText(session.message || 'No sanitized message'),
        timestamp: formatTimestamp(session.timestamp),
        status: getStatusMeta(session.status),
        lastEvent: session.type || 'session.updated',
        usageText: describeUsage(session.usage),
        gitText: describeGit(session.git),
        summaryTitle: sanitizeDisplayText(session.summary?.title || session.project || 'Session summary'),
        progressHint: sanitizeDisplayText(session.summary?.recentProgressHint || session.message || 'No progress hint yet'),
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

  const renderSessions = (sessions = [], detailState = {}) => {
    const detailNoticeHtml = detailState.detailMode && detailState.detailNotice
      ? `<p class="detail-notice">${escapeHtml(sanitizeDisplayText(detailState.detailNotice))}</p>`
      : ''
    if (!sessions.length) {
      const emptyCopy = detailState.detailMode && detailState.detailFound === false
        ? 'Requested sanitized session was not found.'
        : 'No sanitized agent sessions observed yet.'
      return `${detailNoticeHtml}<p class="empty-state">${escapeHtml(emptyCopy)}</p>`
    }
    return `${detailNoticeHtml}${sessions.map((session) => `
      <article class="session" data-testid="agent-session">
        <header class="session-header">
          <div>
            <p class="session-project">${escapeHtml(sanitizeDisplayText(session.project))}</p>
            <p class="session-meta">${escapeHtml(sanitizeDisplayText(session.sessionId))} · ${escapeHtml(session.timestamp)}</p>
          </div>
          <div class="session-actions">
            <a class="session-detail-link" data-testid="agent-session-focus" href="${escapeHtml(session.detailHref || buildDetailHref(session.sessionId))}" aria-label="Focus sanitized session details">Focus</a>
            <span class="status-badge tone-${escapeHtml(session.status.tone)}">${escapeHtml(session.status.label)}</span>
          </div>
        </header>
        <div class="session-body">
          <p class="session-label">Last Event</p>
          <p class="session-event">${escapeHtml(sanitizeDisplayText(session.lastEvent))}</p>
          <p class="session-message">${escapeHtml(sanitizeDisplayText(session.message))}</p>
        </div>
        <div class="session-facts">
          <div>
            <p class="session-label">Session Summary</p>
            <p class="session-fact-value">${escapeHtml(sanitizeDisplayText(session.summaryTitle))}</p>
            <p class="session-message">${escapeHtml(sanitizeDisplayText(session.progressHint))}</p>
          </div>
          <div>
            <p class="session-label">Usage</p>
            <p class="session-fact-value">${escapeHtml(sanitizeDisplayText(session.usageText))}</p>
          </div>
          <div>
            <p class="session-label">Git</p>
            <p class="session-fact-value">${escapeHtml(sanitizeDisplayText(session.gitText))}</p>
          </div>
        </div>
        <div class="session-body">
          <p class="session-label">Recent Timeline</p>
          ${renderTimeline(session.timeline)}
        </div>
      </article>
    `).join('')}`
  }

  const renderDashboard = (viewModel) => ({
    statusLine: viewModel.serviceOk ? 'Service healthy' : 'Service unavailable',
    summaryHtml: renderSummary(viewModel.summary),
    healthHtml: renderHealthRows(viewModel.healthRows),
    sessionsHtml: renderSessions(viewModel.sessions, {
      detailFound: viewModel.detailFound,
      detailMode: viewModel.detailMode,
      detailNotice: viewModel.detailNotice
    })
  })

  const load = async () => {
    if (!fetchImpl) throw new Error('Fetch is not available')
    const [healthResponse, sessionsResponse] = await Promise.all([
      fetchImpl('/health', { headers: { 'Cache-Control': 'no-store' } }),
      fetchImpl('/api/sessions', { headers: { 'Cache-Control': 'no-store' } })
    ])
    const health = await healthResponse.json()
    const sessionsPayload = await sessionsResponse.json()
    return buildDashboardViewModel({ health, sessionsPayload, query: getCurrentDashboardQuery() })
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
    load,
    mount,
    normalizeDashboardQuery,
    parseDashboardQuery,
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
