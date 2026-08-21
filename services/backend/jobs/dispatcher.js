import { ApiError } from "../http/middleware.js"

export function createJobDispatcher({ queue, runner, publish, logger } = {}) {
	if (!queue?.enqueue || !queue?.next || !runner?.run) throw new ApiError("INTERNAL", "Job dispatcher 需要 queue 与 runner")
	function drain() {
		while (true) {
			const next = queue.next()
			if (!next) break
			void runner.run(next).catch((error) => logger?.error?.("Job 执行失败", { jobId: next.id, error: String(error) }))
		}
	}
	const dispatch = (input) => {
		const job = queue.enqueue(input)
		publish?.("job.created", job)
		drain()
		return job
	}
	dispatch.resume = (jobId) => {
		const job = queue.enqueue(jobId)
		drain()
		return job
	}
	return dispatch
}
