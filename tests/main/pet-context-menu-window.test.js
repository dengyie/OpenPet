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
    this.webContents = new EventEmitter()
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

  show() {}

  focus() {}
}

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
