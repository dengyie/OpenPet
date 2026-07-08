const createDeferred = () => {
  let resolve = () => {}
  let reject = () => {}
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

const createAiQueue = () => {
  const states = new Map()

  const startJob = (conversationKey, state, job, deferred = null) => {
    const running = (async () => {
      try {
        const result = await job.run()
        deferred?.resolve(result)
        return result
      } catch (error) {
        deferred?.reject(error)
        throw error
      } finally {
        if (state.queued) {
          const next = state.queued
          state.queued = null
          state.running = startJob(conversationKey, state, next.job, next.deferred)
        } else {
          states.delete(conversationKey)
        }
      }
    })()
    running.catch(() => {})
    return running
  }

  return {
    push: (conversationKey, job) => {
      const existing = states.get(conversationKey)
      if (!existing) {
        const state = { running: null, queued: null }
        states.set(conversationKey, state)
        state.running = startJob(conversationKey, state, job)
        return state.running
      }
      if (!existing.queued) {
        const deferred = createDeferred()
        existing.queued = { job, deferred }
        return deferred.promise
      }
      return Promise.resolve(job.onDrop?.())
    }
  }
}

module.exports = {
  createAiQueue
}
