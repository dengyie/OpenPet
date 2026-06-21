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
