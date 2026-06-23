const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const Module = require('module')

const modulePath = require.resolve('../../src/main/pet-chat-window')

const loadPetChatWindowModule = () => {
  delete require.cache[modulePath]
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return { BrowserWindow: FakeChatWindow, screen: createScreenStub(), app: createAppStub() }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

const createScreenStub = () => ({
  getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } }),
  getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } })
})

const createAppStub = () => {
  const listeners = []
  return {
    listeners,
    on: (event, listener) => {
      listeners.push({ event, listener })
    },
    focus: () => {}
  }
}

const createSettingsServiceStub = (initial = {}) => {
  let settings = {
    desktopChat: {
      bounds: null,
      hasUserBounds: false,
      alwaysOnTop: true
    },
    ...initial
  }
  const saved = []
  return {
    saved,
    get: () => JSON.parse(JSON.stringify(settings)),
    save: (nextSettings) => {
      settings = JSON.parse(JSON.stringify(nextSettings))
      saved.push(settings)
      return JSON.parse(JSON.stringify(settings))
    }
  }
}

class FakeChatWindow extends EventEmitter {
  constructor(options) {
    super()
    this.options = options
    this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }
    this.destroyed = false
    this.visible = Boolean(options.show)
    this.alwaysOnTop = options.alwaysOnTop
    this.loadedFile = ''
    this.hideCalls = 0
    this.showCalls = 0
    this.focusCalls = 0
    this.moveTopCalls = 0
    this.webContents = {
      sent: [],
      send: (channel, payload) => this.webContents.sent.push({ channel, payload })
    }
    FakeChatWindow.instances.push(this)
  }

  getBounds() {
    return { ...this.bounds }
  }

  setBounds(bounds) {
    this.bounds = { ...this.bounds, ...bounds }
  }

  setVisibleOnAllWorkspaces(value, options) {
    this.visibleOnAllWorkspaces = { value, options }
  }

  setAlwaysOnTop(value) {
    this.alwaysOnTop = value
  }

  loadFile(filePath) {
    this.loadedFile = filePath
    return Promise.resolve()
  }

  isDestroyed() {
    return this.destroyed
  }

  isVisible() {
    return this.visible
  }

  isMinimized() {
    return false
  }

  show() {
    this.showCalls += 1
    this.visible = true
  }

  hide() {
    this.hideCalls += 1
    this.visible = false
  }

  focus() {
    this.focusCalls += 1
  }

  moveTop() {
    this.moveTopCalls += 1
  }

  close() {
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      }
    }
    this.emit('close', event)
    if (event.defaultPrevented) return
    this.destroyed = true
    this.emit('closed')
  }
}

FakeChatWindow.instances = []

test('pet chat window opens next to the pet and saves moved bounds', () => {
  FakeChatWindow.instances = []
  const { createPetChatWindowManager } = loadPetChatWindowModule()
  const settingsService = createSettingsServiceStub()
  const manager = createPetChatWindowManager({
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 100, y: 200, width: 150, height: 150 })
    }),
    settingsService,
    BrowserWindow: FakeChatWindow,
    screen: createScreenStub(),
    app: createAppStub()
  })

  manager.open()
  const chatWindow = FakeChatWindow.instances[0]
  chatWindow.emit('ready-to-show')

  assert.equal(FakeChatWindow.instances.length, 1)
  assert.equal(chatWindow.options.frame, false)
  assert.equal(chatWindow.options.alwaysOnTop, true)
  assert.equal(chatWindow.options.x, 262)
  assert.equal(chatWindow.options.y, 200)
  assert.equal(chatWindow.visible, true)
  assert.match(chatWindow.loadedFile, /src\/main\/pet-chat\/index\.html$/)

  chatWindow.setBounds({ x: 320, y: 180, width: 420, height: 540 })
  chatWindow.emit('move')

  assert.deepEqual(settingsService.get().desktopChat, {
    bounds: { x: 320, y: 180, width: 420, height: 540 },
    hasUserBounds: true,
    alwaysOnTop: true
  })
})

test('pet chat window close hides instead of destroying and later focuses the singleton', () => {
  FakeChatWindow.instances = []
  const { createPetChatWindowManager } = loadPetChatWindowModule()
  const manager = createPetChatWindowManager({
    getPetWindow: () => ({ isDestroyed: () => false, getBounds: () => ({ x: 50, y: 50, width: 150, height: 150 }) }),
    settingsService: createSettingsServiceStub(),
    BrowserWindow: FakeChatWindow,
    screen: createScreenStub(),
    app: createAppStub()
  })

  manager.open()
  const chatWindow = FakeChatWindow.instances[0]
  chatWindow.emit('ready-to-show')
  chatWindow.close()
  manager.open()

  assert.equal(FakeChatWindow.instances.length, 1)
  assert.equal(chatWindow.destroyed, false)
  assert.equal(chatWindow.hideCalls, 1)
  assert.equal(chatWindow.showCalls, 2)
  assert.equal(chatWindow.focusCalls, 2)
  assert.equal(chatWindow.moveTopCalls, 2)
})

test('pet chat window restores saved bounds and persists topmost changes', () => {
  FakeChatWindow.instances = []
  const { createPetChatWindowManager } = loadPetChatWindowModule()
  const settingsService = createSettingsServiceStub({
    desktopChat: {
      bounds: { x: 880, y: 720, width: 400, height: 500 },
      hasUserBounds: true,
      alwaysOnTop: true
    }
  })
  const manager = createPetChatWindowManager({
    getPetWindow: () => ({ isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 150, height: 150 }) }),
    settingsService,
    BrowserWindow: FakeChatWindow,
    screen: createScreenStub(),
    app: createAppStub()
  })

  manager.open()
  const chatWindow = FakeChatWindow.instances[0]
  const state = manager.setAlwaysOnTop(false)

  assert.equal(chatWindow.options.x, 592)
  assert.equal(chatWindow.options.y, 292)
  assert.equal(chatWindow.alwaysOnTop, false)
  assert.equal(state.alwaysOnTop, false)
  assert.equal(settingsService.get().desktopChat.alwaysOnTop, false)
})

test('pet chat window can open Control Center settings through injected callback', () => {
  FakeChatWindow.instances = []
  const { createPetChatWindowManager } = loadPetChatWindowModule()
  let opened = 0
  const manager = createPetChatWindowManager({
    settingsService: createSettingsServiceStub(),
    BrowserWindow: FakeChatWindow,
    screen: createScreenStub(),
    app: createAppStub(),
    createSettingsWindow: () => { opened += 1 }
  })

  assert.deepEqual(manager.openSettings(), { ok: true })
  assert.equal(opened, 1)
})
