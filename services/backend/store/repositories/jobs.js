import { ApiError } from "../../http/middleware.js"
import {
	assertTransition,
	isTerminal,
	maxAttemptsFor,
} from "../../jobs/state-machine.js"

const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 1_000

function asJson(value) {
	return value === null || value === undefined ? null : JSON.stringify(value)
}

function fromJson(value) {
	if (value === null || value === undefined) return null
	try {
		return JSON.parse(value)
	} catch (cause) {
		throw new ApiError("INTERNAL", "Job JSON 字段损坏", { cause })
	}
}

function normalizeError(error) {
	if (error === null || error === undefined) return null
	return {
		code: String(error.code ?? "INTERNAL"),
		message: String(error.message ?? error.code ?? "Job 失败"),
		details: error.details ?? null,
		retryable: Boolean(error.retryable),
	}
}

function toJob(row) {
	if (!row) return null
	return {
		id: row.id,
		kind: row.kind,
		status: row.status,
		resourceKey: row.resource_key,
		input: fromJson(row.input_json),
		result: fromJson(row.result_json),
		error: fromJson(row.error_json),
		progress: fromJson(row.progress_json),
		attempt: row.attempt,
		maxAttempts: row.max_attempts,
		createdAt: row.created_at,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
	}
}

function toEvent(row) {
	if (!row) return null
	return {
		id: row.id,
		jobId: row.job_id,
		at: row.at,
		phase: row.phase,
		percent: row.percent,
		message: row.message,
	}
}

function isConstraintError(error) {
	return error?.code === "ERR_SQLITE_ERROR" &&
		(error?.errcode === 2067 || String(error?.message).includes("SQLITE_CONSTRAINT"))
}

function parseLimit(value) {
	if (value === undefined) return DEFAULT_LIST_LIMIT
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed > 0
		? Math.min(parsed, MAX_LIST_LIMIT)
		: DEFAULT_LIST_LIMIT
}

function parseOffset(value) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

export function createJobsRepository({ db, now = Date.now } = {}) {
	if (!db || typeof db.prepare !== "function") {
		throw new ApiError("INTERNAL", "Jobs repository 需要数据库 driver")
	}

	function activeByResourceKey(resourceKey) {
		if (resourceKey === null || resourceKey === undefined) return null
		return toJob(
			db.prepare(
				"SELECT * FROM jobs WHERE resource_key = ? AND status IN ('queued','running') ORDER BY created_at ASC LIMIT 1",
			).get(resourceKey),
		)
	}

	function byId(id) {
		return toJob(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id))
	}

	function insert(input = {}) {
		const id = input.id
		const kind = input.kind
		if (typeof id !== "string" || id.length === 0 || typeof kind !== "string" || kind.length === 0) {
			throw new ApiError("VALIDATION_FAILED", "Job 需要 id 与 kind")
		}

		const resourceKey = input.resourceKey ?? null
		const attempt = 1
		const maxAttempts = maxAttemptsFor(kind)
		const createdAt = input.createdAt ?? now()
		try {
			db.prepare(
				"INSERT INTO jobs (id, kind, status, resource_key, input_json, attempt, max_attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			).run(
				id,
				kind,
					"queued",
				resourceKey,
				asJson(input.input ?? {}),
				attempt,
				maxAttempts,
				createdAt,
			)
		} catch (error) {
			if (!isConstraintError(error)) throw error
			const active = activeByResourceKey(resourceKey)
			if (!active) throw error
			throw new ApiError("LOCKED", "resourceKey 已被活跃 Job 占用", {
				status: 423,
				details: { jobId: active?.id ?? null, resourceKey },
				cause: error,
			})
		}
		return byId(id)
	}

	function list(options = {}) {
		const clauses = []
		const params = []
		if (options.status !== undefined) {
			clauses.push("status = ?")
			params.push(options.status)
		}
		if (options.kind !== undefined) {
			clauses.push("kind = ?")
			params.push(options.kind)
		}
		if (options.resourceKey !== undefined) {
			clauses.push("resource_key = ?")
			params.push(options.resourceKey)
		}
		const limit = parseLimit(options.limit)
		const offset = parseOffset(options.offset)
		const where = clauses.length > 0 ? " WHERE " + clauses.join(" AND ") : ""
		return db
			.prepare("SELECT * FROM jobs" + where + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
			.all(...params, limit, offset)
			.map(toJob)
	}

	function count(options = {}) {
		const clauses = []
		const params = []
		if (options.status !== undefined) { clauses.push("status = ?"); params.push(options.status) }
		if (options.kind !== undefined) { clauses.push("kind = ?"); params.push(options.kind) }
		const where = clauses.length > 0 ? " WHERE " + clauses.join(" AND ") : ""
		return Number(db.prepare("SELECT count(*) AS count FROM jobs" + where).get(...params).count)
	}

	function removeCompleted() {
		const result = db.prepare(
			"DELETE FROM jobs WHERE status IN ('succeeded','canceled') OR (status = 'failed' AND attempt >= max_attempts)",
		).run()
		return Number(result.changes)
	}

	function transition(id, to) {
		const current = byId(id)
		if (!current) throw new ApiError("NOT_FOUND", "Job 不存在", { details: { jobId: id } })
		assertTransition(current.status, to, { jobId: id })

		const timestamp = now()
		let startedAt = current.startedAt
		let finishedAt = current.finishedAt
		let attempt = current.attempt
		if (to === "running") startedAt = timestamp
		if (isTerminal(to)) finishedAt = timestamp
		if (to === "queued") {
			startedAt = null
			finishedAt = null
			attempt += 1
		}

		let result
		try {
			result = db
				.prepare(
					"UPDATE jobs SET status = ?, attempt = ?, started_at = ?, finished_at = ? WHERE id = ? AND status = ?",
				)
				.run(to, attempt, startedAt, finishedAt, id, current.status)
		} catch (error) {
			if (!isConstraintError(error) || to !== "queued" || current.resourceKey === null) throw error
			const active = activeByResourceKey(current.resourceKey)
			throw new ApiError("LOCKED", "resourceKey 已被活跃 Job 占用", {
				status: 423,
				details: { jobId: active?.id ?? null, resourceKey: current.resourceKey },
				cause: error,
			})
		}
		if (Number(result.changes) !== 1) {
			throw new ApiError("CONFLICT", "Job 状态已被其它写者更新", {
				details: { jobId: id, expectedStatus: current.status, to },
			})
		}
		return byId(id)
	}

	function setProgress(id, progress) {
		const result = db
			.prepare("UPDATE jobs SET progress_json = ? WHERE id = ?")
			.run(asJson(progress), id)
		if (Number(result.changes) !== 1) {
			throw new ApiError("NOT_FOUND", "Job 不存在", { details: { jobId: id } })
		}
		return byId(id)
	}

	function finish(id, options = {}) {
		const current = byId(id)
		if (!current) throw new ApiError("NOT_FOUND", "Job 不存在", { details: { jobId: id } })
		const status = options.status ?? "succeeded"
		assertTransition(current.status, status, { jobId: id })
		if (!isTerminal(status)) {
			throw new ApiError("VALIDATION_FAILED", "finish 只能写入终态", { details: { status } })
		}

		const result = db
			.prepare(
				"UPDATE jobs SET status = ?, result_json = ?, error_json = ?, finished_at = ? WHERE id = ? AND status = ?",
			)
			.run(status, asJson(options.result ?? null), asJson(normalizeError(options.error)), now(), id, current.status)
		if (Number(result.changes) !== 1) {
			throw new ApiError("CONFLICT", "Job 状态已被其它写者更新", {
				details: { jobId: id, expectedStatus: current.status, to: status },
			})
		}
		return byId(id)
	}

	function appendEvent(jobId, event = {}) {
		const at = event.at ?? now()
		try {
			const result = db
				.prepare("INSERT INTO job_events (job_id, at, phase, percent, message) VALUES (?, ?, ?, ?, ?)")
				.run(jobId, at, event.phase ?? null, event.percent ?? null, event.message ?? null)
			return toEvent(
				db.prepare("SELECT id, job_id, at, phase, percent, message FROM job_events WHERE id = ?").get(result.lastInsertRowid),
			)
		} catch (error) {
			if (error?.code === "ERR_SQLITE_CONSTRAINT_FOREIGNKEY") {
				throw new ApiError("NOT_FOUND", "Job 不存在", { details: { jobId }, cause: error })
			}
			throw error
		}
	}

	function listEvents(jobId, options = {}) {
		const limit = parseLimit(options.limit)
		return db
			.prepare("SELECT id, job_id, at, phase, percent, message FROM job_events WHERE job_id = ? ORDER BY id ASC LIMIT ?")
			.all(jobId, limit)
			.map(toEvent)
	}

	function countEvents(jobId) {
		return Number(db.prepare("SELECT count(*) AS count FROM job_events WHERE job_id = ?").get(jobId).count)
	}

	function countByStatus(status) {
		if (status !== undefined) {
			return Number(db.prepare("SELECT count(*) AS count FROM jobs WHERE status = ?").get(status).count)
		}
		const counts = {}
		for (const row of db.prepare("SELECT status, count(*) AS count FROM jobs GROUP BY status").all()) {
			counts[row.status] = Number(row.count)
		}
		return counts
	}

	return {
		insert,
		byId,
		list,
		count,
		removeCompleted,
		transition,
		setProgress,
		finish,
		appendEvent,
		listEvents,
		countEvents,
		activeByResourceKey,
		countByStatus,
	}
}
