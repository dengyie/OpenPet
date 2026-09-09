const MAX_PET_CHAT_MESSAGES = 100

const sanitizeDiagnosticText = (value) => String(value || '')
  .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-secret]')
  .slice(0, 240)

const normalizeMessageText = (value) => String(value || '').trim().replace(/\s+/g, ' ')

const createEmptyPetBubble = () => ({
  text: '',
  source: '',
  ttlMs: 0,
  updatedAt: ''
})

const normalizePetBubble = (payload = {}) => {
  const text = normalizeMessageText(payload?.text)
  if (!text) return null
  return {
    text,
    source: sanitizeDiagnosticText(payload?.source || ''),
    ttlMs: Number.isFinite(Number(payload?.ttlMs)) ? Number(payload.ttlMs) : 0,
    updatedAt: new Date().toISOString()
  }
}

const sanitizeChatMessages = (messages = []) => (
  (Array.isArray(messages) ? messages : [])
    .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string')
    .slice(-MAX_PET_CHAT_MESSAGES)
    .map((message) => ({
      id: typeof message.id === 'string' ? message.id : '',
      role: message.role,
      content: message.content,
      createdAt: typeof message.createdAt === 'string' ? message.createdAt : ''
    }))
)

const createPetChatStateController = ({
  petPackService,
  aiService,
  aiTalkService = null,
  petChatWindowService = null,
  petBubbleChatWindowService = null,
  getLastBubble,
  recordAppLog
}) => {
  const safeRecordAppLog = (entry) => {
    try {
      recordAppLog?.(entry)
    } catch (_) {
      // Logging must never break the product flow that triggered it.
    }
  }

  const getActivePetPackId = () => {
    try {
      const manifest = petPackService?.getActivePetPack?.()?.manifest || {}
      return normalizeMessageText(manifest.id) || 'legacy-cat'
    } catch (_) {
      return 'legacy-cat'
    }
  }

  const getConversationMessages = (reason) => {
    try {
      return (aiTalkService || aiService)?.getConversation?.('') || []
    } catch (error) {
      safeRecordAppLog({
        scope: 'pet-bubble-chat',
        level: 'warn',
        actor: 'system',
        event: 'pet-bubble-chat.items.refresh-failed',
        message: 'Pet bubble chat items refresh failed',
        details: {
          reason,
          errorName: sanitizeDiagnosticText(error?.name || 'Error'),
          errorMessage: sanitizeDiagnosticText(error?.message)
        }
      })
      return []
    }
  }

  const getState = () => {
    const windowState = petChatWindowService?.getState?.() || {}
    const bubbleChatState = petBubbleChatWindowService?.getState?.() || { visible: false, hasWindow: false }
    const config = aiService?.getConfig?.() || {}
    let profile = {}
    let messages = []
    let conversationId = ''
    try {
      profile = aiTalkService?.getPersonaProfile?.() || {}
    } catch (_) {
      profile = {}
    }
    try {
      messages = (aiTalkService || aiService)?.getConversation?.('') || []
    } catch (_) {
      messages = []
    }
    if (profile?.petPackId) {
      conversationId = `control-center:${profile.petPackId}:main`
    }
    const enabled = Boolean(config.enabled)
    const hasApiKey = Boolean(config.hasApiKey)
    const ready = enabled && hasApiKey
    return {
      available: Boolean(petChatWindowService),
      ...windowState,
      conversationId,
      petPack: {
        id: profile.petPackId || '',
        displayName: profile.petPackDisplayName || profile.petPackId || ''
      },
      ai: {
        enabled,
        hasApiKey,
        ready,
        provider: config.provider || '',
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        reason: ready
          ? ''
          : (enabled ? '请先在 Control Center 保存 AI API Key' : '请先在 Control Center 启用 AI Provider')
      },
      bubble: getLastBubble(),
      bubbleChat: {
        visible: Boolean(bubbleChatState.visible),
        hasWindow: Boolean(bubbleChatState.hasWindow),
        pinned: Boolean(bubbleChatState.pinned),
        placement: typeof bubbleChatState.placement === 'string' ? bubbleChatState.placement : ''
      },
      messages: sanitizeChatMessages(messages)
    }
  }

  return {
    getActivePetPackId,
    getConversationMessages,
    getState
  }
}

module.exports = {
  createEmptyPetBubble,
  createPetChatStateController,
  normalizeMessageText,
  normalizePetBubble,
  sanitizeChatMessages,
  sanitizeDiagnosticText
}
