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
          clickAction: 'idle',
          actions: [
            { id: 'idle', label: 'Idle', loop: true, sprite: 'idle.png', frameWidth: 100, frameHeight: 100, frameCount: 4, frameMs: 100 }
          ]
        }),
        setViewport: () => {},
        setMousePassthrough: () => {},
        recordAppLog: () => {},
        onSettingsChanged: (callback) => { callbacks.settings = callback },
        onPetSay: (callback) => { callbacks.say = callback },
        onPetAction: () => {},
        onAnimationsChanged: () => {},
        getBounds: async () => ({ x: 0, y: 0, width: 300, height: 300 }),
        getMovementState: async () => ({}),
        moveBy: async () => ({}),
        setPosition: () => {},
        quit: () => {},
        openSettings: () => {}
      }
    }
  }
  context.window.document = context.document
  context.globalThis = context
  vm.runInNewContext(rendererSource, context, { filename: 'renderer.js' })
  await Promise.resolve()
  await Promise.resolve()
  return { callbacks, elements, timers }
}

test('pet renderer keeps inline speech bubbles readable when legacy short durations are configured', async () => {
  const { callbacks, elements, timers } = await createRendererHarness()

  callbacks.settings({ bubbleDuration: 1300 })
  callbacks.say({ text: '短消息', ttlMs: 800 })

  assert.equal(elements.bubble.textContent, '短消息')
  assert.equal(elements.bubble.classList.contains('show'), true)
  assert.equal(timers.at(-1).delay, 4000)
})
