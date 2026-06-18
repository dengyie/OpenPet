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
  closest() { return null }
})

const dispatch = (element, eventName, event = {}) => {
  for (const listener of element.listeners[eventName] || []) listener(event)
}

const createRendererHarness = async () => {
  const viewportCalls = []
  const callbacks = {}
  const elements = {
    pet: createElement('pet'),
    cat: createElement('cat'),
    bubble: createElement('bubble'),
    menu: createElement('menu', { width: 180, height: 260 }),
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
        setMousePassthrough: () => {},
        recordAppLog: () => {},
        onSettingsChanged: () => {},
        onPetSay: () => {},
        onPetAction: () => {},
        onAnimationsChanged: () => {},
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
  return { callbacks, elements, viewportCalls }
}

test('opening the menu expands the pet viewport enough to avoid clipping', async () => {
  const { elements, viewportCalls } = await createRendererHarness()
  const initialViewport = viewportCalls.at(-1)

  dispatch(elements.pet, 'contextmenu', { preventDefault() {} })

  const menuViewport = viewportCalls.at(-1)
  assert.notDeepEqual(menuViewport, initialViewport)
  assert.equal(menuViewport.scale, initialViewport.scale)
  assert.equal((menuViewport.width + menuViewport.padding * 2) * menuViewport.scale >= 204, true)
  assert.equal((menuViewport.height + menuViewport.padding * 2) * menuViewport.scale >= 284, true)
  assert.equal(elements.cat.style.left, '77px')
  assert.equal(elements.cat.style.bottom, initialViewport.padding * initialViewport.scale + 'px')
})

test('closing the menu restores the current action viewport', async () => {
  const { callbacks, elements, viewportCalls } = await createRendererHarness()
  const initialViewport = viewportCalls.at(-1)

  dispatch(elements.pet, 'contextmenu', { preventDefault() {} })
  callbacks.blur()

  assert.deepEqual(viewportCalls.at(-1), initialViewport)
  assert.equal(elements.cat.style.left, '4px')
  assert.equal(elements.cat.style.bottom, '4px')
})
