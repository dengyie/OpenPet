const DEFAULT_AI_CONFIG = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyRef: 'ai.default',
  systemPrompt: 'You are a friendly desktop pet companion.',
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

const HISTORY_ROLES = new Set(['user', 'assistant'])

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const normalizeBehaviorConfig = (behavior = {}) => ({
  ...DEFAULT_AI_CONFIG.behavior,
  ...(isPlainObject(behavior) ? behavior : {}),
  enabled: Boolean(behavior?.enabled),
  useTools: behavior?.useTools !== false,
  cooldownMs: Math.max(0, Number(behavior?.cooldownMs ?? DEFAULT_AI_CONFIG.behavior.cooldownMs) || 0),
  rules: Array.isArray(behavior?.rules) ? behavior.rules : [],
  decisions: Array.isArray(behavior?.decisions) ? behavior.decisions : []
})

const normalizeConfig = (config = {}) => ({
  provider: config.provider || DEFAULT_AI_CONFIG.provider,
  baseUrl: (config.baseUrl || DEFAULT_AI_CONFIG.baseUrl).replace(/\/+$/, ''),
  model: config.model || DEFAULT_AI_CONFIG.model,
  apiKeyRef: config.apiKeyRef || DEFAULT_AI_CONFIG.apiKeyRef,
  systemPrompt: config.systemPrompt ?? DEFAULT_AI_CONFIG.systemPrompt,
  enabled: Boolean(config.enabled),
  behavior: normalizeBehaviorConfig(config.behavior)
})

const parseBehaviorToolArguments = (value) => {
  if (!value || typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    if (!isPlainObject(parsed)) return null
    return {
      intent: typeof parsed.intent === 'string' ? parsed.intent : '',
      actionId: typeof parsed.actionId === 'string' ? parsed.actionId : '',
      confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0,
      bubbleText: typeof parsed.bubbleText === 'string' ? parsed.bubbleText : ''
    }
  } catch (_) {
    return null
  }
}

const parseBehaviorIntent = (message = {}) => {
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
  for (const toolCall of toolCalls) {
    if (toolCall?.function?.name !== 'ibot_behavior') continue
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

const getBehaviorToolDefinition = () => ({
  type: 'function',
  function: {
    name: 'ibot_behavior',
    description: 'Choose an ibot pet behavior for this assistant reply.',
    parameters: {
      type: 'object',
      properties: {
        intent: { type: 'string' },
        actionId: { type: 'string' },
        confidence: { type: 'number' },
        bubbleText: { type: 'string' }
      },
      required: ['intent', 'confidence']
    }
  }
})

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

const createAiService = ({
  settingsService,
  secretService,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES,
  maxConversations = DEFAULT_MAX_CONVERSATIONS
}) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!secretService) throw new Error('secretService is required')

  const historyLimit = Math.max(0, Number(maxHistoryMessages) || 0)
  const conversationLimit = Math.max(0, Number(maxConversations) || 0)
  const conversationQueues = new Map()

  const getRawConfig = () => normalizeConfig(settingsService.get().ai)

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
      hasApiKey: Boolean(secretService.getSecretValue(config.apiKeyRef))
    }
  }

  const saveConfig = (partialConfig) => {
    const settings = settingsService.get()
    const nextAi = {
      ...normalizeConfig({ ...settings.ai, ...partialConfig }),
      conversations: getStoredConversations()
    }
    settingsService.save({ ...settings, ai: nextAi })
    return getConfig()
  }

  const saveApiKey = (value) => {
    const config = getRawConfig()
    secretService.setSecret({ id: config.apiKeyRef, value, label: 'AI API Key' })
    return { apiKeyRef: config.apiKeyRef, hasApiKey: Boolean(value) }
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
    if (!apiKey) throw new Error('AI API key is not configured')
    if (config.provider !== 'openai-compatible') {
      throw new Error(`Unsupported AI provider: ${config.provider}`)
    }
    if (typeof fetchImpl !== 'function') throw new Error('fetch is not available')

    const timeout = createTimeoutController(requestTimeoutMs)
    let response
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
        throw new Error('AI provider request timed out')
      }
      throw error
    } finally {
      timeout.clear()
    }

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = data?.error?.message || `AI provider request failed with status ${response.status}`
      throw new Error(message)
    }
    return parseChatResult(data)
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
    const result = await complete({
      messages: [
        { role: 'user', content: 'Reply with ok.' }
      ]
    })
    return { ok: true, reply: result.reply }
  }

  return { getConfig, saveConfig, saveApiKey, getConversation, clearConversation, chat, testConnection }
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
