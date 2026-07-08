const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

const modulePath = require.resolve('../../src/main/pet-bubble-chat-window')
const { IPC } = require('../../src/shared/ipc-channels')

const loadModuleWithElectron = (electronStub) => {
  delete require.cache[modulePath]
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return electronStub
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

const createFakeBrowserWindow = () => {
  const instances = []
  class FakeBrowserWindow {
    constructor(options) {
      this.options = options
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }
      this.visible = false
      this.destroyed = false
      this.listeners = new Map()
      this.onceListeners = new Map()
      this.sent = []
      this.ignoreMouseEventsCalls = []
      this.webContents = {
        send: (channel, payload) => this.sent.push({ channel, payload })
      }
      this.setAlwaysOnTopCalls = []
      instances.push(this)
    }

    isDestroyed() { return this.destroyed }
    isVisible() { return this.visible }
    getBounds() { return this.bounds }
    setBounds(bounds) { this.bounds = { ...this.bounds, ...bounds } }
    show() { this.visible = true }
    showInactive() { this.visible = true }
    focus() { this.focused = true }
    moveTop() { this.movedTop = true }
    setAlwaysOnTop(flag, level) {
      this.alwaysOnTop = flag
      this.alwaysOnTopLevel = level
      this.setAlwaysOnTopCalls.push({ flag, level })
    }
    hide() { this.visible = false }
    loadFile() { return Promise.resolve() }
    setIgnoreMouseEvents(ignore, options) {
      this.ignoreMouseEvents = { ignore, options }
      this.ignoreMouseEventsCalls.push({ ignore, options })
    }
    setVisibleOnAllWorkspaces() {}
    on(eventName, callback) {
      this.listeners.set(eventName, callback)
    }
    once(eventName, callback) {
      this.onceListeners.set(eventName, callback)
    }
    emit(eventName, ...args) {
      this.listeners.get(eventName)?.(...args)
      const onceCallback = this.onceListeners.get(eventName)
      if (onceCallback) {
        this.onceListeners.delete(eventName)
        onceCallback(...args)
      }
    }
  }
  return { FakeBrowserWindow, instances }
}

test('calculateBubbleTtlMs scales with message length and clamps explicit ttl values', () => {
  const { calculateBubbleTtlMs } = loadModuleWithElectron({ app: { on: () => {} } })

  const empty = calculateBubbleTtlMs({ text: '' })
  const short = calculateBubbleTtlMs({ text: 'hi' })
  const long = calculateBubbleTtlMs({ text: 'x'.repeat(120) })
  const dialogueShort = calculateBubbleTtlMs({ text: 'hi', source: 'ai' })
  const clampedLow = calculateBubbleTtlMs({ text: 'hello', ttlMs: 800 })
  const clampedHigh = calculateBubbleTtlMs({ text: 'hello', ttlMs: 999999 })

  assert.equal(empty, 6000)
  assert.ok(short >= empty)
  assert.ok(long > short)
  assert.ok(dialogueShort > short)
  assert.equal(dialogueShort, 9000)
  assert.equal(clampedLow, 6000)
  assert.equal(clampedHigh, 30000)
})

test('bubble chat item helpers classify pet-side speech as dialogue and only system notices as notices', () => {
  const {
    buildBubbleChatItems,
    classifyBubbleChatKind,
    createDialogueItemsFromMessages,
    normalizeBubbleChatItem
  } = loadModuleWithElectron({ app: { on: () => {} } })

  assert.equal(classifyBubbleChatKind({ source: 'ai' }), 'dialogue')
  assert.equal(classifyBubbleChatKind({ source: 'ai:behavior' }), 'dialogue')
  assert.equal(classifyBubbleChatKind({ source: 'pet:event' }), 'dialogue')
  assert.equal(classifyBubbleChatKind({ source: 'pet-renderer' }), 'dialogue')
  assert.equal(classifyBubbleChatKind({ source: 'plugin:weather' }), 'notice')

  const aiItem = normalizeBubbleChatItem({ text: '正式回复', source: 'ai', intent: 'notice' })
  const behaviorItem = normalizeBubbleChatItem({ text: '行为编排说话', source: 'ai:behavior' })
  const petRendererItem = normalizeBubbleChatItem({ text: 'Pet 自己说话', source: 'pet-renderer' })
  const noticeItem = normalizeBubbleChatItem({ text: '插件提示', source: 'plugin:weather', intent: 'dialogue' })
  const dialogueItems = createDialogueItemsFromMessages([
    { id: 'u1', role: 'user', content: '你好', createdAt: '2026-06-24T00:00:00.000Z' },
    { id: 'a1', role: 'assistant', content: '喵', createdAt: '2026-06-24T00:00:01.000Z' }
  ])
  const items = buildBubbleChatItems({
    conversationMessages: [
      { id: 'u1', role: 'user', content: '你好', createdAt: '2026-06-24T00:00:00.000Z' },
      { id: 'a1', role: 'assistant', content: '喵', createdAt: '2026-06-24T00:00:01.000Z' }
    ],
    noticeItems: [noticeItem]
  })

  assert.equal(aiItem.kind, 'dialogue')
  assert.equal(aiItem.role, 'pet')
  assert.equal(behaviorItem.kind, 'dialogue')
  assert.equal(behaviorItem.role, 'pet')
  assert.equal(petRendererItem.kind, 'dialogue')
  assert.equal(petRendererItem.role, 'pet')
  assert.equal(noticeItem.kind, 'notice')
  assert.equal(noticeItem.role, 'system')
  assert.deepEqual(dialogueItems.map((item) => [item.kind, item.role, item.source, item.text]), [
    ['dialogue', 'user', 'user', '你好'],
    ['dialogue', 'pet', 'ai', '喵']
  ])
  assert.deepEqual(items.map((item) => [item.kind, item.role, item.text]), [
    ['dialogue', 'user', '你好'],
    ['dialogue', 'pet', '喵'],
    ['notice', 'system', '插件提示']
  ])
})

test('createDialogueItemsFromMessages keeps only the latest lightweight dialogue slice', () => {
  const { createDialogueItemsFromMessages } = loadModuleWithElectron({ app: { on: () => {} } })

  const dialogueItems = createDialogueItemsFromMessages([
    { id: 'u1', role: 'user', content: '第1句', createdAt: '2026-06-24T00:00:00.000Z' },
    { id: 'a1', role: 'assistant', content: '第2句', createdAt: '2026-06-24T00:00:01.000Z' },
    { id: 'u2', role: 'user', content: '第3句', createdAt: '2026-06-24T00:00:02.000Z' },
    { id: 'a2', role: 'assistant', content: '第4句', createdAt: '2026-06-24T00:00:03.000Z' },
    { id: 'u3', role: 'user', content: '第5句', createdAt: '2026-06-24T00:00:04.000Z' },
    { id: 'a3', role: 'assistant', content: '第6句', createdAt: '2026-06-24T00:00:05.000Z' },
    { id: 'u4', role: 'user', content: '第7句', createdAt: '2026-06-24T00:00:06.000Z' },
    { id: 'a4', role: 'assistant', content: '第8句', createdAt: '2026-06-24T00:00:07.000Z' }
  ])

  assert.deepEqual(dialogueItems.map((item) => item.text), [
    '第1句',
    '第2句',
    '第3句',
    '第4句',
    '第5句',
    '第6句',
    '第7句',
    '第8句'
  ])
})

test('resolveBubbleBounds anchors above pet and flips below when needed', () => {
  const { resolveBubbleBounds } = loadModuleWithElectron({ app: { on: () => {} } })
  const abovePetBounds = { x: 300, y: 300, width: 120, height: 120 }
  const belowPetBounds = { x: 10, y: 20, width: 120, height: 120 }

  const above = resolveBubbleBounds({
    petBounds: abovePetBounds,
    workArea: { x: 0, y: 0, width: 900, height: 700 }
  })
  const below = resolveBubbleBounds({
    petBounds: belowPetBounds,
    workArea: { x: 0, y: 0, width: 900, height: 700 }
  })

  assert.equal(above.placement, 'above')
  const aboveGap = abovePetBounds.y - (above.y + above.height)
  assert.ok(above.y > 32)
  assert.ok(aboveGap >= 0 && aboveGap <= 4)
  assert.equal(above.height, 260)
  assert.equal(below.placement, 'below')
  assert.equal(below.y, 148)
  assert.equal(below.height, 260)
  assert.ok(below.x >= 8)
})

test('resolveBubbleBounds uses side placement when vertical space would cover the pet', () => {
  const { resolveBubbleBounds } = loadModuleWithElectron({ app: { on: () => {} } })
  const petBounds = { x: 120, y: 120, width: 80, height: 120 }

  const bounds = resolveBubbleBounds({
    petBounds,
    workArea: { x: 0, y: 0, width: 700, height: 360 }
  })

  assert.equal(bounds.placement, 'right')
  assert.ok(bounds.x >= petBounds.x + petBounds.width + 4)
  assert.ok(bounds.y < petBounds.y + petBounds.height)
  assert.ok(bounds.y + bounds.height > petBounds.y)
  const oldCenteredY = petBounds.y + Math.round((petBounds.height - bounds.height) / 2)
  assert.ok(bounds.y < oldCenteredY)
})

test('pet bubble chat manager opens manually with a chat prompt even when auto popup is disabled', () => {
  const logs = []
  const petBounds = { x: 300, y: 300, width: 120, height: 120 }
  const visualTopInset = 64
  const { FakeBrowserWindow, instances } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: false, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => petBounds,
      __openPetViewport: { topInset: visualTopInset }
    }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const state = manager.open({ source: 'pet-renderer', focus: true })

  assert.equal(instances.length, 1)
  assert.equal(instances[0].visible, true)
  assert.equal(instances[0].focused, true)
  assert.deepEqual(instances[0].setAlwaysOnTopCalls.at(-1), { flag: true, level: 'pop-up-menu' })
  assert.ok(instances[0].bounds.height < 260)
  const visiblePetTop = petBounds.y + visualTopInset
  const openGap = visiblePetTop - (instances[0].bounds.y + instances[0].bounds.height)
  assert.ok(openGap >= 0 && openGap <= 4)
  assert.equal(state.visible, true)
  assert.equal(state.interacting, true)
  assert.equal(state.message.text, '想聊点什么？')
  assert.equal(state.message.kind, 'dialogue')
  assert.equal(state.message.role, 'pet')
  assert.equal(logs.some((entry) => (
    entry.event === 'pet-bubble-chat.window.open-requested' &&
    entry.details.anchorProfile === 'tight-head-anchor-v1'
  )), true)
  assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.window.opened' && entry.details.anchorProfile === 'tight-head-anchor-v1'), true)
})

test('pet bubble chat manager tracks transient streaming state without persisting dialogue', () => {
  const { FakeBrowserWindow, instances } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    }),
    appLogService: { record: () => {} }
  })

  const streaming = manager.applyStreamState({
    requestId: 'chat-stream-1',
    conversationId: 'control-center:legacy-cat:main',
    petPackId: 'legacy-cat',
    status: 'streaming',
    partialReply: 'Hel',
    chunkCount: 1,
    canCancel: true
  })

  assert.equal(instances.length, 1)
  assert.equal(instances[0].visible, true)
  assert.equal(streaming.streaming.requestId, 'chat-stream-1')
  assert.equal(streaming.streaming.partialReply, 'Hel')
  assert.equal(streaming.streaming.canCancel, true)
  assert.equal(streaming.sending, true)
  assert.equal(streaming.awaitingReply, true)
  assert.equal(streaming.items.some((item) => item.text === 'Hel'), false)
  assert.equal(instances[0].sent.at(-1).channel, IPC.PET_BUBBLE_CHAT_STATE_CHANGED)

  const completed = manager.applyStreamState({
    requestId: 'chat-stream-1',
    status: 'completed',
    partialReply: 'Hello',
    canCancel: false
  })

  assert.equal(completed.streaming.status, 'completed')
  assert.equal(completed.streaming.partialReply, 'Hello')
  assert.equal(completed.streaming.canCancel, false)
  assert.equal(completed.sending, false)
  assert.equal(completed.awaitingReply, false)
})

test('pet bubble chat manager shows latest message and auto hides when idle', () => {
  const timers = []
  const logs = []
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false }
    timers.push(timer)
    return timer
  }
  global.clearTimeout = (timer) => {
    if (timer) timer.cleared = true
  }
  try {
    const { FakeBrowserWindow, instances } = createFakeBrowserWindow()
    const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
      BrowserWindow: FakeBrowserWindow,
      app: { on: () => {} },
      screen: {
        getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
      }
    })
    const manager = createPetBubbleChatWindowManager({
      BrowserWindow: FakeBrowserWindow,
      screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
      settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
      }),
      appLogService: { record: (entry) => logs.push(entry) }
    })

    const state = manager.showMessage({ text: 'hello there', source: 'test', ttlMs: 3000 })

    assert.equal(instances.length, 1)
    assert.equal(instances[0].visible, true)
    assert.ok(instances[0].options.height < 260)
    assert.ok(instances[0].bounds.height < 260)
    assert.equal(state.message.text, 'hello there')
    assert.deepEqual(state.items.map((item) => [item.kind, item.role, item.text]), [['notice', 'system', 'hello there']])
    assert.equal(state.noticeItems.length, 1)
    assert.equal(timers.at(-1).delay, 6000)
    assert.equal(instances[0].sent.at(-1).channel, IPC.PET_BUBBLE_CHAT_STATE_CHANGED)
    assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.auto-hide.scheduled' && entry.details.ttlMs === 6000), true)

    timers.at(-1).callback()
    assert.equal(manager.getState().visible, false)
    assert.equal(instances[0].visible, false)
    assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.auto-hide.expired'), true)
    assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.window.hidden' && entry.details.reason === 'window-hidden'), true)
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})

test('pet bubble chat manager keeps ai dialogue visible longer than lightweight notices', () => {
  const timers = []
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false }
    timers.push(timer)
    return timer
  }
  global.clearTimeout = (timer) => {
    if (timer) timer.cleared = true
  }
  try {
    const { FakeBrowserWindow } = createFakeBrowserWindow()
    const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
      BrowserWindow: FakeBrowserWindow,
      app: { on: () => {} },
      screen: {
        getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
      }
    })
    const manager = createPetBubbleChatWindowManager({
      BrowserWindow: FakeBrowserWindow,
      screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
      settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
      })
    })

    manager.showMessage({ text: '天气提醒', source: 'plugin:weather' })
    const noticeTimer = timers.at(-1)
    manager.showMessage({ text: '你好呀～🐾', source: 'ai' })
    const dialogueTimer = timers.at(-1)

    assert.equal(noticeTimer.delay, 6000)
    assert.ok(dialogueTimer.delay >= 9000)
    assert.ok(dialogueTimer.delay > noticeTimer.delay)
    assert.equal(manager.getState().message.source, 'ai')
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})

test('pet bubble chat manager refreshes dialogue items from the active main conversation while keeping notices', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    })
  })

  manager.showMessage({ text: '天气插件提示', source: 'plugin:weather', createdAt: '2026-06-24T00:00:02.000Z' })
  const refreshed = manager.refreshItems({
    reason: 'test',
    conversationMessages: [
      { id: 'u1', role: 'user', content: '你好', createdAt: '2026-06-24T00:00:00.000Z' },
      { id: 'a1', role: 'assistant', content: '我在', createdAt: '2026-06-24T00:00:01.000Z' }
    ]
  })

  assert.deepEqual(refreshed.items.map((item) => [item.kind, item.role, item.text]), [
    ['dialogue', 'user', '你好'],
    ['dialogue', 'pet', '我在'],
    ['notice', 'system', '天气插件提示']
  ])
  assert.equal(refreshed.message.text, '天气插件提示')
  assert.equal(refreshed.noticeItems.length, 1)
})

test('pet bubble chat showMessage appends notices without dropping dialogue items', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    })
  })

  manager.refreshItems({
    reason: 'test',
    conversationMessages: [
      { id: 'u1', role: 'user', content: '你好', createdAt: '2026-06-24T00:00:00.000Z' },
      { id: 'a1', role: 'assistant', content: '我在', createdAt: '2026-06-24T00:00:01.000Z' }
    ]
  })
  const state = manager.showMessage({
    text: '插件提示',
    source: 'plugin:weather',
    createdAt: '2026-06-24T00:00:02.000Z'
  })

  assert.deepEqual(state.items.map((item) => [item.kind, item.role, item.text]), [
    ['dialogue', 'user', '你好'],
    ['dialogue', 'pet', '我在'],
    ['notice', 'system', '插件提示']
  ])
  assert.equal(state.noticeItems.length, 1)
})

test('pet bubble chat manager keeps pet speech in the dialogue lane while preserving only true notice overlays', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    })
  })

  manager.refreshItems({
    reason: 'dialogue-slice',
    conversationMessages: [
      { id: 'u1', role: 'user', content: '第1句', createdAt: '2026-06-24T00:00:00.000Z' },
      { id: 'a1', role: 'assistant', content: '第2句', createdAt: '2026-06-24T00:00:01.000Z' },
      { id: 'u2', role: 'user', content: '第3句', createdAt: '2026-06-24T00:00:02.000Z' },
      { id: 'a2', role: 'assistant', content: '第4句', createdAt: '2026-06-24T00:00:03.000Z' },
      { id: 'u3', role: 'user', content: '第5句', createdAt: '2026-06-24T00:00:04.000Z' },
      { id: 'a3', role: 'assistant', content: '第6句', createdAt: '2026-06-24T00:00:05.000Z' },
      { id: 'u4', role: 'user', content: '第7句', createdAt: '2026-06-24T00:00:06.000Z' },
      { id: 'a4', role: 'assistant', content: '第8句', createdAt: '2026-06-24T00:00:07.000Z' }
    ]
  })
  manager.showMessage({ text: '提示1', source: 'plugin:weather', createdAt: '2026-06-24T00:00:08.000Z' })
  manager.showMessage({ text: '提示2', source: 'plugin:mcp', createdAt: '2026-06-24T00:00:09.000Z' })
  const state = manager.showMessage({ text: '提示3', source: 'pet-renderer', createdAt: '2026-06-24T00:00:10.000Z' })

  assert.deepEqual(
    state.items.filter((item) => item.kind === 'dialogue').map((item) => item.text),
    ['第2句', '第3句', '第4句', '第5句', '第6句', '第7句', '第8句', '提示3']
  )
  assert.deepEqual(
    state.items.filter((item) => item.kind === 'notice').map((item) => item.text),
    ['提示1', '提示2']
  )
  assert.equal(state.noticeItems.length, 2)
})

test('pet bubble chat showMessage treats pet-renderer and ai behavior copy as left-side pet dialogue', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    })
  })

  manager.showMessage({ text: '思考提示', source: 'pet-renderer', createdAt: '2026-06-24T00:00:08.000Z' })
  const state = manager.showMessage({ text: '行为回复', source: 'ai:behavior', createdAt: '2026-06-24T00:00:09.000Z' })

  assert.deepEqual(
    state.items.map((item) => [item.kind, item.role, item.text]),
    [
      ['dialogue', 'pet', '思考提示'],
      ['dialogue', 'pet', '行为回复']
    ]
  )
  assert.equal(state.noticeItems.length, 0)
})

test('pet bubble chat showMessage compatibility path treats ai source as pet dialogue', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    })
  })

  const state = manager.showMessage({ text: 'AI 正式回复', source: 'ai', intent: 'notice' })

  assert.deepEqual(state.items.map((item) => [item.kind, item.role, item.source, item.text]), [
    ['dialogue', 'pet', 'ai', 'AI 正式回复']
  ])
  assert.equal(state.noticeItems.length, 0)
})

test('pet bubble chat preserves non-ai pet say dialogue in the left-side bubble stream', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    })
  })

  const state = manager.showMessage({
    text: '我先自己说一句',
    source: 'pet:event',
    kind: 'dialogue',
    role: 'pet',
    createdAt: '2026-06-24T00:00:02.000Z'
  })

  assert.deepEqual(state.items.map((item) => [item.kind, item.role, item.text]), [
    ['dialogue', 'pet', '我先自己说一句']
  ])
})

test('pet bubble chat gives agent-awareness bridge messages a user-facing Codex label', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    })
  })

  const state = manager.showMessage({
    text: '这里需要你确认：Codex needs approval.',
    source: 'plugin:openpet.agent-awareness:bridge',
    sourceSurface: 'plugin-bridge',
    kind: 'dialogue',
    role: 'pet',
    createdAt: '2026-06-24T00:00:02.000Z'
  })

  assert.deepEqual(state.items.map((item) => [item.kind, item.role, item.source, item.sourceLabel]), [
    ['dialogue', 'pet', 'plugin:openpet.agent-awareness:bridge', 'Codex']
  ])
})

test('pet bubble chat manager reuses a single window and latest message replaces prior auto-hide timer', () => {
  const timers = []
  const logs = []
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false }
    timers.push(timer)
    return timer
  }
  global.clearTimeout = (timer) => {
    if (timer) timer.cleared = true
  }
  try {
    const { FakeBrowserWindow, instances } = createFakeBrowserWindow()
    const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
      BrowserWindow: FakeBrowserWindow,
      app: { on: () => {} },
      screen: {
        getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
      }
    })
    const manager = createPetBubbleChatWindowManager({
      BrowserWindow: FakeBrowserWindow,
      screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
      settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
      }),
      appLogService: { record: (entry) => logs.push(entry) }
    })

    manager.showMessage({ text: 'first line', source: 'test', ttlMs: 6200 })
    const firstTimer = timers.at(-1)
    manager.showMessage({ text: 'second line', source: 'test', ttlMs: 7000 })

    assert.equal(instances.length, 1)
    assert.equal(firstTimer.cleared, true)
    assert.equal(timers.at(-1).delay, 7000)
    assert.equal(manager.getState().message.text, 'second line')
    assert.equal(instances[0].visible, true)
    assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.auto-hide.canceled' && entry.details.reason === 'reschedule'), true)
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})

test('pet bubble chat manager does not show when disabled and holds visible while pinned', () => {
  const timers = []
  const logs = []
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false }
    timers.push(timer)
    return timer
  }
  global.clearTimeout = (timer) => {
    if (timer) timer.cleared = true
  }
  try {
    const { FakeBrowserWindow, instances } = createFakeBrowserWindow()
    const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
      BrowserWindow: FakeBrowserWindow,
      app: { on: () => {} },
      screen: {
        getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
      }
    })
    let settings = { enabled: false, autoPopup: true, autoHide: true, pinOnInteraction: true }
    const manager = createPetBubbleChatWindowManager({
      BrowserWindow: FakeBrowserWindow,
      screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
      settingsService: { get: () => ({ petBubbleChat: settings }) },
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
      }),
      appLogService: { record: (entry) => logs.push(entry) }
    })

    manager.showMessage({ text: 'disabled' })
    assert.equal(instances.length, 0)

    settings = { enabled: true, autoPopup: true, autoHide: true, pinOnInteraction: true }
    manager.setPinned(true)
    manager.showMessage({ text: 'stay visible', ttlMs: 3000 })

    assert.equal(instances.length, 1)
    assert.equal(timers.length, 0)
    assert.equal(manager.getState().visible, true)
    assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.auto-hide.frozen' && entry.details.reason === 'pinned'), true)
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})

test('pet bubble chat manager auto-pins on interaction when pinOnInteraction is enabled and releases after idle', () => {
  const logs = []
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true, pinOnInteraction: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  manager.showMessage({ text: '可交互提示', source: 'plugin:test', ttlMs: 6000 })
  const activeState = manager.setInteracting(true, { source: 'renderer-hover' })
  const idleState = manager.setInteracting(false, { source: 'renderer-leave' })

  assert.equal(activeState.interacting, true)
  assert.equal(activeState.pinned, true)
  assert.equal(activeState.autoPinned, true)
  assert.equal(idleState.interacting, false)
  assert.equal(idleState.pinned, false)
  assert.equal(idleState.autoPinned, false)
  assert.equal(logs.some((entry) => (
    entry.event === 'pet-bubble-chat.interaction.changed' &&
    entry.details.reason === 'interaction-started-auto-pinned'
  )), true)
  assert.equal(logs.some((entry) => (
    entry.event === 'pet-bubble-chat.interaction.changed' &&
    entry.details.reason === 'interaction-ended-auto-unpinned'
  )), true)
})

test('pet bubble chat manager does not auto-pin on interaction when pinOnInteraction is disabled', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true, pinOnInteraction: false } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    })
  })

  manager.showMessage({ text: '仅交互，不自动 pin', source: 'plugin:test', ttlMs: 6000 })
  const activeState = manager.setInteracting(true, { source: 'renderer-hover' })

  assert.equal(activeState.interacting, true)
  assert.equal(activeState.pinned, false)
  assert.equal(activeState.autoPinned, false)
})

test('pet bubble chat manager clears auto-pin when explicitly unpinned', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true, pinOnInteraction: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    })
  })

  manager.showMessage({ text: '可交互提示', source: 'plugin:test', ttlMs: 6000 })
  manager.setInteracting(true, { source: 'renderer-hover' })
  const state = manager.setPinned(false, { source: 'renderer-manual-unpin' })

  assert.equal(state.pinned, false)
  assert.equal(state.autoPinned, false)
})

test('pet bubble chat manager toggles window-level hit-test passthrough', () => {
  const logs = []
  const { FakeBrowserWindow, instances } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  manager.showMessage({ text: '可穿透提示', source: 'plugin:test' })
  const passthrough = manager.setHitTestMode({ interactive: false, source: 'test-idle' })
  const interactive = manager.setHitTestMode({ interactive: true, source: 'test-hover' })

  assert.equal(instances.length, 1)
  assert.deepEqual(instances[0].ignoreMouseEventsCalls, [
    { ignore: true, options: { forward: true } },
    { ignore: false, options: undefined }
  ])
  assert.deepEqual(instances[0].ignoreMouseEvents, { ignore: false, options: undefined })
  assert.equal(passthrough.hitTestInteractive, false)
  assert.equal(interactive.hitTestInteractive, true)
  assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.hit-test.changed' && entry.details.interactive === true && entry.details.source === 'test-hover'), true)
})

test('pet bubble chat manager preserves dragged window position until pet moves, then re-anchors', () => {
  const logs = []
  let petBounds = { x: 300, y: 300, width: 120, height: 120 }
  const visualTopInset = 64
  const { FakeBrowserWindow, instances } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => petBounds,
      __openPetViewport: { topInset: visualTopInset }
    }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  manager.showMessage({ text: 'drag me', source: 'plugin:test', ttlMs: 6000 })
  const initialBounds = { ...instances[0].bounds }

  instances[0].bounds = { ...instances[0].bounds, x: initialBounds.x + 64, y: initialBounds.y + 28 }
  instances[0].emit('move')
  instances[0].bounds = { ...instances[0].bounds, x: initialBounds.x + 72, y: initialBounds.y + 36 }
  instances[0].emit('move')

  const detachedState = manager.getState()
  assert.equal(detachedState.anchorMode, 'detached-temporary')
  assert.equal(detachedState.bounds.x, initialBounds.x + 72)
  assert.equal(detachedState.bounds.y, initialBounds.y + 36)

  manager.showMessage({ text: 'still detached', source: 'plugin:test', ttlMs: 7000 })
  const afterContentRefresh = manager.getState()
  assert.equal(afterContentRefresh.anchorMode, 'detached-temporary')
  assert.equal(afterContentRefresh.bounds.x, initialBounds.x + 72)
  assert.equal(afterContentRefresh.bounds.y, initialBounds.y + 36)

  petBounds = { x: 360, y: 330, width: 120, height: 120 }
  manager.syncToPetWindow()
  const reanchoredState = manager.getState()

  assert.equal(reanchoredState.anchorMode, 'anchored')
  assert.notEqual(reanchoredState.bounds.x, initialBounds.x + 72)
  assert.notEqual(reanchoredState.bounds.y, initialBounds.y + 36)
  const visiblePetTop = petBounds.y + visualTopInset
  const reanchorGap = visiblePetTop - (reanchoredState.bounds.y + reanchoredState.bounds.height)
  assert.ok(reanchorGap >= 0 && reanchorGap <= 4)
  assert.equal(logs.filter((entry) => entry.event === 'pet-bubble-chat.window.detached').length, 1)
  assert.equal(logs.some((entry) => (
    entry.event === 'pet-bubble-chat.window.reanchored' &&
    entry.details.reason === 'pet-moved' &&
    entry.details.anchorProfile === 'tight-head-anchor-v1'
  )), true)
})

test('pet bubble chat manager anchors to the visible pet viewport instead of the full pet window top', () => {
  const visualTopInset = 64
  const petBounds = { x: 300, y: 300, width: 120, height: 176 }
  const { FakeBrowserWindow, instances } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: false, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => petBounds,
      __openPetViewport: { topInset: visualTopInset }
    }),
    appLogService: { record: () => {} }
  })

  manager.open({ source: 'pet-renderer', focus: true })

  assert.equal(instances.length, 1)
  const bubbleBounds = instances[0].bounds
  const visiblePetTop = petBounds.y + visualTopInset
  const visibleGap = visiblePetTop - (bubbleBounds.y + bubbleBounds.height)
  const rawWindowGap = petBounds.y - (bubbleBounds.y + bubbleBounds.height)
  assert.ok(visibleGap >= 0 && visibleGap <= 4)
  assert.ok(rawWindowGap < 0)
  assert.ok(Math.abs(rawWindowGap - visibleGap) >= 40)
})

test('pet bubble chat manager supports renderer-driven dragging without a toolbar region', () => {
  const { FakeBrowserWindow, instances } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    }),
    appLogService: { record: () => {} }
  })

  manager.showMessage({ text: 'drag me', source: 'plugin:test', ttlMs: 6000 })
  const state = manager.dragWindowTo({ x: 520, y: 360, source: 'renderer-drag-move' })

  assert.equal(instances.length, 1)
  assert.equal(state.anchorMode, 'detached-temporary')
  assert.equal(state.bounds.x, 520)
  assert.equal(state.bounds.y, 360)
})

test('pet bubble chat manager stays visible during sending and after a recoverable send error', () => {
  const timers = []
  const logs = []
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false }
    timers.push(timer)
    return timer
  }
  global.clearTimeout = (timer) => {
    if (timer) timer.cleared = true
  }
  try {
    const { FakeBrowserWindow } = createFakeBrowserWindow()
    const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
      BrowserWindow: FakeBrowserWindow,
      app: { on: () => {} },
      screen: {
        getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
      }
    })
    const manager = createPetBubbleChatWindowManager({
      BrowserWindow: FakeBrowserWindow,
      screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
      settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
      }),
      appLogService: { record: (entry) => logs.push(entry) }
    })

    manager.showMessage({ text: 'hello there', source: 'test', ttlMs: 3000 })
    manager.setSendingState({
      sending: true,
      lastUserMessage: { text: 'retry me' }
    })
    const afterSending = manager.getState()
    manager.setSendingState({
      sending: false,
      lastUserMessage: { text: 'retry me' },
      error: 'Temporary provider failure'
    })
    const afterError = manager.getState()

    assert.equal(afterSending.visible, true)
    assert.equal(afterSending.sending, true)
    assert.equal(afterSending.interacting, false)
    assert.equal(afterError.visible, true)
    assert.equal(afterError.sending, false)
    assert.equal(afterError.interacting, false)
    assert.equal(afterError.error, 'Temporary provider failure')
    assert.equal(timers.some((timer) => timer.cleared), true)
    assert.equal(timers.every((timer) => timer.cleared), true)
    assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.auto-hide.frozen' && entry.details.reason === 'awaiting-reply'), true)
    assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.auto-hide.frozen' && entry.details.reason === 'error'), true)
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})

test('pet bubble chat manager supports queued follow-ups and pending-merge recovery', () => {
  const logs = []
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const first = manager.queueOutgoingMessage({ text: '第一句', requestId: 'req-1' })
  const second = manager.queueOutgoingMessage({ text: '第二句', requestId: 'req-2' })

  assert.equal(first.shouldStartRequest, true)
  assert.deepEqual(first.batchMessages, ['第一句'])
  assert.equal(second.shouldStartRequest, false)
  assert.equal(manager.getState().pendingUserMessages.length, 2)
  assert.deepEqual(manager.getState().items.filter((item) => item.role === 'user').map((item) => [item.text, item.flowState]), [
    ['第一句', 'sending'],
    ['第二句', 'queued']
  ])

  manager.failRequest({ requestId: 'req-1', error: 'Temporary provider failure' })

  assert.deepEqual(manager.getState().items.filter((item) => item.role === 'user').map((item) => [item.text, item.flowState]), [
    ['第一句', 'pending-merge'],
    ['第二句', 'pending-merge']
  ])
  assert.equal(manager.getState().error, 'Temporary provider failure')

  const retryBatch = manager.startQueuedRequest('req-3')
  assert.deepEqual(retryBatch, ['第一句', '第二句'])

  const completed = manager.completeRequest({
    requestId: 'req-3',
    conversationMessages: [
      { id: 'u1', role: 'user', content: '第一句', createdAt: '2026-06-24T00:00:00.000Z' },
      { id: 'u2', role: 'user', content: '第二句', createdAt: '2026-06-24T00:00:01.000Z' },
      { id: 'a1', role: 'assistant', content: '一起回复', createdAt: '2026-06-24T00:00:02.000Z' }
    ]
  })

  assert.equal(completed.pendingUserMessages.length, 0)
  assert.equal(completed.awaitingReply, false)
  assert.deepEqual(completed.items.filter((item) => item.kind === 'dialogue').map((item) => item.text), [
    '第一句',
    '第二句',
    '一起回复'
  ])
  assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.request.started' && entry.details.requestId === 'req-1' && entry.details.messageChars === 3), true)
  assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.request.queued' && entry.details.requestId === 'req-2'), true)
  assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.request.failed' && entry.details.requestId === 'req-1' && entry.details.retryablePendingCount === 2), true)
  assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.request.started' && entry.details.requestId === 'req-3' && entry.details.batchCount === 2), true)
  assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.request.completed' && entry.details.requestId === 'req-3' && entry.details.conversationMessageCount === 3), true)
})

test('pet bubble chat manager preserves recent visible dialogue history across request completion rebuilds', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    BrowserWindow: FakeBrowserWindow,
    app: { on: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
    }
  })
  const manager = createPetBubbleChatWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    })
  })

  manager.rebuildItems({
    reason: 'seed-history',
    conversationMessages: [
      { id: 'u1', role: 'user', content: '旧问题 1', createdAt: '2026-06-24T00:00:00.000Z' },
      { id: 'a1', role: 'assistant', content: '旧回答 1', createdAt: '2026-06-24T00:00:01.000Z' },
      { id: 'u2', role: 'user', content: '旧问题 2', createdAt: '2026-06-24T00:00:02.000Z' },
      { id: 'a2', role: 'assistant', content: '旧回答 2', createdAt: '2026-06-24T00:00:03.000Z' }
    ]
  })

  manager.queueOutgoingMessage({ text: '新问题', requestId: 'req-1' })
  manager.showMessage({ text: '思考提示', source: 'pet-renderer', ttlMs: 6000 })
  const completed = manager.completeRequest({
    requestId: 'req-1',
    conversationMessages: [
      { id: 'u1', role: 'user', content: '旧问题 1', createdAt: '2026-06-24T00:00:00.000Z' },
      { id: 'a1', role: 'assistant', content: '旧回答 1', createdAt: '2026-06-24T00:00:01.000Z' },
      { id: 'u2', role: 'user', content: '旧问题 2', createdAt: '2026-06-24T00:00:02.000Z' },
      { id: 'a2', role: 'assistant', content: '旧回答 2', createdAt: '2026-06-24T00:00:03.000Z' },
      { id: 'u3', role: 'user', content: '新问题', createdAt: '2026-06-24T00:00:04.000Z' },
      { id: 'a3', role: 'assistant', content: '新回答', createdAt: '2026-06-24T00:00:05.000Z' }
    ]
  })

  assert.deepEqual(
    completed.items.filter((item) => item.kind === 'dialogue').map((item) => item.text),
    ['旧问题 1', '旧回答 1', '旧问题 2', '旧回答 2', '新问题', '新回答', '思考提示']
  )
})

test('pet bubble chat manager refreshes visible dialogue ttl when a new request starts', () => {
  const timers = []
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  const originalDateNow = Date.now
  let now = 0
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false }
    timers.push(timer)
    return timer
  }
  global.clearTimeout = (timer) => {
    if (timer) timer.cleared = true
  }
  Date.now = () => now

  try {
    const { FakeBrowserWindow } = createFakeBrowserWindow()
    const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
      BrowserWindow: FakeBrowserWindow,
      app: { on: () => {} },
      screen: {
        getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } })
      }
    })
    const manager = createPetBubbleChatWindowManager({
      BrowserWindow: FakeBrowserWindow,
      screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) },
      settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: true, autoHide: true } }) },
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
      })
    })

    manager.rebuildItems({
      reason: 'seed-history',
      conversationMessages: [
        { id: 'u1', role: 'user', content: '旧问题 1', createdAt: '2026-06-24T00:00:00.000Z' },
        { id: 'a1', role: 'assistant', content: '旧回答 1', createdAt: '2026-06-24T00:00:01.000Z' },
        { id: 'u2', role: 'user', content: '旧问题 2', createdAt: '2026-06-24T00:00:02.000Z' },
        { id: 'a2', role: 'assistant', content: '旧回答 2', createdAt: '2026-06-24T00:00:03.000Z' }
      ]
    })

    const initialHistoryTimer = timers.at(-1)
    assert.ok(initialHistoryTimer)

    now = 8999
    manager.queueOutgoingMessage({ text: '新问题', requestId: 'req-1' })
    manager.completeRequest({
      requestId: 'req-1',
      conversationMessages: [
        { id: 'u1', role: 'user', content: '旧问题 1', createdAt: '2026-06-24T00:00:00.000Z' },
        { id: 'a1', role: 'assistant', content: '旧回答 1', createdAt: '2026-06-24T00:00:01.000Z' },
        { id: 'u2', role: 'user', content: '旧问题 2', createdAt: '2026-06-24T00:00:02.000Z' },
        { id: 'a2', role: 'assistant', content: '旧回答 2', createdAt: '2026-06-24T00:00:03.000Z' },
        { id: 'u3', role: 'user', content: '新问题', createdAt: '2026-06-24T00:00:04.000Z' },
        { id: 'a3', role: 'assistant', content: '新回答', createdAt: '2026-06-24T00:00:05.000Z' }
      ]
    })

    const refreshedHistoryTimer = timers.at(-1)
    assert.ok(refreshedHistoryTimer)
    assert.ok(
      refreshedHistoryTimer.delay >= 6000,
      `expected refreshed history timer to be extended, got ${refreshedHistoryTimer.delay}`
    )
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
    Date.now = originalDateNow
  }
})
