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

  const roundSix = (value) => Math.round(Number(value || 0) * 1_000_000) / 1_000_000

  const toTimestampMs = (value) => {
    const numeric = Date.parse(String(value || ''))
    return Number.isFinite(numeric) ? numeric : 0
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
      return { view: 'overview', sessionId: '' }
    }
    const normalizedView = normalizeQueryText(query.view, 32).toLowerCase()
    const currentView = normalizedView === 'details'
      ? 'sessions'
      : normalizedView === 'stats'
        ? 'usage'
        : ['overview', 'sessions', 'usage'].includes(normalizedView) ? normalizedView : 'overview'
    return {
      view: currentView,
      sessionId: normalizeQueryText(query.sessionId, 128)
    }
  }

  const buildSessionHref = (sessionId = '') => `?view=sessions&sessionId=${encodeURIComponent(normalizeQueryText(sessionId, 128))}`
  const buildDetailHref = (sessionId = '') => buildSessionHref(sessionId)

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

  const normalizeAttentionSession = (attentionSession = {}) => {
    if (!attentionSession || typeof attentionSession !== 'object') return null
    const sessionId = sanitizeDisplayText(attentionSession.sessionId || '').slice(0, 128)
    if (!sessionId) return null
    return {
      sessionId,
      project: sanitizeDisplayText(attentionSession.project || ''),
      status: sanitizeDisplayText(attentionSession.status || ''),
      reason: sanitizeDisplayText(attentionSession.reason || '')
    }
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

  const pluralize = (count, singular, plural = `${singular}s`) => `${formatNumber(count)} ${count === 1 ? singular : plural}`

  const buildUsageStatsRecords = (dailyUsageRollups = []) => {
    return [...(Array.isArray(dailyUsageRollups) ? dailyUsageRollups : [])]
      .sort((left, right) => String(right?.date || '').localeCompare(String(left?.date || '')))
      .slice(0, 7)
      .map((row) => {
        const rowTotals = row?.totals && typeof row.totals === 'object' ? row.totals : {}
        const sessionIds = [...new Set(
          (Array.isArray(row?.sessions) ? row.sessions : [])
            .map((session) => sanitizeDisplayText(session?.sessionId || '').slice(0, 128))
            .filter(Boolean)
        )]
        return {
          date: sanitizeDisplayText(row?.date || ''),
          totalTokens: Number(rowTotals.tokenDelta) || 0,
          cost: hasFiniteMetadataNumber(rowTotals.costDeltaUsd) ? Number(rowTotals.costDeltaUsd) : null,
          currency: sanitizeDisplayText(rowTotals.currency || '').toUpperCase(),
          peakContext: hasFiniteMetadataNumber(rowTotals.peakContextUsedPercent) ? Number(rowTotals.peakContextUsedPercent) : null,
          sessionIds,
          eventCount: Number(rowTotals.eventCount) || 0
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

  const buildSelectedSession = ({ selectedSummary = null, liveSessions = [] } = {}) => {
    if (!selectedSummary) return null
    const liveSession = liveSessions.find((session) => String(session.sessionId || '') === String(selectedSummary.sessionId || '')) || null
    const timelineSource = Array.isArray(selectedSummary.timelineTail) && selectedSummary.timelineTail.length
      ? selectedSummary.timelineTail
      : (Array.isArray(liveSession?.history) ? liveSession.history.slice(-6) : [])

    return {
      detailHref: buildSessionHref(selectedSummary.sessionId || ''),
      sessionId: sanitizeDisplayText(selectedSummary.sessionId || ''),
      project: sanitizeDisplayText(selectedSummary.project || liveSession?.project || 'Unknown project'),
      status: getStatusMeta(selectedSummary.status || liveSession?.status || ''),
      phase: sanitizeDisplayText(selectedSummary.phase || liveSession?.phase || ''),
      toolName: sanitizeDisplayText(selectedSummary.toolName || liveSession?.toolName || ''),
      approvalState: sanitizeDisplayText(selectedSummary.approvalState || liveSession?.approvalState || ''),
      firstSeenAt: formatTimestamp(selectedSummary.firstSeenAt || ''),
      lastSeenAt: formatTimestamp(selectedSummary.lastSeenAt || liveSession?.timestamp || ''),
      eventCount: Number(selectedSummary.eventCount) || (Array.isArray(liveSession?.history) ? liveSession.history.length : 0),
      summaryTitle: sanitizeDisplayText(selectedSummary.summary?.title || liveSession?.summary?.title || selectedSummary.project || ''),
      currentStep: sanitizeDisplayText(selectedSummary.summary?.currentStep || liveSession?.summary?.currentStep || selectedSummary.phase || ''),
      progressHint: sanitizeDisplayText(selectedSummary.summary?.recentProgressHint || liveSession?.summary?.recentProgressHint || liveSession?.message || ''),
      usageText: describeUsage(selectedSummary.usageLatest || liveSession?.usage || {}),
      usagePeakText: describeUsage(selectedSummary.usagePeak || {}),
      gitText: describeGit(selectedSummary.gitLatest || liveSession?.git || {}),
      timeline: timelineSource.slice(-6).reverse().map((entry) => ({
        type: entry.type || 'session.updated',
        status: getStatusMeta(entry.status),
        message: sanitizeDisplayText(entry.message || 'No sanitized message'),
        timestamp: formatTimestamp(entry.timestamp)
      }))
    }
  }

  const buildSessionCards = ({
    liveSessions = [],
    sessionSummaries = [],
    requestedSessionId = '',
    attentionSession = null
  } = {}) => {
    const liveSessionMap = new Map(liveSessions.map((session) => [String(session.sessionId || ''), session]))
    const cards = []
    const seenSessionIds = new Set()

    for (const summary of sessionSummaries) {
      const sessionId = String(summary?.sessionId || '')
      if (!sessionId) continue
      const liveSession = liveSessionMap.get(sessionId) || null
      const timelineSource = Array.isArray(summary.timelineTail) && summary.timelineTail.length
        ? summary.timelineTail
        : (Array.isArray(liveSession?.history) ? liveSession.history.slice(-4) : [])
      cards.push({
        detailHref: buildSessionHref(sessionId),
        project: sanitizeDisplayText(summary.project || liveSession?.project || 'Unknown project'),
        sessionId,
        message: sanitizeDisplayText(
          liveSession?.message ||
          summary.summary?.recentProgressHint ||
          timelineSource.at(-1)?.message ||
          'No sanitized message'
        ),
        timestamp: formatTimestamp(summary.lastSeenAt || liveSession?.timestamp || ''),
        sortTimestamp: summary.lastSeenAt || liveSession?.timestamp || '',
        isFocused: attentionSession?.sessionId === sessionId,
        status: getStatusMeta(summary.status || liveSession?.status),
        lastEvent: summary.lastEventType || liveSession?.type || 'session.updated',
        usageText: describeUsage(summary.usageLatest || liveSession?.usage || {}),
        gitText: describeGit(summary.gitLatest || liveSession?.git || {}),
        summaryTitle: sanitizeDisplayText(summary.summary?.title || liveSession?.summary?.title || summary.project || 'Session summary'),
        currentStep: sanitizeDisplayText(
          summary.summary?.currentStep ||
          liveSession?.summary?.currentStep ||
          summary.phase ||
          liveSession?.progressLabel ||
          liveSession?.type ||
          'No current step yet'
        ),
        progressHint: sanitizeDisplayText(
          summary.summary?.recentProgressHint ||
          liveSession?.summary?.recentProgressHint ||
          liveSession?.message ||
          'No progress hint yet'
        ),
        timeline: timelineSource.slice(-4).reverse().map((entry) => ({
          type: entry.type || 'session.updated',
          status: getStatusMeta(entry.status),
          message: sanitizeDisplayText(entry.message || 'No sanitized message'),
          timestamp: formatTimestamp(entry.timestamp)
        }))
      })
      seenSessionIds.add(sessionId)
    }

    for (const session of liveSessions) {
      const sessionId = String(session.sessionId || '')
      if (!sessionId || seenSessionIds.has(sessionId)) continue
      cards.push({
        detailHref: buildSessionHref(sessionId),
        project: sanitizeDisplayText(session.project || 'Unknown project'),
        sessionId,
        message: sanitizeDisplayText(session.message || 'No sanitized message'),
        timestamp: formatTimestamp(session.timestamp),
        sortTimestamp: session.timestamp || '',
        isFocused: attentionSession?.sessionId === sessionId,
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
      })
    }

    const filteredCards = requestedSessionId
      ? cards.filter((session) => session.sessionId === requestedSessionId)
      : cards

    return filteredCards
      .sort((left, right) => toTimestampMs(right.sortTimestamp) - toTimestampMs(left.sortTimestamp))
      .map(({ sortTimestamp, ...session }) => session)
  }

  const mergeCurrency = (left = '', right = '') => {
    if (!left) return right || ''
    if (!right || right === left) return left
    return 'MIXED'
  }

  const formatUsageDelta = ({ totalTokens = 0, costDeltaUsd = null, currency = '', peakContextUsedPercent = null } = {}) => ({
    tokensText: totalTokens > 0 ? `${formatNumber(totalTokens)} tokens` : 'No token metadata',
    costText: costDeltaUsd != null ? formatCost({ amount: costDeltaUsd, currency: currency || 'USD' }) : 'No cost metadata',
    contextText: peakContextUsedPercent != null ? `${formatPercent(peakContextUsedPercent)} peak` : 'No context metadata'
  })

  const buildUsageWorkbenchViewModel = ({ dailyUsageRollups = [], sessionSummaries = [] } = {}) => {
    const normalizedRows = Array.isArray(dailyUsageRollups) ? dailyUsageRollups : []
    const sessionSummaryMap = new Map(
      (Array.isArray(sessionSummaries) ? sessionSummaries : [])
        .filter((summary) => summary?.sessionId)
        .map((summary) => [String(summary.sessionId), summary])
    )

    const totals = {
      totalTokens: 0,
      costDeltaUsd: null,
      currency: '',
      peakContextUsedPercent: null,
      eventCount: 0,
      sessionIds: new Set(),
      projects: new Set()
    }
    const sessionMap = new Map()
    const projectMap = new Map()

    for (const row of normalizedRows) {
      const rowTotals = row?.totals && typeof row.totals === 'object' ? row.totals : {}
      const rowTokenDelta = Number(rowTotals.tokenDelta) || 0
      const rowCostDelta = hasFiniteMetadataNumber(rowTotals.costDeltaUsd) ? Number(rowTotals.costDeltaUsd) : null
      const rowPeakContext = hasFiniteMetadataNumber(rowTotals.peakContextUsedPercent) ? Number(rowTotals.peakContextUsedPercent) : null

      totals.totalTokens += rowTokenDelta
      totals.costDeltaUsd = rowCostDelta == null
        ? totals.costDeltaUsd
        : roundSix((totals.costDeltaUsd || 0) + rowCostDelta)
      totals.currency = mergeCurrency(totals.currency, sanitizeDisplayText(rowTotals.currency || '').toUpperCase())
      totals.peakContextUsedPercent = rowPeakContext == null
        ? totals.peakContextUsedPercent
        : Math.max(totals.peakContextUsedPercent || 0, rowPeakContext)
      totals.eventCount += Number(rowTotals.eventCount) || 0

      for (const sessionRow of Array.isArray(row?.sessions) ? row.sessions : []) {
        const sessionId = sanitizeDisplayText(sessionRow?.sessionId || '').slice(0, 128)
        const project = sanitizeDisplayText(
          sessionRow?.project ||
          sessionSummaryMap.get(sessionId)?.project ||
          'Unknown project'
        )
        if (sessionId) totals.sessionIds.add(sessionId)
        if (project) totals.projects.add(project)

        if (sessionId) {
          if (!sessionMap.has(sessionId)) {
            sessionMap.set(sessionId, {
              sessionId,
              project,
              totalTokens: 0,
              costDeltaUsd: null,
              currency: '',
              peakContextUsedPercent: null,
              eventCount: 0
            })
          }
          const aggregate = sessionMap.get(sessionId)
          aggregate.project = aggregate.project || project
          aggregate.totalTokens += Number(sessionRow.tokenDelta) || 0
          aggregate.costDeltaUsd = hasFiniteMetadataNumber(sessionRow.costDeltaUsd)
            ? roundSix((aggregate.costDeltaUsd || 0) + Number(sessionRow.costDeltaUsd))
            : aggregate.costDeltaUsd
          aggregate.currency = mergeCurrency(aggregate.currency, sanitizeDisplayText(sessionRow.currency || '').toUpperCase())
          aggregate.peakContextUsedPercent = hasFiniteMetadataNumber(sessionRow.peakContextUsedPercent)
            ? Math.max(aggregate.peakContextUsedPercent || 0, Number(sessionRow.peakContextUsedPercent))
            : aggregate.peakContextUsedPercent
          aggregate.eventCount += Number(sessionRow.eventCount) || 0
        }

        if (project) {
          if (!projectMap.has(project)) {
            projectMap.set(project, {
              project,
              totalTokens: 0,
              costDeltaUsd: null,
              currency: '',
              peakContextUsedPercent: null,
              eventCount: 0,
              sessionIds: new Set()
            })
          }
          const aggregate = projectMap.get(project)
          aggregate.totalTokens += Number(sessionRow.tokenDelta) || 0
          aggregate.costDeltaUsd = hasFiniteMetadataNumber(sessionRow.costDeltaUsd)
            ? roundSix((aggregate.costDeltaUsd || 0) + Number(sessionRow.costDeltaUsd))
            : aggregate.costDeltaUsd
          aggregate.currency = mergeCurrency(aggregate.currency, sanitizeDisplayText(sessionRow.currency || '').toUpperCase())
          aggregate.peakContextUsedPercent = hasFiniteMetadataNumber(sessionRow.peakContextUsedPercent)
            ? Math.max(aggregate.peakContextUsedPercent || 0, Number(sessionRow.peakContextUsedPercent))
            : aggregate.peakContextUsedPercent
          aggregate.eventCount += Number(sessionRow.eventCount) || 0
          if (sessionId) aggregate.sessionIds.add(sessionId)
        }
      }
    }

    const usageTotals = {
      daysText: pluralize(normalizedRows.length, 'day'),
      sessionsText: pluralize(totals.sessionIds.size, 'session'),
      projectsText: pluralize(totals.projects.size, 'project'),
      eventsText: pluralize(totals.eventCount, 'event'),
      ...formatUsageDelta({
        totalTokens: totals.totalTokens,
        costDeltaUsd: totals.costDeltaUsd,
        currency: totals.currency,
        peakContextUsedPercent: totals.peakContextUsedPercent
      })
    }

    const usageRows = normalizedRows.map((row) => {
      const rowTotals = row?.totals && typeof row.totals === 'object' ? row.totals : {}
      return {
        date: sanitizeDisplayText(row?.date || ''),
        sessionsText: pluralize(Number(rowTotals.sessionCount) || 0, 'session'),
        projectsText: pluralize(Number(rowTotals.projectCount) || 0, 'project'),
        eventsText: pluralize(Number(rowTotals.eventCount) || 0, 'event'),
        ...formatUsageDelta({
          totalTokens: Number(rowTotals.tokenDelta) || 0,
          costDeltaUsd: hasFiniteMetadataNumber(rowTotals.costDeltaUsd) ? Number(rowTotals.costDeltaUsd) : null,
          currency: sanitizeDisplayText(rowTotals.currency || '').toUpperCase(),
          peakContextUsedPercent: hasFiniteMetadataNumber(rowTotals.peakContextUsedPercent) ? Number(rowTotals.peakContextUsedPercent) : null
        })
      }
    })

    const topSessions = [...sessionMap.values()]
      .sort((left, right) => (
        right.totalTokens - left.totalTokens ||
        (right.costDeltaUsd || 0) - (left.costDeltaUsd || 0) ||
        right.eventCount - left.eventCount ||
        left.sessionId.localeCompare(right.sessionId)
      ))
      .slice(0, 5)
      .map((session) => ({
        sessionId: session.sessionId,
        project: session.project,
        detailHref: buildSessionHref(session.sessionId),
        eventsText: pluralize(session.eventCount, 'event'),
        ...formatUsageDelta(session)
      }))

    const topProjects = [...projectMap.values()]
      .sort((left, right) => (
        right.totalTokens - left.totalTokens ||
        (right.costDeltaUsd || 0) - (left.costDeltaUsd || 0) ||
        right.eventCount - left.eventCount ||
        left.project.localeCompare(right.project)
      ))
      .slice(0, 5)
      .map((project) => ({
        project: project.project,
        sessionsText: pluralize(project.sessionIds.size, 'session'),
        eventsText: pluralize(project.eventCount, 'event'),
        ...formatUsageDelta(project)
      }))

    return {
      usageTotals,
      usageRows,
      topSessions,
      topProjects
    }
  }

  const buildDashboardViewModel = ({ health = {}, sessionsPayload = {}, query = {} } = {}) => {
    const liveSessions = Array.isArray(sessionsPayload.liveSessions)
      ? sessionsPayload.liveSessions
      : (Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : [])
    const sessionSummaries = Array.isArray(sessionsPayload.sessionSummaries) ? sessionsPayload.sessionSummaries : []
    const dailyUsageRollups = Array.isArray(sessionsPayload.dailyUsageRollups) ? sessionsPayload.dailyUsageRollups : []
    const diagnostics = health.diagnostics || {}
    const hookMode = health.hookMode || {}
    const codexPoller = health.codexPoller || {}
    const latestTimestamp = diagnostics.lastEventAt || liveSessions[0]?.timestamp || sessionSummaries[0]?.lastSeenAt || ''
    const activeSessionCount = Number.isFinite(Number(diagnostics.activeSessionCount))
      ? Number(diagnostics.activeSessionCount)
      : getActiveSessionCount(liveSessions)
    const normalizedQuery = normalizeDashboardQuery(query)
    const currentView = normalizedQuery.view || 'overview'
    const detailMode = currentView === 'sessions'
    const statsMode = currentView === 'usage'
    const requestedSessionId = normalizedQuery.sessionId
    const attentionSession = normalizeAttentionSession(diagnostics.attentionSession)
    const visibleSessions = buildSessionCards({
      liveSessions,
      sessionSummaries,
      requestedSessionId: detailMode ? requestedSessionId : '',
      attentionSession
    })
    const hasRequestedSessionId = detailMode && Boolean(requestedSessionId)
    const detailFound = !hasRequestedSessionId || visibleSessions.length > 0
    const detailNotice = !detailMode
      ? ''
      : hasRequestedSessionId
        ? detailFound
          ? `Focused Session: ${requestedSessionId}`
          : ''
        : 'Showing latest sanitized session details.'
    const usageStatsRecords = buildUsageStatsRecords(dailyUsageRollups)
    const attentionStatus = getStatusMeta(attentionSession?.status || '')
    const attentionDetail = attentionSession
      ? [attentionSession.project, attentionSession.reason].filter(Boolean).join(' · ')
      : 'No active attention session'
    const selectedSessionId = requestedSessionId || liveSessions[0]?.sessionId || sessionSummaries[0]?.sessionId || ''
    const selectedSummary = sessionSummaries.find((item) => String(item.sessionId || '') === String(selectedSessionId)) || null
    const usageWorkbench = buildUsageWorkbenchViewModel({ dailyUsageRollups, sessionSummaries })
    const trackedSessionCount = Number.isFinite(Number(diagnostics.sessionCount))
      ? Number(diagnostics.sessionCount)
      : (sessionSummaries.length || liveSessions.length)

    return {
      currentView,
      detailFound,
      detailMode,
      detailNotice,
      attentionSession,
      requestedSessionId,
      selectedSession: buildSelectedSession({ selectedSummary, liveSessions }),
      serviceOk: health.ok === true,
      statsMode,
      usageStats: formatUsageStatsRows(usageStatsRecords),
      usageStatsTotals: buildUsageStatsTotals(usageStatsRecords),
      usageRows: usageWorkbench.usageRows,
      usageTotals: usageWorkbench.usageTotals,
      topSessions: usageWorkbench.topSessions,
      topProjects: usageWorkbench.topProjects,
      summary: [
        {
          label: 'Tracked Sessions',
          value: formatNumber(trackedSessionCount),
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
        },
        {
          label: 'Attention',
          value: attentionSession ? attentionStatus.label : 'None',
          detail: attentionDetail
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
      sessions: visibleSessions
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

  const renderSessionWorkbench = (selectedSession = null) => {
    if (!selectedSession) {
      return '<p class="empty-state">No sanitized session selected yet.</p>'
    }
    return `
      <div class="workbench-shell">
        <div class="workbench-hero">
          <div>
            <p class="session-label">Focused Session</p>
            <p class="session-project">${escapeHtml(sanitizeDisplayText(selectedSession.project))}</p>
            <p class="session-meta">${escapeHtml(sanitizeDisplayText(selectedSession.sessionId))}</p>
          </div>
          <div class="session-actions">
            <span class="status-badge tone-${escapeHtml(selectedSession.status.tone)}">${escapeHtml(selectedSession.status.label)}</span>
            ${selectedSession.phase ? `<span class="status-badge tone-neutral">${escapeHtml(sanitizeDisplayText(selectedSession.phase))}</span>` : ''}
            ${selectedSession.approvalState ? `<span class="status-badge tone-warning">${escapeHtml(sanitizeDisplayText(selectedSession.approvalState))}</span>` : ''}
          </div>
        </div>
        <div class="session-facts workbench-metrics">
          <div>
            <p class="session-label">Current Step</p>
            <p class="session-fact-value">${escapeHtml(sanitizeDisplayText(selectedSession.currentStep || 'No current step yet'))}</p>
            <p class="session-message">${escapeHtml(sanitizeDisplayText(selectedSession.progressHint || 'No progress hint yet'))}</p>
          </div>
          <div>
            <p class="session-label">Last Seen</p>
            <p class="session-fact-value">${escapeHtml(selectedSession.lastSeenAt)}</p>
            <p class="session-message">${escapeHtml(sanitizeDisplayText(selectedSession.firstSeenAt))}</p>
          </div>
          <div>
            <p class="session-label">Usage Latest</p>
            <p class="session-fact-value">${escapeHtml(sanitizeDisplayText(selectedSession.usageText))}</p>
          </div>
          <div>
            <p class="session-label">Usage Peak</p>
            <p class="session-fact-value">${escapeHtml(sanitizeDisplayText(selectedSession.usagePeakText || 'No usage metadata yet'))}</p>
          </div>
          <div>
            <p class="session-label">Git</p>
            <p class="session-fact-value">${escapeHtml(sanitizeDisplayText(selectedSession.gitText || 'No git metadata yet'))}</p>
          </div>
          <div>
            <p class="session-label">Events</p>
            <p class="session-fact-value">${escapeHtml(pluralize(selectedSession.eventCount || 0, 'event'))}</p>
            <p class="session-message">${escapeHtml(sanitizeDisplayText(selectedSession.toolName || 'No active tool'))}</p>
          </div>
        </div>
        <div class="session-body">
          <p class="session-label">Recent Timeline</p>
          ${renderTimeline(selectedSession.timeline)}
        </div>
      </div>
    `
  }

  const renderUsageWorkbench = ({
    usageTotals = {},
    usageRows = [],
    topSessions = [],
    topProjects = []
  } = {}) => `
    <div class="workbench-shell">
      <div class="usage-stats-header">
        <strong>30-Day Usage Workbench</strong>
        <span>Retained daily deltas, top sessions, and top projects.</span>
      </div>
      <div class="usage-stats-totals workbench-usage-totals">
        <article>
          <p class="usage-stat-meta">Window</p>
          <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(usageTotals.daysText || '0 days'))}</p>
        </article>
        <article>
          <p class="usage-stat-meta">Tokens</p>
          <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(usageTotals.tokensText || 'No token metadata'))}</p>
        </article>
        <article>
          <p class="usage-stat-meta">Cost</p>
          <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(usageTotals.costText || 'No cost metadata'))}</p>
        </article>
        <article>
          <p class="usage-stat-meta">Peak Context</p>
          <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(usageTotals.contextText || 'No context metadata'))}</p>
        </article>
        <article>
          <p class="usage-stat-meta">Sessions</p>
          <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(usageTotals.sessionsText || '0 sessions'))}</p>
        </article>
        <article>
          <p class="usage-stat-meta">Projects</p>
          <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(usageTotals.projectsText || '0 projects'))}</p>
        </article>
      </div>
      <div class="workbench-grid">
        <section class="workbench-card">
          <div class="panel-header">
            <h3>Daily Window</h3>
            <p class="panel-note">${escapeHtml(sanitizeDisplayText(usageTotals.eventsText || '0 events'))}</p>
          </div>
          <div class="usage-stats">
            ${usageRows.length ? usageRows.map((row) => `
              <article class="usage-stat-row">
                <div>
                  <p class="usage-stat-date">${escapeHtml(sanitizeDisplayText(row.date))}</p>
                  <p class="usage-stat-meta">${escapeHtml(sanitizeDisplayText(row.sessionsText))} · ${escapeHtml(sanitizeDisplayText(row.projectsText))} · ${escapeHtml(sanitizeDisplayText(row.eventsText))}</p>
                </div>
                <div>
                  <p class="usage-stat-value">${escapeHtml(sanitizeDisplayText(row.tokensText))}</p>
                  <p class="usage-stat-meta">${escapeHtml(sanitizeDisplayText(row.costText))} · ${escapeHtml(sanitizeDisplayText(row.contextText))}</p>
                </div>
              </article>
            `).join('') : '<p class="empty-state">No retained usage history yet.</p>'}
          </div>
        </section>
        <section class="workbench-card">
          <div class="panel-header">
            <h3>Top Sessions</h3>
            <p class="panel-note">Focus into a retained session.</p>
          </div>
          <div class="workbench-list">
            ${topSessions.length ? topSessions.map((session) => `
              <article class="workbench-list-item">
                <div>
                  <p class="session-project">${escapeHtml(sanitizeDisplayText(session.project))}</p>
                  <p class="session-meta">${escapeHtml(sanitizeDisplayText(session.sessionId))}</p>
                </div>
                <div class="session-actions">
                  <a class="session-detail-link" href="${escapeHtml(session.detailHref)}">Open</a>
                </div>
                <p class="session-fact-value">${escapeHtml(sanitizeDisplayText(session.tokensText))}</p>
                <p class="session-message">${escapeHtml(sanitizeDisplayText(session.costText))} · ${escapeHtml(sanitizeDisplayText(session.contextText))} · ${escapeHtml(sanitizeDisplayText(session.eventsText))}</p>
              </article>
            `).join('') : '<p class="empty-state">No retained sessions yet.</p>'}
          </div>
        </section>
        <section class="workbench-card">
          <div class="panel-header">
            <h3>Top Projects</h3>
            <p class="panel-note">Sanitized project rollups only.</p>
          </div>
          <div class="workbench-list">
            ${topProjects.length ? topProjects.map((project) => `
              <article class="workbench-list-item">
                <div>
                  <p class="session-project">${escapeHtml(sanitizeDisplayText(project.project))}</p>
                  <p class="session-meta">${escapeHtml(sanitizeDisplayText(project.sessionsText))} · ${escapeHtml(sanitizeDisplayText(project.eventsText))}</p>
                </div>
                <p class="session-fact-value">${escapeHtml(sanitizeDisplayText(project.tokensText))}</p>
                <p class="session-message">${escapeHtml(sanitizeDisplayText(project.costText))} · ${escapeHtml(sanitizeDisplayText(project.contextText))}</p>
              </article>
            `).join('') : '<p class="empty-state">No retained projects yet.</p>'}
          </div>
        </section>
      </div>
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
            ${session.isFocused ? '<span class="status-badge tone-info">Focused</span>' : ''}
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
    sessionWorkbenchHtml: renderSessionWorkbench(viewModel.selectedSession),
    usageWorkbenchHtml: renderUsageWorkbench({
      usageTotals: viewModel.usageTotals,
      usageRows: viewModel.usageRows,
      topSessions: viewModel.topSessions,
      topProjects: viewModel.topProjects
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
    const sessionWorkbenchNode = documentRef.querySelector('#session-workbench')
    const usageWorkbenchNode = documentRef.querySelector('#usage-workbench')
    const refreshButton = documentRef.querySelector('#refresh')
    const viewLinks = Array.from(documentRef.querySelectorAll('[data-view-link]'))
    const usageStatsPanel = documentRef.querySelector('[data-section="usage-stats"]')
    const diagnosticsPanel = documentRef.querySelector('[data-section="diagnostics"]')
    const sessionsPanel = documentRef.querySelector('[data-section="sessions"]')
    const sessionWorkbenchPanel = documentRef.querySelector('[data-section="session-workbench"]')
    const usageWorkbenchPanel = documentRef.querySelector('[data-section="usage-workbench"]')

    const applyViewState = (viewModel = {}) => {
      const currentView = viewModel.currentView || 'overview'
      viewLinks.forEach((link) => {
        const linkView = link.getAttribute('data-view-link') || ''
        if (linkView === currentView) {
          link.setAttribute('aria-current', 'page')
        } else {
          link.removeAttribute('aria-current')
        }
      })
      if (usageStatsPanel) usageStatsPanel.hidden = currentView !== 'overview'
      if (diagnosticsPanel) diagnosticsPanel.hidden = currentView !== 'overview'
      if (sessionsPanel) sessionsPanel.hidden = currentView === 'usage'
      if (sessionWorkbenchPanel) sessionWorkbenchPanel.hidden = currentView !== 'sessions'
      if (usageWorkbenchPanel) usageWorkbenchPanel.hidden = currentView !== 'usage'
    }

    const renderError = (message) => {
      if (statusNode) statusNode.textContent = message || 'Dashboard failed to load'
      if (summaryNode) summaryNode.innerHTML = '<p class="empty-state">Unable to load summary.</p>'
      if (usageStatsNode) usageStatsNode.innerHTML = '<p class="empty-state">Unable to load usage stats.</p>'
      if (healthNode) healthNode.innerHTML = '<p class="empty-state">Unable to load diagnostics.</p>'
      if (sessionsNode) sessionsNode.innerHTML = '<p class="empty-state">Unable to load sessions.</p>'
      if (sessionWorkbenchNode) sessionWorkbenchNode.innerHTML = '<p class="empty-state">Unable to load session workbench.</p>'
      if (usageWorkbenchNode) usageWorkbenchNode.innerHTML = '<p class="empty-state">Unable to load usage workbench.</p>'
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
        if (sessionWorkbenchNode) sessionWorkbenchNode.innerHTML = rendered.sessionWorkbenchHtml
        if (usageWorkbenchNode) usageWorkbenchNode.innerHTML = rendered.usageWorkbenchHtml
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
    renderSessionWorkbench,
    renderSessions,
    renderSummary,
    renderUsageStats,
    renderUsageWorkbench,
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
