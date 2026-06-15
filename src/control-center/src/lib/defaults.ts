import type {
  AboutInfoViewState,
  ActionsConfigViewState,
  AiBehaviorConfig,
  AiConfigViewState,
  BlocklistState,
  CatalogState,
  ChatMessage,
  ControlCenterSettings,
  PetPacksViewState,
  ServiceLogEntry,
  ServiceStatusViewState,
  UpdateCheckViewState
} from '../../../shared/openpet-contracts'

export const defaultSettings = {
  scale: 1,
  walkSpeed: 2,
  walkDuration: 15000,
  bubbleDuration: 1300,
  autoStart: false
} satisfies ControlCenterSettings

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
} satisfies AiConfigViewState

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
    port: 0,
    mcp: {
      activeSessions: 0,
      sessionTtlMs: 0
    }
  }
} satisfies ServiceStatusViewState

export const defaultActionsConfig = {
  defaultAction: '',
  clickAction: '',
  actions: []
} satisfies ActionsConfigViewState

export const defaultPetPacks = {
  activePackId: 'legacy-cat',
  packs: []
} satisfies PetPacksViewState

export const defaultCatalog = {
  schemaVersion: 1,
  updatedAt: '',
  feedbackUrl: '',
  localBlocklist: {
    pluginIds: [],
    packIds: [],
    sha256: []
  },
  catalogBlocklist: {
    pluginIds: [],
    packIds: [],
    sha256: []
  },
  blocklist: {
    pluginIds: [],
    packIds: [],
    sha256: []
  },
  plugins: [],
  petPacks: []
} satisfies CatalogState

export const defaultAboutInfo = {
  name: 'openpet',
  productName: 'OpenPet',
  version: '0.0.0',
  packaged: false,
  platform: '',
  arch: '',
  update: {
    configured: false,
    provider: '',
    channel: '',
    url: ''
  }
} satisfies AboutInfoViewState

export const defaultUpdateCheck = {
  status: 'idle',
  configured: false,
  currentVersion: '',
  latestVersion: '',
  updateAvailable: false,
  prerelease: false,
  releaseUrl: '',
  assets: [],
  checkedAt: '',
  message: ''
} satisfies UpdateCheckViewState

export const cloneSettings = (settings: Partial<ControlCenterSettings> | null | undefined): ControlCenterSettings => ({
  ...defaultSettings,
  ...(settings || {})
})

export const cloneAiBehavior = (behavior: Partial<AiBehaviorConfig> | null | undefined): AiBehaviorConfig => ({
  ...defaultAiConfig.behavior,
  ...(behavior || {}),
  rules: Array.isArray(behavior?.rules) ? behavior.rules : [],
  decisions: Array.isArray(behavior?.decisions) ? behavior.decisions : []
})

export const cloneAiConfig = (config: Partial<AiConfigViewState> | null | undefined): AiConfigViewState => ({
  ...defaultAiConfig,
  ...(config || {}),
  behavior: cloneAiBehavior(config?.behavior)
})

export const cloneServiceStatus = (status: Partial<ServiceStatusViewState> | null | undefined): ServiceStatusViewState => ({
  config: { ...defaultServiceStatus.config, ...(status?.config || {}) },
  runtime: {
    ...defaultServiceStatus.runtime,
    ...(status?.runtime || {}),
    mcp: {
      ...defaultServiceStatus.runtime.mcp,
      ...(status?.runtime?.mcp || {})
    }
  }
})

export const cloneServiceLogs = (logs: Array<Partial<ServiceLogEntry> & { path?: string }> | null | undefined): ServiceLogEntry[] => (
  (Array.isArray(logs) ? logs : [])
    .filter((log) => log && typeof log.path === 'string')
    .map((log) => ({
      id: log.id || `${log.timestamp}-${log.method}-${log.path}-${log.statusCode}`,
      timestamp: log.timestamp || '',
      method: log.method || '',
      path: log.path || '',
      statusCode: Number(log.statusCode || 0),
      authorized: Boolean(log.authorized),
      remoteAddress: log.remoteAddress || '',
      error: log.error || ''
    }))
)

export const cloneActionsConfig = (config: Partial<ActionsConfigViewState> | null | undefined): ActionsConfigViewState => ({
  ...defaultActionsConfig,
  ...(config || {}),
  actions: Array.isArray(config?.actions) ? config.actions : []
})

export const clonePetPacks = (petPacks: Partial<PetPacksViewState> | null | undefined): PetPacksViewState => ({
  ...defaultPetPacks,
  ...(petPacks || {}),
  packs: Array.isArray(petPacks?.packs) ? petPacks.packs : []
})

export const cloneBlocklist = (blocklist: Partial<BlocklistState> | null | undefined): BlocklistState => ({
  pluginIds: Array.isArray(blocklist?.pluginIds) ? blocklist.pluginIds : [],
  packIds: Array.isArray(blocklist?.packIds) ? blocklist.packIds : [],
  sha256: Array.isArray(blocklist?.sha256) ? blocklist.sha256 : []
})

export const cloneCatalog = (catalog: Partial<CatalogState> | null | undefined): CatalogState => ({
  ...defaultCatalog,
  ...(catalog || {}),
  localBlocklist: cloneBlocklist(catalog?.localBlocklist),
  catalogBlocklist: cloneBlocklist(catalog?.catalogBlocklist),
  blocklist: cloneBlocklist(catalog?.blocklist),
  plugins: Array.isArray(catalog?.plugins) ? catalog.plugins : [],
  petPacks: Array.isArray(catalog?.petPacks) ? catalog.petPacks : []
})

export const cloneChatMessages = (messages: Array<Partial<ChatMessage> | null | undefined> | null | undefined): ChatMessage[] => (
  (Array.isArray(messages) ? messages : [])
    .flatMap((message) => {
      if (!message || !['user', 'assistant'].includes(message.role || '') || typeof message.content !== 'string') return []
      return [{
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content
      }]
    })
)

export const cloneAboutInfo = (info: Partial<AboutInfoViewState> | null | undefined): AboutInfoViewState => ({
  ...defaultAboutInfo,
  ...(info || {}),
  update: {
    ...defaultAboutInfo.update,
    ...(info?.update || {})
  }
})

export const cloneUpdateCheck = (result: Partial<UpdateCheckViewState> | null | undefined): UpdateCheckViewState => ({
  ...defaultUpdateCheck,
  ...(result || {}),
  assets: Array.isArray(result?.assets) ? result.assets : []
})
