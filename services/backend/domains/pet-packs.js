import { randomUUID } from "node:crypto"

import { ERROR_CODES } from "@openpet/contracts"
import { ApiError } from "../http/middleware.js"

export const PET_PACK_ROUTES = Object.freeze([
	"GET /pet-packs",
	"POST /pet-packs/import",
	"POST /pet-packs/:id/activate",
	"DELETE /pet-packs/:id",
	"POST /pet-packs/:id/export",
	"GET /pet-packs/:id/manifest",
	"POST /pet-packs/validate",
])

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const ERROR_CODE_SET = new Set(ERROR_CODES)
const MAX_PATH_LENGTH = 4096
const PET_PACK_PICK_TIMEOUT_MS = 180_000

function fail(message, details = null) {
	throw new ApiError("VALIDATION_FAILED", message, { details })
}

function safeId(value) {
	if (typeof value !== "string" || !SAFE_ID.test(value)) fail("Pet pack id is invalid", { id: value ?? null })
	return value
}

function requiredString(value, field) {
	if (typeof value !== "string" || value.trim().length === 0) fail(`${field} is required`)
	return value
}

function boundedPath(value, field) {
	const path = requiredString(value, field)
	if (path.length > MAX_PATH_LENGTH) fail(`${field} must be within ${MAX_PATH_LENGTH} characters`)
	return path
}

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function throwAuthorityError(error) {
	const code = ERROR_CODE_SET.has(error?.code) ? error.code : "INTERNAL"
	throw new ApiError(code, error?.message || "Shell Pet Pack operation failed", {
		...(code === "PET_PACK_INCOMPATIBLE" ? { status: 400 } : {}),
	})
}

export function createPetPackService({ shell, jobs, logger } = {}) {
	if (typeof shell?.request !== "function") throw new TypeError("Shell Pet Pack bridge required")

	const requestAuthority = async (operation, payload = {}, options = {}) => {
		let envelope
		try {
			envelope = await shell.request(
				{ type: "pet-packs.request", operation, payload },
				{
					expectedType: "pet-packs.result",
					expectedOperation: operation,
					...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
				},
			)
		} catch (cause) {
			if (cause instanceof ApiError) throw cause
			throw new ApiError("BACKEND_UNAVAILABLE", "Shell Pet Pack authority unavailable", { cause })
		}
		const body = envelope?.body
		if (body?.type !== "pet-packs.result" || body.operation !== operation || typeof body.ok !== "boolean") {
			throw new ApiError("INTERNAL", "Shell Pet Pack response is invalid")
		}
		if (Object.keys(body).some((key) => !["type", "operation", "ok", "result", "error"].includes(key))) {
			throw new ApiError("INTERNAL", "Shell Pet Pack response contains unsupported fields")
		}
		if (body.ok) {
			if (!Object.hasOwn(body, "result") || body.result === undefined || body.error !== undefined) {
				throw new ApiError("INTERNAL", "Shell Pet Pack success response is invalid")
			}
			return body.result
		}
		if (
			body.result !== undefined
			|| body.error === undefined
			|| !isPlainObject(body.error)
			|| Object.keys(body.error).some((key) => !["code", "message"].includes(key))
		) {
			throw new ApiError("INTERNAL", "Shell Pet Pack failure response is invalid")
		}
		throwAuthorityError(body.error)
	}

	const list = () => requestAuthority("list")
	const get = (id) => requestAuthority("manifest", { packId: safeId(id) })
	const pick = () => requestAuthority("pick", {}, { timeoutMs: PET_PACK_PICK_TIMEOUT_MS })
	const inspect = (sourcePath) => requestAuthority("validate", {
		sourcePath: boundedPath(sourcePath, "pet pack path"),
	})
	const clearSelection = (selectionId) => requestAuthority("clear-selection", {
		selectionId: requiredString(selectionId, "selectionId"),
	})
	const activate = (id) => requestAuthority("activate", { packId: safeId(id) })
	const remove = (id) => requestAuthority("remove", { packId: safeId(id) })

	const importPack = (input = {}) => {
		const request = typeof input === "string" ? { sourcePath: input } : input
		if (!isPlainObject(request) || Object.keys(request).some((key) => !["selectionId", "path", "sourcePath"].includes(key))) fail("Pet Pack import request is invalid")
		if (Object.keys(request).length !== 1) fail("Pet Pack import requires exactly one selectionId or path")
		const selectionId = typeof request.selectionId === "string" && request.selectionId.trim() ? request.selectionId : null
		const sourcePath = typeof request.path === "string" && request.path.trim()
			? request.path
			: typeof request.sourcePath === "string" && request.sourcePath.trim() ? request.sourcePath : null
		if (Boolean(selectionId) === Boolean(sourcePath) || (selectionId && selectionId.length > 160) || (sourcePath && sourcePath.length > 4096)) fail("Pet Pack import requires exactly one valid selectionId or path")
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const job = jobs.insert({
			id: `pet-pack-import:${randomUUID()}`,
			kind: "pet-pack.import",
			input: selectionId ? { selectionId } : { sourcePath },
			resourceKey: "pet-pack:import",
		})
		return { jobId: job.id }
	}

	const exportPack = (id, target) => {
		const packId = safeId(id)
		if (target !== undefined) boundedPath(target, "export target")
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const job = jobs.insert({
			id: `pet-pack-export:${randomUUID()}`,
			kind: "pet-pack.export",
			input: { packId, ...(target === undefined ? {} : { target }) },
			resourceKey: `pet-pack:${packId}`,
		})
		return { jobId: job.id }
	}

	const runImport = async (input = {}) => {
		if (!isPlainObject(input) || Object.keys(input).some((key) => !["selectionId", "sourcePath", "signal", "report", "finalize"].includes(key))) fail("Pet Pack import request is invalid")
		const { selectionId, sourcePath, signal, report, finalize } = input
		const hasSelectionId = typeof selectionId === "string" && Boolean(selectionId.trim()) && selectionId.length <= 160
		const hasSourcePath = typeof sourcePath === "string" && Boolean(sourcePath.trim()) && sourcePath.length <= 4096
		if (hasSelectionId === hasSourcePath || (selectionId !== undefined && !hasSelectionId) || (sourcePath !== undefined && !hasSourcePath)) {
			fail("Pet Pack import requires exactly one valid selectionId or path")
		}
		let result
		let failure = null
		try {
			if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
			report?.({ phase: "importing", percent: 25, message: "Importing pet pack through Shell" })
			const operation = () => requestAuthority("import", hasSelectionId ? { selectionId } : { sourcePath })
			if (typeof finalize === "function") result = await finalize(operation)
			else result = await operation()
			if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
			if (typeof finalize !== "function") report?.({ phase: "finalizing", percent: 100, message: "Pet pack imported" })
		} catch (error) {
			failure = error
		}
		if (hasSelectionId) {
			try {
				await requestAuthority("clear-selection", { selectionId })
			} catch (cleanupError) {
				logger?.warn?.("Pet Pack selection cleanup failed", {
					operation: "import",
					selectionId,
					errorCode: cleanupError?.code ?? "INTERNAL",
				})
				if (failure) {
					const primaryError = failure instanceof Error ? failure : new Error(String(failure), { cause: failure })
					primaryError.cleanupError = cleanupError
					throw primaryError
				}
			}
		}
		if (failure) throw failure
		return result
	}

	const runExport = async ({ packId, target, signal, report, finalize } = {}) => {
		const normalizedPackId = safeId(packId)
		const normalizedTarget = target === undefined ? undefined : boundedPath(target, "export target")
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		report?.({ phase: "exporting", percent: 25, message: "Exporting pet pack through Shell" })
		const operation = () => requestAuthority("export", {
			packId: normalizedPackId,
			...(normalizedTarget === undefined ? {} : { target: normalizedTarget }),
		})
		if (typeof finalize === "function") return finalize(operation)
		const result = await operation()
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		report?.({ phase: "finalizing", percent: 100, message: "Pet pack export finished" })
		return result
	}

	return {
		list,
		get,
		pick,
		activate,
		remove,
		inspect,
		clearSelection,
		import: importPack,
		export: exportPack,
		runImport,
		runExport,
		status: () => ({ authority: "shell" }),
	}
}
