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
