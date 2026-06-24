const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf-8')

const createStyle = () => ({
  values: {},
  setProperty(name, value) {
    this.values[name] = String(value)
  }
})

const createClassList = () => ({
  values: new Set(),
  add(value) { this.values.add(value) },
  remove(value) { this.values.delete(value) },
  contains(value) { return this.values.has(value) }
})

const createElement = (id = '') => ({
  id,
  style: createStyle(),
  dataset: {},
  textContent: '',
  children: [],
  classList: createClassList(),
  appendChild(child) { this.children.push(child) },
  addEventListener() {},
  setPointerCapture() {},
  closest() { return null }
})

const createRendererHarness = async () => {
  const callbacks = {}
  const timers = []
  const bubbleChatMessages = []
  const elements = {
    pet: createElement('pet'),
    cat: createElement('cat'),
    bubble: createElement('bubble'),
    menu: createElement('menu'),
    'custom-cursor-overlay': createElement('custom-cursor-overlay')
  }
  const context = {
    console,
    document: {
      documentElement: { style: createStyle() },
      body: { style: createStyle() },
      getElementById: (id) => elements[id],
      createElement: () => createElement()
    },
    window: {
      innerWidth: 300,
      innerHeight: 300,
      OpenPetCursorStyle: { resolvePetCursorStyle: () => '', resolvePetCursorOverlayState: () => ({ visible: false, assetUrl: '', nativeCursor: '' }) },
      OpenPetHitbox: {
        getFrameHitbox: () => ({ left: 0, top: 0, right: 300, bottom: 300 }),
        getWindowHitbox: () => ({ left: 0, top: 0, right: 300, bottom: 300 }),
        getViewportHitbox: () => ({ left: 0, top: 0, right: 300, bottom: 300 }),
        isPointInHitbox: () => true
      },
      clearTimeout: () => {},
      addEventListener: () => {},
      setInterval: () => 0,
      setTimeout: (callback, delay) => {
        const timer = { callback, delay }
        timers.push(timer)
        return timer
      },
      petAPI: {
        getAnimations: async () => ({
          defaultAction: 'idle',
          clickAction: 'feed',
          actions: [
            { id: 'idle', label: 'Idle', loop: true, sprite: 'idle.png', frameWidth: 100, frameHeight: 100, frameCount: 4, frameMs: 100 },
            { id: 'feed', label: '喂食', loop: false, sprite: 'feed.png', frameWidth: 100, frameHeight: 100, frameCount: 4, frameMs: 100 }
          ]
        }),
        setViewport: () => {},
        setMousePassthrough: () => {},
        recordAppLog: () => {},
        onSettingsChanged: (callback) => { callbacks.settings = callback },
        onPetSay: (callback) => { callbacks.say = callback },
        onPetAction: (callback) => { callbacks.petAction = callback },
        onPetMenuCommand: (callback) => { callbacks.menuCommand = callback },
        onAnimationsChanged: () => {},
        getBounds: async () => ({ x: 0, y: 0, width: 300, height: 300 }),
        getMovementState: async () => ({}),
        moveBy: async () => ({}),
        setPosition: () => {},
        quit: () => {},
        openSettings: () => {},
        showBubbleChatMessage: (payload) => {
          bubbleChatMessages.push(payload)
          return Promise.resolve({ visible: true })
        }
      }
    }
  }
  context.window.document = context.document
  context.globalThis = context
  vm.runInNewContext(rendererSource, context, { filename: 'renderer.js' })
  await Promise.resolve()
  await Promise.resolve()
  return { bubbleChatMessages, callbacks, elements, timers }
}

test('pet renderer routes local speech to the floating bubble chat and keeps legacy inline bubble hidden', async () => {
  const { bubbleChatMessages, callbacks, elements } = await createRendererHarness()

  callbacks.settings({ bubbleDuration: 1300 })
  callbacks.menuCommand({ command: 'walk' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(elements.bubble.textContent, '')
  assert.equal(elements.bubble.classList.contains('show'), false)
  assert.equal(bubbleChatMessages.at(-1).text, '出发')
  assert.equal(bubbleChatMessages.at(-1).ttlMs, 4000)

  callbacks.say({ text: '主进程消息不应再进入宠物内联气泡', ttlMs: 800 })

  assert.equal(elements.bubble.textContent, '')
  assert.equal(elements.bubble.classList.contains('show'), false)
  assert.equal(
    bubbleChatMessages.some((payload) => payload.text === '主进程消息不应再进入宠物内联气泡'),
    false
  )
})

test('pet renderer does not let main-process actions replace the floating bubble chat text', async () => {
  const { bubbleChatMessages, callbacks, elements } = await createRendererHarness()
  bubbleChatMessages.length = 0

  callbacks.petAction({ actionId: 'feed', source: 'ai' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(elements.bubble.textContent, '')
  assert.equal(elements.bubble.classList.contains('show'), false)
  assert.equal(bubbleChatMessages.some((payload) => payload.text === '喂食'), false)
})
