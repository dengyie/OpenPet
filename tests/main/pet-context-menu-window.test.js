const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { showPetContextMenuWindow } = require('../../src/main/pet-context-menu-window')

class FakeMenuWindow extends EventEmitter {
  constructor(options) {
    super()
    this.options = options
    this.closed = false
    this.loadedUrl = ''
    this.shown = false
    this.focused = false
    this.webContents = new EventEmitter()
    FakeMenuWindow.instances.push(this)
  }

  isDestroyed() {
    return this.closed
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.emit('closed')
  }

  loadURL(url) {
    this.loadedUrl = url
  }

  getBounds() {
    return {
      x: this.options.x,
      y: this.options.y,
      width: this.options.width,
      height: this.options.height
    }
  }

  show() {
    this.shown = true
  }

  focus() {
    this.focused = true
  }
}

FakeMenuWindow.instances = []

test('pet context menu window removes parent listeners when closed by blur', () => {
  const parentWindow = new EventEmitter()
  const menuWindow = showPetContextMenuWindow({
    BrowserWindow: FakeMenuWindow,
    parentWindow,
    items: [{ label: '待机', click: () => {} }],
    point: { x: 20, y: 30 },
    size: { width: 112, height: 176 },
    onSelect: () => {}
  })

  assert.equal(parentWindow.listenerCount('move'), 1)
  assert.equal(parentWindow.listenerCount('closed'), 1)

  menuWindow.emit('blur')

  assert.equal(menuWindow.isDestroyed(), true)
  assert.equal(parentWindow.listenerCount('move'), 0)
  assert.equal(parentWindow.listenerCount('closed'), 0)
})

test('pet context menu window marks the parent while the menu is open', () => {
  const parentWindow = new EventEmitter()
  const menuWindow = showPetContextMenuWindow({
    BrowserWindow: FakeMenuWindow,
    parentWindow,
    items: [{ label: '设置', click: () => {} }],
    point: { x: 20, y: 30 },
    size: { width: 112, height: 176 },
    onSelect: () => {}
  })

  assert.equal(parentWindow.contextMenuWindow, menuWindow)

  menuWindow.close()

  assert.equal(parentWindow.contextMenuWindow, null)
})

test('pet context menu window prevents unexpected navigation without closing', () => {
  const parentWindow = new EventEmitter()
  let selected = false
  const menuWindow = showPetContextMenuWindow({
    BrowserWindow: FakeMenuWindow,
    parentWindow,
    items: [{ label: '待机', click: () => {} }],
    point: { x: 20, y: 30 },
    size: { width: 112, height: 176 },
    onSelect: () => { selected = true }
  })
  let prevented = false

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => { prevented = true }
  }, 'https://example.test/')

  assert.equal(prevented, true)
  assert.equal(selected, false)
  assert.equal(menuWindow.isDestroyed(), false)
})

test('pet context menu window opens a submenu without closing the root menu session', () => {
  FakeMenuWindow.instances = []
  const parentWindow = new EventEmitter()
  const menuWindow = showPetContextMenuWindow({
    BrowserWindow: FakeMenuWindow,
    parentWindow,
    items: [{
      type: 'submenu',
      label: '动作',
      submenu: [{ type: 'action', label: '散步', onSelect: () => {} }]
    }],
    point: { x: 20, y: 30 },
    size: { width: 112, height: 116 },
    onSelect: () => {}
  })
  let prevented = false

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => { prevented = true }
  }, 'openpet-menu://select/0')

  const submenuWindow = parentWindow.contextMenuSession?.submenuWindow
  assert.equal(prevented, true)
  assert.ok(submenuWindow)
  assert.equal(menuWindow.isDestroyed(), false)
  assert.equal(submenuWindow.isDestroyed(), false)

  menuWindow.emit('blur')

  assert.equal(menuWindow.isDestroyed(), false)
  assert.equal(parentWindow.contextMenuWindow, menuWindow)
})

test('pet context menu window closes both root and submenu after selecting a submenu action', () => {
  FakeMenuWindow.instances = []
  const parentWindow = new EventEmitter()
  const selected = []
  const menuWindow = showPetContextMenuWindow({
    BrowserWindow: FakeMenuWindow,
    parentWindow,
    items: [{
      type: 'submenu',
      label: '动作',
      submenu: [{ type: 'action', label: '散步', onSelect: () => {} }]
    }],
    point: { x: 20, y: 30 },
    size: { width: 112, height: 116 },
    onSelect: (item) => {
      selected.push(item.label)
      item.onSelect?.()
    }
  })

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/0')
  const submenuWindow = parentWindow.contextMenuSession?.submenuWindow

  submenuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/0')

  assert.deepEqual(selected, ['散步'])
  assert.equal(menuWindow.isDestroyed(), true)
  assert.equal(submenuWindow.isDestroyed(), true)
  assert.equal(parentWindow.contextMenuWindow, null)
  assert.equal(parentWindow.contextMenuSession, null)
})
