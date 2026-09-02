const DEFAULT_CONFIG = {
  telegramEnabled: false,
  qqEnabled: false,
  qqIntents: 1107296256,
  wecomEnabled: false,
  wecomMode: 'callback',
  wecomCorpId: '',
  wecomAgentId: 0,
  wecomCallbackPath: '/wecom/callback',
  telegramMode: 'polling',
  privateTextMode: 'command-only',
  groupChatPolicy: 'mention-or-command',
  groupAiRepliesEnabled: false,
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

const normalizeBoolean = (value, fallback = false) => (
  value === true || value === 'true' ? true : fallback
)

const normalizeImGatewayConfig = (input = {}) => ({
  telegramEnabled: normalizeBoolean(input.telegramEnabled),
  qqEnabled: normalizeBoolean(input.qqEnabled),
  qqIntents: Number.isInteger(Number(input.qqIntents)) ? Number(input.qqIntents) : DEFAULT_CONFIG.qqIntents,
  wecomEnabled: normalizeBoolean(input.wecomEnabled),
  wecomMode: normalizeEnum(input.wecomMode, ['callback'], DEFAULT_CONFIG.wecomMode),
  wecomCorpId: String(input.wecomCorpId || '').trim().slice(0, 128),
  wecomAgentId: boundedAgentId(input.wecomAgentId),
  wecomCallbackPath: normalizeCallbackPath(input.wecomCallbackPath),
  telegramMode: normalizeEnum(input.telegramMode, ['polling'], DEFAULT_CONFIG.telegramMode),
  privateTextMode: normalizeEnum(input.privateTextMode, ['command-only', 'pet-say', 'ai-chat'], DEFAULT_CONFIG.privateTextMode),
  groupChatPolicy: normalizeEnum(input.groupChatPolicy, ['mention-or-command', 'command-only'], DEFAULT_CONFIG.groupChatPolicy),
  groupAiRepliesEnabled: normalizeBoolean(input.groupAiRepliesEnabled),
  allowedUsers: splitCommaList(input.allowedUsers),
  allowedChats: splitCommaList(input.allowedChats),
  allowAllPrivateChats: normalizeBoolean(input.allowAllPrivateChats),
  allowAllGroupChats: normalizeBoolean(input.allowAllGroupChats),
  commandAliases: splitCommaList(input.commandAliases).length ? splitCommaList(input.commandAliases) : [...DEFAULT_CONFIG.commandAliases],
  petSayTtlMs: normalizePetSayTtlMs(input.petSayTtlMs),
  receiptMode: normalizeEnum(input.receiptMode, ['commands-only', 'none'], DEFAULT_CONFIG.receiptMode)
})

const boundedAgentId = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(2147483647, Math.max(0, Math.floor(numeric))) : 0
}

const normalizeCallbackPath = (value) => {
  const path = String(value || DEFAULT_CONFIG.wecomCallbackPath).trim()
  return /^\/[A-Za-z0-9/_-]{1,100}$/.test(path) ? path : DEFAULT_CONFIG.wecomCallbackPath
}

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
