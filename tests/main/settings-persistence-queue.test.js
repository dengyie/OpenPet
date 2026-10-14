'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')

const { createSettingsPersistenceQueue } = require('../../apps/desktop/src/services/settings-persistence-queue')

test('settings persistence queue serializes ready writes', async () => {
  const calls = []
  let releaseFirst
  const firstStarted = new Promise((resolve) => { releaseFirst = resolve })
  let callCount = 0
  const queue = createSettingsPersistenceQueue({
    isReady: () => true,
    persist: async ({ id }) => {
      calls.push(id)
      callCount += 1
      if (callCount === 1) await firstStarted
      return id
    }
  })

  const first = queue.enqueue({ id: 'first' })
  const second = queue.enqueue({ id: 'second' })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(calls, ['first'])
  releaseFirst()
  assert.equal(await first, 'first')
  assert.equal(await second, 'second')
  assert.deepEqual(calls, ['first', 'second'])
})

test('settings persistence queue retains the failed FIFO head for retry', async () => {
  let ready = false
  let failFirst = true
  const calls = []
  const errors = []
  const queue = createSettingsPersistenceQueue({
    isReady: () => ready,
    persist: async ({ id }) => {
      calls.push(id)
      if (id === 'first' && failFirst) throw new Error('temporary backend failure')
      return id
    },
    onError: (error, entry) => errors.push([error.message, entry.id])
  })

  assert.equal(queue.enqueue({ id: 'first', nested: { value: 1 } }), null)
  const second = { id: 'second' }
  assert.equal(queue.enqueue(second), null)
  second.id = 'mutated-after-enqueue'
  assert.equal(queue.pendingCount(), 2)

  ready = true
  await assert.rejects(queue.flush(), /temporary backend failure/)
  assert.deepEqual(calls, ['first'])
  assert.deepEqual(errors, [['temporary backend failure', 'first']])
  assert.equal(queue.pendingCount(), 2)

  failFirst = false
  await queue.flush()
  assert.deepEqual(calls, ['first', 'first', 'second'])
  assert.equal(queue.pendingCount(), 0)
})

test('settings persistence queue requeues a ready write when the backend fails after readiness check', async () => {
  let fail = true
  const calls = []
  const queue = createSettingsPersistenceQueue({
    isReady: () => true,
    persist: async ({ id }) => {
      calls.push(id)
      if (fail) throw new Error('sidecar disappeared during write')
      return id
    }
  })

  await assert.rejects(queue.enqueue({ id: 'race-write' }), /sidecar disappeared during write/)
  assert.equal(queue.pendingCount(), 1)
  fail = false
  await queue.flush()
  assert.deepEqual(calls, ['race-write', 'race-write'])
  assert.equal(queue.pendingCount(), 0)
})

test('settings persistence queue does not let a later ready write overtake a failed head', async () => {
  const calls = []
  let failFirst = true
  const queue = createSettingsPersistenceQueue({
    isReady: () => true,
    persist: async ({ id }) => {
      calls.push(id)
      if (id === 'first' && failFirst) throw new Error('first write failed')
      return id
    }
  })

  const first = queue.enqueue({ id: 'first' })
  const second = queue.enqueue({ id: 'second' })
  await assert.rejects(first, /first write failed/)
  await assert.rejects(second, /first write failed/)
  assert.deepEqual(calls, ['first'])
  assert.equal(queue.pendingCount(), 2)

  failFirst = false
  await queue.flush()
  assert.deepEqual(calls, ['first', 'first', 'second'])
  assert.equal(queue.pendingCount(), 0)
})
