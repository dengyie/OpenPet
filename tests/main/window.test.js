const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const { BASE_HEIGHT, BASE_WIDTH, applyWindowScale, createSettingsWindow, createWindow, loadPetWindow } = require('../../src/main/window')

const projectRoot = path.join(__dirname, '..', '..')
const petIndexPath = path.join(projectRoot, 'index.html')

const createActivityLogStub = () => {
  const entries = []
  return {
    entries,
    record(entry) {
      entries.push(entry)
      return entry
    }
  }
}

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
    this.id = instances.length + 1
    this.options = options
    this.loadedFiles = []
    this.visibleOnAllWorkspaces = null
    this.position = null
    this.handlers = new Map()
    this.destroyed = false
    this.visible = true
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

  setAlwaysOnTop(value, level) {
    this.alwaysOnTop = { value, level }
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

  isVisible() {
    return this.visible
  }

  focus() {
    this.focused = true
  }

  showInactive() {
    this.shownInactive = true
  }

  moveTop() {
    this.movedTop = true
  }

  on(eventName, handler) {
    this.handlers.set(eventName, handler)
  }

  emit(eventName) {
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      }
    }
    this.handlers.get(eventName)?.(event)
    return event
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

test('createWindow prevents accidental pet window close when close policy denies it', () => {
  const instances = []
  const activityLog = createActivityLogStub()
  const petWindow = createWindow({
    load: false,
    BrowserWindow: createBrowserWindowStub(instances),
    screen: createScreenStub(),
    shouldAllowClose: () => false,
    activityLog
  })

  const closeEvent = petWindow.emit('close')

  assert.equal(closeEvent.defaultPrevented, true)
  assert.equal(activityLog.entries.at(-1).action, 'pet.close-prevented')
  assert.equal(activityLog.entries.at(-1).details.window.destroyed, false)
})

test('createWindow allows pet window close when close policy permits it', () => {
  const instances = []
  const petWindow = createWindow({
    load: false,
    BrowserWindow: createBrowserWindowStub(instances),
    screen: createScreenStub(),
    shouldAllowClose: () => true
  })

  const closeEvent = petWindow.emit('close')

  assert.equal(closeEvent.defaultPrevented, false)
})

test('createSettingsWindow clears the pet settingsWindow reference when the window closes', () => {
  const instances = []
  const BrowserWindowStub = createBrowserWindowStub(instances)
  const activityLog = createActivityLogStub()
  const petWindow = createWindow({
    load: false,
    BrowserWindow: BrowserWindowStub,
    screen: createScreenStub(),
    activityLog
  })

  createSettingsWindow(petWindow, {
    BrowserWindow: BrowserWindowStub,
    screen: createScreenStub(),
    activityLog
  })
  const settingsWindow = petWindow.settingsWindow

  assert.ok(settingsWindow)
  settingsWindow.emit('closed')

  assert.equal(petWindow.settingsWindow, null)
  assert.equal(activityLog.entries.at(-1).action, 'settings.closed')
  assert.equal(activityLog.entries.at(-1).details.petWindow.destroyed, false)
})

test('createSettingsWindow restores pet window visibility when the settings window closes', () => {
  const instances = []
  const BrowserWindowStub = createBrowserWindowStub(instances)
  const activityLog = createActivityLogStub()
  const petWindow = createWindow({
    load: false,
    BrowserWindow: BrowserWindowStub,
    screen: createScreenStub(),
    activityLog
  })

  createSettingsWindow(petWindow, {
    BrowserWindow: BrowserWindowStub,
    screen: createScreenStub(),
    activityLog
  })
  petWindow.settingsWindow.emit('closed')

  assert.equal(petWindow.shownInactive, true)
  assert.deepEqual(petWindow.alwaysOnTop, { value: true, level: 'screen-saver' })
  assert.equal(petWindow.movedTop, true)
  assert.equal(activityLog.entries.some((entry) => entry.action === 'pet.visibility-restore.completed'), true)
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
