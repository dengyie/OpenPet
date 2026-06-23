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

const createRendererHarness = async ({ insideFrame = true } = {}) => {
  const viewportCalls = []
  const contextMenuRequests = []
  const mousePassthroughCalls = []
  const callbacks = {}
  const logs = []
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
        isPointInHitbox: () => insideFrame
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
        recordAppLog: (entry) => logs.push(entry),
        onSettingsChanged: () => {},
        onPetSay: () => {},
        onPetAction: () => {},
        onPetMenuCommand: () => {},
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
  return { callbacks, contextMenuRequests, elements, logs, mousePassthroughCalls, viewportCalls }
}

test('right-click delegates menu display without resizing the pet viewport', async () => {
  const { contextMenuRequests, elements, viewportCalls } = await createRendererHarness()
  const initialViewport = viewportCalls.at(-1)
  let prevented = false

  dispatch(elements.pet, 'contextmenu', {
    clientX: 12,
    clientY: 18,
    preventDefault() { prevented = true }
  })

  const menuViewport = viewportCalls.at(-1)
  assert.notDeepEqual(menuViewport, initialViewport)
  assert.equal(menuViewport.scale, initialViewport.scale)
  assert.equal((menuViewport.width + menuViewport.padding * 2) * menuViewport.scale >= 204, true)
  assert.equal((menuViewport.height + menuViewport.padding * 2) * menuViewport.scale >= 284, true)
  assert.equal(px(elements.cat.style.left) > px(elements.cat.style.width), true)
  assert.equal(elements.cat.style.bottom, initialViewport.padding * initialViewport.scale + 'px')
})

test('opening the menu places it away from the pet instead of covering it', async () => {
  const { elements, viewportCalls } = await createRendererHarness()

  await dispatch(elements.pet, 'contextmenu', { preventDefault() {} })

  const menuViewport = viewportCalls.at(-1)
  const windowWidth = (menuViewport.width + menuViewport.padding * 2) * menuViewport.scale
  const windowHeight = (menuViewport.height + menuViewport.padding * 2) * menuViewport.scale
  const menuRect = {
    left: px(elements.menu.style.left),
    top: px(elements.menu.style.top),
    right: px(elements.menu.style.left) + 180,
    bottom: px(elements.menu.style.top) + 260
  }
  const catRect = {
    left: px(elements.cat.style.left),
    top: windowHeight - px(elements.cat.style.bottom) - 50,
    right: px(elements.cat.style.left) + 50,
    bottom: windowHeight - px(elements.cat.style.bottom)
  }

  assert.equal(Number.isFinite(menuRect.left), true)
  assert.equal(Number.isFinite(menuRect.top), true)
  assert.equal(menuRect.left >= 12, true)
  assert.equal(menuRect.top >= 12, true)
  assert.equal(menuRect.right <= windowWidth - 12, true)
  assert.equal(rectsOverlap(menuRect, catRect), false)
})

test('clicking outside the open menu closes it without starting a pet drag', async () => {
  const { elements, getBoundsCalls, viewportCalls } = await createRendererHarness()
  const initialViewport = viewportCalls.at(-1)

  await dispatch(elements.pet, 'contextmenu', { preventDefault() {} })
  await dispatch(elements.pet, 'pointerdown', {
    button: 0,
    target: elements.pet,
    preventDefault() {},
    pointerId: 1,
    clientX: 8,
    clientY: 8,
    screenX: 8,
    screenY: 8
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

test('pet viewport reserves top chrome space for the speech bubble', async () => {
  const { elements, viewportCalls } = await createRendererHarness()
  const initialViewport = viewportCalls.at(-1)

  dispatch(elements.pet, 'contextmenu', { clientX: 12, clientY: 18, preventDefault() {} })
  callbacks.blur()

  assert.deepEqual(viewportCalls.at(-1), initialViewport)
  assert.equal(elements.cat.style.left, initialCatLeft)
  assert.equal(elements.cat.style.bottom, initialCatBottom)
})

test('single-click stops an active walk without waiting for the walk timer', async () => {
  const { elements, logs } = await createRendererHarness()

  await dispatch(elements.pet, 'dblclick')
  await dispatch(elements.pet, 'pointerdown', { button: 0, pointerId: 1, clientX: 24, clientY: 30, screenX: 1024, screenY: 768 })
  await dispatch(elements.pet, 'pointerup', { pointerId: 1, clientX: 24, clientY: 30, screenX: 1024, screenY: 768 })

  const walkStates = logs
    .filter((entry) => entry.event === 'pet.walk.toggled')
    .map((entry) => entry.details.walking)
  assert.deepEqual(walkStates, [true, false])
})

test('walking keeps mouse handling enabled so the context menu remains reachable', async () => {
  const { elements, mousePassthroughCalls } = await createRendererHarness({ insideFrame: false })

  await dispatch(elements.pet, 'dblclick')
  await dispatch(elements.pet, 'pointermove', { clientX: 1, clientY: 1, screenX: 1001, screenY: 701 })

  assert.deepEqual(mousePassthroughCalls, [])
})

test('single-click stops an active walk without waiting for the walk timer', async () => {
  const { elements, logs } = await createRendererHarness()

  await dispatch(elements.pet, 'dblclick')
  await dispatch(elements.pet, 'pointerdown', { button: 0, pointerId: 1, clientX: 24, clientY: 30, screenX: 1024, screenY: 768 })
  await dispatch(elements.pet, 'pointerup', { pointerId: 1, clientX: 24, clientY: 30, screenX: 1024, screenY: 768 })

  const walkStates = logs
    .filter((entry) => entry.event === 'pet.walk.toggled')
    .map((entry) => entry.details.walking)
  assert.deepEqual(walkStates, [true, false])
})

test('walking keeps mouse handling enabled so the context menu remains reachable', async () => {
  const { elements, mousePassthroughCalls } = await createRendererHarness({ insideFrame: false })

  await dispatch(elements.pet, 'dblclick')
  await dispatch(elements.pet, 'pointermove', { clientX: 1, clientY: 1, screenX: 1001, screenY: 701 })

  assert.deepEqual(mousePassthroughCalls, [])
})
