const { hashIdentifier } = require('./log-safety')
const { normalizePlatform } = require('./core/platform')

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
    aiRateLimitedCount: state.aiRateLimitedCount || 0,
    pendingHandlerCount: Math.max(0, Number(adapterStatus.pendingHandlerCount) || 0),
    droppedHandlerCount: Math.max(0, Number(adapterStatus.droppedHandlerCount == null ? adapterStatus.droppedUpdateCount : adapterStatus.droppedHandlerCount) || 0),
    duplicateUpdateCount: Math.max(0, Number(adapterStatus.duplicateUpdateCount) || 0),
    lastAiErrorCode: state.lastAiErrorCode || '',
    lastAllowlistReason: state.lastAllowlistReason || '',
    lastDiagnosticCode: state.lastDiagnosticCode || '',
    lastDiagnosticAt: state.lastDiagnosticAt || '',
    lastChatHash: state.lastChatId ? hashIdentifier(state.lastChatId) : '',
    lastUserHash: state.lastUserId ? hashIdentifier(state.lastUserId) : ''
  }
}

const createGatewayHealth = ({ adapters = [], adapterState = new Map() } = {}) => {
  const health = {
    ok: true,
    service: 'openpet.im-gateway',
    adapters: {
      telegram: { enabled: false, status: 'disabled' }
    }
  }

  for (const adapter of adapters) {
    const key = normalizePlatform(adapter.platform || adapter.id)
    if (!key) continue
    health.adapters[key] = createAdapterHealth(adapter, adapterState.get(adapter.id) || {})
  }

  return health
}

module.exports = {
  createGatewayHealth
}
