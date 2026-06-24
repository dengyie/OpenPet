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
      this.webContents = {
        send: (channel, payload) => this.sent.push({ channel, payload })
      }
      instances.push(this)
    }

    isDestroyed() { return this.destroyed }
    isVisible() { return this.visible }
    getBounds() { return this.bounds }
    setBounds(bounds) { this.bounds = { ...this.bounds, ...bounds } }
    showInactive() { this.visible = true }
    hide() { this.visible = false }
    loadFile() { return Promise.resolve() }
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
  const clampedLow = calculateBubbleTtlMs({ text: 'hello', ttlMs: 800 })
  const clampedHigh = calculateBubbleTtlMs({ text: 'hello', ttlMs: 999999 })

  assert.equal(empty, 6000)
  assert.ok(short >= empty)
  assert.ok(long > short)
  assert.equal(clampedLow, 6000)
  assert.equal(clampedHigh, 30000)
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
