const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createAiTalkStore } = require('../../src/main/services/ai-talk-store')
const { createAiTalkService } = require('../../src/main/services/ai-talk-service')

const createStore = () => createAiTalkStore({
  storePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ai-talk-service-test-')), 'ai-talk-store.json'),
  now: () => '2026-06-20T00:00:00.000Z'
})

const createPetPackService = (pack) => ({
  getActivePetPack: () => ({
    manifest: {
      id: 'legacy-cat',
      displayName: 'Legacy Cat',
      persona: null,
      actions: [],
      ...pack
    }
  })
})

test('ai talk service compiles pet pack persona into stable system prompt', async () => {
  const requests = []
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      complete: async (request) => {
        requests.push(request)
        return { reply: 'Purr.' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({
      id: 'mochi-cat',
      persona: {
        name: 'Mochi',
        identity: 'A tiny desktop cat who keeps the user company.',
        tone: 'warm',
        coreTraits: ['curious', 'gentle'],
        speakingStyle: 'Short sentences with playful cat metaphors.',
        relationshipToUser: 'Companion and work buddy.',
        actionStyle: 'Use existing pet actions only when they match the mood.',
        boundaries: ['Do not pretend to be human.']
      }
    })
  })

  const result = await service.chat({ message: 'Hi' })

  assert.equal(result.conversationId, 'control-center:mochi-cat:main')
  assert.equal(result.reply, 'Purr.')
  assert.match(requests[0].messages[0].content, /# Pet Persona/)
  assert.match(requests[0].messages[0].content, /Name: Mochi/)
  assert.match(requests[0].messages[0].content, /Core traits: curious, gentle/)
  assert.deepEqual(store.getMessages('control-center:mochi-cat', 'main').map((message) => message.content), ['Hi', 'Purr.'])
})

test('ai talk service isolates main conversation history by active pet pack', async () => {
  const requests = []
  let activePackId = 'legacy-cat'
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      complete: async (request) => {
        requests.push(request)
        return { reply: `reply for ${activePackId}` }
      }
    },
    aiTalkStore: store,
    petPackService: {
      getActivePetPack: () => ({
        manifest: {
          id: activePackId,
          displayName: activePackId,
          persona: null,
          actions: []
        }
      })
    }
  })

  await service.chat({ message: 'legacy one' })
  activePackId = 'sprout-cat'
  await service.chat({ message: 'sprout one' })
  activePackId = 'legacy-cat'
  await service.chat({ message: 'legacy two' })

  assert.deepEqual(store.getMessages('control-center:legacy-cat', 'main').map((message) => message.content), [
    'legacy one',
    'reply for legacy-cat',
    'legacy two',
    'reply for legacy-cat'
  ])
  assert.deepEqual(store.getMessages('control-center:sprout-cat', 'main').map((message) => message.content), [
    'sprout one',
    'reply for sprout-cat'
  ])
  assert.deepEqual(requests[2].messages.map((message) => message.content), [
    requests[2].messages[0].content,
    'legacy one',
    'reply for legacy-cat',
    'legacy two'
  ])
  assert.ok(!requests[2].messages.some((message) => message.content === 'sprout one'))
})

test('ai talk service rejects chat when ai config is disabled', async () => {
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: false, behavior: { enabled: false, useTools: true } }),
      complete: async () => {
        throw new Error('provider should not be called')
      }
    },
    aiTalkStore: createStore(),
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })

  await assert.rejects(
    () => service.chat({ message: 'Hi' }),
    /AI chat is disabled/
  )
})

test('ai talk service preserves existing behavior tool request when enabled', async () => {
  const requests = []
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: true, useTools: true } }),
      complete: async (request) => {
        requests.push(request)
        return { reply: 'Purr.', behaviorIntent: { intent: 'greet', confidence: 0.8 } }
      }
    },
    aiTalkStore: createStore(),
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })

  const result = await service.chat({ message: 'Hi' })

  assert.equal(requests[0].tools[0].function.name, 'openpet_behavior')
  assert.deepEqual(result.behaviorIntent, { intent: 'greet', confidence: 0.8 })
})

test('ai talk service merges local persona override from store', async () => {
  const requests = []
  const store = createStore()
  store.savePersonaOverride('mochi-cat', {
    tone: 'sleepy and affectionate',
    coreTraits: ['loyal', 'soft-spoken']
  })
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false, useTools: true } }),
      complete: async (request) => {
        requests.push(request)
        return { reply: 'Mrrp.' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({
      id: 'mochi-cat',
      persona: {
        name: 'Mochi',
        identity: 'A tiny desktop cat.',
        tone: 'warm',
        coreTraits: ['curious'],
        speakingStyle: 'Short sentences.',
        relationshipToUser: 'Companion.',
        actionStyle: 'Use existing actions.',
        boundaries: ['Do not pretend to be human.']
      }
    })
  })

  await service.chat({ message: 'Hi' })

  assert.match(requests[0].messages[0].content, /Tone: sleepy and affectionate/)
  assert.match(requests[0].messages[0].content, /Core traits: loyal, soft-spoken/)
})

test('ai talk service preserves existing global system prompt as stable instruction', async () => {
  const requests = []
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        systemPrompt: 'Always answer in concise Chinese.',
        behavior: { enabled: false, useTools: true }
      }),
      complete: async (request) => {
        requests.push(request)
        return { reply: '喵。' }
      }
    },
    aiTalkStore: createStore(),
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })

  await service.chat({ message: 'Hi' })

  assert.match(requests[0].messages[0].content, /# Global Instructions/)
  assert.match(requests[0].messages[0].content, /Always answer in concise Chinese\./)
  assert.match(requests[0].messages[0].content, /# Pet Persona/)
})

test('ai talk service returns reply before non-blocking memory extraction completes', async () => {
  const requests = []
  let finishExtraction
  const extractionStarted = new Promise((resolve) => {
    finishExtraction = resolve
  })
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        behavior: { enabled: false, useTools: true },
        memory: { enabled: true }
      }),
      complete: async (request) => {
        requests.push(request)
        if (requests.length === 1) return { reply: '我记住啦。' }
        await extractionStarted
        return {
          reply: JSON.stringify({
            memories: [
              {
                operation: 'create',
                scope: 'global',
                text: 'User likes jasmine tea.',
                tags: ['preference'],
                confidence: 0.8,
                importance: 0.5,
                reason: 'user stated preference'
              }
            ]
          })
        }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })

  const result = await service.chat({ message: '我喜欢茉莉花茶' })

  assert.equal(result.reply, '我记住啦。')
  assert.equal(store.listMemories({ petPackId: 'legacy-cat' }).length, 0)
  finishExtraction()
  await service.flushMemoryJobs()
  assert.deepEqual(store.listMemories({ petPackId: 'legacy-cat' }).map((memory) => memory.text), ['User likes jasmine tea.'])
})

test('ai talk service injects relevant memories as dynamic context without changing persona prompt', async () => {
  const requests = []
  const store = createStore()
  store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      {
        operation: 'create',
        scope: 'global',
        text: 'User prefers concise Chinese replies.',
        tags: ['preference'],
        confidence: 0.9,
        importance: 0.8,
        reason: 'stable preference'
      },
      {
        operation: 'create',
        scope: 'petPack',
        text: 'Mochi greets the user softly before focus work.',
        tags: ['relationship', 'focus'],
        confidence: 0.8,
        importance: 0.7,
        reason: 'relationship cue'
      }
    ]
  })
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        behavior: { enabled: false, useTools: true },
        memory: { enabled: false }
      }),
      complete: async (request) => {
        requests.push(request)
        return { reply: '短短地陪你。' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat' })
  })

  await service.chat({ message: '准备专注一下' })

  assert.match(requests[0].messages[0].content, /# Pet Persona/)
  assert.doesNotMatch(requests[0].messages[0].content, /User prefers concise Chinese replies/)
  assert.match(requests[0].messages[1].content, /# Relevant Memories/)
  assert.match(requests[0].messages[1].content, /User prefers concise Chinese replies/)
  assert.match(requests[0].messages[1].content, /Mochi greets the user softly/)
})

test('ai talk service accepts fenced json memory extraction replies', async () => {
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        behavior: { enabled: false, useTools: true },
        memory: { enabled: true }
      }),
      complete: async (request) => {
        if (request.messages[0].content.includes('Extract only durable')) {
          return {
            reply: '```json\n{"memories":[{"operation":"create","scope":"global","text":"User likes quiet focus music.","tags":["preference"],"confidence":0.8,"importance":0.6,"reason":"stable preference"}]}\n```'
          }
        }
        return { reply: '轻轻陪你专注。' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })

  await service.chat({ message: '我喜欢安静的专注音乐' })
  await service.flushMemoryJobs()

  assert.deepEqual(store.listMemories({ petPackId: 'legacy-cat' }).map((memory) => memory.text), ['User likes quiet focus music.'])
})
