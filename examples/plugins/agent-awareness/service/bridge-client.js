const callJson = async ({ baseUrl, token, route, method = 'POST', payload, fetchImpl = fetch }) => {
  if (!baseUrl || !token) throw new Error('OpenPet service bridge is not available')
  const response = await fetchImpl(`${baseUrl}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
    },
    ...(method === 'POST' ? { body: JSON.stringify(payload || {}) } : {})
  })
  const body = await response.json()
  if (!response.ok || body.ok === false) throw new Error(body.error || `OpenPet bridge request failed: ${response.status}`)
  return body
}

const createServiceBridgeClient = ({
  baseUrl = process.env.OPENPET_SERVICE_BRIDGE_URL,
  token = process.env.OPENPET_SERVICE_BRIDGE_TOKEN,
  fetchImpl = fetch
} = {}) => ({
  context: () => callJson({ baseUrl, token, route: '/context', method: 'GET', fetchImpl }),
  say: (payload) => callJson({ baseUrl, token, route: '/pet/say', payload, fetchImpl }),
  event: (payload) => callJson({ baseUrl, token, route: '/pet/event', payload, fetchImpl }),
  action: (payload) => callJson({ baseUrl, token, route: '/pet/action', payload, fetchImpl })
})

module.exports = { createServiceBridgeClient }
