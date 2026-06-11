export const defaultSettings = {
  scale: 1,
  walkSpeed: 2,
  walkDuration: 15000,
  bubbleDuration: 1300,
  autoStart: false
}

export const defaultAiConfig = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyRef: 'ai.default',
  systemPrompt: 'You are a friendly desktop pet companion.',
  behavior: {
    enabled: false,
    useTools: true,
    cooldownMs: 1500,
    rules: [],
    decisions: []
  },
  hasApiKey: false
}

export const defaultServiceStatus = {
  config: {
    enabled: false,
    host: '127.0.0.1',
    port: 0,
    token: '',
    logs: []
  },
  runtime: {
    enabled: false,
    host: '127.0.0.1',
    port: 0
  }
}

export const defaultActionsConfig = {
  defaultAction: '',
  clickAction: '',
  actions: []
}

export const defaultPetPacks = {
  activePackId: 'legacy-cat',
  packs: []
}

export const cloneSettings = (settings) => ({ ...defaultSettings, ...settings })

export const cloneAiBehavior = (behavior) => ({
  ...defaultAiConfig.behavior,
  ...(behavior || {}),
  rules: Array.isArray(behavior?.rules) ? behavior.rules : [],
  decisions: Array.isArray(behavior?.decisions) ? behavior.decisions : []
})

export const cloneAiConfig = (config) => ({
  ...defaultAiConfig,
  ...config,
  behavior: cloneAiBehavior(config?.behavior)
})

export const cloneServiceStatus = (status) => ({
  config: { ...defaultServiceStatus.config, ...(status?.config || {}) },
  runtime: { ...defaultServiceStatus.runtime, ...(status?.runtime || {}) }
})

export const cloneServiceLogs = (logs) => (Array.isArray(logs) ? logs : [])
  .filter((log) => log && typeof log.path === 'string')
  .map((log) => ({
    id: log.id || `${log.timestamp}-${log.method}-${log.path}-${log.statusCode}`,
    timestamp: log.timestamp || '',
    method: log.method || '',
    path: log.path,
    statusCode: Number(log.statusCode || 0),
    authorized: Boolean(log.authorized),
    remoteAddress: log.remoteAddress || '',
    error: log.error || ''
  }))

export const cloneActionsConfig = (config) => ({
  ...defaultActionsConfig,
  ...config,
  actions: Array.isArray(config?.actions) ? config.actions : []
})

export const clonePetPacks = (petPacks) => ({
  ...defaultPetPacks,
  ...petPacks,
  packs: Array.isArray(petPacks?.packs) ? petPacks.packs : []
})

export const cloneChatMessages = (messages) => (Array.isArray(messages) ? messages : [])
  .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string')
  .map((message) => ({ role: message.role, content: message.content }))
