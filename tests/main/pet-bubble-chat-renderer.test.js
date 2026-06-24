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
  classList: createClassList(),
  attributes: {},
  listeners: {},
  setAttribute(name, value) {
    this.attributes[name] = String(value)
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
    setInteracting: [],
    sendMessage: []
  }
  const apiStateListeners = []
  const documentListeners = {}
  const elements = {
    'bubble-shell': createElement('bubble-shell'),
    'source-label': createElement('source-label'),
    'message-text': createElement('message-text'),
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
        getState: async () => ({ message: { text: 'hello', source: 'Pet' }, sending: false, error: '', pinned: false }),
        hide: () => {},
        setPinned: async () => ({ pinned: true, message: { text: 'hello', source: 'Pet' } }),
        setInteracting: async (interacting) => {
          apiCalls.setInteracting.push(Boolean(interacting))
          return { message: { text: 'hello', source: 'Pet' }, sending: false, error: '', pinned: false, interacting: Boolean(interacting) }
        },
        sendMessage: async ({ message }) => {
          apiCalls.sendMessage.push(message)
          return { state: { message: { text: 'reply', source: 'ai' }, sending: false, error: '', pinned: false, interacting: false, lastUserMessage: { text: message } } }
        },
        onStateChanged: (callback) => apiStateListeners.push(callback)
      }
    },
    document: {
      getElementById: (id) => elements[id],
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
  return { apiCalls, apiStateListeners, documentListeners, elements, focusState, selection }
}

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
  assert.equal(elements['last-user-message'].textContent, '你：hello bubble')
  assert.equal(apiCalls.setInteracting.includes(false), true)
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
})
