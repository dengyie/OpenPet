const { normalizeImMessage } = require('../core/normalize-message')

const DEFAULT_TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'
const DEFAULT_GATEWAY_URL = 'wss://api.sgroup.qq.com/websocket'
const DEFAULT_API_BASE_URL = 'https://api.sgroup.qq.com'
const DEFAULT_INTENTS = (1 << 25) | (1 << 30)
const MAX_UPDATE_IDS = 512
const MAX_PENDING_HANDLERS = 128
const MAX_RECEIPT_LENGTH = 2000
const REQUEST_TIMEOUT_MS = 10000
const STOP_TIMEOUT_MS = 1000

const toText = (value) => (Buffer.isBuffer(value) ? value.toString('utf8') : String(value || ''))

const boundedText = (value, maxLength = MAX_RECEIPT_LENGTH) => toText(value).trim().slice(0, maxLength)

const getSecret = (secrets, names) => {
  if (!secrets) return ''
  if (typeof secrets.get === 'function') {
    for (const name of names) {
      const value = secrets.get(name)
      if (value) return String(value)
    }
  }
  for (const name of names) {
    if (secrets[name]) return String(secrets[name])
  }
  return ''
}

const parseResponseBody = async (response) => {
  if (!response) return {}
  if (response.body && typeof response.body === 'object') return response.body
  if (typeof response.json === 'function') return response.json()
  if (typeof response.text === 'function') {
    const text = await response.text()
    try { return JSON.parse(text) } catch (_) { return {} }
  }
  return response
}

const requestJson = async (httpClient, url, options, timeoutMs = REQUEST_TIMEOUT_MS) => {
  if (!httpClient) throw new Error('QQ HTTP client unavailable')
  const request = typeof httpClient.request === 'function'
    ? httpClient.request.bind(httpClient)
    : typeof httpClient.fetch === 'function'
      ? httpClient.fetch.bind(httpClient)
      : typeof httpClient === 'function' ? httpClient : null
  if (!request) throw new Error('QQ HTTP client unavailable')
  let timer = null
  let timedOut = false
  const operation = Promise.resolve().then(() => request(url, options))
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      timedOut = true
      resolve({ __timeout: true })
    }, timeoutMs)
    timer.unref?.()
  })
  const response = await Promise.race([operation, timeout])
  if (timer) clearTimeout(timer)
  if (timedOut || response?.__timeout) {
    operation.catch(() => {})
    const error = new Error('QQ HTTP request timed out')
    error.code = 'qq-request-timeout'
    throw error
  }
  const status = Number(response?.status)
  if (response?.ok === false || (Number.isFinite(status) && (status < 200 || status >= 300))) {
    const error = new Error('QQ HTTP request failed')
    error.code = 'qq-http-failed'
    throw error
  }
  return parseResponseBody(response)
}

const createFetchHttpClient = () => ({
  request: async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      body: options.body && typeof options.body === 'object' ? JSON.stringify(options.body) : options.body
    })
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      text: () => response.text()
    }
  }
})

const createSocketListener = (socket, event, listener) => {
  if (typeof socket?.on === 'function') socket.on(event, listener)
  else if (socket) socket[`on${event}`] = listener
}

const sendSocketJson = (socket, value) => {
  if (typeof socket?.send !== 'function') return
  socket.send(JSON.stringify(value))
}

const classifyError = (error, fallback = 'qq-transport-failed') => {
  const code = String(error?.code || '')
  if (code === 'qq-request-timeout') return code
  if (code === 'qq-credentials-missing') return code
  if (code === 'qq-auth-failed') return code
  return fallback
}

const createQqOfficialAdapter = ({
  adapterId = 'qq-official',
  config = {},
  secrets = {},
  bridge: _bridge,
  httpClient = createFetchHttpClient(),
  websocketFactory = (...args) => new WebSocket(...args),
  clock = {},
  now = clock.now || (() => new Date().toISOString()),
  maxUpdateIds = MAX_UPDATE_IDS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  stopTimeoutMs = STOP_TIMEOUT_MS,
  logEvent = () => {}
} = {}) => {
  if (adapterId !== 'qq-official') throw new Error('Unsupported QQ adapter; official route only')

  let handler = null
  let socket = null
  let status = 'stopped'
  let lastErrorCode = ''
  let accessToken = ''
  let heartbeatTimer = null
  let acceptingUpdates = false
  let duplicateUpdateCount = 0
  let droppedHandlerCount = 0
  const updateIds = new Set()
  const boundedMaxUpdateIds = Math.min(4096, Math.max(32, Math.floor(Number(maxUpdateIds) || MAX_UPDATE_IDS)))
  const appId = getSecret(secrets, ['appId', 'app_id', 'qqAppId'])
  const clientSecret = getSecret(secrets, ['clientSecret', 'client_secret', 'qqClientSecret'])
  const gatewayUrl = DEFAULT_GATEWAY_URL
  const apiBaseUrl = DEFAULT_API_BASE_URL
  const tokenUrl = DEFAULT_TOKEN_URL
  const intents = Number.isInteger(Number(config.qqIntents)) ? Number(config.qqIntents) : DEFAULT_INTENTS
  const handlerTasks = new Map()
  let handlerSequence = 0

  const emitError = (code, event = 'qq.transport.failed') => {
    lastErrorCode = code
    try { logEvent({ level: 'error', event, code }) } catch (_) {}
  }

  const clearHeartbeat = () => {
    if (!heartbeatTimer) return
    const clear = clock.clearTimeout || clearTimeout
    clear(heartbeatTimer)
    heartbeatTimer = null
  }

  const sendHeartbeat = (interval) => {
    clearHeartbeat()
    const numeric = Number(interval)
    if (!Number.isFinite(numeric) || numeric <= 0 || !socket) return
    const set = clock.setTimeout || setTimeout
    const tick = () => {
      if (!socket || !acceptingUpdates) return
      sendSocketJson(socket, { op: 1, d: null })
      heartbeatTimer = set(tick, Math.min(60000, Math.max(1000, numeric)))
      heartbeatTimer?.unref?.()
    }
    heartbeatTimer = set(tick, Math.min(60000, Math.max(1000, numeric)))
    heartbeatTimer?.unref?.()
  }

  const sendMessage = async (message, text) => {
    const safeText = boundedText(text)
    const chatType = String(message?.chatType || '').toLowerCase()
    const peerId = boundedText(message?.chatId, 256)
    const messageId = boundedText(message?.messageId, 256)
    if (!safeText || !peerId || !messageId) throw new Error('QQ receipt target unavailable')
    const path = chatType === 'private' ? `/v2/users/${encodeURIComponent(peerId)}/messages` : `/v2/groups/${encodeURIComponent(peerId)}/messages`
    await requestJson(httpClient, `${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `QQBot ${accessToken}`, 'Content-Type': 'application/json' },
      body: { content: safeText, msg_type: 0, msg_id: messageId }
    }, requestTimeoutMs)
  }

  const normalizeUpdate = (update) => {
    const event = String(update?.t || '').trim()
    const data = update?.d && typeof update.d === 'object' ? update.d : {}
    if (event !== 'C2C_MESSAGE_CREATE' && event !== 'GROUP_AT_MESSAGE_CREATE') return null
    const privateMessage = event === 'C2C_MESSAGE_CREATE'
    const author = data.author && typeof data.author === 'object' ? data.author : {}
    const chatId = privateMessage ? author.user_openid : data.group_openid
    const userId = privateMessage ? author.user_openid : (author.member_openid || author.user_openid)
    const normalized = normalizeImMessage({
      platform: 'qq-official',
      adapterId: 'qq-official',
      chatType: privateMessage ? 'private' : 'group',
      chatId,
      userId,
      messageId: data.id,
      text: data.content,
      isMention: !privateMessage
    }, { platform: 'qq-official', adapterId: 'qq-official', now })
    Object.defineProperty(normalized, 'reply', {
      enumerable: false,
      value: (text) => sendMessage(normalized, text)
    })
    return normalized
  }

  const handleSocketMessage = (payload) => {
    let update
    try { update = typeof payload === 'string' || Buffer.isBuffer(payload) ? JSON.parse(toText(payload)) : payload } catch (_) {
      emitError('qq-payload-invalid', 'qq.update.invalid')
      return
    }
    if (!update || typeof update !== 'object') return
    if (Number(update.op) === 10) {
      sendSocketJson(socket, { op: 2, d: { token: `QQBot ${accessToken}`, intents, shard: [0, 0] } })
      sendHeartbeat(update.d?.heartbeat_interval)
      status = 'connected'
      return
    }
    if (Number(update.op) === 0) {
      const message = normalizeUpdate(update)
      if (!message || !acceptingUpdates) return
      const updateId = boundedText(update.d?.id, 256)
      if (!updateId) return
      if (updateIds.has(updateId)) {
        duplicateUpdateCount += 1
        return
      }
      updateIds.add(updateId)
      if (updateIds.size > boundedMaxUpdateIds) updateIds.delete(updateIds.values().next().value)
      if (typeof handler !== 'function') return
      if (handlerTasks.size >= MAX_PENDING_HANDLERS) {
        droppedHandlerCount += 1
        emitError('qq-handler-overloaded', 'qq.handler.overloaded')
        return
      }
      const controller = new AbortController()
      const taskId = ++handlerSequence
      const task = Promise.resolve().then(() => handler(message, { signal: controller.signal }))
      handlerTasks.set(taskId, { controller, task })
      task.catch(() => {
        if (!controller.signal.aborted) emitError('qq-handler-failed', 'qq.handler.failed')
      }).finally(() => handlerTasks.delete(taskId))
    }
  }

  const start = async () => {
    if (config.qqEnabled !== true) {
      status = 'disabled'
      return
    }
    if (!appId || !clientSecret) {
      status = 'missing-credentials'
      const error = new Error('QQ credentials missing')
      error.code = 'qq-credentials-missing'
      emitError(error.code, 'qq.auth.missing')
      return
    }
    try {
      status = 'authenticating'
      const tokenResult = await requestJson(httpClient, tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    body: { app_id: appId, client_secret: clientSecret }
      }, requestTimeoutMs)
      accessToken = boundedText(tokenResult?.access_token || tokenResult?.accessToken, 512)
      if (!accessToken) {
        const error = new Error('QQ authentication failed')
        error.code = 'qq-auth-failed'
        throw error
      }
      if (typeof websocketFactory !== 'function') throw new Error('QQ WebSocket factory unavailable')
      socket = websocketFactory(gatewayUrl)
      acceptingUpdates = true
      createSocketListener(socket, 'open', () => { status = 'connecting' })
      createSocketListener(socket, 'message', handleSocketMessage)
      createSocketListener(socket, 'error', () => emitError('qq-websocket-error'))
      createSocketListener(socket, 'close', () => {
        clearHeartbeat()
        if (status !== 'stopped' && status !== 'disabled') status = 'disconnected'
      })
      status = 'connecting'
      lastErrorCode = ''
    } catch (error) {
      acceptingUpdates = false
      socket = null
      status = 'failed'
      emitError(classifyError(error, 'qq-auth-failed'), 'qq.start.failed')
    }
  }

  const stop = async () => {
    acceptingUpdates = false
    clearHeartbeat()
    const activeSocket = socket
    socket = null
    accessToken = ''
    const stopError = new Error('QQ adapter stopped')
    stopError.name = 'AbortError'
    for (const { controller } of handlerTasks.values()) controller.abort(stopError)
    const pending = Promise.allSettled([...handlerTasks.values()].map(({ task }) => task))
    await Promise.race([pending, new Promise((resolve) => {
      const timer = setTimeout(resolve, Math.max(0, Number(stopTimeoutMs) || STOP_TIMEOUT_MS))
      timer.unref?.()
    })])
    handlerTasks.clear()
    try { activeSocket?.close?.() } catch (_) { emitError('qq-websocket-close-failed') }
    status = status === 'disabled' ? 'disabled' : 'stopped'
  }

  return {
    id: 'qq-official',
    platform: 'qq-official',
    onMessage: (nextHandler) => { handler = nextHandler },
    handleUpdate: async (update) => handleSocketMessage(update),
    start,
    stop,
    sendReceipt: sendMessage,
    health: () => ({ enabled: config.qqEnabled === true, status, mode: 'official-websocket', lastErrorCode, duplicateUpdateCount }),
    getStatus: () => ({
      enabled: config.qqEnabled === true,
      status,
      mode: 'official-websocket',
      lastErrorCode,
      pendingHandlerCount: handlerTasks.size,
      droppedHandlerCount,
      duplicateUpdateCount
    })
  }
}

module.exports = {
  DEFAULT_API_BASE_URL,
  DEFAULT_GATEWAY_URL,
  DEFAULT_INTENTS,
  DEFAULT_TOKEN_URL,
  createQqOfficialAdapter
}
