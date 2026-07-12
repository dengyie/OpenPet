const test = require('node:test')
const assert = require('node:assert/strict')

const deferred = () => {
  let resolve
  const promise = new Promise((next) => { resolve = next })
  return { promise, resolve }
}

test('pet settings save preserves a field edited after dispatch', async () => {
  const { mergeSavedFields } = await import('../../src/control-center/src/lib/async-save-state.mjs')
  const submitted = { scale: 1.2, walkSpeed: 2 }
  let current = submitted
  const save = deferred()
  const pending = save.promise.then((saved) => {
    current = mergeSavedFields({ current, submitted, saved })
  })
  current = { ...current, walkSpeed: 3 }
  save.resolve({ scale: 1.2, walkSpeed: 2 })
  await pending

  assert.deepEqual(current, { scale: 1.2, walkSpeed: 3 })
})

test('ai provider save preserves newer draft fields while applying unchanged saved fields', async () => {
  const { mergeSavedFields } = await import('../../src/control-center/src/lib/async-save-state.mjs')
  const submitted = { provider: 'openai-compatible', baseUrl: 'https://a.test/v1', model: 'model-a', vision: {} }
  let current = submitted
  const save = deferred()
  const pending = save.promise.then((saved) => {
    current = mergeSavedFields({ current, submitted, saved, fields: ['provider', 'baseUrl', 'model'] })
  })
  current = { ...current, model: 'newer-model' }
  save.resolve({ provider: 'openai-compatible', baseUrl: 'https://normalized.test/v1', model: 'model-a', vision: {} })
  await pending

  assert.equal(current.baseUrl, 'https://normalized.test/v1')
  assert.equal(current.model, 'newer-model')
})

test('save revision gate rejects response A after newer response B was applied', async () => {
  const { shouldApplySaveResponse } = await import('../../src/control-center/src/lib/async-save-state.mjs')
  const responseA = deferred()
  const responseB = deferred()
  let appliedRevision = 0
  const applied = []
  const apply = (revision, value) => {
    if (!shouldApplySaveResponse(revision, appliedRevision)) return
    appliedRevision = revision
    applied.push(value)
  }
  const pendingA = responseA.promise.then((value) => apply(1, value))
  const pendingB = responseB.promise.then((value) => apply(2, value))
  responseB.resolve('B')
  await pendingB
  responseA.resolve('A')
  await pendingA

  assert.deepEqual(applied, ['B'])
})

test('behavior save preserves edits made while the request is pending', async () => {
  const { mergeSavedFields } = await import('../../src/control-center/src/lib/async-save-state.mjs')
  const submitted = { enabled: true, useTools: true, cooldownMs: 1500, rules: [] }
  const current = { ...submitted, cooldownMs: 2200 }
  const saved = { ...submitted, cooldownMs: 1500 }

  assert.deepEqual(mergeSavedFields({ current, submitted, saved }), current)
})
