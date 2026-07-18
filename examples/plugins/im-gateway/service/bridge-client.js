const createAbortError = (signal) => {
  if (signal?.reason instanceof Error) return signal.reason
  const error = new Error('Bridge request aborted')
  error.name = 'AbortError'
  return error
}

const raceWithAbort = async (operation, signal) => {
  const pendingOperation = Promise.resolve(operation)
  if (!signal) return await pendingOperation
  if (signal.aborted) {
    pendingOperation.catch(() => {})
    throw createAbortError(signal)
  }
  let abortHandler
  const aborted = new Promise((_resolve, reject) => {
    abortHandler = () => reject(createAbortError(signal))
    signal.addEventListener('abort', abortHandler, { once: true })
  })
  try {
    return await Promise.race([pendingOperation, aborted])
  } finally {
    signal.removeEventListener('abort', abortHandler)
  }
}

const createBridgeClient = ({
  baseUrl = process.env.OPENPET_SERVICE_BRIDGE_URL || process.env.OPENPET_BRIDGE_URL || '',
  token = process.env.OPENPET_SERVICE_BRIDGE_TOKEN || process.env.OPENPET_BRIDGE_TOKEN || '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 45000,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) => {
  const post = async (route, payload, { signal: externalSignal = null } = {}) => {
    if (!baseUrl || !token || typeof fetchImpl !== 'function') return { ok: false, skipped: true }
    const boundedTimeoutMs = Number.isFinite(Number(timeoutMs)) ? Math.max(0, Number(timeoutMs)) : 45000
    const abortController = (boundedTimeoutMs > 0 || externalSignal) && typeof AbortController === 'function'
      ? new AbortController()
      : null
    let timedOut = false
    const abortFromExternal = () => {
      if (!abortController || abortController.signal.aborted) return
      abortController.abort(externalSignal?.reason)
    }
    if (externalSignal?.aborted) abortFromExternal()
    else externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true })
    const timeoutId = abortController && boundedTimeoutMs > 0
      ? setTimer(() => {
          timedOut = true
          abortController.abort()
        }, boundedTimeoutMs)
      : null
    timeoutId?.unref?.()
    const requestSignal = abortController?.signal || externalSignal

    try {
      const response = await raceWithAbort(fetchImpl(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        ...(requestSignal ? { signal: requestSignal } : {})
      }), requestSignal)
      if (!response.ok) throw new Error(`Bridge request failed: ${route} ${response.status}`)
      try {
        return await raceWithAbort(response.json(), requestSignal)
      } catch (error) {
        if (requestSignal?.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') throw error
        return { ok: true }
      }
    } catch (error) {
      if (timedOut) throw new Error(`Bridge request timed out: ${route}`)
      throw error
    } finally {
      if (timeoutId) clearTimer(timeoutId)
      externalSignal?.removeEventListener?.('abort', abortFromExternal)
    }
  }

  return {
    action: (payload, options) => post('/pet/action', payload, options),
    aiChat: (payload, options) => post('/ai/chat', payload, options),
    event: (payload, options) => post('/pet/event', payload, options),
    say: (payload, options) => post('/pet/say', payload, options)
  }
}

module.exports = {
  createBridgeClient
}
