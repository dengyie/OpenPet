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
  const context = {
    console,
    document: {
      documentElement: { style: createStyle() },
      body: { style: createStyle() },
      hasFocus: () => hasFocus,
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
        setMousePassthrough: (passthrough) => logs.push({ event: 'pet:test:set-mouse-passthrough', passthrough }),
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
  return { callbacks, elements, logs, context }
}

const dispatch = (element, eventName, event) => {
  for (const listener of element.listeners[eventName] || []) listener(event)
}

const dispatchAsync = async (element, eventName, event) => {
  for (const listener of element.listeners[eventName] || []) await listener(event)
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
  assert.equal(logs.at(-1).details.nativeCursor, 'none')
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

test('pointerleave clears the DOM cursor overlay and restores the native cursor', async () => {
  const { callbacks, elements } = await createRendererHarness({ insideFrame: true })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), true)
  assert.equal(elements.pet.style.cursor, 'none')

  dispatch(elements.pet, 'pointerleave', { clientX: 301, clientY: 301, screenX: 1301, screenY: 901 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.cursor, '')
})

test('transient out-of-window pointer movement clears the DOM cursor overlay', async () => {
  const { callbacks, elements, logs } = await createRendererHarness({
    insideFrame: [true, false],
    insideCursorRegion: [true, false]
  })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements.pet.style.cursor, 'none')
  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), true)

  dispatch(elements.pet, 'pointermove', { clientX: -7.4, clientY: 38.73, screenX: 992.6, screenY: 738.73 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.cursor, '')
  assert.equal(logs.at(-1).details.insideCursorRegion, false)
  assert.equal(logs.at(-1).details.cursorApplied, false)
})

test('pointer down does not flash the active custom cursor back to the system cursor', async () => {
  const { callbacks, elements } = await createRendererHarness({ insideFrame: true })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements.pet.style.cursor, 'none')
  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), true)

  await dispatchAsync(elements.pet, 'pointerdown', { button: 0, pointerId: 1, clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements.pet.style.cursor, 'none')
  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), true)
})

test('unfocused pet window uses native custom cursor instead of DOM overlay to avoid double cursors', async () => {
  const { callbacks, context, elements, logs } = await createRendererHarness({
    insideFrame: true,
    hasFocus: false
  })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png', hotspotX: 4, hotspotY: 6 } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.cursor, 'url("file:///cursor.png") 4 6, auto')
  assert.equal(context.document.body.style.cursor, 'url("file:///cursor.png") 4 6, auto')
  assert.equal(context.document.documentElement.style.cursor, 'url("file:///cursor.png") 4 6, auto')
  assert.equal(logs.at(-1).details.cursorOverlayVisible, false)
  assert.equal(logs.at(-1).details.nativeCursor, 'url("file:///cursor.png") 4 6, auto')
  assert.equal(logs.at(-1).details.windowFocused, false)
})

test('pointer leave does not cancel passthrough while hovering transparent pet padding', async () => {
  const { elements, logs } = await createRendererHarness({ insideFrame: [false, true] })

  dispatch(elements.pet, 'pointermove', { clientX: 1, clientY: 1, screenX: 1001, screenY: 701 })
  dispatch(elements.pet, 'pointerleave', { clientX: -1, clientY: -1, screenX: 999, screenY: 699 })

  const passthroughCalls = logs.filter((entry) => entry.event === 'pet:test:set-mouse-passthrough')
  assert.deepEqual(passthroughCalls.map((entry) => entry.passthrough), [true])
})

test('pointer movement back over the visible pet restores click handling after passthrough', async () => {
  const { elements, logs } = await createRendererHarness({
    insideFrame: [false, true],
    insideCursorRegion: [true, true]
  })

  dispatch(elements.pet, 'pointermove', { clientX: 1, clientY: 1, screenX: 1001, screenY: 701 })
  dispatch(elements.pet, 'pointermove', { clientX: 140, clientY: 140, screenX: 1140, screenY: 840 })

  const passthroughCalls = logs.filter((entry) => entry.event === 'pet:test:set-mouse-passthrough')
  assert.deepEqual(passthroughCalls.map((entry) => entry.passthrough), [true, false])
})
