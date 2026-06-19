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

const createRendererHarness = async ({ insideFrame = true, insideCursorRegion = insideFrame, includeHitbox = true } = {}) => {
  const frameResults = Array.isArray(insideFrame) ? insideFrame.slice() : null
  const cursorRegionResults = Array.isArray(insideCursorRegion) ? insideCursorRegion.slice() : null
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
              getFrameHitbox: () => ({ kind: 'frame', left: 0, top: 0, right: 300, bottom: 300 }),
              getWindowHitbox: () => ({ kind: 'cursor-region', left: 0, top: 0, right: 300, bottom: 300 }),
              getViewportHitbox: () => ({ kind: 'frame', left: 0, top: 0, right: 300, bottom: 300 }),
              isPointInHitbox: (_point, hitbox) => hitbox?.kind === 'cursor-region'
                ? readHitboxResult(cursorRegionResults, insideCursorRegion)
                : readHitboxResult(frameResults, insideFrame)
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

test('custom cursor uses native CSS cursor inside the clickable pet region without drawing an overlay', async () => {
  const { callbacks, context, elements, logs } = await createRendererHarness({ insideFrame: true })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png', hotspotX: 4, hotspotY: 6 } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.values.cursor, 'url("file:///cursor.png") 4 6, auto')
  assert.equal(elements.pet.style.priorities.cursor, 'important')
  assert.equal(context.document.body.style.values.cursor, 'url("file:///cursor.png") 4 6, auto')
  assert.equal(context.document.body.style.priorities.cursor, 'important')
  assert.equal(context.document.documentElement.style.values.cursor, 'url("file:///cursor.png") 4 6, auto')
  assert.equal(context.document.documentElement.style.priorities.cursor, 'important')
  assert.equal(elements.pet.style.cursor, 'url("file:///cursor.png") 4 6, auto')
  assert.equal(logs.at(-1).details.cursorOverlayVisible, false)
})

test('custom cursor remains visible in the cursor region without expanding pet click handling', async () => {
  const { callbacks, elements, logs } = await createRendererHarness({
    insideFrame: false,
    insideCursorRegion: true
  })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.cursor, 'url("file:///cursor.png") 0 0, auto')
  assert.equal(logs.find((entry) => entry.event === 'pet:test:set-mouse-passthrough').passthrough, true)
  assert.equal(logs.at(-1).details.insideFrame, false)
  assert.equal(logs.at(-1).details.insideCursorRegion, true)
  assert.equal(logs.at(-1).details.cursorApplied, true)
  assert.equal(logs.at(-1).details.cursorOverlayVisible, false)
})

test('pet remains clickable when the optional hitbox helper is unavailable', async () => {
  const { elements, logs } = await createRendererHarness({ includeHitbox: false })

  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  const passthroughCalls = logs.filter((entry) => entry.event === 'pet:test:set-mouse-passthrough')
  assert.equal(passthroughCalls.some((entry) => entry.passthrough), false)
  assert.equal(logs.at(-1).details.passthrough, false)
})

test('transient pointerleave keeps the applied custom cursor stable', async () => {
  const { callbacks, elements } = await createRendererHarness({ insideFrame: true })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.cursor, 'url("file:///cursor.png") 0 0, auto')

  dispatch(elements.pet, 'pointerleave', { clientX: 301, clientY: 301, screenX: 1301, screenY: 901 })

  assert.equal(elements['custom-cursor-overlay'].classList.contains('visible'), false)
  assert.equal(elements.pet.style.cursor, 'url("file:///cursor.png") 0 0, auto')
})

test('transient out-of-window pointer movement keeps the applied custom cursor stable', async () => {
  const { callbacks, elements, logs } = await createRendererHarness({
    insideFrame: [true, false],
    insideCursorRegion: [true, false]
  })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements.pet.style.cursor, 'url("file:///cursor.png") 0 0, auto')

  dispatch(elements.pet, 'pointermove', { clientX: -7.4, clientY: 38.73, screenX: 992.6, screenY: 738.73 })

  assert.equal(elements.pet.style.cursor, 'url("file:///cursor.png") 0 0, auto')
  assert.equal(logs.at(-1).details.insideCursorRegion, false)
  assert.equal(logs.at(-1).details.cursorApplied, true)
})

test('pointer down does not flash the active custom cursor back to the system cursor', async () => {
  const { callbacks, elements } = await createRendererHarness({ insideFrame: true })

  callbacks.settings({ customCursor: { enabled: true, assetUrl: 'file:///cursor.png', assetPath: '/cursor.png', fileName: 'cursor.png' } })
  dispatch(elements.pet, 'pointermove', { clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements.pet.style.cursor, 'url("file:///cursor.png") 0 0, auto')

  await dispatchAsync(elements.pet, 'pointerdown', { button: 0, pointerId: 1, clientX: 24.3, clientY: 88.6, screenX: 1024.3, screenY: 768.6 })

  assert.equal(elements.pet.style.cursor, 'url("file:///cursor.png") 0 0, auto')
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
