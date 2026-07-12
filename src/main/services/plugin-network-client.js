const { hasOwn } = require('./plugin-json-utils')
const https = require('https')
const net = require('net')
const { Readable } = require('stream')

const MAX_PLUGIN_NETWORK_REQUEST_BYTES = 64 * 1024
const MAX_PLUGIN_NETWORK_RESPONSE_BYTES = 128 * 1024
const RESPONSE_CONTEXT = Symbol('openpetPluginNetworkResponseContext')

// Reject DNS-rebinding SSRF: even when a manifest allowlist host is a public
// domain, an attacker can point its A record at 127.0.0.1 / 169.254.169.254 /
// an internal RFC1918 address. After resolving, we require every resolved IP to
// fall outside private/loopback/link-local/multicast/reserved ranges.
const isPrivateAddress = (ip) => {
  if (typeof ip !== 'string' || !ip) return true
  // IPv6 — loopback, link-local, unique-local, unspecified, multicast.
  const bare = ip.replace(/^\[|]$/g, '')
  if (bare.includes(':')) {
    const mappedIpv4 = bare.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1]
    if (mappedIpv4) return isPrivateAddress(mappedIpv4)
    const mappedHex = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
    if (mappedHex) {
      const high = Number.parseInt(mappedHex[1], 16)
      const low = Number.parseInt(mappedHex[2], 16)
      return isPrivateAddress(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`)
    }
    if (bare === '::1' || bare === '::') return true
    if (bare.toLowerCase().startsWith('fe80:')) return true
    if (bare.toLowerCase().startsWith('fc') || bare.toLowerCase().startsWith('fd')) return true
    if (bare.toLowerCase().startsWith('ff')) return true
    return false
  }
  // IPv4
  const parts = bare.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast (224-239) + reserved (240-255)
  return false
}

// Default resolver: dns.lookup over the real network. Callers (tests) can inject
// a stub so SSRF checks are exercised deterministically without real DNS.
const defaultResolveAddress = async (hostname) => {
  const dns = require('dns')
  try {
    const records = await dns.promises.lookup(hostname, { all: true })
    return records.map((record) => record.address)
  } catch (error) {
    throw new Error(`Plugin network host could not be resolved: ${hostname}`)
  }
}

const assertResolvedAddressesSafe = async (hostname, resolveAddress = defaultResolveAddress) => {
  const addresses = await resolveAddress(hostname)
  const resolved = Array.isArray(addresses) ? addresses : [addresses]
  if (!resolved.length) throw new Error(`Plugin network host could not be resolved: ${hostname}`)
  for (const address of resolved) {
    if (isPrivateAddress(address)) {
      throw new Error(`Plugin network host resolves to a non-public address (${address}); DNS-rebinding SSRF blocked`)
    }
  }
  return resolved.map((address) => ({ address, family: net.isIP(address) }))
}

const connectPinnedHttps = ({ url, request, address, family, servername, hostHeader, port, signal }) => new Promise((resolve, reject) => {
  const target = new URL(url)
  const headers = { ...(request.headers || {}), host: hostHeader }
  const outgoing = https.request({
    protocol: 'https:',
    hostname: address,
    family,
    port,
    path: `${target.pathname}${target.search}`,
    method: request.method,
    headers,
    servername,
    rejectUnauthorized: true,
    signal
  }, (incoming) => {
    const responseHeaders = Object.fromEntries(Object.entries(incoming.headers)
      .map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value || '')]))
    resolve({
      ok: incoming.statusCode >= 200 && incoming.statusCode < 300,
      status: incoming.statusCode || 0,
      url,
      headers: { get: (name) => responseHeaders[String(name).toLowerCase()] || '' },
      body: Readable.toWeb(incoming),
      text: async () => {
        let text = ''
        for await (const chunk of incoming) text += String(chunk)
        return text
      }
    })
  })
  outgoing.once('error', reject)
  if (hasOwn(request, 'body')) outgoing.write(request.body)
  outgoing.end()
})

const isRedirectStatus = (status) => [301, 302, 303, 307, 308].includes(Number(status))

const cancelResponseBody = async (response) => {
  if (response?.body?.cancel) {
    await response.body.cancel().catch(() => {})
    return
  }
  if (response?.body?.getReader) {
    const reader = response.body.getReader()
    await reader.cancel().catch(() => {})
  }
}

const requestPluginNetwork = async ({
  manifest,
  url,
  request,
  resolveAddress = defaultResolveAddress,
  connect = connectPinnedHttps,
  timeoutMs = 10000,
  maxRedirects = 5,
  signal
}) => {
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort(signal?.reason)
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener?.('abort', abortFromCaller, { once: true })
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
    cleanup()
  }, timeoutMs)
  timeoutId.unref?.()
  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    clearTimeout(timeoutId)
    signal?.removeEventListener?.('abort', abortFromCaller)
  }

  let currentUrl = new URL(url)
  let currentRequest = { ...request, headers: { ...(request.headers || {}) } }
  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      if (currentUrl.protocol !== 'https:' || !manifest.network.allowlist.includes(currentUrl.host.toLowerCase())) {
        throw new Error(`Plugin ${manifest.id} cannot access network host: ${currentUrl.host}`)
      }
      const addresses = await assertResolvedAddressesSafe(currentUrl.hostname, resolveAddress)
      const selected = addresses[0]
      const response = await connect({
        url: currentUrl.toString(),
        request: currentRequest,
        address: selected.address,
        family: selected.family,
        servername: currentUrl.hostname,
        hostHeader: currentUrl.host,
        port: Number(currentUrl.port) || 443,
        signal: controller.signal
      })
      const location = response.headers?.get?.('location') || ''
      if (!isRedirectStatus(response.status) || !location) {
        Object.defineProperty(response, RESPONSE_CONTEXT, {
          configurable: true,
          value: { signal: controller.signal, timedOut: () => timedOut, cleanup }
        })
        return response
      }
      await cancelResponseBody(response)
      if (redirectCount === maxRedirects) throw new Error('Plugin network request exceeded redirect limit')
      currentUrl = new URL(location, currentUrl)
      if ([301, 302, 303].includes(response.status) && currentRequest.method === 'POST') {
        currentRequest = { method: 'GET', headers: { ...currentRequest.headers } }
        delete currentRequest.headers['content-length']
        delete currentRequest.headers['content-type']
      }
    }
    throw new Error('Plugin network request exceeded redirect limit')
  } catch (error) {
    cleanup()
    if (timedOut) throw new Error('Plugin network request timed out')
    throw error
  }
}

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
  const context = response?.[RESPONSE_CONTEXT]
  const abortError = () => context?.timedOut()
    ? new Error('Plugin network request timed out')
    : (context?.signal?.reason instanceof Error ? context.signal.reason : Object.assign(new Error('Plugin network request aborted'), { name: 'AbortError' }))
  const waitFor = async (promise) => {
    if (!context?.signal) return promise
    if (context.signal.aborted) throw abortError()
    let abortHandler
    const aborted = new Promise((resolve, reject) => {
      abortHandler = () => reject(abortError())
      context.signal.addEventListener('abort', abortHandler, { once: true })
    })
    try {
      return await Promise.race([promise, aborted])
    } finally {
      context.signal.removeEventListener('abort', abortHandler)
    }
  }

  try {
    const contentLength = Number(response.headers?.get?.('content-length') || 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_PLUGIN_NETWORK_RESPONSE_BYTES) {
      await cancelResponseBody(response)
      throw new Error(`Plugin network response exceeds ${MAX_PLUGIN_NETWORK_RESPONSE_BYTES} bytes`)
    }
    if (!response.body?.getReader) {
      const text = await waitFor(response.text())
      if (Buffer.byteLength(text, 'utf-8') > MAX_PLUGIN_NETWORK_RESPONSE_BYTES) {
        throw new Error(`Plugin network response exceeds ${MAX_PLUGIN_NETWORK_RESPONSE_BYTES} bytes`)
      }
      return text
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let byteLength = 0
    let text = ''
    try {
      while (true) {
        const { done, value } = await waitFor(reader.read())
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
    } catch (error) {
      await reader.cancel().catch(() => {})
      throw error
    }
  } finally {
    context?.cleanup?.()
  }
}

module.exports = {
  MAX_PLUGIN_NETWORK_REQUEST_BYTES,
  MAX_PLUGIN_NETWORK_RESPONSE_BYTES,
  isPrivateAddress,
  assertResolvedAddressesSafe,
  requestPluginNetwork,
  connectPinnedHttps,
  normalizeNetworkRequest,
  readLimitedResponseText
}
