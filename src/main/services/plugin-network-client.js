const { hasOwn } = require('./plugin-json-utils')

const MAX_PLUGIN_NETWORK_REQUEST_BYTES = 64 * 1024
const MAX_PLUGIN_NETWORK_RESPONSE_BYTES = 128 * 1024

const normalizeNetworkRequest = (manifest, { url, options = {} } = {}) => {
  const targetUrl = new URL(String(url || ''))
  if (targetUrl.protocol !== 'https:') throw new Error('Plugin network requests must use HTTPS')
  if (!manifest.network.allowlist.includes(targetUrl.host.toLowerCase())) {
    throw new Error(`Plugin ${manifest.id} cannot access network host: ${targetUrl.host}`)
  }
  const method = String(options.method || 'GET').toUpperCase()
  if (!['GET', 'POST'].includes(method)) throw new Error('Plugin network requests only support GET and POST')
  const headers = Object.entries(options.headers || {}).reduce((nextHeaders, [key, value]) => {
    const headerName = String(key).toLowerCase()
    if (!/^[a-z0-9-]+$/.test(headerName)) throw new Error(`Plugin network header is invalid: ${key}`)
    if (['authorization', 'cookie', 'set-cookie', 'proxy-authorization'].includes(headerName)) {
      throw new Error(`Plugin network header is not allowed: ${key}`)
    }
    nextHeaders[headerName] = String(value)
    return nextHeaders
  }, {})
  const request = { method, headers }
  if (hasOwn(options, 'body')) {
    request.body = String(options.body)
    if (Buffer.byteLength(request.body, 'utf-8') > MAX_PLUGIN_NETWORK_REQUEST_BYTES) {
      throw new Error(`Plugin network request body exceeds ${MAX_PLUGIN_NETWORK_REQUEST_BYTES} bytes`)
    }
  }
  return { url: targetUrl.toString(), request }
}

const readLimitedResponseText = async (response) => {
  const contentLength = Number(response.headers?.get?.('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_PLUGIN_NETWORK_RESPONSE_BYTES) {
    throw new Error(`Plugin network response exceeds ${MAX_PLUGIN_NETWORK_RESPONSE_BYTES} bytes`)
  }
  if (!response.body?.getReader) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf-8') > MAX_PLUGIN_NETWORK_RESPONSE_BYTES) {
      throw new Error(`Plugin network response exceeds ${MAX_PLUGIN_NETWORK_RESPONSE_BYTES} bytes`)
    }
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let byteLength = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAX_PLUGIN_NETWORK_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {})
      throw new Error(`Plugin network response exceeds ${MAX_PLUGIN_NETWORK_RESPONSE_BYTES} bytes`)
    }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return text
}

module.exports = {
  MAX_PLUGIN_NETWORK_REQUEST_BYTES,
  MAX_PLUGIN_NETWORK_RESPONSE_BYTES,
  normalizeNetworkRequest,
  readLimitedResponseText
}
