const test = require('node:test')
const assert = require('node:assert/strict')

const { createEventBus } = require('../../apps/desktop/src/services/event-bus')

test('event bus publishes payloads to subscribers and supports unsubscribe', () => {
  const bus = createEventBus()
  const received = []

  const unsubscribe = bus.on('settings:changed', (payload) => {
    received.push(payload)
  })

  bus.emit('settings:changed', { scale: 1.2 })
  unsubscribe()
  bus.emit('settings:changed', { scale: 1.4 })

  assert.deepEqual(received, [{ scale: 1.2 }])
})

test('event bus isolates a failing listener so subsequent listeners still run', () => {
  const bus = createEventBus()
  const received = []
  const originalError = console.error
  console.error = () => {} // suppress the expected diagnostic from the failing listener

  bus.on('settings:changed', () => {
    throw new Error('listener blew up')
  })
  bus.on('settings:changed', (payload) => {
    received.push(payload)
  })

  try {
    bus.emit('settings:changed', { scale: 1.6 })
  } finally {
    console.error = originalError
  }

  assert.deepEqual(received, [{ scale: 1.6 }])
})
