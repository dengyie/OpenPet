"use strict"

const assert = require("node:assert/strict")
const { before, describe, it } = require("node:test")

let ApiError
let createJobsRepository
let createQueue
let createRunner
let migrate
let openDatabase
let constants

before(async () => {
	;({ ApiError } = await import("../../services/backend/http/middleware.js"))
	;({ createJobsRepository } = await import("../../services/backend/store/repositories/jobs.js"))
	;({ createQueue } = await import("../../services/backend/jobs/queue.js"))
	;({ createRunner, ...constants } = await import("../../services/backend/jobs/runner.js"))
	;({ migrate } = await import("../../services/backend/store/migrate.js"))
	;({ openDatabase } = await import("../../services/backend/store/db.js"))
})

function deferred() {
	let resolve
	let reject
	const promise = new Promise((res, rej) => { resolve = res; reject = rej })
	return { promise, resolve, reject }
}

async function eventually(check) {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const value = check()
		if (value) return value
		await new Promise((resolve) => setImmediate(resolve))
	}
	throw new Error("condition was not reached")
}

async function withRunner(handlers, run, options = {}) {
	const db = await openDatabase({ file: ":memory:" })
	try {
		migrate({ db })
		let now = 1_000
		const repo = createJobsRepository({ db, now: () => now++ })
		const queue = createQueue({ repo, now: () => now++, queueTimeoutMs: 60_000 })
		const runner = createRunner({
			repo,
			queue,
			handlers,
			delay: options.delay ?? (async () => {}),
			signalTree: options.signalTree,
			isRunning: options.isRunning,
			emit: options.emit,
			shutdownGraceMs: options.shutdownGraceMs ?? 1,
			forgetPrivateInput: options.forgetPrivateInput,
		})
		return await run({ queue, repo, runner })
	} finally {
		db.close()
	}
}

function enqueue(queue, id, kind, input = {}) {
	queue.enqueue({ id, kind, input })
}

describe("Job runner · finalizing and cancellation", () => {
	it("marks finalizing before the writer and rejects cancellation with 423", async () => {
		const writer = deferred()
		await withRunner({
			"image.generate": async ({ finalize }) => finalize(async () => {
				await writer.promise
				return "written"
			}),
		}, async ({ queue, repo, runner }) => {
			enqueue(queue, "finalizing-job", "image.generate")
			const running = runner.run()
			await eventually(() => repo.byId("finalizing-job").progress?.phase === "finalizing")

			await assert.rejects(
				runner.cancel("finalizing-job"),
				(error) => error.code === "JOB_NOT_CANCELABLE" && error.status === 423,
			)
			writer.resolve()
			assert.equal((await running).status, "succeeded")
		})
	})

	it("aborts provider work and terminates a registered process tree TERM then KILL", async () => {
		const signals = []
		await withRunner({
			"plugin.command": async ({ registerProcess, signal }) => {
				registerProcess({ pid: 4321, exitCode: null })
				await new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))
			},
		}, async ({ queue, repo, runner }) => {
			enqueue(queue, "cancel-provider", "plugin.command")
			const running = runner.run()
			await eventually(() => repo.byId("cancel-provider").status === "running")
			const canceled = await runner.cancel("cancel-provider")
			await running

			assert.equal(canceled.status, "canceled")
			assert.deepEqual(signals, ["SIGTERM", "SIGKILL"])
		}, {
			signalTree: (_processHandle, signal) => signals.push(signal),
			isRunning: () => true,
		})
	})

	it("returns the canceled terminal job for duplicate queued cancellation", async () => {
		await withRunner({
			"about.check-updates": async () => ({ ok: true }),
		}, async ({ queue, repo, runner }) => {
			enqueue(queue, "duplicate-queued-cancel", "about.check-updates")
			const first = await runner.cancel("duplicate-queued-cancel")
			const second = await runner.cancel("duplicate-queued-cancel")

			assert.equal(first.status, "canceled")
			assert.deepEqual(second, first)
			assert.equal(repo.byId("duplicate-queued-cancel").status, "canceled")
		})
	})

	it("coalesces concurrent running cancellation and emits one terminal event", async () => {
		const started = deferred()
		const release = deferred()
		const canceledEvents = []
		await withRunner({
			"plugin.command": async ({ signal }) => {
				started.resolve()
				await release.promise
				if (signal.aborted) throw new Error("aborted")
			},
		}, async ({ queue, repo, runner }) => {
			enqueue(queue, "duplicate-running-cancel", "plugin.command")
			const running = runner.run()
			await started.promise
			const first = runner.cancel("duplicate-running-cancel")
			const second = runner.cancel("duplicate-running-cancel")
			await new Promise((resolve) => setImmediate(resolve))
			assert.equal(repo.byId("duplicate-running-cancel").status, "running")
			release.resolve()

			const results = await Promise.all([first, second])
			await running
			assert.equal(results[0].status, "canceled")
			assert.deepEqual(results[1], results[0])
			assert.equal(repo.byId("duplicate-running-cancel").status, "canceled")
			assert.equal(canceledEvents.length, 1)
		}, {
			emit: (name, payload) => {
				if (name === "job.canceled") canceledEvents.push(payload)
			},
		})
	})

	it("keeps duplicate cancellation idempotent and suppresses late progress", async () => {
		const started = deferred()
		const enterFinalizing = deferred()
		const release = deferred()
		await withRunner({
			"image.generate": async ({ report }) => {
				started.resolve()
				await enterFinalizing.promise
				report({ phase: "finalizing", percent: 100 })
				await release.promise
				return { ok: true }
			},
		}, async ({ queue, repo, runner }) => {
			enqueue(queue, "cancel-phase-race", "image.generate")
			const running = runner.run()
			await started.promise
			const first = runner.cancel("cancel-phase-race")
			enterFinalizing.resolve()
			await new Promise((resolve) => setImmediate(resolve))
			assert.equal(repo.byId("cancel-phase-race").progress?.phase ?? null, null)
			const second = runner.cancel("cancel-phase-race")
			release.resolve()

			const results = await Promise.all([first, second])
			await running
			assert.equal(results[0].status, "canceled")
			assert.deepEqual(results[1], results[0])
		})
	})
})

describe("Job runner · retry policy", () => {
	it("redacts structured error secrets before persisted Jobs are returned publicly", async () => {
		await withRunner({
			"creator.export": async () => {
				throw new ApiError("VALIDATION_FAILED", "provider rejected Authorization: Bearer public-secret-123", {
					status: 400,
					details: {
						apiKey: { nested: "api-key-secret" },
						password: "password-secret",
						authorization: "Bearer authorization-secret",
						clientSecret: ["client-secret", { deeper: "still-secret" }],
						credential: { value: "credential-secret" },
						authToken: { raw: "auth-token-secret" },
						message: "apiKey=inline-secret password: quoted-secret Authorization: Bearer x",
						safe: "monkey passwordPolicy tokenCount",
					},
				})
			},
		}, async ({ queue, repo, runner }) => {
			enqueue(queue, "sanitized-error", "creator.export")
			const result = await runner.run()
			const persisted = repo.byId("sanitized-error")
			const listed = repo.list().find((job) => job.id === "sanitized-error")
			for (const job of [result, persisted, listed]) {
				assert.equal(job.error.message, "provider rejected Authorization=[redacted-secret]")
				assert.deepEqual(job.error.details, {
					"[redacted-key]": "[redacted-secret]",
					"[redacted-key-2]": "[redacted-secret]",
					"[redacted-key-3]": "[redacted-secret]",
					"[redacted-key-4]": "[redacted-secret]",
					"[redacted-key-5]": "[redacted-secret]",
					"[redacted-key-6]": "[redacted-secret]",
					message: "apiKey=[redacted-secret] password=[redacted-secret] Authorization=[redacted-secret]",
					safe: "monkey passwordPolicy tokenCount",
				})
				assert.doesNotMatch(JSON.stringify(job), /api-key-secret|password-secret|authorization-secret|client-secret|still-secret|credential-secret|auth-token-secret|inline-secret|quoted-secret|Bearer x/)
			}
		})
	})

	it("retries 429/5xx creator workflow failures within maxAttempts using repository transitions", async () => {
		for (const status of [429, 503]) {
			let calls = 0
			await withRunner({
				"creator.workflow": async () => {
					calls += 1
					if (calls === 1) throw new ApiError("PROVIDER_ERROR", "temporary", { status })
					return { ok: true }
				},
			}, async ({ queue, repo, runner }) => {
				const jobId = `retry-${status}`
				enqueue(queue, jobId, "creator.workflow")
				const result = await runner.run()
				assert.equal(result.status, "succeeded")
				assert.equal(repo.byId(jobId).attempt, 2)
				assert.equal(calls, 2)
			})
		}
	})

	it("does not retry a semantic Creator failure that is explicitly non-retryable", async () => {
		let calls = 0
		await withRunner({
			"creator.workflow": async () => {
				calls += 1
				throw new ApiError("PROVIDER_ERROR", "final package visual gate failed", { status: 502, retryable: false })
			},
		}, async ({ queue, repo, runner }) => {
			enqueue(queue, "semantic-failure", "creator.workflow")
			const result = await runner.run()
			assert.equal(result.status, "failed")
			assert.equal(result.attempt, 1)
			assert.equal(calls, 1)
			assert.equal(result.error.retryable, false)
		})
	})

	it("preserves Creator private input across automatic retries and clears it after the Job settles", async () => {
		const { createCreatorJobHandlers } = await import("../../services/backend/jobs/handlers/creator.js")
		const privateInputs = new Map([["creator-private-retry", { characterName: "Cat", referenceImageToken: "opaque" }]])
		const calls = []
		let attempts = 0
		const creator = {
			getJobInput: (jobId) => privateInputs.get(jobId) || null,
			forgetJobInput: (jobId) => privateInputs.delete(jobId),
			runWorkflow: async (input) => {
				calls.push(input)
				attempts += 1
				if (attempts === 1) throw new ApiError("PROVIDER_ERROR", "temporary", { status: 503 })
				return { ok: true }
			},
		}
		const handlers = createCreatorJobHandlers({ creator })
		await withRunner(handlers, async ({ queue, repo, runner }) => {
			enqueue(queue, "creator-private-retry", "creator.workflow", { redacted: true, summary: "creator.workflow" })
			const result = await runner.run()
			assert.equal(result.status, "succeeded")
			assert.equal(result.attempt, 2)
			assert.equal(calls.length, 2)
			assert.deepEqual(calls[0], calls[1])
			assert.equal(privateInputs.has("creator-private-retry"), false)
			assert.equal(repo.byId("creator-private-retry").status, "succeeded")
		}, { forgetPrivateInput: (jobId) => creator.forgetJobInput(jobId) })
	})

	it("does not retry creator.export because its maxAttempts is one", async () => {
		let calls = 0
		await withRunner({
			"creator.export": async () => {
				calls += 1
				throw new ApiError("INTERNAL", "failed", { status: 500 })
			},
		}, async ({ queue, runner }) => {
			enqueue(queue, "export-job", "creator.export")
			const result = await runner.run()
			assert.equal(result.status, "failed")
			assert.equal(result.attempt, 1)
			assert.equal(calls, 1)
		})
	})

	it("does not retry non-429 4xx errors", async () => {
		let calls = 0
		await withRunner({
			"image.generate": async () => {
				calls += 1
				throw new ApiError("VALIDATION_FAILED", "bad input", { status: 400 })
			},
		}, async ({ queue, runner }) => {
			enqueue(queue, "validation-job", "image.generate")
			const result = await runner.run()
			assert.equal(result.status, "failed")
			assert.equal(result.attempt, 1)
			assert.equal(calls, 1)
		})
	})

	it("retries catalog.install without publishing an intermediate terminal failure", async () => {
		let calls = 0
		const events = []
		await withRunner({
			"catalog.install": async () => {
				calls += 1
				if (calls === 1) throw new ApiError("INTERNAL", "temporary catalog dependency outage", { status: 503 })
				return { catalog: { updatedAt: "2026-10-05T00:00:00.000Z" } }
			},
		}, async ({ queue, repo, runner }) => {
			queue.enqueue({ id: "catalog-retry", kind: "catalog.install", input: { selectionId: "selection-1" }, resourceKey: "catalog-selection:selection-1" })
			const result = await runner.run()
			assert.equal(result.status, "succeeded")
			assert.equal(result.attempt, 2)
			assert.equal(calls, 2)
			assert.deepEqual(events.map(({ name, payload }) => [name, payload.status]), [["job.succeeded", "succeeded"]])
			assert.equal(repo.byId("catalog-retry").status, "succeeded")
		}, { emit: (name, payload) => events.push({ name, payload }) })
	})

	it("keeps a retrying catalog install resource locked during backoff", async () => {
		const backoff = deferred()
		const retrying = deferred()
		let calls = 0
		const events = []
		await withRunner({
			"catalog.install": async () => {
				calls += 1
				if (calls === 1) throw new ApiError("INTERNAL", "temporary catalog dependency outage", { status: 503 })
				return { ok: true }
			},
	}, async ({ queue, repo, runner }) => {
		queue.enqueue({ id: "catalog-retry-owner", kind: "catalog.install", input: { selectionId: "selection-1" }, resourceKey: "catalog-selection:selection-1" })
		const running = runner.run()
		await retrying.promise
		let result
		try {
			assert.equal(repo.byId("catalog-retry-owner").status, "running")
			assert.equal(repo.byId("catalog-retry-owner").attempt, 1)
			assert.deepEqual(events.map(({ name }) => name), [])
			assert.throws(
				() => queue.enqueue({ id: "catalog-retry-intruder", kind: "catalog.install", input: { selectionId: "selection-1" }, resourceKey: "catalog-selection:selection-1" }),
				(error) => error.code === "LOCKED",
			)
		} finally {
			backoff.resolve()
			result = await running
		}
		assert.equal(result.status, "succeeded")
	}, {
		delay: async () => { retrying.resolve(); await backoff.promise },
		emit: (name, payload) => events.push({ name, payload }),
	})
	})

	it("publishes one terminal catalog failure after exhausting its retry budget", async () => {
		let calls = 0
		const events = []
		await withRunner({
			"catalog.install": async () => {
				calls += 1
				throw new ApiError("INTERNAL", "catalog dependency unavailable", { status: 503 })
			},
		}, async ({ queue, repo, runner }) => {
			queue.enqueue({ id: "catalog-exhausted", kind: "catalog.install", input: { selectionId: "selection-1" }, resourceKey: "catalog-selection:selection-1" })
			const result = await runner.run()
			assert.equal(result.status, "failed")
			assert.equal(result.attempt, 2)
			assert.equal(result.canRetry, false)
			assert.equal(calls, 2)
			assert.deepEqual(events.map(({ name, payload }) => [name, payload.status]), [["job.failed", "failed"]])
			assert.equal(repo.byId("catalog-exhausted").status, "failed")
		}, { emit: (name, payload) => events.push({ name, payload }) })
	})

	it("publishes one terminal failure for an unknown Job handler", async () => {
		const events = []
		await withRunner({}, async ({ queue, repo, runner }) => {
			enqueue(queue, "unknown-job-handler", "creator.workflow")
			await assert.rejects(() => runner.run(), (error) => error.code === "INTERNAL")
			assert.equal(repo.byId("unknown-job-handler").status, "failed")
			assert.deepEqual(events.map(({ name, payload }) => [name, payload.status]), [["job.failed", "failed"]])
		}, { emit: (name, payload) => events.push({ name, payload }) })
	})

	it("publishes catalog.refreshed before job.succeeded for a successful catalog install", async () => {
		const events = []
		const { createCatalogService } = await import("../../services/backend/domains/catalog.js")
		const catalog = createCatalogService({
			root: process.cwd(),
			shell: {
				request: async () => ({
					body: {
						type: "catalog.result",
						ok: true,
						result: { catalog: { updatedAt: "2026-10-05T00:00:00.000Z" } },
					},
				}),
			},
			emit: (name, payload) => events.push({ name, payload }),
		})
		await withRunner({
			"catalog.install": async () => catalog.installSelection("selection-1"),
		}, async ({ queue, runner }) => {
			queue.enqueue({ id: "catalog-event-order", kind: "catalog.install", input: { selectionId: "selection-1" }, resourceKey: "catalog-selection:selection-1" })
			const result = await runner.run()
			assert.equal(result.status, "succeeded")
		}, { emit: (name, payload) => events.push({ name, payload }) })

		assert.deepEqual(events.map(({ name }) => name), ["catalog.refreshed", "job.succeeded"])
	})
})

describe("Job runner · shutdown", () => {
	it("stops accepting work and marks unfinished running jobs interrupted", async () => {
		await withRunner({
			"plugin.command": async ({ signal }) => {
				await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))
			},
		}, async ({ queue, repo, runner }) => {
			enqueue(queue, "shutdown-job", "plugin.command")
			const running = runner.run()
			await eventually(() => repo.byId("shutdown-job").status === "running")
			const result = await runner.shutdown()
			await running

			assert.deepEqual(result.interrupted, ["shutdown-job"])
			assert.equal(repo.byId("shutdown-job").status, "interrupted")
			assert.equal(repo.byId("shutdown-job").error.code, "BACKEND_RESTARTED")
			assert.throws(() => runner.run(), (error) => error.code === "BACKEND_UNAVAILABLE")
		})
	})

	it("exports the frozen termination and shutdown grace constants", () => {
		assert.equal(constants.SIGKILL_DELAY_MS, 2_000)
		assert.equal(constants.SHUTDOWN_GRACE_MS, 5_000)
	})
})

describe('Job runner · ownership and late completion', () => {
  it('does not execute the same running Job twice', async () => {
    const gate = deferred()
    let executions = 0
    await withRunner({ 'image.generate': async () => { executions++; await gate.promise; return 'done' } }, async ({ queue, repo, runner }) => {
      enqueue(queue, 'single-owner', 'image.generate')
      const first = runner.run()
      const second = Promise.resolve().then(() => runner.run(repo.byId('single-owner')))
      const settled = Promise.allSettled([first, second])
      gate.resolve()
      await settled
      assert.equal(executions, 1)
      assert.equal(repo.byId('single-owner').status, 'succeeded')
    })
  })

  it('a canceled provider cannot enter finalizing and write a late artifact', async () => {
    const gate = deferred()
    let writes = 0
    await withRunner({ 'image.generate': async ({ finalize, report }) => {
      await gate.promise
      report({ phase: 'rendering', percent: 90 })
      return finalize(() => { writes++; return 'late artifact' })
    } }, async ({ queue, repo, runner }) => {
      enqueue(queue, 'late-result', 'image.generate')
      const running = runner.run()
      const cancel = runner.cancel('late-result')
      gate.resolve()
      await cancel
      await running
      assert.equal(writes, 0)
      assert.equal(repo.byId('late-result').status, 'canceled')
      assert.equal(repo.byId('late-result').progress, null)
    })
  })

  it('missing handler failure dispatches the next waiting Job', async () => {
    await withRunner({ 'image.generate': async () => 'done' }, async ({ queue, repo, runner }) => {
      enqueue(queue, 'missing', 'image.validate')
      enqueue(queue, 'next-valid', 'image.generate')
      await assert.rejects(runner.run(), /handler/)
      await eventually(() => repo.byId('next-valid').status === 'succeeded')
      assert.equal(queue.stats().running, 0)
    })
  })
})
