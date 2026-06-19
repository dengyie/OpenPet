const test = require('node:test')
const assert = require('node:assert/strict')

const { registerAppLifecycleLogs } = require('../../src/main/app-lifecycle-logger')

const createAppStub = () => {
  const handlers = new Map()
  return {
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

test('registerAppLifecycleLogs records ready and normal quit lifecycle events', () => {
  const app = createAppStub()
  const logs = []

  registerAppLifecycleLogs({
    app,
    appLogService: { logPath: '/tmp/openpet-app.jsonl', record: (entry) => logs.push(entry) },
    pid: 12345
  })
  app.emit('before-quit')
  app.emit('will-quit')

  assert.equal(app.hasHandler('before-quit'), true)
  assert.equal(app.hasHandler('will-quit'), true)
  assert.deepEqual(logs, [
    {
      scope: 'app',
      level: 'info',
      actor: 'system',
      event: 'app.ready',
      message: 'OpenPet app services initialized',
      details: { pid: 12345, logPath: '/tmp/openpet-app.jsonl' }
    },
    {
      scope: 'app',
      level: 'info',
      actor: 'system',
      event: 'app.before-quit',
      message: 'OpenPet app is preparing to quit',
      details: { pid: 12345 }
    },
    {
      scope: 'app',
      level: 'info',
      actor: 'system',
      event: 'app.will-quit',
      message: 'OpenPet app will quit',
      details: { pid: 12345 }
    }
  ])
})

test('registerAppLifecycleLogs never throws when the log service fails', () => {
  const app = createAppStub()

  assert.doesNotThrow(() => registerAppLifecycleLogs({
    app,
    appLogService: {
      logPath: '/tmp/openpet-app.jsonl',
      record: () => {
        throw new Error('disk full')
      }
    },
    pid: 12345
  }))
  assert.doesNotThrow(() => app.emit('before-quit'))
  assert.doesNotThrow(() => app.emit('will-quit'))
})
