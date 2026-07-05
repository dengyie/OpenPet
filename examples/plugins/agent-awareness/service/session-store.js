const fs = require('fs')
const path = require('path')
const { createRuntimeHistoryEntry, createRuntimeSession } = require('./runtime-session')

const STORE_FILE = 'sessions.json'
const DEFAULT_MAX_SESSIONS = 100
const DEFAULT_MAX_EVENTS = 1000

const ensureDirectory = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const readStore = (storePath) => {
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf-8'))
  } catch (_) {
    return { sessions: [], stats: { totalEvents: 0 } }
  }
}

const writeStore = (storePath, state) => {
  fs.writeFileSync(storePath, `${JSON.stringify(state, null, 2)}\n`)
}

const toTimestampMs = (value) => {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const getLatestTimestamp = (sessions = []) => sessions.reduce((latest, session) => {
  return toTimestampMs(session.timestamp) > toTimestampMs(latest) ? session.timestamp : latest
}, '')

const createSessionStore = ({
  dataDir,
  maxSessions = DEFAULT_MAX_SESSIONS,
  maxEvents = DEFAULT_MAX_EVENTS
} = {}) => {
  ensureDirectory(dataDir)
  const storePath = path.join(dataDir, STORE_FILE)
  let state = readStore(storePath)

  const save = () => writeStore(storePath, state)

  const evict = () => {
    let sessions = [...state.sessions]
    while (sessions.length > maxSessions) {
      sessions.sort((left, right) => toTimestampMs(left.timestamp) - toTimestampMs(right.timestamp))
      sessions.shift()
    }
    let totalEvents = sessions.reduce((sum, session) => sum + session.history.length, 0)
    while (totalEvents > maxEvents) {
      let oldestSessionIndex = -1
      let oldestEventIndex = -1
      let oldestEventTime = Number.POSITIVE_INFINITY
      sessions.forEach((session, sessionIndex) => {
        session.history.forEach((entry, eventIndex) => {
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
      totalEvents = sessions.reduce((sum, session) => sum + session.history.length, 0)
    }
    sessions.sort((left, right) => toTimestampMs(right.timestamp) - toTimestampMs(left.timestamp))
    state = {
      sessions,
      stats: {
        totalEvents: sessions.reduce((sum, session) => sum + session.history.length, 0)
      }
    }
  }

  return {
    getStatus: () => ({
      sessions: state.sessions.length,
      totalEvents: state.stats?.totalEvents || 0,
      lastEventAt: getLatestTimestamp(state.sessions)
    }),
    listSessions: () => [...state.sessions],
    upsertEvent: (event) => {
      const sessionId = String(event.sessionId || '')
      if (!sessionId) throw new Error('sessionId is required')
      let session = state.sessions.find((candidate) => candidate.sessionId === sessionId)
      if (!session) {
        session = { ...createRuntimeSession(null, event), history: [] }
        state.sessions.push(session)
      } else {
        Object.assign(session, createRuntimeSession(session, event))
      }
      session.history.push(createRuntimeHistoryEntry(session))
      evict()
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
