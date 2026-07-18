const path = require('node:path')
const { normalizeImMessage } = require('../core/normalize-message')
const { createTelegramUpdateState } = require('../telegram-update-state')

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

const getDirectBotMentionText = (ctx = {}, message = {}) => {
  const botUsername = normalizeTelegramHandle(ctx.me?.username)
  if (!botUsername) return ''
  const match = getMentionEntities(ctx, message).find((entity) => normalizeTelegramHandle(entity?.text) === botUsername)
  return typeof match?.text === 'string' ? match.text : ''
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
    botUsername: normalizeTelegramHandle(ctx.me?.username),
    updateId: ctx.update?.update_id,
    messageId: message.message_id,
    text: message.text,
    directMentionText: getDirectBotMentionText(ctx, message),
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

const classifyTelegramStartError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  if (message.includes('terminated by other getupdates request')) return 'telegram-polling-conflict'
  return 'telegram-polling-failed'
}

const createHandlerStopError = () => {
  const error = new Error('Telegram adapter stopped')
  error.name = 'AbortError'
  return error
}

const createTelegramAdapter = ({
  token = process.env.OPENPET_IM_TELEGRAM_BOT_TOKEN || '',
  config = {},
  grammy,
  now = () => new Date().toISOString(),
  maxPendingHandlers = 128,
  handlerStopTimeoutMs = 1000,
  updateStatePath = process.env.OPENPET_DATA_DIR
    ? path.join(process.env.OPENPET_DATA_DIR, 'telegram-update-state.json')
    : '',
  logEvent = () => {}
} = {}) => {
  let handler = null
  let bot = null
  let status = 'stopped'
  let lastErrorCode = ''
  let acceptingHandlers = false
  let droppedHandlerCount = 0
  let duplicateUpdateCount = 0
  const handlerTasks = new Map()
  const updateState = createTelegramUpdateState({ statePath: updateStatePath })
  const parsedMaxPendingHandlers = Number(maxPendingHandlers)
  const parsedHandlerStopTimeoutMs = Number(handlerStopTimeoutMs)
  const boundedMaxPendingHandlers = Math.min(4096, Math.max(
    1,
    Number.isFinite(parsedMaxPendingHandlers) ? Math.floor(parsedMaxPendingHandlers) : 128
  ))
  const boundedHandlerStopTimeoutMs = Math.min(30000, Math.max(
    0,
    Number.isFinite(parsedHandlerStopTimeoutMs) ? Math.floor(parsedHandlerStopTimeoutMs) : 1000
  ))

  const scheduleHandler = (message) => {
    if (!acceptingHandlers) return false
    if (handlerTasks.size >= boundedMaxPendingHandlers) {
      droppedHandlerCount += 1
      lastErrorCode = 'telegram-handler-overloaded'
      logEvent({
        level: 'warn',
        event: 'telegram.handler.overloaded',
        code: lastErrorCode,
        count: droppedHandlerCount
      })
      return false
    }
    let claimed = true
    try {
      claimed = updateState.claim(message.updateId)
    } catch (_) {
      lastErrorCode = 'telegram-update-state-failed'
      logEvent({ level: 'error', event: 'telegram.update.state-failed', code: lastErrorCode })
    }
    if (!claimed) {
      duplicateUpdateCount += 1
      logEvent({
        level: 'warn',
        event: 'telegram.update.duplicate',
        code: 'telegram-update-duplicate',
        count: duplicateUpdateCount
      })
      return false
    }
    const controller = new AbortController()
    const task = Promise.resolve().then(() => handler(message, { signal: controller.signal }))
    handlerTasks.set(task, controller)
    task.then(
      () => {
        handlerTasks.delete(task)
        if (lastErrorCode === 'telegram-handler-failed' || lastErrorCode === 'telegram-handler-overloaded') lastErrorCode = ''
      },
      () => {
        handlerTasks.delete(task)
        if (!controller.signal.aborted) {
          lastErrorCode = 'telegram-handler-failed'
          logEvent({ level: 'error', event: 'telegram.handler.failed', code: lastErrorCode })
        }
      }
    )
    return true
  }

  const waitForStopWork = async (additionalWork = []) => {
    const tasks = [...Array.from(handlerTasks.keys()), ...additionalWork]
    if (!tasks.length) return false
    if (boundedHandlerStopTimeoutMs === 0) return true
    let timeoutId = null
    const timedOut = await Promise.race([
      Promise.allSettled(tasks).then(() => false),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(true), boundedHandlerStopTimeoutMs)
      })
    ])
    if (timeoutId) clearTimeout(timeoutId)
    return timedOut
  }

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
      const activeBot = bot
      acceptingHandlers = true
      droppedHandlerCount = 0
      duplicateUpdateCount = 0
      bot.on('message:text', async (ctx) => {
        if (typeof handler !== 'function') return
        scheduleHandler(createTelegramMessage(ctx, now))
      })
      bot.catch?.(() => {
        lastErrorCode = 'telegram-handler-failed'
        logEvent({ level: 'error', event: 'telegram.polling.handler-failed', code: lastErrorCode })
      })
      status = 'connecting'
      lastErrorCode = ''
      Promise.resolve(bot.start({
        onStart: () => {
          if (bot === activeBot && status === 'connecting') status = 'connected'
        }
      }))
        .then(() => {
          if (bot === activeBot && status === 'connected') {
            acceptingHandlers = false
            status = 'stopped'
          }
        })
        .catch((error) => {
          if (bot !== activeBot) return
          acceptingHandlers = false
          status = 'failed'
          lastErrorCode = classifyTelegramStartError(error)
          logEvent({ level: 'error', event: 'telegram.polling.failed', code: lastErrorCode })
        })
    },
    stop: async () => {
      acceptingHandlers = false
      const activeBot = bot
      bot = null
      const stopError = createHandlerStopError()
      for (const controller of handlerTasks.values()) controller.abort(stopError)
      let pollingStopFailed = false
      const pollingStop = activeBot?.stop
        ? Promise.resolve()
          .then(() => activeBot.stop())
          .catch(() => {
            pollingStopFailed = true
          })
        : Promise.resolve()
      const timedOut = await waitForStopWork([pollingStop])
      if (timedOut) {
        lastErrorCode = 'telegram-stop-timeout'
        logEvent({ level: 'error', event: 'telegram.stop.timeout', code: lastErrorCode })
      } else if (pollingStopFailed) {
        lastErrorCode = 'telegram-polling-stop-failed'
        logEvent({ level: 'error', event: 'telegram.stop.failed', code: lastErrorCode })
      }
      status = status === 'disabled' ? 'disabled' : 'stopped'
    },
    sendReceipt: async (message, text) => {
      if (typeof message.reply === 'function') await message.reply(text)
    },
    getStatus: () => ({
      enabled: config.telegramEnabled === true,
      status,
      mode: 'polling',
      lastErrorCode,
      pendingHandlerCount: handlerTasks.size,
      droppedHandlerCount,
      duplicateUpdateCount
    })
  }
}

module.exports = {
  createTelegramAdapter,
  createTelegramMessage
}
