import { z } from "zod"

import { ERROR_CODES } from "./envelope.js"

/**
 * 反向通道契约(Backend <-> Shell)—— 见 docs/refactor/03-api-contract.md §7 与 ADR-011。
 *
 * 不过 HTTP,走 child_process.fork 的消息通道:不占端口、本机其他进程不可达、无需二次鉴权。
 * 所有消息统一套一层带版本号的信封 —— 升级或崩溃重拉会产生新旧进程配对,
 * HTTP 侧有 /api/v1 兜底,这条通道原本什么都没有。
 */

export const BRIDGE_PROTOCOL_VERSION = 1

/** sidecar 收到未知 v 时主动退出的码 */
export const EXIT_CODE_VERSION_MISMATCH = 78

/** 版本不符时 Shell 杀掉并重拉的次数上限,超过则进降级模式 */
export const MAX_VERSION_MISMATCH_RELAUNCHES = 2

/** dialog.result 超过 60s 未回则丢弃并向调用方返 504 */
export const DIALOG_RESULT_TIMEOUT_MS = 60_000

/** sidecar 必须在 10s 内发出 ready,否则 Shell 判定启动失败 */
export const SIDECAR_READY_TIMEOUT_MS = 10_000

export const envelopeSchema = <T extends z.ZodTypeAny>(body: T) =>
  z.object({
    v: z.literal(BRIDGE_PROTOCOL_VERSION),
    id: z.string().min(1),
    at: z.number().int().positive(),
    body,
  })

export type Envelope<T> = { v: 1; id: string; at: number; body: T }

export const catalogRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("listCatalog") }).strict(),
  z.object({ operation: z.literal("prepareInstall"), kind: z.enum(["plugin", "pet-pack"]), itemId: z.string().min(1) }).strict(),
  z.object({ operation: z.literal("installSelection"), selectionId: z.string().min(1) }).strict(),
  z.object({ operation: z.literal("clearSelection"), selectionId: z.string().min(1) }).strict(),
  z.object({ operation: z.literal("addBlocklistEntry"), type: z.enum(["pluginId", "packId", "sha256"]), value: z.string().min(1) }).strict(),
  z.object({ operation: z.literal("removeBlocklistEntry"), type: z.enum(["pluginId", "packId", "sha256"]), value: z.string().min(1) }).strict(),
])
export type CatalogBridgeRequest = z.infer<typeof catalogRequestSchema>

export const ACTIONS_BRIDGE_OPERATIONS = [
  "get",
  "save-config",
  "preview-proposal",
  "submit-proposal",
  "accept-proposal",
  "reject-proposal",
  "update-rule",
  "delete-rule",
  "inspect-frames",
  "reinspect-frames",
  "clear-selection",
  "import-frames",
  "delete-action",
] as const
export type ActionsBridgeOperation = (typeof ACTIONS_BRIDGE_OPERATIONS)[number]

const actionBridgeId = z.string().min(1).max(256)
const actionBridgePath = z.string().min(1).max(4096)
const actionBridgeProposalFields = {
  actionId: actionBridgeId,
  type: z.enum(["manual", "click", "random", "state", "event", "unbound"]),
  binding: z.string().max(80).optional(),
  id: actionBridgeId.optional(),
  sourcePluginId: z.string().max(160).optional(),
  sourceRunId: z.string().max(160).optional(),
  sourceCommandId: z.string().max(160).optional(),
  message: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional(),
  ruleSpec: z.record(z.string(), z.unknown()).optional(),
}
const actionProposalPayload = z.object(actionBridgeProposalFields).strict()
const actionRequest = (operation: (typeof ACTIONS_BRIDGE_OPERATIONS)[number], payload: z.ZodTypeAny) => z.object({
  type: z.literal("actions.request"),
  operation: z.literal(operation),
  payload,
}).strict()

export const actionsRequestSchema = z.discriminatedUnion("operation", [
  actionRequest("get", z.object({}).strict()),
  actionRequest("save-config", z.object({
    defaultAction: actionBridgeId.optional(),
    clickAction: actionBridgeId.optional(),
    actions: z.array(z.record(z.string(), z.unknown())).optional(),
    triggerProposal: z.record(z.string(), z.unknown()).optional(),
  }).strict()),
  actionRequest("preview-proposal", actionProposalPayload),
  actionRequest("submit-proposal", actionProposalPayload),
  actionRequest("accept-proposal", z.object({ proposalId: actionBridgeId }).strict()),
  actionRequest("reject-proposal", z.object({ proposalId: actionBridgeId, reason: z.string().max(1000).optional() }).strict()),
  actionRequest("update-rule", z.object({
    ruleId: actionBridgeId,
    status: z.string().max(80).optional(),
    ruleSpec: z.record(z.string(), z.unknown()).optional(),
  }).strict().superRefine((payload, ctx) => {
    if (payload.status === undefined && payload.ruleSpec === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "status or ruleSpec is required" })
  })),
  actionRequest("delete-rule", z.object({ ruleId: actionBridgeId }).strict()),
  actionRequest("inspect-frames", z.object({ path: actionBridgePath.optional(), actionId: actionBridgeId.optional() }).strict()),
  actionRequest("reinspect-frames", z.object({ selectionId: actionBridgeId, actionId: actionBridgeId.optional() }).strict()),
  actionRequest("clear-selection", z.object({ selectionId: actionBridgeId }).strict()),
  actionRequest("import-frames", z.object({
    selectionId: actionBridgeId.optional(),
    path: actionBridgePath.optional(),
    actionId: actionBridgeId,
    label: z.string().max(256).optional(),
  }).strict().superRefine((payload, ctx) => {
    if (Object.hasOwn(payload, "selectionId") === Object.hasOwn(payload, "path")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "exactly one of selectionId or path is required" })
  })),
  actionRequest("delete-action", z.object({ actionId: actionBridgeId }).strict()),
])
export type ActionsBridgeRequest = z.infer<typeof actionsRequestSchema>

export const CREATOR_BRIDGE_OPERATIONS = [
  "pick-reference", "upload-reference", "bind-reference", "delete-reference", "get-state", "get-last-run", "asset-preview",
  "generate-character", "generate-action", "run-workflow", "evaluate-sprite", "retry-action", "retry-identity",
  "accept-identity", "accept-action-candidate", "export-recovery", "import-actions",
] as const

export const PET_PACK_BRIDGE_OPERATIONS = [
  "list",
  "manifest",
  "pick",
  "validate",
  "clear-selection",
  "import",
  "export",
  "activate",
  "remove",
] as const
export type PetPackBridgeOperation = (typeof PET_PACK_BRIDGE_OPERATIONS)[number]

const petPackId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
const petPackPath = z.string().max(4096).refine((value) => value.trim().length > 0)
const petPackSelectionId = z.string().max(160).refine((value) => value.trim().length > 0)
const petPackPayloadSchemas = {
	list: z.object({}).strict(),
	manifest: z.object({ packId: petPackId }).strict(),
	pick: z.object({}).strict(),
	validate: z.object({ sourcePath: petPackPath }).strict(),
	"clear-selection": z.object({ selectionId: petPackSelectionId }).strict(),
	import: z.union([
		z.object({ selectionId: petPackSelectionId }).strict(),
		z.object({ sourcePath: petPackPath }).strict(),
	]),
	export: z.object({ packId: petPackId, target: petPackPath.optional() }).strict(),
	activate: z.object({ packId: petPackId }).strict(),
	remove: z.object({ packId: petPackId }).strict(),
} as const
export const petPackRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list"), payload: petPackPayloadSchemas.list }).strict(),
  z.object({ operation: z.literal("manifest"), payload: petPackPayloadSchemas.manifest }).strict(),
  z.object({ operation: z.literal("pick"), payload: petPackPayloadSchemas.pick }).strict(),
  z.object({ operation: z.literal("validate"), payload: petPackPayloadSchemas.validate }).strict(),
  z.object({ operation: z.literal("clear-selection"), payload: petPackPayloadSchemas["clear-selection"] }).strict(),
  z.object({ operation: z.literal("import"), payload: petPackPayloadSchemas.import }).strict(),
  z.object({ operation: z.literal("export"), payload: petPackPayloadSchemas.export }).strict(),
  z.object({ operation: z.literal("activate"), payload: petPackPayloadSchemas.activate }).strict(),
  z.object({ operation: z.literal("remove"), payload: petPackPayloadSchemas.remove }).strict(),
])
export type PetPackBridgeRequest = z.infer<typeof petPackRequestSchema>
const petPackBackendRequestSchema = z.object({
  type: z.literal("pet-packs.request"),
  operation: z.enum(PET_PACK_BRIDGE_OPERATIONS),
  payload: z.record(z.string(), z.unknown()),
}).strict().superRefine((request, ctx) => {
  const parsed = petPackRequestSchema.safeParse({ operation: request.operation, payload: request.payload })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ["payload", ...issue.path] })
  }
})
type PetPackBackendRequest = { type: "pet-packs.request" } & PetPackBridgeRequest

export const SETTINGS_COMMAND_OPERATIONS = ["preview-scale", "import-cursor"] as const
export type SettingsCommandOperation = (typeof SETTINGS_COMMAND_OPERATIONS)[number]

export const settingsCommandRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("preview-scale"), payload: z.object({ scale: z.number().finite().min(0.5).max(1.5) }).strict() }).strict(),
  z.object({ operation: z.literal("import-cursor"), payload: z.object({}).strict() }).strict(),
])
export type SettingsCommandRequest = z.infer<typeof settingsCommandRequestSchema>

const settingsCommandBackendRequestSchema = z.object({
  type: z.literal("settings.command.request"),
  operation: z.enum(SETTINGS_COMMAND_OPERATIONS),
  payload: z.record(z.string(), z.unknown()),
}).strict().superRefine((request, ctx) => {
  const parsed = settingsCommandRequestSchema.safeParse({ operation: request.operation, payload: request.payload })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ["payload", ...issue.path] })
  }
})

export const settingsCommandResultSchema = z.object({
  type: z.literal("settings.command.result"),
  operation: z.enum(SETTINGS_COMMAND_OPERATIONS),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string().min(1) }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.ok && value.error !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "successful result cannot include error" })
  if (value.ok && value.result === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "successful result requires result" })
  if (!value.ok && value.error === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "failed result requires error" })
  if (!value.ok && value.result !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "failed result cannot include result" })
})

export const AI_TALK_OPERATIONS = [
  "config.get",
  "config.save",
  "provider.test",
  "provider.models",
  "persona.get",
  "persona.save",
  "persona.draft",
  "memory.list",
  "memory.create",
  "memory.delete",
  "memory.clear-pet-pack",
  "chat",
  "conversation.list",
  "conversation.get",
  "conversation.delete",
  "talk.start",
  "talk.stop",
  "behavior.get",
  "behavior.save",
  "behavior.dry-run",
  "behavior.rule.create",
  "behavior.rule.update",
  "behavior.rule.delete",
  "trace.get",
  "trace.export",
  "hatch.agents",
  "hatch.config.get",
  "hatch.config.save",
  "hatch.key.save",
  "hatch.key.clear",
  "hatch.capability.check",
  "hatch.run.status",
  "hatch.start",
  "hatch.stop",
  "hatch.budget",
  "behavior.decision.replay",
  "behavior.diagnostics.export",
  "behavior.decisions.clear",
  "image.health",
  "image.models",
] as const
export type AiTalkOperation = (typeof AI_TALK_OPERATIONS)[number]

const boundedBehaviorId = z.string().max(120)
const boundedBehaviorText = z.string().max(500)

export const aiBehaviorIntentSchema = z.object({
  label: boundedBehaviorId.optional(),
  kind: boundedBehaviorId.optional(),
  actionId: boundedBehaviorId.optional(),
  bubbleText: boundedBehaviorText.optional(),
  reason: z.string().max(240).optional(),
  displayMode: z.enum(["none", "bubble", "action", "event"]).optional(),
  intent: boundedBehaviorId.optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
}).strict()

const aiBehaviorRuleConditionSchema = z.object({
  intent: boundedBehaviorId.optional(),
  minConfidence: z.number().finite().min(0).max(1).optional(),
  contains: z.array(boundedBehaviorText).max(20).optional(),
  actionKind: boundedBehaviorId.optional(),
}).strict()

const aiBehaviorRuleActionSchema = z.object({
  type: z.enum(["say", "playAction", "setEvent"]).optional(),
  text: boundedBehaviorText.optional(),
  actionId: boundedBehaviorId.optional(),
  event: boundedBehaviorId.optional(),
  message: boundedBehaviorText.optional(),
}).strict()

export const aiBehaviorRuleSchema = z.object({
  id: boundedBehaviorId.optional(),
  enabled: z.boolean().optional(),
  priority: z.number().finite().min(-10000).max(10000).optional(),
  when: aiBehaviorRuleConditionSchema.optional(),
  then: aiBehaviorRuleActionSchema.optional(),
}).strict()

export const aiBehaviorConfigPatchSchema = z.object({
  enabled: z.boolean().optional(),
  useTools: z.boolean().optional(),
  cooldownMs: z.number().finite().int().nonnegative().optional(),
  rules: z.array(aiBehaviorRuleSchema).max(50).optional(),
}).strict()

export const aiBehaviorDryRunPayloadSchema = z.object({
  reply: z.string().max(4000),
  behaviorIntent: aiBehaviorIntentSchema.nullable().optional(),
  rules: z.array(aiBehaviorRuleSchema).max(50).optional(),
}).strict()

const AI_TALK_PAYLOAD_FIELDS: Record<AiTalkOperation, readonly string[]> = {
  "config.get": [], "config.save": ["config"], "provider.test": ["providerId"], "provider.models": ["providerId"],
  "persona.get": [], "persona.save": ["override"], "persona.draft": ["instruction"],
  "memory.list": [], "memory.create": ["memory"], "memory.delete": ["memoryId"], "memory.clear-pet-pack": [],
  chat: ["message", "conversationId", "entrypoint", "requestId"],
  "conversation.list": ["entrypoint", "petPackId"], "conversation.get": ["conversationId"], "conversation.delete": ["conversationId"],
  "talk.start": ["message", "conversationId", "entrypoint", "requestId"], "talk.stop": ["requestId"],
  "behavior.get": [], "behavior.save": ["config"], "behavior.dry-run": ["reply", "behaviorIntent", "rules"],
  "behavior.rule.create": ["rule"], "behavior.rule.update": ["ruleId", "patch"], "behavior.rule.delete": ["ruleId"],
  "trace.get": ["conversationId"], "trace.export": ["filters"],
  "hatch.agents": [], "hatch.config.get": [], "hatch.config.save": ["config"], "hatch.key.save": ["apiKey"],
  "hatch.key.clear": [], "hatch.capability.check": [], "hatch.run.status": ["runId"],
  "hatch.start": ["runId", "mode", "userIntent", "stage", "scope", "workflowEvidence"],
  "hatch.stop": ["runId"], "hatch.budget": ["runId"], "image.health": ["options"], "image.models": ["options"],
  "behavior.decision.replay": ["decisionId"], "behavior.diagnostics.export": [], "behavior.decisions.clear": [],
}

const AI_TALK_REQUIRED_FIELDS: Partial<Record<AiTalkOperation, readonly string[]>> = {
    "config.save": ["config"], "provider.test": ["providerId"], "provider.models": ["providerId"],
    "persona.save": ["override"], "memory.create": ["memory"], "memory.delete": ["memoryId"],
    chat: ["message"], "conversation.get": ["conversationId"], "conversation.delete": ["conversationId"],
    "talk.start": ["message"], "talk.stop": ["requestId"], "behavior.save": ["config"],
    "behavior.dry-run": ["reply"], "behavior.rule.create": ["rule"], "behavior.rule.update": ["ruleId", "patch"],
    "behavior.rule.delete": ["ruleId"], "trace.get": ["conversationId"], "trace.export": ["filters"], "hatch.start": ["runId"],
    "hatch.config.save": ["config"], "hatch.key.save": ["apiKey"], "hatch.run.status": ["runId"],
    "hatch.stop": ["runId"], "hatch.budget": ["runId"], "behavior.decision.replay": ["decisionId"],
  }

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
)

const containsSensitiveResultField = (value: unknown, seen = new WeakSet<object>()): boolean => {
  if (Array.isArray(value)) return value.some((entry) => containsSensitiveResultField(entry, seen))
  if (!isPlainRecord(value)) return false
  if (seen.has(value)) return true
  seen.add(value)
  const found = Object.entries(value).some(([key, entry]) => (
    (/api.?key|password|secret|credential|token/i.test(key) && !/^(apiKeyRef|apiKeyPreview|hasApiKey|effectiveHasApiKey)$/i.test(key))
      || containsSensitiveResultField(entry, seen)
  ))
  seen.delete(value)
  return found
}

const aiResultRecord = (shape: Record<string, z.ZodTypeAny> = {}) => z.object(shape).passthrough().superRefine((value, ctx) => {
  if (containsSensitiveResultField(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "result contains sensitive fields" })
})
const aiStrictResultRecord = (shape: Record<string, z.ZodTypeAny>) => z.object(shape).strict().superRefine((value, ctx) => {
  if (containsSensitiveResultField(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "result contains sensitive fields" })
})
const aiPersonaView = z.object({
  name: z.string(), identity: z.string(), tone: z.string(), coreTraits: z.array(z.string()),
  speakingStyle: z.string(), relationshipToUser: z.string(), actionStyle: z.string(), boundaries: z.array(z.string()),
}).strict()
const aiPersonaOverrideView = z.object({
  name: z.string().optional(), identity: z.string().optional(), tone: z.string().optional(),
  coreTraits: z.array(z.string()).optional(), speakingStyle: z.string().optional(),
  relationshipToUser: z.string().optional(), actionStyle: z.string().optional(), boundaries: z.array(z.string()).optional(),
}).strict()

const aiStringExport = z.string().max(1024 * 1024)
const aiArrayResult = z.array(z.unknown()).max(10000).superRefine((value, ctx) => {
  if (containsSensitiveResultField(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "result contains sensitive fields" })
})
const aiModelCatalog = z.object({
  cacheKey: z.string(), models: z.array(z.string()), fetchedAt: z.string(), source: z.enum(["none", "saved"]),
}).strict().superRefine((value, ctx) => {
  if (containsSensitiveResultField(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "result contains sensitive fields" })
})
const aiHatchBudgets = z.object({
  maxIdentityRegenerations: z.number(), maxActionAttemptsPerAction: z.number(),
  maxEvaluationAttemptsPerArtifact: z.number(), maxPlannerCalls: z.number(), maxEvaluatorCalls: z.number(),
  maxProviderCalls: z.number(), maxElapsedMs: z.number(), maxEstimatedCost: z.number().nullable(),
}).strict().superRefine((value, ctx) => {
  if (containsSensitiveResultField(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "result contains sensitive fields" })
})
const aiMemoryItem = aiStrictResultRecord({
  id: z.string(), scope: z.enum(["global", "petPack"]), petPackId: z.string(), text: z.string(), tags: z.array(z.string()),
  confidence: z.number(), importance: z.number(), sourceConversationId: z.string(), sourceMessageIds: z.array(z.string()),
  createdAt: z.string(), updatedAt: z.string(), lastUsedAt: z.string(), lastEvidenceAt: z.string(), useCount: z.number(),
  status: z.enum(["active", "superseded", "deleted"]), supersedes: z.string(), reason: z.string(),
})
const aiMemoryJob = aiStrictResultRecord({
  id: z.string(), petPackId: z.string(), conversationId: z.string(), status: z.string(), createdAt: z.string(),
  updatedAt: z.string(), errorCode: z.string(), appliedCount: z.number(), filteredCount: z.number(),
})
const aiConversationSummary = aiStrictResultRecord({
  id: z.string(), conversationId: z.string(), sessionId: z.string(), entrypoint: z.string(), petPackId: z.string(),
  title: z.string(), messageCount: z.number(), createdAt: z.string(), updatedAt: z.string(),
})

const aiTalkResultSchemas: Record<AiTalkOperation, z.ZodTypeAny> = {
  "config.get": aiStrictResultRecord({
    enabled: z.boolean(), provider: z.string(), baseUrl: z.string(), model: z.string(), apiKeyRef: z.string(),
    systemPrompt: z.string(), hasApiKey: z.boolean(), memory: aiStrictResultRecord({ enabled: z.boolean() }),
    behavior: aiStrictResultRecord({ enabled: z.boolean(), useTools: z.boolean(), cooldownMs: z.number(), rules: z.array(z.unknown()), decisions: z.array(z.unknown()) }),
    vision: aiStrictResultRecord({ mode: z.enum(["follow-chat", "override"]), provider: z.string(), baseUrl: z.string(), model: z.string(), apiKeyRef: z.string(), hasApiKey: z.boolean(), modelCatalog: aiModelCatalog, effectiveProvider: z.string(), effectiveBaseUrl: z.string(), effectiveModel: z.string(), effectiveHasApiKey: z.boolean() }),
    modelCatalog: aiModelCatalog,
  }),
  "config.save": aiStrictResultRecord({ enabled: z.boolean(), provider: z.string(), baseUrl: z.string(), model: z.string(), apiKeyRef: z.string(), systemPrompt: z.string(), memory: aiStrictResultRecord({ enabled: z.boolean() }), behavior: aiStrictResultRecord({ enabled: z.boolean(), useTools: z.boolean(), cooldownMs: z.number(), rules: z.array(z.unknown()), decisions: z.array(z.unknown()) }), vision: aiStrictResultRecord({ mode: z.enum(["follow-chat", "override"]), provider: z.string(), baseUrl: z.string(), model: z.string(), apiKeyRef: z.string(), hasApiKey: z.boolean(), modelCatalog: aiModelCatalog, effectiveProvider: z.string(), effectiveBaseUrl: z.string(), effectiveModel: z.string(), effectiveHasApiKey: z.boolean() }), hasApiKey: z.boolean(), modelCatalog: aiModelCatalog }),
  "provider.test": aiStrictResultRecord({ ok: z.boolean(), provider: z.string(), baseUrl: z.string(), model: z.string(), hasApiKey: z.boolean(), elapsedMs: z.number().nonnegative(), reply: z.string().optional(), code: z.string().optional(), message: z.string().optional(), modelsProbe: z.enum(["ok", "unavailable", "failed", "timed_out", "rate_limited", "provider_unavailable"]).optional(), modelsProbeMessage: z.string().max(240).optional(), availableModels: z.array(z.string()).optional(), currentModelDiscovered: z.boolean().optional() }),
  "provider.models": aiStrictResultRecord({ ok: z.boolean(), provider: z.string(), baseUrl: z.string(), model: z.string(), hasApiKey: z.boolean(), models: z.array(z.string()), code: z.string(), message: z.string() }),
  "persona.get": aiStrictResultRecord({ petPackId: z.string(), petPackDisplayName: z.string(), packPersona: aiPersonaView, overridePersona: aiPersonaOverrideView, effectivePersona: aiPersonaView, compiledPersonaPrompt: z.string(), compiledSystemPrompt: z.string() }),
  "persona.save": aiStrictResultRecord({ petPackId: z.string(), petPackDisplayName: z.string(), packPersona: aiPersonaView, overridePersona: aiPersonaOverrideView, effectivePersona: aiPersonaView, compiledPersonaPrompt: z.string(), compiledSystemPrompt: z.string() }),
  "persona.draft": aiStrictResultRecord({ petPackId: z.string(), petPackDisplayName: z.string(), draftPersona: aiPersonaOverrideView, compiledPersonaPrompt: z.string() }),
  "memory.list": aiStrictResultRecord({ petPackId: z.string(), petPackDisplayName: z.string(), globalMemories: z.array(aiMemoryItem), petPackMemories: z.array(aiMemoryItem), recentJobs: z.array(aiMemoryJob) }),
  "memory.create": aiStrictResultRecord({ petPackId: z.string(), petPackDisplayName: z.string(), globalMemories: z.array(aiMemoryItem), petPackMemories: z.array(aiMemoryItem), recentJobs: z.array(aiMemoryJob) }),
  "memory.delete": aiStrictResultRecord({ petPackId: z.string(), petPackDisplayName: z.string(), globalMemories: z.array(aiMemoryItem), petPackMemories: z.array(aiMemoryItem), recentJobs: z.array(aiMemoryJob) }),
  "memory.clear-pet-pack": aiStrictResultRecord({ petPackId: z.string(), petPackDisplayName: z.string(), globalMemories: z.array(aiMemoryItem), petPackMemories: z.array(aiMemoryItem), recentJobs: z.array(aiMemoryJob) }),
  chat: aiStrictResultRecord({ reply: z.string().optional(), conversationId: z.string().optional(), messages: z.array(z.unknown()).optional(), bubbleSegments: z.array(z.string()).optional(), providerLatencyMs: z.number().nonnegative().optional(), requestId: z.string().optional(), bubble: z.unknown().optional(), state: z.unknown().optional(), behaviorIntent: z.unknown().optional(), behavior: z.unknown().optional(), action: z.unknown().optional(), canceled: z.boolean().optional(), partialReply: z.string().optional() }).refine((value) => typeof value.reply === "string" || value.canceled === true, "chat result requires reply or cancellation"),
  "conversation.list": aiStrictResultRecord({ conversations: z.array(aiConversationSummary) }),
  "conversation.get": aiStrictResultRecord({ conversationId: z.string(), messages: z.array(z.unknown()) }),
  "conversation.delete": aiStrictResultRecord({ conversationId: z.string(), deleted: z.boolean() }),
  "talk.start": aiStrictResultRecord({ reply: z.string().optional(), conversationId: z.string().optional(), messages: z.array(z.unknown()).optional(), bubbleSegments: z.array(z.string()).optional(), providerLatencyMs: z.number().nonnegative().optional(), requestId: z.string().optional(), bubble: z.unknown().optional(), state: z.unknown().optional(), behaviorIntent: z.unknown().optional(), behavior: z.unknown().optional(), action: z.unknown().optional(), canceled: z.boolean().optional(), partialReply: z.string().optional() }).refine((value) => typeof value.reply === "string" || value.canceled === true, "talk result requires reply or cancellation"),
  "talk.stop": aiStrictResultRecord({ canceled: z.boolean(), requestId: z.string(), reason: z.string(), status: z.string().optional() }),
  "behavior.get": aiStrictResultRecord({ enabled: z.boolean(), useTools: z.boolean(), cooldownMs: z.number(), rules: z.array(z.unknown()), decisions: z.array(z.unknown()) }),
  "behavior.save": aiStrictResultRecord({ enabled: z.boolean(), useTools: z.boolean(), cooldownMs: z.number(), rules: z.array(z.unknown()), decisions: z.array(z.unknown()) }),
  "behavior.dry-run": aiStrictResultRecord({ matched: z.boolean(), reason: z.string(), type: z.string().optional(), ruleId: z.string().optional(), actionId: z.string().optional(), label: z.string().optional(), kind: z.string().optional(), event: z.string().optional(), intent: z.string().optional(), providerReason: z.string().optional(), displayMode: z.enum(["none", "bubble", "action", "event"]).optional(), cooldown: z.boolean().optional(), fallback: z.boolean().optional(), blockedReason: z.string().optional(), replayOf: z.number().optional() }),
  "behavior.rule.create": aiStrictResultRecord({ enabled: z.boolean(), useTools: z.boolean(), cooldownMs: z.number(), rules: z.array(z.unknown()), decisions: z.array(z.unknown()) }),
  "behavior.rule.update": aiStrictResultRecord({ enabled: z.boolean(), useTools: z.boolean(), cooldownMs: z.number(), rules: z.array(z.unknown()), decisions: z.array(z.unknown()) }),
  "behavior.rule.delete": aiStrictResultRecord({ enabled: z.boolean(), useTools: z.boolean(), cooldownMs: z.number(), rules: z.array(z.unknown()), decisions: z.array(z.unknown()) }),
  "trace.get": aiStrictResultRecord({ traceId: z.string(), createdAt: z.string(), updatedAt: z.string(), conversation: aiStrictResultRecord({ conversationId: z.string(), petPackId: z.string(), petPackDisplayName: z.string() }), provider: aiStrictResultRecord({ provider: z.string(), baseUrl: z.string(), model: z.string() }), request: aiStrictResultRecord({ entrypoint: z.string(), historyCount: z.number(), messagesCount: z.number(), messageChars: z.number(), toolsCount: z.number(), recentPetActivityCount: z.number() }), memory: aiStrictResultRecord({ injectedCount: z.number(), usedCount: z.number(), injectedScopes: z.array(z.string()), usedScopes: z.array(z.string()) }), behavior: aiStrictResultRecord({ providerIntent: z.unknown().nullable(), finalDecision: z.unknown().nullable() }), result: aiStrictResultRecord({ streaming: z.boolean(), status: z.string(), chunkCount: z.number(), partialReplyChars: z.number(), elapsedMs: z.number(), providerLatencyMs: z.number(), finishReason: z.string(), cancelReason: z.string(), memoryExtractionScheduled: z.boolean(), behaviorDecisionScheduled: z.boolean(), replyChars: z.number(), persistedMessageCount: z.number(), bubbleSegmentCount: z.number(), displayMode: z.string() }) }),
  "trace.export": aiStringExport,
  "hatch.agents": aiStrictResultRecord({ config: z.record(z.string(), z.unknown()), readiness: z.record(z.string(), z.unknown()).nullable(), capability: z.record(z.string(), z.unknown()).nullable() }),
  "hatch.config.get": aiStrictResultRecord({ enabled: z.boolean(), executionMode: z.literal("shadow"), configMode: z.enum(["follow-chat", "override"]), provider: z.string(), baseUrl: z.string(), model: z.string(), apiKeyRef: z.string(), systemPromptVersion: z.number(), requireIdentityReviewBeforeActions: z.boolean(), budgets: aiHatchBudgets, hasApiKey: z.boolean(), configSource: z.string(), effectiveProvider: z.string(), effectiveBaseUrl: z.string(), effectiveModel: z.string() }),
  "hatch.config.save": aiStrictResultRecord({ enabled: z.boolean(), executionMode: z.literal("shadow"), configMode: z.enum(["follow-chat", "override"]), provider: z.string(), baseUrl: z.string(), model: z.string(), apiKeyRef: z.string(), systemPromptVersion: z.number(), requireIdentityReviewBeforeActions: z.boolean(), budgets: aiHatchBudgets, hasApiKey: z.boolean(), configSource: z.string(), effectiveProvider: z.string(), effectiveBaseUrl: z.string(), effectiveModel: z.string() }),
  "hatch.key.save": aiStrictResultRecord({ apiKeyRef: z.string(), hasApiKey: z.boolean(), updatedAt: z.string().optional() }),
  "hatch.key.clear": aiStrictResultRecord({ apiKeyRef: z.string(), hasApiKey: z.boolean(), updatedAt: z.string().optional() }),
  "hatch.capability.check": aiStrictResultRecord({ ok: z.boolean(), code: z.string(), message: z.string(), provider: z.string(), model: z.string(), elapsedMs: z.number().nonnegative(), enabled: z.boolean().optional(), configSource: z.string().optional() }),
  "hatch.run.status": aiStrictResultRecord({ ok: z.boolean(), runId: z.string(), state: z.record(z.string(), z.unknown()).nullable(), decisions: z.array(z.record(z.string(), z.unknown())), code: z.string().optional(), message: z.string().optional() }),
  "hatch.start": aiStrictResultRecord({ status: z.string(), code: z.string(), message: z.string(), decision: z.unknown().nullable(), decisionId: z.string().optional(), recordedAt: z.string().optional() }),
  "hatch.stop": aiStrictResultRecord({ canceled: z.boolean() }),
  "hatch.budget": aiStrictResultRecord({ runId: z.string(), budget: z.record(z.string(), z.unknown()).nullable() }),
  "behavior.decision.replay": aiStrictResultRecord({ replayOf: z.number().int().positive(), matched: z.boolean(), reason: z.string(), type: z.string().optional(), ruleId: z.string().optional(), actionId: z.string().optional(), label: z.string().optional(), kind: z.string().optional(), event: z.string().optional(), intent: z.string().optional(), providerReason: z.string().optional(), displayMode: z.enum(["none", "bubble", "action", "event"]).optional(), cooldown: z.boolean().optional(), fallback: z.boolean().optional(), blockedReason: z.string().optional() }),
  "behavior.diagnostics.export": aiStringExport,
  "behavior.decisions.clear": aiArrayResult,
  "image.health": aiStrictResultRecord({ ok: z.boolean(), provider: z.string(), code: z.string(), message: z.string(), modelsProbe: z.enum(["ok", "unavailable", "failed", "timed_out"]).optional(), availableModels: z.array(z.string()).optional(), currentModelDiscovered: z.boolean().optional(), usage: z.record(z.string(), z.number()).optional() }),
  "image.models": aiStrictResultRecord({ ok: z.boolean(), provider: z.string(), baseUrl: z.string(), model: z.string(), hasApiKey: z.boolean(), models: z.array(z.string()), code: z.string(), message: z.string() }),
}

export type AiTalkOperationResult = {
  [Operation in AiTalkOperation]: {
    operation: Operation
    result: z.infer<(typeof aiTalkResultSchemas)[Operation]>
  }
}[AiTalkOperation]

export const aiTalkResultSchema = (operation: AiTalkOperation): z.ZodTypeAny => aiTalkResultSchemas[operation]

export function parseAiTalkResult(operation: AiTalkOperation, value: unknown): { success: true; data: unknown } | { success: false } {
  const parsed = aiTalkResultSchemas[operation]?.safeParse(value)
  return parsed?.success ? { success: true, data: parsed.data } : { success: false }
}

export const AI_CONFIG_PROVIDER = "openai-compatible"
export const AI_CONFIG_TEXT_MAX_CHARS = 2000
export const AI_CONFIG_SYSTEM_PROMPT_MAX_CHARS = 12000

function isSafeAiProviderBaseUrl(value: string): boolean {
  type UrlFields = { protocol: string; username: string; password: string; search: string; hash: string }
  const URLConstructor = (globalThis as unknown as { URL: new (value: string) => UrlFields }).URL
  try {
    const parsed = new URLConstructor(value.trim())
    return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username && !parsed.password && !parsed.search && !parsed.hash
  } catch {
    return false
  }
}

export const aiTalkConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.literal(AI_CONFIG_PROVIDER).optional(),
  baseUrl: z.string().max(AI_CONFIG_TEXT_MAX_CHARS).refine(isSafeAiProviderBaseUrl).optional(),
  model: z.string().max(AI_CONFIG_TEXT_MAX_CHARS).refine((value) => value.trim().length > 0).optional(),
  systemPrompt: z.string().max(AI_CONFIG_SYSTEM_PROMPT_MAX_CHARS).optional(),
  memory: z.object({ enabled: z.boolean() }).strict().optional(),
  vision: z.object({
    mode: z.enum(["follow-chat", "override"]).optional(),
    provider: z.literal(AI_CONFIG_PROVIDER).optional(),
    baseUrl: z.string().max(AI_CONFIG_TEXT_MAX_CHARS).refine(isSafeAiProviderBaseUrl).optional(),
    model: z.string().max(AI_CONFIG_TEXT_MAX_CHARS).refine((value) => value.trim().length > 0).optional(),
}).strict().optional(),
}).strict()

function aiTalkPayloadIssues(operation: AiTalkOperation, payload: Record<string, unknown>): string[] {
  const issues: string[] = []
  const allowed = AI_TALK_PAYLOAD_FIELDS[operation]
  if (Object.keys(payload).some((key) => !allowed.includes(key))) issues.push("payload contains fields unsupported by this AI operation")
  for (const key of AI_TALK_REQUIRED_FIELDS[operation] || []) {
    if (!Object.hasOwn(payload, key)) issues.push(`${key} is required`)
  }
  const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
  const exact = (value: unknown, fields: readonly string[], requiredFields: readonly string[] = []): value is Record<string, unknown> => plain(value) && Object.keys(value).every((key) => fields.includes(key)) && requiredFields.every((key) => Object.hasOwn(value, key))
  const credential = (value: unknown): boolean => Array.isArray(value) ? value.some(credential) : plain(value) && Object.entries(value).some(([key, item]) => /api.?key|password|secret|token|credential/i.test(key) || credential(item))
  if (credential(payload) && operation !== "hatch.key.save") issues.push("credentials are not allowed in AI bridge payloads")
  if (operation === "config.save") {
    const config = payload.config
    if (!aiTalkConfigSchema.safeParse(config).success) issues.push("AI config is invalid")
  }
  if (operation === "behavior.save" && (!aiBehaviorConfigPatchSchema.safeParse(payload.config).success || credential(payload.config))) issues.push("behavior config is invalid")
  if (operation === "provider.test" && payload.providerId !== "chat") issues.push("only chat supports connection tests")
  if (operation === "provider.models" && !["chat", "vision"].includes(String(payload.providerId))) issues.push("provider capability is invalid")
  if (["chat", "talk.start"].includes(operation) && (typeof payload.message !== "string" || !payload.message.trim() || payload.message.length > 4000)) issues.push("message is invalid")
  if (["chat", "talk.start"].includes(operation)) {
    for (const key of ["conversationId", "entrypoint", "requestId"] as const) {
      if (payload[key] !== undefined && (typeof payload[key] !== "string" || payload[key].length > 160)) issues.push(`${key} is invalid`)
    }
  }
  if (["memory.delete", "conversation.get", "conversation.delete", "talk.stop", "trace.get", "hatch.stop", "hatch.budget", "hatch.run.status"].includes(operation)) {
    const key = operation === "memory.delete" ? "memoryId" : operation === "talk.stop" ? "requestId" : ["hatch.stop", "hatch.budget", "hatch.run.status"].includes(operation) ? "runId" : "conversationId"
    if (typeof payload[key] !== "string" || !payload[key].trim() || payload[key].length > 160) issues.push(`${key} is invalid`)
  }
  if (operation === "conversation.list" && ["entrypoint", "petPackId"].some((key) => payload[key] !== undefined && typeof payload[key] !== "string")) issues.push("conversation filters are invalid")
  if (operation === "persona.draft" && payload.instruction !== undefined && (typeof payload.instruction !== "string" || payload.instruction.length > 2000)) issues.push("instruction is invalid")
  if (operation === "persona.save") {
    const fields = ["name", "identity", "tone", "coreTraits", "speakingStyle", "relationshipToUser", "actionStyle", "boundaries"]
    if (!exact(payload.override, fields)) issues.push("persona override is invalid")
    else for (const [key, value] of Object.entries(payload.override as Record<string, unknown>)) {
      if (["coreTraits", "boundaries"].includes(key) ? !Array.isArray(value) || value.some((item) => typeof item !== "string") : typeof value !== "string") issues.push(`persona ${key} is invalid`)
    }
  }
  if (operation === "memory.create") {
    const fields = ["scope", "petPackId", "text", "tags", "confidence", "importance", "reason"]
    const memory = payload.memory
    if (!exact(memory, fields, ["text"]) || typeof memory.text !== "string" || !memory.text.trim() || memory.text.length > 500) issues.push("memory payload is invalid")
    else {
      if (memory.scope !== undefined && !["global", "petPack"].includes(String(memory.scope))) issues.push("memory scope is invalid")
      if (memory.petPackId !== undefined && typeof memory.petPackId !== "string") issues.push("memory petPackId is invalid")
      if (memory.tags !== undefined && (!Array.isArray(memory.tags) || memory.tags.some((tag) => typeof tag !== "string"))) issues.push("memory tags are invalid")
      for (const key of ["confidence", "importance"]) if (memory[key] !== undefined && (typeof memory[key] !== "number" || !Number.isFinite(memory[key]) || memory[key] < 0 || memory[key] > 1)) issues.push(`memory ${key} is invalid`)
      if (memory.reason !== undefined && typeof memory.reason !== "string") issues.push("memory reason is invalid")
    }
  }
  if (operation === "behavior.dry-run" && !aiBehaviorDryRunPayloadSchema.safeParse(payload).success) issues.push("behavior dry-run payload is invalid")
  if (operation === "behavior.rule.create" && !aiBehaviorRuleSchema.safeParse(payload.rule).success) issues.push("behavior rule is invalid")
  if (operation === "behavior.rule.update" && (typeof payload.ruleId !== "string" || !payload.ruleId.trim() || !aiBehaviorRuleSchema.safeParse(payload.patch).success)) issues.push("behavior rule patch is invalid")
  if (operation === "hatch.start") {
    if (typeof payload.runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(payload.runId)) issues.push("runId is invalid")
    if (payload.mode !== undefined && (typeof payload.mode !== "string" || !["single-action", "full-pet"].includes(payload.mode))) issues.push("mode is invalid")
    if (payload.userIntent !== undefined && (typeof payload.userIntent !== "string" || payload.userIntent.length > 2000)) issues.push("userIntent is invalid")
    if (payload.stage !== undefined && (typeof payload.stage !== "string" || payload.stage.length > 80)) issues.push("stage is invalid")
    if (payload.scope !== undefined && (!exact(payload.scope, ["actionId"]) || (payload.scope.actionId !== undefined && (typeof payload.scope.actionId !== "string" || payload.scope.actionId.length > 80)))) issues.push("scope is invalid")
    if (payload.workflowEvidence !== undefined) {
      const evidence = payload.workflowEvidence
      const provider = plain(evidence) ? evidence.provider : undefined
      if (!exact(evidence, ["provider"]) || !exact(provider, ["ready", "code", "message", "provider", "model"])) issues.push("workflowEvidence is invalid")
      else {
        if (provider.ready !== undefined && typeof provider.ready !== "boolean") issues.push("workflowEvidence.provider.ready is invalid")
        for (const key of ["code", "message", "provider", "model"]) if (provider[key] !== undefined && (typeof provider[key] !== "string" || provider[key].length > (key === "message" ? 240 : 160))) issues.push(`workflowEvidence.provider.${key} is invalid`)
      }
    }
  }
  if (operation === "hatch.config.save") {
    const fields = ["enabled", "configMode", "provider", "baseUrl", "model", "requireIdentityReviewBeforeActions", "budgets"]
    if (!exact(payload.config, fields)) issues.push("Hatch config is invalid")
    else {
      const config = payload.config
      for (const key of ["enabled", "requireIdentityReviewBeforeActions"]) if (config[key] !== undefined && typeof config[key] !== "boolean") issues.push("Hatch config " + key + " is invalid")
      if (config.configMode !== undefined && !["follow-chat", "override"].includes(String(config.configMode))) issues.push("Hatch configMode is invalid")
      for (const key of ["provider", "baseUrl", "model"]) if (config[key] !== undefined && (typeof config[key] !== "string" || config[key].length > 2000)) issues.push("Hatch config " + key + " is invalid")
      if (config.budgets !== undefined) {
        const limits: Record<string, [number, number]> = { maxIdentityRegenerations: [0, 10], maxActionAttemptsPerAction: [1, 20], maxEvaluationAttemptsPerArtifact: [1, 10], maxProviderCalls: [1, 1000], maxElapsedMs: [1000, 86400000], maxEstimatedCost: [0.01, 100000] }
        if (!exact(config.budgets, Object.keys(limits))) issues.push("Hatch budgets are invalid")
        else for (const [key, [min, max]] of Object.entries(limits)) {
          const entry = config.budgets[key]
          if (entry !== undefined && !(key === "maxEstimatedCost" && entry === null) && (typeof entry !== "number" || !Number.isFinite(entry) || entry < min || entry > max)) issues.push("Hatch budget " + key + " is invalid")
        }
      }
    }
  }
  if (operation === "hatch.key.save" && (typeof payload.apiKey !== "string" || !payload.apiKey.trim() || payload.apiKey.length > 4096)) issues.push("Hatch API key is invalid")
  if (["hatch.run.status", "hatch.budget", "hatch.stop"].includes(operation) && (typeof payload.runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(payload.runId))) issues.push("runId is invalid")
  if (operation === "behavior.decision.replay" && (!Number.isSafeInteger(payload.decisionId) || (payload.decisionId as number) <= 0)) issues.push("decisionId is invalid")
  return issues
}

export const PLUGIN_PRODUCTION_OPERATIONS = [
  "setup",
  "service.start",
  "service.stop",
  "service.health",
  "service.health-policy",
  "storage.clear",
  "secret.state",
  "secret.save",
  "secret.clear",
  "secret.qq.save",
  "secret.qq.clear",
  "creator.default-flow",
] as const
export type PluginProductionOperation = (typeof PLUGIN_PRODUCTION_OPERATIONS)[number]

export const backendToShellSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pet.command.request"),
    operation: z.enum(["say", "playAction", "setEvent"]),
    payload: z.record(z.string(), z.unknown()),
  }).strict(),
  z.object({
    type: z.literal("plugin.production.request"),
    operation: z.enum(PLUGIN_PRODUCTION_OPERATIONS),
    pluginId: z.string().min(1).optional(),
    serviceId: z.string().min(1).optional(),
    setupId: z.string().min(1).optional(),
    prompt: z.string().min(1).optional(),
    token: z.string().min(1).optional(),
    credentials: z.record(z.string(), z.unknown()).optional(),
    policy: z.record(z.string(), z.unknown()).optional(),
  }).strict().superRefine((value, ctx) => {
    const record = value as Record<string, unknown>
    const required = {
      setup: ["pluginId", "setupId"],
      "service.start": ["pluginId", "serviceId"],
      "service.stop": ["pluginId", "serviceId"],
      "service.health": ["pluginId", "serviceId"],
      "service.health-policy": ["pluginId", "serviceId", "policy"],
      "storage.clear": ["pluginId"],
      "secret.state": [],
      "secret.save": ["token"],
      "secret.clear": [],
      "secret.qq.save": ["credentials"],
      "secret.qq.clear": [],
      "creator.default-flow": ["prompt"],
    }[value.operation]
    const allowed = new Set(["type", "operation", ...required])
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "field is not allowed for this operation" })
    }
    for (const key of required) {
      if (record[key] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "field is required for this operation" })
    }
  }),
  z.object({ type: z.literal("pet.say"), text: z.string(), durationMs: z.number().int().positive().optional() }),
  z.object({ type: z.literal("pet.playAction"), actionId: z.string(), loop: z.boolean().optional() }),
  z.object({ type: z.literal("pet.event"), name: z.string(), payload: z.unknown().optional() }),
  z.object({ type: z.literal("window.openPluginDashboard"), pluginId: z.string() }).passthrough(),
  z.object({ type: z.literal("notify"), level: z.enum(["info", "warn", "error"]), message: z.string() }),
  z.object({ type: z.literal("tray.setBadge"), count: z.number().int().nonnegative() }),
  z.object({
    type: z.literal("ready"),
    port: z.number().int().positive(),
    /** 字符串 "v1",不是数字。07 篇 spike 里的数字 1 只是一次性探针。 */
    apiVersion: z.literal("v1"),
    pid: z.number().int().positive(),
    sessionToken: z.string().min(32),
    startupMs: z.number().int().nonnegative(),
  }).strict(),
  z.object({ type: z.literal("degraded"), reason: z.string() }),
  z.object({ type: z.literal("dialog.request"), requestId: z.string(), mode: z.enum(["file", "directory"]) }),
  z.object({ type: z.literal("settings.changed"), paths: z.array(z.string()), version: z.number().int().nonnegative() }),
  z.object({ type: z.literal("settings.apply.request"), paths: z.array(z.string()), version: z.number().int().nonnegative(), values: z.record(z.string(), z.unknown()).optional() }),
  settingsCommandBackendRequestSchema,
  z.object({ type: z.literal("settings.persist.result"), version: z.number().int().nonnegative(), ok: z.boolean(), changedPaths: z.array(z.string()), error: z.string().optional(), errorCode: z.string().optional() }),
  z.object({ type: z.literal("secrets.persist.request"), providerId: z.string().min(1), value: z.string().min(1).nullable() }).strict(),
  z.object({ type: z.literal("catalog.request"), request: catalogRequestSchema }).strict(),
  petPackBackendRequestSchema,
  z.object({ type: z.literal("creator.request"), operation: z.enum(CREATOR_BRIDGE_OPERATIONS), payload: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ type: z.literal("ai.state"), snapshot: z.record(z.string(), z.unknown()) }).strict(),
  z.object({
    type: z.literal("ai.host.request"),
    operation: z.enum(["context", "present"]),
    payload: z.record(z.string(), z.unknown()),
  }).strict().superRefine((request, ctx) => {
    const allowed = request.operation === "context" ? [] : ["result", "context"]
    if (Object.keys(request.payload).some((key) => !allowed.includes(key))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payload"], message: "AI host payload contains unsupported fields" })
    if (request.operation === "present" && !Object.hasOwn(request.payload, "result")) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payload", "result"], message: "result is required" })
  }),
  z.object({
    type: z.literal("ai.talk.request"),
    operation: z.enum(AI_TALK_OPERATIONS),
    payload: z.record(z.string(), z.unknown()),
  }).strict().superRefine((value, ctx) => {
    for (const message of aiTalkPayloadIssues(value.operation, value.payload)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payload"], message })
    }
  }),
  z.object({
    type: z.literal("actions.request"),
    operation: z.enum(ACTIONS_BRIDGE_OPERATIONS),
    payload: z.record(z.string(), z.unknown()),
  }).strict().superRefine((request, ctx) => {
    const parsed = actionsRequestSchema.safeParse(request)
    if (!parsed.success) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payload"], message: "Actions payload does not match its operation" })
  }),
])
export type BackendToShell = Exclude<z.infer<typeof backendToShellSchema>, { type: "pet-packs.request" }> | PetPackBackendRequest

export const shellToBackendSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("init"),
    userDataDir: z.string().min(1),
    appInfo: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
      packaged: z.boolean(),
      platform: z.string().min(1),
      arch: z.string().min(1),
    }).strict().optional(),
    /**
     * ADR-010:启动时唯一的密钥注入入口。
     * Shell 侧 safeStorage.decrypt() 后一次性注入,后端只留在内存,不落盘。
     * 运行期写入仅允许反向走 secrets.persist.request 交还 Shell 加密落盘。
     */
    providerKeys: z.record(z.string(), z.string()).optional(),
    legacyToken: z.string().nullable().optional(),
    localHttpConfig: z.object({
      enabled: z.boolean(),
      host: z.string(),
      port: z.number().int().nonnegative().max(65535),
    }).strict().optional(),
    /** Remote host mode may pin the Backend listener to a systemd port. */
    httpPort: z.number().int().nonnegative().max(65535).optional(),
    residentBackend: z.boolean().optional(),
  }).strict(),
  z.object({ type: z.literal("shutdown") }).strict(),
  z.object({
    type: z.literal("bridge.error"),
    code: z.enum(ERROR_CODES),
    message: z.string().min(1).optional(),
  }).strict(),
  z.object({ type: z.literal("pet.stateSnapshot"), state: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("dialog.result"), requestId: z.string(), paths: z.array(z.string()).nullable() }),
  z.object({ type: z.literal("power.suspend") }),
  z.object({ type: z.literal("power.resume") }),
  z.object({ type: z.literal("settings.apply.result"), version: z.number().int().nonnegative(), ok: z.boolean(), error: z.string().optional() }),
  settingsCommandResultSchema,
  z.object({ type: z.literal("settings.persist.request"), ifVersion: z.number().int().nonnegative(), patch: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("secrets.persist.result"), providerId: z.string().min(1), ok: z.boolean(), error: z.string().optional() }).strict(),
  z.object({ type: z.literal("catalog.result"), ok: z.boolean(), result: z.unknown().optional(), error: z.string().optional() }).strict(),
  z.object({
    type: z.literal("pet-packs.result"),
    operation: z.enum(PET_PACK_BRIDGE_OPERATIONS),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.object({
      code: z.enum(ERROR_CODES),
      message: z.string().min(1),
    }).strict().optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.ok && value.error !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "successful result cannot include error" })
    if (value.ok && value.result === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "successful result requires result" })
    if (!value.ok && value.error === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "failed result requires error" })
    if (!value.ok && value.result !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "failed result cannot include result" })
  }),
  z.object({
    type: z.literal("ai.talk.result"),
    operation: z.enum(AI_TALK_OPERATIONS),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.object({ code: z.enum(ERROR_CODES), message: z.string().min(1) }).strict().optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.ok && value.error !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "successful result cannot include error" })
    if (value.ok && value.result === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "successful result requires result" })
    if (!value.ok && value.error === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "failed result requires error" })
    if (!value.ok && value.result !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "failed result cannot include result" })
    if (!value.ok && value.error && Object.keys(value.error).some((key) => !["code", "message"].includes(key))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "error contains unsupported fields" })
    if (value.ok && !parseAiTalkResult(value.operation, value.result).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "result does not match the operation DTO" })
    }
  }),
  z.object({
    type: z.literal("actions.result"),
    operation: z.enum(ACTIONS_BRIDGE_OPERATIONS),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.object({
      code: z.enum(ERROR_CODES),
      message: z.string().min(1),
    }).strict().optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.ok && value.error !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "successful result cannot include error" })
    if (value.ok && value.result === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "successful result requires result" })
    if (!value.ok && value.error === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "failed result requires error" })
    if (!value.ok && value.result !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "failed result cannot include result" })
  }),
  z.object({
    type: z.literal("pet.pack-activated"),
    payload: z.record(z.string(), z.unknown()),
  }).strict(),
  z.object({ type: z.literal("pet.command.result"), ok: z.boolean(), result: z.unknown().optional(), error: z.string().optional() }).strict(),
  z.object({
    type: z.literal("plugin.production.result"),
    requestId: z.string().min(1),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().min(1).optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.ok && value.error !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "successful result cannot include error" })
    if (value.ok && value.result === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "successful result requires result" })
    if (!value.ok && value.error === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "failed result requires error" })
    if (!value.ok && value.result !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["result"], message: "failed result cannot include result" })
  }),
])
export type ShellToBackend = z.infer<typeof shellToBackendSchema>

export const backendToShellEnvelopeSchema = envelopeSchema(backendToShellSchema)
export const shellToBackendEnvelopeSchema = envelopeSchema(shellToBackendSchema)

/**
 * 版本闸门。返回 "ok" | "version-mismatch" | "malformed"。
 * 调用方据此决定:正常处理 / 杀并重拉 / 丢弃并记 warn。
 */
export function inspectEnvelope(raw: unknown): "ok" | "version-mismatch" | "malformed" {
  if (typeof raw !== "object" || raw === null) return "malformed"
  const v = (raw as { v?: unknown }).v
  if (typeof v !== "number") return "malformed"
  return v === BRIDGE_PROTOCOL_VERSION ? "ok" : "version-mismatch"
}
