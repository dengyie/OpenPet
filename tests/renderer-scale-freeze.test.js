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

const createElement = (id = '') => ({
  id,
  style: createStyle(),
  dataset: {},
  textContent: '',
  children: [],
  classList: {
    values: new Set(),
    add(value) { this.values.add(value) },
    remove(value) { this.values.delete(value) },
    contains(value) { return this.values.has(value) }
  },
  appendChild(child) { this.children.push(child) },
  addEventListener() {},
  setPointerCapture() {},
  closest() { return null }
})

const createRendererHarness = async () => {
  const elements = {
    pet: createElement('pet'),
    cat: createElement('cat'),
    bubble: createElement('bubble'),
    menu: createElement('menu')
  }
  let nextTimerId = 1
  const activeTimers = new Map()
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
      OpenPetCursorStyle: { resolvePetCursorStyle: () => '' },
      OpenPetHitbox: {
        getFrameHitbox: () => ({ left: 0, top: 0, right: 1, bottom: 1 }),
        getWindowHitbox: () => ({ left: 0, top: 0, right: 1, bottom: 1 }),
        getViewportHitbox: () => ({ left: 0, top: 0, right: 1, bottom: 1 }),
        isPointInHitbox: () => true
      },
      clearTimeout: (id) => activeTimers.delete(id),
      addEventListener: () => {},
      setInterval: () => 0,
      setTimeout: (_callback, delay) => {
        const id = nextTimerId++
        activeTimers.set(id, delay)
        return id
      },
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
        onPetSay: (callback) => { callbacks.say = callback },
        onPetAction: (callback) => { callbacks.action = callback },
        onAnimationsChanged: (callback) => { callbacks.animations = callback },
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
  return { activeTimers, callbacks, elements, logs }
}

test('scale changes freeze the pet on the default action instead of continuing an animation', async () => {
  const { activeTimers, callbacks, elements, logs } = await createRendererHarness()

  callbacks.action({ actionId: 'waving' })
  assert.ok([...activeTimers.values()].includes(100))

  callbacks.settings({ scale: 0.5 })

  const actionEvents = logs.filter((entry) => entry.event === 'pet.action.changed')
  assert.equal(actionEvents.at(-1).details.nextAction, 'idle')
  assert.equal(elements.cat.style.width, '25px')
  assert.equal(elements.cat.style.height, '25px')
  assert.equal(elements.cat.style.backgroundPositionX, '0px')
  assert.equal(elements.cat.style.backgroundPositionY, '0px')
  assert.equal([...activeTimers.values()].includes(100), false)
})
