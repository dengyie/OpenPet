const test = require('node:test')
const assert = require('node:assert/strict')

const { IPC } = require('../../src/shared/ipc-channels')
const { createPetChatFacade } = require('../../src/main/ipc/pet-chat-facade')

test('pet chat facade builds current chat state from AI, full chat, bubble chat, and active pet pack profile', () => {
  const conversationRequests = []
  const facade = createPetChatFacade({
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
      getConversation: (conversationId) => {
        conversationRequests.push(conversationId)
        return [
          { id: 'skip-system', role: 'system', content: 'hidden' },
          { id: 'u1', role: 'user', content: 'hello', createdAt: '2026-06-24T00:00:00.000Z' },
          { id: 'a1', role: 'assistant', content: 'hi', createdAt: '2026-06-24T00:00:01.000Z' }
        ]
      }
    },
    petChatWindowService: {
      getState: () => ({ alwaysOnTop: true, visible: true, hasWindow: true })
    },
    petBubbleChatWindowService: {
      getState: () => ({ visible: true, hasWindow: true, pinned: true, placement: 'above' })
    }
  })

  facade.captureBubble({ text: '最新气泡', source: 'pet:event', ttlMs: 1200 }, { notify: false })
  const state = facade.getState()

  assert.equal(state.available, true)
  assert.equal(state.conversationId, 'control-center:mochi-cat:main')
  assert.deepEqual(state.petPack, { id: 'mochi-cat', displayName: 'Mochi Cat' })
  assert.deepEqual(state.ai, {
    enabled: true,
    hasApiKey: true,
    ready: true,
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:8317/v1',
    model: 'gpt-5.5',
    reason: ''
  })
  assert.equal(state.bubble.text, '最新气泡')
  assert.equal(state.bubble.source, 'pet:event')
  assert.equal(state.bubble.ttlMs, 1200)
  assert.deepEqual(state.bubbleChat, { visible: true, hasWindow: true, pinned: true, placement: 'above' })
  assert.deepEqual(state.messages, [
    { id: 'u1', role: 'user', content: 'hello', createdAt: '2026-06-24T00:00:00.000Z' },
    { id: 'a1', role: 'assistant', content: 'hi', createdAt: '2026-06-24T00:00:01.000Z' }
  ])
  assert.deepEqual(conversationRequests, [''])
})

test('pet chat facade broadcasts active pet pack changes and refreshes pet-pack scoped chat state', () => {
  const controlCenterWindowMessages = []
  const settingsWindowMessages = []
  const desktopStates = []
  const bubbleRefreshes = []
  const facade = createPetChatFacade({
    getPetWindow: () => ({
      settingsWindow: {
        isDestroyed: () => false,
        webContents: {
          send: (...args) => settingsWindowMessages.push(args)
        }
      }
    }),
    browserWindowService: {
      getAllWindows: () => [{
        isDestroyed: () => false,
        webContents: {
          getURL: () => 'app://-/control-center/index.html',
          send: (...args) => controlCenterWindowMessages.push(args)
        }
      }]
    },
    petPackService: {
      listPacks: () => ({
        activePackId: 'doro',
        packs: [{ id: 'doro', displayName: 'Doro', active: true }]
      })
    },
    aiService: {
      getConfig: () => ({ enabled: true, hasApiKey: true })
    },
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'doro', petPackDisplayName: 'Doro' }),
      getConversation: () => [{ id: 'a1', role: 'assistant', content: 'hello from doro' }]
    },
    petChatWindowService: {
      getState: () => ({ visible: true, hasWindow: true }),
      sendStateChanged: (state) => desktopStates.push(state)
    },
    petBubbleChatWindowService: {
      getState: () => ({ visible: false, hasWindow: true }),
      rebuildItems: (payload) => {
        bubbleRefreshes.push(payload)
        return { visible: false, hasWindow: true }
      }
    },
    sendToControlCenterWindow: (getPetWindow, channel, payload) => {
      const petWindow = getPetWindow()
      petWindow.settingsWindow.webContents.send(channel, payload)
    }
  })

  const payload = facade.broadcastActivePetPackChanged({ source: 'pet-packs:set-active' })

  assert.equal(payload.activePackId, 'doro')
  assert.deepEqual(controlCenterWindowMessages, [
    [IPC.PET_PACKS_ACTIVE_CHANGED, { activePackId: 'doro' }]
  ])
  assert.deepEqual(settingsWindowMessages.map(([channel, message]) => [channel, message.activePackId]), [
    [IPC.CONTROL_CENTER_ACTIVE_PET_PACK_CHANGED, 'doro']
  ])
  assert.equal(desktopStates.length, 1)
  assert.deepEqual(desktopStates[0].petPack, { id: 'doro', displayName: 'Doro' })
  assert.deepEqual(bubbleRefreshes, [{
    conversationMessages: [{ id: 'a1', role: 'assistant', content: 'hello from doro' }],
    noticeItems: [],
    reason: 'active-pet-pack-changed:pet-packs:set-active'
  }])
})

test('pet chat facade keeps bubble refresh failures from breaking the caller flow', () => {
  const logs = []
  const facade = createPetChatFacade({
    aiService: {
      getConfig: () => ({ enabled: true, hasApiKey: true })
    },
    aiTalkService: {
      getConversation: () => {
        throw new Error('conversation store unavailable')
      }
    },
    petBubbleChatWindowService: {
      getState: () => ({ visible: true, hasWindow: true, stale: true }),
      rebuildItems: () => {
        throw new Error('bubble renderer unavailable')
      }
    },
    recordAppLog: (entry) => logs.push(entry)
  })

  const result = facade.refreshBubbleChatItems({ reason: 'test-refresh' })

  assert.deepEqual(result, { visible: true, hasWindow: true, stale: true })
  assert.deepEqual(logs.map((entry) => entry.event), [
    'pet-bubble-chat.items.refresh-failed',
    'pet-bubble-chat.items.refresh-failed'
  ])
  assert.equal(logs[0].details.reason, 'test-refresh')
  assert.equal(logs[0].details.errorMessage, 'conversation store unavailable')
  assert.equal(logs[1].details.errorMessage, 'bubble renderer unavailable')
})
