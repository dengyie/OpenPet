const createBridgeClient = ({
  baseUrl = process.env.OPENPET_SERVICE_BRIDGE_URL || process.env.OPENPET_BRIDGE_URL || '',
  token = process.env.OPENPET_SERVICE_BRIDGE_TOKEN || process.env.OPENPET_BRIDGE_TOKEN || '',
  fetchImpl = globalThis.fetch
} = {}) => {
  const post = async (route, payload) => {
    if (!baseUrl || !token || typeof fetchImpl !== 'function') return { ok: false, skipped: true }
    const response = await fetchImpl(`${baseUrl}${route}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) throw new Error(`Bridge request failed: ${route} ${response.status}`)
    return response.json().catch(() => ({ ok: true }))
  }

  return {
    action: (payload) => post('/pet/action', payload),
    event: (payload) => post('/pet/event', payload),
    say: (payload) => post('/pet/say', payload)
  }
}

module.exports = {
  createBridgeClient
}
