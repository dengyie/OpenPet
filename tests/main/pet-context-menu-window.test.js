const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const {
  createMenuHtml,
  showPetContextMenuWindow
} = require('../../src/main/pet-context-menu-window')

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

  blur() {
    this.focused = false
    this.emit('blur')
  }

  isFocused() {
    return this.focused
  }
}

FakeMenuWindow.instances = []

const flushFocusDismissal = () => new Promise((resolve) => setImmediate(resolve))

test('pet context menu window removes parent listeners when closed by blur', async () => {
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

  menuWindow.blur()
  await flushFocusDismissal()

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

test('pet context menu window opens a submenu without closing the root menu session', async () => {
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

  submenuWindow.focus()
  menuWindow.blur()
  await flushFocusDismissal()

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

test('pet context menu window closes the full menu session when the submenu blurs', async () => {
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

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/0')
  const submenuWindow = parentWindow.contextMenuSession?.submenuWindow

  submenuWindow.blur()
  await flushFocusDismissal()

  assert.equal(menuWindow.isDestroyed(), true)
  assert.equal(submenuWindow.isDestroyed(), true)
  assert.equal(parentWindow.contextMenuWindow, null)
  assert.equal(parentWindow.contextMenuSession, null)
})

test('pet context menu window closes the full menu session on escape navigation', () => {
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

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/0')
  const submenuWindow = parentWindow.contextMenuSession?.submenuWindow

  submenuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://close')

  assert.equal(menuWindow.isDestroyed(), true)
  assert.equal(submenuWindow.isDestroyed(), true)
  assert.equal(parentWindow.contextMenuWindow, null)
  assert.equal(parentWindow.contextMenuSession, null)
})

test('pet context menu window reuses a single submenu window when the parent submenu item is clicked repeatedly', () => {
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

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/0')
  const firstSubmenuWindow = parentWindow.contextMenuSession?.submenuWindow

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/0')
  const secondSubmenuWindow = parentWindow.contextMenuSession?.submenuWindow

  assert.ok(firstSubmenuWindow)
  assert.ok(secondSubmenuWindow)
  assert.equal(firstSubmenuWindow, secondSubmenuWindow)
  assert.equal(firstSubmenuWindow.isDestroyed(), false)
  assert.equal(secondSubmenuWindow.isDestroyed(), false)
  assert.equal(FakeMenuWindow.instances.filter((window) => !window.isDestroyed()).length, 2)
})

test('pet context menu window keeps the session open when focus returns from submenu to root', async () => {
  FakeMenuWindow.instances = []
  const parentWindow = new EventEmitter()
  const menuWindow = showPetContextMenuWindow({
    BrowserWindow: FakeMenuWindow,
    parentWindow,
    items: [{
      id: 'actions',
      type: 'submenu',
      label: '动作',
      submenu: [{ id: 'walk', type: 'action', label: '散步', onSelect: () => {} }]
    }],
    point: { x: 20, y: 30 },
    size: { width: 112, height: 42 },
    onSelect: () => {}
  })

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/0')
  const submenuWindow = parentWindow.contextMenuSession?.submenuWindow

  submenuWindow.focus()
  menuWindow.focus()
  submenuWindow.blur()
  await flushFocusDismissal()

  assert.equal(menuWindow.isDestroyed(), false)
  assert.equal(submenuWindow.isDestroyed(), false)
})

test('opening a new root menu closes the previous menu session', () => {
  FakeMenuWindow.instances = []
  const parentWindow = new EventEmitter()
  const firstWindow = showPetContextMenuWindow({
    BrowserWindow: FakeMenuWindow,
    parentWindow,
    items: [{ type: 'action', label: '设置' }],
    point: { x: 20, y: 30 },
    size: { width: 112, height: 42 },
    onSelect: () => {}
  })

  const secondWindow = showPetContextMenuWindow({
    BrowserWindow: FakeMenuWindow,
    parentWindow,
    items: [{ type: 'action', label: '退出' }],
    point: { x: 40, y: 50 },
    size: { width: 112, height: 42 },
    onSelect: () => {}
  })

  assert.equal(firstWindow.isDestroyed(), true)
  assert.equal(secondWindow.isDestroyed(), false)
  assert.equal(parentWindow.contextMenuWindow, secondWindow)
})

test('clicking a first-level action after opening the submenu still selects it', async () => {
  FakeMenuWindow.instances = []
  const parentWindow = new EventEmitter()
  const selected = []
  const menuWindow = showPetContextMenuWindow({
    BrowserWindow: FakeMenuWindow,
    parentWindow,
    items: [
      {
        id: 'actions',
        type: 'submenu',
        label: '动作',
        submenu: [{ id: 'walk', type: 'action', label: '散步' }]
      },
      { id: 'settings', type: 'action', label: '设置' }
    ],
    point: { x: 20, y: 30 },
    size: { width: 112, height: 72 },
    onSelect: (item) => selected.push(item.id)
  })

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/0')
  const submenuWindow = parentWindow.contextMenuSession?.submenuWindow
  menuWindow.focus()
  submenuWindow.blur()
  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/1')
  await flushFocusDismissal()

  assert.deepEqual(selected, ['settings'])
  assert.equal(menuWindow.isDestroyed(), true)
  assert.equal(submenuWindow.isDestroyed(), true)
})

test('long action submenus use a work-area constrained scrolling window', () => {
  FakeMenuWindow.instances = []
  const parentWindow = new EventEmitter()
  parentWindow.getBounds = () => ({ x: 240, y: 120, width: 120, height: 120 })
  const submenuDetails = []
  const menuWindow = showPetContextMenuWindow({
    BrowserWindow: FakeMenuWindow,
    parentWindow,
    screenService: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 300 } })
    },
    items: [{
      id: 'actions',
      type: 'submenu',
      label: '动作',
      submenu: Array.from({ length: 30 }, (_, index) => ({
        id: `action:${index}`,
        type: 'action',
        label: `动作 ${index + 1}`
      }))
    }],
    point: { x: 380, y: 120 },
    size: { width: 112, height: 42 },
    onSelect: () => {},
    onSubmenuOpen: (details) => submenuDetails.push(details)
  })

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/0')

  const submenuWindow = parentWindow.contextMenuSession?.submenuWindow
  assert.equal(submenuWindow.options.height, 284)
  assert.equal(submenuDetails[0].scrollable, true)
  assert.equal(decodeURIComponent(submenuWindow.loadedUrl).includes('overflow-y: auto'), true)
})

test('menu html uses a constrained scrolling viewport for long action lists', () => {
  const html = createMenuHtml(
    [{ type: 'action', label: '动作' }],
    { scrollable: true }
  )

  assert.match(html, /overflow-y: auto/)
  assert.match(html, /padding: 6px/)
  assert.match(html, /min-height: 30px/)
  assert.match(html, /height: 1px/)
  assert.match(html, /margin: 3px 4px/)
})

test('menu html closes the session when non-item window space is clicked', () => {
  const html = createMenuHtml([{ type: 'action', label: '设置' }], { scrollable: false })

  assert.match(html, /openpet-menu:\/\/close/)
  assert.match(html, /if \(!button\)/)
})

test('pet context menu window reports submenu placement diagnostics when a submenu opens', () => {
  FakeMenuWindow.instances = []
  const parentWindow = new EventEmitter()
  parentWindow.getBounds = () => ({ x: 260, y: 30, width: 80, height: 80 })
  const submenuOpens = []
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
    onSelect: () => {},
    onSubmenuOpen: (payload) => submenuOpens.push(payload)
  })

  menuWindow.webContents.emit('will-navigate', {
    preventDefault: () => {}
  }, 'openpet-menu://select/0')

  assert.equal(submenuOpens.length, 1)
  const details = submenuOpens[0]
  assert.equal(details.label, '动作')
  assert.equal(details.placement, 'right')
  assert.equal(details.reason, 'right-preferred')
  assert.equal(details.scrollable, false)
  assert.deepEqual(details.contentSize, { width: 112, height: 42 })
  assert.deepEqual(details.submenuBounds, { x: 132, y: 30, width: 112, height: 42 })
  assert.equal(details.parentOverlapArea, 0)
  assert.equal(details.petOverlapArea, 0)
  assert.equal(details.rightCandidate.fitsHorizontally, true)
  assert.equal(details.rightCandidate.parentOverlapArea, 0)
  assert.equal(details.leftCandidate.fitsHorizontally, false)
  assert.equal(details.leftCandidate.parentOverlapArea > 0, true)
})
