'use strict'

function clone(value) {
  return structuredClone(value)
}

/**
 * Serializes canonical settings writes while allowing callers to enqueue work
 * before the sidecar handshake completes. The first pending item stays at the
 * head until its write succeeds, so a transient backend failure cannot lose a
 * startup repair or allow a later write to overtake it.
 */
function createSettingsPersistenceQueue({ isReady, persist, onError } = {}) {
  if (typeof isReady !== 'function') throw new TypeError('settings persistence queue 需要 isReady')
  if (typeof persist !== 'function') throw new TypeError('settings persistence queue 需要 persist')

  let flushPromise = null
  const pending = []

  const createWaiter = () => {
    let resolve
    let reject
    const promise = new Promise((promiseResolve, promiseReject) => {
      resolve = promiseResolve
      reject = promiseReject
    })
    return { promise, resolve, reject }
  }

  const flush = () => {
    if (flushPromise) return flushPromise
    flushPromise = (async () => {
      while (pending.length > 0) {
        if (!isReady()) return
        const entry = pending[0]
        try {
          // Every write, including one submitted after the sidecar was ready,
          // runs through this single loop. That keeps a failed ready write at
          // the FIFO head and prevents a later call from overtaking it.
          const result = await persist(clone(entry.value))
          pending.shift()
          for (const waiter of entry.waiters) waiter.resolve(result)
        } catch (error) {
          try {
            onError?.(error, clone(entry.value))
          } catch {
            // Logging must not discard the failed entry or mask the write error.
          }
          for (const queued of pending) {
            for (const waiter of queued.waiters) waiter.reject(error)
            queued.waiters = []
          }
          throw error
        }
      }
    })().finally(() => {
      flushPromise = null
    })
    return flushPromise
  }

  const enqueue = (entry, { wait = false } = {}) => {
    const cloned = clone(entry)
    const ready = isReady()
    const queued = { value: cloned, waiters: [] }
    let result = null
    if (ready) {
      const waiter = createWaiter()
      queued.waiters.push(waiter)
      result = waiter.promise
    }
    pending.push(queued)
    if (ready) void flush().catch(() => {})
    // `wait` is retained for the public API. Writes submitted before ready
    // remain fire-and-replay operations, so they intentionally return null.
    void wait
    return result
  }

  return {
    enqueue,
    flush,
    pendingCount: () => pending.length,
  }
}

module.exports = { createSettingsPersistenceQueue }
