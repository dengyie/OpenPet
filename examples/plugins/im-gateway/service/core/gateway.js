const { isMessageAllowed } = require('./allowlist')
const { createAiQueue } = require('./ai-queue')
const { parseOpenPetCommand } = require('./commands')
const { resolveAiRoute, truncateAiReply } = require('./ai-routing')
const { createSlidingWindowRateLimiter } = require('./rate-limiter')
const { normalizeImGatewayConfig } = require('../config')
const { createGatewayHealth } = require('../health')
const { hashIdentifier, sanitizeReceiptText } = require('../log-safety')
const { normalizePlatform, platformLabel, resolvePlatform } = require('./platform')

const PRIVATE_BUSY_NOTICE = 'Still thinking about your last message. Please send one more message in a moment.'
const PRIVATE_FAILURE_NOTICE = 'I could not reply just now. Please try again in a moment.'
const PRIVATE_RATE_LIMIT_NOTICE = 'Too many requests. Please try again in a moment.'
const HELPER_COMMANDS = new Set(['whoami', 'chatid'])

const createEmptyState = () => ({
  lastMessageAt: '',
  lastTriggerAt: '',
  triggerCount: 0,
  lastErrorCode: '',
  lastChatId: '',
  lastUserId: '',
  lastAiReplyAt: '',
  aiReplyCount: 0,
  aiRateLimitedCount: 0,
  lastAiErrorCode: '',
  lastAllowlistReason: '',
  lastDiagnosticCode: '',
  lastDiagnosticAt: ''
})

const createImGateway = ({
  adapters = [],
  bridgeClient = {},
  config: rawConfig = {},
  now = () => new Date().toISOString(),
  aiRateLimiter = createSlidingWindowRateLimiter(),
  logEvent = () => {}
} = {}) => {
  const config = normalizeImGatewayConfig(rawConfig)
  const adapterState = new Map()
  const aiQueue = createAiQueue()

  const getState = (adapter) => {
    if (!adapterState.has(adapter.id)) adapterState.set(adapter.id, createEmptyState())
    return adapterState.get(adapter.id)
  }

  const sendReceipt = async (adapter, message, text) => {
    if (config.receiptMode === 'none') return
    const safeText = sanitizeReceiptText(text)
    if (!safeText) return
    if (typeof message.reply === 'function') {
      await message.reply(safeText)
      return
    }
    if (typeof adapter.sendReceipt === 'function') await adapter.sendReceipt(message, safeText)
  }

  const sendDirectReply = async (adapter, message, text) => {
    const safeText = sanitizeReceiptText(text, 2000)
    if (!safeText) return
    if (typeof message.reply === 'function') {
      await message.reply(safeText)
      return
    }
    if (typeof adapter.sendReceipt === 'function') await adapter.sendReceipt(message, safeText)
  }

  const markMessage = (adapter, message) => {
    const state = getState(adapter)
    state.lastMessageAt = message.receivedAt || now()
    state.lastChatId = message.chatId || ''
    state.lastUserId = message.userId || ''
  }

  const markTrigger = (adapter, message) => {
    const state = getState(adapter)
    state.lastTriggerAt = now()
    state.triggerCount += 1
    state.lastChatId = message.chatId || ''
    state.lastUserId = message.userId || ''
  }

  const markAiReply = (adapter, message) => {
    const state = getState(adapter)
    state.lastAiReplyAt = now()
    state.aiReplyCount += 1
    state.lastAiErrorCode = ''
    state.lastChatId = message.chatId || ''
    state.lastUserId = message.userId || ''
  }

  const markAiError = (adapter, message, code) => {
    const state = getState(adapter)
    const nextCode = String(code || 'ai-reply-failed')
    if (state.lastAiErrorCode !== nextCode) {
      try {
        logEvent({ level: 'error', event: `${resolvePlatform(message, adapter)}.ai.failed`, code: nextCode })
      } catch (_) {}
    }
    state.lastAiErrorCode = nextCode
    state.lastChatId = message.chatId || ''
    state.lastUserId = message.userId || ''
  }

  const markAiRateLimited = (adapter, message) => {
    const state = getState(adapter)
    state.lastAiErrorCode = 'ai-rate-limited'
    state.aiRateLimitedCount += 1
    state.lastChatId = message.chatId || ''
    state.lastUserId = message.userId || ''
  }

  const markDiagnostic = (adapter, message, code, extra = {}) => {
    const state = getState(adapter)
    state.lastDiagnosticCode = String(code || '')
    state.lastDiagnosticAt = now()
    state.lastChatId = message.chatId || ''
    state.lastUserId = message.userId || ''
    if (extra.lastAllowlistReason) state.lastAllowlistReason = String(extra.lastAllowlistReason || '')
  }

  const buildWhoamiReply = (message = {}) => {
    const parts = [`${platformLabel(message.platform)} user id: ${String(message.userId || '').trim() || 'unknown'}`]
    if (String(message.userName || '').trim()) parts.push(`username: ${String(message.userName || '').trim()}`)
    return parts.join(' | ')
  }

  const buildChatIdReply = (message = {}) => ([
    `${normalizePlatform(message.platform) === 'telegram' ? '' : `${platformLabel(message.platform)} `}chat type: ${String(message.chatType || '').trim() || 'unknown'}`,
    `chat id: ${String(message.chatId || '').trim() || 'unknown'}`
  ]).join(' | ')
  const isHelperCommand = (command = {}) => command.matched === true && HELPER_COMMANDS.has(String(command.name || ''))

  const handleCommand = async (adapter, message, command, { signal = null } = {}) => {
    if (command.name === 'whoami') {
      await sendDirectReply(adapter, message, buildWhoamiReply(message))
      markDiagnostic(adapter, message, 'helper-whoami')
      return
    }
    if (command.name === 'chatid') {
      await sendDirectReply(adapter, message, buildChatIdReply(message))
      markDiagnostic(adapter, message, 'helper-chatid')
      return
    }
    if (command.name === 'say' && command.text) {
      await bridgeClient.say?.({ text: command.text, ttlMs: config.petSayTtlMs }, { signal })
      markTrigger(adapter, message)
      await sendReceipt(adapter, message, 'Message sent.')
      return
    }
    if (command.name === 'action' && command.actionId) {
      await bridgeClient.action?.({ actionId: command.actionId }, { signal })
      markTrigger(adapter, message)
      await sendReceipt(adapter, message, 'Action requested.')
      return
    }
    if (command.name === 'event' && command.type) {
      await bridgeClient.event?.({ type: command.type, message: command.message, ttlMs: config.petSayTtlMs }, { signal })
      markTrigger(adapter, message)
      await sendReceipt(adapter, message, 'Event posted.')
      return
    }
    if (command.name === 'status') {
      await sendReceipt(adapter, message, 'IM Gateway OK.')
      return
    }
    await sendReceipt(adapter, message, 'Unknown OpenPet command.')
  }

  const handleMessage = async (adapter, message, { signal = null } = {}) => {
    if (signal?.aborted) return
    const platform = resolvePlatform(message, adapter)
    const routedMessage = message.platform === platform ? message : { ...message, platform }
    markMessage(adapter, routedMessage)
    const command = parseOpenPetCommand(routedMessage.text, config, { botUsername: routedMessage.botUsername })
    if (command.reason === 'command-for-other-bot') return
    if (isHelperCommand(command)) {
      await handleCommand(adapter, routedMessage, command, { signal })
      return
    }

    const allowlist = isMessageAllowed(routedMessage, config)
    if (!allowlist.allowed) {
      markDiagnostic(adapter, routedMessage, 'allowlist-miss', {
        lastAllowlistReason: allowlist.reason
      })
      return
    }

    if (command.matched) {
      await handleCommand(adapter, routedMessage, command, { signal })
      return
    }

    const route = resolveAiRoute(routedMessage, config)
    if (route.mode === 'ignore') return

    if (route.mode === 'pet-say') {
      await bridgeClient.say?.({ text: route.messageText, ttlMs: config.petSayTtlMs }, { signal })
      markTrigger(adapter, routedMessage)
      return
    }

    const chatKind = String(routedMessage.chatType || '').toLowerCase() === 'private' ? 'private' : 'group'
    const rateLimit = aiRateLimiter.consume(route.conversationKey, chatKind)
    if (!rateLimit.allowed) {
      markAiRateLimited(adapter, routedMessage)
      if (chatKind === 'private') {
        try {
          await sendDirectReply(adapter, message, PRIVATE_RATE_LIMIT_NOTICE)
        } catch (_) {}
      }
      return
    }

    await aiQueue.push(route.conversationKey, {
      run: async () => {
        if (signal?.aborted) return
        try {
          const result = await bridgeClient.aiChat?.({
            message: route.messageText,
            conversationKey: route.conversationKey,
            requestId: routedMessage.messageId
              ? `${platform}-request:${hashIdentifier(`${route.conversationKey}:${routedMessage.messageId}`)}`
              : ''
          }, { signal })
          if (signal?.aborted) return
          const replyText = truncateAiReply(result?.result?.reply || result?.reply || '', routedMessage)
          if (!replyText) throw new Error('empty-ai-reply')
          try {
            await sendDirectReply(adapter, routedMessage, replyText)
          } catch (_) {
            markAiError(adapter, routedMessage, 'reply-send-failed')
            return
          }
          markAiReply(adapter, routedMessage)
          markTrigger(adapter, routedMessage)
        } catch (_) {
          if (signal?.aborted) {
            markAiError(adapter, routedMessage, 'ai-request-canceled')
            return
          }
          markAiError(adapter, routedMessage, 'ai-reply-failed')
          if (String(routedMessage.chatType || '').toLowerCase() === 'private') {
            try {
              await sendDirectReply(adapter, routedMessage, PRIVATE_FAILURE_NOTICE)
            } catch (_) {}
          }
        }
      },
      onDrop: async () => {
        markAiError(adapter, routedMessage, 'ai-queue-busy')
        if (String(routedMessage.chatType || '').toLowerCase() === 'private') {
          try {
            await sendDirectReply(adapter, routedMessage, PRIVATE_BUSY_NOTICE)
          } catch (_) {}
        }
      }
    })
  }

  const start = async () => {
    for (const adapter of adapters) {
      getState(adapter)
      adapter.onMessage?.((message, context) => handleMessage(adapter, message, context))
      await adapter.start?.()
    }
  }

  const stop = async () => {
    for (const adapter of adapters) await adapter.stop?.()
    aiRateLimiter.clear?.()
  }

  return {
    getHealth: () => createGatewayHealth({ adapters, adapterState }),
    handleMessage,
    start,
    stop
  }
}

module.exports = {
  createImGateway
}
