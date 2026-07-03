const fs = require('fs')
const path = require('path')

const MAX_SESSIONS = 100

const ensureDir = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const readJsonFile = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (_) {
    return fallback
  }
}

const writeJsonFileAtomic = (filePath, value) => {
  ensureDir(path.dirname(filePath))
  const tmpPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2))
  fs.renameSync(tmpPath, filePath)
}

const createSessionStore = ({ dataDir, now = () => new Date().toISOString() }) => {
  if (!dataDir) throw new Error('Agent Awareness dataDir is required')
  const filePath = path.join(dataDir, 'sessions.json')

  const readState = () => {
    const state = readJsonFile(filePath, { sessions: [] })
    return {
      sessions: Array.isArray(state.sessions) ? state.sessions : []
    }
  }

  const writeState = (state) => {
    const sessions = [...state.sessions]
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, MAX_SESSIONS)
    writeJsonFileAtomic(filePath, { sessions })
  }

  const upsertEvent = (event) => {
    const state = readState()
    const existing = state.sessions.find((session) => session.sessionId === event.sessionId)
    const updatedAt = event.timestamp || now()
    const historyEntry = {
      status: event.status,
      message: event.message,
      type: event.type,
      timestamp: updatedAt
    }
    const nextSession = {
      ...(existing || {}),
      adapter: event.adapter,
      sessionId: event.sessionId,
      status: event.status,
      message: event.message,
      cwdName: event.cwdName,
      cwdHash: event.cwdHash,
      toolName: event.toolName,
      updatedAt,
      createdAt: existing?.createdAt || updatedAt,
      history: [historyEntry, ...((existing?.history || []).slice(0, 19))]
    }
    writeState({
      sessions: [
        nextSession,
        ...state.sessions.filter((session) => session.sessionId !== event.sessionId)
      ]
    })
    return nextSession
  }

  return {
    filePath,
    listSessions: () => readState().sessions,
    upsertEvent
  }
}

module.exports = { createSessionStore }
