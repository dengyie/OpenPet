const createBridgeClient = ({
  baseUrl = process.env.OPENPET_SERVICE_BRIDGE_URL || process.env.OPENPET_BRIDGE_URL || '',
  token = process.env.OPENPET_SERVICE_BRIDGE_TOKEN || process.env.OPENPET_BRIDGE_TOKEN || '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 45000,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) => {
  const post = async (route, payload) => {
    if (!baseUrl || !token || typeof fetchImpl !== 'function') return { ok: false, skipped: true }
    const boundedTimeoutMs = Number.isFinite(Number(timeoutMs)) ? Math.max(0, Number(timeoutMs)) : 45000
    const abortController = boundedTimeoutMs > 0 && typeof AbortController === 'function'
      ? new AbortController()
      : null
    let timedOut = false
    const timeoutId = abortController
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
        ...(abortController ? { signal: abortController.signal } : {})
      })
      if (!response.ok) throw new Error(`Bridge request failed: ${route} ${response.status}`)
      return response.json().catch(() => ({ ok: true }))
    } catch (error) {
      if (timedOut) throw new Error(`Bridge request timed out: ${route}`)
      throw error
    } finally {
      if (timeoutId) clearTimer(timeoutId)
    }
  }

  return {
    action: (payload) => post('/pet/action', payload),
    aiChat: (payload) => post('/ai/chat', payload),
    event: (payload) => post('/pet/event', payload),
    say: (payload) => post('/pet/say', payload)
  }
}

module.exports = {
  createBridgeClient
}
