// This is intentionally independent from T11's 1,000-frame SSE buffer. The
// writer must absorb a full per-plugin retention window before applying its
// own explicit overload policy.
export const PLUGIN_LOG_QUEUE_MAX = 10_000

export function createPluginLogWriter({
	append,
	logger,
	maxQueue = PLUGIN_LOG_QUEUE_MAX,
	batchSize = 100,
	onOverflow,
	setImmediate: schedule = setImmediate,
} = {}) {
	if (typeof append !== "function") throw new TypeError("plugin log writer requires append")
	if (!Number.isInteger(maxQueue) || maxQueue < 1) throw new TypeError("plugin log writer maxQueue must be positive")
	if (!Number.isInteger(batchSize) || batchSize < 1) throw new TypeError("plugin log writer batchSize must be positive")

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
	let cycleError = null

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
		let processed = 0
		try {
			while (queue.length > 0 && processed < batchSize) {
				const entry = queue.shift()
				processed += 1
				try {
					append(entry)
					persisted += 1
				} catch (error) {
					failed += 1
					cycleError = error
					lastError = error
					logger?.error?.("插件日志写入 SQLite 失败", {
						pluginId: entry.pluginId,
						error: String(error),
					})
				}
			}
		} finally {
			draining = false
			if (queue.length > 0) scheduleDrain()
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
			const details = { pluginId: entry.pluginId, maxQueue, dropped, reason: "queue-full" }
			logger?.warn?.("插件日志队列已满,丢弃日志", details)
			try {
				onOverflow?.({ entry: structuredClone(entry), ...details })
			} catch (error) {
				logger?.warn?.("插件日志溢出通知失败", { pluginId: entry.pluginId, error: String(error) })
			}
			return { accepted: false, reason: "queue-full" }
		}
		if (queue.length === 0 && !draining) {
			cycleError = null
			lastError = null
		}
		queue.push(entry)
		accepted += 1
		scheduleDrain()
		return { accepted: true }
	}

	const flush = () => {
		if (!draining && queue.length > 0) drain()
		if (!draining && queue.length === 0) return cycleError ? Promise.reject(cycleError) : Promise.resolve()
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
