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

test('ai talk service provides current pet action candidates to behavior tool request', async () => {
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
    petPackService: createPetPackService({
      id: 'legacy-cat',
      actions: [
        { id: 'wave', label: 'Wave', kind: 'social' },
        { id: 'sleep', label: 'Sleep', kind: 'rest' }
      ]
    })
  })

  const result = await service.chat({ message: 'Hi' })

  assert.equal(requests[0].tools[0].function.name, 'openpet_behavior')
  assert.deepEqual(requests[0].tools[0].function.parameters.properties.actionId.enum, ['wave', 'sleep'])
  assert.match(requests[0].tools[0].function.parameters.properties.actionId.description, /wave: Wave/)
  assert.deepEqual(requests[0].tools[0].function.parameters.properties.displayMode.enum, ['none', 'bubble', 'action', 'event'])
  assert.deepEqual(result.behaviorIntent, { intent: 'greet', confidence: 0.8 })
})

test('ai talk service returns compact bubble segments while keeping full assistant transcript', async () => {
  const fullReply = [
    '第一句会显示在宠物气泡里。',
    '第二句仍然应该留在聊天记录里。',
    '第三句也属于完整回复。'
  ].join('\n')
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false, useTools: true } }),
      complete: async () => ({ reply: fullReply })
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })

  const result = await service.chat({ message: '说完整一点' })

  assert.equal(result.reply, fullReply)
  assert.deepEqual(store.getMessages('control-center:legacy-cat', 'main').map((message) => message.content), [
    '说完整一点',
    fullReply
  ])
  assert.deepEqual(result.bubble, {
    text: '第一句会显示在宠物气泡里。',
    segments: ['第一句会显示在宠物气泡里。', '第二句仍然应该留在聊天记录里。', '第三句也属于完整回复。'],
    displayMode: 'bubble',
    source: 'assistant-reply'
  })
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

test('ai talk service ranks memory context by current relevance and marks injected memories as used', async () => {
  const requests = []
  const store = createStore()
  const operations = []
  for (let index = 0; index < 85; index += 1) {
    operations.push({
      operation: 'create',
      scope: 'global',
      text: `User likes archive topic ${index}.`,
      tags: ['archive'],
      confidence: 1,
      importance: 1,
      reason: 'high confidence but unrelated'
    })
  }
  operations.push({
    operation: 'create',
    scope: 'global',
    text: 'User wants help with focus sprint planning.',
    tags: ['focus', 'planning'],
    confidence: 0.4,
    importance: 0.3,
    reason: 'directly relevant to focus sessions'
  })
  const created = store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations
  })
  const relevantId = created.applied.at(-1).id

  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        behavior: { enabled: false, useTools: true },
        memory: { enabled: false }
      }),
      complete: async (request) => {
        requests.push(request)
        return { reply: '我会帮你把专注冲刺拆小。' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat' })
  })

  await service.chat({ message: 'Can you help with my focus sprint plan now?' })

  const memoryPrompt = requests[0].messages.find((message) => message.content.includes('# Relevant Memories')).content
  assert.match(memoryPrompt, /^# Relevant Memories\n1\. \[global user\] User wants help with focus sprint planning/m)
  assert.equal((memoryPrompt.match(/^\d+\. /gm) || []).length, 8)
  const state = store.getState()
  assert.equal(state.memories[relevantId].useCount, 1)
  assert.equal(state.memories[relevantId].lastUsedAt, '2026-06-20T00:00:00.000Z')
  assert.ok(Object.values(state.memories).some((memory) => (
    memory.text.startsWith('User likes archive topic') && memory.useCount === 0
  )))
})

test('ai talk service ranks Chinese memory text without requiring whitespace tokenization', async () => {
  const requests = []
  const store = createStore()
  const created = store.applyMemoryOperations({
    petPackId: 'mochi-cat',
    conversationId: 'control-center:mochi-cat:main',
    messageIds: ['m1'],
    operations: [
      {
        operation: 'create',
        scope: 'global',
        text: 'User likes unrelated opera trivia.',
        tags: ['opera'],
        confidence: 1,
        importance: 1,
        reason: 'high confidence but unrelated'
      },
      {
        operation: 'create',
        scope: 'global',
        text: '用户喜欢茉莉花茶，工作前喝会更安心。',
        tags: ['茉莉花茶', 'preference'],
        confidence: 0.4,
        importance: 0.4,
        reason: 'directly relevant Chinese preference'
      }
    ]
  })
  const teaMemoryId = created.applied.at(-1).id
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        behavior: { enabled: false, useTools: true },
        memory: { enabled: false }
      }),
      complete: async (request) => {
        requests.push(request)
        return { reply: '先喝口茶，我陪你进入专注。' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat' })
  })

  await service.chat({ message: '今天想喝茉莉花茶，然后准备专注一下' })

  const memoryPrompt = requests[0].messages.find((message) => message.content.includes('# Relevant Memories')).content
  assert.match(memoryPrompt, /^# Relevant Memories\n1\. \[global user\] 用户喜欢茉莉花茶/m)
  assert.equal(store.getState().memories[teaMemoryId].useCount, 1)
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

test('ai talk service migrates legacy control-center conversation before reading current main chat', () => {
  const store = createStore()
  const logs = []
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false, useTools: true } }),
      getConversation: (conversationId) => (
        conversationId === 'control-center'
          ? [
              { role: 'user', content: 'old hello' },
              { role: 'assistant', content: 'old reply' }
            ]
          : []
      )
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'legacy-cat' }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const messages = service.getConversation('')
  const secondRead = service.getConversation('')

  assert.deepEqual(messages.map((message) => message.content), ['old hello', 'old reply'])
  assert.deepEqual(secondRead.map((message) => message.content), ['old hello', 'old reply'])
  assert.equal(logs.filter((entry) => entry.event === 'ai-talk.legacy-conversation.migrated').length, 1)
})

test('ai talk service exports redacted diagnostics with provider and behavior links', async () => {
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5',
        hasApiKey: true,
        behavior: { enabled: true, useTools: true },
        memory: { enabled: true }
      }),
      complete: async () => ({ reply: 'trace raw assistant reply' })
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })

  await service.chat({ message: 'trace raw user prompt' })
  const exported = JSON.parse(service.exportTraceDiagnostics({
    behaviorDecisions: [
      { id: 3, timestamp: '2026-06-20T00:00:00.000Z', matched: true, reason: 'matched provider actionId', actionId: 'wave', replay: { reply: 'raw replay' } }
    ]
  }))
  const raw = JSON.stringify(exported)

  assert.equal(exported.provider.model, 'gpt-5.5')
  assert.equal(exported.provider.hasApiKey, true)
  assert.equal(exported.provider.memoryEnabled, true)
  assert.equal(exported.provider.behaviorEnabled, true)
  assert.equal(exported.conversations[0].petPackId, 'legacy-cat')
  assert.equal(exported.behaviorDecisions[0].id, 3)
  assert.equal(exported.behaviorDecisions[0].replayRedacted, true)
  assert.equal(raw.includes('trace raw user prompt'), false)
  assert.equal(raw.includes('trace raw assistant reply'), false)
  assert.equal(raw.includes('raw replay'), false)
})
