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
  src: '',
  classList: createClassList(),
  appendChild(child) { this.children.push(child) },
  addEventListener(eventName, callback) {
    this.listeners[eventName] ||= []
    this.listeners[eventName].push(callback)
  },
  listeners: {},
  setPointerCapture() {},
  closest() { return null }
})

const createRendererHarness = async ({ insideFrame = true } = {}) => {
  const elements = {
    pet: createElement('pet'),
    cat: createElement('cat'),
    bubble: createElement('bubble'),
    menu: createElement('menu'),
    'custom-cursor-overlay': createElement('custom-cursor-overlay')
  }
  const callbacks = {}
  const logs = []
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
      OpenPetCursorStyle: require('../src/shared/cursor-style'),
      OpenPetHitbox: {
        getFrameHitbox: () => ({ left: 0, top: 0, right: 300, bottom: 300 }),
        getWindowHitbox: () => ({ left: 0, top: 0, right: 300, bottom: 300 }),
        getViewportHitbox: () => ({ left: 0, top: 0, right: 300, bottom: 300 }),
        isPointInHitbox: () => insideFrame
      },
      clearTimeout: () => {},
      addEventListener: () => {},
      setInterval: () => 0,
      setTimeout: () => 0,
      petAPI: {
        getAnimations: async () => ({
          defaultAction: 'idle',
          clickAction: 'waving',
          actions: [
            { id: 'idle', label: 'Idle', loop: true, sprite: 'idle.png', frameWidth: 100, frameHeight: 100, frameCount: 4, frameMs: 100 },
            { id: 'waving', label: 'Waving', loop: false, sprite: 'waving.png', frameWidth: 100, frameHeight: 100, frameCount: 4, frameMs: 100 }
          ]
        }),
        setViewport: () => {},
        setMousePassthrough: () => {},
        recordAppLog: (entry) => logs.push(entry),
        onSettingsChanged: (callback) => { callbacks.settings = callback },
        onPetSay: () => {},
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
  return { callbacks, elements, logs }
}

const dispatch = (element, eventName, event) => {
  for (const listener of element.listeners[eventName] || []) listener(event)
}

test('custom cursor overlay follows pointer inside the clickable pet region', async () => {
  const { callbacks, elements, logs } = await createRendererHarness({ insideFrame: true })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].src, 'file:///cursor.png')
  assert.equal(elements['custom-cursor-overlay'].style.transform, 'translate3d(24px, 89px, 0)')
  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), true)
  assert.equal(elements.pet.style.cursor, 'none')
  assert.equal(logs.at(-1).details.cursorOverlayVisible, true)
})

test('custom cursor overlay aligns the image using hotspot offsets', async () => {
  const { callbacks, elements } = await createRendererHarness({ insideFrame: true })

  callbacks.settings({
    customCursor: {
      enabled: true,
      assetUrl: 'file:///cursor.png',
      assetPath: '/cursor.png',
      fileName: 'cursor.png',
      hotspotX: 4,
      hotspotY: 6
    }
  })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].style.transform, 'translate3d(20px, 83px, 0)')
})

test('custom cursor overlay hides outside the clickable pet region', async () => {
  const { callbacks, elements, logs } = await createRendererHarness({ insideFrame: false })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.cursor, '')
  assert.equal(logs.at(-1).details.cursorOverlayVisible, false)
})

test('custom cursor overlay clears when the pointer leaves the pet surface', async () => {
  const { callbacks, elements } = await createRendererHarness({ insideFrame: true })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), true)
  assert.equal(elements.pet.style.cursor, 'none')

  dispatch(elements.pet, 'pointerleave', { clientX: 301, clientY: 301, screenX: 1301, screenY: 901 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.cursor, '')
})
