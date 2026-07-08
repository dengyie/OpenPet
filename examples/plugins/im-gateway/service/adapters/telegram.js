const { normalizeImMessage } = require('../core/normalize-message')

const toTelegramChatType = (type = '') => {
  const normalized = String(type || '').toLowerCase()
  if (normalized === 'private') return 'private'
  if (normalized === 'group' || normalized === 'supergroup' || normalized === 'channel') return normalized
  return normalized || 'unknown'
}

const normalizeTelegramHandle = (value = '') => String(value || '').trim().replace(/^@+/, '').toLowerCase()

const toEntityText = (text, entity = {}) => {
  const offset = Number(entity.offset)
  const length = Number(entity.length)
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0) return ''
  return text.slice(offset, offset + length)
}

const getMentionEntities = (ctx = {}, message = {}) => {
  if (typeof ctx.entities === 'function') {
    try {
      return ctx.entities('mention')
    } catch (_) {}
  }

  const text = String(message.text || '')
  return Array.isArray(message.entities)
    ? message.entities
      .filter((entity) => entity?.type === 'mention')
      .map((entity) => ({
        ...entity,
        text: typeof entity?.text === 'string' ? entity.text : toEntityText(text, entity)
      }))
    : []
}

const isDirectBotMention = (ctx = {}, message = {}) => {
  const botUsername = normalizeTelegramHandle(ctx.me?.username)
  if (!botUsername) return false
  return getMentionEntities(ctx, message).some((entity) => normalizeTelegramHandle(entity?.text) === botUsername)
}

const createTelegramMessage = (ctx = {}, now) => {
  const message = ctx.message || {}
  const chat = ctx.chat || message.chat || {}
  const from = ctx.from || message.from || {}
  const normalized = normalizeImMessage({
    platform: 'telegram',
    adapterId: 'telegram',
    chatType: toTelegramChatType(chat.type),
    chatId: chat.id,
    userId: from.id,
    userName: from.username || [from.first_name, from.last_name].filter(Boolean).join(' '),
    messageId: message.message_id,
    text: message.text,
    isMention: isDirectBotMention(ctx, message)
  }, { adapterId: 'telegram', platform: 'telegram', now })

  if (typeof ctx.reply === 'function') {
    Object.defineProperty(normalized, 'reply', {
      enumerable: false,
      value: (text) => ctx.reply(text)
    })
  }
  return normalized
}

const resolveGrammy = (grammy) => {
  if (grammy?.Bot) return grammy
  return require('grammy')
}

const createTelegramAdapter = ({
  token = process.env.OPENPET_IM_TELEGRAM_BOT_TOKEN || '',
  config = {},
  grammy,
  now = () => new Date().toISOString()
} = {}) => {
  let handler = null
  let bot = null
  let pollingPromise = null
  let status = 'stopped'
  let lastErrorCode = ''

  return {
    id: 'telegram',
    platform: 'telegram',
    onMessage: (nextHandler) => {
      handler = nextHandler
    },
    start: async () => {
      if (config.telegramEnabled !== true) {
        status = 'disabled'
        return
      }
      if (!String(token || '').trim()) {
        status = 'missing-token'
        lastErrorCode = 'missing-token'
        return
      }
      const { Bot } = resolveGrammy(grammy)
      bot = new Bot(token)
      bot.on('message:text', async (ctx) => {
        if (typeof handler !== 'function') return
        await handler(createTelegramMessage(ctx, now))
      })
      status = 'connecting'
      pollingPromise = Promise.resolve(bot.start())
        .then(() => {
          if (status === 'connected') status = 'stopped'
        })
        .catch(() => {
          status = 'failed'
          lastErrorCode = 'telegram-polling-failed'
        })
      status = 'connected'
      lastErrorCode = ''
    },
    stop: async () => {
      if (bot?.stop) bot.stop()
      bot = null
      pollingPromise = null
      status = status === 'disabled' ? 'disabled' : 'stopped'
    },
    sendReceipt: async (message, text) => {
      if (typeof message.reply === 'function') await message.reply(text)
    },
    getStatus: () => ({
      enabled: config.telegramEnabled === true,
      status,
      mode: 'polling',
      lastErrorCode
    })
  }
}

module.exports = {
  createTelegramAdapter,
  createTelegramMessage
}
