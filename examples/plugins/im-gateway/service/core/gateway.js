const { isMessageAllowed } = require('./allowlist')
const { parseOpenPetCommand } = require('./commands')
const { shouldTriggerSay } = require('./trigger-policy')
const { normalizeImGatewayConfig } = require('../config')
const { createGatewayHealth } = require('../health')
const { sanitizeReceiptText } = require('../log-safety')

const createEmptyState = () => ({
  lastMessageAt: '',
  lastTriggerAt: '',
  triggerCount: 0,
  lastErrorCode: '',
  lastChatId: '',
  lastUserId: ''
})

const createImGateway = ({
  adapters = [],
  bridgeClient = {},
  config: rawConfig = {},
  now = () => new Date().toISOString()
} = {}) => {
  const config = normalizeImGatewayConfig(rawConfig)
  const adapterState = new Map()

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

  const handleCommand = async (adapter, message, command) => {
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
    const allowlist = isMessageAllowed(message, config)
    if (!allowlist.allowed) return

    const command = parseOpenPetCommand(message.text, config)
    if (command.matched) {
      await handleCommand(adapter, message, command)
      return
    }

    const trigger = shouldTriggerSay(message, command, config)
    if (!trigger.triggered) return
    await bridgeClient.say?.({ text: String(message.text || ''), ttlMs: config.petSayTtlMs })
    markTrigger(adapter, message)
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
