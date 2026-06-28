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

const waitForRequestCount = async (requests, count) => {
  for (let index = 0; index < 20; index += 1) {
    if (requests.length >= count) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error(`Timed out waiting for ${count} AI requests`)
}

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

test('ai talk service rejects oversized chat messages before provider calls', async () => {
  let providerCalls = 0
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false, useTools: true } }),
      complete: async () => {
        providerCalls += 1
        return { reply: 'provider should not be called' }
      }
    },
    aiTalkStore: createStore(),
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })

  await assert.rejects(
    () => service.chat({ message: 'x'.repeat(4001) }),
    /AI chat message is too long/
  )
  assert.equal(providerCalls, 0)
})

test('ai talk service serializes concurrent messages for the same main conversation', async () => {
  const requests = []
  let releaseFirst
  const firstCanFinish = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false, useTools: true } }),
      complete: async (request) => {
        requests.push(request)
        const userMessage = request.messages.at(-1).content
        if (userMessage === 'first') {
          await firstCanFinish
          return { reply: 'reply one' }
        }
        return { reply: 'reply two' }
      }
    },
    aiTalkStore: createStore(),
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })

  const first = service.chat({ message: 'first' })
  await waitForRequestCount(requests, 1)
  const second = service.chat({ message: 'second' })
  await new Promise((resolve) => setImmediate(resolve))
  releaseFirst()
  await Promise.all([first, second])

  assert.deepEqual(requests[1].messages.map((message) => message.content), [
    requests[1].messages[0].content,
    'first',
    'reply one',
    'second'
  ])
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

test('ai talk service injects recent pet activity without polluting transcript or memory extraction', async () => {
  const requests = []
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        memory: { enabled: true },
        behavior: { enabled: false, useTools: true }
      }),
      complete: async (request) => {
        requests.push(request)
        return requests.length === 1
          ? { reply: 'I noticed the weather ping.' }
          : { reply: '{"memories":[{"operation":"ignore"}]}' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'legacy-cat' }),
    petUtteranceLogService: {
      listRecent: () => [
        {
          id: 'u1',
          petPackId: 'legacy-cat',
          text: '今天可能会下雨',
          source: 'plugin:weather',
          ttlMs: 1800,
          createdAt: '2026-06-24T00:00:00.000Z'
        }
      ]
    }
  })

  const result = await service.chat({ message: '它刚才说什么？' })
  await service.flushMemoryJobs()

  assert.equal(result.reply, 'I noticed the weather ping.')
  assert.match(requests[0].messages[1].content, /Recent pet activity outside the main chat/)
  assert.match(requests[0].messages[1].content, /\[plugin:weather\] 今天可能会下雨/)
  assert.deepEqual(store.getMessages('control-center:legacy-cat', 'main').map((message) => message.content), [
    '它刚才说什么？',
    'I noticed the weather ping.'
  ])
  assert.equal(JSON.stringify(store.getMessages('control-center:legacy-cat', 'main')).includes('今天可能会下雨'), false)
  assert.equal(requests[1].messages.some((message) => message.content.includes('今天可能会下雨')), false)
})

test('ai talk service records chat lifecycle diagnostics without prompt text', async () => {
  const logs = []
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false, useTools: true } }),
      complete: async () => ({ reply: 'Purr.' })
    },
    aiTalkStore: createStore(),
    petPackService: createPetPackService({ id: 'legacy-cat' }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const result = await service.chat({ message: 'secret chat text' })

  const serializedLogs = JSON.stringify(logs)
  assert.equal(result.reply, 'Purr.')
  assert.match(serializedLogs, /ai-talk\.chat\.started/)
  assert.match(serializedLogs, /ai-talk\.chat\.completed/)
  assert.equal(serializedLogs.includes('secret chat text'), false)
  assert.equal(logs.at(-1).details.conversationId, 'control-center:legacy-cat:main')
  assert.equal(logs.at(-1).details.persistedMessageCount, 2)
})

test('ai talk service records failed chat diagnostics without prompt text', async () => {
  const logs = []
  const providerError = new Error('provider echoed hidden prompt')
  providerError.providerStatus = 500
  providerError.providerCode = 'server_error'
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false, useTools: true } }),
      complete: async () => {
        throw providerError
      }
    },
    aiTalkStore: createStore(),
    petPackService: createPetPackService({ id: 'legacy-cat' }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  await assert.rejects(
    () => service.chat({ message: 'hidden prompt' }),
    /provider echoed hidden prompt/
  )

  const serializedLogs = JSON.stringify(logs)
  assert.match(serializedLogs, /ai-talk\.chat\.failed/)
  assert.equal(serializedLogs.includes('hidden prompt'), false)
  assert.equal(serializedLogs.includes('provider echoed hidden prompt'), false)
  assert.equal(logs.at(-1).details.providerStatus, 500)
  assert.equal(logs.at(-1).details.providerCode, 'server_error')
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

test('ai talk service exposes current pet persona profile with compiled prompts', async () => {
  const store = createStore()
  store.savePersonaOverride('mochi-cat', {
    tone: 'sleepy and affectionate',
    boundaries: ['Stay gentle.', 'Do not invent actions.']
  })
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        systemPrompt: 'Always answer in concise Chinese.',
        behavior: { enabled: false, useTools: true }
      }),
      complete: async () => ({ reply: 'ignored' })
    },
    aiTalkStore: store,
    petPackService: createPetPackService({
      id: 'mochi-cat',
      displayName: 'Mochi Cat',
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

  const profile = service.getPersonaProfile()

  assert.equal(profile.petPackId, 'mochi-cat')
  assert.equal(profile.petPackDisplayName, 'Mochi Cat')
  assert.equal(profile.packPersona.tone, 'warm')
  assert.equal(profile.overridePersona.tone, 'sleepy and affectionate')
  assert.equal(profile.effectivePersona.tone, 'sleepy and affectionate')
  assert.deepEqual(profile.effectivePersona.boundaries, ['Stay gentle.', 'Do not invent actions.'])
  assert.match(profile.compiledPersonaPrompt, /Tone: sleepy and affectionate/)
  assert.match(profile.compiledSystemPrompt, /# Global Instructions/)
  assert.match(profile.compiledSystemPrompt, /Always answer in concise Chinese\./)
})

test('ai talk service saves persona override for the active pet pack and returns updated profile', async () => {
  let activePackId = 'legacy-cat'
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false, useTools: true } }),
      complete: async () => ({ reply: 'ignored' })
    },
    aiTalkStore: store,
    petPackService: {
      getActivePetPack: () => ({
        manifest: {
          id: activePackId,
          displayName: activePackId === 'legacy-cat' ? 'Legacy Cat' : 'Sprout Cat',
          persona: {
            name: activePackId === 'legacy-cat' ? 'Legacy' : 'Sprout',
            identity: 'A desktop pet.',
            tone: 'warm',
            coreTraits: ['friendly'],
            speakingStyle: 'Short replies.',
            relationshipToUser: 'Companion.',
            actionStyle: 'Use existing actions.',
            boundaries: ['Do not pretend to be human.']
          },
          actions: []
        }
      })
    }
  })

  const legacyProfile = service.savePersonaOverride({ tone: 'calm', coreTraits: ['steady'] })
  activePackId = 'sprout-cat'
  const sproutProfile = service.savePersonaOverride({ tone: 'bouncy' })

  assert.equal(legacyProfile.petPackId, 'legacy-cat')
  assert.equal(legacyProfile.overridePersona.tone, 'calm')
  assert.deepEqual(store.getPersonaOverride('legacy-cat'), { tone: 'calm', coreTraits: ['steady'] })
  assert.equal(sproutProfile.petPackId, 'sprout-cat')
  assert.equal(sproutProfile.overridePersona.tone, 'bouncy')
  assert.deepEqual(store.getPersonaOverride('sprout-cat'), { tone: 'bouncy' })
})

test('ai talk service generates persona draft without persisting override', async () => {
  const requests = []
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false, useTools: true } }),
      complete: async (request) => {
        requests.push(request)
        return {
          reply: '```json\n{"persona":{"tone":"brisk and encouraging","coreTraits":["focused","bright"],"boundaries":["Do not invent unavailable actions."]}}\n```'
        }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({
      id: 'mochi-cat',
      displayName: 'Mochi Cat',
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

  const draft = await service.generatePersonaDraft({ instruction: '更适合专注工作' })

  assert.equal(draft.petPackId, 'mochi-cat')
  assert.equal(draft.petPackDisplayName, 'Mochi Cat')
  assert.equal(draft.draftPersona.tone, 'brisk and encouraging')
  assert.deepEqual(draft.draftPersona.coreTraits, ['focused', 'bright'])
  assert.match(draft.compiledPersonaPrompt, /Tone: brisk and encouraging/)
  assert.match(requests[0].messages[0].content, /strict JSON/)
  assert.match(requests[0].messages[1].content, /更适合专注工作/)
  assert.deepEqual(store.getPersonaOverride('mochi-cat'), {})
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

test('ai talk service exposes and manages memory profile without reinjecting deleted memories', async () => {
  const requests = []
  const logs = []
  const store = createStore()
  const created = store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      { operation: 'create', scope: 'global', text: 'User likes quiet morning planning.', tags: ['preference'], confidence: 0.8, importance: 0.7, reason: 'stable preference' },
      { operation: 'create', scope: 'petPack', text: 'Mochi checks in softly before focus work.', tags: ['relationship'], confidence: 0.7, importance: 0.6, reason: 'relationship cue' }
    ]
  })
  const globalMemoryId = created.applied.find((memory) => memory.scope === 'global').id
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        behavior: { enabled: false, useTools: true },
        memory: { enabled: false }
      }),
      complete: async (request) => {
        requests.push(request)
        return { reply: '轻轻陪你。' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat', displayName: 'Mochi Cat' }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const profile = service.getMemoryProfile()
  const afterDeleteProfile = service.deleteMemory(globalMemoryId)
  await service.chat({ message: '准备开始工作' })
  const afterClearProfile = service.clearPetPackMemories()
  await service.chat({ message: '再开始一次' })

  assert.equal(profile.petPackDisplayName, 'Mochi Cat')
  assert.deepEqual(profile.globalMemories.map((memory) => memory.text), ['User likes quiet morning planning.'])
  assert.deepEqual(profile.petPackMemories.map((memory) => memory.text), ['Mochi checks in softly before focus work.'])
  assert.deepEqual(afterDeleteProfile.globalMemories, [])
  assert.deepEqual(afterDeleteProfile.petPackMemories.map((memory) => memory.text), ['Mochi checks in softly before focus work.'])
  assert.doesNotMatch(JSON.stringify(requests[0].messages), /User likes quiet morning planning/)
  assert.match(JSON.stringify(requests[0].messages), /Mochi checks in softly before focus work/)
  assert.deepEqual(afterClearProfile.petPackMemories, [])
  assert.doesNotMatch(JSON.stringify(requests[1].messages), /Mochi checks in softly before focus work/)
  assert.equal(JSON.stringify(logs).includes('User likes quiet morning planning'), false)
  assert.match(JSON.stringify(logs), /ai-talk\.memory\.deleted/)
  assert.match(JSON.stringify(logs), /ai-talk\.memory\.pet-pack-cleared/)
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

test('ai talk service prioritizes memories relevant to the current message over stale higher-score memories', async () => {
  const requests = []
  const store = createAiTalkStore({
    storePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ai-talk-service-ranking-')), 'ai-talk-store.json'),
    now: (() => {
      let call = 0
      return () => {
        call += 1
        return call < 5 ? '2026-06-20T00:00:00.000Z' : '2026-06-28T00:00:00.000Z'
      }
    })()
  })

  store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      {
        operation: 'create',
        scope: 'global',
        text: 'User prefers long weekend travel planning documents.',
        tags: ['travel', 'planning'],
        confidence: 0.95,
        importance: 0.95,
        reason: 'old but important'
      },
      {
        operation: 'create',
        scope: 'petPack',
        text: 'Mochi helps the user start focused coding sessions with short check-ins.',
        tags: ['coding', 'focus'],
        confidence: 0.72,
        importance: 0.62,
        reason: 'relevant to coding focus'
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
        return { reply: '开始专注吧。' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat' })
  })

  await service.chat({ message: '准备开始写代码并专注一小时' })

  assert.match(requests[0].messages[1].content, /Mochi helps the user start focused coding sessions/)
  assert.doesNotMatch(requests[0].messages[1].content, /long weekend travel planning documents/)
})

test('ai talk service updates lastUsedAt and useCount only for memories injected into the current request', async () => {
  const requests = []
  let nowCall = 0
  const store = createAiTalkStore({
    storePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ai-talk-service-usage-')), 'ai-talk-store.json'),
    now: () => {
      nowCall += 1
      return nowCall < 5 ? '2026-06-20T00:00:00.000Z' : '2026-06-28T08:30:00.000Z'
    }
  })

  const created = store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      {
        operation: 'create',
        scope: 'petPack',
        text: 'Mochi uses gentle coding check-ins before focus work.',
        tags: ['coding', 'focus'],
        confidence: 0.8,
        importance: 0.7,
        reason: 'relevant'
      },
      {
        operation: 'create',
        scope: 'global',
        text: 'User likes weekend bakery trips.',
        tags: ['weekend', 'bakery'],
        confidence: 0.9,
        importance: 0.85,
        reason: 'unrelated here'
      }
    ]
  })

  const relevantId = created.applied[0].id
  const unrelatedId = created.applied[1].id

  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        behavior: { enabled: false, useTools: true },
        memory: { enabled: false }
      }),
      complete: async (request) => {
        requests.push(request)
        return { reply: '我轻轻陪你写代码。' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat' })
  })

  await service.chat({ message: '开始今天的编码专注时间' })

  const relevant = store.getState().memories[relevantId]
  const unrelated = store.getState().memories[unrelatedId]

  assert.match(requests[0].messages[1].content, /gentle coding check-ins/)
  assert.doesNotMatch(requests[0].messages[1].content, /weekend bakery trips/)
  assert.equal(relevant.useCount, 1)
  assert.equal(relevant.lastUsedAt, '2026-06-28T08:30:00.000Z')
  assert.equal(unrelated.useCount, 0)
  assert.equal(unrelated.lastUsedAt, '')
})

test('ai talk service exports a redacted trace linking provider conversation memory and behavior summaries', async () => {
  const store = createAiTalkStore({
    storePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ai-talk-service-trace-')), 'ai-talk-store.json'),
    now: (() => {
      let call = 0
      return () => {
        call += 1
        return call < 5 ? '2026-06-20T00:00:00.000Z' : '2026-06-28T09:00:00.000Z'
      }
    })()
  })

  store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      {
        operation: 'create',
        scope: 'petPack',
        text: 'Mochi starts coding sessions with a gentle focus check-in.',
        tags: ['coding', 'focus'],
        confidence: 0.82,
        importance: 0.73,
        reason: 'relevant to coding focus'
      }
    ]
  })

  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.test/v1',
        model: 'gpt-5.5',
        systemPrompt: 'Always answer in concise Chinese.',
        memory: { enabled: true },
        behavior: { enabled: true, useTools: true }
      }),
      complete: async () => ({
        reply: '我们开始专注吧。',
        behaviorIntent: {
          intent: 'focus_start',
          actionId: 'wave',
          confidence: 0.91,
          bubbleText: '开始专注吧'
        }
      })
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat', displayName: 'Mochi Cat' })
  })

  const result = await service.chat({ message: 'secret user prompt about coding focus' })
  service.recordTraceBehaviorOutcome({
    conversationId: result.conversationId,
    behavior: {
      matched: true,
      type: 'playAction',
      actionId: 'wave',
      ruleId: 'rule:focus-wave',
      reason: 'matched rule focus-wave',
      intent: 'focus_start'
    }
  })

  const exported = JSON.parse(service.exportTrace({ conversationId: result.conversationId }))
  const serialized = JSON.stringify(exported)

  assert.equal(exported.trace.conversation.conversationId, 'control-center:mochi-cat:main')
  assert.equal(exported.trace.provider.model, 'gpt-5.5')
  assert.equal(exported.trace.memory.injected.length, 1)
  assert.equal(exported.trace.memory.injected[0].scope, 'petPack')
  assert.equal(exported.trace.memory.used[0].useCount, 1)
  assert.equal(exported.trace.behavior.providerIntent.intent, 'focus_start')
  assert.equal(exported.trace.behavior.finalDecision.actionId, 'wave')
  assert.equal(exported.trace.result.replyChars, '我们开始专注吧。'.length)
  assert.equal(serialized.includes('secret user prompt about coding focus'), false)
  assert.equal(serialized.includes('Mochi starts coding sessions with a gentle focus check-in.'), false)
  assert.equal(serialized.includes('Always answer in concise Chinese.'), false)
})

test('ai talk service migrates legacy control-center conversation into the active pet-pack main session when the new store is empty', () => {
  const store = createStore()
  const cleared = []
  const service = createAiTalkService({
    aiService: {
      getConversation: (conversationId) => {
        if (conversationId === 'control-center') {
          return [
            { role: 'user', content: 'legacy hello' },
            { role: 'assistant', content: 'legacy reply' }
          ]
        }
        return []
      },
      clearConversation: (conversationId) => {
        cleared.push(conversationId)
        return []
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat', displayName: 'Mochi Cat' })
  })

  const messages = service.getConversation('')

  assert.deepEqual(messages.map((message) => message.content), ['legacy hello', 'legacy reply'])
  assert.deepEqual(store.getMessages('control-center:mochi-cat', 'main').map((message) => message.content), ['legacy hello', 'legacy reply'])
  assert.deepEqual(cleared, ['control-center'])
})

test('ai talk service does not migrate legacy control-center conversation when the new store already has messages', () => {
  const store = createStore()
  store.ensureMainConversation({ entrypoint: 'control-center', petPackId: 'mochi-cat', personaHash: 'hash-a' })
  store.appendMessages('control-center:mochi-cat', 'main', [
    { role: 'user', content: 'new hello' },
    { role: 'assistant', content: 'new reply' }
  ])
  const cleared = []
  const service = createAiTalkService({
    aiService: {
      getConversation: () => [
        { role: 'user', content: 'legacy hello' },
        { role: 'assistant', content: 'legacy reply' }
      ],
      clearConversation: (conversationId) => {
        cleared.push(conversationId)
        return []
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat', displayName: 'Mochi Cat' })
  })

  const messages = service.getConversation('')

  assert.deepEqual(messages.map((message) => message.content), ['new hello', 'new reply'])
  assert.deepEqual(cleared, [])
})

test('ai talk service migrates legacy control-center conversation only once and does not re-import it for another pet pack', () => {
  const store = createStore()
  let legacyConversation = [
    { role: 'user', content: 'legacy hello' },
    { role: 'assistant', content: 'legacy reply' }
  ]
  let activePackId = 'mochi-cat'
  const service = createAiTalkService({
    aiService: {
      getConversation: (conversationId) => conversationId === 'control-center' ? legacyConversation : [],
      clearConversation: (conversationId) => {
        if (conversationId === 'control-center') legacyConversation = []
        return []
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

  assert.deepEqual(service.getConversation('').map((message) => message.content), ['legacy hello', 'legacy reply'])
  activePackId = 'sprout-cat'

  assert.deepEqual(service.getConversation(''), [])
  assert.deepEqual(store.getMessages('control-center:sprout-cat', 'main'), [])
})
