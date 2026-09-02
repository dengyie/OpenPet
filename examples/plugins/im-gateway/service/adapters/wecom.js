const crypto = require('node:crypto')
const { normalizeImMessage } = require('../core/normalize-message')
const { sanitizeReceiptText } = require('../log-safety')

const DEFAULT_TIMEOUT_MS = 4500
const DEFAULT_CALLBACK_PATH = '/wecom/callback'
const MAX_BODY_LENGTH = 1024 * 1024
const MAX_SEEN_UPDATES = 4096

const createWecomHttpClient = ({ fetchImpl = globalThis.fetch } = {}) => ({
  request: async ({ method, url, body, headers, signal } = {}) => {
    if (typeof fetchImpl !== 'function') throw new Error('missing-fetch')
    return fetchImpl(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {})
    })
  }
})

const textValue = (value) => String(value == null ? '' : value).trim()

const parseXml = (input = '') => {
  const source = String(input || '').slice(0, MAX_BODY_LENGTH).replace(/^\s*<xml[^>]*>|<\/xml>\s*$/gi, '')
  const result = {}
  const tagPattern = /<([A-Za-z][\w:-]*)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g
  let match
  while ((match = tagPattern.exec(source))) {
    const [, key, cdata, value] = match
    result[key] = String(cdata == null ? value : cdata)
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .trim()
  }
  return result
}

const parseCallbackBody = (body) => {
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body
  const source = String(body || '')
  if (!source.trim()) return {}
  try {
    const parsed = JSON.parse(source)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) {
    return parseXml(source)
  }
}

const callbackSignature = ({ token = '', timestamp = '', nonce = '', encrypt = '' } = {}) => (
  crypto.createHash('sha1').update([textValue(token), textValue(timestamp), textValue(nonce), textValue(encrypt)].filter(Boolean).sort().join('')).digest('hex')
)

const signaturesEqual = (left, right) => {
  const a = Buffer.from(textValue(left))
  const b = Buffer.from(textValue(right))
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b)
}

const boundedNumber = (value, fallback, minimum, maximum) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.floor(number))) : fallback
}

const escapeXml = (value) => textValue(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const decryptWecom = (encrypted, encodingAesKey, receiveId = '') => {
  const key = Buffer.from(`${textValue(encodingAesKey)}=`, 'base64')
  if (key.length !== 32) throw new Error('invalid-encoding-aes-key')
  const ciphertext = Buffer.from(textValue(encrypted), 'base64')
  if (!ciphertext.length || ciphertext.length % 16 !== 0) throw new Error('invalid-encrypted-callback')
  let decoded
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
    decipher.setAutoPadding(false)
    decoded = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch (_) {
    throw new Error('invalid-encrypted-callback')
  }
  if (decoded.length < 32 || decoded.length % 32 !== 0) throw new Error('invalid-encrypted-callback')
  const paddingLength = decoded[decoded.length - 1]
  if (paddingLength < 1 || paddingLength > 32 || paddingLength > decoded.length) throw new Error('invalid-encrypted-callback')
  for (const paddingByte of decoded.subarray(decoded.length - paddingLength)) {
    if (paddingByte !== paddingLength) throw new Error('invalid-encrypted-callback')
  }
  const unpadded = decoded.subarray(0, decoded.length - paddingLength)
  if (unpadded.length < 20) throw new Error('invalid-encrypted-callback')
  const messageLength = unpadded.readUInt32BE(16)
  const messageEnd = 20 + messageLength
  if (messageEnd > unpadded.length) throw new Error('invalid-encrypted-callback')
  const receivedId = unpadded.subarray(messageEnd)
  const expectedId = Buffer.from(textValue(receiveId), 'utf8')
  if (expectedId.length !== receivedId.length || !crypto.timingSafeEqual(expectedId, receivedId)) throw new Error('invalid-callback-receiver')
  return unpadded.subarray(20, messageEnd).toString('utf8')
}

const createWecomAdapter = ({
  config = {},
  secrets = {},
  httpClient = createWecomHttpClient(),
  clock = {},
  now = typeof clock === 'function' ? clock : (clock.now || (() => new Date().toISOString())),
  logEvent = () => {},
  maxPendingHandlers = 128,
  stopTimeoutMs = 1000,
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
  seenUpdateLimit = MAX_SEEN_UPDATES
} = {}) => {
  let handler = null
  let status = 'stopped'
  let lastErrorCode = ''
  let acceptingUpdates = false
  let pendingHandlerCount = 0
  let droppedUpdateCount = 0
  let duplicateUpdateCount = 0
  let accessToken = ''
  let accessTokenExpiresAt = 0
  const inFlightUpdates = new Map()
  const committedUpdates = new Map()
  const tasks = new Set()
  const controllers = new Map()
  const maxPending = boundedNumber(maxPendingHandlers, 128, 1, 4096)
  const stopTimeout = boundedNumber(stopTimeoutMs, 1000, 0, 30000)
  const timeout = boundedNumber(requestTimeoutMs, DEFAULT_TIMEOUT_MS, 250, 30000)
  const seenLimit = boundedNumber(seenUpdateLimit, MAX_SEEN_UPDATES, 128, 65536)

  const enabled = () => config.wecomEnabled === true
  const token = () => textValue(secrets.token || secrets.callbackToken || secrets.wecomToken)
  const corpSecret = () => textValue(secrets.corpSecret || secrets.secret)
  const corpId = () => textValue(config.wecomCorpId)
  const agentId = () => Number(config.wecomAgentId)
  const hasValidAgentId = () => Number.isInteger(agentId()) && agentId() > 0 && agentId() <= 2147483647
  const hasCredentials = () => Boolean(corpId() && token() && corpSecret() && textValue(secrets.encodingAesKey || secrets.encoding_aes_key || secrets.aesKey))
  const configurationError = () => {
    if (!hasValidAgentId()) return 'invalid-agent-id'
    if (!hasCredentials()) return 'missing-credentials'
    return ''
  }
  const report = (code, level = 'error') => {
    lastErrorCode = code
    try { logEvent({ level, event: `wecom.${code}`, code }) } catch (_) {}
  }
  const isAborted = (error, signal) => Boolean(
    signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || error?.code === 'ERR_ABORTED'
  )

  const request = async (method, url, body, signal) => {
    if (!httpClient) throw new Error('missing-http-client')
    return await withTimeout((requestSignal) => {
      const options = { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(requestSignal ? { signal: requestSignal } : {}) }
      if (typeof httpClient.request === 'function') return httpClient.request({ method, url, body, headers: options.headers, signal: requestSignal })
      if (typeof httpClient.fetch === 'function') return httpClient.fetch(url, options)
      if (typeof httpClient === 'function') return httpClient(url, options)
      if (typeof httpClient[method.toLowerCase()] === 'function') return httpClient[method.toLowerCase()](url, options)
      throw new Error('invalid-http-client')
    }, timeout, signal)
  }

  const withTimeout = async (operation, duration, signal) => {
    let timeoutId = null
    let abortHandler = null
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    if (signal && controller) {
      abortHandler = () => controller.abort(signal.reason)
      if (signal.aborted) abortHandler()
      else signal.addEventListener('abort', abortHandler, { once: true })
    }
    const requestSignal = controller?.signal || signal
    const pending = Promise.resolve().then(() => typeof operation === 'function' ? operation(requestSignal) : operation)
    const timed = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller?.abort()
        const error = new Error('request-timeout')
        error.code = 'wecom-request-timeout'
        reject(error)
      }, duration)
    })
    try { return await Promise.race([pending, timed]) } finally {
      if (timeoutId) clearTimeout(timeoutId)
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler)
    }
  }

  const responseJson = async (response, failureCode = 'wecom-http-failed') => {
    const status = Number(response?.status)
    if (response?.ok === false || (Number.isFinite(status) && (status < 200 || status >= 300))) {
      const error = new Error(failureCode)
      error.code = failureCode
      error.status = status
      error.httpCode = 'wecom-http-failed'
      throw error
    }
    if (response && typeof response.json === 'function') return response.json()
    return response || {}
  }

  const getAccessToken = async (signal) => {
    const currentTime = Date.now()
    if (accessToken && accessTokenExpiresAt > currentTime + 30000) return accessToken
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId())}&corpsecret=${encodeURIComponent(corpSecret())}`
    try {
      const response = typeof httpClient?.getAccessToken === 'function'
        ? await withTimeout((requestSignal) => httpClient.getAccessToken({ corpId: corpId(), corpSecret: corpSecret(), signal: requestSignal }), timeout, signal)
        : await request('GET', url, undefined, signal)
      const data = await responseJson(response, 'access-token-failed')
      if (!data || Number(data.errcode || 0) !== 0 || !textValue(data.access_token)) {
        const error = new Error('access-token-failed')
        error.code = 'access-token-failed'
        throw error
      }
      accessToken = textValue(data.access_token)
      accessTokenExpiresAt = currentTime + Math.max(60000, Number(data.expires_in || 7200) * 1000)
      return accessToken
    } catch (error) {
      if (!isAborted(error, signal)) report('wecom-access-token-failed')
      throw error
    }
  }

  const sendMessage = async (message, text, signal) => {
    const recipient = textValue(message?.chatId || message?.userId)
    const content = sanitizeReceiptText(text, 1998)
    if (!recipient || !content) return
    if (!hasValidAgentId()) {
      report('invalid-agent-id')
      throw new Error('invalid-agent-id')
    }
    const access = await getAccessToken(signal)
    const payload = {
      touser: message?.chatType === 'group' ? undefined : recipient,
      chatid: message?.chatType === 'group' ? recipient : undefined,
      msgtype: 'text',
      agentid: agentId(),
      text: { content }
    }
    try {
      if (typeof httpClient?.sendMessage === 'function') {
        const result = await withTimeout((requestSignal) => httpClient.sendMessage({ accessToken: access, payload, signal: requestSignal }), timeout, signal)
        const data = await responseJson(result, 'message-send-failed')
        if (Number(data?.errcode || 0) !== 0) {
          const error = new Error('message-send-failed')
          error.code = 'message-send-failed'
          throw error
        }
        return
      }
      const response = await request('POST', `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(access)}`, payload, signal)
      const data = await responseJson(response, 'message-send-failed')
      if (Number(data?.errcode || 0) !== 0) {
        const error = new Error('message-send-failed')
        error.code = 'message-send-failed'
        throw error
      }
    } catch (error) {
      if (!isAborted(error, signal)) report('wecom-message-send-failed')
      throw error
    }
  }

  const normalizeUpdate = (update = {}) => {
    let body = parseCallbackBody(update.body == null ? update : update.body)
    const encrypted = textValue(update.encrypt || body.Encrypt || body.encrypt)
    if (encrypted) body = parseCallbackBody(decryptWecom(encrypted, secrets.encodingAesKey || secrets.encoding_aes_key || secrets.aesKey, config.wecomCorpId || ''))
    const chatId = textValue(body.ChatId || body.chatid || body.chat_id)
    const userId = textValue(body.FromUserName || body.from_user_name || body.userId)
    const messageId = textValue(body.MsgId || body.msgid || body.message_id)
    const callbackIdentity = [textValue(update.timestamp), textValue(update.nonce)].filter(Boolean).join(':')
    const updateId = textValue(update.updateId || update.id || messageId || callbackIdentity)
    const chatType = textValue(body.ChatType || body.chat_type || body.conversation_type).toLowerCase() === 'group' || Boolean(chatId) ? 'group' : 'private'
    const normalized = normalizeImMessage({
      platform: 'wecom', adapterId: 'wecom', chatType, chatId: chatId || userId, userId,
      userName: textValue(body.UserName || body.user_name), updateId, messageId,
      text: textValue(body.Content || body.content || body.text), receivedAt: now()
    }, { adapterId: 'wecom', platform: 'wecom', now })
    Object.defineProperty(normalized, 'reply', { enumerable: false, value: (text) => sendMessage(normalized, text) })
    return normalized
  }

  const verify = (update = {}) => {
    const body = parseCallbackBody(update.body == null ? update : update.body)
    const expected = callbackSignature({ token: token(), timestamp: update.timestamp, nonce: update.nonce, encrypt: update.encrypt || body.Encrypt || body.encrypt })
    return signaturesEqual(expected, update.signature || update.msg_signature)
  }

  const decryptEcho = (encrypted) => decryptWecom(encrypted, secrets.encodingAesKey || secrets.encoding_aes_key || secrets.aesKey, config.wecomCorpId || '')

  const claim = (id) => {
    if (!id) return { token: null }
    if (inFlightUpdates.has(id) || committedUpdates.has(id)) return null
    const claimToken = {}
    inFlightUpdates.set(id, claimToken)
    return { token: claimToken }
  }

  const releaseClaim = (id, claimToken) => {
    if (!id || !claimToken) return
    if (inFlightUpdates.get(id) === claimToken) inFlightUpdates.delete(id)
  }

  const commitClaim = (id, claimToken) => {
    if (!id || !claimToken) return
    if (inFlightUpdates.get(id) !== claimToken) return
    inFlightUpdates.delete(id)
    committedUpdates.set(id, Date.now())
    while (committedUpdates.size > seenLimit) committedUpdates.delete(committedUpdates.keys().next().value)
  }

  const handleUpdate = async (update = {}) => {
    if (!enabled()) { status = 'disabled'; return { ok: false, error: 'wecom-disabled' } }
    const errorCode = configurationError()
    if (errorCode) { report(errorCode); return { ok: false, error: errorCode } }
    if (!verify(update)) { report('invalid-signature', 'warn'); return { ok: false, error: 'invalid-signature' } }
    const message = normalizeUpdate(update)
    const claimResult = claim(message.updateId)
    if (claimResult === null) { duplicateUpdateCount += 1; report('duplicate-update', 'warn'); return { ok: true, duplicate: true } }
    const claimToken = claimResult.token
    if (typeof handler !== 'function' || !acceptingUpdates) {
      releaseClaim(message.updateId, claimToken)
      return { ok: true, accepted: false }
    }
    if (pendingHandlerCount >= maxPending) {
      releaseClaim(message.updateId, claimToken)
      droppedUpdateCount += 1
      report('handler-overloaded', 'warn')
      return { ok: false, error: 'handler-overloaded' }
    }
    const controller = new AbortController()
    pendingHandlerCount += 1
    const task = Promise.resolve().then(() => handler(message, { signal: controller.signal }))
    tasks.add(task)
    controllers.set(task, controller)
    try {
      await task
      commitClaim(message.updateId, claimToken)
      return { ok: true, accepted: true }
    } catch (_) {
      releaseClaim(message.updateId, claimToken)
      report('handler-failed')
      return { ok: false, error: 'handler-failed' }
    } finally { tasks.delete(task); controllers.delete(task); pendingHandlerCount -= 1 }
  }

  const health = () => ({
    enabled: enabled(), status, mode: 'callback', lastErrorCode,
    pendingHandlerCount, droppedUpdateCount, duplicateUpdateCount
  })

  return {
    id: 'wecom',
    platform: 'wecom',
    onMessage: (nextHandler) => { handler = nextHandler },
    start: async () => {
      if (!enabled()) { status = 'disabled'; acceptingUpdates = false; return }
      const errorCode = configurationError()
      if (errorCode) { status = errorCode; report(errorCode); return }
      acceptingUpdates = true; status = 'connected'; lastErrorCode = ''
    },
    stop: async () => {
      acceptingUpdates = false
      for (const controller of controllers.values()) controller.abort()
      const pending = [...tasks]
      if (pending.length && stopTimeout > 0) await Promise.race([Promise.allSettled(pending), new Promise((resolve) => setTimeout(resolve, stopTimeout))])
      status = status === 'disabled' ? 'disabled' : 'stopped'
      if (pendingHandlerCount) report('stop-timeout', 'error')
    },
    sendReceipt: (message, text) => sendMessage(message, text),
    handleUpdate,
    verifyCallback: verify,
    decryptEcho,
    normalizeUpdate,
    health,
    getStatus: health
  }
}

module.exports = { callbackSignature, createWecomAdapter, createWecomHttpClient, decryptWecom, parseCallbackBody }
