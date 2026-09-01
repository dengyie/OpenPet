const fs = require('fs')
const path = require('path')
const {
  createEmptyLifetimeTotals,
  rebuildLifetimeUsageFromDailyRollups,
  rebuildUsageRollupsFromLegacySessions
} = require('./usage-rollups')

const SCHEMA_VERSION = 2
const STORE_FILE = 'sessions.json'
const LEGACY_BACKUP_FILE = 'sessions.v1.backup.json'
const DEFAULT_RETENTION_DAYS = 30
const DEFAULT_STORE_ERROR = 'Unable to load retained history. New sanitized events will rebuild this store.'

const cloneJson = (value) => JSON.parse(JSON.stringify(value))

const toTimestampMs = (value) => {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const getLatestTimestamp = (sessions = []) => sessions.reduce((latest, session) => {
  return toTimestampMs(session.timestamp) > toTimestampMs(latest) ? session.timestamp : latest
}, '')

const getEarliestTimestamp = (values = []) => values.reduce((earliest, value) => {
  const next = String(value || '')
  if (!next) return earliest
  if (!earliest) return next
  return toTimestampMs(next) < toTimestampMs(earliest) ? next : earliest
}, '')

const createEmptyStoreState = ({
  now = () => new Date().toISOString(),
  retentionDays = DEFAULT_RETENTION_DAYS,
  storeError = ''
} = {}) => ({
  schemaVersion: SCHEMA_VERSION,
  updatedAt: now(),
  retentionDays,
  liveSessions: [],
  sessionSummaries: [],
  dailyUsageRollups: [],
  usageLifetime: createEmptyLifetimeTotals(),
  eventDedupe: [],
  stats: {
    totalEvents: 0,
    lastEventAt: '',
    storeError
  }
})

const ensureDirectory = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const writeStoreStateAtomically = ({ storePath, state }) => {
  const tmpPath = `${storePath}.tmp`
  const serializedState = {
    ...state,
    sessions: Array.isArray(state.liveSessions) ? state.liveSessions : []
  }
  fs.writeFileSync(tmpPath, `${JSON.stringify(serializedState, null, 2)}\n`)
  fs.renameSync(tmpPath, storePath)
}

const buildSessionSummaryFromLegacySession = (session = {}) => {
  const history = Array.isArray(session.history) ? session.history : []
  const historyTimestamps = history.map((entry) => entry?.timestamp).filter(Boolean)
  const firstSeenAt = getEarliestTimestamp([...historyTimestamps, session.timestamp])
  const timelineTail = history.slice(-6).map((entry) => cloneJson(entry))
  const usageLatest = session.usage ? cloneJson(session.usage) : null
  const gitLatest = session.git ? cloneJson(session.git) : null
  const summary = session.summary ? cloneJson(session.summary) : null

  return {
    sessionId: String(session.sessionId || ''),
    project: String(session.project || ''),
    firstSeenAt,
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
    usagePeak: usageLatest ? cloneJson(usageLatest) : null,
    gitLatest,
    eventCount: history.length,
    timelineTail,
    lastUsageSnapshot: usageLatest ? cloneJson(usageLatest) : null
  }
}

const migrateLegacyStore = ({
  parsed,
  storePath,
  now = () => new Date().toISOString(),
  retentionDays = DEFAULT_RETENTION_DAYS
} = {}) => {
  const legacySessions = Array.isArray(parsed?.sessions) ? parsed.sessions.map((session) => cloneJson(session)) : []
  legacySessions.sort((left, right) => toTimestampMs(right?.timestamp) - toTimestampMs(left?.timestamp))

  const migrated = createEmptyStoreState({ now, retentionDays })
  migrated.liveSessions = legacySessions
  migrated.sessionSummaries = legacySessions.map((session) => buildSessionSummaryFromLegacySession(session))
  migrated.dailyUsageRollups = rebuildUsageRollupsFromLegacySessions({
    sessions: legacySessions,
    sessionSummaries: migrated.sessionSummaries
  })
  migrated.usageLifetime = rebuildLifetimeUsageFromDailyRollups(migrated.dailyUsageRollups)
  migrated.stats.totalEvents = Number(parsed?.stats?.totalEvents) || legacySessions.reduce((sum, session) => {
    return sum + (Array.isArray(session.history) ? session.history.length : 0)
  }, 0)
  migrated.stats.lastEventAt = getLatestTimestamp(legacySessions)

  const backupPath = path.join(path.dirname(storePath), LEGACY_BACKUP_FILE)
  if (!fs.existsSync(backupPath) && fs.existsSync(storePath)) {
    fs.copyFileSync(storePath, backupPath)
  }
  writeStoreStateAtomically({ storePath, state: migrated })
  return { state: migrated, migratedLegacy: true, storeError: '' }
}

const normalizeLoadedState = ({
  parsed,
  now = () => new Date().toISOString(),
  retentionDays = DEFAULT_RETENTION_DAYS
} = {}) => {
  const state = createEmptyStoreState({ now, retentionDays })
  state.updatedAt = String(parsed?.updatedAt || state.updatedAt)
  state.retentionDays = Number(parsed?.retentionDays) || retentionDays
  state.liveSessions = Array.isArray(parsed?.liveSessions) ? parsed.liveSessions.map((session) => cloneJson(session)) : []
  state.sessionSummaries = Array.isArray(parsed?.sessionSummaries) ? parsed.sessionSummaries.map((summary) => cloneJson(summary)) : []
  state.dailyUsageRollups = Array.isArray(parsed?.dailyUsageRollups) ? parsed.dailyUsageRollups.map((row) => cloneJson(row)) : []
  state.usageLifetime = parsed?.usageLifetime && typeof parsed.usageLifetime === 'object'
    ? { ...createEmptyLifetimeTotals(), ...cloneJson(parsed.usageLifetime) }
    : rebuildLifetimeUsageFromDailyRollups(state.dailyUsageRollups)
  state.eventDedupe = Array.isArray(parsed?.eventDedupe) ? parsed.eventDedupe.map((entry) => cloneJson(entry)) : []
  state.stats.totalEvents = Number(parsed?.stats?.totalEvents) || 0
  state.stats.lastEventAt = String(parsed?.stats?.lastEventAt || '')
  state.stats.storeError = String(parsed?.stats?.storeError || '')
  return state
}

const loadStoreState = ({
  storePath,
  now = () => new Date().toISOString(),
  retentionDays = DEFAULT_RETENTION_DAYS
} = {}) => {
  if (!fs.existsSync(storePath)) {
    return {
      state: createEmptyStoreState({ now, retentionDays }),
      migratedLegacy: false,
      storeError: ''
    }
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
    if (Number(parsed?.schemaVersion) === SCHEMA_VERSION) {
      return {
        state: normalizeLoadedState({ parsed, now, retentionDays }),
        migratedLegacy: false,
        storeError: ''
      }
    }
    return migrateLegacyStore({ parsed, storePath, now, retentionDays })
  } catch (_) {
    return {
      state: createEmptyStoreState({
        now,
        retentionDays,
        storeError: DEFAULT_STORE_ERROR
      }),
      migratedLegacy: false,
      storeError: DEFAULT_STORE_ERROR
    }
  }
}

module.exports = {
  createEmptyStoreState,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_STORE_ERROR,
  ensureDirectory,
  LEGACY_BACKUP_FILE,
  loadStoreState,
  SCHEMA_VERSION,
  STORE_FILE,
  writeStoreStateAtomically
}
