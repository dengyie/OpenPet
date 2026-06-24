const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf-8')

const createStyle = () => ({
  values: {},
  priorities: {},
  setProperty(name, value, priority = '') {
    this.values[name] = String(value)
    this.priorities[name] = String(priority)
  },
  get cursor() {
    return this.values.cursor || ''
  },
  set cursor(value) {
    this.values.cursor = String(value || '')
    this.priorities.cursor = ''
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

const createRendererHarness = async ({ insideFrame = true, insideCursorRegion, includeHitbox = true, hasFocus = true } = {}) => {
  const frameResults = Array.isArray(insideFrame) ? insideFrame.slice() : null
  const cursorRegionResults = insideCursorRegion === undefined
    ? null
    : Array.isArray(insideCursorRegion) ? insideCursorRegion.slice() : null
  const focusState = { value: Boolean(hasFocus) }
  const windowListeners = {}
  const readHitboxResult = (source, fallback) => {
    if (!source) return fallback
    if (source.length === 0) return fallback
    const value = source.shift()
    return value ?? source.at(-1) ?? fallback
  }
  const elements = {
    pet: createElement('pet'),
    cat: createElement('cat'),
    bubble: createElement('bubble'),
    menu: createElement('menu'),
    'custom-cursor-overlay': createElement('custom-cursor-overlay')
  }
  const callbacks = {}
  const logs = []
  const focusRequests = []
  const context = {
    console,
    document: {
      documentElement: { style: createStyle() },
      body: { style: createStyle() },
      hasFocus: () => focusState.value,
      getElementById: (id) => elements[id],
      createElement: () => createElement()
    },
    window: {
      innerWidth: 300,
      innerHeight: 300,
      OpenPetCursorStyle: require('../src/shared/cursor-style'),
      ...(includeHitbox
        ? {
            OpenPetHitbox: {
              getFrameHitbox: () => ({ left: 0, top: 0, right: 300, bottom: 300, type: 'frame' }),
              getWindowHitbox: () => ({ left: 0, top: 0, right: 300, bottom: 300, type: 'window' }),
              getViewportHitbox: () => ({ left: 0, top: 0, right: 300, bottom: 300, type: 'viewport' }),
              isPointInHitbox: (_point, hitbox) => {
                if (hitbox?.type === 'window') {
                  return insideCursorRegion === undefined
                    ? readHitboxResult(frameResults, insideFrame)
                    : readHitboxResult(cursorRegionResults, insideCursorRegion)
                }
                return readHitboxResult(frameResults, insideFrame)
              }
            }
          }
        : {}),
      clearTimeout: () => {},
      addEventListener: (eventName, callback) => {
        windowListeners[eventName] ||= []
        windowListeners[eventName].push(callback)
      },
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
        setMousePassthrough: (passthrough) => logs.push({ event: 'pet:test:set-mouse-passthrough', passthrough }),
        recordAppLog: (entry) => logs.push(entry),
        requestFocusForCursor: () => focusRequests.push({ event: 'pet:test:request-focus-for-cursor' }),
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
  return { callbacks, elements, focusRequests, focusState, logs, context, windowListeners }
}

const dispatch = (element, eventName, event) => {
  for (const listener of element.listeners[eventName] || []) listener(event)
}

const dispatchAsync = async (element, eventName, event) => {
  for (const listener of element.listeners[eventName] || []) await listener(event)
}

const dispatchWindow = (listeners, eventName) => {
  for (const listener of listeners[eventName] || []) listener()
}

test('custom cursor uses a DOM overlay inside the clickable pet region and hides the native cursor', async () => {
  const { callbacks, context, elements, logs } = await createRendererHarness({ insideFrame: true })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png', hotspotX: 4, hotspotY: 6 } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), true)
  assert.equal(elements['custom-cursor-overlay'].src, 'file:///cursor.png')
  assert.equal(elements['custom-cursor-overlay'].style.transform, 'translate3d(20px, 83px, 0)')
  assert.equal(elements.pet.style.values.cursor, 'none')
  assert.equal(elements.pet.style.priorities.cursor, 'important')
  assert.equal(context.document.body.style.values.cursor, 'none')
  assert.equal(context.document.body.style.priorities.cursor, 'important')
  assert.equal(context.document.documentElement.style.values.cursor, 'none')
  assert.equal(context.document.documentElement.style.priorities.cursor, 'important')
  assert.equal(elements.pet.style.cursor, 'none')
  assert.equal(logs.at(-1).details.cursorOverlayVisible, true)
})

test('custom cursor waits for pet focus before drawing overlay to avoid duplicate OS cursors', async () => {
  const { callbacks, elements, focusRequests, focusState, logs, windowListeners } = await createRendererHarness({
    insideFrame: true,
    hasFocus: false
  })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.cursor, '')
  assert.equal(focusRequests.length, 1)
  assert.equal(logs.at(-1).details.windowFocused, false)
  assert.equal(logs.at(-1).details.cursorOverlayVisible, false)

  focusState.value = true
  dispatchWindow(windowListeners, 'focus')

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), true)
  assert.equal(elements.pet.style.values.cursor, 'none')
  assert.equal(elements.pet.style.priorities.cursor, 'important')
  assert.equal(focusRequests.length, 1)
  assert.equal(logs.at(-1).details.windowFocused, true)
  assert.equal(logs.at(-1).details.cursorOverlayVisible, true)
})

test('custom cursor is not shown in passthrough-only padding so desktop clicks are not trapped', async () => {
  const { callbacks, elements, logs } = await createRendererHarness({
    insideFrame: false,
    insideCursorRegion: true
  })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.cursor, '')
  assert.equal(logs.find((entry) => entry.event === 'pet:test:set-mouse-passthrough').passthrough, true)
  assert.equal(logs.at(-1).details.insideFrame, false)
  assert.equal(logs.at(-1).details.insideCursorRegion, true)
  assert.equal(logs.at(-1).details.cursorApplied, false)
  assert.equal(logs.at(-1).details.cursorOverlayVisible, false)
})

test('custom cursor stays inactive in passthrough cursor padding without expanding click handling', async () => {
  const { callbacks, elements, logs } = await createRendererHarness({ insideFrame: false, insideCursorRegion: true })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 0.2, clientY: 78.5, screenX: 1250.2, screenY: 782.5 })

  const passthroughCalls = logs.filter((entry) => entry.event === 'pet:test:set-mouse-passthrough')
  assert.equal(elements.pet.style.cursor, '')
  assert.equal(logs.at(-1).details.insideFrame, false)
  assert.equal(logs.at(-1).details.insideCursorRegion, true)
  assert.equal(logs.at(-1).details.cursorApplied, false)
  assert.deepEqual(passthroughCalls.map((entry) => entry.passthrough), [true])
})

test('pet remains clickable when the optional hitbox helper is unavailable', async () => {
  const { elements, logs } = await createRendererHarness({ includeHitbox: false })

  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  const passthroughCalls = logs.filter((entry) => entry.event === 'pet:test:set-mouse-passthrough')
  assert.equal(passthroughCalls.some((entry) => entry.passthrough), false)
  assert.equal(logs.at(-1).details.passthrough, false)
})
