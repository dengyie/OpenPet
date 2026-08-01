const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  cancelResponseBodyQuietly,
  readBoundedResponseBuffer
} = require('../../src/main/services/bounded-response-body')

const createStreamingResponse = (chunks, { contentLength = '' } = {}) => {
  let index = 0
  let canceledWith = null
  return {
    headers: { get: (name) => String(name).toLowerCase() === 'content-length' ? contentLength : '' },
    body: {
      getReader: () => ({
        read: async () => index < chunks.length
          ? { done: false, value: chunks[index++] }
          : { done: true, value: undefined },
        cancel: async (reason) => { canceledWith = reason || true },
        releaseLock: () => {}
      })
    },
    wasCanceled: () => Boolean(canceledWith),
    cancelReason: () => canceledWith
  }
}

test('response body cancellation does not wait for a never-settling cancel promise', () => {
  let canceled = false
  const result = cancelResponseBodyQuietly({
    body: {
      cancel: () => {
        canceled = true
        return new Promise(() => {})
      }
    }
  })

  assert.equal(canceled, true)
  assert.equal(result, undefined)
})

test('bounded response reader accepts a streaming body exactly at the byte limit', async () => {
  const response = createStreamingResponse([Buffer.from('1234'), Buffer.from('5678')])

  const body = await readBoundedResponseBuffer(response, { maxBytes: 8 })

  assert.equal(body.toString(), '12345678')
  assert.equal(response.wasCanceled(), false)
})

test('bounded response reader cancels and aborts a missing-length stream on overflow', async () => {
  const response = createStreamingResponse([Buffer.alloc(4), Buffer.alloc(5)])
  const controller = new AbortController()

  await assert.rejects(
    () => readBoundedResponseBuffer(response, { maxBytes: 8, controller }),
    (error) => error?.code === 'RESPONSE_BODY_TOO_LARGE'
  )

  assert.equal(response.wasCanceled(), true)
  assert.equal(controller.signal.aborted, true)
  assert.equal(controller.signal.reason?.code, 'RESPONSE_BODY_TOO_LARGE')
})

test('bounded response reader ignores a lying content-length and enforces bytes read', async () => {
  const response = createStreamingResponse([Buffer.alloc(6), Buffer.alloc(6)], { contentLength: '4' })

  await assert.rejects(
    () => readBoundedResponseBuffer(response, { maxBytes: 10 }),
    (error) => error?.code === 'RESPONSE_BODY_TOO_LARGE'
  )

  assert.equal(response.wasCanceled(), true)
})

test('bounded response reader retains an exact-boundary compatibility fallback', async () => {
  const response = {
    headers: { get: () => '' },
    arrayBuffer: async () => Buffer.from('12345678')
  }

  const body = await readBoundedResponseBuffer(response, { maxBytes: 8 })

  assert.equal(body.toString(), '12345678')
})

test('bounded response reader supports JSON-only Response mocks without bypassing the limit', async () => {
  const body = await readBoundedResponseBuffer({
    headers: { get: () => '' },
    json: async () => ({ default_branch: 'main' }),
    arrayBuffer: async () => { throw new Error('mock arrayBuffer is unavailable') }
  }, { maxBytes: 64 })

  assert.deepEqual(JSON.parse(body.toString('utf8')), { default_branch: 'main' })
})

test('bounded response reader cancels an active reader and settles on external abort', async () => {
  let canceled = false
  let rejectRead
  const controller = new AbortController()
  const response = {
    headers: { get: () => '' },
    body: {
      getReader: () => ({
        read: () => new Promise((_resolve, reject) => { rejectRead = reject }),
        cancel: async () => {
          canceled = true
          rejectRead?.(new Error('reader canceled'))
        },
        releaseLock: () => {}
      })
    }
  }
  const pending = readBoundedResponseBuffer(response, { maxBytes: 8, controller })

  controller.abort(new Error('caller canceled'))

  await assert.rejects(pending, /caller canceled/)
  assert.equal(canceled, true)
})
