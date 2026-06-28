const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createAiTalkStore } = require('../../src/main/services/ai-talk-store')

const createTempStorePath = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ai-talk-store-test-'))
  return path.join(root, 'ai-talk-store.json')
}

test('ai talk store creates isolated main conversations per pet pack', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })

  const legacy = store.ensureMainConversation({ entrypoint: 'control-center', petPackId: 'legacy-cat', personaHash: 'hash-a' })
  const sprout = store.ensureMainConversation({ entrypoint: 'control-center', petPackId: 'sprout-cat', personaHash: 'hash-b' })

  assert.equal(legacy.sessionId, 'control-center:legacy-cat')
  assert.equal(legacy.conversationId, 'main')
  assert.equal(sprout.sessionId, 'control-center:sprout-cat')
  assert.equal(sprout.conversationId, 'main')
  assert.notEqual(legacy.sessionId, sprout.sessionId)
  assert.deepEqual(Object.keys(store.getState().sessions).sort(), ['control-center:legacy-cat', 'control-center:sprout-cat'])
})

test('ai talk store persists and returns cloned messages by conversation scope', () => {
  const storePath = createTempStorePath()
  const store = createAiTalkStore({ storePath, now: () => '2026-06-20T00:00:00.000Z' })

  const legacy = store.ensureMainConversation({ entrypoint: 'control-center', petPackId: 'legacy-cat', personaHash: 'hash-a' })
  const sprout = store.ensureMainConversation({ entrypoint: 'control-center', petPackId: 'sprout-cat', personaHash: 'hash-b' })
  store.appendMessages(legacy.sessionId, legacy.conversationId, [
    { role: 'user', content: 'Hi legacy' },
    { role: 'assistant', content: 'Hello legacy' }
  ])
  store.appendMessages(sprout.sessionId, sprout.conversationId, [
    { role: 'user', content: 'Hi sprout' }
  ])

  const reloaded = createAiTalkStore({ storePath })
  const legacyMessages = reloaded.getMessages(legacy.sessionId, legacy.conversationId)
  legacyMessages[0].content = 'mutated'

  assert.deepEqual(reloaded.getMessages(legacy.sessionId, legacy.conversationId).map((message) => message.content), ['Hi legacy', 'Hello legacy'])
  assert.deepEqual(reloaded.getMessages(sprout.sessionId, sprout.conversationId).map((message) => message.content), ['Hi sprout'])
})

test('ai talk store imports legacy messages only when the target conversation is empty', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })
  const { sessionId, conversationId } = store.ensureMainConversation({
    entrypoint: 'control-center',
    petPackId: 'legacy-cat',
    personaHash: 'hash-a'
  })

  const imported = store.importMessagesIfEmpty(sessionId, conversationId, [
    { role: 'user', content: '旧对话 1' },
    { role: 'assistant', content: '旧回复 1' }
  ])
  const skipped = store.importMessagesIfEmpty(sessionId, conversationId, [
    { role: 'user', content: '不该覆盖' }
  ])

  assert.deepEqual(imported.map((message) => message.content), ['旧对话 1', '旧回复 1'])
  assert.deepEqual(skipped, [])
  assert.deepEqual(store.getMessages(sessionId, conversationId).map((message) => message.content), ['旧对话 1', '旧回复 1'])
})

test('ai talk store backs up corrupt data and starts from a safe empty state', () => {
  const storePath = createTempStorePath()
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
  fs.writeFileSync(storePath, '{not-json')

  const store = createAiTalkStore({ storePath, now: () => '2026-06-20T00:00:00.000Z' })
  const backups = fs.readdirSync(path.dirname(storePath)).filter((entry) => entry.includes('ai-talk-store.json.corrupt-'))

  assert.equal(store.getState().schemaVersion, 1)
  assert.deepEqual(store.getState().sessions, {})
  assert.equal(backups.length, 1)
})

test('ai talk store persists local persona overrides by pet pack', () => {
  const storePath = createTempStorePath()
  const store = createAiTalkStore({ storePath, now: () => '2026-06-20T00:00:00.000Z' })

  store.savePersonaOverride('legacy-cat', {
    tone: 'sleepy and affectionate',
    coreTraits: ['loyal', 'soft-spoken']
  })

  const reloaded = createAiTalkStore({ storePath })
  const override = reloaded.getPersonaOverride('legacy-cat')
  override.tone = 'mutated'

  assert.deepEqual(reloaded.getPersonaOverride('legacy-cat'), {
    tone: 'sleepy and affectionate',
    coreTraits: ['loyal', 'soft-spoken']
  })
})

test('ai talk store upserts active global and pet-pack memories conservatively', () => {
  const storePath = createTempStorePath()
  const store = createAiTalkStore({ storePath, now: () => '2026-06-20T00:00:00.000Z' })

  const created = store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1', 'm2'],
    operations: [
      {
        operation: 'create',
        scope: 'global',
        text: 'User prefers concise Chinese replies.',
        tags: ['preference'],
        confidence: 0.9,
        importance: 0.7,
        reason: 'stable preference'
      },
      {
        operation: 'create',
        scope: 'petPack',
        text: 'Mochi and the user like sleepy check-ins.',
        tags: ['relationship'],
        confidence: 0.8,
        importance: 0.6,
        reason: 'relationship cue'
      }
    ]
  })

  assert.equal(created.applied.length, 2)
  const memories = store.listMemories({ petPackId: 'mochi-cat' })
  assert.deepEqual(memories.map((memory) => memory.text), [
    'User prefers concise Chinese replies.',
    'Mochi and the user like sleepy check-ins.'
  ])

  const reinforced = store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m3'],
    operations: [
      {
        operation: 'reinforce',
        scope: 'global',
        text: 'User prefers concise Chinese replies.',
        tags: ['preference'],
        confidence: 0.95,
        importance: 0.8,
        reason: 'repeated preference'
      }
    ]
  })

  assert.equal(reinforced.applied[0].operation, 'reinforce')
  assert.equal(store.listMemories({ petPackId: 'mochi-cat' })[0].useCount, 1)

  const reloaded = createAiTalkStore({ storePath })
  assert.equal(reloaded.listMemories({ petPackId: 'mochi-cat' }).length, 2)
})

test('ai talk store marks injected memories as used without changing inactive memories', () => {
  const storePath = createTempStorePath()
  let currentNow = '2026-06-20T00:00:00.000Z'
  const store = createAiTalkStore({ storePath, now: () => currentNow })

  const created = store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      { operation: 'create', scope: 'global', text: 'User likes focus sprints.', tags: ['focus'], confidence: 0.8, importance: 0.7 },
      { operation: 'create', scope: 'petPack', text: 'Mochi uses soft check-ins.', tags: ['relationship'], confidence: 0.8, importance: 0.6 }
    ]
  })
  const usedId = created.applied[0].id
  const deletedId = created.applied[1].id
  store.deleteMemory(deletedId)

  currentNow = '2026-06-20T00:05:00.000Z'
  const result = store.markMemoriesUsed([usedId, usedId, deletedId, 'missing'])

  assert.equal(result.updatedCount, 1)
  assert.equal(result.memories[0].id, usedId)
  assert.equal(result.memories[0].useCount, 1)
  assert.equal(result.memories[0].lastUsedAt, '2026-06-20T00:05:00.000Z')
  assert.equal(store.getState().memories[deletedId].useCount, 0)
  assert.equal(createAiTalkStore({ storePath }).getState().memories[usedId].useCount, 1)
})

test('ai talk store soft deletes a memory and excludes it from active lists', () => {
  const storePath = createTempStorePath()
  const store = createAiTalkStore({ storePath, now: () => '2026-06-20T00:00:00.000Z' })
  const result = store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      { operation: 'create', scope: 'global', text: 'User likes quiet morning planning.', tags: ['preference'], confidence: 0.8, importance: 0.7, reason: 'stable preference' }
    ]
  })
  const memoryId = result.applied[0].id

  const deleted = store.deleteMemory(memoryId)

  assert.equal(deleted.id, memoryId)
  assert.equal(deleted.status, 'deleted')
  assert.equal(store.listMemories({ petPackId: 'mochi-cat' }).length, 0)
  assert.equal(store.getState().memories[memoryId].status, 'deleted')
  assert.equal(createAiTalkStore({ storePath }).listMemories({ petPackId: 'mochi-cat' }).length, 0)
})

test('ai talk store clears only active memories for the requested pet pack', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })
  store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      { operation: 'create', scope: 'global', text: 'User prefers concise replies.', confidence: 0.8, importance: 0.7 },
      { operation: 'create', scope: 'petPack', text: 'Mochi remembers quiet starts.', confidence: 0.7, importance: 0.6 }
    ]
  })
  store.applyMemoryOperations({
    petPackId: 'sprout-cat',
    conversationId: 'control-center:sprout-cat:main',
    messageIds: ['m2'],
    operations: [
      { operation: 'create', scope: 'petPack', text: 'Sprout remembers upbeat breaks.', confidence: 0.7, importance: 0.6 }
    ]
  })

  const result = store.clearPetPackMemories('mochi-cat')

  assert.deepEqual(result, { petPackId: 'mochi-cat', deletedCount: 1 })
  assert.deepEqual(store.listMemories({ petPackId: 'mochi-cat' }).map((memory) => memory.text), ['User prefers concise replies.'])
  assert.deepEqual(store.listMemories({ petPackId: 'sprout-cat' }).map((memory) => memory.text), [
    'User prefers concise replies.',
    'Sprout remembers upbeat breaks.'
  ])
})

test('ai talk store filters sensitive memory candidates without storing raw secret text', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })

  const result = store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      {
        operation: 'create',
        scope: 'global',
        text: 'My API key is sk-cpa-should-not-be-saved.',
        tags: ['secret'],
        confidence: 1,
        importance: 1,
        reason: 'contains secret'
      }
    ]
  })

  assert.equal(result.applied.length, 0)
  assert.equal(result.filtered.length, 1)
  assert.equal(result.filtered[0].reason, 'sensitive')
  assert.equal(store.listMemories({ petPackId: 'mochi-cat' }).length, 0)
  assert.ok(!JSON.stringify(store.getState()).includes('sk-cpa-should-not-be-saved'))
  assert.deepEqual(Object.values(store.getState().traces).map((trace) => trace.filteredMemoryCandidates), [
    [{ operation: 'create', scope: 'global', reason: 'sensitive' }]
  ])
})

test('ai talk store migrates legacy conversation only when target main conversation is empty', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })

  const migrated = store.migrateLegacyConversation({
    petPackId: 'legacy-cat',
    personaHash: 'persona-hash',
    messages: [
      { role: 'user', content: 'legacy hello' },
      { role: 'assistant', content: 'legacy reply' }
    ]
  })
  const skipped = store.migrateLegacyConversation({
    petPackId: 'legacy-cat',
    personaHash: 'persona-hash',
    messages: [
      { role: 'user', content: 'should not overwrite' }
    ]
  })

  assert.equal(migrated.migrated, true)
  assert.equal(migrated.messageCount, 2)
  assert.equal(skipped.migrated, false)
  assert.equal(skipped.reason, 'target conversation already has messages')
  assert.deepEqual(store.getMessages('control-center:legacy-cat', 'main').map((message) => message.content), [
    'legacy hello',
    'legacy reply'
  ])
})

test('ai talk store exports redacted trace diagnostics without raw message or memory text', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })
  const { sessionId, conversationId } = store.ensureMainConversation({ petPackId: 'mochi-cat', personaHash: 'hash-a' })
  store.appendMessages(sessionId, conversationId, [
    { role: 'user', content: 'secret chat phrase sk-cpa-raw-message' },
    { role: 'assistant', content: 'assistant raw reply' }
  ])
  store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      { operation: 'create', scope: 'global', text: 'User likes trace-safe exports.', tags: ['trace'], confidence: 0.8, importance: 0.7 }
    ]
  })

  const exported = JSON.parse(store.exportTraceDiagnostics({
    provider: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8317/v1',
      model: 'gpt-5.5',
      hasApiKey: true,
      memory: { enabled: true },
      behavior: { enabled: true }
    },
    behaviorDecisions: [
      {
        id: 1,
        timestamp: '2026-06-20T00:00:00.000Z',
        matched: true,
        type: 'playAction',
        reason: 'matched provider actionId',
        actionId: 'wave',
        replay: { reply: 'raw behavior replay text' }
      }
    ]
  }))
  const raw = JSON.stringify(exported)

  assert.equal(exported.provider.hasApiKey, true)
  assert.equal(exported.conversations[0].messageCount, 2)
  assert.equal(exported.conversations[0].messages[0].contentChars, 'secret chat phrase sk-cpa-raw-message'.length)
  assert.equal(exported.memories[0].textChars, 'User likes trace-safe exports.'.length)
  assert.equal(exported.behaviorDecisions[0].replayRedacted, true)
  assert.equal(raw.includes('secret chat phrase'), false)
  assert.equal(raw.includes('assistant raw reply'), false)
  assert.equal(raw.includes('User likes trace-safe exports.'), false)
  assert.equal(raw.includes('raw behavior replay text'), false)
})

test('ai talk store can filter trace diagnostics by pet pack and conversation id', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })
  const mochiMain = store.ensureMainConversation({ entrypoint: 'control-center', petPackId: 'mochi-cat', personaHash: 'hash-a' })
  const sproutMain = store.ensureMainConversation({ entrypoint: 'control-center', petPackId: 'sprout-cat', personaHash: 'hash-b' })

  store.appendMessages(mochiMain.sessionId, mochiMain.conversationId, [
    { role: 'user', content: 'mochi user message' },
    { role: 'assistant', content: 'mochi reply' }
  ])
  store.appendMessages(sproutMain.sessionId, sproutMain.conversationId, [
    { role: 'user', content: 'sprout user message' },
    { role: 'assistant', content: 'sprout reply' }
  ])

  store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      { operation: 'create', scope: 'petPack', text: 'Mochi memory', tags: ['relationship'], confidence: 0.8, importance: 0.7 }
    ]
  })
  store.applyMemoryOperations({
    petPackId: 'sprout-cat',
    conversationId: 'control-center:sprout-cat:main',
    messageIds: ['m2'],
    operations: [
      { operation: 'create', scope: 'petPack', text: 'Sprout memory', tags: ['relationship'], confidence: 0.8, importance: 0.7 }
    ]
  })
  const mochiJob = store.createMemoryJob({ petPackId: 'mochi-cat', conversationId: 'control-center:mochi-cat:main' })
  store.finishMemoryJob(mochiJob.id, { status: 'completed', appliedCount: 1, filteredCount: 0 })
  const sproutJob = store.createMemoryJob({ petPackId: 'sprout-cat', conversationId: 'control-center:sprout-cat:main' })
  store.finishMemoryJob(sproutJob.id, { status: 'completed', appliedCount: 1, filteredCount: 0 })

  const mochiOnly = JSON.parse(store.exportTraceDiagnostics({
    provider: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8317/v1',
      model: 'gpt-5.5',
      hasApiKey: true,
      memory: { enabled: true },
      behavior: { enabled: true }
    },
    filters: {
      petPackId: 'mochi-cat'
    },
    behaviorDecisions: [
      { id: 1, timestamp: '2026-06-20T00:00:00.000Z', matched: true, reason: 'mochi matched', actionId: 'wave', replay: { reply: 'hidden' } },
      { id: 2, timestamp: '2026-06-20T00:00:01.000Z', matched: true, reason: 'sprout matched', actionId: 'sleep', replay: { reply: 'hidden' } }
    ]
  }))

  assert.deepEqual(mochiOnly.conversations.map((entry) => entry.petPackId), ['mochi-cat'])
  assert.deepEqual(mochiOnly.memories.map((entry) => entry.petPackId), ['mochi-cat'])
  assert.deepEqual(mochiOnly.memoryJobs.map((entry) => entry.petPackId), ['mochi-cat'])
  assert.deepEqual(mochiOnly.traces.map((entry) => entry.petPackId), [])

  const sproutConversationOnly = JSON.parse(store.exportTraceDiagnostics({
    provider: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8317/v1',
      model: 'gpt-5.5',
      hasApiKey: true,
      memory: { enabled: true },
      behavior: { enabled: true }
    },
    filters: {
      conversationId: 'control-center:sprout-cat:main'
    },
    behaviorDecisions: []
  }))

  assert.deepEqual(sproutConversationOnly.conversations.map((entry) => entry.conversationId), ['control-center:sprout-cat:main'])
  assert.deepEqual(sproutConversationOnly.memories.map((entry) => entry.conversationId), ['control-center:sprout-cat:main'])
  assert.deepEqual(sproutConversationOnly.memoryJobs.map((entry) => entry.conversationId), ['control-center:sprout-cat:main'])
})

test('ai talk store records and lists redacted chat traces by pet pack', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })

  store.recordTrace({
    id: 'trace-a',
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    provider: 'openai-compatible',
    model: 'gpt-5.5',
    messagesCount: 4,
    memoryIdsInjected: ['memory:1', 'memory:2'],
    replyChars: 48,
    hasBehaviorIntent: true,
    behaviorIntentIntent: 'comfort'
  })
  store.recordTrace({
    id: 'trace-b',
    petPackId: 'sprout-cat',
    conversationId: 'control-center:sprout-cat:main',
    provider: 'openai-compatible',
    model: 'gpt-5.5',
    success: false,
    errorCode: 'provider_http_500',
    providerStatus: 500,
    createdAt: '2026-06-20T00:00:01.000Z'
  })

  const traces = store.listTraces({ petPackId: 'mochi-cat', limit: 10 })

  assert.equal(traces.length, 1)
  assert.equal(traces[0].id, 'trace-a')
  assert.deepEqual(traces[0].memoryIdsInjected, ['memory:1', 'memory:2'])
  assert.equal(traces[0].behaviorIntentIntent, 'comfort')
  assert.equal(traces[0].success, true)
  assert.equal(JSON.stringify(traces).includes('prompt'), false)
  const tracesByPetPack = store.listTraces({ petPackId: 'sprout-cat', limit: 10 })

  assert.equal(tracesByPetPack.length, 1)
  assert.equal(tracesByPetPack[0].requestId, '')
})

test('ai talk store excludes non-chat traces from default trace export listing', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })

  store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      {
        operation: 'create',
        scope: 'global',
        text: 'API key sk-cpa-should-not-be-saved',
        reason: 'sensitive'
      }
    ]
  })
  store.recordTrace({
    id: 'trace-chat',
    type: 'ai-talk-chat',
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    provider: 'openai-compatible',
    model: 'gpt-5.5',
    success: true
  })

  const defaultTraces = store.listTraces({ petPackId: 'mochi-cat', limit: 10 })
  const memoryFilterTraces = store.listTraces({ petPackId: 'mochi-cat', type: 'ai-talk-memory-filter', limit: 10 })

  assert.deepEqual(defaultTraces.map((trace) => trace.id), ['trace-chat'])
  assert.equal(memoryFilterTraces.length, 1)
  assert.equal(memoryFilterTraces[0].type, 'ai-talk-memory-filter')
  assert.equal(JSON.stringify(memoryFilterTraces).includes('sk-cpa-should-not-be-saved'), false)
})
