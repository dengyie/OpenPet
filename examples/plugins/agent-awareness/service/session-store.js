const path = require('path')
const { createRuntimeHistoryEntry, createRuntimeSession } = require('./runtime-session')
const {
  DEFAULT_RETENTION_DAYS,
  ensureDirectory,
  loadStoreState,
  STORE_FILE,
  writeStoreStateAtomically
} = require('./session-store-schema')
const { applyUsageSnapshotDelta, pruneRetainedHistory } = require('./usage-rollups')

const DEFAULT_MAX_SESSIONS = 100
const DEFAULT_MAX_EVENTS = 1000

const toTimestampMs = (value) => {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const getLatestTimestamp = (sessions = []) => sessions.reduce((latest, session) => {
  return toTimestampMs(session.timestamp) > toTimestampMs(latest) ? session.timestamp : latest
}, '')

const isOlderRuntimeEvent = (session = {}, eventSession = {}) => {
  const currentTimestampMs = toTimestampMs(session.timestamp)
  const eventTimestampMs = toTimestampMs(eventSession.timestamp)
  return currentTimestampMs > 0 && eventTimestampMs > 0 && eventTimestampMs < currentTimestampMs
}

const mergeStaleMetadata = (session = {}, eventSession = {}) => {
  if (!session.project && eventSession.project) session.project = eventSession.project
  if (!session.usage && eventSession.usage) session.usage = eventSession.usage
  if (!session.git && eventSession.git) session.git = eventSession.git
  if (!session.summary && eventSession.summary) session.summary = eventSession.summary
}

const clone = (value) => JSON.parse(JSON.stringify(value))

const mergeUsagePeak = (previousUsagePeak, usageLatest) => {
  if (!usageLatest) return previousUsagePeak ? clone(previousUsagePeak) : null
  if (!previousUsagePeak) return clone(usageLatest)
  return {
    ...clone(previousUsagePeak),
    ...clone(usageLatest),
    totalTokens: Math.max(Number(previousUsagePeak.totalTokens || 0), Number(usageLatest.totalTokens || 0)) || null,
    inputTokens: Math.max(Number(previousUsagePeak.inputTokens || 0), Number(usageLatest.inputTokens || 0)) || null,
    outputTokens: Math.max(Number(previousUsagePeak.outputTokens || 0), Number(usageLatest.outputTokens || 0)) || null,
    cachedInputTokens: Math.max(Number(previousUsagePeak.cachedInputTokens || 0), Number(usageLatest.cachedInputTokens || 0)) || null,
    estimatedCostUsd: Math.max(Number(previousUsagePeak.estimatedCostUsd || 0), Number(usageLatest.estimatedCostUsd || 0)) || null,
    contextWindow: Math.max(Number(previousUsagePeak.contextWindow || 0), Number(usageLatest.contextWindow || 0)) || null,
    contextUsedPercent: Math.max(Number(previousUsagePeak.contextUsedPercent || 0), Number(usageLatest.contextUsedPercent || 0)) || null
  }
}

const buildTimelineTail = (history = [], previousSummary = null) => {
  if (!previousSummary || !Array.isArray(previousSummary.timelineTail)) {
    return history.slice(-6).map((entry) => clone(entry))
  }
  const latestEntry = history.length ? clone(history[history.length - 1]) : null
  const previousTail = previousSummary.timelineTail.map((entry) => clone(entry))
  if (!latestEntry) return previousTail.slice(-6)
  return [...previousTail, latestEntry].slice(-6)
}

const buildSessionSummary = (session = {}, previousSummary = null) => {
  const history = Array.isArray(session.history) ? session.history : []
  const timelineTail = buildTimelineTail(history, previousSummary)
  const usageLatest = session.usage ? clone(session.usage) : null
  const gitLatest = session.git ? clone(session.git) : null
  const summary = session.summary ? clone(session.summary) : null
  const eventCount = previousSummary
    ? Math.max(Number(previousSummary.eventCount) || 0, Math.max(0, history.length - 1)) + (history.length ? 1 : 0)
    : history.length
  return {
    sessionId: String(session.sessionId || ''),
    project: String(session.project || ''),
    firstSeenAt: String(previousSummary?.firstSeenAt || session.timestamp || ''),
    lastSeenAt: String(session.timestamp || ''),
    lastSource: String(session.lastSource || ''),
    active: typeof session.active === 'boolean' ? session.active : true,
    status: String(session.status || ''),
    phase: String(session.phase || ''),
    lastEventType: String(session.type || ''),
    toolName: String(session.toolName || ''),
    approvalState: String(session.approvalState || ''),
    summary,
    usageLatest,
    usagePeak: mergeUsagePeak(previousSummary?.usagePeak || null, usageLatest),
    gitLatest,
    eventCount,
    timelineTail,
    lastUsageSnapshot: previousSummary?.lastUsageSnapshot ? clone(previousSummary.lastUsageSnapshot) : null
  }
}

const evictLiveSessions = ({ liveSessions = [], maxSessions = DEFAULT_MAX_SESSIONS, maxEvents = DEFAULT_MAX_EVENTS } = {}) => {
  let sessions = [...liveSessions]
  while (sessions.length > maxSessions) {
    sessions.sort((left, right) => toTimestampMs(left.timestamp) - toTimestampMs(right.timestamp))
    sessions.shift()
  }
  let totalEvents = sessions.reduce((sum, session) => sum + ((Array.isArray(session.history) ? session.history.length : 0)), 0)
  while (totalEvents > maxEvents) {
    let oldestSessionIndex = -1
    let oldestEventIndex = -1
    let oldestEventTime = Number.POSITIVE_INFINITY
    sessions.forEach((session, sessionIndex) => {
      const history = Array.isArray(session.history) ? session.history : []
      history.forEach((entry, eventIndex) => {
        const timestamp = toTimestampMs(entry.timestamp)
        if (timestamp < oldestEventTime) {
          oldestEventTime = timestamp
          oldestSessionIndex = sessionIndex
          oldestEventIndex = eventIndex
        }
      })
    })
    if (oldestSessionIndex < 0 || oldestEventIndex < 0) break
    sessions[oldestSessionIndex].history.splice(oldestEventIndex, 1)
    if (!sessions[oldestSessionIndex].history.length) {
      sessions.splice(oldestSessionIndex, 1)
    }
    totalEvents = sessions.reduce((sum, session) => sum + ((Array.isArray(session.history) ? session.history.length : 0)), 0)
  }
  sessions.sort((left, right) => toTimestampMs(right.timestamp) - toTimestampMs(left.timestamp))
  return sessions
}

const createSessionStore = ({
  dataDir,
  maxSessions = DEFAULT_MAX_SESSIONS,
  maxEvents = DEFAULT_MAX_EVENTS,
  now = () => new Date().toISOString(),
  retentionDays = DEFAULT_RETENTION_DAYS
} = {}) => {
  ensureDirectory(dataDir)
  const storePath = path.join(dataDir, STORE_FILE)
  const loaded = loadStoreState({ storePath, now, retentionDays })
  let state = loaded.state

  const save = () => {
    state.updatedAt = now()
    state.retentionDays = retentionDays
    state.stats = {
      ...state.stats,
      totalEvents: state.liveSessions.reduce((sum, session) => sum + ((Array.isArray(session.history) ? session.history.length : 0)), 0),
      lastEventAt: getLatestTimestamp(state.liveSessions)
    }
    writeStoreStateAtomically({ storePath, state })
  }

  const normalizeLoadedRetention = () => {
    const previousRetentionDays = Number(state.retentionDays) || retentionDays
    const previousSummaryCount = state.sessionSummaries.length
    const previousRollupCount = state.dailyUsageRollups.length
    state.retentionDays = retentionDays
    state = pruneRetainedHistory({ state, now, retentionDays })
    const retentionChanged = previousRetentionDays !== retentionDays
    const pruned =
      previousSummaryCount !== state.sessionSummaries.length ||
      previousRollupCount !== state.dailyUsageRollups.length
    if (retentionChanged || pruned) save()
  }

  normalizeLoadedRetention()

  const syncSessionSummary = (session) => {
    const index = state.sessionSummaries.findIndex((candidate) => candidate.sessionId === session.sessionId)
    const previous = index >= 0 ? state.sessionSummaries[index] : null
    const summary = buildSessionSummary(session, previous)
    if (index >= 0) {
      state.sessionSummaries[index] = summary
    } else {
      state.sessionSummaries.push(summary)
    }
    state.sessionSummaries.sort((left, right) => toTimestampMs(right.lastSeenAt) - toTimestampMs(left.lastSeenAt))
    return state.sessionSummaries.find((candidate) => candidate.sessionId === session.sessionId) || summary
  }

  return {
    getStatus: () => ({
      sessions: state.liveSessions.length,
      totalEvents: state.stats?.totalEvents || 0,
      lastEventAt: state.stats?.lastEventAt || '',
      storeSchemaVersion: state.schemaVersion,
      retentionDays: state.retentionDays,
      storeError: state.stats?.storeError || '',
      retainedSessionSummaryCount: state.sessionSummaries.length,
      historyWindowStart: state.dailyUsageRollups.at(-1)?.date || '',
      historyWindowEnd: state.dailyUsageRollups[0]?.date || ''
    }),
    listSessions: () => [...state.liveSessions],
    listLiveSessions: () => [...state.liveSessions],
    listSessionSummaries: () => [...state.sessionSummaries],
    listDailyUsageRollups: () => [...state.dailyUsageRollups],
    getDashboardState: () => ({
      liveSessions: [...state.liveSessions],
      sessionSummaries: [...state.sessionSummaries],
      dailyUsageRollups: [...state.dailyUsageRollups]
    }),
    upsertEvent: (event) => {
      const sessionId = String(event.sessionId || '')
      if (!sessionId) throw new Error('sessionId is required')
      let session = state.liveSessions.find((candidate) => candidate.sessionId === sessionId)
      if (!session) {
        session = { ...createRuntimeSession(null, event, { now }), history: [] }
        state.liveSessions.push(session)
      } else {
        const eventSession = createRuntimeSession(null, event, { now })
        if (isOlderRuntimeEvent(session, eventSession)) {
          mergeStaleMetadata(session, eventSession)
          session.history.push(createRuntimeHistoryEntry(eventSession))
          state.liveSessions = evictLiveSessions({ liveSessions: state.liveSessions, maxSessions, maxEvents })
          syncSessionSummary(session)
          state = pruneRetainedHistory({ state, now, retentionDays })
          save()
          return session
        }
        Object.assign(session, createRuntimeSession(session, event, { now }))
      }
      session.history.push(createRuntimeHistoryEntry(session))
      state.liveSessions = evictLiveSessions({ liveSessions: state.liveSessions, maxSessions, maxEvents })
      const summary = syncSessionSummary(session)
      if (session.usage) {
        state = applyUsageSnapshotDelta({
          state,
          sessionSummary: summary,
          usage: session.usage,
          timestamp: session.timestamp,
          project: session.project
        })
        const refreshedSummary = state.sessionSummaries.find((candidate) => candidate.sessionId === session.sessionId)
        if (refreshedSummary) {
          refreshedSummary.lastUsageSnapshot = clone(session.usage)
          refreshedSummary.usageLatest = clone(session.usage)
          refreshedSummary.usagePeak = mergeUsagePeak(refreshedSummary.usagePeak || null, session.usage)
        }
      }
      state = pruneRetainedHistory({ state, now, retentionDays })
      save()
      return session
    }
  }
}

module.exports = {
  createSessionStore,
  DEFAULT_MAX_EVENTS,
  DEFAULT_MAX_SESSIONS,
  STORE_FILE
}
