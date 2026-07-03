const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const rendererSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main', 'pet-bubble-chat', 'renderer.js'), 'utf-8')

const createClassList = () => ({
  values: new Set(),
  toggle(value, force) {
    if (force === undefined) {
      if (this.values.has(value)) this.values.delete(value)
      else this.values.add(value)
      return this.values.has(value)
    }
    if (force) this.values.add(value)
    else this.values.delete(value)
    return force
  },
  contains(value) {
    return this.values.has(value)
  }
})

const createElement = (id = '') => ({
  id,
  hidden: false,
  disabled: false,
  textContent: '',
  value: '',
  className: '',
  dataset: {},
  children: [],
  scrollTop: 0,
  scrollHeight: 0,
  classList: createClassList(),
  attributes: {},
  listeners: {},
  parentNode: null,
  setAttribute(name, value) {
    this.attributes[name] = String(value)
  },
  appendChild(child) {
    child.parentNode = this
    this.children.push(child)
    this.textContent = this.children.map((node) => node.textContent || '').join('')
    this.scrollHeight = Math.max(this.scrollHeight, this.children.length * 36)
  },
  replaceChildren(...children) {
    children.forEach((child) => {
      child.parentNode = this
    })
    this.children = children
    this.textContent = this.children.map((node) => node.textContent || '').join('')
    this.scrollHeight = Math.max(this.scrollHeight, this.children.length * 36)
  },
  addEventListener(eventName, callback) {
    this.listeners[eventName] ||= []
    this.listeners[eventName].push(callback)
  },
  requestSubmit() {
    this.lastSubmitPromise = Promise.all((this.listeners.submit || []).map((listener) => listener({ preventDefault() {} })))
    return this.lastSubmitPromise
  },
  setPointerCapture() {},
  closest(selector) {
    const selectors = String(selector || '').split(',').map((item) => item.trim()).filter(Boolean)
    let node = this
    while (node) {
      const classNames = String(node.className || '').split(/\s+/).filter(Boolean)
      for (const item of selectors) {
        if (item.startsWith('#') && node.id === item.slice(1)) return node
        if (item.startsWith('.') && classNames.includes(item.slice(1))) return node
        if (!item.startsWith('.') && !item.startsWith('#') && String(node.tagName || '').toLowerCase() === item.toLowerCase()) return node
      }
      node = node.parentNode
    }
    return null
  }
})

const dispatch = async (target, eventName, event = {}) => {
  if (eventName === 'wheel' && typeof event.preventDefault !== 'function') {
    event.preventDefault = () => {
      event.defaultPrevented = true
    }
  }
  for (const listener of target.listeners?.[eventName] || []) {
    await listener(event)
  }
  if (eventName === 'wheel' && target?.id === 'bubble-stream' && !event.defaultPrevented) {
    target.scrollTop = Math.max(0, (target.scrollTop || 0) + (Number(event.deltaY) || 0))
  }
}

const dispatchDocument = async (documentListeners, eventName, event = {}) => {
  for (const listener of documentListeners[eventName] || []) {
    await listener(event)
  }
}

const createHarness = async ({ initialState } = {}) => {
  const apiCalls = {
    hide: [],
    setInteracting: [],
    setHitTestMode: [],
    dragWindowTo: [],
    sendMessage: []
  }
  const initialItems = [
    { id: 'u1', kind: 'dialogue', role: 'user', text: '你好', source: 'user', createdAt: '2026-06-24T00:00:00.000Z' },
    { id: 'a1', kind: 'dialogue', role: 'pet', text: '我在', source: 'ai', createdAt: '2026-06-24T00:00:01.000Z' },
    { id: 'n1', kind: 'notice', role: 'system', text: '天气提醒', source: 'plugin:weather', createdAt: '2026-06-24T00:00:02.000Z' }
  ]
  const baseState = () => ({
    message: initialItems.at(-1),
    items: initialItems,
    sending: false,
    error: '',
    pinned: false,
    bounds: { x: 200, y: 180, width: 340, height: 260 }
  })
  let latestState = initialState ? { ...baseState(), ...initialState } : baseState()
  const apiStateListeners = []
  const documentListeners = {}
  const elements = {
    'bubble-shell': createElement('bubble-shell'),
    'bubble-card': createElement('bubble-card'),
    'close-button': createElement('close-button'),
    'bubble-stream': createElement('bubble-stream'),
    'bubble-items': createElement('bubble-items'),
    'new-message-button': createElement('new-message-button'),
    'last-user-message': createElement('last-user-message'),
    'error-message': createElement('error-message'),
    'mini-input-form': createElement('mini-input-form'),
    'mini-input': createElement('mini-input'),
    'send-button': createElement('send-button')
  }
  const selection = { text: '' }
  const focusState = { activeElement: null }
  elements['bubble-card'].className = 'bubble-card'
  elements['close-button'].tagName = 'button'
  elements['new-message-button'].tagName = 'button'
  elements['mini-input'].tagName = 'textarea'
  elements['mini-input-form'].tagName = 'form'
  elements['last-user-message'].className = 'last-user-message'
  elements['error-message'].className = 'error-message'
  elements['mini-input'].blur = () => {
    focusState.activeElement = null
  }
  const context = {
    console,
    setTimeout,
    clearTimeout,
    window: {
      addEventListener() {},
      setTimeout,
      clearTimeout,
      getSelection: () => selection.text,
      petBubbleChatAPI: {
        getState: async () => latestState,
        hide: (payload) => {
          apiCalls.hide.push(payload || true)
        },
        setPinned: async () => {
          latestState = { ...latestState, pinned: true }
          return latestState
        },
        setInteracting: async (interacting) => {
          apiCalls.setInteracting.push(Boolean(interacting))
          latestState = { ...latestState, interacting: Boolean(interacting) }
          return latestState
        },
        setHitTestMode: async (payload) => {
          apiCalls.setHitTestMode.push(payload)
          latestState = { ...latestState, hitTestInteractive: Boolean(payload?.interactive) }
          return latestState
        },
        dragWindowTo: async ({ x, y }) => {
          apiCalls.dragWindowTo.push({ x, y })
          latestState = {
            ...latestState,
            bounds: {
              ...(latestState.bounds || { x: 0, y: 0, width: 340, height: 260 }),
              x,
              y
            },
            anchorMode: 'detached-temporary',
            hitTestInteractive: true
          }
          return latestState
        },
        sendMessage: async ({ message }) => {
          apiCalls.sendMessage.push(message)
          latestState = {
            message: { id: 'a2', kind: 'dialogue', role: 'pet', text: 'reply', source: 'ai', createdAt: '2026-06-24T00:00:04.000Z' },
            items: [
              ...initialItems,
              { id: 'u2', kind: 'dialogue', role: 'user', text: message, source: 'user', createdAt: '2026-06-24T00:00:03.000Z' },
              { id: 'a2', kind: 'dialogue', role: 'pet', text: 'reply', source: 'ai', createdAt: '2026-06-24T00:00:04.000Z' }
            ],
            sending: false,
            error: '',
            pinned: false,
            interacting: false,
            lastUserMessage: { text: message }
          }
          return { state: latestState }
        },
        onStateChanged: (callback) => apiStateListeners.push((state) => {
          latestState = { ...latestState, ...state }
          callback(latestState)
        })
      }
    },
    document: {
      getElementById: (id) => elements[id],
      querySelector: (selector) => (selector === '.bubble-card' ? elements['bubble-card'] : null),
      createElement: (tagName) => createElement(tagName),
      addEventListener(eventName, callback) {
        documentListeners[eventName] ||= []
        documentListeners[eventName].push(callback)
      },
      get activeElement() {
        return focusState.activeElement
      }
    }
  }
  context.window.document = context.document
  context.globalThis = context
  vm.runInNewContext(rendererSource, context, { filename: 'pet-bubble-chat-renderer.js' })
  await Promise.resolve()
  await Promise.resolve()
  return {
    apiCalls,
    apiStateListeners,
    documentListeners,
    elements,
    focusState,
    selection
  }
}

test('bubble chat renderer renders user, pet and notice items as a mini dialogue stream', async () => {
  const harness = await createHarness()
  const { elements } = harness
  const items = elements['bubble-items'].children

  assert.equal(elements['bubble-shell'].hidden, false)
  assert.equal(items.length, 3)
  assert.match(items[0].className, /bubble-item--user/)
  assert.match(items[1].className, /bubble-item--pet/)
  assert.match(items[2].className, /bubble-item--notice/)
  assert.match(items[0].textContent, /你好/)
  assert.match(items[1].textContent, /我在/)
  assert.match(items[2].textContent, /天气提醒/)
})

test('bubble chat renderer sends mini input on Enter and collapses interaction after success', async () => {
  const harness = await createHarness()
  const { apiCalls, elements, focusState } = harness
  const input = elements['mini-input']

  focusState.activeElement = input
  input.value = 'hello bubble'
  await dispatch(input, 'focus')
  await dispatch(input, 'input')
  await dispatch(input, 'keydown', {
    key: 'Enter',
    shiftKey: false,
    preventDefault() {}
  })
  await elements['mini-input-form'].lastSubmitPromise

  assert.deepEqual(apiCalls.sendMessage, ['hello bubble'])
  assert.equal(input.value, '')
  assert.equal(elements['send-button'].textContent, '发送')
  assert.equal(elements['last-user-message'].hidden, true)
  assert.match(elements['bubble-items'].textContent, /hello bubble/)
  assert.match(elements['bubble-items'].textContent, /reply/)
  assert.equal(apiCalls.setInteracting.includes(false), true)
  assert.equal(apiCalls.setHitTestMode.some((payload) => payload.interactive === true), true)
  assert.equal(apiCalls.setHitTestMode.at(-1).interactive, true)
})

test('bubble chat renderer keeps Shift+Enter for multiline drafts without sending', async () => {
  const harness = await createHarness()
  const { apiCalls, elements, focusState } = harness
  const input = elements['mini-input']
  let prevented = false

  focusState.activeElement = input
  input.value = 'hello bubble'
  await dispatch(input, 'focus')
  await dispatch(input, 'input')
  await dispatch(input, 'keydown', {
    key: 'Enter',
    shiftKey: true,
    preventDefault() { prevented = true }
  })

  assert.equal(prevented, false)
  assert.equal(elements['mini-input-form'].lastSubmitPromise, undefined)
  assert.deepEqual(apiCalls.sendMessage, [])
})

test('bubble chat renderer Escape first collapses a draft and then hides when already collapsed', async () => {
  const harness = await createHarness()
  const { apiCalls, documentListeners, elements, focusState } = harness
  const input = elements['mini-input']

  focusState.activeElement = input
  input.value = 'draft'
  await dispatch(input, 'focus')
  await dispatch(input, 'input')
  await dispatchDocument(documentListeners, 'keydown', { key: 'Escape' })

  assert.equal(input.value, '')
  assert.deepEqual(apiCalls.hide, [])
  assert.equal(apiCalls.setHitTestMode.at(-1).interactive, false)

  await dispatchDocument(documentListeners, 'keydown', { key: 'Escape' })

  assert.deepEqual(apiCalls.hide, [true])
})

test('bubble chat renderer close button hides the popup with a close-button source', async () => {
  const harness = await createHarness()
  const { apiCalls, elements } = harness

  await dispatch(elements['close-button'], 'click', {
    preventDefault() {},
    stopPropagation() {}
  })

  assert.equal(apiCalls.hide.length, 1)
  assert.equal(apiCalls.hide[0].source, 'bubble-close-button')
})

test('bubble chat renderer keeps interaction while text is selected and releases active interaction after selection clears', async () => {
  const harness = await createHarness()
  const { apiCalls, documentListeners, selection } = harness

  selection.text = 'copied text'
  await dispatchDocument(documentListeners, 'selectionchange')
  selection.text = ''
  await dispatchDocument(documentListeners, 'selectionchange')

  assert.equal(apiCalls.setInteracting.at(-2), true)
  assert.equal(apiCalls.setInteracting.at(-1), false)
  assert.equal(apiCalls.setHitTestMode.at(-2).interactive, true)
  assert.equal(apiCalls.setHitTestMode.at(-1).interactive, true)
})

test('bubble chat renderer auto-scrolls on new messages instead of relying on the new-message prompt', async () => {
  const harness = await createHarness()
  const { apiStateListeners, documentListeners, elements } = harness

  await dispatchDocument(documentListeners, 'mouseenter')
  apiStateListeners[0]({
    message: { id: 'a2', kind: 'dialogue', role: 'pet', text: '新的回复', source: 'ai', createdAt: '2026-06-24T00:00:03.000Z' },
    items: [
      { id: 'u1', kind: 'dialogue', role: 'user', text: '你好', source: 'user', createdAt: '2026-06-24T00:00:00.000Z' },
      { id: 'a1', kind: 'dialogue', role: 'pet', text: '我在', source: 'ai', createdAt: '2026-06-24T00:00:01.000Z' },
      { id: 'n1', kind: 'notice', role: 'system', text: '天气提醒', source: 'plugin:weather', createdAt: '2026-06-24T00:00:02.000Z' },
      { id: 'a2', kind: 'dialogue', role: 'pet', text: '新的回复', source: 'ai', createdAt: '2026-06-24T00:00:03.000Z' }
    ],
    sending: false,
    error: '',
    pinned: false
  })

  assert.equal(elements['new-message-button'].hidden, true)
  assert.equal(elements['bubble-stream'].scrollTop, elements['bubble-stream'].scrollHeight)
})

test('bubble chat renderer preserves the current scroll position when state changes without changing items', async () => {
  const harness = await createHarness()
  const { apiStateListeners, elements } = harness
  const originalNodes = [...elements['bubble-items'].children]

  elements['bubble-stream'].scrollTop = 42
  apiStateListeners[0]({
    sending: false,
    error: '',
    pinned: false,
    interacting: true,
    hitTestInteractive: true
  })

  assert.equal(elements['bubble-stream'].scrollTop, 42)
  assert.deepEqual(elements['bubble-items'].children, originalNodes)
})

test('bubble chat renderer enables hit-test interaction while hovered and focused', async () => {
  const harness = await createHarness()
  const { apiCalls, documentListeners, elements, focusState } = harness
  const input = elements['mini-input']

  await dispatchDocument(documentListeners, 'mouseenter')
  focusState.activeElement = input
  await dispatch(input, 'focus')

  assert.equal(apiCalls.setHitTestMode.some((payload) => payload.interactive === true), true)
})

test('bubble chat renderer only expands the collapsed composer on double-click, not single-click', async () => {
  const harness = await createHarness()
  const { apiCalls, documentListeners, elements } = harness

  await dispatchDocument(documentListeners, 'click')

  assert.equal(elements['mini-input-form'].classList.contains('expanded'), false)
  assert.equal(apiCalls.setInteracting.includes(true), false)
  assert.equal(apiCalls.setHitTestMode.some((payload) => payload.source === 'renderer-click'), false)

  await dispatchDocument(documentListeners, 'dblclick')

  assert.equal(elements['mini-input-form'].classList.contains('expanded'), true)
  assert.equal(apiCalls.setInteracting.includes(true), true)
  assert.equal(apiCalls.setHitTestMode.some((payload) => payload.source === 'renderer-double-click' && payload.interactive === true), true)
})

test('bubble chat renderer enables passive hit-test on initial render when history is scrollable', async () => {
  const harness = await createHarness()
  const { apiCalls } = harness

  assert.equal(apiCalls.setHitTestMode.some((payload) => (
    payload.source === 'renderer-refresh-state' && payload.interactive === true
  )), true)
})

test('bubble chat renderer keeps window controls clickable for a single visible popup item', async () => {
  const harness = await createHarness({
    initialState: {
      visible: true,
      items: [
        { id: 'n1', kind: 'notice', role: 'system', text: '单条提示', source: 'plugin:weather', createdAt: '2026-06-24T00:00:02.000Z' }
      ],
      message: { id: 'n1', kind: 'notice', role: 'system', text: '单条提示', source: 'plugin:weather', createdAt: '2026-06-24T00:00:02.000Z' }
    }
  })
  const { apiCalls } = harness

  assert.equal(apiCalls.setHitTestMode.some((payload) => (
    payload.source === 'renderer-refresh-state' && payload.interactive === true
  )), true)
})

test('bubble chat renderer scrolls bubble list on wheel without scrolling the input composer', async () => {
  const harness = await createHarness()
  const { apiCalls, elements } = harness
  let inputPrevented = false

  elements['bubble-stream'].scrollTop = 24
  await dispatch(elements['bubble-stream'], 'wheel', {
    deltaY: 36,
    stopPropagation() {}
  })
  await dispatch(elements['mini-input'], 'wheel', {
    deltaY: 40,
    preventDefault() { inputPrevented = true },
    stopPropagation() {}
  })

  assert.equal(inputPrevented, true)
  assert.equal(elements['bubble-stream'].scrollTop, 60)
  assert.equal(apiCalls.setHitTestMode.some((payload) => payload.interactive === true), true)
})

test('bubble chat renderer drags the window from the bubble body without relying on a toolbar', async () => {
  const harness = await createHarness()
  const { apiCalls, documentListeners, elements } = harness
  const bubbleItem = elements['bubble-items'].children[0]

  await dispatch(elements['bubble-card'], 'pointerdown', {
    target: bubbleItem,
    pointerId: 7,
    screenX: 420,
    screenY: 360,
    preventDefault() {},
    stopPropagation() {}
  })
  await dispatchDocument(documentListeners, 'pointermove', {
    pointerId: 7,
    screenX: 455,
    screenY: 388
  })
  await dispatchDocument(documentListeners, 'pointerup', {
    pointerId: 7
  })

  assert.deepEqual(apiCalls.dragWindowTo, [{ x: 235, y: 208 }])
  assert.equal(apiCalls.setHitTestMode.some((payload) => payload.source === 'renderer-drag-start' && payload.interactive === true), true)
})

test('bubble chat renderer keeps history scrollable while awaiting reply and syncs interactive hold state to main', async () => {
  const harness = await createHarness()
  const { apiCalls, apiStateListeners, elements } = harness

  apiStateListeners[0]({
    sending: true,
    awaitingReply: true,
    interacting: false,
    hitTestInteractive: true,
    lastUserMessage: { text: '新问题', createdAt: '2026-06-24T00:00:05.000Z' }
  })

  const before = elements['bubble-stream'].scrollTop
  await dispatch(elements['bubble-stream'], 'wheel', {
    deltaY: 36,
    preventDefault() {},
    stopPropagation() {}
  })

  assert.equal(elements['bubble-stream'].scrollTop, before + 36)
  assert.equal(apiCalls.setInteracting.includes(true), true)
})
