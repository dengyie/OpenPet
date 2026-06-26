const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const SCHEMA_VERSION = 1
const DEFAULT_CONTEXT_POLICY = Object.freeze({
  maxContextMessages: 20,
  maxContextTurns: 10
})
const MESSAGE_ROLES = new Set(['user', 'assistant'])
const MAX_MESSAGE_CHARS = 8000
const MEMORY_SCOPES = new Set(['global', 'petPack'])
const MEMORY_OPERATIONS = new Set(['create', 'update', 'reinforce', 'ignore'])
const MEMORY_STATUSES = new Set(['active', 'superseded', 'deleted'])
const MAX_MEMORY_TEXT_CHARS = 500
const MAX_MEMORY_TAGS = 12
const MAX_PET_UTTERANCE_TEXT_CHARS = 1000
const MAX_PET_UTTERANCES_PER_PACK = 100
const DEFAULT_RECENT_PET_UTTERANCE_LIMIT = 6
const DEFAULT_RECENT_PET_UTTERANCE_CHARS = 1200
const MAX_TRACE_ITEMS = 50

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const createEmptyState = () => ({
  schemaVersion: SCHEMA_VERSION,
  sessions: {},
  conversations: {},
  messages: {},
  personaOverrides: {},
  memories: {},
  petUtterances: {},
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

const normalizePetUtterance = (utterance) => {
  if (!isPlainObject(utterance)) return null
  const text = typeof utterance.text === 'string'
    ? utterance.text.trim().replace(/\s+/g, ' ').slice(0, MAX_PET_UTTERANCE_TEXT_CHARS)
    : ''
  const petPackId = typeof utterance.petPackId === 'string' ? utterance.petPackId.trim() : ''
  if (!text || !petPackId) return null
  const ttlMs = Number(utterance.ttlMs)
  return {
    id: typeof utterance.id === 'string' && utterance.id ? utterance.id : '',
    petPackId,
    text,
    source: typeof utterance.source === 'string' ? utterance.source.trim().slice(0, 120) : '',
    ttlMs: Number.isFinite(ttlMs) && ttlMs > 0 ? Math.round(ttlMs) : 0,
    createdAt: typeof utterance.createdAt === 'string' && utterance.createdAt ? utterance.createdAt : ''
  }
}

const normalizePetUtterances = (petUtterances) => {
  if (!isPlainObject(petUtterances)) return {}
  return Object.fromEntries(
    Object.entries(petUtterances).map(([petPackId, utterances]) => {
      const packId = typeof petPackId === 'string' ? petPackId.trim() : ''
      const normalized = (Array.isArray(utterances) ? utterances : [])
        .map((utterance) => normalizePetUtterance({ ...utterance, petPackId: utterance?.petPackId || packId }))
        .filter(Boolean)
        .slice(-MAX_PET_UTTERANCES_PER_PACK)
      return [packId, normalized]
    }).filter(([petPackId]) => Boolean(petPackId))
  )
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
  state.petUtterances = normalizePetUtterances(input.petUtterances)
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

const hashText = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex')

const normalizeMemoryTextKey = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()

const hasSensitiveMemoryText = (text) => {
  const value = String(text || '')
  return [
    /\bsk-[A-Za-z0-9_-]{12,}\b/i,
    /\bsk-cpa-[A-Za-z0-9_-]{12,}\b/i,
    /\b(api[_ -]?key|token|password|passcode|otp|one[- ]?time code)\b\s*[:=]?\s*\S{6,}/i,
    /\b\d{13,19}\b/,
    /\b\d{3}-\d{2}-\d{4}\b/,
    /\b\d{5,}\s+[\w\s]{3,}\s+(street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|drive|dr\.)\b/i
  ].some((pattern) => pattern.test(value))
}

const normalizeMemoryTags = (tags) => {
  if (!Array.isArray(tags)) return []
  return Array.from(new Set(tags.map((tag) => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean))).slice(0, MAX_MEMORY_TAGS)
}

const normalizeScore = (value, fallback = 0.5) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(1, Math.max(0, number))
}

const normalizeMemoryOperation = (operation, petPackId) => {
  if (!isPlainObject(operation)) return null
  const op = typeof operation.operation === 'string' ? operation.operation.trim() : ''
  if (!MEMORY_OPERATIONS.has(op)) return null
  if (op === 'ignore') return { operation: op }
  const scope = typeof operation.scope === 'string' ? operation.scope.trim() : ''
  const text = typeof operation.text === 'string' ? operation.text.trim().replace(/\s+/g, ' ').slice(0, MAX_MEMORY_TEXT_CHARS) : ''
  if (!MEMORY_SCOPES.has(scope) || !text) return null
  return {
    operation: op,
    scope,
    petPackId: scope === 'petPack' ? petPackId : '',
    text,
    tags: normalizeMemoryTags(operation.tags),
    confidence: normalizeScore(operation.confidence),
    importance: normalizeScore(operation.importance),
    targetId: typeof operation.targetId === 'string' ? operation.targetId.trim() : '',
    reason: typeof operation.reason === 'string' ? operation.reason.trim().slice(0, 240) : ''
  }
}

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

const summarizeMessage = (message) => ({
  id: typeof message?.id === 'string' ? message.id : '',
  role: MESSAGE_ROLES.has(message?.role) ? message.role : 'user',
  contentChars: typeof message?.content === 'string' ? message.content.length : 0,
  contentSha256: hashText(message?.content || ''),
  createdAt: typeof message?.createdAt === 'string' ? message.createdAt : ''
})

const summarizeMemory = (memory) => {
  const normalized = isPlainObject(memory) ? memory : {}
  const text = typeof normalized.text === 'string' ? normalized.text : ''
  return {
    id: typeof normalized.id === 'string' ? normalized.id : '',
    scope: MEMORY_SCOPES.has(normalized.scope) ? normalized.scope : 'global',
    petPackId: typeof normalized.petPackId === 'string' ? normalized.petPackId : '',
    conversationId: typeof normalized.sourceConversationId === 'string' ? normalized.sourceConversationId : '',
    textChars: text.length,
    textSha256: hashText(text),
    tags: normalizeMemoryTags(normalized.tags),
    confidence: normalizeScore(normalized.confidence),
    importance: normalizeScore(normalized.importance),
    sourceConversationId: typeof normalized.sourceConversationId === 'string' ? normalized.sourceConversationId : '',
    sourceMessageIds: Array.isArray(normalized.sourceMessageIds) ? normalized.sourceMessageIds.filter((id) => typeof id === 'string' && id) : [],
    status: MEMORY_STATUSES.has(normalized.status) ? normalized.status : 'active',
    useCount: Math.max(0, Number(normalized.useCount) || 0),
    createdAt: typeof normalized.createdAt === 'string' ? normalized.createdAt : '',
    updatedAt: typeof normalized.updatedAt === 'string' ? normalized.updatedAt : '',
    lastUsedAt: typeof normalized.lastUsedAt === 'string' ? normalized.lastUsedAt : '',
    lastEvidenceAt: typeof normalized.lastEvidenceAt === 'string' ? normalized.lastEvidenceAt : ''
  }
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

  const createMemoryId = () => `memory:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
  const createTraceId = () => `trace:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
  const createPetUtteranceId = () => `pet-utterance:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`

  const recordPetUtterance = (utterance = {}) => {
    const timestamp = now()
    const normalized = normalizePetUtterance({
      ...utterance,
      id: typeof utterance.id === 'string' && utterance.id ? utterance.id : createPetUtteranceId(),
      createdAt: typeof utterance.createdAt === 'string' && utterance.createdAt ? utterance.createdAt : timestamp
    })
    if (!normalized) throw new Error('Valid pet utterance text and petPackId are required')
    const current = Array.isArray(state.petUtterances[normalized.petPackId])
      ? state.petUtterances[normalized.petPackId]
      : []
    state.petUtterances[normalized.petPackId] = [...current, normalized].slice(-MAX_PET_UTTERANCES_PER_PACK)
    persist()
    return clone(normalized)
  }

  const listRecentPetUtterances = ({ petPackId, limit = DEFAULT_RECENT_PET_UTTERANCE_LIMIT, maxChars = DEFAULT_RECENT_PET_UTTERANCE_CHARS } = {}) => {
    const packId = typeof petPackId === 'string' ? petPackId.trim() : ''
    if (!packId) return []
    const max = Math.max(0, Number(limit) || 0)
    const charBudget = Math.max(0, Number(maxChars) || 0)
    const utterances = Array.isArray(state.petUtterances[packId])
      ? state.petUtterances[packId].map(normalizePetUtterance).filter(Boolean)
      : []
    const selected = []
    let usedChars = 0
    for (const utterance of utterances.slice().reverse()) {
      if (max && selected.length >= max) break
      const nextChars = usedChars + utterance.text.length
      if (charBudget && selected.length > 0 && nextChars > charBudget) break
      selected.push(utterance)
      usedChars = nextChars
      if (charBudget && usedChars >= charBudget) break
    }
    return clone(selected.reverse())
  }

  const clearPetUtterances = (petPackId) => {
    const packId = typeof petPackId === 'string' ? petPackId.trim() : ''
    if (!packId) throw new Error('petPackId is required')
    const deletedCount = Array.isArray(state.petUtterances[packId]) ? state.petUtterances[packId].length : 0
    delete state.petUtterances[packId]
    if (deletedCount > 0) persist()
    return { petPackId: packId, deletedCount }
  }

  const normalizeExistingMemory = (memory) => ({
    id: typeof memory?.id === 'string' && memory.id ? memory.id : createMemoryId(),
    scope: MEMORY_SCOPES.has(memory?.scope) ? memory.scope : 'global',
    petPackId: typeof memory?.petPackId === 'string' ? memory.petPackId : '',
    text: typeof memory?.text === 'string' ? memory.text.trim().slice(0, MAX_MEMORY_TEXT_CHARS) : '',
    tags: normalizeMemoryTags(memory?.tags),
    confidence: normalizeScore(memory?.confidence),
    importance: normalizeScore(memory?.importance),
    sourceConversationId: typeof memory?.sourceConversationId === 'string' ? memory.sourceConversationId : '',
    sourceMessageIds: Array.isArray(memory?.sourceMessageIds) ? memory.sourceMessageIds.filter((id) => typeof id === 'string' && id) : [],
    createdAt: typeof memory?.createdAt === 'string' && memory.createdAt ? memory.createdAt : now(),
    updatedAt: typeof memory?.updatedAt === 'string' && memory.updatedAt ? memory.updatedAt : now(),
    lastUsedAt: typeof memory?.lastUsedAt === 'string' ? memory.lastUsedAt : '',
    lastEvidenceAt: typeof memory?.lastEvidenceAt === 'string' ? memory.lastEvidenceAt : '',
    useCount: Math.max(0, Number(memory?.useCount) || 0),
    status: MEMORY_STATUSES.has(memory?.status) ? memory.status : 'active',
    supersedes: typeof memory?.supersedes === 'string' ? memory.supersedes : '',
    reason: typeof memory?.reason === 'string' ? memory.reason : ''
  })

  const findActiveMemory = (memory) => {
    const textKey = normalizeMemoryTextKey(memory.text)
    return Object.values(state.memories).find((candidate) => (
      candidate?.status === 'active' &&
      candidate.scope === memory.scope &&
      (candidate.scope !== 'petPack' || candidate.petPackId === memory.petPackId) &&
      normalizeMemoryTextKey(candidate.text) === textKey
    ))
  }

  const applyMemoryOperations = ({ petPackId, conversationId = '', messageIds = [], operations = [] } = {}) => {
    const packId = typeof petPackId === 'string' ? petPackId.trim() : ''
    if (!packId) throw new Error('petPackId is required')
    const timestamp = now()
    const applied = []
    const filtered = []
    for (const candidate of operations) {
      const memory = normalizeMemoryOperation(candidate, packId)
      if (!memory || memory.operation === 'ignore') continue
      if (hasSensitiveMemoryText(memory.text)) {
        filtered.push({ operation: memory.operation, scope: memory.scope, reason: 'sensitive' })
        continue
      }
      const existing = memory.targetId ? state.memories[memory.targetId] : findActiveMemory(memory)
      if (existing?.status === 'active') {
        const next = normalizeExistingMemory({
          ...existing,
          text: memory.operation === 'update' ? memory.text : existing.text,
          tags: Array.from(new Set([...(existing.tags || []), ...memory.tags])).slice(0, MAX_MEMORY_TAGS),
          confidence: Math.max(normalizeScore(existing.confidence), memory.confidence),
          importance: Math.max(normalizeScore(existing.importance), memory.importance),
          sourceMessageIds: Array.from(new Set([...(existing.sourceMessageIds || []), ...messageIds])),
          updatedAt: timestamp,
          lastEvidenceAt: timestamp,
          useCount: memory.operation === 'reinforce' ? Math.max(0, Number(existing.useCount) || 0) + 1 : Math.max(0, Number(existing.useCount) || 0),
          reason: memory.reason || existing.reason
        })
        state.memories[next.id] = next
        applied.push({ id: next.id, operation: memory.operation, scope: next.scope })
        continue
      }
      const id = createMemoryId()
      state.memories[id] = normalizeExistingMemory({
        id,
        scope: memory.scope,
        petPackId: memory.scope === 'petPack' ? packId : '',
        text: memory.text,
        tags: memory.tags,
        confidence: memory.confidence,
        importance: memory.importance,
        sourceConversationId: conversationId,
        sourceMessageIds: messageIds,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastEvidenceAt: timestamp,
        status: 'active',
        reason: memory.reason
      })
      applied.push({ id, operation: 'create', scope: memory.scope })
    }
    if (filtered.length) {
      const traceId = createTraceId()
      state.traces[traceId] = {
        id: traceId,
        petPackId: packId,
        conversationId,
        filteredMemoryCandidates: filtered,
        createdAt: timestamp
      }
    }
    persist()
    return { applied, filtered }
  }

  const listMemories = ({ petPackId, scope = '', limit = 8 } = {}) => {
    const packId = typeof petPackId === 'string' ? petPackId.trim() : ''
    const scopeFilter = MEMORY_SCOPES.has(scope) ? scope : ''
    const max = Math.max(0, Number(limit) || 0)
    const memories = Object.values(state.memories)
      .map(normalizeExistingMemory)
      .filter((memory) => (
        memory.status === 'active' &&
        (!scopeFilter || memory.scope === scopeFilter) &&
        (memory.scope === 'global' || (memory.scope === 'petPack' && memory.petPackId === packId))
      ))
      .sort((a, b) => {
        const scoreA = a.importance + a.confidence
        const scoreB = b.importance + b.confidence
        if (scoreA !== scoreB) return scoreB - scoreA
        return String(b.updatedAt).localeCompare(String(a.updatedAt))
      })
    return clone(max ? memories.slice(0, max) : memories)
  }

  const markMemoriesUsed = (memoryIds = []) => {
    if (!Array.isArray(memoryIds)) return { updatedCount: 0, memories: [] }
    const timestamp = now()
    const ids = Array.from(new Set(memoryIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)))
    const updated = []
    for (const id of ids) {
      if (!state.memories[id]) continue
      const memory = normalizeExistingMemory(state.memories[id])
      if (!memory.id || memory.status !== 'active') continue
      const next = normalizeExistingMemory({
        ...memory,
        lastUsedAt: timestamp,
        useCount: Math.max(0, Number(memory.useCount) || 0) + 1
      })
      state.memories[id] = next
      updated.push(next)
    }
    if (updated.length) persist()
    return { updatedCount: updated.length, memories: clone(updated) }
  }

  const deleteMemory = (memoryId) => {
    const id = typeof memoryId === 'string' ? memoryId.trim() : ''
    if (!id || !state.memories[id]) return null
    state.memories[id] = normalizeExistingMemory({
      ...state.memories[id],
      status: 'deleted',
      updatedAt: now()
    })
    persist()
    return clone(state.memories[id])
  }

  const clearPetPackMemories = (petPackId) => {
    const packId = typeof petPackId === 'string' ? petPackId.trim() : ''
    if (!packId) throw new Error('petPackId is required')
    const timestamp = now()
    let deletedCount = 0
    for (const [id, candidate] of Object.entries(state.memories)) {
      const memory = normalizeExistingMemory(candidate)
      if (memory.status !== 'active' || memory.scope !== 'petPack' || memory.petPackId !== packId) continue
      state.memories[id] = normalizeExistingMemory({
        ...memory,
        status: 'deleted',
        updatedAt: timestamp
      })
      deletedCount += 1
    }
    if (deletedCount > 0) persist()
    return { petPackId: packId, deletedCount }
  }

  const createMemoryJob = ({ petPackId, conversationId } = {}) => {
    const id = `memory-job:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
    state.memoryJobs[id] = {
      id,
      petPackId: typeof petPackId === 'string' ? petPackId : '',
      conversationId: typeof conversationId === 'string' ? conversationId : '',
      status: 'pending',
      createdAt: now(),
      updatedAt: now(),
      errorCode: ''
    }
    persist()
    return clone(state.memoryJobs[id])
  }

  const finishMemoryJob = (jobId, patch = {}) => {
    if (!jobId || !state.memoryJobs[jobId]) return null
    state.memoryJobs[jobId] = {
      ...state.memoryJobs[jobId],
      status: typeof patch.status === 'string' ? patch.status : state.memoryJobs[jobId].status,
      errorCode: typeof patch.errorCode === 'string' ? patch.errorCode : '',
      appliedCount: Number.isFinite(Number(patch.appliedCount)) ? Number(patch.appliedCount) : state.memoryJobs[jobId].appliedCount,
      filteredCount: Number.isFinite(Number(patch.filteredCount)) ? Number(patch.filteredCount) : state.memoryJobs[jobId].filteredCount,
      updatedAt: now()
    }
    persist()
    return clone(state.memoryJobs[jobId])
  }

  const migrateLegacyConversation = ({
    entrypoint = 'control-center',
    petPackId = 'legacy-cat',
    personaHash = '',
    messages = []
  } = {}) => {
    const normalizedMessages = normalizeMessages(messages)
    if (!normalizedMessages.length) {
      return { migrated: false, skipped: true, reason: 'no legacy messages', messageCount: 0 }
    }
    const { sessionId, conversationId } = ensureMainConversation({ entrypoint, petPackId, personaHash })
    const conversationKey = `${sessionId}:${conversationId}`
    const current = state.messages[conversationKey] || []
    if (current.length > 0) {
      return {
        migrated: false,
        skipped: true,
        reason: 'target conversation already has messages',
        sessionId,
        conversationId,
        messageCount: current.length
      }
    }
    const timestamp = now()
    state.messages[conversationKey] = normalizedMessages.map((message, index) => ({
      ...message,
      id: message.id || createMessageId({ sessionId, conversationId, index }),
      createdAt: message.createdAt || timestamp
    }))
    state.conversations[conversationKey] = {
      ...state.conversations[conversationKey],
      updatedAt: timestamp
    }
    state.sessions[sessionId] = {
      ...state.sessions[sessionId],
      updatedAt: timestamp
    }
    persist()
    return {
      migrated: true,
      skipped: false,
      reason: '',
      sessionId,
      conversationId,
      messageCount: state.messages[conversationKey].length
    }
  }

  const exportTraceDiagnostics = ({ provider = {}, behaviorDecisions = [], filters = {} } = {}) => {
    const filterPetPackId = typeof filters.petPackId === 'string' ? filters.petPackId.trim() : ''
    const filterConversationId = typeof filters.conversationId === 'string' ? filters.conversationId.trim() : ''
    const matchesFilters = ({ petPackId = '', conversationId = '' } = {}) => {
      if (filterPetPackId && petPackId !== filterPetPackId) return false
      if (filterConversationId && conversationId !== filterConversationId) return false
      return true
    }
    const conversations = Object.entries(state.conversations || {})
      .map(([conversationKey, conversation]) => {
        const messages = normalizeMessages(state.messages[conversationKey] || [])
        return {
          key: conversationKey,
          conversationId: conversationKey,
          id: typeof conversation?.id === 'string' ? conversation.id : '',
          sessionId: typeof conversation?.sessionId === 'string' ? conversation.sessionId : '',
          petPackId: typeof conversation?.petPackId === 'string' ? conversation.petPackId : '',
          personaPackId: typeof conversation?.personaPackId === 'string' ? conversation.personaPackId : '',
          personaHash: typeof conversation?.personaHash === 'string' ? conversation.personaHash : '',
          responseMode: typeof conversation?.responseMode === 'string' ? conversation.responseMode : '',
          messageCount: messages.length,
          messages: messages.map(summarizeMessage).slice(-MAX_TRACE_ITEMS),
          createdAt: typeof conversation?.createdAt === 'string' ? conversation.createdAt : '',
          updatedAt: typeof conversation?.updatedAt === 'string' ? conversation.updatedAt : ''
        }
      })
      .filter((conversation) => matchesFilters({
        petPackId: conversation.petPackId,
        conversationId: conversation.key
      }))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, MAX_TRACE_ITEMS)
    const memories = Object.values(state.memories || {})
      .map(summarizeMemory)
      .filter((memory) => matchesFilters({
        petPackId: memory.petPackId,
        conversationId: memory.conversationId
      }))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, MAX_TRACE_ITEMS)
    const memoryJobs = Object.values(state.memoryJobs || {})
      .map((job) => ({
        id: typeof job?.id === 'string' ? job.id : '',
        petPackId: typeof job?.petPackId === 'string' ? job.petPackId : '',
        conversationId: typeof job?.conversationId === 'string' ? job.conversationId : '',
        status: typeof job?.status === 'string' ? job.status : '',
        errorCode: typeof job?.errorCode === 'string' ? job.errorCode : '',
        appliedCount: Number.isFinite(Number(job?.appliedCount)) ? Number(job.appliedCount) : 0,
        filteredCount: Number.isFinite(Number(job?.filteredCount)) ? Number(job.filteredCount) : 0,
        createdAt: typeof job?.createdAt === 'string' ? job.createdAt : '',
        updatedAt: typeof job?.updatedAt === 'string' ? job.updatedAt : ''
      }))
      .filter((job) => matchesFilters({
        petPackId: job.petPackId,
        conversationId: job.conversationId
      }))
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      .slice(0, MAX_TRACE_ITEMS)
    const traces = Object.values(state.traces || {})
      .map((trace) => ({
        id: typeof trace?.id === 'string' ? trace.id : '',
        petPackId: typeof trace?.petPackId === 'string' ? trace.petPackId : '',
        conversationId: typeof trace?.conversationId === 'string' ? trace.conversationId : '',
        filteredMemoryCandidates: Array.isArray(trace?.filteredMemoryCandidates)
          ? trace.filteredMemoryCandidates.map((candidate) => ({
              operation: typeof candidate?.operation === 'string' ? candidate.operation : '',
              scope: typeof candidate?.scope === 'string' ? candidate.scope : '',
              reason: typeof candidate?.reason === 'string' ? candidate.reason : ''
            }))
          : [],
        createdAt: typeof trace?.createdAt === 'string' ? trace.createdAt : ''
      }))
      .filter((trace) => matchesFilters({
        petPackId: trace.petPackId,
        conversationId: trace.conversationId
      }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, MAX_TRACE_ITEMS)
    const filteredBehaviorDecisions = (Array.isArray(behaviorDecisions) ? behaviorDecisions : [])
      .filter((decision) => {
        if (!filterPetPackId && !filterConversationId) return true
        const petPackId = typeof decision?.petPackId === 'string' ? decision.petPackId : ''
        const conversationId = typeof decision?.conversationId === 'string' ? decision.conversationId : ''
        if (!petPackId && !conversationId) return false
        return matchesFilters({ petPackId, conversationId })
      })
    return JSON.stringify({
      schemaVersion: 1,
      exportedAt: now(),
      redaction: {
        messages: 'content omitted; contentChars and contentSha256 retained',
        memories: 'text omitted; textChars and textSha256 retained',
        provider: 'api keys and credentials omitted by provider view contract',
        behavior: 'decision replay payloads omitted'
      },
      provider: {
        enabled: Boolean(provider.enabled),
        provider: typeof provider.provider === 'string' ? provider.provider : '',
        baseUrl: typeof provider.baseUrl === 'string' ? provider.baseUrl : '',
        model: typeof provider.model === 'string' ? provider.model : '',
        hasApiKey: Boolean(provider.hasApiKey),
        memoryEnabled: Boolean(provider.memory?.enabled),
        behaviorEnabled: Boolean(provider.behavior?.enabled)
      },
      conversations,
      memories,
      memoryJobs,
      traces,
      behaviorDecisions: filteredBehaviorDecisions
        .slice(0, MAX_TRACE_ITEMS)
        .map(({ replay: _replay, ...decision }) => ({
          id: Number.isFinite(Number(decision?.id)) ? Number(decision.id) : 0,
          timestamp: typeof decision?.timestamp === 'string' ? decision.timestamp : '',
          matched: Boolean(decision?.matched),
          type: typeof decision?.type === 'string' ? decision.type : '',
          ruleId: typeof decision?.ruleId === 'string' ? decision.ruleId : '',
          reason: typeof decision?.reason === 'string' ? decision.reason : '',
          actionId: typeof decision?.actionId === 'string' ? decision.actionId : '',
          intent: typeof decision?.intent === 'string' ? decision.intent : '',
          providerReason: typeof decision?.providerReason === 'string' ? decision.providerReason : '',
          displayMode: typeof decision?.displayMode === 'string' ? decision.displayMode : '',
          inputSummary: typeof decision?.inputSummary === 'string' ? decision.inputSummary : '',
          cooldown: Boolean(decision?.cooldown),
          fallback: Boolean(decision?.fallback),
          blockedReason: typeof decision?.blockedReason === 'string' ? decision.blockedReason : '',
          replayRedacted: true
        }))
    }, null, 2)
  }

  return {
    appendMessages,
    applyMemoryOperations,
    createMemoryJob,
    clearPetPackMemories,
    deleteMemory,
    ensureMainConversation,
    finishMemoryJob,
    getMessages,
    getPersonaOverride,
    getState,
    exportTraceDiagnostics,
    listRecentPetUtterances,
    listMemories,
    markMemoriesUsed,
    migrateLegacyConversation,
    persist,
    recordPetUtterance,
    clearPetUtterances,
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
