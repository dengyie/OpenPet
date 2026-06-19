const test = require('node:test')
const assert = require('node:assert/strict')

const { configureSingleInstanceLock } = require('../../src/main/single-instance')

const createFakeApp = ({ lockGranted, lockResults }) => {
  const handlers = new Map()
  const results = Array.isArray(lockResults) ? [...lockResults] : null
  return {
    quitCalls: 0,
    lockRequests: [],
    requestSingleInstanceLockCalls: 0,
    requestSingleInstanceLock(additionalData) {
      this.requestSingleInstanceLockCalls += 1
      this.lockRequests.push(additionalData)
      return results ? results.shift() : lockGranted
    },
    quit() {
      this.quitCalls += 1
    },
    on(eventName, handler) {
      handlers.set(eventName, handler)
    },
    emit(eventName, ...args) {
      handlers.get(eventName)?.(...args)
    },
    hasHandler(eventName) {
      return handlers.has(eventName)
    }
  }
}

test('configureSingleInstanceLock waits for an older instance to exit before bootstrapping the new pet', async () => {
  const app = createFakeApp({ lockResults: [false, true] })
  const delays = []

  const canBootstrap = await configureSingleInstanceLock({
    app,
    getPetWindow: () => null,
    retryDelayMs: 25,
    maxWaitMs: 100,
    sleep: async (delay) => { delays.push(delay) }
  })

  assert.equal(canBootstrap, true)
  assert.equal(app.requestSingleInstanceLockCalls, 2)
  assert.deepEqual(delays, [25])
  assert.equal(app.quitCalls, 0)
  assert.equal(app.hasHandler('second-instance'), true)
  assert.deepEqual(app.lockRequests, [
    { openpetAction: 'replace-existing' },
    { openpetAction: 'replace-existing' }
  ])
})

test('configureSingleInstanceLock quits and blocks bootstrap when the older instance does not exit', async () => {
  const app = createFakeApp({ lockGranted: false })
  let currentTime = 0

  const canBootstrap = await configureSingleInstanceLock({
    app,
    getPetWindow: () => null,
    retryDelayMs: 25,
    maxWaitMs: 50,
    sleep: async (delay) => { currentTime += delay },
    now: () => currentTime
  })

  assert.equal(canBootstrap, false)
  assert.equal(app.requestSingleInstanceLockCalls, 3)
  assert.equal(app.quitCalls, 1)
  assert.equal(app.hasHandler('second-instance'), false)
})

test('configureSingleInstanceLock quits the older pet when a replacement instance starts', async () => {
  const app = createFakeApp({ lockGranted: true })
  const calls = []
  const petWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    focus: () => calls.push('focus')
  }

  const canBootstrap = await configureSingleInstanceLock({ app, getPetWindow: () => petWindow })
  app.emit('second-instance', {}, [], '', { openpetAction: 'replace-existing' })

  assert.equal(canBootstrap, true)
  assert.deepEqual(calls, [])
  assert.equal(app.quitCalls, 1)
})

test('configureSingleInstanceLock focuses the existing pet window for a non-replacement second instance', async () => {
  const app = createFakeApp({ lockGranted: true })
  const calls = []
  const petWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    focus: () => calls.push('focus')
  }

  const canBootstrap = await configureSingleInstanceLock({ app, getPetWindow: () => petWindow })
  app.emit('second-instance')

  assert.equal(canBootstrap, true)
  assert.deepEqual(calls, ['restore', 'focus'])
  assert.equal(app.quitCalls, 0)
})
