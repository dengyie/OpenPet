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
      this.sent = []
      this.ignoreMouseEventsCalls = []
      this.webContents = {
        send: (channel, payload) => this.sent.push({ channel, payload })
      }
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
    hide() { this.visible = false }
    loadFile() { return Promise.resolve() }
    setIgnoreMouseEvents(ignore, options) {
      this.ignoreMouseEvents = { ignore, options }
      this.ignoreMouseEventsCalls.push({ ignore, options })
    }
    setVisibleOnAllWorkspaces() {}
    on() {}
    once() {}
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

test('bubble chat item helpers classify ai as dialogue and other sources as notices', () => {
  const {
    buildBubbleChatItems,
    classifyBubbleChatKind,
    createDialogueItemsFromMessages,
    normalizeBubbleChatItem
  } = loadModuleWithElectron({ app: { on: () => {} } })

  assert.equal(classifyBubbleChatKind({ source: 'ai' }), 'dialogue')
  assert.equal(classifyBubbleChatKind({ source: 'plugin:weather' }), 'notice')
  assert.equal(classifyBubbleChatKind({ source: 'ai:behavior' }), 'notice')

  const aiItem = normalizeBubbleChatItem({ text: '正式回复', source: 'ai', intent: 'notice' })
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

  const above = resolveBubbleBounds({
    petBounds: { x: 300, y: 300, width: 120, height: 120 },
    workArea: { x: 0, y: 0, width: 900, height: 700 }
  })
  const below = resolveBubbleBounds({
    petBounds: { x: 10, y: 20, width: 120, height: 120 },
    workArea: { x: 0, y: 0, width: 900, height: 700 }
  })

  assert.equal(above.placement, 'above')
  assert.equal(above.y, 32)
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
  assert.ok(bounds.x >= petBounds.x + petBounds.width + 8)
  assert.ok(bounds.y < petBounds.y + petBounds.height)
  assert.ok(bounds.y + bounds.height > petBounds.y)
})

test('pet bubble chat manager opens manually with a chat prompt even when auto popup is disabled', () => {
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
    settingsService: { get: () => ({ petBubbleChat: { enabled: true, autoPopup: false, autoHide: true } }) },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 })
    }),
    appLogService: { record: (entry) => logs.push(entry) }
  })

  const state = manager.open({ source: 'pet-renderer', focus: true })

  assert.equal(instances.length, 1)
  assert.equal(instances[0].visible, true)
  assert.equal(instances[0].focused, true)
  assert.equal(state.visible, true)
  assert.equal(state.interacting, true)
  assert.equal(state.message.text, '想聊点什么？')
  assert.equal(logs.some((entry) => entry.event === 'pet-bubble-chat.window.open-requested'), true)
})

test('pet bubble chat manager shows latest message and auto hides when idle', () => {
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
      })
    })

    const state = manager.showMessage({ text: 'hello there', source: 'test', ttlMs: 3000 })

    assert.equal(instances.length, 1)
    assert.equal(instances[0].visible, true)
    assert.equal(instances[0].options.height, 260)
    assert.equal(instances[0].bounds.height, 260)
    assert.equal(state.message.text, 'hello there')
    assert.deepEqual(state.items.map((item) => [item.kind, item.role, item.text]), [['notice', 'system', 'hello there']])
    assert.equal(state.noticeItems.length, 1)
    assert.equal(timers.at(-1).delay, 6000)
    assert.equal(instances[0].sent.at(-1).channel, IPC.PET_BUBBLE_CHAT_STATE_CHANGED)

    timers.at(-1).callback()
    assert.equal(manager.getState().visible, false)
    assert.equal(instances[0].visible, false)
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

test('pet bubble chat manager keeps only the latest dialogue slice while preserving a small notice overlay', () => {
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
    ['第3句', '第4句', '第5句', '第6句', '第7句', '第8句']
  )
  assert.deepEqual(
    state.items.filter((item) => item.kind === 'notice').map((item) => item.text),
    ['提示1', '提示2', '提示3']
  )
  assert.equal(state.noticeItems.length, 3)
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

test('pet bubble chat manager reuses a single window and latest message replaces prior auto-hide timer', () => {
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
      })
    })

    manager.showMessage({ text: 'first line', source: 'test', ttlMs: 6200 })
    const firstTimer = timers.at(-1)
    manager.showMessage({ text: 'second line', source: 'test', ttlMs: 7000 })

    assert.equal(instances.length, 1)
    assert.equal(firstTimer.cleared, true)
    assert.equal(timers.at(-1).delay, 7000)
    assert.equal(manager.getState().message.text, 'second line')
    assert.equal(instances[0].visible, true)
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})

test('pet bubble chat manager does not show when disabled and holds visible while pinned', () => {
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
      })
    })

    manager.showMessage({ text: 'disabled' })
    assert.equal(instances.length, 0)

    settings = { enabled: true, autoPopup: true, autoHide: true, pinOnInteraction: true }
    manager.setPinned(true)
    manager.showMessage({ text: 'stay visible', ttlMs: 3000 })

    assert.equal(instances.length, 1)
    assert.equal(timers.length, 0)
    assert.equal(manager.getState().visible, true)
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})

test('pet bubble chat manager toggles window-level hit-test passthrough', () => {
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
    })
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
})

test('pet bubble chat manager stays visible during sending and after a recoverable send error', () => {
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
    assert.equal(afterSending.interacting, true)
    assert.equal(afterError.visible, true)
    assert.equal(afterError.sending, false)
    assert.equal(afterError.interacting, true)
    assert.equal(afterError.error, 'Temporary provider failure')
    assert.equal(timers.every((timer) => timer.cleared), true)
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})
