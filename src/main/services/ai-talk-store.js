const fs = require('fs')
const path = require('path')

const SCHEMA_VERSION = 1
const DEFAULT_CONTEXT_POLICY = Object.freeze({
  maxContextMessages: 20,
  maxContextTurns: 10
})
const MESSAGE_ROLES = new Set(['user', 'assistant'])
const MAX_MESSAGE_CHARS = 8000

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const createEmptyState = () => ({
  schemaVersion: SCHEMA_VERSION,
  sessions: {},
  conversations: {},
  messages: {},
  personaOverrides: {},
  memories: {},
  memoryJobs: {},
  traces: {}
})

const clone = (value) => JSON.parse(JSON.stringify(value))

const ensureDirectory = (filePath) => fs.mkdirSync(path.dirname(filePath), { recursive: true })

const writeJsonAtomic = (filePath, value) => {
  ensureDirectory(filePath)
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(tempPath, filePath)
}

const backupCorruptStore = (storePath, now) => {
  if (!fs.existsSync(storePath)) return ''
  const suffix = String(now()).replace(/[:.]/g, '-')
  const backupPath = `${storePath}.corrupt-${suffix}`
  fs.copyFileSync(storePath, backupPath)
  return backupPath
}

const normalizeMessages = (messages) => {
  if (!Array.isArray(messages)) return []
  return messages.map((message) => {
    if (!isPlainObject(message) || !MESSAGE_ROLES.has(message.role)) return null
    const content = typeof message.content === 'string' ? message.content.trim().slice(0, MAX_MESSAGE_CHARS) : ''
    if (!content) return null
    return {
      id: typeof message.id === 'string' && message.id ? message.id : '',
      role: message.role,
      content,
      createdAt: typeof message.createdAt === 'string' ? message.createdAt : ''
    }
  }).filter(Boolean)
}

const normalizeState = (value) => {
  const input = isPlainObject(value) ? value : {}
  const state = createEmptyState()
  state.schemaVersion = Number(input.schemaVersion) || SCHEMA_VERSION
  state.sessions = isPlainObject(input.sessions) ? input.sessions : {}
  state.conversations = isPlainObject(input.conversations) ? input.conversations : {}
  state.messages = isPlainObject(input.messages)
    ? Object.fromEntries(Object.entries(input.messages).map(([key, messages]) => [key, normalizeMessages(messages)]))
    : {}
  state.personaOverrides = isPlainObject(input.personaOverrides) ? input.personaOverrides : {}
  state.memories = isPlainObject(input.memories) ? input.memories : {}
  state.memoryJobs = isPlainObject(input.memoryJobs) ? input.memoryJobs : {}
  state.traces = isPlainObject(input.traces) ? input.traces : {}
  return state
}

const loadState = ({ storePath, now }) => {
  if (!fs.existsSync(storePath)) return createEmptyState()
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath, 'utf-8')))
  } catch (_) {
    backupCorruptStore(storePath, now)
    return createEmptyState()
  }
}

const createSessionId = ({ entrypoint, petPackId }) => `${entrypoint || 'control-center'}:${petPackId || 'legacy-cat'}`

const createMessageId = ({ sessionId, conversationId, index }) => `${sessionId}:${conversationId}:message:${index + 1}`

const normalizePersonaOverride = (override) => {
  if (!isPlainObject(override)) return {}
  const result = {}
  for (const field of ['name', 'identity', 'tone', 'speakingStyle', 'relationshipToUser', 'actionStyle']) {
    if (typeof override[field] === 'string' && override[field].trim()) result[field] = override[field].trim()
  }
  for (const field of ['coreTraits', 'boundaries']) {
    if (Array.isArray(override[field])) {
      const values = override[field].map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      if (values.length) result[field] = values
    }
  }
  return result
}

const createAiTalkStore = ({ storePath, now = () => new Date().toISOString() } = {}) => {
  if (!storePath) throw new Error('storePath is required')
  let state = loadState({ storePath, now })

  const persist = () => {
    writeJsonAtomic(storePath, state)
    return clone(state)
  }

  const getState = () => clone(state)

  const ensureMainConversation = ({ entrypoint = 'control-center', petPackId, personaHash = '' } = {}) => {
    if (!petPackId || typeof petPackId !== 'string') throw new Error('petPackId is required')
    const timestamp = now()
    const sessionId = createSessionId({ entrypoint, petPackId })
    const conversationId = 'main'
    const conversationKey = `${sessionId}:${conversationId}`
    if (!state.sessions[sessionId]) {
      state.sessions[sessionId] = {
        id: sessionId,
        entrypoint,
        petPackId,
        activeConversationId: conversationId,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    }
    if (!state.conversations[conversationKey]) {
      state.conversations[conversationKey] = {
        id: conversationId,
        sessionId,
        petPackId,
        title: '',
        personaPackId: petPackId,
        personaHash: personaHash || '',
        responseMode: 'complete',
        summary: '',
        summaryUpdatedAt: '',
        contextPolicy: { ...DEFAULT_CONTEXT_POLICY },
        createdAt: timestamp,
        updatedAt: timestamp
      }
      state.messages[conversationKey] = []
    } else if (personaHash && state.conversations[conversationKey].personaHash !== personaHash) {
      state.conversations[conversationKey] = {
        ...state.conversations[conversationKey],
        personaHash,
        updatedAt: timestamp
      }
    }
    state.sessions[sessionId] = {
      ...state.sessions[sessionId],
      activeConversationId: conversationId,
      updatedAt: timestamp
    }
    persist()
    return { sessionId, conversationId, conversation: clone(state.conversations[conversationKey]) }
  }

  const getMessages = (sessionId, conversationId = 'main') => {
    return clone(state.messages[`${sessionId}:${conversationId}`] || [])
  }

  const appendMessages = (sessionId, conversationId = 'main', messages = []) => {
    const conversationKey = `${sessionId}:${conversationId}`
    if (!state.conversations[conversationKey]) throw new Error(`AI talk conversation does not exist: ${conversationKey}`)
    const timestamp = now()
    const current = state.messages[conversationKey] || []
    const normalized = normalizeMessages(messages).map((message, index) => ({
      ...message,
      id: message.id || createMessageId({ sessionId, conversationId, index: current.length + index }),
      createdAt: message.createdAt || timestamp
    }))
    state.messages[conversationKey] = [...current, ...normalized]
    state.conversations[conversationKey] = {
      ...state.conversations[conversationKey],
      updatedAt: timestamp
    }
    persist()
    return getMessages(sessionId, conversationId)
  }

  const getPersonaOverride = (petPackId) => {
    const key = typeof petPackId === 'string' ? petPackId.trim() : ''
    if (!key) return {}
    return clone(normalizePersonaOverride(state.personaOverrides[key]))
  }

  const savePersonaOverride = (petPackId, override = {}) => {
    const key = typeof petPackId === 'string' ? petPackId.trim() : ''
    if (!key) throw new Error('petPackId is required')
    const normalized = normalizePersonaOverride(override)
    if (Object.keys(normalized).length) state.personaOverrides[key] = normalized
    else delete state.personaOverrides[key]
    persist()
    return getPersonaOverride(key)
  }

  return {
    appendMessages,
    ensureMainConversation,
    getMessages,
    getPersonaOverride,
    getState,
    persist,
    savePersonaOverride
  }
}

module.exports = {
  DEFAULT_CONTEXT_POLICY,
  SCHEMA_VERSION,
  createAiTalkStore,
  createEmptyState,
  normalizeState
}
