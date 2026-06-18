const test = require('node:test')
const assert = require('node:assert/strict')

const { configureSingleInstanceLock } = require('../../src/main/single-instance')

const createFakeApp = ({ lockGranted }) => {
  const handlers = new Map()
  return {
    quitCalls: 0,
    requestSingleInstanceLockCalls: 0,
    requestSingleInstanceLock() {
      this.requestSingleInstanceLockCalls += 1
      return lockGranted
    },
    quit() {
      this.quitCalls += 1
    },
    on(eventName, handler) {
      handlers.set(eventName, handler)
    },
    emit(eventName) {
      handlers.get(eventName)?.()
    },
    hasHandler(eventName) {
      return handlers.has(eventName)
    }
  }
}

test('configureSingleInstanceLock quits and blocks bootstrap when another instance owns the lock', () => {
  const app = createFakeApp({ lockGranted: false })

  const canBootstrap = configureSingleInstanceLock({ app, getPetWindow: () => null })

  assert.equal(canBootstrap, false)
  assert.equal(app.requestSingleInstanceLockCalls, 1)
  assert.equal(app.quitCalls, 1)
  assert.equal(app.hasHandler('second-instance'), false)
})

test('configureSingleInstanceLock focuses the existing pet window for a second instance', () => {
  const app = createFakeApp({ lockGranted: true })
  const calls = []
  const petWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    focus: () => calls.push('focus')
  }

  const canBootstrap = configureSingleInstanceLock({ app, getPetWindow: () => petWindow })
  app.emit('second-instance')

  assert.equal(canBootstrap, true)
  assert.deepEqual(calls, ['restore', 'focus'])
})
