"use strict"

const assert = require("node:assert/strict")
const { spawn } = require("node:child_process")
const { once } = require("node:events")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const HANDLERS = [
	["plugin.install", "plugin-install.js"],
	["plugin.install.github", "plugin-install-github.js"],
	["plugin.command", "plugin-command.js"],
	["plugin.sync-bundled", "plugin-sync-bundled.js"],
]

function deferred() {
	let resolve
	let reject
	const promise = new Promise((res, rej) => { resolve = res; reject = rej })
	return { promise, resolve, reject }
}

async function eventually(check) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const value = check()
		if (value) return value
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error("condition was not reached")
}

test("T31 exports the four contract plugin handlers with the documented resource keys", async () => {
	const { JOB_KINDS, maxAttemptsFor } = await import("../../services/backend/jobs/state-machine.js")
	for (const [kind, file] of HANDLERS) {
		const handler = await import(`../../services/backend/jobs/handlers/${file}`)
		assert.ok(JOB_KINDS.includes(handler.kind))
		assert.equal(handler.kind, kind)
		assert.equal(typeof handler.resourceKey, "function")
		assert.equal(typeof handler.run, "function")
		assert.equal(maxAttemptsFor(kind), kind === "plugin.install.github" ? 2 : 1)
	}

	const install = await import("../../services/backend/jobs/handlers/plugin-install.js")
	const github = await import("../../services/backend/jobs/handlers/plugin-install-github.js")
	const command = await import("../../services/backend/jobs/handlers/plugin-command.js")
	const sync = await import("../../services/backend/jobs/handlers/plugin-sync-bundled.js")
	assert.equal(install.resourceKey({ pluginId: "demo" }), "plugin:demo")
	assert.equal(install.resourceKey({ id: "demo" }), "plugin:demo")
	assert.equal(github.resourceKey({ pluginId: "demo" }), "plugin:demo")
	assert.equal(command.resourceKey({ pluginId: "demo" }), "plugin:demo")
	assert.equal(sync.resourceKey({ pluginId: "demo" }), "plugin:demo")
	assert.equal(sync.resourceKey({}), null)
})

test("plugin install handler delegates through the backend plugin domain and reports progress", async () => {
	const { run } = await import("../../services/backend/jobs/handlers/plugin-install.js")
	const calls = []
	const result = await run({ path: "/tmp/plugin" }, {
		plugins: {
			install: async (input) => { calls.push(input); return { id: "demo", installed: true } },
		},
		progress: (frame) => calls.push(["progress", frame]),
		tmpDir: "/tmp/job-demo",
	})
	assert.deepEqual(result, { id: "demo", installed: true })
	assert.deepEqual(calls, [
		["progress", { phase: "installing", percent: 25 }],
		["progress", { phase: "finalizing", percent: 100 }],
		"/tmp/plugin",
	])
})

test("plugin command handler propagates abort and uses the finalizing boundary", async () => {
	const { run } = await import("../../services/backend/jobs/handlers/plugin-command.js")
	const controller = new AbortController()
	const phases = []
	const promise = run({ pluginId: "demo", command: "run", args: { ok: true } }, {
		plugins: {
			command: async (_pluginId, _commandId, _args, ctx) => {
				assert.equal(ctx.signal, controller.signal)
				await new Promise((resolve, reject) => ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason ?? new Error("aborted")), { once: true }))
			},
		},
		signal: controller.signal,
		progress: (frame) => phases.push(frame),
	})
	controller.abort(new Error("cancelled"))
	await assert.rejects(promise, /cancelled|aborted/)
	assert.equal(phases[0].phase, "running")
})

test("bundled sync handler delegates to syncBundled and does not invent a new job kind", async () => {
	const { run } = await import("../../services/backend/jobs/handlers/plugin-sync-bundled.js")
	const calls = []
	const result = await run({}, {
		plugins: { syncBundled: async () => { calls.push("sync"); return { synced: [] } } },
		progress: (frame) => calls.push(frame),
	})
	assert.deepEqual(result, { synced: [] })
	assert.deepEqual(calls, [
		{ phase: "syncing", percent: 25 },
		{ phase: "finalizing", percent: 100 },
		"sync",
	])
})

test("handler registry scopes temporary files to the job directory and cleans them up", async () => {
	const [{ createPluginJobHandlers }, { createRunner }] = await Promise.all([
		import("../../services/backend/jobs/handlers/index.js"),
		import("../../services/backend/jobs/runner.js"),
	])
	const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t31-tmp-"))
	try {
		let seenTmpDir
		const handlers = createPluginJobHandlers({
			plugins: {
				syncBundled: async ({ tmpDir }) => {
					seenTmpDir = tmpDir
					fs.writeFileSync(path.join(tmpDir, "partial.bin"), "partial")
					return { synced: [] }
				},
			},
		})
		let job = { id: "unsafe/../../job-1", kind: "plugin.sync-bundled", status: "running", input: {}, progress: null }
		const repo = {
			byId: () => job,
			setProgress: (_id, progress) => { job = { ...job, progress }; return job },
			appendEvent() {},
			finish: (_id, { status, result }) => { job = { ...job, status, result }; return job },
		}
		const runner = createRunner({
			repo,
			queue: { next: () => null, release: () => null },
			handlers,
			tmpRoot,
		})
		await runner.run(job)
		assert.ok(seenTmpDir.startsWith(`${tmpRoot}${path.sep}`))
		assert.equal(fs.existsSync(seenTmpDir), false)
		assert.equal(fs.readdirSync(tmpRoot).length, 0)
	} finally {
		fs.rmSync(tmpRoot, { recursive: true, force: true })
	}
})

test("same-plugin install resource keys are rejected with LOCKED 423", async () => {
	const [{ resourceKey }, { createQueue }, { createJobsRepository }, { migrate }, { openDatabase }] = await Promise.all([
		import("../../services/backend/jobs/handlers/plugin-install.js"),
		import("../../services/backend/jobs/queue.js"),
		import("../../services/backend/store/repositories/jobs.js"),
		import("../../services/backend/store/migrate.js"),
		import("../../services/backend/store/db.js"),
	])
	const db = await openDatabase({ file: ":memory:" })
	try {
		migrate({ db })
		const repo = createJobsRepository({ db })
		const queue = createQueue({ repo, tickMs: 60_000 })
		try {
			const input = { pluginId: "demo", path: "/tmp/demo" }
			queue.enqueue({ id: "install-1", kind: "plugin.install", input, resourceKey: resourceKey(input) })
			assert.throws(
				() => queue.enqueue({ id: "install-2", kind: "plugin.install", input, resourceKey: resourceKey(input) }),
				(error) => error.code === "LOCKED" && error.status === 423 && error.details.jobId === "install-1",
			)
		} finally {
			queue.stop()
		}
	} finally {
		db.close()
	}
})

test("plugin install cannot be canceled after its handler enters finalizing", async () => {
	const [{ createPluginJobHandlers }, { createRunner }] = await Promise.all([
		import("../../services/backend/jobs/handlers/index.js"),
		import("../../services/backend/jobs/runner.js"),
	])
	const writer = deferred()
	let job = { id: "install-finalizing", kind: "plugin.install", status: "running", input: { path: "/tmp/demo" }, progress: null }
	const repo = {
		byId: () => job,
		setProgress: (_id, progress) => { job = { ...job, progress }; return job },
		appendEvent() {},
		finish: (_id, { status, result }) => { job = { ...job, status, result }; return job },
	}
	const handlers = createPluginJobHandlers({
		plugins: {
			inspectInstall: async () => ({ selectionId: "selection-1" }),
			commitInstall: async () => writer.promise,
			clearInstallSelection() {},
		},
	})
	const runner = createRunner({ repo, queue: { next: () => null, release: () => null }, handlers })
	const running = runner.run(job)
	await eventually(() => job.progress?.phase === "finalizing")
	await assert.rejects(
		() => runner.cancel(job.id),
		(error) => error.code === "JOB_NOT_CANCELABLE" && error.status === 423,
	)
	writer.resolve({ id: "demo" })
	assert.equal((await running).status, "succeeded")
})

test("plugin command abort registers and truly kills its child process within the runner deadline", { timeout: 5_000 }, async () => {
	const [{ createPluginJobHandlers }, { createRunner, SIGKILL_DELAY_MS }] = await Promise.all([
		import("../../services/backend/jobs/handlers/index.js"),
		import("../../services/backend/jobs/runner.js"),
	])
	let child
	let exitPromise
	const childReady = deferred()
	let job = { id: "command-abort", kind: "plugin.command", status: "running", input: { pluginId: "demo", command: "hang" }, progress: null }
	const repo = {
		byId: () => job,
		setProgress: (_id, progress) => { job = { ...job, progress }; return job },
		appendEvent() {},
		finish: (_id, { status, result }) => { job = { ...job, status, result }; return job },
	}
	const handlers = createPluginJobHandlers({
		plugins: {
			command: async (_pluginId, _commandId, _args, context) => {
				const abortPromise = new Promise((_resolve, reject) => context.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))
				child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); console.log('ready'); setInterval(()=>{},1000)"], {
					stdio: ["ignore", "pipe", "ignore"],
				})
				exitPromise = once(child, "exit")
				context.registerProcess(child)
				await once(child.stdout, "data")
				childReady.resolve()
				await abortPromise
			},
		},
	})
	const runner = createRunner({ repo, queue: { next: () => null, release: () => null }, handlers })
	const running = runner.run(job)
	await eventually(() => child?.pid > 0 && job.progress?.phase === "running")
	await childReady.promise
	const startedAt = Date.now()
	const canceled = await runner.cancel(job.id)
	await running
	await exitPromise
	assert.equal(canceled.status, "canceled")
	assert.ok(Date.now() - startedAt <= SIGKILL_DELAY_MS + 1_000)
	assert.throws(() => process.kill(child.pid, 0), (error) => error.code === "ESRCH")
})
