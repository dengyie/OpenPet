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
    assert.equal(timers.at(-1).delay, 3000)
    assert.equal(instances[0].sent.at(-1).channel, IPC.PET_BUBBLE_CHAT_STATE_CHANGED)

    timers.at(-1).callback()
    assert.equal(manager.getState().visible, false)
    assert.equal(instances[0].visible, false)
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
