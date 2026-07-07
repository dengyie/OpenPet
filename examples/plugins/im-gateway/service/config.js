const DEFAULT_CONFIG = {
  telegramEnabled: false,
  telegramMode: 'polling',
  privateChatPolicy: 'command-only',
  groupChatPolicy: 'mention-or-command',
  allowedUsers: [],
  allowedChats: [],
  allowAllPrivateChats: false,
  allowAllGroupChats: false,
  commandAliases: ['/openpet', '/op'],
  petSayTtlMs: 6000,
  receiptMode: 'commands-only'
}

const splitCommaList = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean)
  }
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const normalizeEnum = (value, allowed, fallback) => {
  const normalized = String(value || '').trim()
  return allowed.includes(normalized) ? normalized : fallback
}

const normalizePetSayTtlMs = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_CONFIG.petSayTtlMs
  return Math.min(60000, Math.max(1000, Math.floor(numeric)))
}

const normalizeImGatewayConfig = (input = {}) => ({
  telegramEnabled: input.telegramEnabled === true || input.telegramEnabled === 'true',
  telegramMode: normalizeEnum(input.telegramMode, ['polling'], DEFAULT_CONFIG.telegramMode),
  privateChatPolicy: normalizeEnum(input.privateChatPolicy, ['command-only', 'any-text'], DEFAULT_CONFIG.privateChatPolicy),
  groupChatPolicy: normalizeEnum(input.groupChatPolicy, ['mention-or-command', 'command-only'], DEFAULT_CONFIG.groupChatPolicy),
  allowedUsers: splitCommaList(input.allowedUsers),
  allowedChats: splitCommaList(input.allowedChats),
  allowAllPrivateChats: input.allowAllPrivateChats === true || input.allowAllPrivateChats === 'true',
  allowAllGroupChats: input.allowAllGroupChats === true || input.allowAllGroupChats === 'true',
  commandAliases: splitCommaList(input.commandAliases).length ? splitCommaList(input.commandAliases) : [...DEFAULT_CONFIG.commandAliases],
  petSayTtlMs: normalizePetSayTtlMs(input.petSayTtlMs),
  receiptMode: normalizeEnum(input.receiptMode, ['commands-only', 'none'], DEFAULT_CONFIG.receiptMode)
})

const readConfigFromEnv = (env = process.env) => {
  const raw = String(env.OPENPET_IM_GATEWAY_CONFIG_JSON || '').trim()
  if (!raw) return normalizeImGatewayConfig()
  try {
    return normalizeImGatewayConfig(JSON.parse(raw))
  } catch (_) {
    return normalizeImGatewayConfig()
  }
}

module.exports = {
  DEFAULT_CONFIG,
  normalizeImGatewayConfig,
  readConfigFromEnv,
  splitCommaList
}
