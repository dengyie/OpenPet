import * as v from 'valibot'

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

const nonNegativeInteger = () => v.pipe(v.number(), v.finite(), v.integer(), v.minValue(0))
const positiveString = () => v.pipe(v.string(), v.minLength(1))
const personaSchema = v.object({
  name: v.string(), identity: v.string(), tone: v.string(), coreTraits: v.array(v.string()),
  speakingStyle: v.string(), relationshipToUser: v.string(), actionStyle: v.string(), boundaries: v.array(v.string()),
})
const personaOverrideSchema = v.strictObject({
  name: v.optional(v.string()), identity: v.optional(v.string()), tone: v.optional(v.string()),
  coreTraits: v.optional(v.array(v.string())), speakingStyle: v.optional(v.string()),
  relationshipToUser: v.optional(v.string()), actionStyle: v.optional(v.string()), boundaries: v.optional(v.array(v.string())),
})
const personaSaveSchema = v.strictObject({ override: personaOverrideSchema })
const personaDraftSchema = v.strictObject({ instruction: v.pipe(v.string(), v.maxLength(2000)) })
const personaProfileSchema = v.object({
  petPackId: v.string(), petPackDisplayName: v.string(), packPersona: personaSchema,
  overridePersona: personaOverrideSchema, effectivePersona: personaSchema,
  compiledPersonaPrompt: v.string(), compiledSystemPrompt: v.string(),
})
const personaDraftResponseSchema = v.object({
  petPackId: v.string(), petPackDisplayName: v.string(), draftPersona: personaOverrideSchema, compiledPersonaPrompt: v.string(),
})
const memoryItemSchema = v.object({
  id: v.string(), scope: v.picklist(['global', 'petPack']), petPackId: v.string(), text: v.string(), tags: v.array(v.string()),
  confidence: v.pipe(v.number(), v.finite()), importance: v.pipe(v.number(), v.finite()), sourceConversationId: v.string(), sourceMessageIds: v.array(v.string()),
  createdAt: v.string(), updatedAt: v.string(), lastUsedAt: v.string(), lastEvidenceAt: v.string(), useCount: v.pipe(v.number(), v.finite(), v.integer()),
  status: v.picklist(['active', 'superseded', 'deleted']), supersedes: v.string(), reason: v.string(),
})
const memoryProfileSchema = v.object({
  petPackId: v.string(), petPackDisplayName: v.string(), globalMemories: v.array(memoryItemSchema), petPackMemories: v.array(memoryItemSchema),
  recentJobs: v.array(v.object({
    id: v.string(), petPackId: v.string(), conversationId: v.string(), status: v.string(), createdAt: v.string(),
    updatedAt: v.string(), errorCode: v.string(), appliedCount: v.pipe(v.number(), v.finite(), v.integer()), filteredCount: v.pipe(v.number(), v.finite(), v.integer()),
  })),
})
const modelCatalogSchema = v.object({ cacheKey: v.string(), models: v.array(v.string()), fetchedAt: v.string(), source: v.picklist(['none', 'saved']) })
const behaviorSchema = v.objectWithRest({ enabled: v.boolean(), useTools: v.boolean(), cooldownMs: nonNegativeInteger(), rules: v.array(v.unknown()), decisions: v.array(v.unknown()) }, v.unknown())
const visionSchema = v.objectWithRest({
  mode: v.picklist(['follow-chat', 'override']), provider: v.string(), baseUrl: v.string(), model: v.string(), apiKeyRef: v.string(),
  hasApiKey: v.boolean(), modelCatalog: modelCatalogSchema, effectiveProvider: v.string(), effectiveBaseUrl: v.string(),
  effectiveModel: v.string(), effectiveHasApiKey: v.boolean(),
}, v.unknown())
const aiConfigSchema = v.objectWithRest({
  enabled: v.boolean(), provider: v.string(), baseUrl: v.string(), model: v.string(), apiKeyRef: v.string(), systemPrompt: v.string(),
  memory: v.object({ enabled: v.boolean() }), behavior: behaviorSchema, vision: visionSchema, hasApiKey: v.boolean(), modelCatalog: modelCatalogSchema,
}, v.unknown())
const aiConfigPatchSchema = v.strictObject({ config: v.strictObject({
  enabled: v.optional(v.boolean()), provider: v.optional(v.string()), baseUrl: v.optional(v.string()), model: v.optional(v.string()),
  systemPrompt: v.optional(v.string()), memory: v.optional(v.strictObject({ enabled: v.boolean() })),
  vision: v.optional(v.strictObject({ mode: v.optional(v.picklist(['follow-chat', 'override'])), provider: v.optional(v.string()), baseUrl: v.optional(v.string()), model: v.optional(v.string()) })),
}) }) as v.GenericSchema<{ config: AiConfigSaveRequest }>
const connectionTestSchema = v.objectWithRest({
  ok: v.boolean(), provider: v.string(), baseUrl: v.string(), model: v.string(), hasApiKey: v.boolean(), elapsedMs: v.pipe(v.number(), v.finite(), v.minValue(0)),
  reply: v.optional(v.string()), code: v.optional(v.string()), message: v.optional(v.string()),
  modelsProbe: v.optional(v.picklist(['ok', 'unavailable', 'failed', 'timed_out', 'rate_limited', 'provider_unavailable'])),
  modelsProbeMessage: v.optional(v.pipe(v.string(), v.maxLength(240))), availableModels: v.optional(v.array(v.string())), currentModelDiscovered: v.optional(v.boolean()),
}, v.unknown())
const discoverySchema = v.objectWithRest({ ok: v.boolean(), provider: v.string(), baseUrl: v.string(), model: v.string(), hasApiKey: v.boolean(), models: v.array(v.string()), code: v.string(), message: v.string() }, v.unknown())
const keyResultSchema = v.objectWithRest({ configured: v.boolean(), maskedTail: v.string() }, v.unknown())
const imageModelCatalogSchema = v.strictObject({ cacheKey: v.string(), models: v.array(v.string()), fetchedAt: v.string(), source: v.picklist(['none', 'saved']) })
const imageConfigSchema = v.strictObject({
  provider: v.string(), baseUrl: v.string(), model: v.string(), apiKeyRef: v.string(), organization: v.string(), project: v.string(),
  timeoutMs: nonNegativeInteger(), maxConcurrentJobs: nonNegativeInteger(), hasApiKey: v.boolean(),
  apiKeyPreview: v.string(), apiKeyLabel: v.string(), modelCatalog: imageModelCatalogSchema,
})
const imageConfigPatchSchema = v.strictObject({ config: v.strictObject({
  provider: v.optional(v.picklist(['openai-compatible', 'openai'])), baseUrl: v.optional(v.pipe(v.string(), v.maxLength(2000))), model: v.optional(v.pipe(v.string(), v.maxLength(2000))),
  organization: v.optional(v.pipe(v.string(), v.maxLength(2000))), project: v.optional(v.pipe(v.string(), v.maxLength(2000))),
  timeoutMs: v.optional(v.pipe(v.number(), v.finite(), v.integer(), v.minValue(1000), v.maxValue(300000))),
  maxConcurrentJobs: v.optional(v.pipe(v.number(), v.finite(), v.integer(), v.minValue(1), v.maxValue(8))),
}) }) as v.GenericSchema<{ config: ImageGenerationConfigSaveRequest }>
const imageKeyResultSchema = v.strictObject({ apiKeyRef: v.string(), hasApiKey: v.boolean(), apiKeyPreview: v.string() })
const emptySchema = v.strictObject({})
const unknownObjectSchema = v.record(v.string(), v.unknown())
const behaviorConfigSchema = v.strictObject({ enabled: v.boolean(), useTools: v.boolean(), cooldownMs: nonNegativeInteger(), rules: v.array(v.unknown()), decisions: v.array(v.unknown()) })
const behaviorResultSchema = v.objectWithRest({ matched: v.boolean(), reason: v.string() }, v.unknown())
const hatchConfigSchema = v.record(v.string(), v.unknown())
const hatchConfigSaveSchema = v.strictObject({
  enabled: v.optional(v.boolean()), configMode: v.optional(v.picklist(['follow-chat', 'override'])), provider: v.optional(v.string()),
  baseUrl: v.optional(v.string()), model: v.optional(v.string()), requireIdentityReviewBeforeActions: v.optional(v.boolean()),
  budgets: v.optional(v.strictObject({
    maxIdentityRegenerations: v.optional(v.pipe(v.number(), v.finite())), maxActionAttemptsPerAction: v.optional(v.pipe(v.number(), v.finite())),
    maxEvaluationAttemptsPerArtifact: v.optional(v.pipe(v.number(), v.finite())), maxProviderCalls: v.optional(v.pipe(v.number(), v.finite())),
    maxElapsedMs: v.optional(v.pipe(v.number(), v.finite())), maxEstimatedCost: v.optional(v.nullable(v.pipe(v.number(), v.finite()))),
  })),
})
const hatchConfigPatchSchema = v.strictObject({ config: hatchConfigSaveSchema }) as v.GenericSchema<{ config: HatchPetAgentConfigSaveRequest }>
const hatchKeyResultSchema = v.strictObject({ apiKeyRef: v.string(), hasApiKey: v.boolean(), updatedAt: v.optional(v.string()) })
const hatchCapabilitySchema = v.objectWithRest({ ok: v.boolean(), code: v.string(), message: v.string(), provider: v.string(), model: v.string(), elapsedMs: v.pipe(v.number(), v.finite(), v.minValue(0)) }, v.unknown())
const hatchRunStatusSchema = v.record(v.string(), v.unknown())
const behaviorDiagnosticsSchema = v.strictObject({ content: v.string() })
const behaviorDecisionListSchema = v.array(v.unknown())
const chatResponseSchema = v.strictObject({
  conversationId: positiveString(), reply: v.string(), messages: v.optional(v.array(unknownObjectSchema)), bubble: v.optional(unknownObjectSchema),
  bubbleSegments: v.optional(v.array(v.string())), behaviorIntent: v.optional(v.unknown()), behavior: v.optional(unknownObjectSchema), state: v.optional(unknownObjectSchema),
  action: v.optional(v.strictObject({ actionId: v.optional(v.string()), label: v.optional(v.string()), error: v.optional(v.string()) })),
  requestId: v.optional(v.string()), providerLatencyMs: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0))),
  canceled: v.optional(v.boolean()), partialReply: v.optional(v.string()),
})
const chatProgressSchema = v.strictObject({
  requestId: v.optional(v.string()), conversationId: v.optional(v.string()), petPackId: v.optional(v.string()),
  entrypoint: v.optional(v.string()), status: v.optional(v.string()), partialReply: v.optional(v.string()),
  partialReplyChars: v.optional(nonNegativeInteger()), chunkCount: v.optional(nonNegativeInteger()),
  canCancel: v.optional(v.boolean()), errorMessage: v.optional(v.string()),
})
const chatDoneEnvelopeSchema = v.strictObject({ ok: v.literal(true), data: chatResponseSchema, requestId: positiveString() })
const chatErrorEnvelopeSchema = v.strictObject({
  ok: v.literal(false), requestId: positiveString(), error: v.strictObject({ code: v.string(), message: v.string() }),
})
const conversationListSchema = v.strictObject({ conversations: v.array(unknownObjectSchema) })
const chatPayloadSchema = v.strictObject({
  message: v.pipe(v.string(), v.minLength(1), v.maxLength(4000)), conversationId: v.optional(v.string()),
  entrypoint: v.optional(v.string()), requestId: v.optional(v.string()),
})
const traceExportSchema = v.string()
const jobAcceptedSchema = v.strictObject({ jobId: positiveString() })

const boundedBehaviorId = () => v.pipe(v.string(), v.maxLength(120))
const boundedBehaviorText = () => v.pipe(v.string(), v.maxLength(500))
const behaviorIntentSchema = v.strictObject({
  label: v.optional(boundedBehaviorId()), kind: v.optional(boundedBehaviorId()), actionId: v.optional(boundedBehaviorId()),
  bubbleText: v.optional(boundedBehaviorText()), reason: v.optional(v.pipe(v.string(), v.maxLength(240))),
  displayMode: v.optional(v.picklist(['none', 'bubble', 'action', 'event'])), intent: v.optional(boundedBehaviorId()),
  confidence: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1))),
})
const behaviorRuleConditionSchema = v.strictObject({
  intent: v.optional(boundedBehaviorId()), minConfidence: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1))),
  contains: v.optional(v.pipe(v.array(boundedBehaviorText()), v.maxLength(20))), actionKind: v.optional(boundedBehaviorId()),
})
const behaviorRuleActionSchema = v.strictObject({
  type: v.optional(v.picklist(['say', 'playAction', 'setEvent'])), text: v.optional(boundedBehaviorText()),
  actionId: v.optional(boundedBehaviorId()), event: v.optional(boundedBehaviorId()), message: v.optional(boundedBehaviorText()),
})
const behaviorRuleSchema = v.strictObject({
  id: v.optional(boundedBehaviorId()), enabled: v.optional(v.boolean()),
  priority: v.optional(v.pipe(v.number(), v.finite(), v.minValue(-10000), v.maxValue(10000))),
  when: v.optional(behaviorRuleConditionSchema), then: v.optional(behaviorRuleActionSchema),
})
const aiBehaviorConfigPatchSchema = v.strictObject({
  enabled: v.optional(v.boolean()), useTools: v.optional(v.boolean()),
  cooldownMs: v.optional(v.pipe(v.number(), v.finite(), v.integer(), v.minValue(0))),
  rules: v.optional(v.pipe(v.array(behaviorRuleSchema), v.maxLength(50))),
})
const aiBehaviorDryRunPayloadSchema = v.strictObject({
  reply: v.pipe(v.string(), v.maxLength(4000)), behaviorIntent: v.optional(v.nullable(behaviorIntentSchema)),
  rules: v.optional(v.pipe(v.array(behaviorRuleSchema), v.maxLength(50))),
})
const apiKeySchema = v.strictObject({ apiKey: v.pipe(v.string(), v.minLength(1)) })
const hatchApiKeySchema = v.strictObject({ apiKey: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)) })
const traceExportRequestSchema = v.strictObject({ filters: v.strictObject({ petPackId: v.optional(v.string()), conversationId: v.optional(v.string()) }) })

type AiBehaviorDryRunPayload = v.InferInput<typeof aiBehaviorDryRunPayloadSchema>
type AiChatPayload = v.InferInput<typeof chatPayloadSchema>
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
    body: JSON.stringify(v.parse(chatPayloadSchema, payload)),
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
  let previousPartialReply = ''
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
      if (typeof value.delta === 'string' && typeof value.conversationId === 'string' && value.conversationId.trim()
        && Object.keys(value).every((key) => key === 'conversationId' || key === 'delta')) {
        onDelta?.(value.delta)
        return
      }
      const progress = v.safeParse(chatProgressSchema, value)
      if (!progress.success || (progress.output.conversationId !== undefined && !progress.output.conversationId.trim())) {
        throw new Error('AI chat stream contains an invalid delta')
      }
      const partialReply = progress.output.partialReply || ''
      if (partialReply) {
        const delta = partialReply.startsWith(previousPartialReply)
          ? partialReply.slice(previousPartialReply.length)
          : partialReply
        if (delta) onDelta?.(delta)
        previousPartialReply = partialReply
      }
      return
    }
    if (event === 'ai.chat-done') {
      const envelope = v.safeParse(chatDoneEnvelopeSchema, value)
      if (envelope.success) {
        result = envelope.output.data
        return
      }
      const direct = v.safeParse(chatResponseSchema, value)
      if (direct.success) {
        result = direct.output
        return
      }
      const failure = v.safeParse(chatErrorEnvelopeSchema, value)
      if (failure.success) {
        throw new Error(failure.output.error.message || 'AI chat request failed')
      }
      {
        throw new Error('AI chat stream contains an invalid terminal response')
      }
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
      method: 'PUT', path: '/ai/images/key', requestSchema: apiKeySchema, body: { apiKey }, responseSchema: imageKeyResultSchema, retry: false,
    }) as Promise<ImageGenerationSaveApiKeyResult>,
    clearImageApiKey: () => client.request({ method: 'DELETE', path: '/ai/images/key', responseSchema: imageKeyResultSchema, retry: false }) as Promise<ImageGenerationSaveApiKeyResult>,
    getConfig: () => client.request({ method: 'GET', path: '/ai/config', responseSchema: aiConfigSchema }) as Promise<AiConfigViewState>,
    saveConfig: (config: AiConfigSaveRequest) => client.request({ method: 'PATCH', path: '/ai/config', requestSchema: aiConfigPatchSchema, body: { config }, responseSchema: aiConfigSchema, retry: false }) as Promise<AiConfigViewState>,
    testProvider: () => client.request({ method: 'POST', path: '/ai/providers/chat/test', requestSchema: emptySchema, body: {}, responseSchema: connectionTestSchema, retry: false, timeoutMs: 60_000 }) as Promise<AiConnectionTestResult>,
    discoverModels: (provider: 'chat' | 'vision' = 'chat') => client.request({ method: 'GET', path: `/ai/providers/${provider}/models`, responseSchema: discoverySchema }),
    saveApiKey: async (providerId: 'ai.default' | 'ai.vision', apiKey: string): Promise<AiSaveApiKeyResult> => {
      const result = await client.request({ method: 'PUT', path: `/ai/providers/${providerId}/key`, requestSchema: apiKeySchema, body: { apiKey }, responseSchema: keyResultSchema, retry: false })
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
      requestSchema: v.strictObject({ config: aiBehaviorConfigPatchSchema }) as v.GenericSchema<{ config: Pick<AiBehaviorConfig, 'enabled' | 'useTools' | 'cooldownMs' | 'rules'> }>,
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
      method: 'POST', path: '/ai/traces/export', requestSchema: traceExportRequestSchema,
      body: { filters }, responseSchema: traceExportSchema, retry: false, timeoutMs: 60_000,
    }),
    getHatchAgents: () => client.request({ method: 'GET', path: '/ai/hatch/agents', responseSchema: unknownObjectSchema, retry: false, timeoutMs: 60_000 }),
    getHatchConfig: () => client.request({ method: 'GET', path: '/ai/hatch/config', responseSchema: hatchConfigSchema, retry: false }) as unknown as Promise<HatchPetAgentConfigView>,
    saveHatchConfig: (config: HatchPetAgentConfigSaveRequest) => client.request({
      method: 'PATCH', path: '/ai/hatch/config',
      requestSchema: hatchConfigPatchSchema, body: { config }, responseSchema: hatchConfigSchema, retry: false,
    }) as unknown as Promise<HatchPetAgentConfigView>,
    saveHatchApiKey: (apiKey: string) => client.request({
      method: 'PUT', path: '/ai/hatch/key', requestSchema: hatchApiKeySchema,
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
