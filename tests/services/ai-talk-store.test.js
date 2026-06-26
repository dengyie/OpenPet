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

test('ai talk store marks injected memories as used', () => {
  let currentTime = '2026-06-20T00:00:00.000Z'
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => currentTime })
  const created = store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      { operation: 'create', scope: 'global', text: 'User prefers concise replies.', confidence: 0.8, importance: 0.7 },
      { operation: 'create', scope: 'petPack', text: 'Mochi helps with focus sessions.', tags: ['focus'], confidence: 0.7, importance: 0.8 }
    ]
  })
  const memoryIds = created.applied.map((item) => item.id)
  currentTime = '2026-06-20T00:05:00.000Z'

  const updated = store.markMemoriesUsed(memoryIds)

  assert.equal(updated.length, 2)
  const memories = store.listMemories({ petPackId: 'mochi-cat', limit: 0 })
  assert.deepEqual(memories.map((memory) => memory.lastUsedAt), ['2026-06-20T00:05:00.000Z', '2026-06-20T00:05:00.000Z'])
  assert.deepEqual(memories.map((memory) => memory.useCount), [1, 1])
})

test('ai talk store exports redacted traces without prompts, secrets, or raw memory text', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })

  const trace = store.recordChatTrace({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    provider: {
      provider: 'openai-compatible',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.example.test/v1',
      hasBehaviorIntent: true
    },
    request: {
      entrypoint: 'control-center',
      messageChars: 18,
      historyCount: 2,
      messagesCount: 4,
      systemPrompt: 'secret system prompt',
      userMessage: 'my api key is sk-test-should-not-leak'
    },
    response: {
      replyChars: 42,
      assistantReply: 'assistant reply should not be exported'
    },
    memory: {
      injected: [{
        id: 'memory-1',
        scope: 'global',
        text: 'User secret preference text should not leak.',
        tags: ['focus'],
        useCount: 3
      }],
      applied: [{ id: 'memory-2', operation: 'create', scope: 'petPack' }],
      filtered: [{ operation: 'create', scope: 'global', reason: 'sensitive' }]
    }
  })

  store.attachBehaviorTrace(trace.id, {
    matched: true,
    type: 'playAction',
    actionId: 'wave',
    ruleId: 'rule-1',
    reason: 'matched rule rule-1',
    intent: 'greeting'
  })

  const exported = JSON.parse(store.exportTraces())

  assert.equal(exported.schemaVersion, 1)
  assert.equal(exported.traces.length, 1)
  assert.equal(exported.traces[0].conversationId, 'control-center:mochi-cat:main')
  assert.equal(exported.traces[0].provider.model, 'gpt-4o-mini')
  assert.equal(exported.traces[0].memory.injected[0].textRedacted, true)
  assert.equal(exported.traces[0].memory.injected[0].scope, 'global')
  assert.equal(exported.traces[0].memory.applied[0].operation, 'create')
  assert.equal(exported.traces[0].behavior.actionId, 'wave')
  const serialized = JSON.stringify(exported)
  assert.equal(serialized.includes('secret system prompt'), false)
  assert.equal(serialized.includes('assistant reply should not be exported'), false)
  assert.equal(serialized.includes('User secret preference text should not leak.'), false)
  assert.equal(serialized.includes('sk-test-should-not-leak'), false)
})

test('ai talk store migrates legacy control-center conversation only when the new store is empty', () => {
  const storePath = createTempStorePath()
  const store = createAiTalkStore({
    storePath,
    now: () => '2026-06-20T00:00:00.000Z',
    legacyConversationMigration: {
      petPackId: 'sprout-cat',
      conversations: {
        'control-center': [
          { role: 'user', content: ' Hi legacy ' },
          { role: 'assistant', content: 'Hello legacy' }
        ]
      }
    }
  })

  assert.deepEqual(store.getMessages('control-center:sprout-cat', 'main').map((message) => message.content), [
    'Hi legacy',
    'Hello legacy'
  ])
  assert.deepEqual(store.getMigrationSummary(), {
    migrated: true,
    sourceConversationId: 'control-center',
    targetConversationId: 'control-center:sprout-cat:main',
    migratedMessageCount: 2
  })
})

test('ai talk store does not migrate legacy control-center conversation when new store already has messages', () => {
  const storePath = createTempStorePath()
  const store = createAiTalkStore({ storePath, now: () => '2026-06-20T00:00:00.000Z' })
  const mainConversation = store.ensureMainConversation({ entrypoint: 'control-center', petPackId: 'legacy-cat', personaHash: 'hash-a' })
  store.appendMessages(mainConversation.sessionId, mainConversation.conversationId, [
    { role: 'user', content: 'new store message' }
  ])

  const reloaded = createAiTalkStore({
    storePath,
    now: () => '2026-06-20T00:10:00.000Z',
    legacyConversationMigration: {
      petPackId: 'sprout-cat',
      conversations: {
        'control-center': [
          { role: 'user', content: 'legacy user' },
          { role: 'assistant', content: 'legacy assistant' }
        ]
      }
    }
  })

  assert.deepEqual(reloaded.getMessages('control-center:legacy-cat', 'main').map((message) => message.content), ['new store message'])
  assert.deepEqual(reloaded.getMessages('control-center:sprout-cat', 'main'), [])
  assert.deepEqual(reloaded.getMigrationSummary(), {
    migrated: false,
    sourceConversationId: 'control-center',
    targetConversationId: '',
    migratedMessageCount: 0
  })
})
