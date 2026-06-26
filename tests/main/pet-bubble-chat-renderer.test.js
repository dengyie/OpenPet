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
  setAttribute(name, value) {
    this.attributes[name] = String(value)
  },
  appendChild(child) {
    this.children.push(child)
    this.textContent = this.children.map((node) => node.textContent || '').join('')
    this.scrollHeight = Math.max(this.scrollHeight, this.children.length * 36)
  },
  replaceChildren(...children) {
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
  }
})

const dispatch = async (target, eventName, event = {}) => {
  for (const listener of target.listeners?.[eventName] || []) {
    await listener(event)
  }
}

const dispatchDocument = async (documentListeners, eventName, event = {}) => {
  for (const listener of documentListeners[eventName] || []) {
    await listener(event)
  }
}

const createHarness = async () => {
  const apiCalls = {
    hide: [],
    openFullChat: [],
    setInteracting: [],
    setHitTestMode: [],
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
    pinned: false
  })
  let latestState = baseState()
  let failOpenFullChat = false
  const apiStateListeners = []
  const documentListeners = {}
  const elements = {
    'bubble-shell': createElement('bubble-shell'),
    'source-label': createElement('source-label'),
    'bubble-stream': createElement('bubble-stream'),
    'bubble-items': createElement('bubble-items'),
    'new-message-button': createElement('new-message-button'),
    'open-full-chat-button': createElement('open-full-chat-button'),
    'pin-button': createElement('pin-button'),
    'close-button': createElement('close-button'),
    'last-user-message': createElement('last-user-message'),
    'error-message': createElement('error-message'),
    'mini-input-form': createElement('mini-input-form'),
    'mini-input': createElement('mini-input'),
    'send-button': createElement('send-button')
  }
  const selection = { text: '' }
  const focusState = { activeElement: null }
  elements['mini-input'].blur = () => {
    focusState.activeElement = null
  }
  const context = {
    console,
    window: {
      addEventListener() {},
      getSelection: () => selection.text,
      petBubbleChatAPI: {
        getState: async () => latestState,
        hide: () => {
          apiCalls.hide.push(true)
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
        openFullChat: async () => {
          if (failOpenFullChat) throw new Error('open failed')
          apiCalls.openFullChat.push(true)
          return { opened: true }
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
    selection,
    setOpenFullChatFailure(value) {
      failOpenFullChat = Boolean(value)
    }
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
  assert.equal(elements['source-label'].textContent, 'plugin:weather')
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
  assert.equal(apiCalls.setHitTestMode.at(-1).interactive, false)
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

test('bubble chat renderer keeps interaction while text is selected and releases it after selection clears', async () => {
  const harness = await createHarness()
  const { apiCalls, documentListeners, selection } = harness

  selection.text = 'copied text'
  await dispatchDocument(documentListeners, 'selectionchange')
  selection.text = ''
  await dispatchDocument(documentListeners, 'selectionchange')

  assert.equal(apiCalls.setInteracting.at(-2), true)
  assert.equal(apiCalls.setInteracting.at(-1), false)
  assert.equal(apiCalls.setHitTestMode.at(-2).interactive, true)
  assert.equal(apiCalls.setHitTestMode.at(-1).interactive, false)
})

test('bubble chat renderer can hand off to the full chat window and hide the popup', async () => {
  const harness = await createHarness()
  const { apiCalls, elements } = harness

  await dispatch(elements['open-full-chat-button'], 'click', {
    stopPropagation() {}
  })

  assert.deepEqual(apiCalls.openFullChat, [true])
  assert.equal(apiCalls.setInteracting.at(-1), false)
  assert.equal(apiCalls.setHitTestMode.at(-1).interactive, false)
  assert.deepEqual(apiCalls.hide, [true])
})

test('bubble chat renderer keeps the popup interactive when full chat handoff fails', async () => {
  const harness = await createHarness()
  const { apiCalls, elements, setOpenFullChatFailure } = harness
  setOpenFullChatFailure(true)

  await dispatch(elements['open-full-chat-button'], 'click', {
    stopPropagation() {}
  })

  assert.deepEqual(apiCalls.openFullChat, [])
  assert.equal(apiCalls.setInteracting.at(-1), true)
  assert.equal(apiCalls.setHitTestMode.at(-1).interactive, true)
  assert.deepEqual(apiCalls.hide, [])
})

test('bubble chat renderer shows and clears a new-message prompt while user is interacting', async () => {
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

  assert.equal(elements['new-message-button'].hidden, false)
  assert.equal(elements['new-message-button'].textContent, '有新消息')

  await dispatch(elements['new-message-button'], 'click', { stopPropagation() {} })

  assert.equal(elements['new-message-button'].hidden, true)
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
