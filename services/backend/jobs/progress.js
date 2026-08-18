// Job 进度节流器 —— 每个运行中的 Job 各持有一个实例。
// 本模块不造定时器:runner 在 report 时推进窗口,进入终态前用 flush 保证末帧发出。

export const THROTTLE_MS = 500
export const MIN_PERCENT_DELTA = 1
export const NO_PROGRESS_PERCENT = -1

export function createProgressThrottle({ onEmit, now = Date.now } = {}) {
	let lastEmitted = null
	let lastEmittedAt = null
	let highestPercent = null
	let pending = null

	const emit = (frame, emittedAt) => {
		pending = null
		lastEmitted = frame
		lastEmittedAt = emittedAt
		onEmit(frame)
	}

	const report = (frame) => {
		if (highestPercent !== null && frame.percent < highestPercent) return

		const phaseChanged = lastEmitted !== null && frame.phase !== lastEmitted.phase
		if (
			lastEmitted !== null &&
			!phaseChanged &&
			frame.percent - lastEmitted.percent < MIN_PERCENT_DELTA
		) {
			highestPercent = Math.max(highestPercent, frame.percent)
			return
		}

		highestPercent = highestPercent === null ? frame.percent : Math.max(highestPercent, frame.percent)
		const reportedAt = now()

		if (
			lastEmittedAt === null ||
			phaseChanged ||
			reportedAt - lastEmittedAt >= THROTTLE_MS
		) {
			emit(frame, reportedAt)
			return
		}

		pending = frame
	}

	const flush = () => {
		if (pending === null) return
		emit(pending, now())
	}

	const reset = () => {
		lastEmitted = null
		lastEmittedAt = null
		highestPercent = null
		pending = null
	}

	return { report, flush, reset }
}
