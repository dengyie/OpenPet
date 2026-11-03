const { createVideoRunnerResponse } = require('./video-runner-protocol')

const runnerServiceError = (message, code = 'video_runner_service_invalid') => Object.assign(new Error(message), { code })

const createVideoRunnerService = ({ execute, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) => {
  if (typeof execute !== 'function') throw runnerServiceError('video runner execute function is required')
  const completed = new Map()
  const inFlight = new Map()

  const run = async (request, { signal, onAttempt } = {}) => {
    if (!request?.requestId || !request?.requestSha256) throw runnerServiceError('video runner request is invalid')
    const previous = completed.get(request.requestId)
    if (previous) {
      if (previous.requestSha256 !== request.requestSha256) throw runnerServiceError('requestId was reused with a different request')
      return previous.response
    }
    const active = inFlight.get(request.requestId)
    if (active) {
      if (active.requestSha256 !== request.requestSha256) throw runnerServiceError('requestId was reused with a different request')
      return active.promise
    }
    const maxAttempts = Number(request.providerTask?.retryPolicy?.maxAttempts) || 1
    const backoffMs = Number(request.providerTask?.retryPolicy?.backoffMs) || 0
    const promise = (async () => {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (signal?.aborted) throw signal.reason ?? runnerServiceError('video runner canceled', 'video_runner_canceled')
        onAttempt?.({ attempt, maxAttempts })
        let response
        try {
          response = await execute(request, { signal, attempt })
        } catch (error) {
          if (signal?.aborted) throw signal.reason ?? error
          response = {
            status: 'failed',
            error: { code: 'runner-execution-failed', retryable: false }
          }
        }
        const normalized = createVideoRunnerResponse({ request, ...response })
        if (normalized.status === 'succeeded' || normalized.status === 'canceled' || !normalized.error?.retryable || attempt >= maxAttempts) {
          completed.set(request.requestId, { requestSha256: request.requestSha256, response: normalized })
          return normalized
        }
        if (backoffMs > 0) await sleep(backoffMs * attempt)
      }
      throw runnerServiceError('video runner exhausted attempts')
    })()
    inFlight.set(request.requestId, { requestSha256: request.requestSha256, promise })
    try {
      return await promise
    } finally {
      const current = inFlight.get(request.requestId)
      if (current?.promise === promise) inFlight.delete(request.requestId)
    }
  }

  return Object.freeze({ run })
}

module.exports = {
  createVideoRunnerService,
  runnerServiceError
}
