const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const PROVIDER_USER_AGENT = 'OpenPet/1.0 (video-provider)'
const MAX_MODELS = 512

const providerCapabilityError = (message, code = 'video_provider_capability_invalid', details = {}) => {
  const error = Object.assign(new Error(message), { code })
  if (details.status !== undefined) error.status = details.status
  if (details.retryable !== undefined) error.retryable = details.retryable
  return error
}

const normalizeBaseUrl = (value) => {
  let parsed
  try {
    parsed = new URL(String(value || '').trim())
  } catch {
    throw providerCapabilityError('video provider base URL is invalid')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw providerCapabilityError('video provider base URL is invalid')
  }
  return parsed.toString().replace(/\/$/, '')
}

const normalizeApiKey = (value) => {
  const key = String(value || '').trim()
  if (!key || key.length > 4096 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw providerCapabilityError('video provider API key is invalid')
  }
  return key
}

const requestError = (message, response) => {
  const status = Number(response?.status) || 0
  const retryable = status === 408 || status === 429 || status >= 500
  const code = status === 401 || status === 403
    ? 'video_provider_unauthorized'
    : status === 404
      ? 'video_provider_not_found'
      : retryable
        ? 'video_provider_retryable_http'
        : 'video_provider_http_error'
  return providerCapabilityError(message, code, { status, retryable })
}

const combineAbortSignals = (signal, timeoutMs) => {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort(signal.reason)
  if (signal) {
    if (signal.aborted) forwardAbort()
    else signal.addEventListener('abort', forwardAbort, { once: true })
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }
}

const fetchJson = async ({ fetchImpl, url, apiKey, method = 'GET', body, signal, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) => {
  if (typeof fetchImpl !== 'function') throw providerCapabilityError('video provider fetch implementation is required')
  const normalizedTimeout = Number(timeoutMs)
  if (!Number.isInteger(normalizedTimeout) || normalizedTimeout < 100 || normalizedTimeout > 600_000) {
    throw providerCapabilityError('video provider timeout is invalid')
  }
  const combined = combineAbortSignals(signal, normalizedTimeout)
  try {
    let response
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': PROVIDER_USER_AGENT,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: combined.signal
      })
    } catch (error) {
      if (combined.timedOut()) throw providerCapabilityError('video provider request timed out', 'video_provider_timeout', { retryable: true })
      if (signal?.aborted) throw signal.reason || providerCapabilityError('video provider request canceled', 'video_provider_canceled')
      throw providerCapabilityError('video provider request failed', 'video_provider_network_error', { retryable: true })
    }
    if (signal?.aborted) throw signal.reason || providerCapabilityError('video provider request canceled', 'video_provider_canceled')
    let parsed
    try {
      parsed = await response.json()
    } catch {
      parsed = null
    }
    if (!response.ok) throw requestError(`video provider request returned HTTP ${response.status}`, response)
    return parsed
  } finally {
    combined.dispose()
  }
}

const fetchBytes = async ({ fetchImpl, url, apiKey, signal, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, accept = 'application/octet-stream', maxBytes = 256 * 1024 * 1024 } = {}) => {
  if (typeof fetchImpl !== 'function') throw providerCapabilityError('video provider fetch implementation is required')
  const normalizedTimeout = Number(timeoutMs)
  if (!Number.isInteger(normalizedTimeout) || normalizedTimeout < 100 || normalizedTimeout > 600_000) {
    throw providerCapabilityError('video provider timeout is invalid')
  }
  const normalizedMaxBytes = Number(maxBytes)
  if (!Number.isInteger(normalizedMaxBytes) || normalizedMaxBytes < 1 || normalizedMaxBytes > 2 * 1024 * 1024 * 1024) {
    throw providerCapabilityError('video provider output size limit is invalid')
  }
  const combined = combineAbortSignals(signal, normalizedTimeout)
  try {
    let response
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: accept, 'User-Agent': PROVIDER_USER_AGENT, ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
        signal: combined.signal
      })
    } catch {
      if (combined.timedOut()) throw providerCapabilityError('video provider request timed out', 'video_provider_timeout', { retryable: true })
      if (signal?.aborted) throw signal.reason || providerCapabilityError('video provider request canceled', 'video_provider_canceled')
      throw providerCapabilityError('video provider request failed', 'video_provider_network_error', { retryable: true })
    }
    if (signal?.aborted) throw signal.reason || providerCapabilityError('video provider request canceled', 'video_provider_canceled')
    const contentLength = Number(response.headers?.get?.('content-length') || 0)
    if (contentLength > normalizedMaxBytes) throw providerCapabilityError('video provider response is too large', 'video_content_too_large')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > normalizedMaxBytes) throw providerCapabilityError('video provider response is too large', 'video_content_too_large')
    if (!response.ok) throw requestError(`video provider request returned HTTP ${response.status}`, response)
    return { response, bytes }
  } finally {
    combined.dispose()
  }
}

const modelId = (entry) => {
  if (typeof entry === 'string') return entry.trim()
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ''
  return String(entry.id || entry.name || entry.model || '').trim()
}

const normalizeModelList = (payload) => {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : []
  const models = [...new Set(source.map(modelId).filter(Boolean))].slice(0, MAX_MODELS)
  return Object.freeze(models)
}

const isGrokVideoModel = (value) => /^grok-imagine-video(?:[-.]|$)/i.test(String(value || '').trim())

const discoverVideoModels = async ({ baseUrl, apiKey, fetchImpl = globalThis.fetch, signal, timeoutMs } = {}) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const normalizedApiKey = normalizeApiKey(apiKey)
  const payload = await fetchJson({
    fetchImpl,
    url: `${normalizedBaseUrl}/models`,
    apiKey: normalizedApiKey,
    signal,
    timeoutMs
  })
  const models = normalizeModelList(payload)
  return Object.freeze({
    provider: 'mango-api',
    baseUrl: normalizedBaseUrl,
    models,
    videoModels: Object.freeze(models.filter(isGrokVideoModel))
  })
}

module.exports = {
  DEFAULT_REQUEST_TIMEOUT_MS,
  discoverVideoModels,
  fetchBytes,
  fetchJson,
  isGrokVideoModel,
  normalizeApiKey,
  normalizeBaseUrl,
  normalizeModelList,
  providerCapabilityError
}
