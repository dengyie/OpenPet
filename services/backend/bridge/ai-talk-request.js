import { ERROR_CODES } from "@openpet/contracts"
import { ApiError } from "../http/middleware.js"

export async function requestShellAiTalk(shell, operation, payload = {}, { timeoutMs } = {}) {
	if (typeof shell?.request !== "function") throw new ApiError("BACKEND_UNAVAILABLE", "Shell AI services are unavailable")
	const response = await shell.request(
		{ type: "ai.talk.request", operation, payload },
		{ expectedType: "ai.talk.result", expectedOperation: operation, ...(timeoutMs ? { timeoutMs } : {}) },
	)
	const body = response?.body
	if (body?.ok === true) return body.result
	const code = ERROR_CODES.includes(body?.error?.code) ? body.error.code : "INTERNAL"
	throw new ApiError(code, body?.error?.message || "Shell AI operation failed")
}
