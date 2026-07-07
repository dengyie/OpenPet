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

  const hasFiniteMetadataNumber = (value) => {
    if (value == null || value === '') return false
    return Number.isFinite(Number(value))
  }

  const formatPercent = (value) => {
    if (!hasFiniteMetadataNumber(value)) return ''
    const numeric = Number(value)
    return `${Math.round(numeric * 100) / 100}%`
  }

  const formatCost = ({ amount, currency = 'USD' } = {}) => {
    if (amount == null || amount === '') return ''
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
      view: ['details', 'stats'].includes(normalizedView) ? normalizedView : '',
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
    if (hasFiniteMetadataNumber(usage.totalTokens)) parts.push(`${formatNumber(usage.totalTokens)} tokens`)
    if (hasFiniteMetadataNumber(usage.contextUsedPercent)) parts.push(`${formatPercent(usage.contextUsedPercent)} context`)
    const cost = formatCost({ amount: usage.estimatedCostUsd, currency: usage.currency })
    if (cost) parts.push(cost)
    return parts.length ? parts.join(' · ') : 'No usage metadata yet'
  }

  const describeUsageDiagnostics = (diagnostics = {}) => {
    const parts = []
    if (Number(diagnostics.usageInputTokens) > 0) parts.push(`${formatNumber(diagnostics.usageInputTokens)} input`)
    if (Number(diagnostics.usageOutputTokens) > 0) parts.push(`${formatNumber(diagnostics.usageOutputTokens)} output`)
    if (Number(diagnostics.usageCachedInputTokens) > 0) parts.push(`${formatNumber(diagnostics.usageCachedInputTokens)} cached`)
    return parts.length ? parts.join(' · ') : 'Sanitized metadata only'
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

  const getDateKey = (value) => {
    const numeric = Date.parse(String(value || ''))
    return Number.isFinite(numeric) ? new Date(numeric).toISOString().slice(0, 10) : ''
  }

  const pluralize = (count, singular, plural = `${singular}s`) => `${formatNumber(count)} ${count === 1 ? singular : plural}`

  const hasUsageStatsMetadata = (usage = {}) => (
    hasFiniteMetadataNumber(usage.totalTokens) ||
    hasFiniteMetadataNumber(usage.estimatedCostUsd) ||
    hasFiniteMetadataNumber(usage.contextUsedPercent)
  )

  const buildUsageStatsRecords = (sessions = []) => {
    const days = new Map()
    for (const session of sessions) {
      const sessionId = sanitizeDisplayText(session.sessionId || 'unknown-session').slice(0, 128)
      const entries = Array.isArray(session.history) && session.history.length ? session.history : [session]
      for (const entry of entries) {
        const date = getDateKey(entry.timestamp || session.timestamp)
        if (!date) continue
        const usage = entry.usage && typeof entry.usage === 'object' ? entry.usage : null
        if (!usage || !hasUsageStatsMetadata(usage)) continue
        if (!days.has(date)) {
          days.set(date, {
            date,
            eventCount: 0,
            sessions: new Set(),
            usageBySession: new Map()
          })
        }
        const day = days.get(date)
        day.eventCount += 1
        day.sessions.add(sessionId)
        const current = day.usageBySession.get(sessionId) || {
          contextUsedPercent: null,
          currency: '',
          estimatedCostUsd: null,
          totalTokens: null
        }
        if (hasFiniteMetadataNumber(usage.totalTokens)) {
          const totalTokens = Math.round(Number(usage.totalTokens))
          current.totalTokens = Math.max(current.totalTokens || 0, totalTokens)
        }
        if (hasFiniteMetadataNumber(usage.estimatedCostUsd)) {
          const estimatedCostUsd = Number(usage.estimatedCostUsd)
          current.estimatedCostUsd = Math.max(current.estimatedCostUsd || 0, estimatedCostUsd)
        }
        if (hasFiniteMetadataNumber(usage.contextUsedPercent)) {
          const contextUsedPercent = Number(usage.contextUsedPercent)
          current.contextUsedPercent = Math.max(current.contextUsedPercent || 0, contextUsedPercent)
        }
        if (usage.currency) current.currency = sanitizeDisplayText(usage.currency).slice(0, 8).toUpperCase()
        day.usageBySession.set(sessionId, current)
      }
    }
    return [...days.values()]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 7)
      .map((day) => {
        const usageRecords = [...day.usageBySession.values()]
        const totalTokens = usageRecords.reduce((sum, usage) => sum + (usage.totalTokens || 0), 0)
        const costRecords = usageRecords.filter((usage) => usage.estimatedCostUsd != null)
        const cost = costRecords.length
          ? costRecords.reduce((sum, usage) => sum + usage.estimatedCostUsd, 0)
          : null
        const currencies = new Set(costRecords.map((usage) => usage.currency).filter(Boolean))
        const currency = currencies.size === 1 ? [...currencies][0] : currencies.size > 1 ? 'MIXED' : ''
        const contextRecords = usageRecords
          .map((usage) => usage.contextUsedPercent)
          .filter((value) => value != null)
        const peakContext = contextRecords.length ? Math.max(...contextRecords) : null
        return {
          date: day.date,
          totalTokens,
          cost,
          currency,
          peakContext,
          sessionIds: [...day.sessions],
          eventCount: day.eventCount
        }
      })
  }

  const formatUsageStatsRows = (records = []) => records.map((row) => ({
    date: row.date,
    tokensText: row.totalTokens > 0 ? `${formatNumber(row.totalTokens)} tokens` : 'No token metadata',
    costText: row.cost != null ? formatCost({ amount: row.cost, currency: row.currency || 'USD' }) : 'No cost metadata',
    contextText: row.peakContext != null ? `${formatPercent(row.peakContext)} peak` : 'No context metadata',
    sessionsText: pluralize(row.sessionIds.length, 'session'),
    eventsText: pluralize(row.eventCount, 'event')
  }))

  const buildUsageStatsTotals = (records = []) => {
    const totalTokens = records.reduce((sum, row) => sum + (row.totalTokens || 0), 0)
    const costRecords = records.filter((row) => row.cost != null)
    const cost = costRecords.length ? costRecords.reduce((sum, row) => sum + row.cost, 0) : null
    const currencies = new Set(costRecords.map((row) => row.currency).filter(Boolean))
    const currency = currencies.size === 1 ? [...currencies][0] : currencies.size > 1 ? 'MIXED' : ''
    const peakContexts = records
      .map((row) => row.peakContext)
      .filter((value) => value != null)
    const sessionIds = new Set(records.flatMap((row) => row.sessionIds))
    const eventCount = records.reduce((sum, row) => sum + (row.eventCount || 0), 0)
    return {
      daysText: pluralize(records.length, 'day'),
      tokensText: totalTokens > 0 ? `${formatNumber(totalTokens)} tokens` : 'No token metadata',
      costText: cost != null ? formatCost({ amount: cost, currency: currency || 'USD' }) : 'No cost metadata',
      contextText: peakContexts.length ? `${formatPercent(Math.max(...peakContexts))} peak` : 'No context metadata',
      sessionsText: pluralize(sessionIds.size, 'session'),
      eventsText: pluralize(eventCount, 'event')
    }
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
    const statsMode = normalizedQuery.view === 'stats'
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
    const usageStatsRecords = buildUsageStatsRecords(sessions)

    return {
      detailFound,
      detailMode,
      detailNotice,
      requestedSessionId,
      serviceOk: health.ok === true,
      statsMode,
      usageStats: formatUsageStatsRows(usageStatsRecords),
      usageStatsTotals: buildUsageStatsTotals(usageStatsRecords),
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
          detail: describeUsageDiagnostics(diagnostics)
        },
        {
          label: 'Usage Cost',
          value: formatCost({ amount: diagnostics.usageEstimatedCostUsd, currency: diagnostics.usageCurrency }) || 'No cost metadata',
          detail: 'Estimated metadata only'
        },
        {
          label: 'Peak Context',
          value: formatPercent(diagnostics.usagePeakContextUsedPercent) || 'No context metadata',
          detail: 'Highest observed session context'
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
        currentStep: sanitizeDisplayText(session.summary?.currentStep || session.progressLabel || session.type || 'No current step yet'),
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

  const renderUsageStats = (stats = [], { statsMode = false, totals = {} } = {}) => `
    <div class="usage-stats">
      <div class="usage-stats-header">
        <strong>${statsMode ? 'Usage Stats Detail' : 'Recent Daily Totals'}</strong>
        <span>${statsMode ? 'Last 7 sanitized daily totals' : 'Latest sanitized daily totals'}</span>
      </div>
      ${statsMode ? `
        <div class="usage-stats-totals">
          <article>
            <p class="usage-stat-meta">Window</p>
            <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(totals.daysText || '0 days'))}</p>
          </article>
          <article>
            <p class="usage-stat-meta">Tokens</p>
            <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(totals.tokensText || 'No token metadata'))}</p>
          </article>
          <article>
            <p class="usage-stat-meta">Cost</p>
            <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(totals.costText || 'No cost metadata'))}</p>
          </article>
          <article>
            <p class="usage-stat-meta">Peak Context</p>
            <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(totals.contextText || 'No context metadata'))}</p>
          </article>
          <article>
            <p class="usage-stat-meta">Sessions</p>
            <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(totals.sessionsText || '0 sessions'))}</p>
          </article>
          <article>
            <p class="usage-stat-meta">Events</p>
            <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(totals.eventsText || '0 events'))}</p>
          </article>
        </div>
      ` : ''}
      ${stats.length ? stats.map((row) => `
        <article class="usage-stat-row">
          <div>
            <p class="usage-stat-date">${escapeHtml(sanitizeDisplayText(row.date))}</p>
            <p class="usage-stat-meta">${escapeHtml(sanitizeDisplayText(row.sessionsText))} · ${escapeHtml(sanitizeDisplayText(row.eventsText))}</p>
          </div>
          <div>
            <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(row.tokensText))}</p>
            <p class="usage-stat-meta">${escapeHtml(sanitizeDisplayText(row.costText))} · ${escapeHtml(sanitizeDisplayText(row.contextText))}</p>
          </div>
        </article>
      `).join('') : '<p class="empty-state">No usage trend metadata yet.</p>'}
    </div>
  `

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
            <p class="session-label session-sub-label">Current Step</p>
            <p class="session-fact-value">${escapeHtml(sanitizeDisplayText(session.currentStep))}</p>
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
    usageStatsHtml: renderUsageStats(viewModel.usageStats, {
      statsMode: viewModel.statsMode,
      totals: viewModel.usageStatsTotals
    }),
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
    const usageStatsNode = documentRef.querySelector('#usage-stats')
    const healthNode = documentRef.querySelector('#health')
    const sessionsNode = documentRef.querySelector('#sessions')
    const refreshButton = documentRef.querySelector('#refresh')
    const viewLinks = Array.from(documentRef.querySelectorAll('[data-view-link]'))
    const diagnosticsPanel = documentRef.querySelector('[data-section="diagnostics"]')
    const sessionsPanel = documentRef.querySelector('[data-section="sessions"]')

    const applyViewState = (viewModel = {}) => {
      const currentView = viewModel.statsMode ? 'stats' : viewModel.detailMode ? 'details' : 'overview'
      viewLinks.forEach((link) => {
        const linkView = link.getAttribute('data-view-link') || ''
        if (linkView === currentView) {
          link.setAttribute('aria-current', 'page')
        } else {
          link.removeAttribute('aria-current')
        }
      })
      if (diagnosticsPanel) diagnosticsPanel.hidden = currentView === 'stats'
      if (sessionsPanel) sessionsPanel.hidden = currentView === 'stats'
    }

    const renderError = (message) => {
      if (statusNode) statusNode.textContent = message || 'Dashboard failed to load'
      if (summaryNode) summaryNode.innerHTML = '<p class="empty-state">Unable to load summary.</p>'
      if (usageStatsNode) usageStatsNode.innerHTML = '<p class="empty-state">Unable to load usage stats.</p>'
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
        if (usageStatsNode) usageStatsNode.innerHTML = rendered.usageStatsHtml
        if (healthNode) healthNode.innerHTML = rendered.healthHtml
        if (sessionsNode) sessionsNode.innerHTML = rendered.sessionsHtml
        applyViewState(viewModel)
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
    renderUsageStats,
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
