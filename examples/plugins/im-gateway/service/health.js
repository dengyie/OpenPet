const { hashIdentifier } = require('./log-safety')

const DISABLED_ADAPTER_HEALTH = {
  enabled: false,
  status: 'disabled'
}

const createAdapterHealth = (adapter = {}, state = {}) => {
  const adapterStatus = adapter.getStatus?.() || {}
  return {
    enabled: adapterStatus.enabled === true,
    status: adapterStatus.status || state.status || 'unknown',
    mode: adapterStatus.mode || state.mode || '',
    lastMessageAt: state.lastMessageAt || '',
    lastTriggerAt: state.lastTriggerAt || '',
    triggerCount: state.triggerCount || 0,
    lastErrorCode: adapterStatus.lastErrorCode || state.lastErrorCode || '',
    lastAiReplyAt: state.lastAiReplyAt || '',
    aiReplyCount: state.aiReplyCount || 0,
    lastAiErrorCode: state.lastAiErrorCode || '',
    lastChatHash: state.lastChatId ? hashIdentifier(state.lastChatId) : '',
    lastUserHash: state.lastUserId ? hashIdentifier(state.lastUserId) : ''
  }
}

const createGatewayHealth = ({ adapters = [], adapterState = new Map() } = {}) => {
  const health = {
    ok: true,
    service: 'openpet.im-gateway',
    adapters: {
      telegram: { ...DISABLED_ADAPTER_HEALTH },
      qq: { ...DISABLED_ADAPTER_HEALTH },
      weixin: { ...DISABLED_ADAPTER_HEALTH }
    }
  }

  for (const adapter of adapters) {
    const key = adapter.platform || adapter.id
    if (!key) continue
    health.adapters[key] = createAdapterHealth(adapter, adapterState.get(adapter.id) || {})
  }

  return health
}

module.exports = {
  createGatewayHealth
}
