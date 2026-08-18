import { execFileSync } from "node:child_process"

import { ApiError } from "../http/middleware.js"
import { createProgressThrottle } from "./progress.js"
import { assertCancelable, canRetry, interruptionError } from "./state-machine.js"

export const SIGKILL_DELAY_MS = 2_000
export const SHUTDOWN_GRACE_MS = 5_000
export const RETRY_BASE_DELAY_MS = 250

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizePid(processHandle) {
	const value = typeof processHandle === "number" ? processHandle : processHandle?.pid
	return Number.isInteger(value) && value > 0 ? value : null
}

function processRows(output) {
	return String(output ?? "")
		.split(/\r?\n/)
		.map((line) => line.trim().split(/\s+/).map(Number))
		.filter(([pid, ppid]) => Number.isInteger(pid) && pid > 0 && Number.isInteger(ppid) && ppid >= 0)
		.map(([pid, ppid]) => ({ pid, ppid }))
}

function descendantPids(rootPid) {
	if (process.platform === "win32") return []
	const rows = processRows(execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" }))
	const children = new Map()
	for (const row of rows) {
		if (!children.has(row.ppid)) children.set(row.ppid, [])
		children.get(row.ppid).push(row.pid)
	}
	const found = []
	const pending = [rootPid]
	while (pending.length > 0) {
		for (const pid of children.get(pending.shift()) ?? []) {
			found.push(pid)
			pending.push(pid)
		}
	}
	return found.reverse()
}

export function signalProcessTree(processHandle, signal) {
	const pid = normalizePid(processHandle)
	if (pid === null) return false
	if (process.platform === "win32") {
		const args = ["/PID", String(pid), "/T"]
		if (signal === "SIGKILL") args.push("/F")
		execFileSync("taskkill", args, { stdio: "ignore", windowsHide: true })
		return true
	}
	for (const childPid of descendantPids(pid)) {
		try { process.kill(childPid, signal) } catch (error) { if (error?.code !== "ESRCH") throw error }
	}
	try { process.kill(pid, signal) } catch (error) { if (error?.code !== "ESRCH") throw error }
	return true
}

function isProcessRunning(processHandle) {
	if (processHandle && typeof processHandle === "object" && processHandle.exitCode !== null) return false
	const pid = normalizePid(processHandle)
	if (pid === null) return false
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		if (error?.code === "ESRCH") return false
		return true
	}
}

function retryableStatus(error) {
	const status = Number(error?.status)
	return status === 429 || (status >= 500 && status <= 599)
}

function jobError(error) {
	return {
		code: String(error?.code ?? "INTERNAL"),
		message: String(error?.message ?? "Job 执行失败"),
		details: error?.details ?? null,
		retryable: retryableStatus(error),
	}
}

export function createRunner({
	repo,
	queue,
	progress = createProgressThrottle,
	handlers = {},
	logger,
	delay = sleep,
	signalTree = signalProcessTree,
	isRunning = isProcessRunning,
	shutdownGraceMs = SHUTDOWN_GRACE_MS,
} = {}) {
	if (!repo || !queue || typeof queue.next !== "function" || typeof repo.byId !== "function") {
		throw new ApiError("INTERNAL", "Job runner 需要 repository 与 queue")
	}

	const active = new Map()
	let shuttingDown = false

	async function terminateProcess(record) {
		if (!record.processHandle) return
		try {
			signalTree(record.processHandle, "SIGTERM")
			await delay(SIGKILL_DELAY_MS)
			if (isRunning(record.processHandle)) signalTree(record.processHandle, "SIGKILL")
		} catch (error) {
			logger?.warn?.("终止 Job 子进程树失败", { jobId: record.jobId, error: String(error) })
		}
	}

	function createJobProgress(record) {
		const persist = (frame) => {
			record.phase = frame.phase ?? null
			repo.setProgress(record.jobId, frame)
			repo.appendEvent?.(record.jobId, frame)
		}
		if (typeof progress === "function") return progress({ onEmit: persist, jobId: record.jobId })
		if (typeof progress?.create === "function") return progress.create({ onEmit: persist, jobId: record.jobId })
		throw new ApiError("INTERNAL", "Job runner 需要 progress factory")
	}

	async function execute(job) {
		const handler = handlers[job.kind]
		if (typeof handler !== "function") {
			const error = new ApiError("INTERNAL", "Job handler 不存在", { details: { kind: job.kind } })
			repo.finish(job.id, { status: "failed", error: jobError(error) })
			queue.release(job.id)
			throw error
		}

		const record = {
			jobId: job.id,
			controller: new AbortController(),
			processHandle: null,
			phase: job.progress?.phase ?? null,
			canceled: false,
			interrupted: false,
			promise: null,
		}
		active.set(job.id, record)
		const jobProgress = createJobProgress(record)

		const context = {
			job,
			signal: record.controller.signal,
			report(frame) {
				jobProgress.report(frame)
			},
			registerProcess(processHandle) {
				record.processHandle = processHandle
				return processHandle
			},
			async finalize(writeFinalArtifact) {
				jobProgress.report({ phase: "finalizing", percent: 100 })
				jobProgress.flush()
				return typeof writeFinalArtifact === "function" ? await writeFinalArtifact() : undefined
			},
		}

		const task = (async () => {
			let current = job
			while (true) {
				try {
					const result = await handler({ ...context, job: current })
					jobProgress.flush()
					if (record.canceled || record.interrupted) return repo.byId(job.id)
					return repo.finish(job.id, { status: "succeeded", result })
				} catch (error) {
					jobProgress.flush()
					if (record.canceled || record.interrupted) return repo.byId(job.id)
					const failed = repo.finish(job.id, { status: "failed", error: jobError(error) })
					if (!retryableStatus(error) || !canRetry(failed)) return failed
					await delay(RETRY_BASE_DELAY_MS * (2 ** Math.max(0, failed.attempt - 1)))
					if (record.canceled || record.interrupted || shuttingDown) return repo.byId(job.id)
					const queued = repo.transition(job.id, "queued")
					current = repo.transition(queued.id, "running")
					jobProgress.reset()
				}
			}
		})()
			.finally(() => {
				active.delete(job.id)
				if (shuttingDown) return
				const nextJob = queue.release(job.id)
				if (nextJob) void execute(nextJob).catch((error) => {
					logger?.error?.("后续 Job 执行失败", { jobId: nextJob.id, error: String(error) })
				})
			})

		record.promise = task
		return task
	}

	function run(job) {
		if (shuttingDown) throw new ApiError("BACKEND_UNAVAILABLE", "Job runner 正在关闭")
		const selected = job ?? queue.next()
		if (!selected) return null
		const current = typeof selected === "string" ? repo.byId(selected) : selected
		if (!current) throw new ApiError("NOT_FOUND", "Job 不存在", { details: { jobId: selected } })
		if (current.status !== "running") {
			throw new ApiError("CONFLICT", "runner 只接受 running Job", {
				details: { jobId: current.id, status: current.status },
			})
		}
		return execute(current)
	}

	async function cancel(jobId) {
		const current = repo.byId(jobId)
		if (!current) throw new ApiError("NOT_FOUND", "Job 不存在", { details: { jobId } })
		if (current.status === "queued") return queue.cancel(jobId)
		const record = active.get(jobId)
		assertCancelable({ ...current, phase: record?.phase ?? current.progress?.phase ?? null })
		if (!record) {
			throw new ApiError("JOB_NOT_CANCELABLE", "运行中的 Job 不属于当前 runner", {
				status: 423,
				details: { jobId },
			})
		}
		record.canceled = true
		record.controller.abort()
		await terminateProcess(record)
		return repo.finish(jobId, { status: "canceled" })
	}

	async function shutdown() {
		if (shuttingDown) return { interrupted: [] }
		shuttingDown = true
		const records = Array.from(active.values())
		for (const record of records) {
			record.interrupted = true
			record.controller.abort()
		}
		await Promise.race([
			Promise.allSettled(records.map(async (record) => {
				await terminateProcess(record)
				await record.promise
			})),
			delay(shutdownGraceMs),
		])
		const interrupted = []
		for (const record of records) {
			const current = repo.byId(record.jobId)
			if (current?.status !== "running") continue
			repo.finish(record.jobId, { status: "interrupted", error: interruptionError() })
			interrupted.push(record.jobId)
		}
		return { interrupted }
	}

	return { run, cancel, shutdown }
}
