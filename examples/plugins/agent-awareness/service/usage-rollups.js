const roundSix = (value) => Math.round(Number(value || 0) * 1_000_000) / 1_000_000

const toFiniteNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const toDateKey = (value) => {
  const numeric = Date.parse(String(value || ''))
  return Number.isFinite(numeric) ? new Date(numeric).toISOString().slice(0, 10) : ''
}

const createEmptyDayTotals = () => ({
  tokenDelta: 0,
  inputTokenDelta: 0,
  outputTokenDelta: 0,
  cachedInputTokenDelta: 0,
  costDeltaUsd: 0,
  currency: '',
  peakContextUsedPercent: 0,
  eventCount: 0,
  sessionCount: 0,
  projectCount: 0
})

const createEmptySessionRow = ({ sessionId, project }) => ({
  sessionId,
  project,
  tokenDelta: 0,
  inputTokenDelta: 0,
  outputTokenDelta: 0,
  cachedInputTokenDelta: 0,
  costDeltaUsd: 0,
  currency: '',
  peakContextUsedPercent: 0,
  eventCount: 0,
  firstSeenAt: '',
  lastSeenAt: ''
})

const findOrCreateRollupDay = (rollups = [], date) => {
  let day = rollups.find((entry) => entry.date === date)
  if (!day) {
    day = {
      date,
      totals: createEmptyDayTotals(),
      sessions: []
    }
    rollups.push(day)
  }
  return day
}

const findOrCreateRollupSession = (sessions = [], { sessionId, project }) => {
  let session = sessions.find((entry) => entry.sessionId === sessionId)
  if (!session) {
    session = createEmptySessionRow({ sessionId, project })
    sessions.push(session)
  }
  return session
}

const updateCounts = (day) => {
  const uniqueSessions = new Set(day.sessions.map((session) => session.sessionId).filter(Boolean))
  const uniqueProjects = new Set(day.sessions.map((session) => session.project).filter(Boolean))
  day.totals.sessionCount = uniqueSessions.size
  day.totals.projectCount = uniqueProjects.size
}

const cloneJson = (value) => JSON.parse(JSON.stringify(value))

const applyUsageSnapshotDelta = ({ state, sessionSummary, usage, timestamp, project }) => {
  const date = toDateKey(timestamp)
  if (!date || !sessionSummary?.sessionId || !usage || typeof usage !== 'object') return state

  const previous = sessionSummary.lastUsageSnapshot || {}
  const deltaTotal = Math.max(0, toFiniteNumber(usage.totalTokens) - toFiniteNumber(previous.totalTokens))
  const deltaInput = Math.max(0, toFiniteNumber(usage.inputTokens) - toFiniteNumber(previous.inputTokens))
  const deltaOutput = Math.max(0, toFiniteNumber(usage.outputTokens) - toFiniteNumber(previous.outputTokens))
  const deltaCached = Math.max(0, toFiniteNumber(usage.cachedInputTokens) - toFiniteNumber(previous.cachedInputTokens))
  const deltaCost = Math.max(0, toFiniteNumber(usage.estimatedCostUsd) - toFiniteNumber(previous.estimatedCostUsd))
  const contextUsedPercent = toFiniteNumber(usage.contextUsedPercent)

  const day = findOrCreateRollupDay(state.dailyUsageRollups, date)
  const sessionRow = findOrCreateRollupSession(day.sessions, {
    sessionId: sessionSummary.sessionId,
    project: project || sessionSummary.project || ''
  })

  day.totals.tokenDelta += deltaTotal
  day.totals.inputTokenDelta += deltaInput
  day.totals.outputTokenDelta += deltaOutput
  day.totals.cachedInputTokenDelta += deltaCached
  day.totals.costDeltaUsd = roundSix(day.totals.costDeltaUsd + deltaCost)
  day.totals.currency = usage.currency || day.totals.currency || ''
  day.totals.peakContextUsedPercent = Math.max(day.totals.peakContextUsedPercent || 0, contextUsedPercent)
  day.totals.eventCount += 1

  sessionRow.project = project || sessionRow.project || ''
  sessionRow.tokenDelta += deltaTotal
  sessionRow.inputTokenDelta += deltaInput
  sessionRow.outputTokenDelta += deltaOutput
  sessionRow.cachedInputTokenDelta += deltaCached
  sessionRow.costDeltaUsd = roundSix(sessionRow.costDeltaUsd + deltaCost)
  sessionRow.currency = usage.currency || sessionRow.currency || ''
  sessionRow.peakContextUsedPercent = Math.max(sessionRow.peakContextUsedPercent || 0, contextUsedPercent)
  sessionRow.eventCount += 1
  sessionRow.firstSeenAt = sessionRow.firstSeenAt || String(timestamp || '')
  sessionRow.lastSeenAt = String(timestamp || sessionRow.lastSeenAt || '')

  updateCounts(day)
  state.dailyUsageRollups.sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))
  return state
}

const pruneRetainedHistory = ({ state, now, retentionDays }) => {
  const nowValue = typeof now === 'function' ? now() : now
  const currentMs = Date.parse(String(nowValue || ''))
  if (!Number.isFinite(currentMs)) return state

  const cutoffMs = currentMs - ((retentionDays - 1) * 24 * 60 * 60 * 1000)
  const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10)
  state.dailyUsageRollups = state.dailyUsageRollups.filter((row) => String(row.date || '') >= cutoffDate)
  state.sessionSummaries = state.sessionSummaries.filter((row) => {
    return toDateKey(row.lastSeenAt) >= cutoffDate
  })
  return state
}

const rebuildUsageRollupsFromLegacySessions = ({ sessions = [], sessionSummaries = [] } = {}) => {
  const rollupState = { dailyUsageRollups: [] }
  const summaryMap = new Map(
    sessionSummaries
      .filter((summary) => summary?.sessionId)
      .map((summary) => [String(summary.sessionId), summary])
  )

  for (const session of sessions) {
    const sessionId = String(session?.sessionId || '')
    const summary = summaryMap.get(sessionId)
    if (!summary) continue

    const sourceEntries = Array.isArray(session.history) && session.history.length
      ? session.history
      : [session]
    const usageEntries = sourceEntries
      .filter((entry) => entry?.usage && entry?.timestamp)
      .map((entry) => cloneJson(entry))
      .sort((left, right) => String(left.timestamp || '').localeCompare(String(right.timestamp || '')))

    summary.lastUsageSnapshot = null
    for (const entry of usageEntries) {
      applyUsageSnapshotDelta({
        state: rollupState,
        sessionSummary: summary,
        usage: entry.usage,
        timestamp: entry.timestamp,
        project: session.project || summary.project || ''
      })
      summary.lastUsageSnapshot = cloneJson(entry.usage)
    }
    if (!summary.lastUsageSnapshot && session.usage) {
      summary.lastUsageSnapshot = cloneJson(session.usage)
    }
  }

  rollupState.dailyUsageRollups.sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))
  return rollupState.dailyUsageRollups
}

module.exports = {
  applyUsageSnapshotDelta,
  pruneRetainedHistory,
  rebuildUsageRollupsFromLegacySessions,
  toDateKey
}
