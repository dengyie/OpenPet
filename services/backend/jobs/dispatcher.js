import { ApiError } from "../http/middleware.js"

export function createJobDispatcher({ queue, runner, publish, logger } = {}) {
	if (!queue?.enqueue || !queue?.next || !runner?.run) throw new ApiError("INTERNAL", "Job dispatcher 需要 queue 与 runner")
	return (input) => {
		const job = queue.enqueue(input)
		publish?.("job.created", job)
		while (true) {
			const next = queue.next()
			if (!next) break
			void runner.run(next).catch((error) => logger?.error?.("Job 执行失败", { jobId: next.id, error: String(error) }))
		}
		return job
	}
}
