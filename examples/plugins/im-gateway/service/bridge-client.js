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

    try {
      const response = await fetchImpl(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        ...((abortController?.signal || externalSignal) ? { signal: abortController?.signal || externalSignal } : {})
      })
      if (!response.ok) throw new Error(`Bridge request failed: ${route} ${response.status}`)
      return response.json().catch(() => ({ ok: true }))
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
