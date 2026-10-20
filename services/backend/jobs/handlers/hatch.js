import { ApiError } from "../../http/middleware.js"
import { requestShellAiTalk } from "../../bridge/ai-talk-request.js"

export function createHatchJobHandlers({ shell, logger } = {}) {
	return {
		"hatch.run": async ({ job, report, signal }) => {
			const input = job.input ?? {}
			const runId = input.runId
			if (typeof runId !== "string" || !runId) throw new ApiError("VALIDATION_FAILED", "Hatch runId is required")
			let stopPromise = null
			const stop = () => {
				stopPromise = requestShellAiTalk(shell, "hatch.stop", { runId }, { timeoutMs: 5_000 }).catch((error) => {
					const code = typeof error?.code === "string" && /^[A-Z_]{1,64}$/.test(error.code) ? error.code : "BACKEND_UNAVAILABLE"
					logger?.warn?.("Hatch Job stop request failed", { jobId: job.id, runId, code })
				})
			}
			signal?.addEventListener("abort", stop, { once: true })
			try {
				if (signal?.aborted) throw new ApiError("CONFLICT", "Hatch run was canceled")
				report?.({ phase: "shadow-planning", percent: 10 })
				const result = await requestShellAiTalk(shell, "hatch.start", input, { timeoutMs: 120_000 })
				if (signal?.aborted) throw new ApiError("CONFLICT", "Hatch run was canceled")
				report?.({ phase: "shadow-complete", percent: 100 })
				return result
			} finally {
				signal?.removeEventListener("abort", stop)
				await stopPromise
			}
		},
	}
}
