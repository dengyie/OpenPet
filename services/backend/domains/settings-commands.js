import { ERROR_CODES } from "@openpet/contracts"

import { ApiError } from "../http/middleware.js"

const ERROR_CODE_SET = new Set(ERROR_CODES)

export function createSettingsCommands({ shell } = {}) {
	if (typeof shell?.request !== "function") throw new TypeError("Shell Settings command bridge required")

	const request = async (operation, payload) => {
		let envelope
		try {
			envelope = await shell.request(
				{ type: "settings.command.request", operation, payload },
				{ expectedType: "settings.command.result", expectedOperation: operation, timeoutMs: operation === "import-cursor" ? 180_000 : undefined },
			)
		} catch (cause) {
			if (cause instanceof ApiError) throw cause
			throw new ApiError("BACKEND_UNAVAILABLE", "Shell Settings authority unavailable", { cause })
		}
		const body = envelope?.body
		if (body?.type !== "settings.command.result" || body.operation !== operation || typeof body.ok !== "boolean") {
			throw new ApiError("INTERNAL", "Shell Settings response is invalid")
		}
		if (body.ok) {
			if (body.result === undefined || body.error !== undefined) throw new ApiError("INTERNAL", "Shell Settings success response is invalid")
			return body.result
		}
		if (body.result !== undefined || !body.error || typeof body.error !== "object" || Object.keys(body.error).some((key) => !["code", "message"].includes(key))) {
			throw new ApiError("INTERNAL", "Shell Settings failure response is invalid")
		}
		const code = ERROR_CODE_SET.has(body.error.code) ? body.error.code : "INTERNAL"
		throw new ApiError(code, typeof body.error.message === "string" ? body.error.message : "Shell Settings command failed")
	}

	return {
		previewScale: (scale) => request("preview-scale", { scale }),
		importCursor: () => request("import-cursor", {}),
	}
}
