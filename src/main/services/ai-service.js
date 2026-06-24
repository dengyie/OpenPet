const DEFAULT_AI_CONFIG = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyRef: 'ai.default',
  systemPrompt: 'You are a friendly desktop pet companion.',
  memory: {
    enabled: false
  },
  behavior: {
    enabled: false,
    useTools: true,
    cooldownMs: 1500,
    rules: [],
    decisions: []
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30000
const DEFAULT_MAX_HISTORY_MESSAGES = 20
const DEFAULT_MAX_CONVERSATIONS = 20
const MAX_CONVERSATION_ID_CHARS = 160
const MAX_STORED_MESSAGE_CHARS = 8000
const MAX_USER_MESSAGE_CHARS = 4000
const BEHAVIOR_TOOL_NAME = 'openpet_behavior'
const LEGACY_BEHAVIOR_TOOL_NAME = 'ibot_behavior'
const DISPLAY_MODES = Object.freeze(['none', 'bubble', 'action', 'event'])

const HISTORY_ROLES = new Set(['user', 'assistant'])

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const normalizeActionCandidates = (actions = []) => (
  (Array.isArray(actions) ? actions : [])
    .map((action) => {
      const id = typeof action?.id === 'string' ? action.id.trim() : ''
      if (!id) return null
      return {
        id,
        label: typeof action.label === 'string' && action.label.trim() ? action.label.trim() : id,
        kind: typeof action.kind === 'string' && action.kind.trim() ? action.kind.trim() : 'custom'
      }
    })
    .filter(Boolean)
    .slice(0, 80)
)

const normalizeBehaviorConfig = (behavior = {}) => ({
  ...DEFAULT_AI_CONFIG.behavior,
  ...(isPlainObject(behavior) ? behavior : {}),
  enabled: Boolean(behavior?.enabled),
  useTools: behavior?.useTools !== false,
  cooldownMs: Math.max(0, Number(behavior?.cooldownMs ?? DEFAULT_AI_CONFIG.behavior.cooldownMs) || 0),
  rules: Array.isArray(behavior?.rules) ? behavior.rules : [],
  decisions: Array.isArray(behavior?.decisions) ? behavior.decisions : []
})

const normalizeMemoryConfig = (memory = {}) => ({
  ...DEFAULT_AI_CONFIG.memory,
  ...(isPlainObject(memory) ? memory : {}),
  enabled: Boolean(memory?.enabled)
})

const normalizeConfig = (config = {}) => ({
  provider: config.provider || DEFAULT_AI_CONFIG.provider,
  baseUrl: (config.baseUrl || DEFAULT_AI_CONFIG.baseUrl).replace(/\/+$/, ''),
  model: config.model || DEFAULT_AI_CONFIG.model,
  apiKeyRef: config.apiKeyRef || DEFAULT_AI_CONFIG.apiKeyRef,
  systemPrompt: config.systemPrompt ?? DEFAULT_AI_CONFIG.systemPrompt,
  enabled: Boolean(config.enabled),
  memory: normalizeMemoryConfig(config.memory),
  behavior: normalizeBehaviorConfig(config.behavior)
})

const parseBehaviorToolArguments = (value) => {
  if (!value || typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    if (!isPlainObject(parsed)) return null
    const intent = {
      intent: typeof parsed.intent === 'string' ? parsed.intent : '',
      actionId: typeof parsed.actionId === 'string' ? parsed.actionId : '',
      confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0,
      bubbleText: typeof parsed.bubbleText === 'string' ? parsed.bubbleText : ''
    }
    if (typeof parsed.reason === 'string') intent.reason = parsed.reason
    if (DISPLAY_MODES.includes(parsed.displayMode)) intent.displayMode = parsed.displayMode
    return intent
  } catch (_) {
    return null
  }
}

const parseBehaviorIntent = (message = {}) => {
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
  for (const toolCall of toolCalls) {
    if (![BEHAVIOR_TOOL_NAME, LEGACY_BEHAVIOR_TOOL_NAME].includes(toolCall?.function?.name)) continue
    const intent = parseBehaviorToolArguments(toolCall.function.arguments)
    if (intent) return intent
  }
  return null
}

const parseChatResult = (data) => {
  const message = data?.choices?.[0]?.message || {}
  const behaviorIntent = parseBehaviorIntent(message)
  const reply = typeof message.content === 'string' ? message.content.trim() : ''
  const fallbackReply = behaviorIntent?.bubbleText?.trim() || ''
  if (!reply && !fallbackReply) {
    throw new Error('AI provider returned an empty response')
  }
  return {
    reply: reply || fallbackReply,
    behaviorIntent
  }
}

const getBehaviorToolDefinition = ({ actions = [] } = {}) => {
  const candidates = normalizeActionCandidates(actions)
  const actionDescription = candidates.length
    ? `Optional action id. Choose only from the current pet actions: ${candidates.map((action) => `${action.id}: ${action.label} (${action.kind})`).join('; ')}. Leave empty when no action fits.`
    : 'Optional action id. Leave empty unless the current pet has a matching action.'
  return {
    type: 'function',
    function: {
      name: BEHAVIOR_TOOL_NAME,
      description: 'Choose a safe OpenPet behavior for this assistant reply.',
      parameters: {
        type: 'object',
        properties: {
          intent: { type: 'string', description: 'Short behavior intent, such as greet, celebrate, rest, or focus.' },
          actionId: {
            type: 'string',
            description: actionDescription,
            ...(candidates.length ? { enum: candidates.map((action) => action.id) } : {})
          },
          confidence: { type: 'number', description: 'Confidence from 0 to 1 that this behavior fits the reply.' },
          bubbleText: { type: 'string', description: 'Short pet bubble line. Keep it concise and user-facing.' },
          reason: { type: 'string', description: 'Short non-secret reason for the selected behavior.' },
          displayMode: {
            type: 'string',
            enum: DISPLAY_MODES,
            description: 'How OpenPet should present the behavior: none, bubble, action, or event.'
          }
        },
        required: ['intent', 'confidence']
      }
    }
  }
}

const trimHistory = (messages, maxHistoryMessages) => {
  if (messages.length <= maxHistoryMessages) return messages
  return messages.slice(messages.length - maxHistoryMessages)
}

const normalizeConversationId = (conversationId) => {
  if (typeof conversationId !== 'string') return ''
  return conversationId.trim()
}

const assertValidConversationId = (conversationId) => {
  if (conversationId.length > MAX_CONVERSATION_ID_CHARS) {
    throw new Error('AI conversation id is too long')
  }
  return conversationId
}

const normalizeStoredConversationId = (conversationId) => {
  const normalizedId = normalizeConversationId(conversationId)
  return normalizedId.length <= MAX_CONVERSATION_ID_CHARS ? normalizedId : ''
}

const normalizeHistoryMessage = (message) => {
  if (!isPlainObject(message) || !HISTORY_ROLES.has(message.role)) return null
  if (typeof message.content !== 'string') return null
  const content = message.content.trim().slice(0, MAX_STORED_MESSAGE_CHARS)
  if (!content) return null
  return { role: message.role, content }
}

const normalizeHistory = (messages, maxHistoryMessages) => {
  if (!Array.isArray(messages)) return []
  return trimHistory(messages.map(normalizeHistoryMessage).filter(Boolean), maxHistoryMessages)
}

const cloneHistory = (messages, maxHistoryMessages) => normalizeHistory(messages, maxHistoryMessages)

const normalizeConversationStore = (store, maxHistoryMessages) => {
  if (!isPlainObject(store)) return {}
  return Object.fromEntries(
    Object.entries(store)
      .map(([conversationId, messages]) => [normalizeStoredConversationId(conversationId), normalizeHistory(messages, maxHistoryMessages)])
      .filter(([conversationId, messages]) => conversationId && messages.length)
  )
}

const createTimeoutController = (timeoutMs) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  }
}

const sanitizeBaseUrlForDisplay = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    const normalizedPath = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${normalizedPath === '/' ? '' : normalizedPath}`
  } catch (_) {
    return raw
      .replace(/^([a-z]+:\/\/)([^/@]+)@/i, '$1')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
  }
}

const mergeConfigWithoutDisplayDowngrade = (currentConfig = {}, partialConfig = {}) => {
  const nextConfig = { ...(isPlainObject(currentConfig) ? currentConfig : {}), ...(isPlainObject(partialConfig) ? partialConfig : {}) }
  const currentBaseUrl = typeof currentConfig.baseUrl === 'string' ? currentConfig.baseUrl : ''
  const nextBaseUrl = typeof partialConfig.baseUrl === 'string' ? partialConfig.baseUrl : ''
  if (currentBaseUrl && nextBaseUrl && sanitizeBaseUrlForDisplay(currentBaseUrl) === nextBaseUrl && currentBaseUrl !== nextBaseUrl) {
    nextConfig.baseUrl = currentBaseUrl
  }
  return nextConfig
}

const normalizeEndpointForLog = (baseUrl) => {
  try {
    const url = new URL(String(baseUrl || ''))
    return `${url.origin}${url.pathname.replace(/\/$/, '')}/chat/completions`
  } catch (_) {
    return 'invalid-ai-base-url'
  }
}

const sanitizeDiagnosticText = (value) => String(value || '')
  .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-secret]')
  .slice(0, 240)

const getSafeProviderErrorMessage = (status, code) => {
  const normalizedStatus = Number(status) || 0
  if (normalizedStatus === 401 || normalizedStatus === 403) return 'AI provider authentication failed'
  if (normalizedStatus === 404) return 'AI provider endpoint or model was not found'
  if (normalizedStatus === 429) return 'AI provider rate limit exceeded'
  if (normalizedStatus >= 500) return 'AI provider is temporarily unavailable'
  if (normalizedStatus >= 400) return 'AI provider returned an error response'
  if (code) return `AI provider request failed: ${String(code).slice(0, 64)}`
  return 'AI provider request failed'
}

const createProviderError = ({ message, status, code }) => {
  const error = new Error(getSafeProviderErrorMessage(status, code))
  error.providerStatus = status
  error.providerCode = code || ''
  return error
}

const classifyConnectionError = (error) => {
  if (error?.message === 'AI API key is not configured') {
    return { code: 'missing_api_key', message: 'AI API key is not configured' }
  }
  if (/^Unsupported AI provider:/.test(error?.message || '')) {
    return { code: 'unsupported_provider', message: 'Unsupported AI provider' }
  }
  if (error?.message === 'fetch is not available') {
    return { code: 'fetch_unavailable', message: 'Fetch is not available' }
  }
  if (error?.name === 'AbortError' || error?.message === 'AI provider request timed out') {
    return { code: 'timeout', message: 'AI provider request timed out' }
  }
  if (error?.providerStatus) {
    const status = Number(error.providerStatus) || 0
    if (status === 401 || status === 403) return { code: 'auth_failed', message: 'AI provider rejected the API key' }
    if (status === 404) return { code: 'model_or_endpoint_not_found', message: 'AI provider endpoint or model was not found' }
    return { code: 'provider_http_error', message: `AI provider request failed with status ${status}` }
  }
  if (error?.message === 'AI provider returned an empty response') {
    return { code: 'empty_response', message: 'AI provider returned an empty response' }
  }
  return { code: 'network_error', message: 'AI provider request failed' }
}

const createAiService = ({
  settingsService,
  secretService,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES,
  maxConversations = DEFAULT_MAX_CONVERSATIONS,
  appLogService
}) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!secretService) throw new Error('secretService is required')

  const historyLimit = Math.max(0, Number(maxHistoryMessages) || 0)
  const conversationLimit = Math.max(0, Number(maxConversations) || 0)
  const conversationQueues = new Map()

  const getRawConfig = () => normalizeConfig(settingsService.get().ai)

  const recordLog = (entry) => {
    try {
      appLogService?.record?.({
        actor: 'system',
        scope: 'ai-provider',
        ...entry
      })
    } catch (_) {
      // Diagnostics must never break AI chat.
    }
  }

  const enqueueConversation = (conversationId, task) => {
    if (!conversationId) return task()
    const previous = conversationQueues.get(conversationId) || Promise.resolve()
    const queued = previous.catch(() => {}).then(task)
    const marker = queued.catch(() => {}).finally(() => {
      if (conversationQueues.get(conversationId) === marker) conversationQueues.delete(conversationId)
    })
    conversationQueues.set(conversationId, marker)
    return queued
  }

  const getStoredConversations = () => normalizeConversationStore(settingsService.get().ai?.conversations, historyLimit)

  const persistConversations = (conversations) => {
    const settings = settingsService.get()
    const currentAi = isPlainObject(settings.ai) ? settings.ai : {}
    settingsService.save({
      ...settings,
      ai: {
        ...normalizeConfig(currentAi),
        conversations
      }
    })
  }

  const getConfig = () => {
    const config = getRawConfig()
    return {
      ...config,
      baseUrl: sanitizeBaseUrlForDisplay(config.baseUrl),
      hasApiKey: Boolean(secretService.getSecretValue(config.apiKeyRef))
    }
  }

  const saveConfig = (partialConfig) => {
    const settings = settingsService.get()
    const nextAi = {
      ...normalizeConfig(mergeConfigWithoutDisplayDowngrade(settings.ai, partialConfig)),
      conversations: getStoredConversations()
    }
    settingsService.save({ ...settings, ai: nextAi })
    return getConfig()
  }

  const saveApiKey = (value) => {
    const apiKey = String(value || '').trim()
    if (!apiKey) throw new Error('API Key 不能为空')
    const config = getRawConfig()
    const updatedAt = new Date().toISOString()
    secretService.setSecret({ id: config.apiKeyRef, value: apiKey, label: 'AI API Key' })
    return {
      apiKeyRef: config.apiKeyRef,
      hasApiKey: true,
      updatedAt
    }
  }

  const rememberConversation = (conversationId, messages) => {
    if (!conversationId || conversationLimit <= 0) return []
    const conversations = getStoredConversations()
    const nextConversations = { ...conversations }
    const history = normalizeHistory(messages, historyLimit)
    if (Object.hasOwn(nextConversations, conversationId)) delete nextConversations[conversationId]
    if (!history.length) {
      persistConversations(nextConversations)
      return []
    }
    while (Object.keys(nextConversations).length >= conversationLimit) {
      delete nextConversations[Object.keys(nextConversations)[0]]
    }
    nextConversations[conversationId] = history
    persistConversations(nextConversations)
    return cloneHistory(history, historyLimit)
  }

  const getConversation = (conversationId) => {
    const normalizedId = assertValidConversationId(normalizeConversationId(conversationId))
    if (!normalizedId) return []
    return cloneHistory(getStoredConversations()[normalizedId], historyLimit)
  }

  const clearConversation = (conversationId) => {
    const normalizedId = assertValidConversationId(normalizeConversationId(conversationId))
    if (!normalizedId) return []
    const conversations = getStoredConversations()
    if (Object.hasOwn(conversations, normalizedId)) {
      delete conversations[normalizedId]
      persistConversations(conversations)
    }
    return []
  }

  const complete = async ({ messages, tools = [] }) => {
    const config = getRawConfig()
    const apiKey = secretService.getSecretValue(config.apiKeyRef)
    const startedAt = Date.now()
    const baseDetails = {
      provider: config.provider,
      model: config.model,
      endpoint: normalizeEndpointForLog(config.baseUrl),
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      toolsCount: Array.isArray(tools) ? tools.length : 0,
      timeoutMs: requestTimeoutMs,
      hasApiKey: Boolean(apiKey)
    }
    recordLog({
      level: 'info',
      event: 'ai.provider.request.started',
      message: 'AI provider request started',
      details: baseDetails
    })
    let response
    try {
      if (!apiKey) throw new Error('AI API key is not configured')
      if (config.provider !== 'openai-compatible') {
        throw new Error(`Unsupported AI provider: ${config.provider}`)
      }
      if (typeof fetchImpl !== 'function') throw new Error('fetch is not available')

      const timeout = createTimeoutController(requestTimeoutMs)
      const body = {
        model: config.model,
        messages
      }
      if (tools.length) body.tools = tools

      try {
        response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: timeout.signal,
          body: JSON.stringify(body)
        })
      } catch (error) {
        if (error?.name === 'AbortError') {
          const timeoutError = new Error('AI provider request timed out')
          timeoutError.name = 'AbortError'
          throw timeoutError
        }
        throw error
      } finally {
        timeout.clear()
      }

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createProviderError({
          message: data?.error?.message || `AI provider request failed with status ${response.status}`,
          status: response.status,
          code: data?.error?.code
        })
      }
      const result = parseChatResult(data)
      recordLog({
        level: 'info',
        event: 'ai.provider.request.completed',
        message: 'AI provider request completed',
        details: {
          ...baseDetails,
          status: response.status,
          elapsedMs: Date.now() - startedAt,
          replyChars: String(result.reply || '').length,
          hasBehaviorIntent: Boolean(result.behaviorIntent)
        }
      })
      return result
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'ai.provider.request.failed',
        message: 'AI provider request failed',
        details: {
          ...baseDetails,
          status: error?.providerStatus || response?.status || 0,
          providerCode: error?.providerCode || '',
          elapsedMs: Date.now() - startedAt,
          errorName: sanitizeDiagnosticText(error?.name || 'Error'),
          errorMessage: error?.providerStatus
            ? 'AI provider returned an error response'
            : sanitizeDiagnosticText(error?.message)
        }
      })
      throw error
    }
  }

  const chat = async ({ message, conversationId }) => {
    const normalizedConversationId = assertValidConversationId(normalizeConversationId(conversationId))
    return enqueueConversation(normalizedConversationId, async () => {
      const config = getRawConfig()
      if (!config.enabled) throw new Error('AI chat is disabled')
      const history = normalizedConversationId ? getConversation(normalizedConversationId) : []
      const content = String(message || '').trim()
      if (!content) throw new Error('AI chat message is empty')
      if (content.length > MAX_USER_MESSAGE_CHARS) throw new Error('AI chat message is too long')
      const userMessage = { role: 'user', content }
      const messages = []
      if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt })
      messages.push(...history, userMessage)
      const tools = config.behavior.enabled && config.behavior.useTools ? [getBehaviorToolDefinition()] : []
      const result = await complete({ messages, tools })
      let nextMessages
      if (normalizedConversationId) {
        nextMessages = rememberConversation(normalizedConversationId, [...history, userMessage, { role: 'assistant', content: result.reply }])
      }
      return { conversationId: normalizedConversationId || undefined, reply: result.reply, behaviorIntent: result.behaviorIntent || undefined, messages: nextMessages }
    })
  }

  const testConnection = async () => {
    const config = getRawConfig()
    const hasApiKey = Boolean(secretService.getSecretValue(config.apiKeyRef))
    const startedAt = Date.now()
    const baseResult = {
      provider: config.provider,
      baseUrl: sanitizeBaseUrlForDisplay(config.baseUrl),
      model: config.model,
      hasApiKey
    }
    recordLog({
      scope: 'ai-settings',
      level: 'info',
      event: 'ai.settings.connection-test.started',
      message: 'AI provider connection test started',
      details: baseResult
    })
    try {
      const result = await complete({
        messages: [
          { role: 'user', content: 'Reply with ok.' }
        ]
      })
      const response = {
        ok: true,
        ...baseResult,
        elapsedMs: Date.now() - startedAt,
        reply: String(result.reply || '').slice(0, 120),
        code: 'ok',
        message: 'AI provider connection test succeeded'
      }
      recordLog({
        scope: 'ai-settings',
        level: 'info',
        event: 'ai.settings.connection-test.completed',
        message: 'AI provider connection test completed',
        details: {
          ...baseResult,
          elapsedMs: response.elapsedMs,
          replyChars: response.reply.length
        }
      })
      return response
    } catch (error) {
      const classified = classifyConnectionError(error)
      const response = {
        ok: false,
        ...baseResult,
        elapsedMs: Date.now() - startedAt,
        code: classified.code,
        message: classified.message
      }
      recordLog({
        scope: 'ai-settings',
        level: 'error',
        event: 'ai.settings.connection-test.failed',
        message: 'AI provider connection test failed',
        details: {
          ...baseResult,
          elapsedMs: response.elapsedMs,
          status: error?.providerStatus || 0,
          providerCode: error?.providerCode || '',
          code: classified.code,
          message: classified.message
        }
      })
      return response
    }
  }

  return { getConfig, saveConfig, saveApiKey, getConversation, clearConversation, chat, complete, testConnection }
}

module.exports = {
  DEFAULT_AI_CONFIG,
  DEFAULT_MAX_CONVERSATIONS,
  DEFAULT_MAX_HISTORY_MESSAGES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_CONVERSATION_ID_CHARS,
  MAX_USER_MESSAGE_CHARS,
  getBehaviorToolDefinition,
  parseChatResult,
  createAiService
}
