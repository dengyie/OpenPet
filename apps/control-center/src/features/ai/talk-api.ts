import { z } from 'zod'
import { aiBehaviorConfigPatchSchema, aiBehaviorDryRunPayloadSchema } from '@openpet/contracts'

import { backendClient, backendTransport } from '../../api/backend-client.ts'
import type { ApiClient } from '../../api/client.ts'
import type {
  AiMemoryProfileViewState,
  AiConfigSaveRequest,
  AiConfigViewState,
  AiBehaviorConfig,
  AiBehaviorResult,
  AiChatResponse,
  AiConnectionTestResult,
  AiSaveApiKeyResult,
  AiPersonaDraftViewState,
  AiPersonaOverride,
  AiPersonaProfileViewState,
  AiTalkTraceSummaryViewState,
  HatchPetAgentCapabilityResult,
  HatchPetAgentConfigSaveRequest,
  HatchPetAgentConfigView,
  HatchPetAgentRunStatus,
  ImageGenerationConfigSaveRequest,
  ImageGenerationConfigViewState,
  ImageGenerationHealthCheckResult,
  ImageGenerationSaveApiKeyResult,
  ProviderModelDiscoveryResult,
} from '@openpet/shared/src/openpet-contracts.ts'

type AiBehaviorDryRunPayload = z.input<typeof aiBehaviorDryRunPayloadSchema>

const personaSchema = z.object({
  name: z.string(),
  identity: z.string(),
  tone: z.string(),
  coreTraits: z.array(z.string()),
  speakingStyle: z.string(),
  relationshipToUser: z.string(),
  actionStyle: z.string(),
  boundaries: z.array(z.string()),
})
const personaOverrideSchema = z.object({
  name: z.string().optional(),
  identity: z.string().optional(),
  tone: z.string().optional(),
  coreTraits: z.array(z.string()).optional(),
  speakingStyle: z.string().optional(),
  relationshipToUser: z.string().optional(),
  actionStyle: z.string().optional(),
  boundaries: z.array(z.string()).optional(),
}).strict()
const personaSaveSchema = z.object({ override: personaOverrideSchema }).strict()
const personaDraftSchema = z.object({ instruction: z.string().max(2000) }).strict()
const personaProfileSchema = z.object({
  petPackId: z.string(), petPackDisplayName: z.string(),
  packPersona: personaSchema, overridePersona: personaOverrideSchema, effectivePersona: personaSchema,
  compiledPersonaPrompt: z.string(), compiledSystemPrompt: z.string(),
})
const personaDraftResponseSchema = z.object({
  petPackId: z.string(), petPackDisplayName: z.string(), draftPersona: personaOverrideSchema, compiledPersonaPrompt: z.string(),
})
const memoryItemSchema = z.object({
  id: z.string(), scope: z.enum(['global', 'petPack']), petPackId: z.string(), text: z.string(), tags: z.array(z.string()),
  confidence: z.number(), importance: z.number(), sourceConversationId: z.string(), sourceMessageIds: z.array(z.string()),
  createdAt: z.string(), updatedAt: z.string(), lastUsedAt: z.string(), lastEvidenceAt: z.string(), useCount: z.number().int(),
  status: z.enum(['active', 'superseded', 'deleted']), supersedes: z.string(), reason: z.string(),
})
const memoryProfileSchema = z.object({
  petPackId: z.string(), petPackDisplayName: z.string(), globalMemories: z.array(memoryItemSchema),
  petPackMemories: z.array(memoryItemSchema),
  recentJobs: z.array(z.object({
    id: z.string(), petPackId: z.string(), conversationId: z.string(), status: z.string(), createdAt: z.string(),
    updatedAt: z.string(), errorCode: z.string(), appliedCount: z.number().int(), filteredCount: z.number().int(),
  })),
})
const modelCatalogSchema = z.object({ cacheKey: z.string(), models: z.array(z.string()), fetchedAt: z.string(), source: z.enum(['none', 'saved']) })
const behaviorSchema = z.object({ enabled: z.boolean(), useTools: z.boolean(), cooldownMs: z.number().int().nonnegative(), rules: z.array(z.unknown()), decisions: z.array(z.unknown()) }).passthrough()
const visionSchema = z.object({
  mode: z.enum(['follow-chat', 'override']), provider: z.string(), baseUrl: z.string(), model: z.string(), apiKeyRef: z.string(),
  hasApiKey: z.boolean(), modelCatalog: modelCatalogSchema, effectiveProvider: z.string(), effectiveBaseUrl: z.string(),
  effectiveModel: z.string(), effectiveHasApiKey: z.boolean(),
}).passthrough()
const aiConfigSchema = z.object({
  enabled: z.boolean(), provider: z.string(), baseUrl: z.string(), model: z.string(), apiKeyRef: z.string(), systemPrompt: z.string(),
  memory: z.object({ enabled: z.boolean() }), behavior: behaviorSchema, vision: visionSchema, hasApiKey: z.boolean(), modelCatalog: modelCatalogSchema,
}).passthrough()
const aiConfigPatchSchema = z.object({ config: z.object({
  enabled: z.boolean().optional(), provider: z.string().optional(), baseUrl: z.string().optional(), model: z.string().optional(),
  systemPrompt: z.string().optional(), memory: z.object({ enabled: z.boolean() }).strict().optional(),
  vision: z.object({ mode: z.enum(['follow-chat', 'override']).optional(), provider: z.string().optional(), baseUrl: z.string().optional(), model: z.string().optional() }).strict().optional(),
}).strict() }).strict() as unknown as z.ZodType<{ config: AiConfigSaveRequest }>
const connectionTestSchema = z.object({
  ok: z.boolean(), provider: z.string(), baseUrl: z.string(), model: z.string(), hasApiKey: z.boolean(), elapsedMs: z.number().nonnegative(),
  reply: z.string().optional(), code: z.string().optional(), message: z.string().optional(),
  modelsProbe: z.enum(['ok', 'unavailable', 'failed', 'timed_out', 'rate_limited', 'provider_unavailable']).optional(), modelsProbeMessage: z.string().max(240).optional(), availableModels: z.array(z.string()).optional(), currentModelDiscovered: z.boolean().optional(),
}).passthrough()
const discoverySchema = z.object({ ok: z.boolean(), provider: z.string(), baseUrl: z.string(), model: z.string(), hasApiKey: z.boolean(), models: z.array(z.string()), code: z.string(), message: z.string() }).passthrough()
const keyResultSchema = z.object({ configured: z.boolean(), maskedTail: z.string() }).passthrough()
const imageModelCatalogSchema = z.object({ cacheKey: z.string(), models: z.array(z.string()), fetchedAt: z.string(), source: z.enum(['none', 'saved']) }).strict()
const imageConfigSchema = z.object({
  provider: z.string(), baseUrl: z.string(), model: z.string(), apiKeyRef: z.string(), organization: z.string(), project: z.string(),
  timeoutMs: z.number().int().nonnegative(), maxConcurrentJobs: z.number().int().nonnegative(), hasApiKey: z.boolean(),
  apiKeyPreview: z.string(), apiKeyLabel: z.string(), modelCatalog: imageModelCatalogSchema,
}).strict()
const imageConfigPatchSchema = z.object({ config: z.object({
  provider: z.enum(['openai-compatible', 'openai']).optional(), baseUrl: z.string().max(2000).optional(), model: z.string().max(2000).optional(),
  organization: z.string().max(2000).optional(), project: z.string().max(2000).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional(), maxConcurrentJobs: z.number().int().min(1).max(8).optional(),
}).strict() }).strict() as unknown as z.ZodType<{ config: ImageGenerationConfigSaveRequest }>
const imageKeyResultSchema = z.object({ apiKeyRef: z.string(), hasApiKey: z.boolean(), apiKeyPreview: z.string() }).strict()
const emptySchema = z.object({}).strict()
const unknownObjectSchema = z.record(z.string(), z.unknown())
const behaviorConfigSchema = z.object({
  enabled: z.boolean(), useTools: z.boolean(), cooldownMs: z.number().int().nonnegative(),
  rules: z.array(z.unknown()), decisions: z.array(z.unknown()),
}).strict()
const behaviorResultSchema = z.object({ matched: z.boolean(), reason: z.string() }).passthrough()
const hatchConfigSchema = z.record(z.string(), z.unknown())
const hatchConfigSaveSchema = z.object({
  enabled: z.boolean().optional(),
  configMode: z.enum(['follow-chat', 'override']).optional(),
  provider: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  requireIdentityReviewBeforeActions: z.boolean().optional(),
  budgets: z.object({
    maxIdentityRegenerations: z.number().optional(),
    maxActionAttemptsPerAction: z.number().optional(),
    maxEvaluationAttemptsPerArtifact: z.number().optional(),
    maxProviderCalls: z.number().optional(),
    maxElapsedMs: z.number().optional(),
    maxEstimatedCost: z.number().nullable().optional(),
  }).strict().optional(),
}).strict()
const hatchConfigPatchSchema = z.object({ config: hatchConfigSaveSchema }).strict() as unknown as z.ZodType<{ config: HatchPetAgentConfigSaveRequest }>
const hatchKeyResultSchema = z.object({ apiKeyRef: z.string(), hasApiKey: z.boolean(), updatedAt: z.string().optional() }).strict()
const hatchCapabilitySchema = z.object({ ok: z.boolean(), code: z.string(), message: z.string(), provider: z.string(), model: z.string(), elapsedMs: z.number().nonnegative() }).passthrough()
const hatchRunStatusSchema = z.record(z.string(), z.unknown())
const behaviorDiagnosticsSchema = z.object({ content: z.string() }).strict()
const behaviorDecisionListSchema = z.array(z.unknown())
const chatResponseSchema = z.object({
  conversationId: z.string().min(1),
  reply: z.string(),
  messages: z.array(z.record(z.string(), z.unknown())).optional(),
  bubble: z.record(z.string(), z.unknown()).optional(),
  bubbleSegments: z.array(z.string()).optional(),
  behaviorIntent: z.unknown().optional(),
  behavior: z.record(z.string(), z.unknown()).optional(),
  state: z.record(z.string(), z.unknown()).optional(),
  action: z.object({ actionId: z.string().optional(), label: z.string().optional(), error: z.string().optional() }).strict().optional(),
  requestId: z.string().optional(),
  providerLatencyMs: z.number().nonnegative().optional(),
  canceled: z.boolean().optional(),
  partialReply: z.string().optional(),
}).strict()
const conversationListSchema = z.object({ conversations: z.array(unknownObjectSchema) }).strict()
const chatPayloadSchema = z.object({
  message: z.string().min(1).max(4000), conversationId: z.string().optional(),
  entrypoint: z.string().optional(), requestId: z.string().optional(),
}).strict()
const traceExportSchema = z.string()
const jobAcceptedSchema = z.object({ jobId: z.string().min(1) }).strict()

type AiChatPayload = z.infer<typeof chatPayloadSchema>
type ChatSseHandlers = { onDelta?: (delta: string) => void; signal?: AbortSignal }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function postChat(payload: AiChatPayload, { onDelta, signal }: ChatSseHandlers = {}) {
  const response = await backendTransport.request<Response>({
    path: '/ai/chat',
    method: 'POST',
    headers: {
      accept: 'text/event-stream',
      'content-type': 'application/json',
      'x-client': 'control-center',
      'x-request-id': 'ai_' + crypto.randomUUID(),
    },
    body: JSON.stringify(chatPayloadSchema.parse(payload)),
    signal: signal || AbortSignal.timeout(60_000),
  })
  if (!response.ok || !response.body) {
    let message = `AI chat request failed (HTTP ${response.status})`
    try {
      const failure = await response.json() as { error?: { message?: string } }
      message = failure.error?.message || message
    } catch {}
    throw new Error(message)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let result: Record<string, unknown> | null = null
  let streamFailed = false
  const consumeFrame = (frame: string) => {
    const lines = frame.split(/\r?\n/)
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
    const dataLines = lines.filter((line) => line.startsWith('data:'))
    if (!event && dataLines.length === 0) return
    if (result) throw new Error('AI chat stream contains data after the terminal event')
    if (!event || dataLines.length === 0) throw new Error('AI chat stream contains an invalid event frame')
    const data = dataLines.map((line) => line.slice(5).trim()).join('\n')
    let value: unknown
    try {
      value = JSON.parse(data)
    } catch {
      throw new Error(`AI chat stream contains invalid JSON in ${event}`)
    }
    if (!isRecord(value)) throw new Error(`AI chat stream contains an invalid ${event} payload`)
    if (event === 'ai.chat-delta') {
      if (Object.keys(value).some((key) => key !== 'conversationId' && key !== 'delta') || typeof value.conversationId !== 'string' || !value.conversationId.trim() || typeof value.delta !== 'string') {
        throw new Error('AI chat stream contains an invalid delta')
      }
      onDelta?.(value.delta)
      return
    }
    if (event === 'ai.chat-done') {
      const parsed = chatResponseSchema.safeParse(value)
      if (!parsed.success) {
        throw new Error('AI chat stream contains an invalid terminal response')
      }
      result = parsed.data
      return
    }
    throw new Error(`AI chat stream contains an unsupported event: ${event}`)
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      pending += decoder.decode(value, { stream: !done })
      const frames = pending.split(/\r?\n\r?\n/)
      pending = frames.pop() || ''
      for (const frame of frames) consumeFrame(frame)
      if (done) break
    }
    if (pending.trim()) consumeFrame(pending)
  } catch (error) {
    streamFailed = true
    throw error
  } finally {
    if (signal?.aborted || !result || streamFailed) {
      await reader.cancel().catch(() => undefined)
    }
    reader.releaseLock()
  }
  if (!result) throw new Error('AI chat stream ended without a terminal event')
  return result as unknown as AiChatResponse
}

export function createAiTalkHttpApi(client: ApiClient = backendClient) {
  return {
    getImageConfig: () => client.request({ method: 'GET', path: '/ai/images/config', responseSchema: imageConfigSchema }) as Promise<ImageGenerationConfigViewState>,
    saveImageConfig: (config: ImageGenerationConfigSaveRequest) => client.request({
      method: 'PATCH', path: '/ai/images/config', requestSchema: imageConfigPatchSchema, body: { config }, responseSchema: imageConfigSchema, retry: false,
    }) as Promise<ImageGenerationConfigViewState>,
    saveImageApiKey: (apiKey: string) => client.request({
      method: 'PUT', path: '/ai/images/key', requestSchema: z.object({ apiKey: z.string().min(1) }).strict(), body: { apiKey }, responseSchema: imageKeyResultSchema, retry: false,
    }) as Promise<ImageGenerationSaveApiKeyResult>,
    clearImageApiKey: () => client.request({ method: 'DELETE', path: '/ai/images/key', responseSchema: imageKeyResultSchema, retry: false }) as Promise<ImageGenerationSaveApiKeyResult>,
    getConfig: () => client.request({ method: 'GET', path: '/ai/config', responseSchema: aiConfigSchema }) as Promise<AiConfigViewState>,
    saveConfig: (config: AiConfigSaveRequest) => client.request({ method: 'PATCH', path: '/ai/config', requestSchema: aiConfigPatchSchema, body: { config }, responseSchema: aiConfigSchema, retry: false }) as Promise<AiConfigViewState>,
    testProvider: () => client.request({ method: 'POST', path: '/ai/providers/chat/test', requestSchema: emptySchema, body: {}, responseSchema: connectionTestSchema, retry: false, timeoutMs: 60_000 }) as Promise<AiConnectionTestResult>,
    discoverModels: (provider: 'chat' | 'vision' = 'chat') => client.request({ method: 'GET', path: `/ai/providers/${provider}/models`, responseSchema: discoverySchema }),
    saveApiKey: async (providerId: 'ai.default' | 'ai.vision', apiKey: string): Promise<AiSaveApiKeyResult> => {
      const result = await client.request({ method: 'PUT', path: `/ai/providers/${providerId}/key`, requestSchema: z.object({ apiKey: z.string().min(1) }).strict(), body: { apiKey }, responseSchema: keyResultSchema, retry: false })
      return { apiKeyRef: providerId, hasApiKey: result.configured }
    },
    clearApiKey: async (providerId: 'ai.default' | 'ai.vision'): Promise<AiSaveApiKeyResult> => {
      const result = await client.request({ method: 'DELETE', path: `/ai/providers/${providerId}/key`, responseSchema: keyResultSchema, retry: false })
      return { apiKeyRef: providerId, hasApiKey: result.configured }
    },
    getPersona: () => client.request({ method: 'GET', path: '/ai/persona', responseSchema: personaProfileSchema }) as Promise<AiPersonaProfileViewState>,
    savePersona: (override: AiPersonaOverride) => client.request({
      method: 'PUT', path: '/ai/persona', requestSchema: personaSaveSchema, body: { override }, responseSchema: personaProfileSchema, retry: false,
    }) as Promise<AiPersonaProfileViewState>,
    generatePersonaDraft: (instruction: string) => client.request({
      method: 'POST', path: '/ai/persona/draft', requestSchema: personaDraftSchema, body: { instruction }, responseSchema: personaDraftResponseSchema, retry: false, timeoutMs: 60_000,
    }) as Promise<AiPersonaDraftViewState>,
    getMemoryProfile: () => client.request({ method: 'GET', path: '/ai/memories', responseSchema: memoryProfileSchema }) as Promise<AiMemoryProfileViewState>,
    deleteMemory: (memoryId: string) => client.request({
      method: 'DELETE', path: `/ai/memories/${encodeURIComponent(memoryId)}`, responseSchema: memoryProfileSchema, retry: false,
    }) as Promise<AiMemoryProfileViewState>,
    clearPetPackMemories: () => client.request({
      method: 'DELETE', path: '/ai/memories/pet-pack', responseSchema: memoryProfileSchema, retry: false,
    }) as Promise<AiMemoryProfileViewState>,
    chat: (payload: AiChatPayload, handlers?: ChatSseHandlers) => postChat(payload, handlers),
    listConversations: (filters: { entrypoint?: string; petPackId?: string } = {}) => client.request({
      method: 'GET', path: `/ai/conversations?entrypoint=${encodeURIComponent(filters.entrypoint || 'control-center')}&petPackId=${encodeURIComponent(filters.petPackId || '')}`,
      responseSchema: conversationListSchema,
    }),
    getConversation: (conversationId: string) => client.request({
      method: 'GET', path: `/ai/conversations/${encodeURIComponent(conversationId)}`, responseSchema: unknownObjectSchema,
    }),
    deleteConversation: (conversationId: string) => client.request({
      method: 'DELETE', path: `/ai/conversations/${encodeURIComponent(conversationId)}`, responseSchema: unknownObjectSchema, retry: false,
    }),
    getBehavior: () => client.request({ method: 'GET', path: '/ai/behavior', responseSchema: behaviorConfigSchema }) as unknown as Promise<AiBehaviorConfig>,
    saveBehavior: (config: Pick<AiBehaviorConfig, 'enabled' | 'useTools' | 'cooldownMs' | 'rules'>) => client.request({
      method: 'PATCH', path: '/ai/behavior',
      requestSchema: z.object({ config: aiBehaviorConfigPatchSchema }).strict() as unknown as z.ZodType<{ config: Pick<AiBehaviorConfig, 'enabled' | 'useTools' | 'cooldownMs' | 'rules'> }>,
      body: { config }, responseSchema: behaviorConfigSchema, retry: false,
    }) as unknown as Promise<AiBehaviorConfig>,
    dryRunBehavior: (input: AiBehaviorDryRunPayload) => client.request({
      method: 'POST', path: '/ai/behavior/dry-run', requestSchema: aiBehaviorDryRunPayloadSchema,
      body: input, responseSchema: behaviorResultSchema, retry: false,
    }) as Promise<AiBehaviorResult>,
    replayBehaviorDecision: (decisionId: number) => client.request({
      method: 'POST', path: `/ai/behavior/decisions/${encodeURIComponent(String(decisionId))}/replay`,
      requestSchema: emptySchema, body: {}, responseSchema: behaviorResultSchema, retry: false,
    }) as Promise<AiBehaviorResult>,
    exportBehaviorDiagnostics: async () => {
      const result = await client.request({ method: 'GET', path: '/ai/behavior/diagnostics', responseSchema: behaviorDiagnosticsSchema, retry: false })
      return result.content
    },
    clearBehaviorDecisions: () => client.request({
      method: 'DELETE', path: '/ai/behavior/decisions', responseSchema: behaviorDecisionListSchema, retry: false,
    }) as Promise<AiBehaviorConfig['decisions']>,
    getTrace: (conversationId = '') => client.request({
      method: 'GET', path: `/ai/traces?conversationId=${encodeURIComponent(conversationId)}`, responseSchema: unknownObjectSchema,
    }) as unknown as Promise<AiTalkTraceSummaryViewState>,
    exportTrace: (filters: { petPackId?: string; conversationId?: string } = {}) => client.request({
      method: 'POST', path: '/ai/traces/export', requestSchema: z.object({ filters: z.object({ petPackId: z.string().optional(), conversationId: z.string().optional() }).strict() }).strict(),
      body: { filters }, responseSchema: traceExportSchema, retry: false, timeoutMs: 60_000,
    }),
    getHatchAgents: () => client.request({ method: 'GET', path: '/ai/hatch/agents', responseSchema: unknownObjectSchema, retry: false, timeoutMs: 60_000 }),
    getHatchConfig: () => client.request({ method: 'GET', path: '/ai/hatch/config', responseSchema: hatchConfigSchema, retry: false }) as unknown as Promise<HatchPetAgentConfigView>,
    saveHatchConfig: (config: HatchPetAgentConfigSaveRequest) => client.request({
      method: 'PATCH', path: '/ai/hatch/config',
      requestSchema: hatchConfigPatchSchema, body: { config }, responseSchema: hatchConfigSchema, retry: false,
    }) as unknown as Promise<HatchPetAgentConfigView>,
    saveHatchApiKey: (apiKey: string) => client.request({
      method: 'PUT', path: '/ai/hatch/key', requestSchema: z.object({ apiKey: z.string().min(1).max(4096) }).strict(),
      body: { apiKey }, responseSchema: hatchKeyResultSchema, retry: false,
    }),
    clearHatchApiKey: () => client.request({ method: 'DELETE', path: '/ai/hatch/key', responseSchema: hatchKeyResultSchema, retry: false }),
    checkHatchCapability: () => client.request({
      method: 'POST', path: '/ai/hatch/capability', requestSchema: emptySchema, body: {}, responseSchema: hatchCapabilitySchema, retry: false, timeoutMs: 60_000,
    }) as Promise<HatchPetAgentCapabilityResult>,
    getHatchRunStatus: (runId: string) => client.request({
      method: 'GET', path: `/ai/hatch/runs/${encodeURIComponent(runId)}`, responseSchema: hatchRunStatusSchema, retry: false,
    }) as unknown as Promise<HatchPetAgentRunStatus>,
    startHatch: (input: Record<string, unknown>) => client.request({
      method: 'POST', path: '/ai/hatch/start', requestSchema: unknownObjectSchema, body: input, responseSchema: jobAcceptedSchema, retry: false,
    }),
    getHatchBudget: (runId: string) => client.request({
      method: 'GET', path: `/ai/hatch/budget?runId=${encodeURIComponent(runId)}`, responseSchema: unknownObjectSchema,
    }),
    checkImageHealth: () => client.request({ method: 'GET', path: '/ai/images/health', responseSchema: unknownObjectSchema, retry: false, timeoutMs: 60_000 }) as unknown as Promise<ImageGenerationHealthCheckResult>,
    discoverImageModels: () => client.request({ method: 'GET', path: '/ai/images/models', responseSchema: unknownObjectSchema, retry: false, timeoutMs: 60_000 }) as unknown as Promise<ProviderModelDiscoveryResult>,
  }
}

const httpApi = createAiTalkHttpApi()
const useDemoApi = () => import.meta.env?.DEV === true && !Boolean((globalThis as { openpetBackend?: unknown }).openpetBackend)
type DemoTalkApi = typeof import('../../api/demo-control-center-api.ts').demoControlCenterAPI
const getDemoTalkApi = async (): Promise<DemoTalkApi> => (await import('../../api/demo-control-center-api.ts')).demoControlCenterAPI as DemoTalkApi
const fromDemo = <T>(operation: (api: DemoTalkApi) => Promise<T>): Promise<T> => getDemoTalkApi().then(operation)
const demoTalkApi = {
  clearAiApiKey: () => fromDemo((api) => api.clearAiApiKey()),
}

export const aiTalkApi = {
  getImageConfig: () => useDemoApi()
    ? fromDemo((api) => api.getImageGenerationConfig())
    : httpApi.getImageConfig(),
  saveImageConfig: (config: ImageGenerationConfigSaveRequest) => useDemoApi()
    ? fromDemo((api) => api.saveImageGenerationConfig(config))
    : httpApi.saveImageConfig(config),
  saveImageApiKey: (apiKey: string) => useDemoApi()
    ? fromDemo((api) => api.saveImageGenerationApiKey(apiKey))
    : httpApi.saveImageApiKey(apiKey),
  clearImageApiKey: () => useDemoApi()
    ? fromDemo((api) => api.clearImageGenerationApiKey())
    : httpApi.clearImageApiKey(),
  getConfig: () => useDemoApi() ? fromDemo((api) => api.getAiConfig()) : httpApi.getConfig(),
  saveConfig: (config: AiConfigSaveRequest) => useDemoApi() ? fromDemo((api) => api.saveAiConfig(config)) : httpApi.saveConfig(config),
  testProvider: () => useDemoApi() ? fromDemo((api) => api.testAiConnection()) : httpApi.testProvider(),
  discoverModels: (provider: 'chat' | 'vision' = 'chat') => useDemoApi()
    ? fromDemo((api) => provider === 'vision' ? api.discoverAiVisionModels() : api.discoverAiModels())
    : httpApi.discoverModels(provider),
  saveApiKey: (providerId: 'ai.default' | 'ai.vision', apiKey: string) => useDemoApi()
    ? fromDemo((api) => providerId === 'ai.vision' ? api.saveAiVisionApiKey(apiKey) : api.saveAiApiKey(apiKey))
    : httpApi.saveApiKey(providerId, apiKey),
  clearApiKey: (providerId: 'ai.default' | 'ai.vision') => useDemoApi()
    ? providerId === 'ai.vision'
      ? fromDemo((api) => api.clearAiVisionApiKey())
      : demoTalkApi.clearAiApiKey()
    : httpApi.clearApiKey(providerId),
  getPersona: () => useDemoApi() ? fromDemo((api) => api.getAiPersonaProfile()) : httpApi.getPersona(),
  savePersona: (override: AiPersonaOverride) => useDemoApi() ? fromDemo((api) => api.saveAiPersonaOverride(override)) : httpApi.savePersona(override),
  generatePersonaDraft: (instruction: string) => useDemoApi() ? fromDemo((api) => api.generateAiPersonaDraft({ instruction })) : httpApi.generatePersonaDraft(instruction),
  getMemoryProfile: () => useDemoApi() ? fromDemo((api) => api.getAiMemoryProfile()) : httpApi.getMemoryProfile(),
  chat: (payload: AiChatPayload, handlers?: ChatSseHandlers) => useDemoApi()
    ? fromDemo((api) => api.sendPetChatMessage(payload))
    : httpApi.chat(payload, handlers),
  listConversations: (filters?: { entrypoint?: string; petPackId?: string }) => useDemoApi()
    ? fromDemo((api) => api.listAiConversations?.(filters) || Promise.reject(new Error('Demo conversation API is unavailable')))
    : httpApi.listConversations(filters),
  getConversation: (conversationId: string) => useDemoApi()
    ? fromDemo((api) => api.getAiConversationView?.(conversationId) || Promise.reject(new Error('Demo conversation API is unavailable')))
    : httpApi.getConversation(conversationId),
  deleteConversation: (conversationId: string) => useDemoApi()
    ? fromDemo((api) => api.deleteAiConversation?.(conversationId) || Promise.reject(new Error('Demo conversation API is unavailable')))
    : httpApi.deleteConversation(conversationId),
  getBehavior: () => useDemoApi() ? fromDemo((api) => api.getAiBehavior()) : httpApi.getBehavior(),
  saveBehavior: (config: Pick<AiBehaviorConfig, 'enabled' | 'useTools' | 'cooldownMs' | 'rules'>) => useDemoApi() ? fromDemo((api) => api.saveAiBehavior(config)) : httpApi.saveBehavior(config),
  dryRunBehavior: (input: AiBehaviorDryRunPayload) => useDemoApi()
    ? fromDemo((api) => api.dryRunAiBehavior({ reply: input.reply, behavior: { enabled: true, useTools: true, cooldownMs: 0, rules: input.rules || [], decisions: [] } }))
    : httpApi.dryRunBehavior(input),
  replayBehaviorDecision: (decisionId: number) => useDemoApi()
    ? fromDemo((api) => api.replayAiBehaviorDecision(decisionId))
    : httpApi.replayBehaviorDecision(decisionId),
  exportBehaviorDiagnostics: () => useDemoApi()
    ? fromDemo((api) => api.exportAiBehaviorDiagnostics())
    : httpApi.exportBehaviorDiagnostics(),
  clearBehaviorDecisions: () => useDemoApi()
    ? fromDemo((api) => api.clearAiBehaviorDecisions())
    : httpApi.clearBehaviorDecisions(),
  getTrace: (conversationId?: string) => useDemoApi() ? fromDemo((api) => api.getAiTalkTraceSummary({ conversationId })) : httpApi.getTrace(conversationId),
  exportTrace: (filters?: { petPackId?: string; conversationId?: string }) => useDemoApi()
    ? fromDemo((api) => api.exportAiTalkTraceDiagnostics(filters))
    : httpApi.exportTrace(filters),
  getHatchAgents: () => useDemoApi()
    ? fromDemo((api) => Promise.all([api.getHatchPetAgentConfig(), api.checkHatchPetAgentCapability()]))
      .then(([config, capability]) => ({ config, readiness: null, capability }))
    : httpApi.getHatchAgents(),
  getHatchConfig: () => useDemoApi() ? fromDemo((api) => api.getHatchPetAgentConfig()) : httpApi.getHatchConfig(),
  saveHatchConfig: (config: HatchPetAgentConfigSaveRequest) => useDemoApi()
    ? fromDemo((api) => api.saveHatchPetAgentConfig(config))
    : httpApi.saveHatchConfig(config),
  saveHatchApiKey: (apiKey: string) => useDemoApi()
    ? fromDemo((api) => api.saveHatchPetAgentApiKey(apiKey))
    : httpApi.saveHatchApiKey(apiKey),
  clearHatchApiKey: () => useDemoApi()
    ? fromDemo((api) => api.clearHatchPetAgentApiKey())
    : httpApi.clearHatchApiKey(),
  checkHatchCapability: () => useDemoApi()
    ? fromDemo((api) => api.checkHatchPetAgentCapability())
    : httpApi.checkHatchCapability(),
  getHatchRunStatus: (runId: string) => useDemoApi()
    ? fromDemo((api) => api.getHatchPetAgentRunStatus(runId))
    : httpApi.getHatchRunStatus(runId),
  getHatchBudget: (runId: string) => useDemoApi() ? fromDemo((api) => api.getHatchPetAgentRunStatus(runId)) : httpApi.getHatchBudget(runId),
  checkImageHealth: () => useDemoApi() ? fromDemo((api) => api.checkImageGenerationHealth({})) : httpApi.checkImageHealth(),
  discoverImageModels: () => useDemoApi() ? fromDemo((api) => api.discoverImageGenerationModels()) : httpApi.discoverImageModels(),
  deleteMemory: (memoryId: string) => useDemoApi() ? fromDemo((api) => api.deleteAiMemory(memoryId)) : httpApi.deleteMemory(memoryId),
  clearPetPackMemories: () => useDemoApi() ? fromDemo((api) => api.clearAiPetPackMemories()) : httpApi.clearPetPackMemories(),
}
