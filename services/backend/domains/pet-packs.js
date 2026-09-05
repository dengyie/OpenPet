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

function throwAuthorityError(error) {
	const code = ERROR_CODE_SET.has(error?.code) ? error.code : "INTERNAL"
	throw new ApiError(code, error?.message || "Shell Pet Pack operation failed", {
		...(code === "PET_PACK_INCOMPATIBLE" ? { status: 400 } : {}),
	})
}

export function createPetPackService({ shell, jobs } = {}) {
	if (typeof shell?.request !== "function") throw new TypeError("Shell Pet Pack bridge required")

	const requestAuthority = async (operation, payload = {}) => {
		let envelope
		try {
			envelope = await shell.request(
				{ type: "pet-packs.request", operation, payload },
				{ expectedType: "pet-packs.result", expectedOperation: operation },
			)
		} catch (cause) {
			if (cause instanceof ApiError) throw cause
			throw new ApiError("BACKEND_UNAVAILABLE", "Shell Pet Pack authority unavailable", { cause })
		}
		const body = envelope?.body
		if (body?.type !== "pet-packs.result" || body.operation !== operation || typeof body.ok !== "boolean") {
			throw new ApiError("INTERNAL", "Shell Pet Pack response is invalid")
		}
		if (!body.ok) throwAuthorityError(body.error)
		return body.result
	}

	const list = () => requestAuthority("list")
	const get = (id) => requestAuthority("manifest", { packId: safeId(id) })
	const inspect = (sourcePath) => requestAuthority("validate", {
		sourcePath: requiredString(sourcePath, "pet pack path"),
	})
	const clearSelection = (selectionId) => requestAuthority("clear-selection", {
		selectionId: requiredString(selectionId, "selectionId"),
	})
	const activate = (id) => requestAuthority("activate", { packId: safeId(id) })
	const remove = (id) => requestAuthority("remove", { packId: safeId(id) })

	const importPack = (input = {}) => {
		const request = typeof input === "string" ? { sourcePath: input } : input
		const selectionId = typeof request?.selectionId === "string" && request.selectionId.trim()
			? request.selectionId
			: null
		const sourcePath = typeof request?.path === "string" && request.path.trim()
			? request.path
			: typeof request?.sourcePath === "string" && request.sourcePath.trim() ? request.sourcePath : null
		if (!selectionId && !sourcePath) fail("selectionId or pet pack path is required")
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const job = jobs.insert({
			id: `pet-pack-import:${randomUUID()}`,
			kind: "pet-pack.import",
			input: { ...(selectionId ? { selectionId } : {}), ...(sourcePath ? { sourcePath } : {}) },
			resourceKey: "pet-pack:import",
		})
		return { jobId: job.id }
	}

	const exportPack = (id, target) => {
		const packId = safeId(id)
		if (target !== undefined && (typeof target !== "string" || target.trim().length === 0)) {
			fail("export target must be a non-empty path")
		}
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const job = jobs.insert({
			id: `pet-pack-export:${randomUUID()}`,
			kind: "pet-pack.export",
			input: { packId, ...(target === undefined ? {} : { target }) },
			resourceKey: `pet-pack:${packId}`,
		})
		return { jobId: job.id }
	}

	const runImport = async ({ selectionId, sourcePath, signal, report, finalize } = {}) => {
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		report?.({ phase: "importing", percent: 25, message: "Importing pet pack through Shell" })
		const operation = () => requestAuthority("import", {
			...(selectionId ? { selectionId } : {}),
			...(sourcePath ? { sourcePath } : {}),
		})
		if (typeof finalize === "function") return finalize(operation)
		const result = await operation()
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		report?.({ phase: "finalizing", percent: 100, message: "Pet pack imported" })
		return result
	}

	const runExport = async ({ packId, target, signal, report, finalize } = {}) => {
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		report?.({ phase: "exporting", percent: 25, message: "Exporting pet pack through Shell" })
		const operation = () => requestAuthority("export", {
			packId: safeId(packId),
			...(target === undefined ? {} : { target }),
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
