const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const { BASE_HEIGHT, BASE_WIDTH, applyPetViewport, applyWindowScale, createWindow, loadPetWindow } = require('../../src/main/window')

const projectRoot = path.join(__dirname, '..', '..')
const petIndexPath = path.join(projectRoot, 'index.html')

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

test('createWindow can defer loading so callers register lifecycle handlers first', () => {
  const instances = []
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
  const petWindow = createWindow({
    BrowserWindow: createBrowserWindowStub(instances),
    screen: createScreenStub()
  })

  assert.deepEqual(petWindow.loadedFiles, [petIndexPath])
  assert.equal(petWindow.options.transparent, true)
  assert.equal(petWindow.options.alwaysOnTop, true)
})

test('applyWindowScale recovers a collapsed pet window back to valid base bounds', () => {
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
    width: BASE_WIDTH,
    height: BASE_HEIGHT
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
