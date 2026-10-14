import { ApiError } from "../http/middleware.js"

export function createJobDispatcher({ queue, runner, publish, logger, privateInputs = new Map() } = {}) {
	if (!queue?.enqueue || !queue?.next || !runner?.run) throw new ApiError("INTERNAL", "Job dispatcher 需要 queue 与 runner")
	if (!privateInputs || typeof privateInputs.set !== "function" || typeof privateInputs.delete !== "function") {
		throw new ApiError("INTERNAL", "Job dispatcher 需要 private input store")
	}
	const takePrivateInput = (jobId) => {
		const value = privateInputs.get(jobId)
		privateInputs.delete(jobId)
		return value
	}
	const forgetPrivateInput = (jobId) => privateInputs.delete(jobId)
	function drain() {
		while (true) {
			const next = queue.next()
			if (!next) break
			try {
				Promise.resolve(runner.run(next)).catch((error) => {
					forgetPrivateInput(next.id)
					logger?.error?.("Job 执行失败", { jobId: next.id, error: String(error) })
				})
			} catch (error) {
				forgetPrivateInput(next.id)
				logger?.error?.("Job 执行失败", { jobId: next.id, error: String(error) })
			}
		}
	}
	const dispatch = (input) => {
		const { privateInput, ...jobInput } = input ?? {}
		const transientInput = privateInput !== undefined || jobInput.input?.redacted === true
		if (privateInput !== undefined) {
			if (typeof jobInput.id !== "string" || jobInput.id.length === 0) {
				throw new ApiError("VALIDATION_FAILED", "带 private input 的 Job 需要 id")
			}
			privateInputs.set(jobInput.id, structuredClone(privateInput))
		}
		let job
		try {
			job = queue.enqueue(jobInput)
		} catch (error) {
			if (transientInput) privateInputs.delete(jobInput.id)
			throw error
		}
		publish?.("job.created", job)
		drain()
		return job
	}
	dispatch.resume = (jobId) => {
		const job = queue.enqueue(jobId)
		drain()
		return job
	}
	dispatch.takePrivateInput = takePrivateInput
	dispatch.forgetPrivateInput = forgetPrivateInput
	return dispatch
}
