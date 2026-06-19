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

const createElement = (id = '', rect = { width: 0, height: 0 }) => ({
  id,
  style: createStyle(),
  dataset: {},
  textContent: '',
  children: [],
  className: '',
  classList: createClassList(),
  appendChild(child) { this.children.push(child) },
  addEventListener(eventName, callback) {
    this.listeners[eventName] ||= []
    this.listeners[eventName].push(callback)
  },
  listeners: {},
  getBoundingClientRect: () => rect,
  setPointerCapture() {},
  closest(selector) { return selector === '#menu' && id === 'menu' ? this : null }
})

const dispatch = async (element, eventName, event = {}) => {
  for (const listener of element.listeners[eventName] || []) await listener(event)
}

const createRendererHarness = async () => {
  const viewportCalls = []
  const contextMenuRequests = []
  const mousePassthroughCalls = []
  const callbacks = {}
  const elements = {
    pet: createElement('pet'),
    cat: createElement('cat'),
    bubble: createElement('bubble'),
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
      innerWidth: 58,
      innerHeight: 58,
      OpenPetCursorStyle: { resolvePetCursorStyle: () => '', resolvePetCursorOverlayState: () => ({ visible: false, assetUrl: '', nativeCursor: '' }) },
      OpenPetHitbox: {
        getFrameHitbox: () => ({ left: 0, top: 0, right: 58, bottom: 58 }),
        getWindowHitbox: () => ({ left: 0, top: 0, right: 58, bottom: 58 }),
        getViewportHitbox: () => ({ left: 0, top: 0, right: 58, bottom: 58 }),
        isPointInHitbox: () => true
      },
      clearTimeout: () => {},
      addEventListener(eventName, callback) { callbacks[eventName] = callback },
      setInterval: () => 0,
      setTimeout: () => 0,
      petAPI: {
        getAnimations: async () => ({
          defaultAction: 'idle',
          clickAction: 'idle',
          actions: [
            { id: 'idle', label: 'Idle', loop: true, sprite: 'idle.png', frameWidth: 100, frameHeight: 100, frameCount: 4, frameMs: 100 }
          ]
        }),
        setViewport: (viewport) => viewportCalls.push(viewport),
        setMousePassthrough: (passthrough) => mousePassthroughCalls.push(passthrough),
        recordAppLog: () => {},
        onSettingsChanged: () => {},
        onPetSay: () => {},
        onPetAction: () => {},
        onAnimationsChanged: () => {},
        showContextMenu: (point) => contextMenuRequests.push(point),
        getBounds: async () => ({ x: 0, y: 0, width: 58, height: 58 }),
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
  return { callbacks, contextMenuRequests, elements, mousePassthroughCalls, viewportCalls }
}

test('right-click delegates menu placement to the main-process menu', async () => {
  const { contextMenuRequests, elements, mousePassthroughCalls, viewportCalls } = await createRendererHarness()
  const initialViewport = viewportCalls.at(-1)
  let prevented = false

  await dispatch(elements.pet, 'contextmenu', {
    clientX: 12,
    clientY: 18,
    preventDefault() { prevented = true }
  })

  assert.equal(prevented, true)
  assert.equal(contextMenuRequests.length, 1)
  assert.equal(contextMenuRequests[0].x, 12)
  assert.equal(contextMenuRequests[0].y, 18)
  assert.deepEqual(viewportCalls.at(-1), initialViewport)
  assert.notEqual(mousePassthroughCalls.at(-1), true)
})

test('right-clicking the pet does not resize or offset the current action viewport', async () => {
  const { contextMenuRequests, elements, viewportCalls } = await createRendererHarness()
  const initialViewport = viewportCalls.at(-1)
  const initialCatLeft = elements.cat.style.left
  const initialCatBottom = elements.cat.style.bottom

  await dispatch(elements.pet, 'contextmenu', {
    clientX: 24,
    clientY: 30,
    preventDefault() {}
  })

  assert.equal(contextMenuRequests.length, 1)
  assert.equal(contextMenuRequests[0].x, 24)
  assert.equal(contextMenuRequests[0].y, 30)
  assert.deepEqual(viewportCalls.at(-1), initialViewport)
  assert.equal(elements.cat.style.left, initialCatLeft)
  assert.equal(elements.cat.style.bottom, initialCatBottom)
})

test('menu blur leaves the current action viewport intact', async () => {
  const { callbacks, elements, viewportCalls } = await createRendererHarness()
  const initialViewport = viewportCalls.at(-1)
  const initialCatLeft = elements.cat.style.left
  const initialCatBottom = elements.cat.style.bottom

  await dispatch(elements.pet, 'contextmenu', {
    clientX: 14,
    clientY: 16,
    preventDefault() {}
  })
  callbacks.blur()

  assert.deepEqual(viewportCalls.at(-1), initialViewport)
  assert.equal(elements.cat.style.left, initialCatLeft)
  assert.equal(elements.cat.style.bottom, initialCatBottom)
})
