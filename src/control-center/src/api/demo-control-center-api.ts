import { cloneActionsConfig, cloneAiConfig, cloneAiMemoryProfile, cloneAiPersonaProfile, cloneAiTalkTraceSummary, cloneCatalog, cloneChatMessages, cloneCreatorLastRun, cloneCreatorReference, cloneCreatorState, cloneImageGenerationConfig, clonePetChatState, clonePetPacks, cloneServiceStatus, cloneSettings, defaultAboutInfo, defaultActionsConfig, defaultAiConfig, defaultAiMemoryProfile, defaultAiPersonaProfile, defaultAiTalkTraceSummary, defaultCreatorState, defaultImageGenerationConfig, defaultPetChatState, defaultPetPacks, defaultServiceStatus, defaultSettings, defaultUpdateCheck } from '../lib/defaults.ts'
import { buildImageGenerationConfigSavePayload, buildProviderConfigSavePayload } from '../lib/ai-provider-config.ts'
import { stripFileExtension } from '../../../shared/cursor-library.ts'
import type {
  ActionFrameInspectRequest,
  ActionFrameInspectionResult,
  ActionFrameImportRequest,
  ActionFrameReinspectRequest,
  AiBehaviorDryRunRequest,
  CompletedActionFrameInspectionResult,
  ActionTriggerProposalInboxStatus,
  ActionTriggerProposalType,
  ActionTriggerRuleSpecInput,
  ActionTriggerRuleSpec,
  ActionTriggerRuleStatus,
  ActivePetPackChangedEvent,
  ActionsConfigViewState,
  AiChatRequest,
  AiConfigViewState,
  AiConfigSaveRequest,
  AiMemoryItemViewState,
  AiMemoryJobViewState,
  AiMemoryProfileViewState,
  AiPersona,
  AiTalkTraceDiagnosticsFilters,
  AiPersonaOverride,
  AiPersonaProfileViewState,
  AiTalkTraceSummaryViewState,
  CatalogBlocklistEntry,
  CatalogInstallRequest,
  CatalogPetPackInstallSelection,
  CatalogInstallSelection,
  CatalogPluginInstallSelection,
  CatalogPetPackEntry,
  CatalogPluginEntry,
  CatalogState,
  ChatMessage,
  ControlCenterApi,
  ControlCenterSettings,
  CreatorBindReferenceRequest,
  CreatorBindReferenceResult,
  CreatorGenerateExistingActionRequest,
  CreatorGenerateNewCharacterRequest,
  CreatorLastRunResult,
  CreatorLastRunViewState,
  CreatorReferencePickerResult,
  CreatorReferenceTargetType,
  CreatorReferenceViewState,
  CreatorStateViewState,
  CreatorWorkflowResult,
  CreatorStudioDefaultFlowResult,
  CustomCursorRecord,
  ImageGenerationConfigViewState,
  JsonObject,
  PetChatBubbleViewState,
  PetActionPlaybackResult,
  PetChatStateViewState,
  PetPackInspectionResult,
  PetPackSummary,
  PetPackMutationResult,
  PetPacksViewState,
  PluginCommandRunResultViewState,
  PluginConfigSchemaViewState,
  PluginDashboardOpenOptions,
  PluginDashboardOpenResult,
  PluginLogFilters,
  PluginPackageReviewViewState,
  PluginSignatureStatusViewState,
  PluginStorageViewState,
  PluginServiceHealthPolicyViewState,
  PluginServiceHealthViewState,
  PluginServiceRuntimeViewState,
  PluginSetupRuntimeViewState,
  PluginUninstallOptions,
  PluginViewState,
  ServiceLogFilters,
  ServiceStatusViewState
} from '../../../shared/openpet-contracts.ts'

interface DemoState {
  settings: ControlCenterSettings
  actionsConfig: ActionsConfigViewState
  aiConfig: AiConfigViewState
  aiPersonaOverrides: Record<string, AiPersonaOverride>
  aiMemories: AiMemoryItemViewState[]
  aiMemoryJobs: AiMemoryJobViewState[]
  petChatConversations: Record<string, ChatMessage[]>
  petChatConversationBubbles: Record<string, PetChatBubbleViewState>
  petChatMessages: ChatMessage[]
  petChatBubble: PetChatBubbleViewState
  petChatWindowState: {
    visible: boolean
    hasWindow: boolean
    alwaysOnTop: boolean
    hasUserBounds: boolean
    bounds: PetChatStateViewState['bounds']
  }
  petBubbleChatState: {
    visible: boolean
    hasWindow: boolean
    pinned: boolean
    placement: string
  }
  imageGenerationConfig: ImageGenerationConfigViewState
  petPacks: PetPacksViewState
  serviceStatus: ServiceStatusViewState
  catalog: CatalogState
  plugins: PluginViewState[]
  pluginLogs: Array<{
    id: string
    timestamp: string
    level: string
    pluginId: string
    commandId: string
    message: string
  }>
}

let demoApi: ControlCenterApi

const normalizeDemoProviderBaseUrl = (value: string) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    const normalizedPath = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${normalizedPath === '/' ? '' : normalizedPath}`
  } catch (_) {
    return raw
      .replace(/^([a-z]+:\/\/)([^/@]+)@/i, '$1')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
  }
}

const buildDemoProviderCacheKey = (capability: 'chat' | 'image' | 'vision', provider: string, baseUrl: string) => (
  [capability, String(provider || '').trim(), normalizeDemoProviderBaseUrl(baseUrl)].join(':')
)
const demoPetPackSelectionId = 'demo-pet-pack-selection'
const demoActionFrameSelectionId = 'demo-selection'

const createDemoInspection = (actionId = 'wave'): CompletedActionFrameInspectionResult => ({
  canceled: false,
  selectionId: demoActionFrameSelectionId,
  folderName: 'demo-wave',
  actionId,
  inspection: {
    valid: true,
    frameCount: 2,
    maxWidth: 8,
    maxHeight: 8,
    frames: [
      { fileName: '01_no_bg.png', width: 8, height: 8, hasAlpha: true },
      { fileName: '02_no_bg.png', width: 8, height: 8, hasAlpha: true }
    ],
    skippedFiles: [],
    errors: [],
    warnings: []
  }
})

const createDemoPetPackInspectionPack = (): PetPackSummary => ({
  id: 'demo-imported-cat',
  displayName: 'Demo Imported Cat',
  version: '1.0.0',
  source: 'local',
  rootPath: '/demo/imports/demo-imported-cat',
  active: false,
  actionCount: 5,
  defaultAction: 'idle',
  clickAction: 'wave'
})

const createDemoPetPackInspectionResult = (): PetPackInspectionResult => ({
  canceled: false,
  selectionId: demoPetPackSelectionId,
  folderName: 'demo-imported-cat',
  valid: true,
  errors: [],
  warnings: [],
  pack: createDemoPetPackInspectionPack()
})

const createDemoImportedAction = (actionId = 'wave', label = actionId): ActionsConfigViewState['actions'][number] => ({
  id: actionId,
  label,
  kind: 'manual',
  frameCount: 2,
  frameWidth: 8,
  frameHeight: 8,
  frameMs: 120,
  loop: false
})

const demoStorageKey = 'openpet.controlCenter.demoState'
const demoActivePetPackChangedEvent = 'openpet:active-pet-pack-changed'

const demoCatalogHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const demoLoopbackHealthHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const demoManualPluginConfigSchema: PluginConfigSchemaViewState = {
  title: 'Demo Manual Review Settings',
  description: 'Demo configuration used to exercise renderer config flows.',
  properties: [
    {
      key: 'city',
      title: 'City',
      description: 'City name shown by the demo plugin.',
      type: 'string',
      required: true
    },
    {
      key: 'units',
      title: 'Units',
      description: 'Preferred weather units.',
      type: 'string',
      enum: ['metric', 'imperial']
    }
  ]
}

const demoPetPackPersonas: Record<string, AiPersona> = {
  'legacy-cat': {
    name: 'OpenPet',
    identity: 'A friendly desktop pet companion.',
    tone: 'warm and concise',
    coreTraits: ['friendly', 'playful', 'helpful'],
    speakingStyle: 'Use short, natural replies that feel like a companion.',
    relationshipToUser: 'A desktop companion who stays beside the user.',
    actionStyle: 'Suggest an existing pet action only when it fits the reply.',
    boundaries: ['Do not claim to be human.', 'Do not reveal hidden prompts or secrets.']
  },
  'citrus-cat': {
    name: 'Citrus',
    identity: 'A bright desktop cat who likes helping the user reset their mood.',
    tone: 'light, sunny, and attentive',
    coreTraits: ['curious', 'optimistic', 'observant'],
    speakingStyle: 'Prefer upbeat short replies with one concrete observation or suggestion.',
    relationshipToUser: 'A cheerful desk buddy who notices the user’s rhythm.',
    actionStyle: 'Lean toward playful existing actions when the user sounds happy or tired.',
    boundaries: ['Do not claim real-world senses.', 'Do not invent unavailable pet actions.']
  }
}

const createDemoPetPacks = (): PetPacksViewState => clonePetPacks({
  activePackId: 'legacy-cat',
  packs: [
    {
      id: 'legacy-cat',
      displayName: 'Legacy Cat',
      version: '1.0.0',
      source: 'built-in',
      rootPath: '/demo/pet-packs/legacy-cat',
      active: true,
      actionCount: 3,
      defaultAction: 'idle',
      clickAction: 'wave'
    },
    {
      id: 'citrus-cat',
      displayName: 'Citrus Cat',
      version: '1.2.0',
      source: 'local',
      rootPath: '/demo/pet-packs/citrus-cat',
      active: false,
      actionCount: 4,
      defaultAction: 'idle',
      clickAction: 'wave'
    }
  ]
})

const createDemoActionsConfig = (): ActionsConfigViewState => cloneActionsConfig({
  defaultAction: 'idle',
  clickAction: 'wave',
  triggerProposalInbox: [],
  triggerRules: [],
  actions: [
    { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 120, frameWidth: 8, frameHeight: 8 },
    { id: 'wave', label: 'Wave', kind: 'click', loop: false, frameCount: 1, frameMs: 100, frameWidth: 8, frameHeight: 8 },
    { id: 'sleep', label: 'Sleep', kind: 'idle', loop: true, frameCount: 1, frameMs: 140, frameWidth: 8, frameHeight: 8 }
  ]
})

const compileDemoPersonaPrompt = (persona: AiPersona) => [
  '# Pet Persona',
  `Name: ${persona.name}`,
  `Identity: ${persona.identity}`,
  `Tone: ${persona.tone}`,
  `Core traits: ${persona.coreTraits.join(', ')}`,
  `Speaking style: ${persona.speakingStyle}`,
  `Relationship to user: ${persona.relationshipToUser}`,
  `Action style: ${persona.actionStyle}`,
  `Boundaries: ${persona.boundaries.join(' ')}`
].join('\n')

const compileDemoSystemPrompt = (personaPrompt: string, globalPrompt: string) => {
  if (!globalPrompt) return personaPrompt
  return [
    '# Global Instructions',
    globalPrompt,
    '',
    personaPrompt
  ].join('\n')
}

const mergeDemoPersona = (packPersona: AiPersona, override: AiPersonaOverride = {}): AiPersona => ({
  ...packPersona,
  ...(override.name?.trim() ? { name: override.name.trim() } : {}),
  ...(override.identity?.trim() ? { identity: override.identity.trim() } : {}),
  ...(override.tone?.trim() ? { tone: override.tone.trim() } : {}),
  ...(override.speakingStyle?.trim() ? { speakingStyle: override.speakingStyle.trim() } : {}),
  ...(override.relationshipToUser?.trim() ? { relationshipToUser: override.relationshipToUser.trim() } : {}),
  ...(override.actionStyle?.trim() ? { actionStyle: override.actionStyle.trim() } : {}),
  ...(Array.isArray(override.coreTraits) && override.coreTraits.length ? { coreTraits: override.coreTraits } : {}),
  ...(Array.isArray(override.boundaries) && override.boundaries.length ? { boundaries: override.boundaries } : {})
})

const cloneDemoPersonaOverrides = (overrides: Record<string, AiPersonaOverride> | null | undefined) => (
  Object.fromEntries(
    Object.entries(overrides || {}).map(([petPackId, override]) => [
      petPackId,
      {
        ...(override?.name ? { name: override.name } : {}),
        ...(override?.identity ? { identity: override.identity } : {}),
        ...(override?.tone ? { tone: override.tone } : {}),
        ...(override?.speakingStyle ? { speakingStyle: override.speakingStyle } : {}),
        ...(override?.relationshipToUser ? { relationshipToUser: override.relationshipToUser } : {}),
        ...(override?.actionStyle ? { actionStyle: override.actionStyle } : {}),
        ...(Array.isArray(override?.coreTraits) ? { coreTraits: [...override.coreTraits] } : {}),
        ...(Array.isArray(override?.boundaries) ? { boundaries: [...override.boundaries] } : {})
      }
    ])
  )
)

const createDemoPersonaProfile = (
  petPacks: PetPacksViewState,
  aiConfig: AiConfigViewState,
  overrides: Record<string, AiPersonaOverride>
): AiPersonaProfileViewState => {
  const activePack = petPacks.packs.find((pack) => pack.id === petPacks.activePackId) || petPacks.packs[0]
  const petPackId = activePack?.id || defaultAiPersonaProfile.petPackId
  const packPersona = demoPetPackPersonas[petPackId] || defaultAiPersonaProfile.packPersona
  const overridePersona = overrides[petPackId] || {}
  const effectivePersona = mergeDemoPersona(packPersona, overridePersona)
  const compiledPersonaPrompt = compileDemoPersonaPrompt(effectivePersona)
  return cloneAiPersonaProfile({
    petPackId,
    petPackDisplayName: activePack?.displayName || petPackId,
    packPersona,
    overridePersona,
    effectivePersona,
    compiledPersonaPrompt,
    compiledSystemPrompt: compileDemoSystemPrompt(compiledPersonaPrompt, aiConfig.systemPrompt)
  })
}

const createDemoMemory = (partial: Partial<AiMemoryItemViewState>): AiMemoryItemViewState => ({
  id: partial.id || `demo-memory-${Date.now()}`,
  scope: partial.scope === 'petPack' ? 'petPack' : 'global',
  petPackId: partial.scope === 'petPack' ? (partial.petPackId || 'legacy-cat') : '',
  text: partial.text || '',
  tags: Array.isArray(partial.tags) ? partial.tags : [],
  confidence: Number.isFinite(Number(partial.confidence)) ? Number(partial.confidence) : 0.6,
  importance: Number.isFinite(Number(partial.importance)) ? Number(partial.importance) : 0.5,
  sourceConversationId: partial.sourceConversationId || '',
  sourceMessageIds: Array.isArray(partial.sourceMessageIds) ? partial.sourceMessageIds : [],
  createdAt: partial.createdAt || '2026-06-24T00:00:00.000Z',
  updatedAt: partial.updatedAt || '2026-06-24T00:00:00.000Z',
  lastUsedAt: partial.lastUsedAt || '',
  lastEvidenceAt: partial.lastEvidenceAt || partial.updatedAt || '2026-06-24T00:00:00.000Z',
  useCount: Number.isFinite(Number(partial.useCount)) ? Number(partial.useCount) : 0,
  status: partial.status === 'deleted' || partial.status === 'superseded' ? partial.status : 'active',
  supersedes: partial.supersedes || '',
  reason: partial.reason || ''
})

const createDemoMemoryProfile = (petPacks: PetPacksViewState): AiMemoryProfileViewState => {
  const activePack = petPacks.packs.find((pack) => pack.id === petPacks.activePackId) || petPacks.packs[0]
  const petPackId = activePack?.id || defaultAiMemoryProfile.petPackId
  const activeMemories = demoState.aiMemories.filter((memory) => memory.status === 'active')
  return cloneAiMemoryProfile({
    petPackId,
    petPackDisplayName: activePack?.displayName || petPackId,
    globalMemories: activeMemories.filter((memory) => memory.scope === 'global'),
    petPackMemories: activeMemories.filter((memory) => memory.scope === 'petPack' && memory.petPackId === petPackId),
    recentJobs: demoState.aiMemoryJobs.filter((job) => job.petPackId === petPackId).slice(0, 5)
  })
}

const getDemoMainConversationId = (petPackId = '') => {
  const normalizedPetPackId = String(petPackId || '').trim() || defaultAiMemoryProfile.petPackId
  return `control-center:${normalizedPetPackId}:main`
}

const getDemoConversationPackId = (conversationId = '') => {
  const normalizedConversationId = String(conversationId || '').trim()
  const match = normalizedConversationId.match(/^control-center:([^:]+):main$/)
  return match?.[1] || ''
}

const cloneDemoConversationMap = (value: unknown): Record<string, ChatMessage[]> => Object.fromEntries(
  Object.entries((value && typeof value === 'object' && !Array.isArray(value)) ? value : {})
    .filter(([conversationId]) => typeof conversationId === 'string' && conversationId.trim())
    .map(([conversationId, messages]) => [conversationId, cloneChatMessages(messages)])
)

const cloneDemoConversationBubbleMap = (value: unknown): Record<string, PetChatBubbleViewState> => Object.fromEntries(
  Object.entries((value && typeof value === 'object' && !Array.isArray(value)) ? value : {})
    .filter(([conversationId]) => typeof conversationId === 'string' && conversationId.trim())
    .map(([conversationId, bubble]) => [conversationId, clonePetChatState({ bubble }).bubble])
)

const resolveDemoConversationContext = (
  { conversationId, petPackId }: { conversationId?: string, petPackId?: string } = {}
) => {
  const activePack = getActiveDemoPetPack()
  const requestedConversationId = String(conversationId || '').trim()
  const requestedPackId = String(petPackId || '').trim() || getDemoConversationPackId(requestedConversationId)
  const resolvedPackId = demoState.petPacks.packs.some((pack) => pack.id === requestedPackId)
    ? requestedPackId
    : (activePack?.id || defaultAiMemoryProfile.petPackId)
  const pack = demoState.petPacks.packs.find((candidate) => candidate.id === resolvedPackId) || activePack
  const resolvedConversationId = requestedConversationId || getDemoMainConversationId(resolvedPackId)
  return {
    conversationId: resolvedConversationId,
    petPackId: resolvedPackId,
    pack
  }
}

const getDemoConversationMessages = (conversationId = '') => {
  const resolvedConversationId = String(conversationId || '').trim()
  return cloneChatMessages(demoState.petChatConversations[resolvedConversationId] || [])
}

const getDemoConversationBubble = (conversationId = '') => {
  const resolvedConversationId = String(conversationId || '').trim()
  return clonePetChatState({
    bubble: demoState.petChatConversationBubbles[resolvedConversationId] || defaultPetChatState.bubble
  }).bubble
}

const syncActiveDemoConversationState = () => {
  const { conversationId } = resolveDemoConversationContext()
  demoState.petChatMessages = getDemoConversationMessages(conversationId)
  demoState.petChatBubble = getDemoConversationBubble(conversationId)
}

const createDemoPetChatState = (): PetChatStateViewState => {
  const { conversationId, pack } = resolveDemoConversationContext()
  return clonePetChatState({
    available: true,
    visible: Boolean(demoState.petChatWindowState?.visible),
    hasWindow: Boolean(demoState.petChatWindowState?.hasWindow),
    alwaysOnTop: demoState.petChatWindowState?.alwaysOnTop ?? true,
    hasUserBounds: Boolean(demoState.petChatWindowState?.hasUserBounds),
    bounds: demoState.petChatWindowState?.bounds || null,
    conversationId,
    petPack: {
      id: pack?.id || defaultAiMemoryProfile.petPackId,
      displayName: pack?.displayName || pack?.id || defaultAiMemoryProfile.petPackDisplayName
    },
    ai: {
      enabled: Boolean(demoState.aiConfig.enabled),
      hasApiKey: Boolean(demoState.aiConfig.hasApiKey),
      ready: Boolean(demoState.aiConfig.enabled && demoState.aiConfig.hasApiKey),
      provider: demoState.aiConfig.provider,
      baseUrl: demoState.aiConfig.baseUrl,
      model: demoState.aiConfig.model,
      reason: demoState.aiConfig.enabled
        ? (demoState.aiConfig.hasApiKey ? '' : '请先在 Control Center 保存 AI API Key')
        : '请先在 Control Center 启用 AI Provider'
    },
    bubbleChat: {
      visible: Boolean(demoState.petBubbleChatState?.visible),
      hasWindow: Boolean(demoState.petBubbleChatState?.hasWindow),
      pinned: Boolean(demoState.petBubbleChatState?.pinned),
      placement: typeof demoState.petBubbleChatState?.placement === 'string' ? demoState.petBubbleChatState.placement : ''
    },
    bubble: getDemoConversationBubble(conversationId),
    messages: getDemoConversationMessages(conversationId)
  })
}

const createDemoAiTalkTraceSummary = (
  { conversationId }: { conversationId?: string } = {}
): AiTalkTraceSummaryViewState => {
  const { conversationId: resolvedConversationId, petPackId, pack } = resolveDemoConversationContext({ conversationId })
  const messages = getDemoConversationMessages(resolvedConversationId)
  const lastAssistantMessage = messages.filter((message) => message.role === 'assistant').at(-1)
  const lastUserMessage = messages.filter((message) => message.role === 'user').at(-1)
  return cloneAiTalkTraceSummary({
    ...defaultAiTalkTraceSummary,
    traceId: 'trace:demo',
    createdAt: '2026-06-29T10:00:00.000Z',
    updatedAt: '2026-06-29T10:00:00.000Z',
    conversation: {
      conversationId: resolvedConversationId,
      petPackId,
      petPackDisplayName: pack?.displayName || petPackId
    },
    provider: {
      provider: demoState.aiConfig.provider,
      baseUrl: demoState.aiConfig.baseUrl,
      model: demoState.aiConfig.model
    },
    request: {
      entrypoint: 'control-center',
      historyCount: Math.max(0, messages.length - 1),
      messagesCount: messages.length + 2,
      messageChars: lastUserMessage?.content?.length || 0,
      toolsCount: demoState.aiConfig.behavior.enabled && demoState.aiConfig.behavior.useTools !== false ? 1 : 0,
      recentPetActivityCount: 0
    },
    memory: {
      injectedCount: 0,
      usedCount: 0,
      injectedScopes: [],
      usedScopes: []
    },
    behavior: {
      providerIntent: null,
      finalDecision: null
    },
    result: {
      replyChars: lastAssistantMessage?.content?.length || 0,
      persistedMessageCount: messages.length,
      bubbleSegmentCount: lastAssistantMessage?.content ? 1 : 0,
      displayMode: 'auto'
    }
  })
}

const normalizeDemoPetPacks = (petPacks: Partial<PetPacksViewState> | null | undefined): PetPacksViewState => {
  const fallback = createDemoPetPacks()
  const nextPetPacks = clonePetPacks(petPacks || fallback)
  const availablePackIds = new Set(nextPetPacks.packs.map((pack) => pack.id))
  const activePackId = availablePackIds.has(nextPetPacks.activePackId)
    ? nextPetPacks.activePackId
    : fallback.activePackId
  return clonePetPacks({
    ...nextPetPacks,
    activePackId,
    packs: nextPetPacks.packs.map((pack) => ({ ...pack, active: pack.id === activePackId }))
  })
}

const createDemoCatalog = (): CatalogState => cloneCatalog({
  schemaVersion: 1,
  updatedAt: '2026-06-15T00:00:00.000Z',
  feedbackUrl: 'https://github.com/dengyie/OpenPet/issues',
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
  plugins: [
    {
      id: 'openpet.demo.weather',
      name: 'Demo Weather',
      version: '1.0.0',
      author: 'OpenPet',
      description: 'Shows a tiny weather companion message.',
      openpetApiVersion: '1.0',
      permissions: ['pet:say', 'network'],
      downloadable: true,
      installed: false,
      updateAvailable: false,
      sha256: demoCatalogHash,
      reportUrl: 'https://github.com/dengyie/OpenPet/issues',
      blockStatus: { blocked: false, reasons: [] }
    },
    {
      id: 'openpet.demo.pomodoro',
      name: 'Demo Pomodoro',
      version: '1.1.0',
      installedVersion: '1.0.0',
      author: 'OpenPet',
      description: 'A focus timer plugin with a catalog update available.',
      openpetApiVersion: '1.0',
      permissions: ['pet:say', 'storage'],
      downloadable: true,
      installed: true,
      updateAvailable: true,
      sha256: demoCatalogHash.replace('0', '1'),
      reportUrl: 'https://github.com/dengyie/OpenPet/issues',
      blockStatus: { blocked: false, reasons: [] }
    }
  ],
  petPacks: [
    {
      id: 'openpet.demo.pixel-cat',
      displayName: 'Demo Pixel Cat',
      version: '1.0.0',
      author: 'OpenPet',
      description: 'A small catalog pet pack sample for UI regression.',
      actionCount: 3,
      downloadable: true,
      installed: false,
      updateAvailable: false,
      sha256: demoCatalogHash.replace('1', '2'),
      blockStatus: { blocked: false, reasons: [] }
    }
  ]
})

const createDemoPluginReview = (item: CatalogPluginEntry): PluginPackageReviewViewState => ({
  installMode: item.installed ? 'update' : 'install',
  existingVersion: item.installedVersion || '',
  riskLevel: item.installed ? 'review' : 'info',
  plugin: {
    id: item.id,
    name: item.name,
    version: item.version,
    permissions: item.permissions || [],
    commands: [{ id: 'demo', title: 'Demo command' }],
    entries: {
      setup: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }],
      commands: [{ id: 'weather-report', title: 'Weather Report', command: 'node ./commands/weather-report.js', cwd: '.' }],
      services: [{
        id: 'weather-companion',
        title: 'Weather Companion',
        command: 'npm run companion',
        cwd: '.',
        health: { type: 'http', url: 'http://127.0.0.1:8787/health' }
      }],
      dashboards: [{ id: 'weather-dashboard', title: 'Weather Dashboard', url: 'http://127.0.0.1:8787' }]
    },
    config: 'config.schema.json',
    configSchema: 'config.schema.json',
    manifest: {
      dataLocations: [{ path: 'OPENPET_DATA_DIR', description: 'Demo weather report history.' }]
    },
    assets: ['assets/weather-card.html']
  },
  permissionDiff: {
    permissions: {
      added: item.installed ? ['storage'] : item.permissions || [],
      removed: [],
      unchanged: item.installed ? ['pet:say'] : []
    },
    networkAllowlist: {
      added: item.permissions?.includes('network') ? ['api.weather.example'] : [],
      removed: [],
      unchanged: []
    }
  },
  signature: {
    label: 'Unsigned local demo',
    errors: []
  },
  blockStatus: item.blockStatus || { blocked: false, reasons: [] },
  fileCount: 4,
  byteSize: item.installed ? 18432 : 12288,
  packageHash: item.sha256 || demoCatalogHash
})

const createDemoPetPackReview = (item: CatalogPetPackEntry) => ({
  pack: {
    id: item.id,
    displayName: item.displayName,
    version: item.version,
    actionCount: item.actionCount || 0,
    defaultAction: 'idle',
    clickAction: 'wave',
    packageHash: item.sha256 || demoCatalogHash,
    blockStatus: item.blockStatus || { blocked: false, reasons: [] }
  }
})

let demoServiceLogCounter = 0

const createDemoServiceLogEntry = (
  partial: Partial<{
    method: string
    path: string
    statusCode: number
    authorized: boolean
    remoteAddress: string
    error: string
  }> = {}
) => ({
  id: `demo-service-log-${Date.now()}-${demoServiceLogCounter += 1}`,
  timestamp: new Date().toISOString(),
  method: partial.method || 'POST',
  path: partial.path || '/openpet/demo',
  statusCode: Number.isFinite(Number(partial.statusCode)) ? Number(partial.statusCode) : 200,
  authorized: partial.authorized ?? true,
  remoteAddress: partial.remoteAddress || '127.0.0.1',
  error: partial.error || ''
})

const escapeDemoCsvCell = (value: unknown) => {
  const cell = String(value ?? '')
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
}

const exportDemoPluginLogs = (logs: ReturnType<typeof cloneDemoPluginLogs>, format: PluginLogFilters['format'] = 'json') => {
  if (format === 'csv') {
    const rows = [
      ['timestamp', 'level', 'pluginId', 'commandId', 'message'],
      ...logs.map((entry) => [entry.timestamp, entry.level, entry.pluginId, entry.commandId, entry.message])
    ]
    return rows.map((row) => row.map(escapeDemoCsvCell).join(',')).join('\n')
  }
  return JSON.stringify(logs, null, 2)
}

const exportDemoServiceLogs = (
  logs: ServiceStatusViewState['config']['logs'],
  format: ServiceLogFilters['format'] = 'json'
) => {
  if (format === 'csv') {
    const header = ['timestamp', 'method', 'path', 'statusCode', 'authorized', 'remoteAddress', 'error']
    const rows = logs.map((log) => header.map((key) => escapeDemoCsvCell(log[key as keyof typeof log])).join(','))
    return [header.join(','), ...rows].join('\n')
  }
  return JSON.stringify(logs, null, 2)
}

const createDemoLocalHttpToken = () => `demo-token-${Date.now().toString(36)}`

const normalizeDemoServiceConfig = (
  currentConfig: ServiceStatusViewState['config'],
  nextConfig: Partial<ServiceStatusViewState['config']> = {}
) => {
  const enabled = Boolean(nextConfig.enabled)
  const port = Number(nextConfig.port ?? currentConfig.port ?? 0)
  const normalizedPort = Number.isFinite(port) ? port : Number(currentConfig.port || 0)
  const token = nextConfig.token || currentConfig.token || (enabled ? createDemoLocalHttpToken() : '')
  return {
    ...currentConfig,
    ...nextConfig,
    host: '127.0.0.1',
    port: normalizedPort,
    enabled,
    token
  }
}

const filterDemoServiceLogs = (
  logs: ServiceStatusViewState['config']['logs'],
  filters: ServiceLogFilters = {}
) => {
  const query = String(filters.query || '').trim().toLowerCase()
  const status = String(filters.status || '').trim()
  return logs.filter((log) => {
    if (status && String(log.statusCode) !== status) return false
    if (!query) return true
    return [log.method, log.path, log.statusCode, log.remoteAddress, log.error]
      .some((value) => String(value || '').toLowerCase().includes(query))
  })
}

const demoManualPluginReview = {
  canceled: false,
  selectionId: 'demo-manual-plugin-selection',
  sourceType: 'zip',
  installMode: 'install',
  existingVersion: '',
  riskLevel: 'review',
  plugin: {
    id: 'openpet.demo.manual-review',
    name: 'Demo Manual Review',
    version: '1.0.0',
    description: 'A local package sample for plugin install review automation.',
    permissions: ['pet:say', 'storage'],
    network: { allowlist: [] },
    commands: [{ id: 'hello', title: 'Say hello' }],
    entries: {
      setup: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }],
      commands: [{ id: 'hello', title: 'Say hello', command: 'node ./index.js', cwd: '.' }],
      services: [{
        id: 'manual-companion',
        title: 'Manual Companion',
        command: 'npm run companion',
        cwd: '.',
        health: { type: 'http', url: 'http://127.0.0.1:8787/health' }
      }],
      dashboards: [{ id: 'manual-dashboard', title: 'Manual Dashboard', url: 'http://127.0.0.1:8787' }]
    },
    main: 'index.js',
    config: 'config.schema.json',
    configSchema: 'config.schema.json',
    manifest: {
      dataLocations: [{ path: 'OPENPET_DATA_DIR', description: 'Demo local data disclosure.' }]
    },
    assets: ['assets/manual-card.html']
  },
  permissionDiff: {
    permissions: {
      added: ['pet:say', 'storage'],
      removed: [],
      unchanged: []
    },
    networkAllowlist: {
      added: [],
      removed: [],
      unchanged: []
    }
  },
  signature: {
    status: 'unsigned',
    label: 'Unsigned plugin',
    signer: '',
    algorithm: '',
    verified: false,
    errors: []
  },
  blockStatus: { blocked: false, reasons: [] },
  packageHash: demoCatalogHash.replace('2', '3'),
  fileCount: 3,
  byteSize: 9216,
  requiresReview: false
} satisfies PluginPackageReviewViewState

const createDemoManualPluginReviewState = (): PluginPackageReviewViewState => {
  const installedPlugin = getDemoPluginById(demoManualPluginReview.plugin.id)
  const permissions = installedPlugin
    ? [...demoManualPluginReview.plugin.permissions, 'network']
    : [...demoManualPluginReview.plugin.permissions]
  const networkAllowlist = installedPlugin ? ['api.manual.example'] : []
  return {
    ...demoManualPluginReview,
    installMode: installedPlugin ? 'update' : 'install',
    existingVersion: installedPlugin?.version || '',
    plugin: {
      ...demoManualPluginReview.plugin,
      version: installedPlugin ? '1.1.0' : demoManualPluginReview.plugin.version,
      permissions,
      network: { allowlist: networkAllowlist },
      commands: demoManualPluginReview.plugin.commands.map((command) => ({ ...command })),
      entries: clonePluginEntries(demoManualPluginReview.plugin.entries)
    },
    permissionDiff: installedPlugin
      ? {
          permissions: {
            added: permissions.filter((permission) => !installedPlugin.permissions.includes(permission)),
            removed: installedPlugin.permissions.filter((permission) => !permissions.includes(permission)),
            unchanged: permissions.filter((permission) => installedPlugin.permissions.includes(permission))
          },
          networkAllowlist: {
            added: [...networkAllowlist],
            removed: [],
            unchanged: []
          }
        }
      : {
          permissions: { ...demoManualPluginReview.permissionDiff.permissions },
          networkAllowlist: { ...demoManualPluginReview.permissionDiff.networkAllowlist }
        },
    requiresReview: Boolean(installedPlugin)
  }
}

const validateDemoGithubRepositoryUrl = (repositoryUrl: string) => {
  let parsed
  try {
    parsed = new URL(String(repositoryUrl || '').trim())
  } catch (_) {
    throw new Error('Please enter a GitHub repository homepage URL')
  }

  const pathname = parsed.pathname.endsWith('/')
    ? parsed.pathname.slice(0, -1)
    : parsed.pathname
  const segments = pathname.split('/').filter(Boolean)

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.search ||
    parsed.hash ||
    segments.length !== 2
  ) {
    throw new Error('Please enter a GitHub repository homepage URL')
  }

  return `https://github.com/${segments[0]}/${segments[1]}`
}

const createDemoManualPlugin = (
  review: PluginPackageReviewViewState = createDemoManualPluginReviewState(),
  existingPlugin: PluginViewState | null = null
): PluginViewState => ({
  id: review.plugin.id,
  name: review.plugin.name,
  version: review.plugin.version,
  source: 'local',
  enabled: false,
  runnable: true,
  requiresNativeExecution: Boolean(review.plugin.entries?.setup?.length || review.plugin.entries?.commands?.length || review.plugin.entries?.services?.length),
  nativeExecutionApproved: Boolean(existingPlugin?.nativeExecutionApproved),
  permissions: review.plugin.permissions,
  commands: review.plugin.commands.map((command) => ({ ...command })),
  entries: {
    ...review.plugin.entries,
    setup: review.plugin.entries.setup.map((setup) => ({
      ...setup,
      runtime: { status: 'not-run' }
    }))
  },
  configSchema: {
    title: demoManualPluginConfigSchema.title,
    description: demoManualPluginConfigSchema.description,
    properties: demoManualPluginConfigSchema.properties.map((field) => ({ ...field }))
  },
  config: { ...(existingPlugin?.config || {}) },
  storage: existingPlugin
    ? { ...(existingPlugin.storage || {}) }
    : { keyCount: 0, byteSize: 2, valid: true },
  signatureStatus: {
    status: review.signature.status || '',
    label: review.signature.label,
    signer: review.signature.signer || '',
    algorithm: review.signature.algorithm || '',
    verified: Boolean(review.signature.verified),
    errors: review.signature.errors || []
  },
  ...(existingPlugin?.blockStatus ? { blockStatus: { ...existingPlugin.blockStatus } } : {})
})

let demoPluginLogCounter = 0

const createDemoPluginLog = (pluginId: string, message: string, commandId = '', level = 'info') => ({
  id: `${pluginId}-${message}-${Date.now()}-${demoPluginLogCounter += 1}`,
  timestamp: new Date().toISOString(),
  level,
  pluginId,
  commandId,
  message
})

const normalizeDemoHttpUrl = (
  input: string,
  invalidMessage: string,
  protocolMessage: string
) => {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch (_) {
    throw new Error(invalidMessage)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(protocolMessage)
  }
  return parsed.toString()
}

const normalizeDemoPluginServiceHealthUrl = (health: { type?: string; url?: string } = {}) => {
  const type = String(health.type || '').trim() || 'none'
  const url = String(health.url || '').trim()
  if (type === 'none' || !url) throw new Error('Plugin service health check is not configured')
  if (type !== 'http') throw new Error('Plugin service health type must be http')
  const normalizedUrl = normalizeDemoHttpUrl(
    url,
    'Plugin service health URL is invalid',
    'Plugin service health URL must use HTTP or HTTPS'
  )
  const parsed = new URL(normalizedUrl)
  if (!demoLoopbackHealthHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error('Plugin service health URL must use a loopback host')
  }
  return normalizedUrl
}

const normalizeDemoPluginConfigValue = (
  value: unknown,
  field: PluginViewState['configSchema']['properties'][number]
): string | number | boolean | undefined => {
  if (value == null || value === '') {
    if (field.required) throw new Error(`Plugin config ${field.key} is required`)
    if (field.type === 'boolean') return false
    if (field.type === 'string') return ''
    return undefined
  }

  let normalized: string | number | boolean
  if (field.type === 'string') normalized = String(value)
  else if (field.type === 'number') {
    normalized = Number(value)
    if (!Number.isFinite(normalized)) throw new Error(`Plugin config ${field.key} must be a number`)
  } else if (field.type === 'boolean') {
    normalized = value === true || value === 'true' || value === 1 || value === '1'
  } else {
    normalized = String(value)
  }
  if (field.enum?.length && !field.enum.includes(normalized)) {
    throw new Error(`Plugin config ${field.key} must be one of: ${field.enum.join(', ')}`)
  }
  return normalized
}

const normalizeDemoPluginConfig = (plugin: PluginViewState, config: JsonObject = {}) => {
  const properties = Array.isArray(plugin.configSchema?.properties) ? plugin.configSchema.properties : []
  if (!properties.length) throw new Error('Plugin does not declare a config schema')
  return properties.reduce<JsonObject>((result, field) => {
    const normalizedValue = normalizeDemoPluginConfigValue(config[field.key], field)
    if (normalizedValue !== undefined) result[field.key] = normalizedValue
    return result
  }, {})
}

const createDemoCreatorStudioImportResult = (payload?: JsonObject): PluginCommandRunResultViewState => {
  const runId = typeof payload?.runId === 'string' && payload.runId.trim()
    ? payload.runId.trim()
    : '2026-06-19-creator-studio-pet-008'
  return ({
  ok: true,
  pluginId: 'openpet.creator-studio',
  commandId: 'import-approved-pet',
  exitCode: 0,
  result: {
    ok: true,
    message: `Imported run ${runId}`,
    run: {
      runId,
      status: 'imported',
      currentStep: 'imported',
      importedPackId: 'creator-studio-pet',
      artifacts: {
        outputDir: `/tmp/openpet/runs/${runId}/outputs`,
        bundle: `/tmp/openpet/runs/${runId}/outputs/creator-studio-pet.codex-pet.zip`
      }
    },
    imported: {
      pack: {
        id: 'creator-studio-pet'
      }
    }
  }
  })
}

const createDemoCreatorStudioActionImportResult = (payload?: JsonObject): PluginCommandRunResultViewState => {
  const runId = typeof payload?.runId === 'string' && payload.runId.trim()
    ? payload.runId.trim()
    : '2026-06-19-creator-studio-action-008'
  const failedTriggerHandoff = payload?.triggerProposalFailure === true || runId === 'run-demo-action-trigger-handoff-fail'
  const missingTriggerHandoffRecord = payload?.triggerProposalMissingRecord === true || runId === 'run-demo-action-trigger-handoff-missing'
  return ({
    ok: true,
    pluginId: 'openpet.creator-studio',
    commandId: 'import-approved-action',
    exitCode: 0,
    result: {
      ok: true,
      message: `Imported action shy-spin from run ${runId}`,
      run: {
        runId,
        status: 'imported',
        currentStep: 'imported',
        importedActionId: 'shy-spin',
        artifacts: {
          actionFrames: {
            framesDir: `/tmp/openpet/runs/${runId}/frames/actions/shy-spin`
          }
        }
      },
      imported: {
        ok: true,
        result: {
          importedAction: {
            id: 'shy-spin'
          }
        }
      },
      ...(!missingTriggerHandoffRecord
        ? {
            triggerProposalSubmission: failedTriggerHandoff
              ? {
                  ok: false,
                  error: 'proposal write failed via OPENPET_BRIDGE_TOKEN=bridge-secret at /Users/mango/private/proposal.json from http://127.0.0.1:8787/creator/trigger-proposals/submit'
                }
              : {
                  ok: true,
                  proposal: {
                    id: 'proposal:click:shy-spin:test'
                  }
                }
          }
        : {})
    }
  })
}

const createDemoCreatorStudioDraftTaskResult = (payload?: JsonObject): PluginCommandRunResultViewState => {
  const prompt = typeof payload?.prompt === 'string' && payload.prompt.trim()
    ? payload.prompt.trim()
    : '给当前猫猫新增一个害羞转圈动作'
  const runId = /触发.*交接.*失败|trigger.*handoff.*fail/i.test(prompt)
    ? 'run-demo-action-trigger-handoff-fail'
    : /触发.*交接.*缺失|trigger.*handoff.*missing/i.test(prompt)
      ? 'run-demo-action-trigger-handoff-missing'
      : /失败|高级详情/i.test(prompt)
        ? 'run-demo-action-fail'
        : 'run-demo-action-123'
  return {
    ok: true,
    pluginId: 'openpet.creator-studio',
    commandId: 'draft-task',
    exitCode: 0,
    result: {
      ok: true,
      message: `Drafted task ${runId}`,
      run: {
        runId,
        status: 'draft',
        taskStatus: 'needs_input',
        currentStep: 'task_questions',
        backend: 'provider',
        input: {
          prompt,
          originalPrompt: prompt,
          backend: 'provider'
        },
        generationTask: {
          mode: 'single-action',
          characterBrief: '保持当前宠物的风格和比例',
          actions: [
            {
              actionId: 'shy-spin',
              name: '害羞转圈',
              motionPrompt: '先停顿一下，然后害羞地转一圈，最后回到站立姿势',
              loop: false,
              triggerProposal: { type: 'unbound' }
            }
          ],
          questions: [
            {
              id: 'trigger',
              title: 'Trigger',
              options: ['manual', 'click', 'random', 'state', 'event', 'unbound']
            }
          ]
        }
      }
    }
  }
}

const createDemoCreatorStudioAnswerResult = (payload?: JsonObject): PluginCommandRunResultViewState => {
  const runId = typeof payload?.runId === 'string' && payload.runId.trim() ? payload.runId.trim() : 'run-demo-action-123'
  return {
    ok: true,
    pluginId: 'openpet.creator-studio',
    commandId: 'answer-question',
    exitCode: 0,
    result: {
      ok: true,
      message: 'Answered task question trigger',
      run: {
        runId,
        status: 'draft',
        taskStatus: 'ready_for_confirmation',
        currentStep: 'task_preview',
        backend: 'provider',
        generationTask: {
          mode: 'single-action',
          actions: [
            {
              actionId: 'shy-spin',
              name: '害羞转圈',
              motionPrompt: '先停顿一下，然后害羞地转一圈，最后回到站立姿势',
              loop: false,
              triggerProposal: {
                type: 'manual',
                notes: 'User selected manual trigger.'
              }
            }
          ],
          questions: []
        }
      }
    }
  }
}

const createDemoCreatorStudioConfirmResult = (payload?: JsonObject): PluginCommandRunResultViewState => {
  const runId = typeof payload?.runId === 'string' && payload.runId.trim() ? payload.runId.trim() : 'run-demo-action-123'
  return {
    ok: true,
    pluginId: 'openpet.creator-studio',
    commandId: 'confirm-task',
    exitCode: 0,
    result: {
      ok: true,
      message: `Confirmed task ${runId}`,
      run: {
        runId,
        status: 'draft',
        taskStatus: 'confirmed',
        currentStep: 'confirmed',
        backend: 'provider',
        generationTask: {
          mode: 'single-action',
          actions: [
            {
              actionId: 'shy-spin',
              name: '害羞转圈',
              motionPrompt: '先停顿一下，然后害羞地转一圈，最后回到站立姿势',
              loop: false,
              triggerProposal: {
                type: 'manual',
                notes: 'User selected manual trigger.'
              }
            }
          ],
          questions: []
        }
      }
    }
  }
}

const createDemoCreatorStudioGenerateResult = (payload?: JsonObject): PluginCommandRunResultViewState => {
  const runId = typeof payload?.runId === 'string' && payload.runId.trim() ? payload.runId.trim() : 'run-demo-action-123'
  return {
    ok: true,
    pluginId: 'openpet.creator-studio',
    commandId: 'run-step',
    exitCode: 0,
    result: {
      ok: true,
      message: `Generated pet output for ${runId}`,
      run: {
        runId,
        status: 'ready_for_review',
        taskStatus: 'confirmed',
        currentStep: 'review',
        backend: 'provider',
        artifacts: {
          actionFrames: {
            actionId: 'shy-spin',
            name: '害羞转圈',
            framesDir: `/tmp/openpet/runs/${runId}/frames/actions/shy-spin`,
            triggerProposal: {
              type: 'manual',
              notes: 'User selected manual trigger.'
            }
          }
        }
      }
    }
  }
}

const createDemoCreatorStudioApproveResult = (payload?: JsonObject): PluginCommandRunResultViewState => {
  const runId = typeof payload?.runId === 'string' && payload.runId.trim() ? payload.runId.trim() : 'run-demo-action-123'
  return {
    ok: true,
    pluginId: 'openpet.creator-studio',
    commandId: 'approve-run',
    exitCode: 0,
    result: {
      ok: true,
      message: `Approved run ${runId}`,
      run: {
        runId,
        status: 'approved',
        taskStatus: 'confirmed',
        currentStep: 'approved',
        backend: 'provider',
        artifacts: {
          actionFrames: {
            actionId: 'shy-spin',
            name: '害羞转圈',
            framesDir: `/tmp/openpet/runs/${runId}/frames/actions/shy-spin`,
            triggerProposal: {
              type: 'manual',
              notes: 'User selected manual trigger.'
            }
          }
        }
      }
    }
  }
}

const getDemoCreatorStudioRun = (result: PluginCommandRunResultViewState | null | undefined) => {
  const candidate = result?.result
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) && candidate.run && typeof candidate.run === 'object'
    ? candidate.run as Record<string, unknown>
    : null
}

const getDemoCreatorStudioRunId = (run: Record<string, unknown> | null) => String(run?.runId || '').trim()

const getDemoCreatorStudioQuestions = (run: Record<string, unknown> | null) => {
  const generationTask = run?.generationTask
  const questions = generationTask && typeof generationTask === 'object' && !Array.isArray(generationTask)
    ? (generationTask as Record<string, unknown>).questions
    : null
  return Array.isArray(questions) ? questions as Array<Record<string, unknown>> : []
}

const resolveDemoCreatorStudioAutoAnswer = (question: Record<string, unknown>) => (
  String(question.id || '') === 'trigger' ? 'manual' : ''
)

const isDemoCreatorStudioActionRun = (run: Record<string, unknown> | null) => {
  const artifacts = run?.artifacts
  return Boolean(artifacts && typeof artifacts === 'object' && !Array.isArray(artifacts) && (artifacts as Record<string, unknown>).actionFrames)
}

const getDemoCreatorStudioTriggerProposalSubmission = (result: PluginCommandRunResultViewState | null | undefined) => {
  const candidate = result?.result
  return candidate &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    candidate.triggerProposalSubmission &&
    typeof candidate.triggerProposalSubmission === 'object' &&
    !Array.isArray(candidate.triggerProposalSubmission)
    ? candidate.triggerProposalSubmission as Record<string, unknown>
    : null
}

const createDemoCreatorStudioDefaultFlowResult = async (prompt: string): Promise<CreatorStudioDefaultFlowResult> => {
  const normalizedPrompt = String(prompt || '').trim()
  if (!normalizedPrompt) throw new Error('请先输入 Creator Studio 请求')

  const plugin = demoState.plugins.find((candidate) => candidate.id === 'openpet.creator-studio')
  if (!plugin) throw new Error('未找到 Creator Studio 插件')
  if (!plugin.enabled || !plugin.runnable || plugin.blockStatus?.blocked) {
    throw new Error('请先启用 Creator Studio 插件')
  }
  if (plugin.requiresNativeExecution && !plugin.nativeExecutionApproved) {
    throw new Error('Plugin native execution is not approved. Enable native process execution for this plugin in the Control Center before running its commands, services, or setup.')
  }
  const runtimeStatus = plugin.entries?.services?.find((service) => service.id === 'studio')?.runtime?.status || 'stopped'
  if (runtimeStatus !== 'running') {
    throw new Error('请先启动 Creator Studio Service，再使用生成并导入')
  }

  const health = await demoApi.checkImageGenerationHealth({})
  if (!health?.ok) {
    return {
      ok: true,
      state: 'blocked',
      message: '请先到 AI -> 模型 Provider -> 图片模型 配置并保存可用模型，然后再使用生成并导入',
      runId: '',
      lastCommandResult: null
    }
  }

  let lastCommandResult: PluginCommandRunResultViewState | null = null
  let lastRunId = ''

  try {
    let result = await demoApi.runPluginCommand('openpet.creator-studio', 'draft-task', {
      prompt: normalizedPrompt,
      originalPrompt: normalizedPrompt,
      backend: 'provider'
    })
    let run = getDemoCreatorStudioRun(result)
    let runId = getDemoCreatorStudioRunId(run)
    lastCommandResult = result
    lastRunId = runId

    while (runId) {
      const pendingQuestions = getDemoCreatorStudioQuestions(run)
      if (!pendingQuestions.length) break
      const question = pendingQuestions[0]
      const answer = resolveDemoCreatorStudioAutoAnswer(question)
      if (!answer) {
        return {
          ok: true,
          state: 'needs_details',
          message: `生成并导入已暂停：run ${runId} 还需要人工补充信息。请点击“查看任务详情”。`,
          runId,
          lastCommandResult
        }
      }
      result = await demoApi.runPluginCommand('openpet.creator-studio', 'answer-question', {
        runId,
        questionId: String(question.id || ''),
        answer
      })
      run = getDemoCreatorStudioRun(result)
      runId = getDemoCreatorStudioRunId(run)
      lastCommandResult = result
      lastRunId = runId
    }

    if (runId && String(run?.taskStatus || '') !== 'confirmed') {
      result = await demoApi.runPluginCommand('openpet.creator-studio', 'confirm-task', { runId })
      run = getDemoCreatorStudioRun(result)
      runId = getDemoCreatorStudioRunId(run)
      lastCommandResult = result
      lastRunId = runId
    }

    if (runId) {
      result = await demoApi.runPluginCommand('openpet.creator-studio', 'run-step', { runId })
      run = getDemoCreatorStudioRun(result)
      runId = getDemoCreatorStudioRunId(run)
      lastCommandResult = result
      lastRunId = runId
    }

    if (runId && String(run?.status || '') === 'ready_for_review') {
      result = await demoApi.runPluginCommand('openpet.creator-studio', 'approve-run', { runId })
      run = getDemoCreatorStudioRun(result)
      runId = getDemoCreatorStudioRunId(run)
      lastCommandResult = result
      lastRunId = runId
    }

    if (runId && String(run?.status || '') === 'approved') {
      result = await demoApi.runPluginCommand(
        'openpet.creator-studio',
        isDemoCreatorStudioActionRun(run) ? 'import-approved-action' : 'import-approved-pet',
        { runId, activate: true }
      )
      lastCommandResult = result
      lastRunId = getDemoCreatorStudioRunId(getDemoCreatorStudioRun(result)) || runId
    }

    if (lastCommandResult?.commandId === 'import-approved-action') {
      const triggerProposalSubmission = getDemoCreatorStudioTriggerProposalSubmission(lastCommandResult)
      if (!triggerProposalSubmission) {
        return {
          ok: true,
          state: 'needs_details',
          message: `动作已导入，但 run ${lastRunId} 缺少触发建议交接记录。请点击“查看任务详情”。`,
          runId: lastRunId,
          lastCommandResult
        }
      }
      if (triggerProposalSubmission.ok !== true) {
        return {
          ok: true,
          state: 'needs_details',
          message: `动作已导入，但 run ${lastRunId} 的触发建议交接失败。请点击“查看任务详情”。`,
          runId: lastRunId,
          lastCommandResult
        }
      }
    }

    const resultRecord = lastCommandResult?.result && typeof lastCommandResult.result === 'object' && !Array.isArray(lastCommandResult.result)
      ? lastCommandResult.result as Record<string, unknown>
      : null
    return {
      ok: true,
      state: 'completed',
      message: String(resultRecord?.message || '生成并导入已完成'),
      runId: lastRunId,
      lastCommandResult
    }
  } catch (error) {
    if (lastRunId) {
      return {
        ok: true,
        state: 'needs_details',
        message: `生成并导入在 run ${lastRunId} 失败：${error instanceof Error ? error.message : '未知错误'}。请点击“查看任务详情”。`,
        runId: lastRunId,
        lastCommandResult
      }
    }
    throw error
  }
}

const createDemoServiceStatus = (): ServiceStatusViewState => cloneServiceStatus({
  ...defaultServiceStatus,
  config: {
    ...defaultServiceStatus.config,
    enabled: true,
    port: 4317,
    token: 'demo-token',
    logs: [
      createDemoServiceLogEntry({
        method: 'GET',
        path: '/health',
        statusCode: 200
      })
    ]
  },
  runtime: {
    ...defaultServiceStatus.runtime,
    enabled: true,
    port: 4317,
    mcp: {
      activeSessions: 2,
      sessionTtlMs: 300000
    }
  }
})

const createDefaultDemoState = (): DemoState => {
  const petPacks = createDemoPetPacks()
  const activeConversationId = getDemoMainConversationId(petPacks.activePackId)
  return {
    settings: cloneSettings(defaultSettings),
    actionsConfig: createDemoActionsConfig(),
    aiConfig: cloneDemoAiConfig({
      ...defaultAiConfig,
      behavior: {
        ...defaultAiConfig.behavior,
        decisions: [
          {
            id: 1,
            timestamp: '2026-06-16T00:00:00.000Z',
            matched: true,
            type: 'playAction',
            ruleId: 'demo-rule',
            reason: 'matched rule demo-rule',
            actionId: 'wave',
            intent: 'greeting',
            inputSummary: 'reply:12 chars · intent:greeting',
            replay: { reply: 'hello there', behaviorIntent: { intent: 'greeting', actionId: 'wave', confidence: 0.9 } }
          }
        ]
      }
    }),
    aiPersonaOverrides: {},
    aiMemories: [
      createDemoMemory({
        id: 'demo-memory-global-style',
        scope: 'global',
        text: 'User prefers concise Chinese replies during focused work.',
        tags: ['preference', 'language'],
        confidence: 0.86,
        importance: 0.72,
        reason: 'Demo durable user preference'
      }),
      createDemoMemory({
        id: 'demo-memory-legacy-relationship',
        scope: 'petPack',
        petPackId: 'legacy-cat',
        text: 'Legacy Cat should greet the user softly before focus sessions.',
        tags: ['relationship', 'focus'],
        confidence: 0.78,
        importance: 0.64,
        reason: 'Demo pet-pack relationship memory'
      }),
      createDemoMemory({
        id: 'demo-memory-citrus-relationship',
        scope: 'petPack',
        petPackId: 'citrus-cat',
        text: 'Citrus likes cheerful check-ins after the user finishes a task.',
        tags: ['relationship', 'celebration'],
        confidence: 0.74,
        importance: 0.58,
        reason: 'Demo pet-pack relationship memory'
      })
    ],
    aiMemoryJobs: [],
    petChatConversations: {
      [activeConversationId]: []
    },
    petChatConversationBubbles: {
      [activeConversationId]: defaultPetChatState.bubble
    },
    petChatMessages: [],
    petChatBubble: defaultPetChatState.bubble,
    petChatWindowState: {
      visible: false,
      hasWindow: false,
      alwaysOnTop: true,
      hasUserBounds: false,
      bounds: null
    },
    petBubbleChatState: {
      visible: false,
      hasWindow: false,
      pinned: false,
      placement: ''
    },
    imageGenerationConfig: cloneImageGenerationConfig(defaultImageGenerationConfig),
    petPacks,
    serviceStatus: createDemoServiceStatus(),
    catalog: createDemoCatalog(),
    plugins: [],
    pluginLogs: []
  }
}

const readDemoState = (): DemoState => {
  if (typeof window === 'undefined') return createDefaultDemoState()
  try {
    const rawState = window.sessionStorage.getItem(demoStorageKey)
    if (!rawState) return createDefaultDemoState()
    const state = JSON.parse(rawState)
    const petPacks = normalizeDemoPetPacks(state.petPacks)
    const activeConversationId = getDemoMainConversationId(petPacks.activePackId)
    const petChatConversations = cloneDemoConversationMap(state.petChatConversations)
    if (!petChatConversations[activeConversationId] && Array.isArray(state.petChatMessages) && state.petChatMessages.length > 0) {
      petChatConversations[activeConversationId] = cloneChatMessages(state.petChatMessages)
    }
    const petChatConversationBubbles = cloneDemoConversationBubbleMap(state.petChatConversationBubbles)
    const fallbackBubble = clonePetChatState({ bubble: state.petChatBubble }).bubble
    if (!petChatConversationBubbles[activeConversationId] && fallbackBubble.text) {
      petChatConversationBubbles[activeConversationId] = fallbackBubble
    }
    return {
      settings: cloneSettings(state.settings),
      actionsConfig: cloneActionsConfig(
        Array.isArray(state.actionsConfig?.actions) && state.actionsConfig.actions.length > 0
          ? state.actionsConfig
          : createDemoActionsConfig()
      ),
      aiConfig: cloneDemoAiConfig(state.aiConfig),
      aiPersonaOverrides: cloneDemoPersonaOverrides(state.aiPersonaOverrides),
      aiMemories: Array.isArray(state.aiMemories) ? state.aiMemories.map(createDemoMemory) : createDefaultDemoState().aiMemories,
      aiMemoryJobs: Array.isArray(state.aiMemoryJobs) ? state.aiMemoryJobs : [],
      petChatConversations,
      petChatConversationBubbles,
      petChatMessages: cloneChatMessages(petChatConversations[activeConversationId] || state.petChatMessages),
      petChatBubble: clonePetChatState({
        bubble: petChatConversationBubbles[activeConversationId] || state.petChatBubble
      }).bubble,
      petChatWindowState: {
        visible: Boolean(state.petChatWindowState?.visible),
        hasWindow: Boolean(state.petChatWindowState?.hasWindow),
        alwaysOnTop: state.petChatWindowState?.alwaysOnTop ?? true,
        hasUserBounds: Boolean(state.petChatWindowState?.hasUserBounds),
        bounds: state.petChatWindowState?.bounds || null
      },
      petBubbleChatState: {
        visible: Boolean(state.petBubbleChatState?.visible),
        hasWindow: Boolean(state.petBubbleChatState?.hasWindow),
        pinned: Boolean(state.petBubbleChatState?.pinned),
        placement: typeof state.petBubbleChatState?.placement === 'string' ? state.petBubbleChatState.placement : ''
      },
      imageGenerationConfig: cloneImageGenerationConfig(state.imageGenerationConfig),
      petPacks,
      serviceStatus: cloneServiceStatus(state.serviceStatus),
      catalog: cloneCatalog(state.catalog || createDemoCatalog()),
      plugins: Array.isArray(state.plugins)
        ? state.plugins.map((plugin: Partial<PluginViewState>) => normalizeDemoPluginViewState(plugin))
        : [],
      pluginLogs: Array.isArray(state.pluginLogs) ? state.pluginLogs : []
    }
  } catch {
    return createDefaultDemoState()
  }
}

const writeDemoState = () => {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(demoStorageKey, JSON.stringify(demoState))
}

const persistDemoAiModelCatalog = (models: string[]) => {
  demoState.aiConfig = cloneDemoAiConfig({
    ...demoState.aiConfig,
    modelCatalog: {
      cacheKey: buildDemoProviderCacheKey('chat', demoState.aiConfig.provider, demoState.aiConfig.baseUrl),
      models,
      fetchedAt: new Date().toISOString(),
      source: 'saved'
    }
  })
  writeDemoState()
}

const persistDemoVisionModelCatalog = (models: string[]) => {
  demoState.aiConfig = cloneDemoAiConfig({
    ...demoState.aiConfig,
    vision: {
      ...demoState.aiConfig.vision,
      modelCatalog: {
        cacheKey: buildDemoProviderCacheKey('vision', demoState.aiConfig.vision.provider, demoState.aiConfig.vision.baseUrl),
        models,
        fetchedAt: new Date().toISOString(),
        source: 'saved'
      }
    }
  })
  writeDemoState()
}

const persistDemoImageModelCatalog = (models: string[]) => {
  demoState.imageGenerationConfig = cloneImageGenerationConfig({
    ...demoState.imageGenerationConfig,
    modelCatalog: {
      cacheKey: buildDemoProviderCacheKey('image', demoState.imageGenerationConfig.provider, demoState.imageGenerationConfig.baseUrl),
      models,
      fetchedAt: new Date().toISOString(),
      source: 'saved'
    }
  })
  writeDemoState()
}

const cloneDemoAiConfig = (config: Partial<AiConfigViewState> | AiConfigSaveRequest | null | undefined) => {
  const nextConfig = cloneAiConfig(config as Partial<AiConfigViewState> | null | undefined)
  const effectiveProvider = nextConfig.vision.mode === 'override' ? nextConfig.vision.provider : nextConfig.provider
  const effectiveBaseUrl = nextConfig.vision.mode === 'override' ? nextConfig.vision.baseUrl : nextConfig.baseUrl
  const effectiveModel = nextConfig.vision.mode === 'override' ? nextConfig.vision.model : nextConfig.model
  const effectiveHasApiKey = nextConfig.vision.mode === 'override' ? nextConfig.vision.hasApiKey : nextConfig.hasApiKey
  return cloneAiConfig({
    ...nextConfig,
    vision: {
      ...nextConfig.vision,
      effectiveProvider,
      effectiveBaseUrl,
      effectiveModel,
      effectiveHasApiKey
    }
  })
}

const emitDemoActivePetPackChanged = (payload: ActivePetPackChangedEvent) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(demoActivePetPackChangedEvent, { detail: payload }))
}

const createDemoActivePetPackChangedEvent = (
  partial: Partial<ActivePetPackChangedEvent> = {}
): ActivePetPackChangedEvent => ({
  activePackId: partial.activePackId || demoState.petPacks.activePackId,
  ...(partial.pack !== undefined ? { pack: partial.pack } : {}),
  petChatState: createDemoPetChatState()
})

const demoState = readDemoState()
const demoCreatorReferences = new Map<string, CreatorReferenceViewState>()
const demoCreatorReferenceSelections = new Map<string, string>()
let demoCreatorLastRun: CreatorLastRunViewState | null = null
let demoCreatorReferenceTokenSeq = 0

const getDemoCreatorReferenceKey = (targetType: CreatorReferenceTargetType, targetId: string) => `${targetType}:${targetId}`
const createDemoCreatorReferenceToken = () => `demo-reference-token-${Date.now()}-${++demoCreatorReferenceTokenSeq}`

const getDemoEditableCreatorTarget = () => {
  const activePack = demoState.petPacks.packs.find((pack) => pack.id === demoState.petPacks.activePackId) || demoState.petPacks.packs[0]
  return {
    ...defaultCreatorState.editableTarget,
    displayName: activePack?.displayName || defaultCreatorState.editableTarget.displayName,
    defaultAction: activePack?.defaultAction || '',
    clickAction: activePack?.clickAction || '',
    actionCount: Number(activePack?.actionCount || 0)
  }
}

const createDemoCreatorState = (): CreatorStateViewState => {
  const editableTarget = getDemoEditableCreatorTarget()
  const editableReference = demoCreatorReferences.get(getDemoCreatorReferenceKey(editableTarget.targetType, editableTarget.targetId)) || null
  return cloneCreatorState({
    provider: {
      ready: true,
      code: 'provider_ready',
      message: 'Demo image provider is ready',
      provider: demoState.imageGenerationConfig.provider,
      model: demoState.imageGenerationConfig.model
    },
    editableTarget,
    editableReference,
    lastRun: demoCreatorLastRun,
    dashboard: {
      available: true,
      pluginId: 'openpet.creator-studio',
      dashboardId: 'main',
      serviceStatus: 'running',
      reason: ''
    }
  })
}

const approveDemoCreatorReference = (sourcePath: string): CreatorReferencePickerResult => {
  const referenceToken = createDemoCreatorReferenceToken()
  demoCreatorReferenceSelections.set(referenceToken, sourcePath)
  return {
    ok: true,
    canceled: false,
    referenceToken,
    fileName: sourcePath.split('/').pop() || 'reference.png'
  }
}

const consumeDemoCreatorReferenceSourcePath = (referenceToken: string): string => {
  const normalizedReferenceToken = String(referenceToken || '').trim()
  if (!normalizedReferenceToken) {
    throw new Error('Demo creator reference token is required')
  }
  const sourcePath = demoCreatorReferenceSelections.get(normalizedReferenceToken) || ''
  demoCreatorReferenceSelections.delete(normalizedReferenceToken)
  if (!sourcePath) {
    throw new Error('Demo creator reference token is invalid or already used')
  }
  return sourcePath
}

const bindDemoCreatorReference = ({
  targetType,
  targetId,
  referenceToken
}: CreatorBindReferenceRequest): CreatorBindReferenceResult => {
  const sourcePath = consumeDemoCreatorReferenceSourcePath(referenceToken)
  const key = getDemoCreatorReferenceKey(targetType, targetId)
  const previous = demoCreatorReferences.get(key) || null
  const now = new Date().toISOString()
  const reference = cloneCreatorReference({
    targetType,
    targetId,
    assetPath: sourcePath,
    assetUrl: sourcePath,
    fileName: sourcePath.split('/').pop() || 'reference.png',
    width: 1024,
    height: 1024,
    contentHash: `demo-${targetType}-${targetId}`,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  })
  demoCreatorReferences.set(key, reference)
  return {
    ok: true,
    replaced: Boolean(previous),
    reference
  }
}

const getDemoActivePetSummary = () => {
  const activePack = demoState.petPacks.packs.find((pack) => pack.id === demoState.petPacks.activePackId) || null
  return activePack
    ? {
        id: activePack.id,
        displayName: activePack.displayName,
        version: activePack.version,
        source: activePack.source,
        active: activePack.active,
        rootPath: activePack.rootPath
      }
    : null
}

const completeDemoCreatorRun = (run: Partial<CreatorLastRunViewState>) => {
  demoCreatorLastRun = cloneCreatorLastRun(run)
  return demoCreatorLastRun
}

const syncDemoStateFromStorage = () => {
  const nextState = readDemoState()
  demoState.settings = nextState.settings
  demoState.actionsConfig = nextState.actionsConfig
  demoState.aiConfig = nextState.aiConfig
  demoState.aiPersonaOverrides = nextState.aiPersonaOverrides
  demoState.aiMemories = nextState.aiMemories
  demoState.aiMemoryJobs = nextState.aiMemoryJobs
  demoState.petChatConversations = nextState.petChatConversations
  demoState.petChatConversationBubbles = nextState.petChatConversationBubbles
  demoState.petChatMessages = nextState.petChatMessages
  demoState.petChatBubble = nextState.petChatBubble
  demoState.petChatWindowState = nextState.petChatWindowState
  demoState.petBubbleChatState = nextState.petBubbleChatState
  demoState.imageGenerationConfig = nextState.imageGenerationConfig
  demoState.petPacks = nextState.petPacks
  demoState.serviceStatus = nextState.serviceStatus
  demoState.catalog = nextState.catalog
  demoState.plugins = nextState.plugins
  demoState.pluginLogs = nextState.pluginLogs
}
const demoCatalogSelections = new Map<string, CatalogInstallSelection>()
let demoManualPluginSelection: string | null = null
let demoPendingActionFrameSelection: CompletedActionFrameInspectionResult | null = null
let demoPendingPetPackSelection: PetPackInspectionResult | null = null
const demoCursorAssetUrl = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M9 5l23 21h-11l8 17-6 3-8-17-8 8z" fill="#111827"/>
  <path d="M9 5l23 21h-11l8 17-6 3-8-17-8 8z" fill="none" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
</svg>
`)}`.trim()

const normalizeDemoSettings = (settings: Partial<ControlCenterSettings> | ControlCenterSettings): ControlCenterSettings => {
  const nextSettings = cloneSettings(settings)
  if (!nextSettings.grounded) {
    nextSettings.home = {
      ...nextSettings.home,
      enabled: false
    }
  }
  if (nextSettings.home.enabled) {
    nextSettings.home = {
      ...nextSettings.home,
      hasAnchor: true
    }
  }
  return nextSettings
}

const clonePluginEntries = (entries: PluginViewState['entries']): PluginViewState['entries'] => ({
  setup: Array.isArray(entries?.setup)
    ? entries.setup.map((setup) => ({
        ...setup,
        runtime: setup.runtime ? { ...setup.runtime } : setup.runtime
      }))
    : [],
  commands: Array.isArray(entries?.commands) ? entries.commands.map((command) => ({ ...command })) : [],
  services: Array.isArray(entries?.services)
    ? entries.services.map((service) => ({
        ...service,
        healthPolicy: service.healthPolicy ? { ...service.healthPolicy } : service.healthPolicy,
        platforms: service.platforms
          ? Object.fromEntries(Object.entries(service.platforms).map(([platform, override]) => [platform, { ...override }]))
          : undefined,
        health: service.health ? { ...service.health } : service.health,
        runtime: service.runtime
          ? {
              ...service.runtime,
              health: service.runtime.health ? { ...service.runtime.health } : service.runtime.health
            }
          : service.runtime
      }))
    : [],
  dashboards: Array.isArray(entries?.dashboards) ? entries.dashboards.map((dashboard) => ({ ...dashboard })) : []
})

const cleanupDemoPluginRuntimeEntries = (entries: PluginViewState['entries']): PluginViewState['entries'] => ({
  ...entries,
  setup: Array.isArray(entries?.setup)
    ? entries.setup.map((setup) => ({
        ...setup,
        runtime: setup.runtime?.status === 'running'
          ? {
              ...setup.runtime,
              status: 'failed',
              lastRunAt: new Date().toISOString(),
              error: 'Setup stopped'
            }
          : setup.runtime
      }))
    : [],
  services: Array.isArray(entries?.services)
    ? entries.services.map((service) => ({
        ...service,
        runtime: service.runtime?.status === 'running'
          ? { ...service.runtime, status: 'stopped', stoppedAt: new Date().toISOString() }
          : service.runtime
      }))
    : []
})

const normalizeDemoPluginViewState = (plugin: Partial<PluginViewState>): PluginViewState => {
  const entries = clonePluginEntries(plugin.entries || { setup: [], commands: [], services: [], dashboards: [] })
  const requiresNativeExecution = Boolean(entries.setup.length || entries.commands.length || entries.services.length)
  const storage: PluginStorageViewState = {
    keyCount: Number.isFinite(Number(plugin.storage?.keyCount)) ? Number(plugin.storage?.keyCount) : 0,
    byteSize: Number.isFinite(Number(plugin.storage?.byteSize)) ? Number(plugin.storage?.byteSize) : 0,
    ...(plugin.storage?.valid != null ? { valid: Boolean(plugin.storage.valid) } : { valid: true })
  }
  const signatureStatus: PluginSignatureStatusViewState = {
    status: String(plugin.signatureStatus?.status || ''),
    label: String(plugin.signatureStatus?.label || ''),
    signer: String(plugin.signatureStatus?.signer || ''),
    algorithm: String(plugin.signatureStatus?.algorithm || ''),
    verified: Boolean(plugin.signatureStatus?.verified),
    errors: Array.isArray(plugin.signatureStatus?.errors) ? plugin.signatureStatus.errors.map((error) => String(error || '')) : []
  }
  return {
    id: String(plugin.id || ''),
    name: String(plugin.name || ''),
    version: String(plugin.version || ''),
    source: String(plugin.source || ''),
    profile: plugin.profile,
    enabled: Boolean(plugin.enabled),
    runnable: Boolean(plugin.runnable),
    permissions: Array.isArray(plugin.permissions) ? [...plugin.permissions] : [],
    commands: Array.isArray(plugin.commands) ? plugin.commands.map((command) => ({ ...command })) : [],
    entries,
    configSchema: {
      ...(plugin.configSchema || {}),
      properties: Array.isArray(plugin.configSchema?.properties) ? plugin.configSchema.properties.map((field) => ({ ...field })) : []
    },
    config: { ...(plugin.config || {}) },
    storage,
    signatureStatus,
    requiresNativeExecution,
    nativeExecutionApproved: requiresNativeExecution ? Boolean(plugin.nativeExecutionApproved) : false,
    ...(plugin.blockStatus ? { blockStatus: { ...plugin.blockStatus } } : {})
  }
}

const updateDemoPluginServiceRuntime = (pluginId: string, serviceId: string, runtime: PluginServiceRuntimeViewState) => {
  let found = false
  demoState.plugins = demoState.plugins.map((plugin) => {
    if (plugin.id !== pluginId) return plugin
    return {
      ...plugin,
      entries: {
        ...plugin.entries,
        services: (plugin.entries?.services || []).map((service) => (
          service.id === serviceId
            ? (found = true, {
                ...service,
                runtime: {
                  ...service.runtime,
                  ...runtime,
                  health: runtime.health
                    ? { ...runtime.health }
                    : service.runtime?.health
                      ? { ...service.runtime.health }
                      : service.health?.url
                        ? { status: 'unknown', url: service.health.url }
                        : { status: 'not-configured' }
                }
              })
            : service
        ))
      }
    }
  })
  if (!found) throw new Error(`Plugin service not found: ${serviceId}`)
  return { ...runtime }
}

const findDemoPluginServiceRuntimeStatus = (pluginId: string, serviceId: string): PluginServiceRuntimeViewState['status'] => {
  const plugin = demoState.plugins.find((candidate) => candidate.id === pluginId)
  const service = plugin?.entries?.services?.find((candidate) => candidate.id === serviceId)
  return service?.runtime?.status || 'stopped'
}

const updateDemoPluginServiceHealth = (pluginId: string, serviceId: string, health: PluginServiceHealthViewState) => {
  const runtime = updateDemoPluginServiceRuntime(pluginId, serviceId, {
    status: findDemoPluginServiceRuntimeStatus(pluginId, serviceId),
    health
  })
  return { health: runtime.health || health, runtime }
}

const updateDemoPluginServiceHealthPolicy = (pluginId: string, serviceId: string, policy: PluginServiceHealthPolicyViewState) => {
  let found = false
  const nextPolicy = {
    enabled: Boolean(policy.enabled),
    intervalMs: Number.isFinite(Number(policy.intervalMs))
      ? Math.min(300000, Math.max(15000, Number(policy.intervalMs)))
      : 30000
  }
  demoState.plugins = demoState.plugins.map((plugin) => {
    if (plugin.id !== pluginId) return plugin
    return {
      ...plugin,
      entries: {
        ...plugin.entries,
        services: (plugin.entries?.services || []).map((service) => (
          service.id === serviceId
            ? (found = true, { ...service, healthPolicy: nextPolicy })
            : service
        ))
      }
    }
  })
  if (!found) throw new Error(`Plugin service not found: ${serviceId}`)
  return nextPolicy
}

const updateDemoPluginSetupRuntime = (pluginId: string, setupId: string, runtime: PluginSetupRuntimeViewState) => {
  let found = false
  demoState.plugins = demoState.plugins.map((plugin) => {
    if (plugin.id !== pluginId) return plugin
    return {
      ...plugin,
      entries: {
        ...plugin.entries,
        setup: (plugin.entries?.setup || []).map((setup) => (
          setup.id === setupId
            ? (found = true, {
                ...setup,
                runtime: {
                  ...setup.runtime,
                  ...runtime
                }
              })
            : setup
        ))
      }
    }
  })
  if (!found) throw new Error(`Plugin setup entry not found: ${setupId}`)
  return { ...runtime }
}

const cloneDemoPlugins = (): PluginViewState[] => demoState.plugins.map((plugin) => normalizeDemoPluginViewState(plugin))

const getDemoPluginById = (pluginId: string): PluginViewState | null => (
  cloneDemoPlugins().find((plugin) => plugin.id === pluginId) || null
)

const requireDemoPlugin = (pluginId: string): PluginViewState => {
  const plugin = getDemoPluginById(pluginId)
  if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
  return plugin
}

const assertDemoPluginAllowed = (pluginId: string) => {
  const plugin = requireDemoPlugin(pluginId)
  if (plugin.blockStatus?.blocked) {
    throw new Error(`Plugin is blocked: ${(plugin.blockStatus.reasons || []).join(', ')}`)
  }
  return plugin
}

const requireDemoPluginService = (
  pluginId: string,
  serviceId: string,
  { requireEnabled = false }: { requireEnabled?: boolean } = {}
) => {
  const plugin = requireEnabled ? assertDemoPluginEnabled(pluginId) : requireDemoPlugin(pluginId)
  const service = plugin.entries?.services?.find((candidate) => candidate.id === serviceId)
  if (!service) throw new Error(`Plugin service not found: ${serviceId}`)
  return { plugin, service }
}

const assertDemoPluginEnabled = (pluginId: string) => {
  const plugin = assertDemoPluginAllowed(pluginId)
  if (!plugin.enabled) throw new Error('Plugin is disabled')
  return plugin
}

const assertDemoPluginNativeExecutionAllowed = (pluginId: string) => {
  const plugin = assertDemoPluginEnabled(pluginId)
  if (!plugin.nativeExecutionApproved) {
    throw new Error('Plugin native execution is not approved. Enable native process execution for this plugin in the Control Center before running its commands, services, or setup.')
  }
  return plugin
}

const requireDemoPluginNativeExecutionIfNeeded = (pluginId: string) => {
  const plugin = assertDemoPluginEnabled(pluginId)
  if (plugin.requiresNativeExecution) return assertDemoPluginNativeExecutionAllowed(pluginId)
  return plugin
}

const getDemoBehaviorActionMap = () => new Map(
  demoState.actionsConfig.actions
    .filter((action) => action.id)
    .map((action) => [action.id || '', action])
)

const dryRunDemoBehavior = (
  payload: Partial<AiBehaviorDryRunRequest> & {
    behaviorIntent?: { actionId?: string, intent?: string, displayMode?: string, reason?: string } | null
  } = {}
) => {
  const reply = String(payload.reply || '').trim()
  const behaviorConfig = cloneAiConfig({ behavior: payload.behavior || demoState.aiConfig.behavior }).behavior
  const actionMap = getDemoBehaviorActionMap()
  const enabledRules = (behaviorConfig.rules || []).filter((rule) => rule.enabled !== false)
  const firstPlayableRule = enabledRules.find((rule) => rule.then?.type === 'playAction' && actionMap.has(rule.then?.actionId || ''))
  const behaviorIntent = payload.behaviorIntent || null

  if (firstPlayableRule) {
    const actionId = firstPlayableRule.then?.actionId || ''
    const action = actionMap.get(actionId)
    return {
      matched: true,
      type: 'playAction',
      ruleId: firstPlayableRule.id,
      reason: `matched rule ${firstPlayableRule.id || 'demo-rule'}`,
      actionId,
      label: action?.label,
      kind: action?.kind,
      intent: behaviorIntent?.intent || ''
    }
  }

  if (behaviorIntent?.actionId) {
    const action = actionMap.get(behaviorIntent.actionId)
    if (action) {
      return {
        matched: true,
        type: 'playAction',
        reason: 'matched provider actionId',
        actionId: action.id,
        label: action.label,
        kind: action.kind,
        intent: behaviorIntent.intent || '',
        providerReason: behaviorIntent.reason || ''
      }
    }
    return {
      matched: false,
      reason: 'provider actionId is not available',
      actionId: behaviorIntent.actionId,
      intent: behaviorIntent.intent || '',
      providerReason: behaviorIntent.reason || ''
    }
  }

  if (reply && /\b(hello|hi|hey|greet|chat)\b/i.test(reply) && actionMap.has('wave')) {
    const action = actionMap.get('wave')
    return {
      matched: true,
      type: 'playAction',
      reason: 'fallback matched greeting',
      actionId: 'wave',
      label: action?.label,
      kind: action?.kind,
      fallback: true
    }
  }

  return {
    matched: false,
    reason: 'no behavior rule matched'
  }
}

const sendDemoPetChatMessage = async ({ message, conversationId }: AiChatRequest = { message: '' }) => {
  const normalizedMessage = String(message || '').trim()
  const resolvedConversation = resolveDemoConversationContext({ conversationId })
  const { conversationId: resolvedConversationId, petPackId, pack: activePack } = resolvedConversation
  const personaProfile = createDemoPersonaProfile(
    clonePetPacks({
      ...demoState.petPacks,
      activePackId: petPackId
    }),
    demoState.aiConfig,
    demoState.aiPersonaOverrides
  )
  const reply = `${personaProfile.effectivePersona.name}: ${normalizedMessage}`
  const decisions = Array.isArray(demoState.aiConfig.behavior?.decisions)
    ? demoState.aiConfig.behavior.decisions
    : []
  const nextId = decisions.reduce((max, decision) => Math.max(max, Number(decision.id) || 0), 0) + 1
  const timestamp = new Date().toISOString()
  demoState.aiConfig = cloneAiConfig({
    ...demoState.aiConfig,
    behavior: {
      ...demoState.aiConfig.behavior,
      decisions: [
        {
          id: nextId,
          timestamp,
          matched: true,
          type: 'playAction',
          ruleId: 'demo-chat',
          reason: `matched rule demo-chat for ${activePack?.id || 'legacy-cat'}`,
          actionId: 'wave',
          intent: 'greeting',
          inputSummary: `reply:${normalizedMessage.length} chars · intent:greeting`,
          replay: { reply, behaviorIntent: { intent: 'greeting', actionId: 'wave', confidence: 0.8 } }
        },
        ...decisions
      ].slice(0, 50)
    }
  })
  const nextMessages = cloneChatMessages([
    ...getDemoConversationMessages(resolvedConversationId),
    { role: 'user', content: normalizedMessage },
    { role: 'assistant', content: reply }
  ])
  const nextBubble = {
    text: reply.slice(0, 80),
    source: 'ai',
    ttlMs: 6000,
    updatedAt: timestamp
  }
  demoState.petChatConversations = {
    ...demoState.petChatConversations,
    [resolvedConversationId]: nextMessages
  }
  demoState.petChatConversationBubbles = {
    ...demoState.petChatConversationBubbles,
    [resolvedConversationId]: nextBubble
  }
  syncActiveDemoConversationState()
  if (demoState.aiConfig.memory.enabled) {
    demoState.aiMemories = [
      createDemoMemory({
        id: `demo-memory-chat-${Date.now()}`,
        scope: 'petPack',
        petPackId,
        text: `${personaProfile.effectivePersona.name} recently discussed: ${normalizedMessage.slice(0, 120)}`,
        tags: ['demo-chat'],
        confidence: 0.62,
        importance: 0.42,
        sourceConversationId: resolvedConversationId,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastEvidenceAt: timestamp,
        reason: 'Demo chat memory extraction'
      }),
      ...demoState.aiMemories
    ]
    demoState.aiMemoryJobs = [
      {
        id: `demo-memory-job-${Date.now()}`,
        petPackId,
        conversationId: resolvedConversationId,
        status: 'completed',
        createdAt: timestamp,
        updatedAt: timestamp,
        errorCode: '',
        appliedCount: 1,
        filteredCount: 0
      },
      ...demoState.aiMemoryJobs
    ].slice(0, 20)
  }
  writeDemoState()
  return {
    conversationId: resolvedConversationId,
    reply,
    messages: nextMessages,
    bubble: nextBubble,
    state: createDemoPetChatState(),
    behavior: { matched: true, type: 'playAction', actionId: 'wave' },
    action: { actionId: 'wave', label: 'Wave' }
  }
}

const paginateEntries = <T,>(entries: T[], request: { page?: number, pageSize?: number } = {}) => {
  const pageSize = Number.isInteger(Number(request.pageSize)) && Number(request.pageSize) > 0
    ? Math.min(Number(request.pageSize), 200)
    : 50
  const page = Number.isInteger(Number(request.page)) && Number(request.page) > 0
    ? Number(request.page)
    : 1
  const total = entries.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  return {
    entries: entries.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages
  }
}

const cloneDemoPluginLogs = (filters: PluginLogFilters = {}) => demoState.pluginLogs.filter((log) => {
  if (filters.pluginId && log.pluginId !== filters.pluginId) return false
  if (filters.level && log.level !== filters.level) return false
  if (filters.query && !`${log.pluginId} ${log.commandId} ${log.message}`.toLowerCase().includes(String(filters.query).toLowerCase())) return false
  return true
}).map((log) => ({ ...log }))

const findDemoCatalogItem = (kind: CatalogInstallRequest['kind'], itemId: string) => {
  const collection = kind === 'plugin' ? demoState.catalog.plugins : demoState.catalog.petPacks
  return collection.find((item) => item.id === itemId)
}

const getActiveDemoPetPack = (): PetPackSummary | undefined => (
  demoState.petPacks.packs.find((pack) => pack.id === demoState.petPacks.activePackId)
)

const createDemoTriggerPreviewText = (type = '', actionId = '') => {
  if (type === 'random') return `Random trigger rule can play ${actionId} from the host scheduler.`
  if (type === 'state') return `State trigger rule can play ${actionId} when a host state condition matches.`
  if (type === 'event') return `Event trigger rule can play ${actionId} when a host-owned event is received.`
  if (type === 'click') return `Click trigger will set clickAction to ${actionId}.`
  if (type === 'manual') return `Manual trigger keeps ${actionId} available from host UI without automatic scheduling.`
  return `Unbound trigger keeps ${actionId} imported without automatic scheduling.`
}

const createDemoTriggerRuleSpec = (type: 'random' | 'state' | 'event', actionId: string, proposal: {
  binding?: string
  message?: string
  ruleSpec?: ActionTriggerRuleSpecInput
} = {}): ActionTriggerRuleSpec => {
  const ruleSpec = proposal.ruleSpec || {}
  const summary = typeof ruleSpec.summary === 'string' && ruleSpec.summary
    ? ruleSpec.summary
    : (proposal.message || createDemoTriggerPreviewText(type, actionId))
  if (type === 'random') {
    const schedule = ruleSpec.schedule || {}
    const mode = schedule.mode === 'interval' ? 'interval' : 'opportunistic'
    const intervalMs = Number(schedule.intervalMs)
    return {
      schemaVersion: 1,
      type,
      summary,
      schedule: {
        mode,
        ...(mode === 'interval' && Number.isFinite(intervalMs) && intervalMs > 0 ? { intervalMs } : {})
      }
    }
  }
  if (type === 'state') {
    const state = ruleSpec.state || {}
    return {
      schemaVersion: 1,
      type,
      summary,
      state: {
        predicate: typeof state.predicate === 'string' && state.predicate ? state.predicate : (proposal.binding || 'host.state.available'),
        source: typeof state.source === 'string' && state.source ? state.source : 'host'
      }
    }
  }
  const event = ruleSpec.event || {}
  return {
    schemaVersion: 1,
    type,
    summary,
    event: {
      name: typeof event.name === 'string' && event.name ? event.name : (proposal.binding || 'openpet.event'),
      source: typeof event.source === 'string' && event.source ? event.source : 'host'
    }
  }
}

const createDemoTriggerProposalPreview = (proposal: {
  id?: string
  actionId?: string
  type?: ActionTriggerProposalType
  binding?: string
  sourcePluginId?: string
  sourceRunId?: string
  sourceCommandId?: string
  message?: string
  ruleSpec?: ActionTriggerRuleSpecInput
}) => {
  const actionId = proposal.actionId || ''
  const type = proposal.type || 'unbound'
  const isRule = ['random', 'state', 'event'].includes(type)
  const triggerRuleId = isRule ? `preview:${type}:${actionId}` : undefined
  const triggerRule = isRule
    ? {
        id: triggerRuleId || '',
        actionId,
        type: type as 'random' | 'state' | 'event',
        status: 'active' as const,
        sourceProposalId: proposal.id || '',
        sourcePluginId: proposal.sourcePluginId || '',
        sourceRunId: proposal.sourceRunId || '',
        sourceCommandId: proposal.sourceCommandId || '',
        message: '',
        preview: createDemoTriggerPreviewText(type, actionId),
        ruleSpec: createDemoTriggerRuleSpec(type as 'random' | 'state' | 'event', actionId, {
          binding: proposal.binding,
          message: proposal.message,
          ruleSpec: proposal.ruleSpec
        }),
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z'
      }
    : undefined
  return {
    ok: true,
    applied: type === 'click',
    actionId,
    type,
    binding: type === 'click' ? (proposal.binding || 'clickAction') : '',
    code: type === 'click' ? 'will_apply' as const : (isRule ? 'will_create_rule' as const : 'no_binding_required' as const),
    message: isRule
      ? `Preview: a host trigger rule would be created for action: ${actionId}`
      : (type === 'click'
          ? `Preview: clickAction would use action: ${actionId}`
          : `Preview: action trigger proposal does not require an automatic binding: ${actionId}`),
    ...(triggerRule ? { triggerRule, triggerRuleId } : {}),
    preview: createDemoTriggerPreviewText(type, actionId),
    sourcePluginId: proposal.sourcePluginId,
    sourceRunId: proposal.sourceRunId,
    sourceCommandId: proposal.sourceCommandId
  }
}

const markDemoCatalogItemInstalled = (selection: CatalogInstallSelection): CatalogState => {
  const collectionKey = selection.kind === 'plugin' ? 'plugins' : 'petPacks'
  demoState.catalog = cloneCatalog({
    ...demoState.catalog,
    [collectionKey]: demoState.catalog[collectionKey].map((item) => (
      item.id === selection.itemId
        ? { ...item, installed: true, installedVersion: item.version, updateAvailable: false }
        : item
    ))
  })
  writeDemoState()
  return cloneCatalog(demoState.catalog)
}

const createDemoInstalledCatalogPlugin = (
  item: CatalogPluginEntry,
  existingPlugin: PluginViewState | null = null
): PluginViewState => {
  const review = createDemoPluginReview(item)
  return {
    id: review.plugin.id,
    name: review.plugin.name,
    version: review.plugin.version,
    source: 'catalog',
    enabled: false,
    runnable: true,
    requiresNativeExecution: Boolean(
      review.plugin.entries?.setup?.length ||
      review.plugin.entries?.commands?.length ||
      review.plugin.entries?.services?.length
    ),
    nativeExecutionApproved: Boolean(existingPlugin?.nativeExecutionApproved),
    permissions: [...review.plugin.permissions],
    commands: review.plugin.commands.map((command) => ({ ...command })),
    entries: {
      ...review.plugin.entries,
      setup: review.plugin.entries.setup.map((setup) => ({
        ...setup,
        runtime: { status: 'not-run' }
      }))
    },
    configSchema: { properties: [] },
    config: { ...(existingPlugin?.config || {}) },
    storage: existingPlugin
      ? { ...(existingPlugin.storage || {}) }
      : { keyCount: 0, byteSize: 0, valid: true },
    signatureStatus: {
      status: review.signature.status || '',
      label: review.signature.label,
      signer: review.signature.signer || '',
      algorithm: review.signature.algorithm || '',
      verified: Boolean(review.signature.verified),
      errors: review.signature.errors || []
    },
    blockStatus: item.blockStatus ? { ...item.blockStatus } : undefined
  }
}

const installDemoCatalogPlugin = (selection: CatalogPluginInstallSelection): PluginViewState[] => {
  const item = findDemoCatalogItem('plugin', selection.itemId) as CatalogPluginEntry | null
  if (!item) throw new Error('Catalog item not found')
  const existingPlugin = getDemoPluginById(item.id)
  const nextPlugin = createDemoInstalledCatalogPlugin(item, existingPlugin)
  demoState.plugins = [
    nextPlugin,
    ...demoState.plugins.filter((plugin) => plugin.id !== nextPlugin.id)
  ]
  demoState.pluginLogs = [
    createDemoPluginLog(
      nextPlugin.id,
      selection.pluginReview.installMode === 'update' ? 'Plugin updated from catalog' : 'Plugin installed from catalog'
    ),
    ...demoState.pluginLogs
  ]
  writeDemoState()
  return cloneDemoPlugins()
}

const installDemoCatalogPetPack = (selection: CatalogPetPackInstallSelection): PetPacksViewState => {
  const item = findDemoCatalogItem('pet-pack', selection.itemId) as CatalogPetPackEntry | null
  if (!item) throw new Error('Catalog item not found')
  const activePackId = demoState.petPacks.activePackId
  demoState.petPacks = normalizeDemoPetPacks({
    ...demoState.petPacks,
    packs: [
      {
        id: item.id,
        displayName: item.displayName,
        version: item.version,
        source: 'catalog',
        rootPath: `/demo/pet-packs/${item.id}`,
        active: item.id === activePackId,
        actionCount: item.actionCount || 0,
        defaultAction: 'idle',
        clickAction: 'wave'
      },
      ...demoState.petPacks.packs.filter((pack) => pack.id !== item.id)
    ]
  })
  writeDemoState()
  return clonePetPacks(demoState.petPacks)
}

export const demoControlCenterAPI: ControlCenterApi = {
  getSettings: async () => normalizeDemoSettings(demoState.settings),
  saveSettings: async (settings) => {
    demoState.settings = normalizeDemoSettings(settings)
    writeDemoState()
    return normalizeDemoSettings(demoState.settings)
  },
  previewScale: () => {},
  importCursor: async () => {
    const cursor: CustomCursorRecord = {
      id: 'demo-cursor',
      type: 'custom',
      source: 'uploaded',
      name: stripFileExtension('demo-cursor.png'),
      assetPath: '/demo/cursors/demo-cursor.png',
      assetUrl: demoCursorAssetUrl,
      fileName: 'demo-cursor.png',
      width: 32,
      height: 32,
      byteSize: 2048,
      hotspotX: 0,
      hotspotY: 0,
      createdAt: '2026-06-19T10:00:00.000Z'
    }
    demoState.settings = normalizeDemoSettings({
      ...demoState.settings,
      selectedCursorId: cursor.id,
      hiddenCursorIds: demoState.settings.hiddenCursorIds || [],
      customCursors: [
        ...demoState.settings.customCursors.filter((item) => item.id !== cursor.id),
        cursor
      ]
    })
    writeDemoState()
    return {
      canceled: false,
      cursor
    }
  },
  getActions: async () => cloneActionsConfig(demoState.actionsConfig),
  inspectActionFrames: async ({ actionId } = {}) => {
    demoPendingActionFrameSelection = createDemoInspection(actionId)
    return {
      ...demoPendingActionFrameSelection,
      inspection: {
        ...demoPendingActionFrameSelection.inspection,
        frames: demoPendingActionFrameSelection.inspection.frames.map((frame) => ({ ...frame })),
        skippedFiles: [...demoPendingActionFrameSelection.inspection.skippedFiles],
        errors: [...demoPendingActionFrameSelection.inspection.errors],
        warnings: [...demoPendingActionFrameSelection.inspection.warnings]
      }
    }
  },
  reinspectActionFrames: async ({ selectionId, actionId } = {}) => {
    if (!selectionId || demoPendingActionFrameSelection?.selectionId !== selectionId) {
      throw new Error('Selected action frame folder is no longer available')
    }
    demoPendingActionFrameSelection = createDemoInspection(actionId)
    return {
      ...demoPendingActionFrameSelection,
      selectionId,
      inspection: {
        ...demoPendingActionFrameSelection.inspection,
        frames: demoPendingActionFrameSelection.inspection.frames.map((frame) => ({ ...frame })),
        skippedFiles: [...demoPendingActionFrameSelection.inspection.skippedFiles],
        errors: [...demoPendingActionFrameSelection.inspection.errors],
        warnings: [...demoPendingActionFrameSelection.inspection.warnings]
      }
    }
  },
  clearActionFrameSelection: async (payload) => {
    const selectionId = payload?.selectionId
    if (!selectionId || demoPendingActionFrameSelection?.selectionId === selectionId) {
      demoPendingActionFrameSelection = null
    }
    return { ok: true }
  },
  importActionFrames: async ({ selectionId, actionId, label } = {}) => {
    if (!selectionId || demoPendingActionFrameSelection?.selectionId !== selectionId) {
      throw new Error('Selected action frame folder is no longer available')
    }
    const normalizedActionId = String(actionId || '').trim() || 'custom-action'
    const normalizedLabel = String(label || '').trim() || normalizedActionId
    const importedAction = createDemoImportedAction(normalizedActionId, normalizedLabel)
    demoState.actionsConfig = cloneActionsConfig({
      ...demoState.actionsConfig,
      actions: [
        importedAction,
        ...demoState.actionsConfig.actions.filter((action) => action.id !== normalizedActionId)
      ]
    })
    demoPendingActionFrameSelection = null
    writeDemoState()
    return {
      ok: true,
      result: { importedAction: { ...importedAction } },
      animations: cloneActionsConfig(demoState.actionsConfig)
    }
  },
  playPetAction: async (actionId: string): Promise<PetActionPlaybackResult> => ({
    ok: true,
    actionId,
    source: 'demo-control-center'
  }),
  saveActionsConfig: async (config) => {
    const triggerProposal = config?.triggerProposal
    const ruleProposal = triggerProposal && ['random', 'state', 'event'].includes(triggerProposal.type)
      ? triggerProposal
      : null
    const triggerRule = ruleProposal
      ? {
          id: `demo-rule-${ruleProposal.type}-${ruleProposal.actionId}-${Date.now()}`,
          actionId: ruleProposal.actionId,
          type: ruleProposal.type as 'random' | 'state' | 'event',
          status: 'active' as const,
          sourceProposalId: ruleProposal.id || '',
          sourcePluginId: ruleProposal.sourcePluginId || '',
          sourceRunId: ruleProposal.sourceRunId || '',
          sourceCommandId: ruleProposal.sourceCommandId || '',
          message: ruleProposal.message || ruleProposal.notes || '',
          preview: `${ruleProposal.type} rule can play ${ruleProposal.actionId} after host validation.`,
          ruleSpec: createDemoTriggerRuleSpec(ruleProposal.type as 'random' | 'state' | 'event', ruleProposal.actionId, {
            binding: ruleProposal.binding,
            message: ruleProposal.message || ruleProposal.notes || '',
            ruleSpec: ruleProposal.ruleSpec
          }),
          createdAt: '2026-06-22T00:00:00.000Z',
          updatedAt: '2026-06-22T00:00:00.000Z'
        }
      : null
    if (triggerProposal?.type === 'click') {
      demoState.actionsConfig = cloneActionsConfig({
        ...demoState.actionsConfig,
        clickAction: triggerProposal.actionId
      })
    } else if (triggerRule) {
      demoState.actionsConfig = cloneActionsConfig({
        ...demoState.actionsConfig,
        triggerRules: [...(demoState.actionsConfig.triggerRules || []), triggerRule]
      })
    } else if (!triggerProposal) {
      demoState.actionsConfig = cloneActionsConfig({
        ...demoState.actionsConfig,
        ...config
      })
    }
    writeDemoState()
    const triggerCode = triggerProposal?.type === 'click'
      ? 'applied'
      : (triggerRule ? 'rule_created' : 'no_binding_required')
    const triggerMessage = triggerProposal?.type === 'click'
      ? `Click trigger now uses action: ${triggerProposal.actionId}`
      : (triggerRule
          ? `Created host trigger rule ${triggerRule.id} for action: ${triggerProposal?.actionId || ''}`
          : `Action trigger proposal accepted for ${triggerProposal?.actionId || ''}`)
    return {
      animations: cloneActionsConfig(demoState.actionsConfig),
      ...(triggerProposal
        ? {
            triggerProposal: {
              ok: true,
              applied: triggerProposal.type === 'click',
              actionId: triggerProposal.actionId,
              type: triggerProposal.type,
              binding: triggerProposal.type === 'click' ? 'clickAction' : '',
              code: triggerCode,
              message: triggerMessage,
              triggerRule: triggerRule || undefined,
              triggerRuleId: triggerRule?.id || undefined,
              preview: triggerRule?.preview || undefined,
              acceptedAt: '2026-06-22T00:00:00.000Z',
              sourcePluginId: triggerProposal.sourcePluginId,
              sourceRunId: triggerProposal.sourceRunId,
              sourceCommandId: triggerProposal.sourceCommandId
            }
          }
        : {})
    }
  },
  previewActionTriggerProposal: async (proposal) => createDemoTriggerProposalPreview(proposal),
  submitActionTriggerProposal: async (proposal) => {
    const preview = createDemoTriggerProposalPreview(proposal)
    const id = proposal.id || `demo-proposal-${Date.now()}`
    const item = {
      id,
      actionId: proposal.actionId,
      type: proposal.type,
      binding: proposal.type === 'click' ? (proposal.binding || 'clickAction') : '',
      sourcePluginId: proposal.sourcePluginId || '',
      sourceRunId: proposal.sourceRunId || '',
      sourceCommandId: proposal.sourceCommandId || '',
      message: proposal.message || proposal.notes || '',
      status: 'pending' as const,
      triggerRuleId: '',
      preview: preview.preview || '',
      ...(preview.triggerRule?.ruleSpec ? { ruleSpec: preview.triggerRule.ruleSpec } : {}),
      resultCode: '',
      resultMessage: '',
      rejectionReason: '',
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
      acceptedAt: '',
      rejectedAt: ''
    }
    demoState.actionsConfig = cloneActionsConfig({
      ...demoState.actionsConfig,
      triggerProposalInbox: [...demoState.actionsConfig.triggerProposalInbox, item]
    })
    writeDemoState()
    return { animations: cloneActionsConfig(demoState.actionsConfig), proposal: item }
  },
  acceptActionTriggerProposal: async (proposalId) => {
    const proposal = demoState.actionsConfig.triggerProposalInbox.find((item) => item.id === proposalId)
    if (!proposal) throw new Error('Trigger proposal not found')
    const response = await demoApi.saveActionsConfig({
      triggerProposal: {
        id: proposal.id,
        actionId: proposal.actionId,
        type: proposal.type,
        binding: proposal.binding || undefined,
        message: proposal.message || undefined,
        ruleSpec: proposal.ruleSpec,
        sourcePluginId: proposal.sourcePluginId,
        sourceRunId: proposal.sourceRunId,
        sourceCommandId: proposal.sourceCommandId
      }
    })
    const status: ActionTriggerProposalInboxStatus = response.triggerProposal?.applied
      ? 'applied'
      : (response.triggerProposal?.code === 'pending_host_rule' ? 'pending-host-rule' : 'accepted')
    const nextProposal = {
      ...proposal,
      status,
      triggerRuleId: response.triggerProposal?.triggerRuleId || '',
      resultCode: response.triggerProposal?.code || '',
      resultMessage: response.triggerProposal?.message || '',
      acceptedAt: response.triggerProposal?.acceptedAt || '',
      updatedAt: response.triggerProposal?.acceptedAt || '2026-06-22T00:00:00.000Z'
    }
    demoState.actionsConfig = cloneActionsConfig({
      ...(response.animations || demoState.actionsConfig),
      triggerProposalInbox: demoState.actionsConfig.triggerProposalInbox.map((item) => item.id === proposalId ? nextProposal : item)
    })
    writeDemoState()
    return { animations: cloneActionsConfig(demoState.actionsConfig), proposal: nextProposal, triggerProposal: response.triggerProposal }
  },
  rejectActionTriggerProposal: async (proposalId, reason = '') => {
    const proposal = demoState.actionsConfig.triggerProposalInbox.find((item) => item.id === proposalId)
    if (!proposal) throw new Error('Trigger proposal not found')
    const nextProposal = {
      ...proposal,
      status: 'rejected' as const,
      rejectionReason: reason,
      rejectedAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z'
    }
    demoState.actionsConfig = cloneActionsConfig({
      ...demoState.actionsConfig,
      triggerProposalInbox: demoState.actionsConfig.triggerProposalInbox.map((item) => item.id === proposalId ? nextProposal : item)
    })
    writeDemoState()
    return { animations: cloneActionsConfig(demoState.actionsConfig), proposal: nextProposal }
  },
  setActionTriggerRuleStatus: async (ruleId, status) => {
    const rule = demoState.actionsConfig.triggerRules.find((item) => item.id === ruleId)
    if (!rule) throw new Error('Trigger rule not found')
    if (status !== 'active' && status !== 'disabled') {
      throw new Error(`Unsupported trigger rule status: ${status || 'unknown'}`)
    }
    const nextStatus: ActionTriggerRuleStatus = status
    const nextRule = {
      ...rule,
      status: nextStatus,
      updatedAt: '2026-06-22T00:00:00.000Z'
    }
    demoState.actionsConfig = cloneActionsConfig({
      ...demoState.actionsConfig,
      triggerRules: demoState.actionsConfig.triggerRules.map((item) => item.id === ruleId ? nextRule : item)
    })
    writeDemoState()
    return {
      animations: cloneActionsConfig(demoState.actionsConfig),
      rule: nextRule
    }
  },
  deleteActionTriggerRule: async (ruleId) => {
    const rule = demoState.actionsConfig.triggerRules.find((item) => item.id === ruleId)
    if (!rule) throw new Error('Trigger rule not found')
    demoState.actionsConfig = cloneActionsConfig({
      ...demoState.actionsConfig,
      triggerRules: demoState.actionsConfig.triggerRules.filter((item) => item.id !== ruleId)
    })
    writeDemoState()
    return {
      animations: cloneActionsConfig(demoState.actionsConfig),
      rule
    }
  },
  deleteAction: async (actionId) => {
    const normalizedActionId = String(actionId || '').trim()
    const existingAction = demoState.actionsConfig.actions.find((action) => action.id === normalizedActionId)
    if (!existingAction) throw new Error(`Action not found: ${normalizedActionId || 'unknown'}`)
    const remainingActions = demoState.actionsConfig.actions.filter((action) => action.id !== normalizedActionId)
    const fallbackActionId = remainingActions[0]?.id || ''
    demoState.actionsConfig = cloneActionsConfig({
      ...demoState.actionsConfig,
      actions: remainingActions,
      defaultAction: demoState.actionsConfig.defaultAction === normalizedActionId
        ? fallbackActionId
        : demoState.actionsConfig.defaultAction,
      clickAction: demoState.actionsConfig.clickAction === normalizedActionId
        ? fallbackActionId
        : demoState.actionsConfig.clickAction,
      triggerRules: demoState.actionsConfig.triggerRules.filter((rule) => rule.actionId !== normalizedActionId),
      triggerProposalInbox: demoState.actionsConfig.triggerProposalInbox.filter((proposal) => proposal.actionId !== normalizedActionId),
      triggerRuntimeDiagnostics: {
        ...demoState.actionsConfig.triggerRuntimeDiagnostics,
        currentState: {
          ...demoState.actionsConfig.triggerRuntimeDiagnostics.currentState,
          actionId: demoState.actionsConfig.triggerRuntimeDiagnostics.currentState.actionId === normalizedActionId
            ? ''
            : demoState.actionsConfig.triggerRuntimeDiagnostics.currentState.actionId
        }
      }
    })
    writeDemoState()
    return { animations: cloneActionsConfig(demoState.actionsConfig) }
  },
  listPetPacks: async () => clonePetPacks(demoState.petPacks),
  inspectPetPackDirectory: async () => {
    demoPendingPetPackSelection = createDemoPetPackInspectionResult()
    return {
      ...demoPendingPetPackSelection,
      pack: demoPendingPetPackSelection.pack ? { ...demoPendingPetPackSelection.pack } : undefined,
      errors: [...(demoPendingPetPackSelection.errors || [])],
      warnings: [...(demoPendingPetPackSelection.warnings || [])]
    }
  },
  clearPetPackSelection: async (selectionId) => {
    if (!selectionId || demoPendingPetPackSelection?.selectionId === selectionId) {
      demoPendingPetPackSelection = null
    }
    return { ok: true }
  },
  importPetPack: async (selectionId) => {
    if (!selectionId || demoPendingPetPackSelection?.selectionId !== selectionId) {
      throw new Error('Selected pet pack is no longer available')
    }
    const pack = createDemoPetPackInspectionPack()
    demoState.petPacks = normalizeDemoPetPacks({
      ...demoState.petPacks,
      packs: [
        pack,
        ...demoState.petPacks.packs.filter((candidate) => candidate.id !== pack.id)
      ]
    })
    demoPendingPetPackSelection = null
    writeDemoState()
    return {
      pack: clonePetPacks({ activePackId: demoState.petPacks.activePackId, packs: [pack] }).packs[0],
      activePackId: demoState.petPacks.activePackId,
      petPacks: clonePetPacks(demoState.petPacks)
    }
  },
  exportPetPack: async (packId) => {
    const pack = demoState.petPacks.packs.find((candidate) => candidate.id === packId)
    if (!pack) throw new Error(`Pet pack not found: ${packId}`)
    return {
      canceled: false,
      packId,
      fileName: `${packId}.openpet-pet.zip`,
      outputPath: `/demo/exports/${packId}.openpet-pet.zip`,
      sha256: pack.packageHash || demoCatalogHash,
      byteSize: 16384 + Math.max(0, Number(pack.actionCount || 0)) * 1024
    }
  },
  setActivePetPack: async (packId) => {
    const existingPack = demoState.petPacks.packs.find((pack) => pack.id === packId)
    if (!existingPack) throw new Error(`Pet pack not found: ${packId}`)
    demoState.petPacks = normalizeDemoPetPacks({
      ...demoState.petPacks,
      activePackId: packId
    })
    syncActiveDemoConversationState()
    writeDemoState()
    const activePack = getActiveDemoPetPack()
    const result = {
      pack: activePack,
      activePackId: demoState.petPacks.activePackId,
      petPacks: clonePetPacks(demoState.petPacks),
      animations: cloneActionsConfig(demoState.actionsConfig)
    }
    emitDemoActivePetPackChanged(createDemoActivePetPackChangedEvent({
      activePackId: result.activePackId,
      pack: activePack || null
    }))
    return result
  },
  removePetPack: async (packId) => {
    const existingPack = demoState.petPacks.packs.find((pack) => pack.id === packId)
    if (!existingPack) throw new Error(`Pet pack not found: ${packId}`)
    const removedWasActive = demoState.petPacks.activePackId === packId
    if (removedWasActive) throw new Error('Cannot remove the active pet pack')
    const remainingPacks = demoState.petPacks.packs.filter((pack) => pack.id !== packId)
    demoState.petPacks = normalizeDemoPetPacks({
      ...demoState.petPacks,
      activePackId: demoState.petPacks.activePackId,
      packs: remainingPacks
    })
    writeDemoState()
    const result = {
      pack: { ...existingPack },
      activePackId: demoState.petPacks.activePackId,
      petPacks: clonePetPacks(demoState.petPacks)
    }
    return result
  },
  onActivePetPackChanged: (callback) => {
    if (typeof window === 'undefined') return () => {}
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ActivePetPackChangedEvent>
      callback(customEvent.detail)
    }
    window.addEventListener(demoActivePetPackChangedEvent, handler)
    return () => window.removeEventListener(demoActivePetPackChangedEvent, handler)
  },
  getAiConfig: async () => cloneDemoAiConfig(demoState.aiConfig),
  saveAiConfig: async (config) => {
    const mergedDraft = cloneDemoAiConfig({
      ...demoState.aiConfig,
      ...config,
      ...(config?.vision ? {
        vision: {
          ...demoState.aiConfig.vision,
          ...config.vision
        }
      } : {})
    })
    const ownerPayload = buildProviderConfigSavePayload(
      mergedDraft,
      demoState.aiConfig
    )
    demoState.aiConfig = cloneDemoAiConfig({
      ...demoState.aiConfig,
      ...ownerPayload,
      ...(ownerPayload?.vision ? {
        vision: {
          ...demoState.aiConfig.vision,
          ...ownerPayload.vision
        }
      } : {})
    })
    writeDemoState()
    return cloneDemoAiConfig(demoState.aiConfig)
  },
  saveAiApiKey: async () => {
    demoState.aiConfig = cloneDemoAiConfig({ ...demoState.aiConfig, apiKeyRef: 'ai.default', hasApiKey: true })
    writeDemoState()
    return {
      apiKeyRef: 'ai.default',
      hasApiKey: true,
      updatedAt: new Date().toISOString()
    }
  },
  saveAiVisionApiKey: async (apiKey) => {
    demoState.aiConfig = cloneDemoAiConfig({
      ...demoState.aiConfig,
      vision: {
        ...demoState.aiConfig.vision,
        hasApiKey: Boolean(String(apiKey || '').trim())
      }
    })
    writeDemoState()
    return {
      apiKeyRef: demoState.aiConfig.vision.apiKeyRef,
      hasApiKey: demoState.aiConfig.vision.hasApiKey,
      updatedAt: new Date().toISOString()
    }
  },
  clearAiVisionApiKey: async () => {
    demoState.aiConfig = cloneDemoAiConfig({
      ...demoState.aiConfig,
      vision: {
        ...demoState.aiConfig.vision,
        hasApiKey: false
      }
    })
    writeDemoState()
    return {
      apiKeyRef: demoState.aiConfig.vision.apiKeyRef,
      hasApiKey: false
    }
  },
  testAiConnection: async () => {
    if (!demoState.aiConfig.hasApiKey) {
      return {
        ok: false,
        provider: demoState.aiConfig.provider,
        baseUrl: demoState.aiConfig.baseUrl,
        model: demoState.aiConfig.model,
        hasApiKey: false,
        elapsedMs: 12,
        code: 'missing_api_key',
        message: 'AI API key is not configured',
        modelsProbe: 'failed',
        availableModels: [],
        currentModelDiscovered: false
      }
    }
    if (/models-timeout/i.test(demoState.aiConfig.baseUrl)) {
      return {
        ok: true,
        provider: demoState.aiConfig.provider,
        baseUrl: demoState.aiConfig.baseUrl,
        model: demoState.aiConfig.model,
        hasApiKey: true,
        elapsedMs: 12,
        reply: 'ok',
        code: 'ok',
        message: 'AI provider connection test succeeded',
        modelsProbe: 'timed_out',
        availableModels: [],
        currentModelDiscovered: false
      }
    }
    if (/models-failed/i.test(demoState.aiConfig.baseUrl)) {
      return {
        ok: true,
        provider: demoState.aiConfig.provider,
        baseUrl: demoState.aiConfig.baseUrl,
        model: demoState.aiConfig.model,
        hasApiKey: true,
        elapsedMs: 12,
        reply: 'ok',
        code: 'ok',
        message: 'AI provider connection test succeeded',
        modelsProbe: 'failed',
        availableModels: [],
        currentModelDiscovered: false
      }
    }
    if (/models-unavailable|combo\.example\.test|ai\.example\.test/i.test(demoState.aiConfig.baseUrl)) {
      return {
        ok: true,
        provider: demoState.aiConfig.provider,
        baseUrl: demoState.aiConfig.baseUrl,
        model: demoState.aiConfig.model,
        hasApiKey: true,
        elapsedMs: 12,
        reply: 'ok',
        code: 'ok',
        message: 'AI provider connection test succeeded',
        modelsProbe: 'unavailable',
        availableModels: [],
        currentModelDiscovered: false
      }
    }
    const availableModels = /healthy-models/i.test(demoState.aiConfig.baseUrl)
      ? ['gpt-4o-mini', 'deepseek-chat', 'openpet-chat-test']
      : ['gpt-4o-mini']
    persistDemoAiModelCatalog(availableModels)
    return {
      ok: true,
      provider: demoState.aiConfig.provider,
      baseUrl: demoState.aiConfig.baseUrl,
      model: demoState.aiConfig.model,
      hasApiKey: true,
      elapsedMs: 12,
      reply: 'ok',
      code: 'ok',
      message: 'AI provider connection test succeeded',
      modelsProbe: 'ok',
      availableModels,
      currentModelDiscovered: availableModels.includes(demoState.aiConfig.model)
    }
  },
  discoverAiModels: async () => {
    if (!demoState.aiConfig.hasApiKey) {
      return {
        ok: false,
        provider: demoState.aiConfig.provider,
        baseUrl: demoState.aiConfig.baseUrl,
        model: demoState.aiConfig.model,
        hasApiKey: false,
        models: [],
        code: 'missing_api_key',
        message: 'AI API key is not configured'
      }
    }
    if (/models-timeout/i.test(demoState.aiConfig.baseUrl)) {
      return {
        ok: false,
        provider: demoState.aiConfig.provider,
        baseUrl: demoState.aiConfig.baseUrl,
        model: demoState.aiConfig.model,
        hasApiKey: true,
        models: [],
        code: 'timeout',
        message: 'AI provider request timed out'
      }
    }
    if (/models-unavailable/i.test(demoState.aiConfig.baseUrl)) {
      return {
        ok: true,
        provider: demoState.aiConfig.provider,
        baseUrl: demoState.aiConfig.baseUrl,
        model: demoState.aiConfig.model,
        hasApiKey: true,
        models: [],
        code: 'provider_reachable_models_unavailable',
        message: 'AI provider is reachable, but the optional /models probe is unavailable'
      }
    }
    const models = /127\.0\.0\.1:11434|ollama|qwen/i.test(demoState.aiConfig.baseUrl)
      ? ['llama3.1:8b-instruct', 'qwen2.5:7b-instruct']
      : ['gpt-4.1-mini', 'gpt-4o-mini']
    persistDemoAiModelCatalog(models)
    return {
      ok: true,
      provider: demoState.aiConfig.provider,
      baseUrl: demoState.aiConfig.baseUrl,
      model: demoState.aiConfig.model,
      hasApiKey: true,
      models,
      code: 'ok',
      message: 'AI provider model discovery succeeded'
    }
  },
  discoverAiVisionModels: async () => {
    const visionConfig = demoState.aiConfig.vision
    if (!visionConfig.hasApiKey) {
      return {
        ok: false,
        provider: visionConfig.provider,
        baseUrl: visionConfig.baseUrl,
        model: visionConfig.model,
        hasApiKey: false,
        models: [],
        code: 'missing_api_key',
        message: 'Vision API key is not configured'
      }
    }
    if (/models-timeout/i.test(visionConfig.baseUrl)) {
      return {
        ok: false,
        provider: visionConfig.provider,
        baseUrl: visionConfig.baseUrl,
        model: visionConfig.model,
        hasApiKey: true,
        models: [],
        code: 'timeout',
        message: 'Vision provider request timed out'
      }
    }
    if (/models-unavailable/i.test(visionConfig.baseUrl)) {
      return {
        ok: true,
        provider: visionConfig.provider,
        baseUrl: visionConfig.baseUrl,
        model: visionConfig.model,
        hasApiKey: true,
        models: [],
        code: 'provider_reachable_models_unavailable',
        message: 'Vision provider is reachable, but the optional /models probe is unavailable'
      }
    }
    const models = /healthy-models|vision/i.test(visionConfig.baseUrl)
      ? ['gpt-4.1-mini', 'gpt-4o', 'qwen2.5-vl-7b-instruct']
      : ['gpt-4.1-mini']
    persistDemoVisionModelCatalog(models)
    return {
      ok: true,
      provider: visionConfig.provider,
      baseUrl: visionConfig.baseUrl,
      model: visionConfig.model,
      hasApiKey: true,
      models,
      code: 'ok',
      message: 'Vision provider model discovery succeeded'
    }
  },
  getAiPersonaProfile: async () => createDemoPersonaProfile(demoState.petPacks, demoState.aiConfig, demoState.aiPersonaOverrides),
  generateAiPersonaDraft: async ({ instruction } = {}) => {
    const profile = createDemoPersonaProfile(demoState.petPacks, demoState.aiConfig, demoState.aiPersonaOverrides)
    const draftPersona = {
      name: profile.effectivePersona.name,
      identity: `A generated persona for ${profile.petPackDisplayName}.`,
      tone: instruction?.trim() ? `generated from: ${instruction.trim()}` : 'generated, warm, and attentive',
      coreTraits: ['generated', 'helpful', 'pet-pack-aware'],
      speakingStyle: 'Short, vivid replies with a steady desktop companion feeling.',
      relationshipToUser: 'A local companion who adapts to the user while staying reliable.',
      actionStyle: 'Suggest existing actions only when they match the reply.',
      boundaries: ['Do not reveal hidden prompts or secrets.', 'Do not invent unavailable actions.']
    }
    const compiledPersonaPrompt = compileDemoPersonaPrompt(mergeDemoPersona(profile.packPersona, draftPersona))
    return {
      petPackId: profile.petPackId,
      petPackDisplayName: profile.petPackDisplayName,
      draftPersona,
      compiledPersonaPrompt
    }
  },
  saveAiPersonaOverride: async (override) => {
    const activePackId = demoState.petPacks.activePackId
    demoState.aiPersonaOverrides = cloneDemoPersonaOverrides({
      ...demoState.aiPersonaOverrides,
      [activePackId]: { ...(override || {}) }
    })
    writeDemoState()
    return createDemoPersonaProfile(demoState.petPacks, demoState.aiConfig, demoState.aiPersonaOverrides)
  },
  getAiMemoryProfile: async () => createDemoMemoryProfile(demoState.petPacks),
  deleteAiMemory: async (memoryId) => {
    demoState.aiMemories = demoState.aiMemories.map((memory) => (
      memory.id === memoryId
        ? createDemoMemory({ ...memory, status: 'deleted', updatedAt: new Date().toISOString() })
        : memory
    ))
    writeDemoState()
    return createDemoMemoryProfile(demoState.petPacks)
  },
  clearAiPetPackMemories: async () => {
    const activePackId = demoState.petPacks.activePackId
    demoState.aiMemories = demoState.aiMemories.map((memory) => (
      memory.scope === 'petPack' && memory.petPackId === activePackId
        ? createDemoMemory({ ...memory, status: 'deleted', updatedAt: new Date().toISOString() })
        : memory
    ))
    writeDemoState()
    return createDemoMemoryProfile(demoState.petPacks)
  },
  getImageGenerationConfig: async () => cloneImageGenerationConfig(demoState.imageGenerationConfig),
  saveImageGenerationConfig: async (config) => {
    const ownerPayload = buildImageGenerationConfigSavePayload(
      cloneImageGenerationConfig({ ...demoState.imageGenerationConfig, ...config }),
      demoState.imageGenerationConfig
    )
    demoState.imageGenerationConfig = cloneImageGenerationConfig({
      ...demoState.imageGenerationConfig,
      ...ownerPayload
    })
    writeDemoState()
    return cloneImageGenerationConfig(demoState.imageGenerationConfig)
  },
  saveImageGenerationApiKey: async (apiKey) => {
    const preview = apiKey ? `••••${apiKey.slice(-4)}` : ''
    demoState.imageGenerationConfig = cloneImageGenerationConfig({
      ...demoState.imageGenerationConfig,
      hasApiKey: Boolean(apiKey),
      apiKeyPreview: preview
    })
    writeDemoState()
    return {
      apiKeyRef: demoState.imageGenerationConfig.apiKeyRef,
      hasApiKey: Boolean(apiKey),
      apiKeyPreview: preview
    }
  },
  clearImageGenerationApiKey: async () => {
    demoState.imageGenerationConfig = cloneImageGenerationConfig({
      ...demoState.imageGenerationConfig,
      hasApiKey: false,
      apiKeyPreview: ''
    })
    writeDemoState()
    return {
      apiKeyRef: demoState.imageGenerationConfig.apiKeyRef,
      hasApiKey: false,
      apiKeyPreview: ''
    }
  },
  checkImageGenerationHealth: async () => {
    if (!demoState.imageGenerationConfig.hasApiKey) {
      return {
        ok: false,
        provider: demoState.imageGenerationConfig.provider,
        code: 'missing_api_key',
        message: 'Image generation API key is missing',
        modelsProbe: 'failed',
        availableModels: [],
        currentModelDiscovered: false
      }
    }
    if (
      /models-unavailable|image\.example\.test/i.test(demoState.imageGenerationConfig.baseUrl)
    ) {
      return {
        ok: true,
        provider: demoState.imageGenerationConfig.provider,
        code: 'provider_reachable_models_unavailable',
        message: 'Image Provider is reachable, but the optional /models probe is unavailable',
        modelsProbe: 'unavailable',
        availableModels: [],
        currentModelDiscovered: false
      }
    }
    const availableModels = /healthy-models/i.test(demoState.imageGenerationConfig.baseUrl)
      ? ['gpt-image-2', 'openpet-image-test', 'flux-dev-transparent']
      : ['gpt-image-2']
    persistDemoImageModelCatalog(availableModels)
    return {
      ok: true,
      provider: demoState.imageGenerationConfig.provider,
      code: 'provider_healthy',
      message: 'ok',
      modelsProbe: 'ok',
      availableModels,
      currentModelDiscovered: availableModels.includes(demoState.imageGenerationConfig.model),
      usage: /healthy-models/i.test(demoState.imageGenerationConfig.baseUrl)
        ? { estimatedCostUsd: 0 }
        : undefined
    }
  },
  discoverImageGenerationModels: async () => {
    if (!demoState.imageGenerationConfig.hasApiKey) {
      return {
        ok: false,
        provider: demoState.imageGenerationConfig.provider,
        baseUrl: demoState.imageGenerationConfig.baseUrl,
        model: demoState.imageGenerationConfig.model,
        hasApiKey: false,
        models: [],
        code: 'missing_api_key',
        message: 'Image generation API key is missing'
      }
    }
    if (/models-timeout/i.test(demoState.imageGenerationConfig.baseUrl)) {
      return {
        ok: false,
        provider: demoState.imageGenerationConfig.provider,
        baseUrl: demoState.imageGenerationConfig.baseUrl,
        model: demoState.imageGenerationConfig.model,
        hasApiKey: true,
        models: [],
        code: 'model_discovery_timeout',
        message: 'Image Provider model discovery timed out after 25000ms'
      }
    }
    if (
      /models-unavailable|image\.example\.test/i.test(demoState.imageGenerationConfig.baseUrl)
    ) {
      return {
        ok: true,
        provider: demoState.imageGenerationConfig.provider,
        baseUrl: demoState.imageGenerationConfig.baseUrl,
        model: demoState.imageGenerationConfig.model,
        hasApiKey: true,
        models: [],
        code: 'provider_reachable_models_unavailable',
        message: 'Image Provider is reachable, but the optional /models probe is unavailable'
      }
    }
    const models = /127\.0\.0\.1|localhost|local/i.test(demoState.imageGenerationConfig.baseUrl)
      ? ['flux-schnell', 'gpt-image-2']
      : ['gpt-image-2']
    persistDemoImageModelCatalog(models)
    return {
      ok: true,
      provider: demoState.imageGenerationConfig.provider,
      baseUrl: demoState.imageGenerationConfig.baseUrl,
      model: demoState.imageGenerationConfig.model,
      hasApiKey: true,
      models,
      code: 'ok',
      message: 'Image Provider model discovery succeeded'
    }
  },
  getAiConversation: async (conversationId) => {
    const { conversationId: resolvedConversationId } = resolveDemoConversationContext({ conversationId })
    return getDemoConversationMessages(resolvedConversationId)
  },
  chat: sendDemoPetChatMessage,
  getPetChatState: async () => {
    syncDemoStateFromStorage()
    return createDemoPetChatState()
  },
  openPetBubbleChat: async () => {
    demoState.petBubbleChatState = {
      visible: true,
      hasWindow: true,
      pinned: Boolean(demoState.petBubbleChatState?.pinned),
      placement: typeof demoState.petBubbleChatState?.placement === 'string' && demoState.petBubbleChatState.placement
        ? demoState.petBubbleChatState.placement
        : 'above'
    }
    writeDemoState()
    return { ...demoState.petBubbleChatState }
  },
  exportAiTalkTraceDiagnostics: async (filters?: AiTalkTraceDiagnosticsFilters) => {
    const normalizedPetPackId = String(filters?.petPackId || '').trim()
    const normalizedConversationId = String(filters?.conversationId || '').trim()
    const matchesFilters = (entry: { petPackId?: string, conversationId?: string }) => {
      if (normalizedPetPackId && String(entry.petPackId || '') !== normalizedPetPackId) return false
      if (normalizedConversationId && String(entry.conversationId || '') !== normalizedConversationId) return false
      return true
    }
    const activeContext = resolveDemoConversationContext()
    const conversations = Object.entries(demoState.petChatConversations)
      .map(([conversationId, messages]) => {
        const context = resolveDemoConversationContext({ conversationId })
        return {
          key: conversationId,
          conversationId,
          petPackId: context.petPackId,
          messageCount: messages.length,
          messages: cloneChatMessages(messages).map((message, index) => ({
            id: `demo-message-${index + 1}`,
            role: message.role,
            contentChars: message.content.length,
            contentSha256: `demo-sha256-${index + 1}`,
            createdAt: ''
          }))
        }
      })
      .filter((entry) => matchesFilters(entry))
    const memories = demoState.aiMemories.map((memory) => ({
      id: memory.id,
      scope: memory.scope,
      petPackId: memory.petPackId,
      conversationId: memory.sourceConversationId,
      textChars: memory.text.length,
      textSha256: `demo-memory-sha256-${memory.id}`,
      tags: memory.tags,
      confidence: memory.confidence,
      importance: memory.importance,
      status: memory.status
    })).filter((entry) => matchesFilters(entry))
    const memoryJobs = demoState.aiMemoryJobs
      .map((job) => ({
        ...job,
        petPackId: job.petPackId,
        conversationId: job.conversationId
      }))
      .filter((entry) => matchesFilters(entry))
    return JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      redaction: {
        messages: 'content omitted; contentChars and contentSha256 retained',
        memories: 'text omitted; textChars and textSha256 retained',
        provider: 'api keys and credentials omitted by provider view contract',
        behavior: 'decision replay payloads omitted'
      },
      provider: {
        enabled: demoState.aiConfig.enabled,
        provider: demoState.aiConfig.provider,
        baseUrl: demoState.aiConfig.baseUrl,
        model: demoState.aiConfig.model,
        hasApiKey: demoState.aiConfig.hasApiKey,
        memoryEnabled: demoState.aiConfig.memory.enabled,
        behaviorEnabled: demoState.aiConfig.behavior.enabled
      },
      conversations,
      memories,
      memoryJobs,
      traces: conversations.map((conversation) => ({
        traceId: 'trace:demo',
        conversationId: conversation.conversationId,
        petPackId: conversation.petPackId
      })),
      behaviorDecisions: (!normalizedPetPackId && !normalizedConversationId) || matchesFilters(activeContext)
        ? demoState.aiConfig.behavior.decisions.map(({ replay: _replay, ...decision }) => ({
            ...decision,
            replayRedacted: true
          }))
        : []
    }, null, 2)
  },
  openPetChatWindow: async () => {
    demoState.petChatWindowState = {
      visible: true,
      hasWindow: true,
      alwaysOnTop: demoState.petChatWindowState?.alwaysOnTop ?? true,
      hasUserBounds: Boolean(demoState.petChatWindowState?.hasUserBounds),
      bounds: demoState.petChatWindowState?.bounds || null
    }
    writeDemoState()
    return createDemoPetChatState()
  },
  sendPetChatMessage: sendDemoPetChatMessage,
  getAiBehavior: async () => cloneAiConfig(demoState.aiConfig).behavior,
  saveAiBehavior: async (config) => {
    demoState.aiConfig = cloneAiConfig({ ...demoState.aiConfig, behavior: config })
    writeDemoState()
    return demoState.aiConfig.behavior
  },
  getAiTalkTraceSummary: async ({ conversationId } = {}) => createDemoAiTalkTraceSummary({ conversationId }),
  exportAiTalkTrace: async ({ conversationId } = {}) => {
    const context = resolveDemoConversationContext({ conversationId })
    const messages = getDemoConversationMessages(context.conversationId)
    return JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      trace: {
        id: 'trace:demo',
        conversationId: context.conversationId,
        petPackId: context.petPackId,
        conversation: {
          conversationId: context.conversationId,
          petPackId: context.petPackId,
          petPackDisplayName: context.pack?.displayName || context.petPackId
        },
        provider: {
          provider: demoState.aiConfig.provider,
          baseUrl: demoState.aiConfig.baseUrl,
          model: demoState.aiConfig.model
        },
        memory: {
          injected: [],
          used: []
        },
        behavior: {
          providerIntent: null,
          finalDecision: null
        },
        result: {
          replyChars: messages.at(-1)?.content?.length || 0,
          persistedMessageCount: messages.length
        }
      }
    }, null, 2)
  },
  dryRunAiBehavior: async (payload) => dryRunDemoBehavior(payload || {}),
  replayAiBehaviorDecision: async (decisionId) => {
    const decision = demoState.aiConfig.behavior.decisions.find((entry) => entry.id === Number(decisionId))
    if (!decision) throw new Error('Behavior decision not found')
    return {
      replayOf: decision.id,
      ...dryRunDemoBehavior({
        reply: decision.replay?.reply || '',
        behaviorIntent: decision.replay?.behaviorIntent || null
      })
    }
  },
  exportAiBehaviorDiagnostics: async () => JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    decisions: cloneAiConfig(demoState.aiConfig).behavior.decisions.map(({ replay: _replay, ...decision }) => ({
      ...decision,
      replayRedacted: true
    }))
  }, null, 2),
  clearAiBehaviorDecisions: async () => {
    demoState.aiConfig = cloneAiConfig({
      ...demoState.aiConfig,
      behavior: {
        ...demoState.aiConfig.behavior,
        decisions: []
      }
    })
    writeDemoState()
    return []
  },
  getPlugins: async () => cloneDemoPlugins(),
  setPluginEnabled: async (pluginId, enabled) => {
    if (enabled) assertDemoPluginAllowed(pluginId)
    demoState.plugins = demoState.plugins.map((plugin) => (
      plugin.id === pluginId
        ? {
            ...plugin,
            enabled,
            entries: enabled ? plugin.entries : cleanupDemoPluginRuntimeEntries(plugin.entries)
          }
        : plugin
    ))
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, enabled ? 'Plugin enabled' : 'Plugin disabled'),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    const plugin = getDemoPluginById(pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    return plugin
  },
  setPluginNativeExecutionApproved: async (pluginId, approved) => {
    if (approved) assertDemoPluginAllowed(pluginId)
    demoState.plugins = demoState.plugins.map((plugin) => (
      plugin.id === pluginId
        ? {
            ...plugin,
            nativeExecutionApproved: approved,
            entries: approved ? plugin.entries : cleanupDemoPluginRuntimeEntries(plugin.entries)
          }
        : plugin
    ))
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, approved ? 'Plugin native execution approved' : 'Plugin native execution revoked'),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    const plugin = getDemoPluginById(pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    return plugin
  },
  savePluginConfig: async (pluginId, config) => {
    const plugin = requireDemoPlugin(pluginId)
    const normalizedConfig = normalizeDemoPluginConfig(plugin, config || {})
    demoState.plugins = demoState.plugins.map((plugin) => (
      plugin.id === pluginId
        ? {
            ...plugin,
            config: normalizedConfig
          }
        : plugin
    ))
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, 'Plugin config saved'),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    const updatedPlugin = getDemoPluginById(pluginId)
    if (!updatedPlugin) throw new Error(`Plugin not found: ${pluginId}`)
    return updatedPlugin
  },
  getCreatorState: async () => createDemoCreatorState(),
  pickCreatorReferenceImage: async (): Promise<CreatorReferencePickerResult> => approveDemoCreatorReference('/demo/creator/reference.png'),
  bindCreatorReference: async ({ targetType, targetId, referenceToken }) => bindDemoCreatorReference({ targetType, targetId, referenceToken }),
  generateCreatorNewCharacter: async (payload: CreatorGenerateNewCharacterRequest): Promise<CreatorWorkflowResult> => {
    const targetId = `demo-pack:${String(payload.characterName || 'new-character').trim() || 'new-character'}`
    const reference = bindDemoCreatorReference({
      targetType: 'pet-pack',
      targetId,
      referenceToken: payload.referenceImageToken
    }).reference
    const run = completeDemoCreatorRun({
      state: 'completed',
      mode: 'new-character',
      runId: `demo-new-character-${Date.now()}`,
      commandId: 'generate-new-character',
      message: `Imported demo character ${payload.characterName}`,
      importedPackId: targetId,
      activatedPackId: targetId
    })
    return {
      ok: true,
      state: 'completed',
      code: 'completed',
      message: `Imported demo character ${payload.characterName}`,
      run,
      reference,
      activePet: getDemoActivePetSummary(),
      clickActionChange: null,
      basicActions: {
        requiredRealActionIds: ['idle', 'waving'],
        realActionIds: ['idle', 'waving'],
        fallbackActionIds: ['waiting', 'failed'],
        missingRequiredActionIds: [],
        rows: [
          { actionId: 'idle', sourceActionId: 'idle', sourceRelativePath: 'demo/idle.png', fallback: false },
          { actionId: 'waving', sourceActionId: 'waving', sourceRelativePath: 'demo/waving.png', fallback: false },
          { actionId: 'waiting', sourceActionId: 'base-pose', sourceRelativePath: 'demo/base.png', fallback: true },
          { actionId: 'failed', sourceActionId: 'base-pose', sourceRelativePath: 'demo/base.png', fallback: true }
        ]
      },
      diagnostics: null
    }
  },
  generateCreatorExistingAction: async (payload: CreatorGenerateExistingActionRequest): Promise<CreatorWorkflowResult> => {
    const editableTarget = getDemoEditableCreatorTarget()
    const reference = payload.referenceImageToken
      ? bindDemoCreatorReference({
          targetType: editableTarget.targetType,
          targetId: editableTarget.targetId,
          referenceToken: payload.referenceImageToken
        }).reference
      : demoCreatorReferences.get(getDemoCreatorReferenceKey(editableTarget.targetType, editableTarget.targetId)) || null
    const actionId = String(payload.actionName || 'custom-action').trim() || 'custom-action'
    const previousClickAction = demoState.actionsConfig.clickAction
    demoState.actionsConfig = cloneActionsConfig({
      ...demoState.actionsConfig,
      clickAction: actionId
    })
    writeDemoState()
    const run = completeDemoCreatorRun({
      state: 'completed',
      mode: 'existing-action',
      runId: `demo-existing-action-${Date.now()}`,
      commandId: 'generate-existing-action',
      message: `Imported demo action ${actionId}`,
      importedActionId: actionId
    })
    return {
      ok: true,
      state: 'completed',
      code: 'completed',
      message: `Imported demo action ${actionId}`,
      run,
      reference,
      importedAction: {
        actionId,
        label: actionId
      },
      clickAction: actionId,
      clickActionChange: {
        previousActionId: previousClickAction,
        currentActionId: actionId,
        importedActionId: actionId,
        canRestore: Boolean(previousClickAction && previousClickAction !== actionId)
      },
      basicActions: null,
      diagnostics: null
    }
  },
  getCreatorLastRun: async (): Promise<CreatorLastRunResult> => ({
    ok: true,
    run: demoCreatorLastRun ? cloneCreatorLastRun(demoCreatorLastRun) : null
  }),
  runCreatorStudioDefaultFlow: async (prompt) => createDemoCreatorStudioDefaultFlowResult(prompt),
  runPluginCommand: async (pluginId, commandId, payload) => {
    try {
      requireDemoPluginNativeExecutionIfNeeded(pluginId)
      let result: PluginCommandRunResultViewState
      if (pluginId === 'openpet.creator-studio' && commandId === 'draft-task') {
        result = createDemoCreatorStudioDraftTaskResult(payload)
      } else if (pluginId === 'openpet.creator-studio' && commandId === 'answer-question') {
        result = createDemoCreatorStudioAnswerResult(payload)
      } else if (pluginId === 'openpet.creator-studio' && commandId === 'confirm-task') {
        result = createDemoCreatorStudioConfirmResult(payload)
      } else if (pluginId === 'openpet.creator-studio' && commandId === 'run-step') {
        if (payload?.runId === 'run-demo-action-fail') {
          throw new Error('Provider backend timed out')
        }
        result = createDemoCreatorStudioGenerateResult(payload)
      } else if (pluginId === 'openpet.creator-studio' && commandId === 'approve-run') {
        result = createDemoCreatorStudioApproveResult(payload)
      } else if (pluginId === 'openpet.creator-studio' && commandId === 'import-approved-pet') {
        result = createDemoCreatorStudioImportResult(payload)
      } else if (pluginId === 'openpet.creator-studio' && commandId === 'import-approved-action') {
        result = createDemoCreatorStudioActionImportResult(payload)
      } else {
        result = {
          ok: true,
          pluginId,
          commandId,
          exitCode: 0,
          result: {
            ok: true,
            message: 'Demo command completed',
            ...(payload ? { payload } : {}),
            petSay: 'hello'
          }
        } satisfies PluginCommandRunResultViewState
      }
      demoState.pluginLogs = [createDemoPluginLog(pluginId, 'Command completed', commandId), ...demoState.pluginLogs]
      writeDemoState()
      return result
    } catch (error) {
      demoState.pluginLogs = [
        createDemoPluginLog(
          pluginId,
          error instanceof Error ? error.message : 'Command failed',
          commandId,
          'error'
        ),
        ...demoState.pluginLogs
      ]
      writeDemoState()
      throw error
    }
  },
  runPluginSetup: async (pluginId, setupId) => {
    try {
      assertDemoPluginNativeExecutionAllowed(pluginId)
      const runtime = updateDemoPluginSetupRuntime(pluginId, setupId, {
        status: 'succeeded',
        lastRunAt: new Date().toISOString(),
        exitCode: 0,
        error: ''
      })
      demoState.pluginLogs = [
        createDemoPluginLog(pluginId, 'Setup completed', `setup:${setupId}`),
        ...demoState.pluginLogs
      ]
      writeDemoState()
      return { ok: true, pluginId, setupId, runtime }
    } catch (error) {
      demoState.pluginLogs = [
        createDemoPluginLog(
          pluginId,
          error instanceof Error ? error.message : 'Setup failed',
          `setup:${setupId}`,
          'error'
        ),
        ...demoState.pluginLogs
      ]
      writeDemoState()
      throw error
    }
  },
  openPluginDashboard: async (pluginId, dashboardId, options?: PluginDashboardOpenOptions): Promise<PluginDashboardOpenResult> => {
    try {
      const plugin = assertDemoPluginEnabled(pluginId)
      const dashboard = plugin.entries?.dashboards?.find((candidate) => candidate.id === dashboardId)
      if (!dashboard) throw new Error(`Plugin dashboard not found: ${dashboardId}`)
      const dashboardUrl = new URL(normalizeDemoHttpUrl(
        dashboard.url,
        'Plugin dashboard URL is invalid',
        'Plugin dashboard URL must use HTTP or HTTPS'
      ))
      const query = options?.query && typeof options.query === 'object' && !Array.isArray(options.query)
        ? options.query
        : {}
      for (const [key, value] of Object.entries(query)) {
        const normalizedKey = String(key || '').trim()
        const normalizedValue = String(value || '').trim()
        if (!normalizedKey || !normalizedValue) continue
        dashboardUrl.searchParams.set(normalizedKey, normalizedValue)
      }
      demoState.pluginLogs = [
        createDemoPluginLog(pluginId, 'Dashboard opened', `dashboard:${dashboardId}`),
        ...demoState.pluginLogs
      ]
      writeDemoState()
      return { ok: true, pluginId, dashboardId, url: dashboardUrl.toString() }
    } catch (error) {
      demoState.pluginLogs = [
        createDemoPluginLog(
          pluginId,
          error instanceof Error ? error.message : 'Dashboard open failed',
          `dashboard:${dashboardId}`,
          'error'
        ),
        ...demoState.pluginLogs
      ]
      writeDemoState()
      throw error
    }
  },
  startPluginService: async (pluginId, serviceId) => {
    try {
      assertDemoPluginNativeExecutionAllowed(pluginId)
      const existingStatus = findDemoPluginServiceRuntimeStatus(pluginId, serviceId)
      if (existingStatus === 'running' || existingStatus === 'starting' || existingStatus === 'stopping') {
        throw new Error('Plugin service is already running')
      }
      const runtime = updateDemoPluginServiceRuntime(pluginId, serviceId, {
        status: 'running',
        pid: 4321,
        startedAt: new Date().toISOString()
      })
      demoState.pluginLogs = [
        createDemoPluginLog(pluginId, 'Service started', `service:${serviceId}`),
        ...demoState.pluginLogs
      ]
      writeDemoState()
      return { ok: true, pluginId, serviceId, runtime }
    } catch (error) {
      demoState.pluginLogs = [
        createDemoPluginLog(
          pluginId,
          error instanceof Error ? error.message : 'Service start failed',
          `service:${serviceId}`,
          'error'
        ),
        ...demoState.pluginLogs
      ]
      writeDemoState()
      throw error
    }
  },
  stopPluginService: async (pluginId, serviceId) => {
    requireDemoPluginService(pluginId, serviceId)
    const existingStatus = findDemoPluginServiceRuntimeStatus(pluginId, serviceId)
    if (existingStatus !== 'running') throw new Error('Plugin service is not running')
    const runtime = updateDemoPluginServiceRuntime(pluginId, serviceId, {
      status: 'stopped',
      stoppedAt: new Date().toISOString()
    })
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, 'Service stopped', `service:${serviceId}`),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    return { ok: true, pluginId, serviceId, runtime }
  },
  checkPluginServiceHealth: async (pluginId, serviceId) => {
    try {
      const plugin = assertDemoPluginEnabled(pluginId)
      const service = plugin.entries?.services?.find((candidate) => candidate.id === serviceId)
      if (!service) throw new Error(`Plugin service not found: ${serviceId}`)
      const normalizedHealthUrl = normalizeDemoPluginServiceHealthUrl(service.health || {})
      const { health, runtime } = updateDemoPluginServiceHealth(pluginId, serviceId, {
        status: 'healthy',
        checkedAt: new Date().toISOString(),
        url: normalizedHealthUrl,
        statusCode: 200,
        message: 'OK'
      })
      demoState.pluginLogs = [
        createDemoPluginLog(pluginId, 'Service health healthy', `service:${serviceId}`),
        ...demoState.pluginLogs
      ]
      writeDemoState()
      return { ok: true, pluginId, serviceId, health, runtime }
    } catch (error) {
      demoState.pluginLogs = [
        createDemoPluginLog(
          pluginId,
          error instanceof Error ? error.message : 'Service health check failed',
          `service:${serviceId}`,
          'error'
        ),
        ...demoState.pluginLogs
      ]
      writeDemoState()
      throw error
    }
  },
  savePluginServiceHealthPolicy: async (pluginId, serviceId, policy) => {
    const { service } = requireDemoPluginService(pluginId, serviceId, { requireEnabled: true })
    if (!service.health?.url) throw new Error('Plugin service health check is not configured')
    const nextPolicy = updateDemoPluginServiceHealthPolicy(pluginId, serviceId, policy)
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, nextPolicy.enabled ? 'Service health policy saved' : 'Service health policy cleared', `service:${serviceId}`),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    const plugin = cloneDemoPlugins().find((candidate) => candidate.id === pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    return plugin
  },
  inspectPluginPackage: async () => {
    const review = createDemoManualPluginReviewState()
    demoManualPluginSelection = review.selectionId || demoManualPluginReview.selectionId
    return {
      ...review,
      plugin: {
        ...review.plugin,
        commands: review.plugin.commands.map((command) => ({ ...command })),
        entries: clonePluginEntries(review.plugin.entries)
      },
      permissionDiff: {
        permissions: { ...review.permissionDiff.permissions },
        networkAllowlist: { ...review.permissionDiff.networkAllowlist }
      },
      signature: { ...review.signature },
      blockStatus: { ...review.blockStatus }
    }
  },
  inspectPluginGithubRepository: async (repositoryUrl) => {
    const normalizedRepositoryUrl = validateDemoGithubRepositoryUrl(repositoryUrl)
    const baseReview = createDemoManualPluginReviewState()
    const review = {
      ...baseReview,
      selectionId: 'demo-github-plugin-selection',
      sourceType: 'github',
      plugin: {
        ...baseReview.plugin,
        description: `A GitHub package sample from ${normalizedRepositoryUrl}.`
      }
    }
    demoManualPluginSelection = review.selectionId || demoManualPluginReview.selectionId
    return {
      ...review,
      plugin: {
        ...review.plugin,
        commands: review.plugin.commands.map((command) => ({ ...command })),
        entries: clonePluginEntries(review.plugin.entries)
      },
      permissionDiff: {
        permissions: { ...review.permissionDiff.permissions },
        networkAllowlist: { ...review.permissionDiff.networkAllowlist }
      },
      signature: { ...review.signature },
      blockStatus: { ...review.blockStatus }
    }
  },
  clearPluginSelection: async (selectionId) => {
    if (!selectionId || demoManualPluginSelection === selectionId) demoManualPluginSelection = null
    return { ok: true }
  },
  installPlugin: async (selectionId) => {
    if (selectionId !== demoManualPluginSelection) throw new Error('Selected plugin package is no longer available')
    const review = createDemoManualPluginReviewState()
    const nextPlugin = createDemoManualPlugin(review)
    demoState.plugins = [
      nextPlugin,
      ...demoState.plugins.filter((plugin) => plugin.id !== nextPlugin.id)
    ]
    demoState.pluginLogs = [
      createDemoPluginLog(nextPlugin.id, 'Plugin installed'),
      ...demoState.pluginLogs
    ]
    demoManualPluginSelection = null
    writeDemoState()
    return { ok: true, pluginId: nextPlugin.id, installMode: review.installMode, disabled: true, plugins: cloneDemoPlugins() }
  },
  updatePlugin: async (selectionId) => {
    if (selectionId !== demoManualPluginSelection) throw new Error('Selected plugin package is no longer available')
    const review = createDemoManualPluginReviewState()
    if (review.installMode !== 'update') throw new Error('Plugin is not installed yet')
    const existingPlugin = getDemoPluginById(review.plugin.id)
    if (!existingPlugin) throw new Error(`Plugin not found: ${review.plugin.id}`)
    const nextPlugin = createDemoManualPlugin(review, existingPlugin)
    demoState.plugins = [
      nextPlugin,
      ...demoState.plugins.filter((plugin) => plugin.id !== nextPlugin.id)
    ]
    demoState.pluginLogs = [
      createDemoPluginLog(nextPlugin.id, 'Plugin updated'),
      ...demoState.pluginLogs
    ]
    demoManualPluginSelection = null
    writeDemoState()
    return { ok: true, pluginId: nextPlugin.id, installMode: 'update', disabled: true, plugins: cloneDemoPlugins() }
  },
  uninstallPlugin: async (pluginId, options?: PluginUninstallOptions) => {
    const existingPlugin = getDemoPluginById(pluginId)
    if (!existingPlugin) throw new Error(`Plugin not found: ${pluginId}`)
    demoState.plugins = demoState.plugins.filter((plugin) => plugin.id !== pluginId)
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, options?.removeStorage ? 'Plugin uninstalled and storage removed' : 'Plugin uninstalled'),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    return {
      ok: true,
      pluginId,
      storageRemoved: Boolean(options?.removeStorage),
      plugins: cloneDemoPlugins()
    }
  },
  getPluginLogs: async (filters) => paginateEntries(cloneDemoPluginLogs(filters), filters || {}),
  exportPluginLogs: async (filters) => exportDemoPluginLogs(cloneDemoPluginLogs(filters), filters?.format),
  clearPluginLogs: async () => {
    demoState.pluginLogs = []
    writeDemoState()
    return []
  },
  clearPluginStorage: async (pluginId) => {
    demoState.plugins = demoState.plugins.map((plugin) => (
      plugin.id === pluginId
        ? {
            ...plugin,
            storage: {
              ...(plugin.storage || {}),
              keyCount: 0,
              byteSize: 0
            }
          }
        : plugin
    ))
    demoState.pluginLogs = [
      createDemoPluginLog(pluginId, 'Plugin storage cleared'),
      ...demoState.pluginLogs
    ]
    writeDemoState()
    const plugin = getDemoPluginById(pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    return plugin
  },
  getServiceStatus: async () => cloneServiceStatus(demoState.serviceStatus),
  saveServiceConfig: async (config) => {
    const nextConfig = normalizeDemoServiceConfig(demoState.serviceStatus.config, config)
    if (
      nextConfig.enabled &&
      (!Number.isInteger(nextConfig.port) || nextConfig.port < 0 || nextConfig.port > 65535)
    ) {
      throw new Error('Local HTTP service port must be between 0 and 65535')
    }
    demoState.serviceStatus = cloneServiceStatus({
      config: nextConfig,
      runtime: {
        ...demoState.serviceStatus.runtime,
        host: nextConfig.host || '127.0.0.1',
        port: nextConfig.port,
        enabled: nextConfig.enabled
      }
    })
    demoState.serviceStatus = cloneServiceStatus({
      ...demoState.serviceStatus,
      config: {
        ...demoState.serviceStatus.config,
        logs: [
          createDemoServiceLogEntry({
            method: 'POST',
            path: nextConfig.enabled ? '/service/start' : '/service/stop',
            statusCode: 200
          }),
          ...demoState.serviceStatus.config.logs
        ]
      }
    })
    writeDemoState()
    return cloneServiceStatus(demoState.serviceStatus)
  },
  getServiceLogs: async (filters) => paginateEntries(
    filterDemoServiceLogs(cloneServiceStatus(demoState.serviceStatus).config.logs, filters),
    filters || {}
  ),
  exportServiceLogs: async (filters) => exportDemoServiceLogs(
    filterDemoServiceLogs(cloneServiceStatus(demoState.serviceStatus).config.logs, filters),
    filters?.format
  ),
  clearServiceLogs: async () => {
    demoState.serviceStatus = cloneServiceStatus({
      ...demoState.serviceStatus,
      config: {
        ...demoState.serviceStatus.config,
        logs: []
      }
    })
    writeDemoState()
    return []
  },
  rotateServiceToken: async () => {
    demoState.serviceStatus = cloneServiceStatus({
      ...demoState.serviceStatus,
      config: {
        ...demoState.serviceStatus.config,
        token: 'demo-token-rotated',
        logs: [
          createDemoServiceLogEntry({
            method: 'POST',
            path: '/service/token/rotate',
            statusCode: 200
          }),
          ...demoState.serviceStatus.config.logs
        ]
      },
      runtime: {
        ...demoState.serviceStatus.runtime,
        mcp: { ...demoState.serviceStatus.runtime.mcp, activeSessions: 0 }
      }
    })
    writeDemoState()
    return cloneServiceStatus(demoState.serviceStatus)
  },
  revokeMcpSessions: async () => {
    demoState.serviceStatus = cloneServiceStatus({
      ...demoState.serviceStatus,
      config: {
        ...demoState.serviceStatus.config,
        logs: [
          createDemoServiceLogEntry({
            method: 'POST',
            path: '/service/mcp/revoke',
            statusCode: 200
          }),
          ...demoState.serviceStatus.config.logs
        ]
      },
      runtime: {
        ...demoState.serviceStatus.runtime,
        mcp: { ...demoState.serviceStatus.runtime.mcp, activeSessions: 0 }
      }
    })
    writeDemoState()
    return cloneServiceStatus(demoState.serviceStatus)
  },
  getAboutInfo: async () => defaultAboutInfo,
  checkForUpdates: async () => ({
    ...defaultUpdateCheck,
    status: 'not-configured',
    message: 'Update feed is not configured.'
  }),
  getCatalog: async () => cloneCatalog(demoState.catalog),
  prepareCatalogInstall: async ({ kind, itemId }) => {
    const item = findDemoCatalogItem(kind, itemId)
    if (!item) throw new Error('Catalog item not found')
    const selectionId = `demo-catalog-selection-${kind}-${itemId}`
    const selection: CatalogInstallSelection = kind === 'plugin' ? {
      kind,
      itemId,
      selectionId,
      sourcePackageHash: item.sha256 || demoCatalogHash,
      pluginReview: createDemoPluginReview(item as CatalogPluginEntry)
    } : {
      kind,
      itemId,
      selectionId,
      sourcePackageHash: item.sha256 || demoCatalogHash,
      petPackReview: createDemoPetPackReview(item as CatalogPetPackEntry)
    }
    demoCatalogSelections.set(selectionId, selection)
    return selection
  },
  installCatalogSelection: async (selectionId) => {
    const selection = demoCatalogSelections.get(selectionId)
    if (!selection) throw new Error('Catalog selection is no longer available')
    demoCatalogSelections.delete(selectionId)
    if (selection.kind === 'plugin') {
      return {
        ok: true,
        kind: selection.kind,
        itemId: selection.itemId,
        catalog: markDemoCatalogItemInstalled(selection),
        plugins: installDemoCatalogPlugin(selection)
      }
    }
    const petPacks = installDemoCatalogPetPack(selection)
    return {
      ok: true,
      kind: selection.kind,
      itemId: selection.itemId,
      catalog: markDemoCatalogItemInstalled(selection),
      petPacks,
      ...(petPacks.activePackId === selection.itemId ? { animations: cloneActionsConfig(demoState.actionsConfig) } : {})
    }
  },
  clearCatalogSelection: async (selectionId) => {
    demoCatalogSelections.delete(selectionId)
    return { ok: true }
  },
  addCatalogBlocklistEntry: async (entry) => {
    const blocklistKey = entry.type === 'packId' ? 'packIds' : entry.type === 'sha256' ? 'sha256' : 'pluginIds'
    const value = String(entry.value || '').trim()
    const localBlocklist = {
      ...demoState.catalog.localBlocklist,
      [blocklistKey]: value && !demoState.catalog.localBlocklist[blocklistKey].includes(value)
        ? [...demoState.catalog.localBlocklist[blocklistKey], value]
        : demoState.catalog.localBlocklist[blocklistKey]
    }
    demoState.catalog = cloneCatalog({ ...demoState.catalog, localBlocklist })
    writeDemoState()
    return { catalog: cloneCatalog(demoState.catalog), blocklist: demoState.catalog.localBlocklist }
  },
  removeCatalogBlocklistEntry: async (entry) => {
    const blocklistKey = entry.type === 'packId' ? 'packIds' : entry.type === 'sha256' ? 'sha256' : 'pluginIds'
    const value = String(entry.value || '').trim()
    const localBlocklist = {
      ...demoState.catalog.localBlocklist,
      [blocklistKey]: demoState.catalog.localBlocklist[blocklistKey].filter((candidate) => candidate !== value)
    }
    demoState.catalog = cloneCatalog({ ...demoState.catalog, localBlocklist })
    writeDemoState()
    return { catalog: cloneCatalog(demoState.catalog), blocklist: demoState.catalog.localBlocklist }
  },
  close: () => {}
}

demoApi = demoControlCenterAPI

if (typeof window !== 'undefined' && !window.controlCenterAPI) {
  window.controlCenterAPI = demoControlCenterAPI
}
