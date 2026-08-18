import fs from "node:fs"
import path from "node:path"

import { interruptionError } from "./state-machine.js"

const JOB_TMP_PREFIX = "job-"
const RECOVERY_EVENT = "system.jobs-recovered"

function listJobTmpEntries(tmpDir, logger) {
	if (typeof tmpDir !== "string" || tmpDir.length === 0) return []
	try {
		return fs.readdirSync(tmpDir, { withFileTypes: true })
			.filter((entry) => entry.name.startsWith(JOB_TMP_PREFIX) && entry.isDirectory())
			.map((entry) => path.join(tmpDir, entry.name))
	} catch (error) {
		if (error?.code === "ENOENT") return []
		logger?.warn?.("扫描 Job 临时目录失败", { tmpDir, error: String(error) })
		return []
	}
}

function removeJobTmpEntries(entries, logger) {
	let removed = 0
	for (const entry of entries) {
		try {
			fs.rmSync(entry, { recursive: true, force: true })
			removed += 1
		} catch (error) {
			logger?.warn?.("清理 Job 临时目录失败", { entry, error: String(error) })
		}
	}
	return removed
}

/**
 * Repair jobs left behind by a backend restart before the queue starts.
 * All writes go through the repository so state-machine and CAS checks remain
 * the single authority for job transitions.
 */
export function recoverJobs({ repo, tmpDir, emit, logger } = {}) {
	if (!repo || typeof repo.list !== "function" || typeof repo.finish !== "function" ||
		typeof repo.transition !== "function") {
		throw new TypeError("recoverJobs 需要完整的 jobs repository")
	}

	const interrupted = []
	const requeued = []
	for (const job of repo.list({ status: "running" })) {
		repo.finish(job.id, { status: "interrupted", error: interruptionError() })
		interrupted.push(job.id)
		repo.transition(job.id, "queued")
		requeued.push(job.id)
	}
	for (const job of repo.list({ status: "queued" })) {
		if (!requeued.includes(job.id)) requeued.push(job.id)
	}

	const tmpRemoved = removeJobTmpEntries(listJobTmpEntries(tmpDir, logger), logger)
	const result = { interrupted, requeued, tmpRemoved }
	emit?.(RECOVERY_EVENT, { interrupted, requeued })
	logger?.info?.("Job 启动恢复完成", result)
	return result
}

export { JOB_TMP_PREFIX, RECOVERY_EVENT }
