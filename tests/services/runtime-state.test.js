const test = require('node:test')
const assert = require('node:assert/strict')

const { createRuntimeState } = require('../../apps/desktop/src/services/runtime/runtime-state')

test('runtime state patches snapshots without mutating previous values', () => {
  const state = createRuntimeState({ settings: { scale: 1 }, status: 'idle' })
  const before = state.getSnapshot()

  const after = state.patch({ status: 'working' })

  assert.deepEqual(before, { settings: { scale: 1 }, status: 'idle' })
  assert.deepEqual(after, { settings: { scale: 1 }, status: 'working' })
  assert.deepEqual(state.getSnapshot(), after)
})

test('runtime state notifies subscribers when changed', () => {
  const state = createRuntimeState({ status: 'idle' })
  const snapshots = []

  const unsubscribe = state.subscribe((snapshot) => snapshots.push(snapshot))
  state.patch({ status: 'waiting' })
  unsubscribe()
  state.patch({ status: 'idle' })

  assert.deepEqual(snapshots, [{ status: 'waiting' }])
})
