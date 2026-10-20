"use strict"

const { sanitizeLogText } = require("../services/log-safety")

const BRIDGE_PROTOCOL_VERSION = 1
const CATALOG_BLOCKLIST_TYPES = new Set(["pluginId", "packId", "sha256"])
const CREATOR_OPERATIONS = new Set([
	"pick-reference", "upload-reference", "bind-reference", "get-state", "get-last-run", "asset-preview",
	"generate-character", "generate-action", "run-workflow", "evaluate-sprite", "retry-action", "retry-identity",
	"accept-identity", "accept-action-candidate", "export-recovery", "import-actions",
])
const PLUGIN_PRODUCTION_REQUEST_FIELDS = Object.freeze({
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
})

function exactKeys(value, keys) {
	const actual = Object.keys(value).sort()
	const expected = [...keys].sort()
	return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function nonEmptyString(value) { return typeof value === "string" && value.trim().length > 0 }

function safeAiProviderBaseUrl(value) {
	if (typeof value !== "string" || !value.trim()) return false
	try {
		const parsed = new URL(value.trim())
		return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
	} catch {
		return false
	}
}

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function containsCredentialField(value) {
	if (Array.isArray(value)) return value.some(containsCredentialField)
	if (!isPlainObject(value)) return false
	return Object.entries(value).some(([key, entry]) => /api.?key|password|secret|token|credential/i.test(key) || containsCredentialField(entry))
}

function normalizePluginProductionRequest(value) {
	if (!isPlainObject(value) || typeof value.operation !== "string") return null
	const required = PLUGIN_PRODUCTION_REQUEST_FIELDS[value.operation]
	if (!required) return null
	if (!exactKeys(value, ["type", "operation", ...required])) return null
	for (const field of required) {
		const fieldValue = value[field]
		if (["pluginId", "serviceId", "setupId", "token", "prompt"].includes(field) && !nonEmptyString(fieldValue)) return null
		if (["credentials", "policy"].includes(field) && !isPlainObject(fieldValue)) return null
	}
	return structuredClone(value)
}

function normalizeCatalogRequest(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.operation !== "string") return null
	switch (value.operation) {
		case "listCatalog": return exactKeys(value, ["operation"]) ? { operation: value.operation } : null
		case "prepareInstall":
			return exactKeys(value, ["operation", "kind", "itemId"]) && ["plugin", "pet-pack"].includes(value.kind) && nonEmptyString(value.itemId)
				? { operation: value.operation, kind: value.kind, itemId: value.itemId } : null
		case "installSelection":
		case "clearSelection":
			return exactKeys(value, ["operation", "selectionId"]) && nonEmptyString(value.selectionId)
				? { operation: value.operation, selectionId: value.selectionId } : null
		case "addBlocklistEntry":
		case "removeBlocklistEntry":
			return exactKeys(value, ["operation", "type", "value"]) && CATALOG_BLOCKLIST_TYPES.has(value.type) && nonEmptyString(value.value)
				? { operation: value.operation, type: value.type, value: value.value } : null
		default: return null
	}
}

const PET_PACK_PAYLOAD_FIELDS = Object.freeze({
	list: [],
	manifest: ["packId"],
	pick: [],
	validate: ["sourcePath"],
	"clear-selection": ["selectionId"],
	import: ["selectionId", "sourcePath"],
	export: ["packId", "target"],
	activate: ["packId"],
	remove: ["packId"],
})

function normalizePetPackRequest(operation, payload) {
	if (!PET_PACK_OPERATIONS.includes(operation) || !isPlainObject(payload)) return null
	const fields = PET_PACK_PAYLOAD_FIELDS[operation]
	if (Object.keys(payload).some((key) => !fields.includes(key))) return null
	const required = ["manifest", "validate", "clear-selection", "activate", "remove"].includes(operation)
		? fields
		: operation === "import" ? [] : operation === "export" ? ["packId"] : []
	if (required.some((key) => !Object.hasOwn(payload, key))) return null
	for (const key of fields) {
		if (!Object.hasOwn(payload, key)) continue
		const value = payload[key]
		if (!nonEmptyString(value)) return null
		if (key === "packId" && !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) return null
		if (key === "selectionId" && value.length > 160) return null
		if (["sourcePath", "target"].includes(key) && value.length > 4096) return null
	}
	if (operation === "import" && (Object.hasOwn(payload, "selectionId") === Object.hasOwn(payload, "sourcePath"))) return null
	return structuredClone(payload)
}

// Keep this list frozen in the Shell as well as in the backend bridge client.
// A backend message is untrusted input at this boundary: only these explicitly
// capabilities may reach Electron/PetService.
const BACKEND_TO_SHELL_TYPES = Object.freeze([
	"pet.command.request",
	"plugin.production.request",
	"pet.say",
	"pet.playAction",
	"pet.event",
	"window.openPluginDashboard",
	"notify",
	"tray.setBadge",
	"ready",
	"degraded",
	"dialog.request",
	"settings.changed",
	"settings.apply.request",
	"settings.command.request",
	"settings.persist.result",
	"secrets.persist.request",
	"catalog.request",
	"pet-packs.request",
	"creator.request",
	"ai.state",
	"ai.host.request",
	"ai.talk.request",
	"actions.request",
])

const PET_PACK_OPERATIONS = Object.freeze([
	"list",
	"manifest",
	"pick",
	"validate",
	"clear-selection",
	"import",
	"export",
	"activate",
	"remove",
])
const AI_TALK_OPERATIONS = Object.freeze([
	"config.get", "config.save", "provider.test", "provider.models",
	"persona.get", "persona.save", "persona.draft",
	"memory.list", "memory.create", "memory.delete", "memory.clear-pet-pack",
	"chat", "conversation.list", "conversation.get", "conversation.delete",
	"talk.start", "talk.stop",
	"behavior.get", "behavior.save", "behavior.dry-run",
	"behavior.rule.create", "behavior.rule.update", "behavior.rule.delete",
	"trace.get", "trace.export",
	"hatch.agents", "hatch.config.get", "hatch.config.save", "hatch.key.save", "hatch.key.clear",
	"hatch.capability.check", "hatch.run.status", "hatch.start", "hatch.stop", "hatch.budget",
	"behavior.decision.replay", "behavior.diagnostics.export", "behavior.decisions.clear",
	"image.health", "image.models",
])
const AI_TALK_PAYLOAD_FIELDS = Object.freeze({
	"config.get": [], "config.save": ["config"], "provider.test": ["providerId"], "provider.models": ["providerId"],
	"persona.get": [], "persona.save": ["override"], "persona.draft": ["instruction"],
	"memory.list": [], "memory.create": ["memory"], "memory.delete": ["memoryId"], "memory.clear-pet-pack": [],
	chat: ["message", "conversationId", "entrypoint", "requestId"],
	"conversation.list": ["entrypoint", "petPackId"],
	"conversation.get": ["conversationId"], "conversation.delete": ["conversationId"],
	"talk.start": ["message", "conversationId", "entrypoint", "requestId"], "talk.stop": ["requestId"],
	"behavior.get": [], "behavior.save": ["config"], "behavior.dry-run": ["reply", "behaviorIntent", "rules"],
	"behavior.rule.create": ["rule"], "behavior.rule.update": ["ruleId", "patch"], "behavior.rule.delete": ["ruleId"],
	"trace.get": ["conversationId"], "trace.export": ["filters"],
	"hatch.agents": [], "hatch.config.get": [], "hatch.config.save": ["config"], "hatch.key.save": ["apiKey"], "hatch.key.clear": [],
	"hatch.capability.check": [], "hatch.run.status": ["runId"],
	"hatch.start": ["runId", "mode", "userIntent", "stage", "scope", "workflowEvidence"], "hatch.stop": ["runId"], "hatch.budget": ["runId"],
	"behavior.decision.replay": ["decisionId"], "behavior.diagnostics.export": [], "behavior.decisions.clear": [],
	"image.health": ["options"], "image.models": ["options"],
})
const AI_TALK_REQUIRED_FIELDS = Object.freeze({
	"config.save": ["config"], "provider.test": ["providerId"], "provider.models": ["providerId"],
	"persona.save": ["override"], "memory.create": ["memory"], "memory.delete": ["memoryId"],
	chat: ["message"], "conversation.get": ["conversationId"], "conversation.delete": ["conversationId"],
	"talk.start": ["message"], "talk.stop": ["requestId"], "behavior.save": ["config"],
	"behavior.dry-run": ["reply"], "behavior.rule.create": ["rule"], "behavior.rule.update": ["ruleId", "patch"],
	"behavior.rule.delete": ["ruleId"], "trace.get": ["conversationId"], "trace.export": ["filters"],
	"hatch.key.save": ["apiKey"], "hatch.run.status": ["runId"], "behavior.decision.replay": ["decisionId"],
	"hatch.start": ["runId"], "hatch.stop": ["runId"], "hatch.budget": ["runId"],
})
const AI_CONFIG_FIELDS = new Set(["enabled", "provider", "baseUrl", "model", "systemPrompt", "memory", "vision"])
const AI_VISION_FIELDS = new Set(["mode", "provider", "baseUrl", "model"])
const AI_MEMORY_FIELDS = new Set(["scope", "petPackId", "text", "tags", "confidence", "importance", "reason"])
const AI_PROVIDER_CAPABILITIES = new Set(["chat", "vision"])
const AI_CONFIG_PROVIDER = "openai-compatible"
const AI_CONFIG_TEXT_MAX_CHARS = 2000
const AI_CONFIG_SYSTEM_PROMPT_MAX_CHARS = 12000

function validateAiTalkPayload(operation, payload) {
	const fields = AI_TALK_PAYLOAD_FIELDS[operation]
	if (!fields || !isPlainObject(payload) || Object.keys(payload).some((key) => !fields.includes(key))) return false
	if ((AI_TALK_REQUIRED_FIELDS[operation] || []).some((key) => !Object.hasOwn(payload, key))) return false
	if (["provider.test", "provider.models"].includes(operation) && (!AI_PROVIDER_CAPABILITIES.has(payload.providerId) || (operation === "provider.test" && payload.providerId !== "chat"))) return false
	if (["chat", "talk.start"].includes(operation) && (typeof payload.message !== "string" || payload.message.trim().length === 0 || payload.message.length > 4000)) return false
	if (["chat", "talk.start"].includes(operation)) {
		for (const key of ["conversationId", "entrypoint", "requestId"]) {
			if (payload[key] !== undefined && (typeof payload[key] !== "string" || payload[key].length > 160)) return false
		}
	}
	if (["memory.delete", "conversation.get", "conversation.delete", "talk.stop", "trace.get", "hatch.stop", "hatch.budget", "hatch.run.status"].includes(operation)) {
		const key = operation === "memory.delete" ? "memoryId" : operation === "talk.stop" ? "requestId" : ["hatch.stop", "hatch.budget", "hatch.run.status"].includes(operation) ? "runId" : "conversationId"
		if (!nonEmptyString(payload[key]) || payload[key].length > 160) return false
	}
	if (operation === "conversation.list" && ["entrypoint", "petPackId"].some((key) => payload[key] !== undefined && typeof payload[key] !== "string")) return false
	if (["config.save", "behavior.save", "hatch.config.save"].includes(operation) && (!isPlainObject(payload.config) || containsCredentialField(payload.config))) return false
	if (operation === "hatch.key.save" && (typeof payload.apiKey !== "string" || !payload.apiKey.trim() || payload.apiKey.length > 4096)) return false
	if (operation === "hatch.config.save") {
		const config = payload.config
		const fields = ["enabled", "configMode", "provider", "baseUrl", "model", "requireIdentityReviewBeforeActions", "budgets"]
		if (Object.keys(config).some((key) => !fields.includes(key))) return false
		for (const key of ["enabled", "requireIdentityReviewBeforeActions"]) if (config[key] !== undefined && typeof config[key] !== "boolean") return false
		if (config.configMode !== undefined && !["follow-chat", "override"].includes(config.configMode)) return false
		for (const key of ["provider", "baseUrl", "model"]) if (config[key] !== undefined && (typeof config[key] !== "string" || config[key].length > 2000)) return false
		if (config.budgets !== undefined) {
			const limits = { maxIdentityRegenerations: [0, 10], maxActionAttemptsPerAction: [1, 20], maxEvaluationAttemptsPerArtifact: [1, 10], maxProviderCalls: [1, 1000], maxElapsedMs: [1000, 86400000], maxEstimatedCost: [0.01, 100000] }
			if (!isPlainObject(config.budgets) || Object.keys(config.budgets).some((key) => !Object.hasOwn(limits, key))) return false
			for (const [key, [min, max]] of Object.entries(limits)) {
				const entry = config.budgets[key]
				if (entry !== undefined && !(key === "maxEstimatedCost" && entry === null) && (typeof entry !== "number" || !Number.isFinite(entry) || entry < min || entry > max)) return false
			}
		}
	}
	if (operation === "config.save") {
		if (Object.keys(payload.config).some((key) => !AI_CONFIG_FIELDS.has(key))) return false
		if (payload.config.enabled !== undefined && typeof payload.config.enabled !== "boolean") return false
		if (payload.config.provider !== undefined && (payload.config.provider !== AI_CONFIG_PROVIDER || payload.config.provider.length > AI_CONFIG_TEXT_MAX_CHARS)) return false
		if (payload.config.baseUrl !== undefined && (payload.config.baseUrl.length > AI_CONFIG_TEXT_MAX_CHARS || !safeAiProviderBaseUrl(payload.config.baseUrl))) return false
		if (payload.config.model !== undefined && (!nonEmptyString(payload.config.model) || payload.config.model.length > AI_CONFIG_TEXT_MAX_CHARS)) return false
		if (payload.config.systemPrompt !== undefined && (typeof payload.config.systemPrompt !== "string" || payload.config.systemPrompt.length > AI_CONFIG_SYSTEM_PROMPT_MAX_CHARS)) return false
		if (payload.config.memory !== undefined && (!isPlainObject(payload.config.memory) || Object.keys(payload.config.memory).some((key) => key !== "enabled") || typeof payload.config.memory.enabled !== "boolean")) return false
		if (payload.config.vision !== undefined && (!isPlainObject(payload.config.vision) || Object.keys(payload.config.vision).some((key) => !AI_VISION_FIELDS.has(key)))) return false
		if (isPlainObject(payload.config.vision)) {
			if (payload.config.vision.mode !== undefined && !["follow-chat", "override"].includes(payload.config.vision.mode)) return false
			if (payload.config.vision.provider !== undefined && (payload.config.vision.provider !== AI_CONFIG_PROVIDER || payload.config.vision.provider.length > AI_CONFIG_TEXT_MAX_CHARS)) return false
			if (payload.config.vision.baseUrl !== undefined && (payload.config.vision.baseUrl.length > AI_CONFIG_TEXT_MAX_CHARS || !safeAiProviderBaseUrl(payload.config.vision.baseUrl))) return false
			if (payload.config.vision.model !== undefined && (!nonEmptyString(payload.config.vision.model) || payload.config.vision.model.length > AI_CONFIG_TEXT_MAX_CHARS)) return false
		}
	}
	if (operation === "persona.save" && (!isPlainObject(payload.override) || Object.keys(payload.override).some((key) => !AI_PERSONA_FIELDS.has(key)) || containsCredentialField(payload.override))) return false
	if (operation === "persona.draft" && payload.instruction !== undefined && (typeof payload.instruction !== "string" || payload.instruction.length > 2000)) return false
	if (operation === "memory.create") {
		const memory = payload.memory
		if (!isPlainObject(memory) || Object.keys(memory).some((key) => !AI_MEMORY_FIELDS.has(key)) || containsCredentialField(memory)) return false
		if (typeof memory.text !== "string" || !memory.text.trim() || memory.text.length > 500) return false
		if (memory.scope !== undefined && !["global", "petPack"].includes(memory.scope)) return false
		if (memory.petPackId !== undefined && typeof memory.petPackId !== "string") return false
		if (memory.tags !== undefined && (!Array.isArray(memory.tags) || memory.tags.some((tag) => typeof tag !== "string"))) return false
		for (const key of ["confidence", "importance"]) if (memory[key] !== undefined && (typeof memory[key] !== "number" || !Number.isFinite(memory[key]) || memory[key] < 0 || memory[key] > 1)) return false
		if (memory.reason !== undefined && typeof memory.reason !== "string") return false
	}
	if (operation === "behavior.dry-run" && (typeof payload.reply !== "string" || containsCredentialField(payload))) return false
	if (operation === "behavior.rule.create" && (!isPlainObject(payload.rule) || containsCredentialField(payload.rule))) return false
	if (operation === "behavior.rule.update" && (!nonEmptyString(payload.ruleId) || !isPlainObject(payload.patch) || containsCredentialField(payload.patch))) return false
	if (operation === "behavior.rule.delete" && !nonEmptyString(payload.ruleId)) return false
	if (operation === "behavior.decision.replay" && (!Number.isSafeInteger(payload.decisionId) || payload.decisionId <= 0)) return false
	if (operation === "trace.export" && (!isPlainObject(payload.filters) || containsCredentialField(payload.filters))) return false
	if (operation === "hatch.start") {
		if (typeof payload.runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(payload.runId) || containsCredentialField(payload)) return false
		if (payload.mode !== undefined && !["single-action", "full-pet"].includes(payload.mode)) return false
		if (payload.userIntent !== undefined && (typeof payload.userIntent !== "string" || payload.userIntent.length > 2000)) return false
		if (payload.stage !== undefined && (typeof payload.stage !== "string" || payload.stage.length > 80)) return false
		if (payload.scope !== undefined && (!isPlainObject(payload.scope) || Object.keys(payload.scope).some((key) => key !== "actionId") || (payload.scope.actionId !== undefined && (typeof payload.scope.actionId !== "string" || payload.scope.actionId.length > 80)))) return false
		if (payload.workflowEvidence !== undefined) {
			const evidence = payload.workflowEvidence
			const provider = evidence?.provider
			if (!isPlainObject(evidence) || Object.keys(evidence).some((key) => key !== "provider") || !isPlainObject(provider) || Object.keys(provider).some((key) => !["ready", "code", "message", "provider", "model"].includes(key))) return false
			if (provider.ready !== undefined && typeof provider.ready !== "boolean") return false
			for (const key of ["code", "message", "provider", "model"]) if (provider[key] !== undefined && (typeof provider[key] !== "string" || provider[key].length > (key === "message" ? 240 : 160))) return false
		}
	}
	if (["image.health", "image.models"].includes(operation) && payload.options !== undefined && (!isPlainObject(payload.options) || containsCredentialField(payload.options))) return false
	return true
}
const AI_PERSONA_FIELDS = new Set([
	"name", "identity", "tone", "coreTraits", "speakingStyle",
	"relationshipToUser", "actionStyle", "boundaries",
])
let contractErrorCodesPromise = null
let backendEnvelopeContractPromise = null
let aiTalkResultContractPromise = null
let aiBehaviorDryRunPayloadSchemaPromise = null
let aiBehaviorRuleSchemaPromise = null
let aiBehaviorConfigPatchSchemaPromise = null

async function isValidBehaviorConfigPatch(value) {
	aiBehaviorConfigPatchSchemaPromise ??= import("@openpet/contracts").then(({ aiBehaviorConfigPatchSchema }) => aiBehaviorConfigPatchSchema)
	try {
		return (await aiBehaviorConfigPatchSchemaPromise).safeParse(value).success
	} catch {
		return false
	}
}

async function isValidBehaviorDryRunPayload(payload) {
	aiBehaviorDryRunPayloadSchemaPromise ??= import("@openpet/contracts").then(({ aiBehaviorDryRunPayloadSchema }) => aiBehaviorDryRunPayloadSchema)
	try {
		return (await aiBehaviorDryRunPayloadSchemaPromise).safeParse(payload).success
	} catch {
		return false
	}
}

async function isValidBehaviorRuleRequest(operation, payload) {
	aiBehaviorRuleSchemaPromise ??= import("@openpet/contracts").then(({ aiBehaviorRuleSchema }) => aiBehaviorRuleSchema)
	try {
		const value = operation === "behavior.rule.create" ? payload?.rule : payload?.patch
		return (await aiBehaviorRuleSchemaPromise).safeParse(value).success
	} catch {
		return false
	}
}

async function validateAiTalkSuccessResult(operation, result) {
	aiTalkResultContractPromise ??= import("@openpet/contracts").then(({ parseAiTalkResult }) => parseAiTalkResult)
	try {
		const parseAiTalkResult = await aiTalkResultContractPromise
		return parseAiTalkResult(operation, result).success
	} catch {
		return false
	}
}

async function validateBackendEnvelope(envelope) {
	backendEnvelopeContractPromise ??= import("@openpet/contracts").then(({ backendToShellSchema }) => backendToShellSchema)
	try {
		return (await backendEnvelopeContractPromise).safeParse(envelope.body).success
	} catch {
		return false
	}
}

async function normalizeAiTalkErrorCode(error) {
	const providerStatus = Number(error?.providerStatus) || 0
	if (providerStatus === 401 || providerStatus === 403) return "PERMISSION_DENIED"
	if (providerStatus === 404) return "NOT_FOUND"
	if (providerStatus === 408 || providerStatus === 504) return "PROVIDER_TIMEOUT"
	if (providerStatus === 429) return "RATE_LIMITED"
	if (providerStatus >= 400 && providerStatus < 500) return "VALIDATION_FAILED"
	if (error?.name === "TimeoutError" || error?.name === "AbortError" || /timed out|timeout/i.test(String(error?.message || ""))) return "PROVIDER_TIMEOUT"
	const candidate = typeof error?.code === "string" ? error.code : ""
	contractErrorCodesPromise ??= import("@openpet/contracts").then(({ ERROR_CODES }) => new Set(ERROR_CODES))
	try {
		if ((await contractErrorCodesPromise).has(candidate)) return candidate
	} catch {
		return "INTERNAL"
	}
	if (error?.providerStatus || error?.providerCode || /provider (?:request|stream) failed|provider returned|ai provider request failed/i.test(String(error?.message || ""))) return "PROVIDER_ERROR"
	if (/api key is not configured/i.test(String(error?.message || ""))) return "AI_KEY_NOT_CONFIGURED"
	return normalizeActionsErrorCode(error)
}

function normalizeAiTalkErrorMessage(error, code) {
	if (Number(error?.providerStatus)) {
		return ({
			PERMISSION_DENIED: "AI provider authentication failed",
			NOT_FOUND: "AI provider endpoint or model was not found",
			RATE_LIMITED: "AI provider rate limit exceeded",
			VALIDATION_FAILED: "AI provider rejected the request",
			PROVIDER_ERROR: "AI provider request failed",
			PROVIDER_TIMEOUT: "AI provider request timed out",
		})[code] || "AI provider request failed"
	}
	return ({
		PROVIDER_ERROR: "AI provider request failed",
		PROVIDER_TIMEOUT: "AI provider request timed out",
		BACKEND_UNAVAILABLE: "AI service temporarily unavailable",
		AI_KEY_NOT_CONFIGURED: "AI API key is not configured",
	})[code] || sanitizeLogText(error?.message || String(error))
}

async function normalizePetPackErrorCode(value) {
	if (typeof value !== "string") return "INTERNAL"
	contractErrorCodesPromise ??= import("@openpet/contracts").then(({ ERROR_CODES }) => new Set(ERROR_CODES))
	try {
		return (await contractErrorCodesPromise).has(value) ? value : "INTERNAL"
	} catch {
		return "INTERNAL"
	}
}

async function normalizeActionsErrorCode(error) {
	const candidate = typeof error?.code === "string" ? error.code : ""
	contractErrorCodesPromise ??= import("@openpet/contracts").then(({ ERROR_CODES }) => new Set(ERROR_CODES))
	let known = false
	try { known = (await contractErrorCodesPromise).has(candidate) } catch {}
	if (known) return candidate
	const message = String(error?.message || error || "")
	if (/unavailable|authority|service unavailable|sidecar disconnected/i.test(message)) return "BACKEND_UNAVAILABLE"
	if (/not found|does not exist|no such action|no such rule/i.test(message)) return "NOT_FOUND"
	if (/already exists|last action|not pending|conflict|cannot delete/i.test(message)) return "CONFLICT"
	if (/frame|source folder|sprite|action id|trigger proposal|rule|invalid|required|unsupported/i.test(message)) return "VALIDATION_FAILED"
	return "INTERNAL"
}

function log(logger, level, message, fields) {
	try {
		logger?.[level]?.(message, fields)
	} catch {
		// A logger must never take down the Shell message loop.
	}
}

function dialogProperties(mode) {
	return mode === "directory" ? ["openDirectory"] : ["openFile"]
}

function fail(reason, detail) {
	return { ok: false, reason, detail: detail ?? null }
}

function parseEnvelope(raw) {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return fail("not-object")
	if (raw.v !== BRIDGE_PROTOCOL_VERSION) return fail("version-mismatch", raw.v)
	if (typeof raw.id !== "string" || raw.id.length === 0) return fail("bad-id", raw.id)
	if (!Number.isInteger(raw.at) || raw.at <= 0) return fail("bad-at", raw.at)
	const body = raw.body
	let normalizedBody = body
	if (body === null || typeof body !== "object" || Array.isArray(body) || typeof body.type !== "string") {
		return fail("bad-body")
	}
	if (!BACKEND_TO_SHELL_TYPES.includes(body.type)) return fail("unknown-type", body.type)

	switch (body.type) {
		case "ai.state":
			if (!body.snapshot || typeof body.snapshot !== "object" || Array.isArray(body.snapshot)) return fail("bad-body", "ai.state")
			break
		case "ai.host.request":
			if (!["context", "present"].includes(body.operation) || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) return fail("bad-body", "ai.host.request")
			break
		case "actions.request":
			if (typeof body.operation !== "string" || body.payload === null || typeof body.payload !== "object" || Array.isArray(body.payload)) return fail("bad-body", "actions.request")
			break
		case "creator.request":
			if (!CREATOR_OPERATIONS.has(body.operation) || body.payload === null || typeof body.payload !== "object" || Array.isArray(body.payload)) return fail("bad-body", "creator.request")
			break
		case "pet.command.request":
			if (!["say", "playAction", "setEvent"].includes(body.operation) || body.payload === null || typeof body.payload !== "object" || Array.isArray(body.payload)) return fail("bad-body", "pet.command.request")
			break
		case "plugin.production.request":
			normalizedBody = normalizePluginProductionRequest(body)
			if (!normalizedBody) return fail("bad-body", "plugin.production.request")
			break
		case "pet.say":
			if (typeof body.text !== "string") return fail("bad-body", "pet.say.text")
			if (body.durationMs !== undefined && (!Number.isInteger(body.durationMs) || body.durationMs <= 0)) return fail("bad-body", "pet.say.durationMs")
			break
		case "pet.playAction":
			if (typeof body.actionId !== "string" || (body.loop !== undefined && typeof body.loop !== "boolean")) return fail("bad-body", "pet.playAction")
			break
		case "pet.event":
			if (typeof body.name !== "string") return fail("bad-body", "pet.event.name")
			break
		case "window.openPluginDashboard":
			if (typeof body.pluginId !== "string" || body.pluginId.length === 0) return fail("bad-body", "window.openPluginDashboard.pluginId")
			break
		case "notify":
			if (!["info", "warn", "error"].includes(body.level) || typeof body.message !== "string") return fail("bad-body", "notify")
			break
		case "tray.setBadge":
			if (!Number.isInteger(body.count) || body.count < 0) return fail("bad-body", "tray.setBadge.count")
			break
		case "ready":
			if (!exactKeys(body, ["type", "port", "apiVersion", "pid", "sessionToken", "startupMs"])) return fail("bad-body", "ready")
			if (!Number.isInteger(body.port) || body.port <= 0 || body.port > 65535 || body.apiVersion !== "v1" || !Number.isInteger(body.pid) || body.pid <= 0 || typeof body.sessionToken !== "string" || body.sessionToken.length < 32 || !Number.isInteger(body.startupMs) || body.startupMs < 0) return fail("bad-body", "ready")
			break
		case "degraded":
			if (typeof body.reason !== "string") return fail("bad-body", "degraded.reason")
			break
		case "settings.changed":
			if (!Array.isArray(body.paths) || body.paths.some((path) => typeof path !== "string") || !Number.isInteger(body.version) || body.version < 0) return fail("bad-body", "settings.changed")
			break
		case "settings.apply.request":
			if (!Array.isArray(body.paths) || body.paths.some((path) => typeof path !== "string") || !Number.isInteger(body.version) || body.version < 0 || (body.values !== undefined && (body.values === null || typeof body.values !== "object" || Array.isArray(body.values)))) return fail("bad-body", "settings.apply.request")
			break
		case "settings.command.request": {
			if (!exactKeys(body, ["type", "operation", "payload"]) || !["preview-scale", "import-cursor"].includes(body.operation) || !isPlainObject(body.payload)) return fail("bad-body", "settings.command.request")
			if (body.operation === "preview-scale" && (!exactKeys(body.payload, ["scale"]) || typeof body.payload.scale !== "number" || !Number.isFinite(body.payload.scale) || body.payload.scale < 0.5 || body.payload.scale > 1.5)) return fail("bad-body", "settings.command.request.preview-scale")
			if (body.operation === "import-cursor" && !exactKeys(body.payload, [])) return fail("bad-body", "settings.command.request.import-cursor")
			break
		}
		case "pet-packs.request":
			if (!exactKeys(body, ["type", "operation", "payload"])) return fail("bad-body", "pet-packs.request")
			{
				const payload = normalizePetPackRequest(body.operation, body.payload)
				if (!payload) return fail("bad-body", "pet-packs.request")
				normalizedBody = { type: body.type, operation: body.operation, payload }
			}
			break
	case "ai.talk.request": {
			const fields = AI_TALK_PAYLOAD_FIELDS[body.operation]
			if (!exactKeys(body, ["type", "operation", "payload"]) || !AI_TALK_OPERATIONS.includes(body.operation) || !fields || !validateAiTalkPayload(body.operation, body.payload)) return fail("bad-body", "ai.talk.request")
			if (body.operation === "persona.save") {
				const override = body.payload.override
				if (!isPlainObject(override) || Object.keys(override).some((key) => !AI_PERSONA_FIELDS.has(key))) return fail("bad-body", "ai.talk.request.override")
				for (const [key, value] of Object.entries(override)) {
					if (["coreTraits", "boundaries"].includes(key)) {
						if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return fail("bad-body", `ai.talk.request.override.${key}`)
						continue
					}
					if (typeof value !== "string") return fail("bad-body", `ai.talk.request.override.${key}`)
				}
			}
			normalizedBody = { type: body.type, operation: body.operation, payload: structuredClone(body.payload) }
			break
		}
		case "dialog.request":
			if (typeof body.requestId !== "string" || !["file", "directory"].includes(body.mode)) return fail("bad-body", "dialog.request")
			break
		case "secrets.persist.request":
			if (typeof body.providerId !== "string" || body.providerId.trim().length === 0) return fail("bad-body", "secrets.persist.request.providerId")
			if (body.value !== null && (typeof body.value !== "string" || body.value.trim().length === 0)) return fail("bad-body", "secrets.persist.request.value")
			if (Object.keys(body).some((key) => !["type", "providerId", "value"].includes(key))) return fail("bad-body", "secrets.persist.request.fields")
			break
		case "catalog.request": {
			const request = normalizeCatalogRequest(body.request)
			if (!exactKeys(body, ["type", "request"]) || !request) return fail("bad-body", "catalog.request")
			normalizedBody = { type: body.type, request }
			break
		}
	}

	return { ok: true, envelope: { v: raw.v, id: raw.id, at: raw.at, body: normalizedBody } }
}

function createMessageHandler({ dialog, petService, secretService, logger, send, onNotify, onBadge, onDashboard, onSettingsChanged, onSettingsApplyRequest, onSettingsCommandRequest, onCatalogRequest, onPetPackRequest, onActionsRequest, onCreatorRequest, onAiTalkRequest, onAiState, onAiHostRequest, productionService } = {}) {
	if (typeof send !== "function") throw new TypeError("createMessageHandler 需要 send")

	async function handle(raw) {
		const parsed = parseEnvelope(raw)
		if (!parsed.ok) {
			log(logger, "warn", "丢弃无效的 sidecar 消息", { reason: parsed.reason, detail: parsed.detail })
			return false
		}
		if (!await validateBackendEnvelope(parsed.envelope)) {
			log(logger, "warn", "丢弃不符合反向通道契约的 Backend 消息", { type: parsed.envelope.body.type })
			return false
		}
		const { body } = parsed.envelope
		if (body.type === "ai.talk.request" && body.operation === "behavior.dry-run" && !await isValidBehaviorDryRunPayload(body.payload)) {
			log(logger, "warn", "丢弃无效的 AI behavior dry-run 请求", { reason: "bad-body", detail: "ai.talk.request.behavior.dry-run" })
			return false
		}
		if (body.type === "ai.talk.request" && body.operation === "behavior.save" && !await isValidBehaviorConfigPatch(body.payload.config)) {
			log(logger, "warn", "丢弃无效的 AI behavior config 请求", { reason: "bad-body", detail: "ai.talk.request.behavior.save" })
			return false
		}
		if (body.type === "ai.talk.request" && ["behavior.rule.create", "behavior.rule.update"].includes(body.operation) && !await isValidBehaviorRuleRequest(body.operation, body.payload)) {
			log(logger, "warn", "丢弃无效的 AI behavior rule 请求", { reason: "bad-body", detail: `ai.talk.request.${body.operation}` })
			return false
		}

		try {
			switch (body.type) {
				case "ai.state":
					onAiState?.(structuredClone(body.snapshot))
					return true
				case "ai.host.request": {
					let response
					try {
						if (!onAiHostRequest) throw new Error("AI host effects are unavailable")
						response = { ok: true, result: await onAiHostRequest({ operation: body.operation, payload: structuredClone(body.payload) }) }
					} catch (error) { response = { ok: false, error: error?.message || "AI host request failed" } }
					send({ v: 1, id: raw.id, at: Date.now(), body: { type: "ai.host.result", operation: body.operation, ...response } })
					return true
				}
				case "pet-packs.request": {
					let responseBody
					try {
						if (typeof onPetPackRequest !== "function") {
							throw Object.assign(new Error("Shell Pet Pack authority unavailable"), { code: "BACKEND_UNAVAILABLE" })
						}
						const result = await onPetPackRequest({
							operation: body.operation,
							payload: structuredClone(body.payload),
						})
						responseBody = { type: "pet-packs.result", operation: body.operation, ok: true, result }
					} catch (error) {
						responseBody = {
							type: "pet-packs.result",
							operation: body.operation,
							ok: false,
							error: {
								code: await normalizePetPackErrorCode(error?.code),
								message: error?.message || String(error),
							},
						}
					}
					send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: responseBody })
					return true
				}
				case "actions.request": {
					const { actionsRequestSchema } = await import("@openpet/contracts")
					const request = actionsRequestSchema.safeParse(body)
					if (!request.success) {
						log(logger, "warn", "invalid Actions bridge request", { operation: body.operation })
						return false
					}
					let responseBody
					try {
						if (typeof onActionsRequest !== "function") throw Object.assign(new Error("Shell Actions authority unavailable"), { code: "BACKEND_UNAVAILABLE" })
						const result = await onActionsRequest({ operation: request.data.operation, payload: structuredClone(request.data.payload) })
						responseBody = { type: "actions.result", operation: body.operation, ok: true, result }
					} catch (error) {
						responseBody = { type: "actions.result", operation: body.operation, ok: false, error: {
							code: await normalizeActionsErrorCode(error),
							message: sanitizeLogText(error?.message || String(error)),
						} }
					}
					send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: responseBody })
					return true
				}
				case "ai.talk.request": {
					let response
					try {
						if (typeof onAiTalkRequest !== "function") throw Object.assign(new Error("Shell AI Talk authority unavailable"), { code: "BACKEND_UNAVAILABLE" })
						const result = await onAiTalkRequest({ operation: body.operation, payload: structuredClone(body.payload) })
						if (!await validateAiTalkSuccessResult(body.operation, result)) throw Object.assign(new Error("Shell AI Talk response is invalid"), { code: "INTERNAL" })
						response = { ok: true, result }
					} catch (error) {
						const code = await normalizeAiTalkErrorCode(error)
						response = { ok: false, error: { code, message: normalizeAiTalkErrorMessage(error, code) } }
					}
					send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: { type: "ai.talk.result", operation: body.operation, ...response } })
					return true
				}
				case "creator.request": {
					let responseBody
					try {
						if (typeof onCreatorRequest !== "function") throw Object.assign(new Error("Shell Creator authority unavailable"), { code: "BACKEND_UNAVAILABLE" })
						const result = await onCreatorRequest({ operation: body.operation, payload: structuredClone(body.payload) })
						responseBody = { type: "creator.result", operation: body.operation, ok: true, result }
					} catch (error) {
						responseBody = { type: "creator.result", operation: body.operation, ok: false, error: {
							code: await normalizePetPackErrorCode(error?.code),
							message: sanitizeLogText(error?.message || String(error)),
						} }
					}
					send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: responseBody })
					return true
				}
				case "pet.command.request": {
					let result
					try {
						if (body.operation === "say") result = await petService?.say?.({
							text: body.payload.text,
							ttlMs: body.payload.ttlMs,
							source: body.payload.source,
							sourceSurface: body.payload.sourceSurface,
							requestId: body.payload.requestId,
						})
						else if (body.operation === "playAction") result = await petService?.playAction?.({
							actionId: body.payload.actionId,
							source: body.payload.source,
						})
						else if (body.operation === "setEvent") result = await petService?.setEvent?.({
							type: body.payload.type,
							message: body.payload.message,
							ttlMs: body.payload.ttlMs,
							source: body.payload.source,
						})
						send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: { type: "pet.command.result", ok: true, result } })
					} catch (error) {
						send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: { type: "pet.command.result", ok: false, error: sanitizeLogText(error?.message || String(error)) } })
					}
					return true
				}
				case "plugin.production.request": {
					let result
					try {
						if (typeof productionService !== "function") throw new Error("Plugin production service unavailable")
						result = { ok: true, result: await productionService(structuredClone(body)) }
					} catch (error) {
						log(logger, "error", "Plugin production request failed", {
							operation: body.operation,
							pluginId: body.pluginId,
							error: "Plugin production request failed",
						})
						result = { ok: false, error: "Plugin production request failed" }
					}
					send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: { type: "plugin.production.result", requestId: raw.id, ...result } })
					return true
				}
				case "pet.say":
					petService?.say?.({ text: body.text, durationMs: body.durationMs, source: "backend" })
					return true
				case "pet.playAction":
					petService?.playAction?.({ actionId: body.actionId, loop: body.loop, source: "backend" })
					return true
				case "pet.event":
					petService?.setEvent?.({ event: body.name, payload: body.payload, source: "backend" })
					return true
				case "notify":
					onNotify?.(body)
					return true
				case "tray.setBadge":
					onBadge?.(body.count)
					return true
				case "window.openPluginDashboard":
					// Shell owns all BrowserWindow options. The backend may identify the
					// plugin only; URL/preload/webPreferences/path are deliberately dropped.
					onDashboard?.({ pluginId: body.pluginId })
					return true
				case "ready":
				case "degraded":
					return true
				case "settings.changed":
					onSettingsChanged?.({ paths: [...body.paths], version: body.version })
					return true
				case "settings.apply.request": {
					let result
					try {
						if (typeof onSettingsApplyRequest !== "function") throw new Error("Shell settings host effect unavailable")
						await onSettingsApplyRequest({
							v: parsed.envelope.v,
							id: parsed.envelope.id,
							at: parsed.envelope.at,
							body: {
								type: body.type,
								paths: [...body.paths],
								version: body.version,
								...(body.values === undefined ? {} : { values: structuredClone(body.values) }),
							},
						})
						result = { ok: true }
					} catch (error) {
						result = { ok: false, error: error?.message || String(error) }
					}
					send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: { type: "settings.apply.result", version: body.version, ...result } })
					return true
				}
				case "settings.command.request": {
					let response
					try {
						if (typeof onSettingsCommandRequest !== "function") throw Object.assign(new Error("Shell Settings authority unavailable"), { code: "BACKEND_UNAVAILABLE" })
						const result = await onSettingsCommandRequest({ operation: body.operation, payload: structuredClone(body.payload) })
						response = { ok: true, result }
					} catch (error) {
						const code = ["VALIDATION_FAILED", "BACKEND_UNAVAILABLE", "NOT_FOUND", "INTERNAL"].includes(error?.code) ? error.code : "INTERNAL"
						const message = code === "VALIDATION_FAILED" ? "Settings command input is invalid" : code === "BACKEND_UNAVAILABLE" ? "Settings command is unavailable" : "Settings command failed"
						response = { ok: false, error: { code, message } }
					}
					send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: { type: "settings.command.result", operation: body.operation, ...response } })
					return true
				}
				case "secrets.persist.request": {
					const providerId = body.providerId.trim()
					let result
					try {
						if (!secretService) throw new Error("Shell secret service unavailable")
						if (body.value === null) {
							if (typeof secretService.deleteSecret !== "function") throw new Error("Shell secret deletion unavailable")
							await secretService.deleteSecret(providerId)
						} else {
							if (typeof secretService.setSecret !== "function") throw new Error("Shell secret persistence unavailable")
							await secretService.setSecret({ id: providerId, value: body.value, label: providerId, kind: "provider" })
						}
						result = { ok: true }
					} catch (error) {
						log(logger, "error", "Provider key persistence failed", {
							providerId,
							error: sanitizeLogText(error?.message || String(error), { secretValues: [body.value] }),
						})
						result = { ok: false, error: "Provider key persistence failed" }
					}
					send({
						v: BRIDGE_PROTOCOL_VERSION,
						id: raw.id,
						at: Date.now(),
						body: { type: "secrets.persist.result", providerId, ...result },
					})
					return true
				}
				case "catalog.request": {
					let response
					try {
						if (typeof onCatalogRequest !== "function") throw new Error("Shell Catalog service unavailable")
						response = { ok: true, result: await onCatalogRequest(body.request) }
					} catch (error) { response = { ok: false, error: error?.message || String(error) } }
					send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: { type: "catalog.result", ...response } })
					return true
				}
				case "dialog.request": {
					if (typeof dialog?.showOpenDialog !== "function") throw new Error("Shell dialog 不可用")
					const result = await dialog.showOpenDialog({ properties: dialogProperties(body.mode) })
					const paths = result?.canceled ? null : (Array.isArray(result?.filePaths) ? result.filePaths : [])
					send({
						v: BRIDGE_PROTOCOL_VERSION,
						id: raw.id,
						at: Date.now(),
						body: { type: "dialog.result", requestId: body.requestId, paths },
					})
					return true
				}
				default:
					// parseEnvelope's immutable allowlist makes this unreachable.
					return false
			}
		} catch (error) {
			log(logger, "error", "处理 sidecar 消息失败", { type: body.type, error: String(error) })
			return false
		}
	}

	return { handle }
}

module.exports = { BACKEND_TO_SHELL_TYPES, createMessageHandler, parseEnvelope }
