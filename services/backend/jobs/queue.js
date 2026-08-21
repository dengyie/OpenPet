import { ApiError } from "../http/middleware.js"
import { JOB_KINDS, assertTransition } from "./state-machine.js"

export const CONCURRENCY_BY_GROUP = Object.freeze({
	image: 1,
	creator: 1,
	"plugin-install": 2,
	"plugin-command": 4,
	pack: 2,
	other: 4,
})

export const QUEUE_TIMEOUT_MS = 30_000
export const QUEUE_TICK_MS = 250

const GROUPS = Object.freeze({
	image: new Set(["image.generate", "sprite.generate", "sprite.evaluate"]),
	creator: new Set(["creator.character", "creator.workflow", "creator.export", "hatch.run"]),
	"plugin-install": new Set(["plugin.install", "plugin.install.github", "plugin.sync-bundled", "catalog.install"]),
	"plugin-command": new Set(["plugin.command"]),
	pack: new Set(["pet-pack.import", "pet-pack.export", "actions.import-frames"]),
})

const GROUP_BY_KIND = new Map(
	Object.entries(GROUPS).flatMap(([group, kinds]) => Array.from(kinds, (kind) => [kind, group])),
)

export function groupOf(kind) {
	return GROUP_BY_KIND.get(kind) ?? "other"
}

function idOf(job) {
	return typeof job === "string" ? job : job?.id
}

function asQueuedEntry(job, queuedAt) {
	return { id: job.id, kind: job.kind, group: groupOf(job.kind), queuedAt }
}

export function createQueue({
	repo,
	logger,
	now = Date.now,
	queueTimeoutMs = QUEUE_TIMEOUT_MS,
	tickMs = QUEUE_TICK_MS,
} = {}) {
	if (!repo || typeof repo.insert !== "function" || typeof repo.byId !== "function") {
		throw new ApiError("INTERNAL", "Jobs queue 需要 repository")
	}

	const waiting = []
	const running = new Map()
	const activeByGroup = new Map(Object.keys(CONCURRENCY_BY_GROUP).map((group) => [group, 0]))

	function removeWaiting(id) {
		const index = waiting.findIndex((entry) => entry.id === id)
		if (index < 0) return null
		return waiting.splice(index, 1)[0]
	}

	function capacity(group) {
		return CONCURRENCY_BY_GROUP[group] ?? CONCURRENCY_BY_GROUP.other
	}

	function canStart(entry) {
		return (activeByGroup.get(entry.group) ?? 0) < capacity(entry.group)
	}

	function startEntry(entry) {
		const current = repo.byId(entry.id)
		if (!current) return null
		if (current.status !== "queued") return null
		assertTransition(current.status, "running", { jobId: entry.id })
		const job = typeof repo.transition === "function" ? repo.transition(entry.id, "running") : current
		activeByGroup.set(entry.group, (activeByGroup.get(entry.group) ?? 0) + 1)
		running.set(entry.id, entry.group)
		return job
	}

	function next() {
		for (let index = 0; index < waiting.length; index += 1) {
			const entry = waiting[index]
			if (!canStart(entry)) continue
			waiting.splice(index, 1)
			const job = startEntry(entry)
			if (job) return job
			index -= 1
		}
		return null
	}

	function enqueue(input) {
		const existingId = idOf(input)
		const job = typeof input === "string" ? repo.byId(input) : repo.insert(input)
		if (!job) throw new ApiError("NOT_FOUND", "Job 不存在", { details: { jobId: existingId ?? null } })
		if (job.status !== "queued") {
			throw new ApiError("CONFLICT", "只有 queued Job 可以入队", { details: { jobId: job.id, status: job.status } })
		}
		if (waiting.some((entry) => entry.id === job.id) || running.has(job.id)) return job
		waiting.push(asQueuedEntry(job, now()))
		return job
	}

	function release(job) {
		const id = idOf(job)
		const group = running.get(id)
		if (!group) return next()
		running.delete(id)
		activeByGroup.set(group, Math.max(0, (activeByGroup.get(group) ?? 1) - 1))
		return next()
	}

	function cancel(job) {
		const id = idOf(job)
		const entry = removeWaiting(id)
		if (!entry) {
			if (running.has(id)) {
				throw new ApiError("JOB_NOT_CANCELABLE", "运行中的 Job 不在队列取消范围内", {
					status: 423,
					details: { jobId: id },
				})
			}
			return null
		}
		const current = repo.byId(id)
		if (!current) return null
		assertTransition(current.status, "canceled", { jobId: id })
		return typeof repo.transition === "function" ? repo.transition(id, "canceled") : current
	}

	function expire(nowValue = now()) {
		const expired = []
		for (let index = waiting.length - 1; index >= 0; index -= 1) {
			const entry = waiting[index]
			if (nowValue - entry.queuedAt < queueTimeoutMs) continue
			waiting.splice(index, 1)
			const current = repo.byId(entry.id)
			if (!current || current.status !== "queued") continue
			const canceled = typeof repo.transition === "function" ? repo.transition(entry.id, "canceled") : current
			expired.push(canceled)
			logger?.warn?.("Job 排队超时", { jobId: entry.id, group: entry.group })
		}
		return expired
	}

	const timer = setInterval(() => expire(), Math.max(1, tickMs))
	timer.unref?.()
	function stop() { clearInterval(timer) }

	function stats() {
		const groups = {}
		for (const [group, limit] of Object.entries(CONCURRENCY_BY_GROUP)) {
			groups[group] = {
				running: activeByGroup.get(group) ?? 0,
				queued: waiting.filter((entry) => entry.group === group).length,
				limit,
			}
		}
		return {
			groups,
			queued: waiting.length,
			running: running.size,
			total: waiting.length + running.size,
		}
	}

	return { enqueue, next, release, cancel, stats, expire, stop }
}

export { JOB_KINDS }
