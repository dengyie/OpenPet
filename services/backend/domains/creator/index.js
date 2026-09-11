import { createHash, randomUUID } from "node:crypto"

import { ApiError } from "../../http/middleware.js"

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/
const SAFE_PATH = /^[^\\/][^\0]*$/
const MAX_NAME = 160
const MAX_PROMPT = 8_000
const CREATOR_OPERATION_SET = new Set([
	"pick-reference",
	"bind-reference",
	"delete-reference",
	"get-state",
	"get-last-run",
	"asset-preview",
	"generate-character",
	"generate-action",
	"run-workflow",
	"evaluate-sprite",
	"retry-action",
	"retry-identity",
	"accept-identity",
	"accept-action-candidate",
	"export-recovery",
	"import-actions",
])

const SENSITIVE_KEY = /api.?key|password|secret|token|credential|authorization|cookie/i

function object(value, field = "body") {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new ApiError("VALIDATION_FAILED", `${field} must be an object`, { details: { field } })
	}
	return value
}

function text(value, field, { max = MAX_NAME, optional = false } = {}) {
	if (value === undefined && optional) return ""
	if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
		throw new ApiError("VALIDATION_FAILED", `${field} must be a non-empty string`, { details: { field, max } })
	}
	return value.trim()
}

function safeId(value, field) {
	const normalized = text(value, field, { max: 128 })
	if (!SAFE_ID.test(normalized)) throw new ApiError("VALIDATION_FAILED", `${field} has an invalid format`, { details: { field } })
	return normalized
}

function safePath(value, field = "relativePath") {
	const normalized = text(value, field, { max: 512 }).replace(/\\/g, "/")
	if (!SAFE_PATH.test(normalized) || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized) || normalized.split("/").includes("..")) {
		throw new ApiError("VALIDATION_FAILED", `${field} must be a relative path`, { details: { field } })
	}
	return normalized
}

function safeJson(value, fallback = {}) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return fallback
	try {
		return JSON.parse(JSON.stringify(value))
	} catch {
		return fallback
	}
}

function redact(value, key = "", options = {}) {
	if (options.allowReferenceTokens && (key === "referenceToken" || key === "referenceImageToken")) return value
	if (SENSITIVE_KEY.test(key)) return "[redacted]"
	if (typeof value === "string") {
		if (value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("file://")) return "[path-redacted]"
		return value.length > 8_000 ? value.slice(0, 8_000) : value
	}
	if (Array.isArray(value)) return value.map((entry) => redact(entry, "", options))
	if (!value || typeof value !== "object") return value
	return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, redact(entry, entryKey, options)]))
}

function parseJson(value, fallback = {}) {
	if (value === null || value === undefined) return fallback
	try { return JSON.parse(value) } catch { return fallback }
}

function tokenHash(token) {
	return createHash("sha256").update(String(token), "utf8").digest("hex")
}

function publicReference(row) {
	if (!row) return null
	return {
		id: row.id,
		targetType: row.target_type,
		targetId: row.target_id,
		fileName: row.file_name,
		width: Number(row.width) || 0,
		height: Number(row.height) || 0,
		contentHash: row.content_hash || "",
		relativePath: row.relative_path || "",
		metadata: redact(parseJson(row.metadata_json)),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function publicFlow(row) {
	if (!row) return null
	return {
		id: row.id,
		owner: row.owner,
		name: row.name,
		config: redact(parseJson(row.config_json)),
		state: redact(parseJson(row.state_json)),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function publicRun(row) {
	if (!row) return null
	return {
		id: row.id,
		owner: row.owner,
		flowId: row.flow_id,
		mode: row.mode,
		status: row.status,
		state: redact(parseJson(row.state_json)),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function publicArtifact(row) {
	return {
		id: row.id,
		runId: row.run_id,
		kind: row.kind,
		relativePath: row.relative_path,
		sha256: row.sha256 || "",
		metadata: redact(parseJson(row.metadata_json)),
		createdAt: row.created_at,
	}
}

function normalizeJobInput(kind, input) {
	const source = object(input, "job input")
	const base = { operation: source.operation || kind, flowId: source.flowId || "" }
	for (const key of ["characterName", "stylePrompt", "actionName", "motionPrompt", "runId", "actionId", "candidateId", "sha256", "qualityOverride", "acknowledgedWarningCodes", "activate", "relativePath"]) {
		if (source[key] !== undefined) base[key] = redact(source[key], key)
	}
	return redact(base)
}

export function redactCreatorValue(value) {
	return redact(value)
}

export function createCreatorDomain({ db, shell, enqueueJob, emit, owner = "desktop", now = Date.now, logger } = {}) {
	if (!db || typeof db.prepare !== "function") throw new ApiError("INTERNAL", "Creator domain 需要数据库 driver")
	if (typeof shell?.request !== "function") throw new ApiError("BACKEND_UNAVAILABLE", "Creator Shell bridge unavailable")
	if (!SAFE_ID.test(owner)) throw new ApiError("VALIDATION_FAILED", "Creator owner is invalid")

	const privateInputs = new Map()
	const authority = async (operation, payload = {}) => {
		if (!CREATOR_OPERATION_SET.has(operation)) throw new ApiError("VALIDATION_FAILED", "Unsupported Creator operation")
		let reply
		try {
			reply = await shell.request(
				{ type: "creator.request", operation, payload: redact(payload, "", { allowReferenceTokens: true }) },
				{ expectedType: "creator.result", expectedOperation: operation },
			)
		} catch (cause) {
			if (cause instanceof ApiError) throw cause
			throw new ApiError("BACKEND_UNAVAILABLE", "Creator Shell authority unavailable", { cause })
		}
		const body = reply?.body
		if (body?.type !== "creator.result" || body.operation !== operation || typeof body.ok !== "boolean") {
			throw new ApiError("INTERNAL", "Shell Creator response is invalid")
		}
		if (!body.ok) throw new ApiError(body.error?.code || "INTERNAL", body.error?.message || "Creator operation failed")
		return redact(body.result, "", { allowReferenceTokens: true })
	}

	const byId = (id) => db.prepare("SELECT * FROM creator_flows WHERE owner = ? AND id = ?").get(owner, id)
	const runById = (id) => db.prepare("SELECT * FROM creator_runs WHERE owner = ? AND id = ?").get(owner, id)
	const saveRun = (value = {}, flowId = null) => {
		const input = object(value, "run")
		const id = safeId(input.runId || input.id, "runId")
		const timestamp = now()
		const current = runById(id)
		const state = redact(input)
		if (current) {
			db.prepare("UPDATE creator_runs SET flow_id = ?, mode = ?, status = ?, state_json = ?, updated_at = ? WHERE owner = ? AND id = ?")
				.run(flowId || current.flow_id || null, text(input.mode || current.mode || "", "mode", { max: 80, optional: true }), text(input.status || current.status || "unknown", "status", { max: 80, optional: true }) || "unknown", JSON.stringify(state), timestamp, owner, id)
		} else {
			db.prepare("INSERT INTO creator_runs (id, owner, flow_id, mode, status, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
				.run(id, owner, flowId || null, text(input.mode || "", "mode", { max: 80, optional: true }), text(input.status || "unknown", "status", { max: 80, optional: true }) || "unknown", JSON.stringify(state), timestamp, timestamp)
		}
		return publicRun(runById(id))
	}

	const syncResult = (result, flowId = null) => {
		const candidate = result?.run || result?.result?.run || result
		if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && (candidate.runId || candidate.id)) saveRun(candidate, flowId)
		return redact(result)
	}

	const listFlows = () => db.prepare("SELECT * FROM creator_flows WHERE owner = ? ORDER BY updated_at DESC, id ASC").all(owner).map(publicFlow)
	const createFlow = (input = {}) => {
		object(input)
		const id = input.id === undefined ? `flow-${randomUUID()}` : safeId(input.id, "id")
		const name = text(input.name, "name")
		const timestamp = now()
		try {
			db.prepare("INSERT INTO creator_flows (id, owner, name, config_json, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
				.run(id, owner, name, JSON.stringify(redact(input.config || {})), JSON.stringify(redact(input.state || {})), timestamp, timestamp)
		} catch (error) {
			if (String(error?.message).includes("SQLITE_CONSTRAINT")) throw new ApiError("CONFLICT", "Creator flow already exists", { cause: error })
			throw error
		}
		return publicFlow(byId(id))
	}
	const updateFlow = (id, input = {}) => {
		const flowId = safeId(id, "id")
		if (!byId(flowId)) throw new ApiError("NOT_FOUND", "Creator flow not found", { details: { id: flowId } })
		object(input)
		const current = byId(flowId)
		const name = input.name === undefined ? current.name : text(input.name, "name")
		const config = input.config === undefined ? parseJson(current.config_json) : redact(input.config)
		const state = input.state === undefined ? parseJson(current.state_json) : redact(input.state)
		db.prepare("UPDATE creator_flows SET name = ?, config_json = ?, state_json = ?, updated_at = ? WHERE owner = ? AND id = ?")
			.run(name, JSON.stringify(config), JSON.stringify(state), now(), owner, flowId)
		return publicFlow(byId(flowId))
	}
	const deleteFlow = (id) => {
		const flowId = safeId(id, "id")
		const result = db.prepare("DELETE FROM creator_flows WHERE owner = ? AND id = ?").run(owner, flowId)
		if (Number(result.changes) !== 1) throw new ApiError("NOT_FOUND", "Creator flow not found", { details: { id: flowId } })
		return { id: flowId, deleted: true }
	}

	const listReferences = () => db.prepare("SELECT * FROM creator_references WHERE owner = ? ORDER BY updated_at DESC, id ASC").all(owner).map(publicReference)
	const referenceByTarget = (targetType, targetId) => db.prepare("SELECT * FROM creator_references WHERE owner = ? AND target_type = ? AND target_id = ?").get(owner, targetType, targetId)
	const bindReference = async (input = {}) => {
		object(input)
		const targetType = safeId(input.targetType, "targetType")
		const targetId = safeId(input.targetId, "targetId")
		const referenceToken = text(input.referenceToken, "referenceToken", { max: 512 })
		const result = await authority("bind-reference", { targetType, targetId, referenceToken })
		const view = result?.reference || result
		const timestamp = now()
		const existing = referenceByTarget(targetType, targetId)
		const id = existing?.id || `ref-${randomUUID()}`
		const relativePath = view?.relativePath ? safePath(view.relativePath) : ""
		const record = {
			id, owner, targetType, targetId,
			fileName: text(view?.fileName || view?.originalFileName || "reference", "fileName", { max: 256 }),
			width: Math.max(0, Math.trunc(Number(view?.width) || 0)),
			height: Math.max(0, Math.trunc(Number(view?.height) || 0)),
			contentHash: /^[a-f0-9]{64}$/i.test(String(view?.contentHash || "")) ? String(view.contentHash).toLowerCase() : "",
			relativePath,
			metadata: redact(view?.metadata || {}),
		}
		if (existing) {
			db.prepare("UPDATE creator_references SET token_hash = ?, file_name = ?, width = ?, height = ?, content_hash = ?, relative_path = ?, metadata_json = ?, updated_at = ? WHERE owner = ? AND id = ?")
				.run(tokenHash(referenceToken), record.fileName, record.width, record.height, record.contentHash, record.relativePath, JSON.stringify(record.metadata), timestamp, owner, id)
		} else {
			db.prepare("INSERT INTO creator_references (id, owner, target_type, target_id, token_hash, file_name, width, height, content_hash, relative_path, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
				.run(id, owner, targetType, targetId, tokenHash(referenceToken), record.fileName, record.width, record.height, record.contentHash, record.relativePath, JSON.stringify(record.metadata), timestamp, timestamp)
		}
		return { ok: true, replaced: Boolean(existing), reference: publicReference(db.prepare("SELECT * FROM creator_references WHERE owner = ? AND id = ?").get(owner, id)) }
	}
	const deleteReference = async (input = {}) => {
		object(input)
		const targetType = safeId(input.targetType, "targetType")
		const targetId = safeId(input.targetId, "targetId")
		const authorityResult = await authority("delete-reference", { targetType, targetId })
		const result = db.prepare("DELETE FROM creator_references WHERE owner = ? AND target_type = ? AND target_id = ?").run(owner, targetType, targetId)
		if (Number(result.changes) !== 1 && authorityResult?.deleted !== true) throw new ApiError("NOT_FOUND", "Creator reference not found")
		return { deleted: true, targetType, targetId }
	}

	const enqueue = (kind, input, resourceKey = null) => {
		if (typeof enqueueJob !== "function") throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const id = `${kind}:${randomUUID()}`
		privateInputs.set(id, safeJson(input, {}))
		try {
			const job = enqueueJob({ id, kind, input: normalizeJobInput(kind, input), resourceKey })
			return { jobId: job.id }
		} catch (error) {
			privateInputs.delete(id)
			throw error
		}
	}
	const getJobInput = (jobId, fallback) => privateInputs.get(jobId) || fallback || null
	const forgetJobInput = (jobId) => privateInputs.delete(jobId)

	const getState = async () => syncResult(await authority("get-state"))
	const getLastRun = async () => syncResult(await authority("get-last-run"))
	const getAssetPreview = async (input = {}) => {
		object(input)
		return authority("asset-preview", { runId: safeId(input.runId, "runId"), relativePath: safePath(input.relativePath) })
	}
	const runCharacter = async (input, ctx = {}) => {
		ctx.report?.({ phase: "preparing", percent: 5 })
		const result = await authority("generate-character", input)
		ctx.report?.({ phase: "generating", percent: 65 })
		return ctx.finalize ? ctx.finalize(() => syncResult(result, input.flowId || null)) : syncResult(result, input.flowId || null)
	}
	const runAction = async (input, ctx = {}) => {
		ctx.report?.({ phase: "preparing", percent: 5 })
		const result = await authority("generate-action", input)
		ctx.report?.({ phase: "generating", percent: 65 })
		return ctx.finalize ? ctx.finalize(() => syncResult(result, input.flowId || null)) : syncResult(result, input.flowId || null)
	}
	const runWorkflow = async (input, ctx = {}) => {
		ctx.report?.({ phase: "running", percent: 10 })
		const operation = input.operation || "generate-action"
		const result = await authority(operation, input)
		ctx.report?.({ phase: "running", percent: 75 })
		return ctx.finalize ? ctx.finalize(() => syncResult(result, input.flowId || null)) : syncResult(result, input.flowId || null)
	}
	const runExport = async (input, ctx = {}) => {
		ctx.report?.({ phase: "exporting", percent: 25 })
		const result = await authority("export-recovery", { runId: safeId(input.runId, "runId") })
		return ctx.finalize ? ctx.finalize(() => syncResult(result, null)) : syncResult(result, null)
	}
	const artifacts = (runId) => {
		const id = safeId(runId, "runId")
		if (!runById(id)) throw new ApiError("NOT_FOUND", "Creator run not found", { details: { runId: id } })
		return db.prepare("SELECT * FROM creator_artifacts WHERE owner = ? AND run_id = ? ORDER BY created_at DESC, id ASC").all(owner, id).map(publicArtifact)
	}
	const recordArtifacts = (runId, values = []) => {
		const id = safeId(runId, "runId")
		if (!runById(id)) saveRun({ runId: id, status: "unknown" })
		for (const value of Array.isArray(values) ? values : []) {
			if (!value || typeof value !== "object") continue
			const relativePath = safePath(value.relativePath || value.path)
			db.prepare("INSERT OR REPLACE INTO creator_artifacts (id, owner, run_id, kind, relative_path, sha256, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
				.run(value.id || `artifact-${randomUUID()}`, owner, id, text(value.kind || "artifact", "kind", { max: 80 }), relativePath, /^[a-f0-9]{64}$/i.test(String(value.sha256 || "")) ? String(value.sha256).toLowerCase() : "", JSON.stringify(redact(value.metadata || {})), now())
		}
		return artifacts(id)
	}

	return {
		listFlows, createFlow, updateFlow, deleteFlow,
		listReferences, bindReference, deleteReference,
		getState, getLastRun, getAssetPreview, artifacts, recordArtifacts,
		enqueueCharacter: (input) => enqueue("creator.character", input, "creator:character"),
		enqueueAction: (input) => enqueue("sprite.generate", input, "creator:workflow"),
		enqueueSpriteEvaluation: (input) => enqueue("sprite.evaluate", input, "creator:workflow"),
		enqueueWorkflow: (input) => enqueue("creator.workflow", input, "creator:workflow"),
		enqueueExport: (input) => enqueue("creator.export", input, `creator:export:${input.runId}`),
		getJobInput, forgetJobInput,
		runCharacter, runAction, runWorkflow, runExport,
		authority,
		redact: redactCreatorValue,
	}
}

export const CREATOR_OPERATIONS = Object.freeze(Array.from(CREATOR_OPERATION_SET))
