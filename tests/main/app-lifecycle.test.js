const test = require('node:test')
const assert = require('node:assert/strict')

const { registerWindowAllClosedPolicy } = require('../../src/main/app-lifecycle')

const createAppStub = () => {
  const handlers = new Map()
  return {
    quitCount: 0,
    on(eventName, handler) {
      handlers.set(eventName, handler)
    },
    emit(eventName) {
      handlers.get(eventName)?.()
    },
    quit() {
      this.quitCount += 1
    }
  }
}

test('window-all-closed keeps the desktop pet process alive by default', () => {
  const app = createAppStub()

  registerWindowAllClosedPolicy({ app })
  app.emit('window-all-closed')

  assert.equal(app.quitCount, 0)
})

test('window-all-closed can still use standard app quit semantics when requested', () => {
  const app = createAppStub()

  registerWindowAllClosedPolicy({ app, keepAlive: false })
  app.emit('window-all-closed')

  assert.equal(app.quitCount, 1)
})

test('window-all-closed records the lifecycle decision', () => {
  const app = createAppStub()
  const entries = []

  registerWindowAllClosedPolicy({
    app,
    activityLog: {
      record: (entry) => entries.push(entry)
    }
  })
  app.emit('window-all-closed')

  assert.deepEqual(entries, [{
    category: 'app',
    action: 'window-all-closed',
    message: 'All windows closed',
    details: { keepAlive: true }
  }])
})
