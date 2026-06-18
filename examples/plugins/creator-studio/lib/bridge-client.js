const callBridge = async (route, payload = {}) => {
  const baseUrl = process.env.OPENPET_BRIDGE_URL
  const token = process.env.OPENPET_BRIDGE_TOKEN
  if (!baseUrl || !token) throw new Error('OpenPet bridge is not available')
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  const body = await response.json()
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `OpenPet bridge request failed: ${response.status}`)
  }
  return body
}

module.exports = { callBridge }
