// This is intentionally independent from T11's 1,000-frame SSE buffer. The
// writer must absorb a full per-plugin retention window before applying its
// own explicit overload policy.
export const PLUGIN_LOG_QUEUE_MAX = 10_000

export function createPluginLogWriter({
	append,
	logger,
	maxQueue = PLUGIN_LOG_QUEUE_MAX,
	setImmediate: schedule = setImmediate,
} = {}) {
	if (typeof append !== "function") throw new TypeError("plugin log writer requires append")
	if (!Number.isInteger(maxQueue) || maxQueue < 1) throw new TypeError("plugin log writer maxQueue must be positive")

	const queue = []
	const waiters = []
	let scheduled = false
	let draining = false
	let closed = false
	let accepted = 0
	let persisted = 0
	let dropped = 0
	let failed = 0
	let lastError = null

	const settle = () => {
		if (draining || queue.length > 0 || !closed && scheduled) return
		const error = lastError
		while (waiters.length > 0) {
			const waiter = waiters.shift()
			if (error) waiter.reject(error)
			else waiter.resolve()
		}
	}

	const drain = () => {
		if (draining) return
		scheduled = false
		draining = true
		try {
			while (queue.length > 0) {
				const entry = queue.shift()
				try {
					append(entry)
					persisted += 1
				} catch (error) {
					failed += 1
					lastError = error
					logger?.error?.("插件日志写入 SQLite 失败", {
						pluginId: entry.pluginId,
						error: String(error),
					})
				}
			}
		} finally {
			draining = false
			settle()
		}
	}

	const scheduleDrain = () => {
		if (scheduled || draining || queue.length === 0) return
		scheduled = true
		schedule(drain)
	}

	const appendLog = (entry) => {
		if (closed) return { accepted: false, reason: "closed" }
		if (queue.length >= maxQueue) {
			dropped += 1
			logger?.warn?.("插件日志队列已满,丢弃日志", { pluginId: entry.pluginId, maxQueue })
			return { accepted: false, reason: "queue-full" }
		}
		queue.push(entry)
		accepted += 1
		scheduleDrain()
		return { accepted: true }
	}

	const flush = () => {
		if (!draining && queue.length > 0) drain()
		if (!draining && queue.length === 0) return lastError ? Promise.reject(lastError) : Promise.resolve()
		return new Promise((resolve, reject) => waiters.push({ resolve, reject }))
	}

	const close = async () => {
		closed = true
		await flush()
	}

	return {
		append: appendLog,
		flush,
		close,
		stats: () => ({ accepted, persisted, queued: queue.length, dropped, failed, closed, lastError }),
	}
}
