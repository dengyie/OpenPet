const { normalizeImMessage } = require('../core/normalize-message')

const createFakeAdapter = ({
  id = 'fake',
  platform = 'telegram',
  now = () => new Date().toISOString()
} = {}) => {
  let handler = null
  let status = 'stopped'
  const receipts = []

  return {
    id,
    platform,
    receipts,
    onMessage: (nextHandler) => {
      handler = nextHandler
    },
    start: async () => {
      status = 'connected'
    },
    stop: async () => {
      status = 'stopped'
    },
    emitMessage: async (message) => {
      if (typeof handler !== 'function') throw new Error('Fake adapter has no message handler')
      await handler(normalizeImMessage(message, { adapterId: id, platform, now }))
    },
    sendReceipt: async (message, text) => {
      receipts.push({
        chatHashSource: message.chatId,
        messageHashSource: message.messageId,
        text
      })
    },
    getStatus: () => ({
      enabled: true,
      status,
      mode: 'fake'
    })
  }
}

module.exports = {
  createFakeAdapter
}
