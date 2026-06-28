const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

const ipcPath = require.resolve('../../src/main/ipc')
const { IPC } = require('../../src/shared/ipc-channels')
const { createEventBus } = require('../../src/main/services/event-bus')
const { createPetService } = require('../../src/main/services/pet-service')

const loadIpcWithElectron = (electronStub) => {
  delete require.cache[ipcPath]
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return electronStub
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(ipcPath)
  } finally {
    Module._load = originalLoad
  }
}

const createIpcMainStub = () => {
  const handlers = new Map()
  const listeners = new Map()
  return {
    handlers,
    listeners,
    handle(channel, handler) {
      handlers.set(channel, handler)
    },
    on(channel, handler) {
      listeners.set(channel, handler)
    }
  }
}

const createRequiredServices = (overrides = {}) => ({
  getPetWindow: () => null,
  petService: {
    onSay: () => {},
    onAction: () => {},
    onEvent: () => {},
    getAnimations: () => ({ actions: [] }),
    getPreviewAnimations: () => ({ actions: [] }),
    reloadAnimations: () => ({ actions: [] }),
    getSettings: () => ({ localHttp: {}, menuPosition: 'auto' }),
    saveSettings: (settings) => settings,
    say: (payload) => payload,
    playAction: (payload) => payload,
    setEvent: (payload) => payload
  },
  petPackService: {},
  aiService: {
    getConfig: () => ({ enabled: false, hasApiKey: false }),
    getConversation: () => [],
    chat: async () => ({ reply: 'ok' })
  },
  behaviorOrchestratorService: {
    getConfig: () => ({ enabled: false }),
    saveConfig: (config) => config,
    dryRun: () => ({ matched: false }),
    replayDecision: () => ({ matched: false }),
    exportDiagnostics: () => ({}),
    clearDecisions: () => ({ ok: true })
  },
  localHttpService: {
    getStatus: () => ({ enabled: false, host: '127.0.0.1', port: 0, mcp: { activeSessions: 0, sessionTtlMs: 0 } })
  },
  createSettingsWindow: () => {},
  appLogService: { record: () => {} },
  ...overrides
})

const registerPetChatHandlers = (services) => {
  const ipcMain = createIpcMainStub()
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: { fromWebContents: () => null },
    app: { quit: () => {} },
    dialog: {},
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices(services),
    ipcMainService: ipcMain
  })
  return ipcMain
}

test('pet chat state exposes provider readiness and current pet-pack main conversation', async () => {
  const conversationRequests = []
  const ipcMain = registerPetChatHandlers({
    aiService: {
      getConfig: () => ({
        enabled: false,
        hasApiKey: false,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5'
      })
    },
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      getConversation: (conversationId) => {
        conversationRequests.push(conversationId)
        return [{ id: 'm1', role: 'assistant', content: 'hello', createdAt: '2026-06-24T00:00:00.000Z' }]
      }
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: true, hasWindow: true })
    },
    petBubbleChatWindowService: {
      getState: () => ({ visible: true, hasWindow: true })
    }
  })

  const state = await ipcMain.handlers.get(IPC.PET_CHAT_GET_STATE)()

  assert.equal(state.available, true)
  assert.equal(state.ai.ready, false)
  assert.equal(state.ai.reason, '请先在 Control Center 启用 AI Provider')
  assert.equal(state.ai.baseUrl, 'http://127.0.0.1:8317/v1')
  assert.deepEqual(state.petPack, { id: 'legacy-cat', displayName: 'Legacy Cat' })
  assert.deepEqual(state.bubble, { text: '', source: '', ttlMs: 0, updatedAt: '' })
  assert.deepEqual(state.bubbleChat, { visible: true, hasWindow: true })
  assert.deepEqual(state.messages, [{ id: 'm1', role: 'assistant', content: 'hello', createdAt: '2026-06-24T00:00:00.000Z' }])
  assert.deepEqual(conversationRequests, [''])
})

test('pet chat IPC returns adapter-shaped state without service-only chat fields', async () => {
  let onSayHandler = null
  const stateChangedPayloads = []
  const windowCalls = []
  const ipcMain = registerPetChatHandlers({
    petService: {
      ...createRequiredServices().petService,
      onSay: (handler) => { onSayHandler = handler }
    },
    aiService: {
      getConfig: () => ({
        enabled: true,
        hasApiKey: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5',
        apiKey: 'sk-hidden',
        rawPrompt: 'do not leak'
      })
    },
    aiTalkService: {
      getPersonaProfile: () => ({
        petPackId: 'legacy-cat',
        petPackDisplayName: 'Legacy Cat',
        rootPath: '/Users/mango/private-pack'
      }),
      getConversation: () => [
        {
          id: 'm1',
          role: 'assistant',
          content: 'safe reply',
          createdAt: '2026-06-24T00:00:00.000Z',
          metadata: { rawPrompt: 'do not leak' },
          providerRaw: { apiKey: 'sk-hidden' }
        },
        { id: 'm2', role: 'system', content: 'drop me', createdAt: '2026-06-24T00:00:01.000Z' }
      ]
    },
    petChatWindowService: {
      getState: () => ({
        available: false,
        alwaysOnTop: true,
        visible: true,
        hasWindow: true,
        hasUserBounds: true,
        bounds: { x: '10', y: '20', width: '320', height: '480', secret: 'ignore-me' },
        bridgeToken: 'secret-token',
        localPath: '/Users/mango/private-window-state'
      }),
      open: () => {
        windowCalls.push(['open'])
      },
      setAlwaysOnTop: (alwaysOnTop) => {
        windowCalls.push(['setAlwaysOnTop', alwaysOnTop])
      },
      sendStateChanged: (state) => stateChangedPayloads.push(state)
    },
    petBubbleChatWindowService: {
      getState: () => ({
        visible: true,
        hasWindow: true,
        items: [{ providerRaw: { apiKey: 'sk-hidden' } }],
        bridgeToken: 'secret-token'
      }),
      showMessage: () => ({ visible: true, hasWindow: true }),
      refreshItems: () => ({ visible: true, hasWindow: true })
    }
  })

  const state = await ipcMain.handlers.get(IPC.PET_CHAT_GET_STATE)()
  const opened = await ipcMain.handlers.get(IPC.PET_CHAT_OPEN)()
  const pinned = await ipcMain.handlers.get(IPC.PET_CHAT_SET_ALWAYS_ON_TOP)(null, { alwaysOnTop: false })
  onSayHandler({ text: 'hello', source: 'pet:event', ttlMs: 1000, bridgeToken: 'secret-token' })

  const expected = {
    available: true,
    visible: true,
    hasWindow: true,
    alwaysOnTop: true,
    hasUserBounds: true,
    conversationId: 'control-center:legacy-cat:main',
    bounds: { x: 10, y: 20, width: 320, height: 480 },
    petPack: { id: 'legacy-cat', displayName: 'Legacy Cat' },
    ai: {
      enabled: true,
      hasApiKey: true,
      ready: true,
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8317/v1',
      model: 'gpt-5.5',
      reason: ''
    },
    bubble: { text: '', source: '', ttlMs: 0, updatedAt: '' },
    bubbleChat: { visible: true, hasWindow: true },
    messages: [{ id: 'm1', role: 'assistant', content: 'safe reply', createdAt: '2026-06-24T00:00:00.000Z' }]
  }
  assert.deepEqual(state, expected)
  assert.deepEqual(opened, expected)
  assert.deepEqual(pinned, expected)
  assert.deepEqual(windowCalls, [['open'], ['setAlwaysOnTop', false]])
  assert.equal(stateChangedPayloads.length, 1)
  assert.equal(stateChangedPayloads[0].bubble.text, 'hello')
  assert.equal(stateChangedPayloads[0].available, true)
  assert.equal(JSON.stringify(stateChangedPayloads[0]).includes('secret-token'), false)
  assert.equal(JSON.stringify(stateChangedPayloads[0]).includes('/Users/mango/private'), false)
  assert.equal(JSON.stringify(state).includes('rawPrompt'), false)
  assert.equal(JSON.stringify(state).includes('sk-hidden'), false)
})

test('pet chat send uses shared control-center entrypoint and compact pet bubble', async () => {
  const prompt = 'secret phrase should not be logged'
  const longReply = 'This is a very long desktop pet reply that should remain complete in the chat panel but short inside the speech bubble.'
  const bubbleSegments = ['This is a very long desktop pet reply.', 'It should remain complete in the chat panel.']
  const talkCalls = []
  const sayCalls = []
  const logs = []
  let conversationMessages = []
  const ipcMain = registerPetChatHandlers({
    aiService: {
      getConfig: () => ({
        enabled: true,
        hasApiKey: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5'
      })
    },
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      getConversation: () => conversationMessages,
      chat: async (payload) => {
        talkCalls.push(payload)
        conversationMessages = [
          { id: 'u1', role: 'user', content: prompt, createdAt: '2026-06-24T00:00:00.000Z' },
          { id: 'a1', role: 'assistant', content: longReply, createdAt: '2026-06-24T00:00:01.000Z' }
        ]
        return {
          conversationId: 'control-center:legacy-cat:main',
          reply: longReply,
          bubbleSegments,
          messages: conversationMessages
        }
      }
    },
    petService: {
      ...createRequiredServices().petService,
      say: (payload) => {
        sayCalls.push(payload)
        return payload
      }
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: true, hasWindow: true })
    },
    appLogService: {
      record: (entry) => logs.push(entry)
    }
  })

  const result = await ipcMain.handlers.get(IPC.PET_CHAT_SEND_MESSAGE)(null, { message: prompt })

  assert.equal(talkCalls.length, 1)
  assert.equal(talkCalls[0].message, prompt)
  assert.equal(talkCalls[0].entrypoint, 'control-center')
  assert.match(talkCalls[0].requestId, /^chat-/)
  assert.equal(result.conversationId, 'control-center:legacy-cat:main')
  assert.equal(result.reply, longReply)
  assert.deepEqual(result.bubbleSegments, bubbleSegments)
  assert.deepEqual(result.state.messages, conversationMessages)
  assert.equal(result.state.bubble.text, bubbleSegments[0])
  assert.equal(result.state.bubble.source, 'ai')
  assert.equal(sayCalls.length, 1)
  assert.equal(sayCalls[0].source, 'ai')
  assert.equal(sayCalls[0].text, bubbleSegments[0])
  assert.equal(JSON.stringify(logs).includes(prompt), false)
  assert.deepEqual(logs.map((entry) => entry.event), [
    'pet-chat.message.started',
    'ai-chat.ipc.received',
    'ai-chat.bubble.dispatching',
    'ai-chat.bubble.dispatched',
    'ai-chat.ipc.completed',
    'pet-chat.message.completed'
  ])
})

test('pet chat send preserves sanitized behavior decision fields', async () => {
  const prompt = 'hello'
  const reply = 'hello back'
  const sayCalls = []
  const ipcMain = registerPetChatHandlers({
    aiService: {
      getConfig: () => ({
        enabled: true,
        hasApiKey: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5'
      })
    },
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      getConversation: () => [],
      chat: async () => ({
        conversationId: 'control-center:legacy-cat:main',
        reply,
        messages: [{ id: 'a1', role: 'assistant', content: reply, createdAt: '2026-06-24T00:00:01.000Z' }],
        rawPrompt: 'do not leak',
        providerRaw: { apiKey: 'sk-hidden' }
      })
    },
    behaviorOrchestratorService: {
      getConfig: () => ({ enabled: true }),
      evaluate: () => ({
        matched: true,
        type: 'playAction',
        actionId: 'wave',
        label: 'Wave',
        reason: 'Greeting intent matched.',
        ruleId: 'greeting-wave',
        intent: 'greeting',
        displayMode: 'action',
        replay: { reply: 'raw replay', behaviorIntent: { rawPrompt: 'do not leak' } },
        providerRaw: { apiKey: 'sk-hidden' },
        internal: { result: 'do not leak' }
      })
    },
    petService: {
      ...createRequiredServices().petService,
      say: (payload) => {
        sayCalls.push(payload)
        return payload
      },
      playAction: (payload) => ({ ...payload, played: true, rawPrompt: 'do not leak' })
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: true, hasWindow: true })
    }
  })

  const result = await ipcMain.handlers.get(IPC.PET_CHAT_SEND_MESSAGE)(null, { message: prompt })

  assert.equal(result.behavior.actionId, 'wave')
  assert.equal(result.behavior.displayMode, 'action')
  assert.equal(result.behavior.reason, 'Greeting intent matched.')
  assert.equal(result.action.actionId, 'wave')
  assert.equal(sayCalls[0].text, reply)
  assert.equal(JSON.stringify(result).includes('replay'), false)
  assert.equal(JSON.stringify(result).includes('rawPrompt'), false)
  assert.equal(JSON.stringify(result).includes('sk-hidden'), false)
  assert.equal(JSON.stringify(result).includes('internal'), false)
})

test('pet chat send emits through PetService so the floating bubble window is displayed', async () => {
  const prompt = 'hello'
  const reply = 'Floating bubble reply should be visible above the desktop pet.'
  const bubbleChatMessages = []
  const sentToPetWindow = []
  const eventBus = createEventBus()
  const settingsService = {
    get: () => ({ localHttp: {}, menuPosition: 'auto', petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }),
    save: (settings) => settings,
    preview: (settings) => settings
  }
  const actionService = {
    getConfig: () => ({ actions: [] }),
    getPreviewConfig: () => ({ actions: [] }),
    getAction: () => null,
    reload: () => ({ actions: [] })
  }
  const petService = createPetService({ eventBus, settingsService, actionService })
  const ipcMain = registerPetChatHandlers({
    getPetWindow: () => ({
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => sentToPetWindow.push({ channel, payload })
      }
    }),
    aiService: {
      getConfig: () => ({
        enabled: true,
        hasApiKey: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5'
      })
    },
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      getConversation: () => [],
      chat: async () => ({
        conversationId: 'control-center:legacy-cat:main',
        reply,
        messages: [{ id: 'a1', role: 'assistant', content: reply, createdAt: '2026-06-24T00:00:01.000Z' }]
      })
    },
    petService,
    petPackService: {
      getActivePack: () => ({ id: 'legacy-cat', displayName: 'Legacy Cat' })
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: true, hasWindow: true })
    },
    petBubbleChatWindowService: {
      showMessage: (payload) => {
        bubbleChatMessages.push(payload)
        return { visible: true, hasWindow: true, message: payload }
      },
      syncToPetWindow: () => ({ visible: true, hasWindow: true })
    }
  })

  const result = await ipcMain.handlers.get(IPC.PET_CHAT_SEND_MESSAGE)(null, { message: prompt })

  assert.equal(result.bubble.text, reply)
  assert.equal(bubbleChatMessages.length, 1)
  assert.equal(bubbleChatMessages[0].text, reply)
  assert.equal(bubbleChatMessages[0].source, 'ai')
  assert.equal(bubbleChatMessages[0].petPackId, 'legacy-cat')
  assert.equal(sentToPetWindow.length, 0)
})

test('pet chat state tracks latest pet bubble from say events', async () => {
  let onSayHandler = null
  const sentToPetWindow = []
  const utterances = []
  const bubbleChatMessages = []
  const refreshCalls = []
  const conversationMessages = [
    { id: 'u1', role: 'user', content: '你好', createdAt: '2026-06-24T00:00:00.000Z' },
    { id: 'a1', role: 'assistant', content: '在呢', createdAt: '2026-06-24T00:00:01.000Z' }
  ]
  const ipcMain = registerPetChatHandlers({
    getPetWindow: () => ({
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => sentToPetWindow.push({ channel, payload })
      }
    }),
    petService: {
      ...createRequiredServices().petService,
      onSay: (handler) => { onSayHandler = handler }
    },
    aiTalkService: {
      getConversation: () => conversationMessages,
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' })
    },
    petPackService: {
      getActivePetPack: () => ({ manifest: { id: 'legacy-cat' } })
    },
    petUtteranceLogService: {
      record: (payload) => {
        utterances.push(payload)
        return payload
      }
    },
    petBubbleChatWindowService: {
      showMessage: (payload) => {
        bubbleChatMessages.push(payload)
        return { visible: true }
      },
      refreshItems: (payload) => {
        refreshCalls.push(payload)
        return { visible: true, items: payload.conversationMessages }
      }
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: false, hasWindow: true }),
      sendStateChanged: () => {}
    }
  })

  onSayHandler({ text: '刚刚打了个招呼', ttlMs: 1800, source: 'pet:event' })
  const state = await ipcMain.handlers.get(IPC.PET_CHAT_GET_STATE)()

  assert.equal(state.bubble.text, '刚刚打了个招呼')
  assert.equal(state.bubble.source, 'pet:event')
  assert.equal(state.bubble.ttlMs, 1800)
  assert.equal(sentToPetWindow.length, 0)
  assert.deepEqual(bubbleChatMessages, [{
    text: '刚刚打了个招呼',
    ttlMs: 1800,
    source: 'pet:event',
    petPackId: 'legacy-cat'
  }])
  assert.deepEqual(utterances, [{
    petPackId: 'legacy-cat',
    text: '刚刚打了个招呼',
    source: 'pet:event',
    ttlMs: 1800
  }])
  assert.deepEqual(refreshCalls, [{ conversationMessages, reason: 'pet-say' }])
})

test('pet chat does not record ai say events as pet utterances while still showing bubble chat', async () => {
  let onSayHandler = null
  const utterances = []
  const bubbleChatMessages = []
  const ipcMain = registerPetChatHandlers({
    petService: {
      ...createRequiredServices().petService,
      onSay: (handler) => { onSayHandler = handler }
    },
    petPackService: {
      getActivePetPack: () => ({ manifest: { id: 'legacy-cat' } })
    },
    petUtteranceLogService: {
      record: (payload) => {
        utterances.push(payload)
        return payload
      }
    },
    petBubbleChatWindowService: {
      showMessage: (payload) => {
        bubbleChatMessages.push(payload)
        return { visible: true }
      },
      refreshItems: () => ({ visible: true })
    }
  })

  onSayHandler({ text: '正式回复', ttlMs: 2000, source: 'ai' })

  assert.deepEqual(utterances, [])
  assert.deepEqual(bubbleChatMessages, [{
    text: '正式回复',
    ttlMs: 2000,
    source: 'ai',
    petPackId: 'legacy-cat'
  }])
  const state = await ipcMain.handlers.get(IPC.PET_CHAT_GET_STATE)()
  assert.equal(state.bubble.text, '正式回复')
})

test('pet bubble chat IPC delegates state, open, local message, hide, pin and interaction updates', async () => {
  const calls = []
  const conversationMessages = [
    { id: 'u1', role: 'user', content: '旧消息', createdAt: '2026-06-24T00:00:00.000Z' }
  ]
  const ipcMain = registerPetChatHandlers({
    petPackService: {
      getActivePetPack: () => ({ manifest: { id: 'legacy-cat' } })
    },
    aiTalkService: {
      getConversation: () => conversationMessages,
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' })
    },
    petBubbleChatWindowService: {
      getState: () => ({ visible: true, pinned: false }),
      hide: (payload) => {
        calls.push(['hide', payload])
      },
      open: (payload) => {
        calls.push(['open', payload])
        return { visible: true, opened: true }
      },
      setPinned: (pinned, meta) => {
        calls.push(['pinned', pinned, meta])
        return { visible: true, pinned }
      },
      setInteracting: (interacting, meta) => {
        calls.push(['interacting', interacting, meta])
        return { visible: true, interacting }
      },
      setHitTestMode: (payload) => {
        calls.push(['hitTest', payload])
        return { visible: true, hitTestInteractive: payload.interactive }
      },
      showMessage: (payload) => {
        calls.push(['showMessage', payload])
        return { visible: true, message: payload }
      },
      refreshItems: (payload) => {
        calls.push(['refreshItems', payload])
        return { visible: true, refreshed: true, items: payload.conversationMessages }
      }
    }
  })

  assert.deepEqual(await ipcMain.handlers.get(IPC.PET_BUBBLE_CHAT_GET_STATE)(), { visible: true, pinned: false })
  ipcMain.listeners.get(IPC.PET_BUBBLE_CHAT_HIDE)()
  assert.deepEqual(await ipcMain.handlers.get(IPC.PET_BUBBLE_CHAT_OPEN)(), { visible: true, opened: true })
  assert.deepEqual(await ipcMain.handlers.get(IPC.PET_BUBBLE_CHAT_SET_PINNED)(null, { pinned: true }), { visible: true, pinned: true })
  assert.deepEqual(await ipcMain.handlers.get(IPC.PET_BUBBLE_CHAT_SET_INTERACTING)(null, { interacting: true }), { visible: true, interacting: true })
  assert.deepEqual(await ipcMain.handlers.get(IPC.PET_BUBBLE_CHAT_SET_HIT_TEST_MODE)(null, { interactive: false, source: 'test-idle' }), { visible: true, hitTestInteractive: false })
  assert.deepEqual(await ipcMain.handlers.get(IPC.PET_BUBBLE_CHAT_SHOW_MESSAGE)(null, { text: '本地轻量消息', ttlMs: 800 }), {
    visible: true,
    refreshed: true,
    items: conversationMessages
  })
  assert.deepEqual(calls, [
    ['hide', { source: 'pet-bubble-chat-renderer' }],
    ['open', { source: 'pet-renderer', focus: true }],
    ['pinned', true, { source: 'pet-bubble-chat-renderer' }],
    ['interacting', true, { source: 'pet-bubble-chat-renderer' }],
    ['hitTest', { interactive: false, source: 'test-idle' }],
    ['showMessage', {
      text: '本地轻量消息',
      ttlMs: 800,
      source: 'pet-renderer',
      petPackId: 'legacy-cat'
    }],
    ['refreshItems', {
      conversationMessages,
      reason: 'local-show-message'
    }]
  ])
})

test('pet bubble chat re-syncs to pet window on viewport and movement updates so popup tracks pet actions', async () => {
  let viewportHandler = null
  let setPositionHandler = null
  let moveByHandler = null
  let dragEndedHandler = null
  let onActionHandler = null
  const syncCalls = []
  const savedSettings = []
  const win = {
    getBounds: () => ({ x: 320, y: 280, width: 120, height: 120 }),
    getPosition: () => [320, 280],
    setPosition: () => {},
    webContents: {},
    isDestroyed: () => false
  }
  const ipcMain = createIpcMainStub()
  const { registerIpcHandlers } = loadIpcWithElectron({
    ipcMain,
    BrowserWindow: { fromWebContents: () => win },
    app: { quit: () => {} },
    dialog: {},
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })

  registerIpcHandlers({
    ...createRequiredServices({
      petService: {
        ...createRequiredServices().petService,
        onAction: (handler) => { onActionHandler = handler },
        getSettings: () => ({
          localHttp: {},
          menuPosition: 'auto',
          petBehavior: {
            grounded: false,
            home: { enabled: true, radius: 'medium', anchor: null }
          }
        }),
        saveSettings: (settings) => {
          savedSettings.push(settings)
          return settings
        }
      },
      petBubbleChatWindowService: {
        syncToPetWindow: () => {
          syncCalls.push('sync')
        }
      },
      applyPetViewport: () => {},
      clampToWorkArea: (_win, x, y) => ({ x, y }),
      getMovementState: () => ({}),
      petMovementPolicy: {
        clampDragPosition: ({ requestedTopLeft }) => requestedTopLeft,
        clampMoveBy: ({ windowBounds, delta }) => ({
          x: windowBounds.x + delta.x,
          y: windowBounds.y + delta.y
        }),
        normalizePetBehaviorSettings: (settings) => settings,
        createHomeAnchorFromWindow: () => ({ x: 0.5, y: 1 })
      }
    }),
    browserWindowService: { fromWebContents: () => win },
    ipcMainService: ipcMain
  })

  viewportHandler = ipcMain.listeners.get(IPC.PET_SET_VIEWPORT)
  setPositionHandler = ipcMain.listeners.get(IPC.PET_SET_POSITION)
  moveByHandler = ipcMain.handlers.get(IPC.PET_MOVE_BY)
  dragEndedHandler = ipcMain.listeners.get(IPC.PET_DRAG_ENDED)

  viewportHandler({ sender: {} }, { width: 180, height: 200 })
  setPositionHandler({ sender: {} }, { x: 400, y: 420 })
  await moveByHandler({ sender: {} }, { x: 6, y: -4 })
  dragEndedHandler({ sender: {} })
  onActionHandler({ actionId: 'wave', source: 'test' })

  assert.equal(syncCalls.length, 5)
  assert.equal(savedSettings.length, 1)
  assert.deepEqual(savedSettings[0].petBehavior.home.anchor, { x: 0.5, y: 1 })
})

test('pet bubble chat send reuses shared AI Talk conversation and updates popup state', async () => {
  const prompt = 'bubble secret prompt'
  const reply = 'bubble reply'
  const bubbleSegments = ['bubble reply', 'follow up']
  const talkCalls = []
  const popupStates = []
  const refreshCalls = []
  const logs = []
  let conversationMessages = []
  const ipcMain = registerPetChatHandlers({
    aiService: {
      getConfig: () => ({
        enabled: true,
        hasApiKey: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5'
      })
    },
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      getConversation: () => conversationMessages,
      chat: async (payload) => {
        talkCalls.push(payload)
        conversationMessages = [
          { id: 'u1', role: 'user', content: prompt, createdAt: '2026-06-24T00:00:00.000Z' },
          { id: 'a1', role: 'assistant', content: reply, createdAt: '2026-06-24T00:00:01.000Z' }
        ]
        return {
          conversationId: 'control-center:legacy-cat:main',
          reply,
          bubbleSegments,
          messages: conversationMessages,
          providerLatencyMs: 820
        }
      }
    },
    petBubbleChatWindowService: {
      setSendingState: (state) => {
        popupStates.push(state)
        return { visible: true, ...state }
      },
      showMessage: () => ({ visible: true }),
      refreshItems: (payload) => {
        refreshCalls.push(payload)
        return { visible: true, refreshed: true, items: payload.conversationMessages }
      }
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: false, hasWindow: true }),
      sendStateChanged: () => {}
    },
    appLogService: {
      record: (entry) => logs.push(entry)
    }
  })

  const result = await ipcMain.handlers.get(IPC.PET_BUBBLE_CHAT_SEND_MESSAGE)(null, { message: prompt })

  assert.equal(talkCalls.length, 1)
  assert.equal(talkCalls[0].message, prompt)
  assert.equal(talkCalls[0].entrypoint, 'control-center')
  assert.match(talkCalls[0].requestId, /^chat-/)
  assert.equal(result.conversationId, 'control-center:legacy-cat:main')
  assert.equal(result.reply, reply)
  assert.deepEqual(result.bubbleSegments, bubbleSegments)
  assert.deepEqual(result.state, {
    visible: true,
    refreshed: true,
    items: conversationMessages
  })
  assert.deepEqual(popupStates, [
    { sending: true, lastUserMessage: { text: prompt } },
    { sending: false, lastUserMessage: { text: prompt }, error: '' }
  ])
  assert.deepEqual(refreshCalls, [{ conversationMessages, reason: 'bubble-chat-send' }])
  assert.equal(JSON.stringify(logs).includes(prompt), false)
  assert.deepEqual(logs.map((entry) => entry.event), [
    'pet-bubble-chat.message.started',
    'ai-chat.ipc.received',
    'ai-chat.bubble.dispatching',
    'ai-chat.bubble.dispatched',
    'ai-chat.ipc.completed',
    'pet-bubble-chat.message.completed'
  ])
  const requestIds = logs.map((entry) => entry.details?.requestId).filter(Boolean)
  assert.equal(requestIds.length >= 4, true)
  assert.equal(new Set(requestIds).size, 1)
  const completionLog = logs.find((entry) => entry.event === 'pet-bubble-chat.message.completed')
  assert.equal(completionLog.details?.providerLatencyMs, 820)
})

test('pet chat send refreshes bubble chat items from the shared main conversation', async () => {
  const prompt = 'hello from full chat'
  const reply = 'reply visible in mini stream'
  const refreshCalls = []
  let conversationMessages = []
  const ipcMain = registerPetChatHandlers({
    aiService: {
      getConfig: () => ({
        enabled: true,
        hasApiKey: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5'
      })
    },
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      getConversation: () => conversationMessages,
      chat: async () => {
        conversationMessages = [
          { id: 'u1', role: 'user', content: prompt, createdAt: '2026-06-24T00:00:00.000Z' },
          { id: 'a1', role: 'assistant', content: reply, createdAt: '2026-06-24T00:00:01.000Z' }
        ]
        return {
          conversationId: 'control-center:legacy-cat:main',
          reply,
          messages: conversationMessages
        }
      }
    },
    petBubbleChatWindowService: {
      showMessage: () => ({ visible: true }),
      refreshItems: (payload) => {
        refreshCalls.push(payload)
        return { visible: true, items: payload.conversationMessages }
      }
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: true, hasWindow: true }),
      sendStateChanged: () => {}
    }
  })

  const result = await ipcMain.handlers.get(IPC.PET_CHAT_SEND_MESSAGE)(null, { message: prompt })

  assert.equal(result.reply, reply)
  assert.deepEqual(refreshCalls, [
    { conversationMessages, reason: 'pet-chat-send' }
  ])
})

test('pet bubble chat send records recoverable popup error without provider call when not ready', async () => {
  const popupStates = []
  const logs = []
  let chatCalls = 0
  const ipcMain = registerPetChatHandlers({
    aiService: {
      getConfig: () => ({ enabled: true, hasApiKey: false })
    },
    aiTalkService: {
      getConversation: () => [],
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      chat: async () => {
        chatCalls += 1
        return { reply: 'should not happen' }
      }
    },
    petBubbleChatWindowService: {
      setSendingState: (state) => {
        popupStates.push(state)
        return { visible: true, ...state }
      }
    },
    appLogService: {
      record: (entry) => logs.push(entry)
    }
  })

  await assert.rejects(
    () => ipcMain.handlers.get(IPC.PET_BUBBLE_CHAT_SEND_MESSAGE)(null, { message: 'hi' }),
    /保存 AI API Key/
  )

  assert.equal(chatCalls, 0)
  assert.deepEqual(popupStates, [{
    sending: false,
    lastUserMessage: { text: 'hi' },
    error: '请先在 Control Center 保存 AI API Key'
  }])
  assert.deepEqual(logs.map((entry) => entry.event), [
    'pet-bubble-chat.message.started',
    'pet-bubble-chat.message.failed'
  ])
})

test('pet chat send stops before provider call when chat provider is not ready', async () => {
  let chatCalls = 0
  const logs = []
  const ipcMain = registerPetChatHandlers({
    aiService: {
      getConfig: () => ({ enabled: true, hasApiKey: false }),
      chat: async () => {
        chatCalls += 1
        return { reply: 'should not happen' }
      }
    },
    aiTalkService: {
      getConversation: () => [],
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      chat: async () => {
        chatCalls += 1
        return { reply: 'should not happen' }
      }
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: true, hasWindow: true })
    },
    appLogService: {
      record: (entry) => logs.push(entry)
    }
  })

  await assert.rejects(
    () => ipcMain.handlers.get(IPC.PET_CHAT_SEND_MESSAGE)(null, { message: 'hi' }),
    /保存 AI API Key/
  )

  assert.equal(chatCalls, 0)
  assert.deepEqual(logs.map((entry) => entry.event), [
    'pet-chat.message.started',
    'pet-chat.message.failed'
  ])
})

test('pet pack activation notifies control center and desktop chat with refreshed AI talk state', async () => {
  const rendererEvents = []
  const desktopStates = []
  const ipcMain = registerPetChatHandlers({
    petPackService: {
      setActivePack: (packId) => ({ activePackId: packId, pack: { id: packId, displayName: 'Mochi Cat' } }),
      listPacks: () => ({
        activePackId: 'mochi-cat',
        packs: [{ id: 'mochi-cat', displayName: 'Mochi Cat', active: true }]
      })
    },
    aiService: {
      getConfig: () => ({
        enabled: true,
        hasApiKey: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5'
      })
    },
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'mochi-cat', petPackDisplayName: 'Mochi Cat' }),
      getConversation: () => [{ role: 'assistant', content: 'mochi hello' }]
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: true, hasWindow: true }),
      sendStateChanged: (state) => desktopStates.push(state)
    }
  })
  const event = {
    sender: {
      send: (channel, payload) => rendererEvents.push({ channel, payload })
    }
  }

  const result = await ipcMain.handlers.get(IPC.PET_PACKS_SET_ACTIVE)(event, { packId: 'mochi-cat' })

  assert.equal(result.activePackId, 'mochi-cat')
  assert.equal(desktopStates.length, 1)
  assert.equal(desktopStates[0].petPack.id, 'mochi-cat')
  assert.deepEqual(rendererEvents.map((entry) => entry.channel), [IPC.PET_PACKS_ACTIVE_CHANGED])
  assert.equal(rendererEvents[0].payload.activePackId, 'mochi-cat')
  assert.equal(rendererEvents[0].payload.petChatState.petPack.displayName, 'Mochi Cat')
})

test('ai talk trace export IPC includes behavior decisions through ai talk service', async () => {
  const exportCalls = []
  const ipcMain = registerPetChatHandlers({
    aiTalkService: {
      getConversation: () => [],
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      exportTraceDiagnostics: (payload) => {
        exportCalls.push(payload)
        return JSON.stringify({ ok: true, behaviorCount: payload.behaviorDecisions.length })
      }
    },
    behaviorOrchestratorService: {
      ...createRequiredServices().behaviorOrchestratorService,
      getConfig: () => ({
        decisions: [
          { id: 7, timestamp: '2026-06-20T00:00:00.000Z', matched: true, reason: 'matched provider actionId' }
        ]
      })
    }
  })

  const exported = JSON.parse(await ipcMain.handlers.get(IPC.AI_EXPORT_TRACE_DIAGNOSTICS)())

  assert.deepEqual(exported, { ok: true, behaviorCount: 1 })
  assert.equal(exportCalls[0].behaviorDecisions[0].id, 7)
})
