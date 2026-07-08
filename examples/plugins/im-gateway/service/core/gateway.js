const { isMessageAllowed } = require('./allowlist')
const { createAiQueue } = require('./ai-queue')
const { parseOpenPetCommand } = require('./commands')
const { resolveAiRoute, truncateAiReply } = require('./ai-routing')
const { normalizeImGatewayConfig } = require('../config')
const { createGatewayHealth } = require('../health')
const { sanitizeReceiptText } = require('../log-safety')

const PRIVATE_BUSY_NOTICE = 'Still thinking about your last message. Please send one more message in a moment.'
const PRIVATE_FAILURE_NOTICE = 'I could not reply just now. Please try again in a moment.'
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
  lastAiErrorCode: '',
  lastAllowlistReason: '',
  lastDiagnosticCode: '',
  lastDiagnosticAt: ''
})

const createImGateway = ({
  adapters = [],
  bridgeClient = {},
  config: rawConfig = {},
  now = () => new Date().toISOString()
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
    state.lastAiErrorCode = String(code || 'ai-reply-failed')
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
    const parts = [`Telegram user id: ${String(message.userId || '').trim() || 'unknown'}`]
    if (String(message.userName || '').trim()) parts.push(`username: ${String(message.userName || '').trim()}`)
    return parts.join(' | ')
  }

  const buildChatIdReply = (message = {}) => ([
    `chat type: ${String(message.chatType || '').trim() || 'unknown'}`,
    `chat id: ${String(message.chatId || '').trim() || 'unknown'}`
  ]).join(' | ')
  const isHelperCommand = (command = {}) => command.matched === true && HELPER_COMMANDS.has(String(command.name || ''))

  const handleCommand = async (adapter, message, command) => {
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
      await bridgeClient.say?.({ text: command.text, ttlMs: config.petSayTtlMs })
      markTrigger(adapter, message)
      await sendReceipt(adapter, message, 'Message sent.')
      return
    }
    if (command.name === 'action' && command.actionId) {
      await bridgeClient.action?.({ actionId: command.actionId })
      markTrigger(adapter, message)
      await sendReceipt(adapter, message, 'Action requested.')
      return
    }
    if (command.name === 'event' && command.type) {
      await bridgeClient.event?.({ type: command.type, message: command.message, ttlMs: config.petSayTtlMs })
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

  const handleMessage = async (adapter, message) => {
    markMessage(adapter, message)
    const command = parseOpenPetCommand(message.text, config)
    if (isHelperCommand(command)) {
      await handleCommand(adapter, message, command)
      return
    }

    const allowlist = isMessageAllowed(message, config)
    if (!allowlist.allowed) {
      markDiagnostic(adapter, message, 'allowlist-miss', {
        lastAllowlistReason: allowlist.reason
      })
      return
    }

    if (command.matched) {
      await handleCommand(adapter, message, command)
      return
    }

    const route = resolveAiRoute(message, config)
    if (route.mode === 'ignore') return

    if (route.mode === 'pet-say') {
      await bridgeClient.say?.({ text: route.messageText, ttlMs: config.petSayTtlMs })
      markTrigger(adapter, message)
      return
    }

    await aiQueue.push(route.conversationKey, {
      run: async () => {
        try {
          const result = await bridgeClient.aiChat?.({
            message: route.messageText,
            conversationKey: route.conversationKey,
            entrypoint: 'im-gateway',
            sourceContext: {
              platform: message.platform,
              chatType: message.chatType,
              chatId: message.chatId,
              userId: message.userId,
              messageId: message.messageId
            }
          })
          const replyText = truncateAiReply(result?.result?.reply || result?.reply || '', message)
          if (!replyText) throw new Error('empty-ai-reply')
          try {
            await sendDirectReply(adapter, message, replyText)
          } catch (_) {
            markAiError(adapter, message, 'reply-send-failed')
            return
          }
          markAiReply(adapter, message)
          markTrigger(adapter, message)
        } catch (_) {
          markAiError(adapter, message, 'ai-reply-failed')
          if (String(message.chatType || '').toLowerCase() === 'private') {
            try {
              await sendDirectReply(adapter, message, PRIVATE_FAILURE_NOTICE)
            } catch (_) {}
          }
        }
      },
      onDrop: async () => {
        markAiError(adapter, message, 'ai-queue-busy')
        if (String(message.chatType || '').toLowerCase() === 'private') {
          try {
            await sendDirectReply(adapter, message, PRIVATE_BUSY_NOTICE)
          } catch (_) {}
        }
      }
    })
  }

  const start = async () => {
    for (const adapter of adapters) {
      getState(adapter)
      adapter.onMessage?.((message) => handleMessage(adapter, message))
      await adapter.start?.()
    }
  }

  const stop = async () => {
    for (const adapter of adapters) await adapter.stop?.()
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
