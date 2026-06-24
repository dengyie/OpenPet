const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

const ipcPath = require.resolve('../../src/main/ipc')
const { IPC } = require('../../src/shared/ipc-channels')

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
    }
  })

  const state = await ipcMain.handlers.get(IPC.PET_CHAT_GET_STATE)()

  assert.equal(state.available, true)
  assert.equal(state.ai.ready, false)
  assert.equal(state.ai.reason, '请先在 Control Center 启用 AI Provider')
  assert.equal(state.ai.baseUrl, 'http://127.0.0.1:8317/v1')
  assert.deepEqual(state.petPack, { id: 'legacy-cat', displayName: 'Legacy Cat' })
  assert.deepEqual(state.messages, [{ id: 'm1', role: 'assistant', content: 'hello', createdAt: '2026-06-24T00:00:00.000Z' }])
  assert.deepEqual(conversationRequests, [''])
})

test('pet chat send uses shared control-center entrypoint and compact pet bubble', async () => {
  const prompt = 'secret phrase should not be logged'
  const longReply = 'This is a very long desktop pet reply that should remain complete in the chat panel but short inside the speech bubble.'
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

  assert.deepEqual(talkCalls, [{ message: prompt, entrypoint: 'control-center' }])
  assert.equal(result.conversationId, 'control-center:legacy-cat:main')
  assert.equal(result.reply, longReply)
  assert.deepEqual(result.state.messages, conversationMessages)
  assert.equal(sayCalls.length, 1)
  assert.equal(sayCalls[0].source, 'ai')
  assert.equal(sayCalls[0].text.length, 80)
  assert.equal(sayCalls[0].text.endsWith('...'), true)
  assert.equal(JSON.stringify(logs).includes(prompt), false)
  assert.deepEqual(logs.map((entry) => entry.event), [
    'pet-chat.message.started',
    'ai-chat.ipc.received',
    'ai-chat.ipc.completed',
    'pet-chat.message.completed'
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
