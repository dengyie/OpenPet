const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const { BASE_HEIGHT, BASE_WIDTH, PET_BASE_SCALE, applyPetViewport, applyWindowScale, createWindow, loadPetWindow } = require('../../src/main/window')

const projectRoot = path.join(__dirname, '..', '..')
const petIndexPath = path.join(projectRoot, 'index.html')
const windowModulePath = require.resolve('../../src/main/window')

const createScreenStub = () => ({
  getPrimaryDisplay: () => ({
    workArea: { x: 0, y: 0, width: 1440, height: 900 }
  }),
  getDisplayMatching: () => ({
    workArea: { x: 0, y: 0, width: 1440, height: 900 }
  })
})

const createBrowserWindowStub = (instances) => class BrowserWindowStub {
  constructor(options) {
    this.options = options
    this.loadedFiles = []
    this.visibleOnAllWorkspaces = null
    this.position = null
    this.destroyed = false
    this.bounds = { x: 0, y: 0, width: options.width, height: options.height }
    instances.push(this)
  }

  setPosition(x, y) {
    this.position = { x, y }
    this.bounds.x = x
    this.bounds.y = y
  }

  setBounds(bounds) {
    this.bounds = { ...this.bounds, ...bounds }
  }

  setVisibleOnAllWorkspaces(value, options) {
    this.visibleOnAllWorkspaces = { value, options }
  }

  loadFile(filePath) {
    this.loadedFiles.push(filePath)
    return Promise.resolve()
  }

  getBounds() {
    return { ...this.bounds }
  }

  getPosition() {
    return [this.bounds.x, this.bounds.y]
  }

  isDestroyed() {
    return this.destroyed
  }
}

const loadWindowModule = (electronStub = {}) => {
  delete require.cache[windowModulePath]
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return electronStub
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    return require(windowModulePath)
  } finally {
    Module._load = originalLoad
  }
}

test('createWindow can defer loading so callers register lifecycle handlers first', () => {
  const instances = []
  const { createWindow, loadPetWindow } = loadWindowModule()
  const petWindow = createWindow({
    load: false,
    BrowserWindow: createBrowserWindowStub(instances),
    screen: createScreenStub()
  })

  assert.equal(instances.length, 1)
  assert.equal(petWindow.loadedFiles.length, 0)
  loadPetWindow(petWindow)
  assert.deepEqual(petWindow.loadedFiles, [petIndexPath])
})

test('createWindow preserves automatic loading by default', () => {
  const instances = []
  const { createWindow } = loadWindowModule()
  const petWindow = createWindow({
    BrowserWindow: createBrowserWindowStub(instances),
    screen: createScreenStub()
  })

  assert.deepEqual(petWindow.loadedFiles, [petIndexPath])
  assert.equal(petWindow.options.transparent, true)
  assert.equal(petWindow.options.alwaysOnTop, true)
})

test('createSettingsWindow uses normal app stacking instead of pet-level always-on-top', () => {
  const instances = []
  const { createSettingsWindow, createWindow } = loadWindowModule()
  const BrowserWindow = createBrowserWindowStub(instances)
  const screen = createScreenStub()
  const petWindow = createWindow({
    load: false,
    BrowserWindow,
    screen
  })

  createSettingsWindow(petWindow, { BrowserWindow, screen })

  assert.equal(instances.length, 2)
  assert.equal(instances[0].options.alwaysOnTop, true)
  assert.equal(instances[0].visibleOnAllWorkspaces.value, true)
  assert.equal(instances[1].options.alwaysOnTop, false)
  assert.equal(instances[1].visibleOnAllWorkspaces, null)
})

test('applyWindowScale recovers a collapsed pet window back to valid default bounds', () => {
  const instances = []
  const petWindow = createWindow({
    load: false,
    BrowserWindow: createBrowserWindowStub(instances),
    screen: createScreenStub()
  })
  petWindow.setBounds({ x: 40, y: 33, width: 0, height: 0 })

  applyWindowScale(petWindow, 1)

  assert.deepEqual(petWindow.getBounds(), {
    x: 40,
    y: 33,
    width: BASE_WIDTH * PET_BASE_SCALE,
    height: BASE_HEIGHT * PET_BASE_SCALE
  })
})

test('applyWindowScale uses the reduced visual base size for user scale values', () => {
  const instances = []
  const petWindow = createWindow({
    load: false,
    BrowserWindow: createBrowserWindowStub(instances),
    screen: createScreenStub()
  })
  petWindow.setBounds({ x: 100, y: 200, width: BASE_WIDTH, height: BASE_HEIGHT })

  applyWindowScale(petWindow, 0.5)

  assert.deepEqual(petWindow.getBounds(), {
    x: 212,
    y: 425,
    width: 75,
    height: 75
  })
})

test('applyPetViewport resizes around bottom center for dynamic action bounds', () => {
  const instances = []
  const petWindow = createWindow({
    load: false,
    BrowserWindow: createBrowserWindowStub(instances),
    screen: createScreenStub()
  })
  petWindow.setBounds({ x: 100, y: 200, width: 300, height: 300 })

  applyPetViewport(petWindow, { width: 120, height: 180, scale: 1.5 })

  assert.deepEqual(petWindow.getBounds(), {
    x: 160,
    y: 230,
    width: 180,
    height: 270
  })
})

test('applyPetViewport can shrink dynamic action bounds below their source size', () => {
  const instances = []
  const petWindow = createWindow({
    load: false,
    BrowserWindow: createBrowserWindowStub(instances),
    screen: createScreenStub()
  })
  petWindow.setBounds({ x: 100, y: 200, width: 300, height: 300 })

  applyPetViewport(petWindow, { width: 120, height: 180, scale: 0.5 })

  assert.deepEqual(petWindow.getBounds(), {
    x: 220,
    y: 410,
    width: 60,
    height: 90
  })
})
