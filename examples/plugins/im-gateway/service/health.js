const { hashIdentifier } = require('./log-safety')

const DISABLED_ADAPTER_HEALTH = {
  enabled: false,
  status: 'disabled'
}

const createAdapterHealth = (adapter = {}, state = {}) => ({
  enabled: adapter.getStatus?.().enabled === true,
  status: adapter.getStatus?.().status || state.status || 'unknown',
  mode: adapter.getStatus?.().mode || state.mode || '',
  lastMessageAt: state.lastMessageAt || '',
  lastTriggerAt: state.lastTriggerAt || '',
  triggerCount: state.triggerCount || 0,
  lastErrorCode: state.lastErrorCode || '',
  lastChatHash: state.lastChatId ? hashIdentifier(state.lastChatId) : '',
  lastUserHash: state.lastUserId ? hashIdentifier(state.lastUserId) : ''
})

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
