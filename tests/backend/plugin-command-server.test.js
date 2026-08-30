"use strict"

const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

async function eventually(check, { timeoutMs = 4_000 } = {}) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const value = check()
		if (value) return value
		await new Promise((resolve) => setTimeout(resolve, 20))
	}
	throw new Error("condition was not reached")
}

test("T27 command server dispatches plugin commands through the Job engine", async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const inserted = []
	const server = createPluginCommandServer({
		plugins: { get: (id) => ({ id }) },
		jobs: {
			insert(input) {
				inserted.push(input)
				return { ...input, status: "queued" }
			},
		},
		now: () => 1_234,
	})

	assert.equal(typeof server.listen, "function")
	assert.equal(typeof server.close, "function")
	assert.equal(typeof server.dispatch, "function")
	assert.equal(typeof server.execute, "function")
	const job = server.dispatch("demo", "refresh", { force: true })

	assert.equal(job.kind, "plugin.command")
	assert.deepEqual(inserted, [{
		id: job.id,
		kind: "plugin.command",
		input: { pluginId: "demo", command: "refresh", args: { force: true } },
		resourceKey: "plugin:demo",
		createdAt: 1_234,
	}])
})

test("T27 command bridge serves frozen backend capabilities to the command child", async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-bridge-"))
	const runtimeRoot = path.join(root, "runtime")
	const script = path.join(root, "call-bridge.js")
	fs.writeFileSync(script, [
		";(async () => {",
		"  const response = await fetch(process.env.OPENPET_BRIDGE_URL + '/pet/say', {",
		"    method: 'POST',",
		"    headers: { authorization: 'Bearer ' + process.env.OPENPET_BRIDGE_TOKEN, 'content-type': 'application/json' },",
		"    body: JSON.stringify({ text: 'hello from command' })",
		"  })",
		"  console.log(JSON.stringify(await response.json()))",
		"})().catch((error) => { console.error(error); process.exitCode = 1 })",
	].join("\n") + "\n")
	const calls = []
	const definition = {
		manifest: {
			id: "bridge-demo",
			basePath: root,
			entries: { commands: [{ id: "say", command: "node call-bridge.js", cwd: "." }] },
		},
	}
	const server = createPluginCommandServer({
		plugins: {
			get: () => ({ id: "bridge-demo" }),
			definition: () => definition,
			config: () => ({}),
			runtimeDirs: () => {
				const dirs = {
					dataDir: path.join(runtimeRoot, "data"),
					cacheDir: path.join(runtimeRoot, "cache"),
					logDir: path.join(runtimeRoot, "logs"),
				}
				for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true })
				return dirs
			},
			handleCommandCapability: async (pluginId, capability, payload) => {
				calls.push({ pluginId, capability, payload })
				return { ok: true, spoken: payload.text }
			},
		},
		jobs: { insert: (input) => input },
	})
	try {
		const result = await server.execute("bridge-demo", "say", {})
		assert.deepEqual(calls, [{
			pluginId: "bridge-demo",
			capability: "pet:say",
			payload: { text: "hello from command" },
		}])
		assert.deepEqual(result.result, { ok: true, spoken: "hello from command" })
	} finally {
		await server.close()
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test("T27 preserves timeoutMs zero as an unlimited command timeout", async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-no-timeout-"))
	const script = path.join(root, "delayed.js")
	fs.writeFileSync(script, [
		"setTimeout(() => {",
		"  console.log(JSON.stringify({ ok: true, delayed: true }))",
		"}, 30)",
	].join("\n") + "\n")
	const definition = {
		manifest: {
			id: "no-timeout-demo",
			basePath: root,
			entries: { commands: [{ id: "delayed", command: "node delayed.js", cwd: ".", timeoutMs: 0 }] },
		},
	}
	const server = createPluginCommandServer({
		plugins: {
			definition: () => definition,
			config: () => ({}),
			runtimeDirs: () => ({ dataDir: root, cacheDir: root, logDir: root }),
		},
		jobs: { insert: (input) => input },
	})
	try {
		const result = await server.execute("no-timeout-demo", "delayed")
		assert.deepEqual(result.result, { ok: true, delayed: true })
	} finally {
		await server.close()
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test("T27 timeout removes the full plugin command process tree", { timeout: 5_000 }, async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-timeout-tree-"))
	const pidFile = path.join(root, "descendant.pid")
	const script = path.join(root, "spawn-descendant.js")
	fs.writeFileSync(script, [
		"const { spawn } = require('node:child_process')",
		"const fs = require('node:fs')",
		"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
		"fs.writeFileSync('descendant.pid', String(child.pid))",
		"setInterval(() => {}, 1000)",
	].join("\n") + "\n")
	const definition = {
		manifest: {
			id: "timeout-tree-demo",
			basePath: root,
			entries: { commands: [{ id: "hang", command: "node spawn-descendant.js", cwd: ".", timeoutMs: 250 }] },
		},
	}
	const server = createPluginCommandServer({
		plugins: {
			definition: () => definition,
			config: () => ({}),
			runtimeDirs: () => ({ dataDir: root, cacheDir: root, logDir: root }),
		},
		jobs: { insert: (input) => input },
	})
	let descendantPid = 0
	try {
		await assert.rejects(
			server.execute("timeout-tree-demo", "hang"),
			(error) => error.code === "PROVIDER_TIMEOUT",
		)
		descendantPid = Number(fs.readFileSync(pidFile, "utf8"))
		await eventually(() => {
			try { process.kill(descendantPid, 0); return false } catch (error) { return error.code === "ESRCH" }
		})
	} finally {
		if (descendantPid > 0) {
			try { process.kill(descendantPid, "SIGKILL") } catch (_) {}
		}
		await server.close()
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test("T27 executes a supported command in the backend even when the plugin also declares services", async () => {
	const { createPluginLifecycle } = await import("../../services/backend/domains/plugins/lifecycle.js")
	const definition = {
		mainPath: "",
		manifest: {
			id: "mixed-demo",
			permissions: ["pet:say"],
			entries: {
				commands: [{ id: "run", command: "node command.js", cwd: "." }],
				services: [{ id: "service", command: "node service.js", cwd: "." }],
			},
		},
	}
	let enabled = false
	const calls = []
	const lifecycle = createPluginLifecycle({
		registry: {
			definition: () => definition,
			get: () => ({ id: "mixed-demo", enabled }),
			requiresNative: () => false,
			isNativeApproved: () => true,
			setEnabled: (_id, value) => { enabled = value },
		},
		processRuntime: {
			start: async () => ({ processes: [] }),
			stop: async () => ({ ok: true }),
		},
		commandServer: {
			execute: async (...args) => { calls.push(args); return { ok: true } },
		},
	})
	await lifecycle.start("mixed-demo")
	assert.deepEqual(await lifecycle.command("mixed-demo", "run", { value: 1 }), { ok: true })
	assert.deepEqual(calls, [["mixed-demo", "run", { value: 1 }, {}]])
	await lifecycle.stop("mixed-demo")
})

test("T27 route to Job handler executes in the backend and cancellation removes the real child process", { timeout: 8_000 }, async () => {
	const [
		{ createPluginCommandServer },
		{ createPluginService },
		{ createSettingsStore },
		{ createPluginJobHandlers },
		{ createJobDispatcher },
		{ createQueue },
		{ createRunner },
		{ createJobsRepository },
		{ openDatabase },
		{ migrate },
	] = await Promise.all([
		import("../../services/backend/bridge/plugin-command-server.js"),
		import("../../services/backend/domains/plugins/index.js"),
		import("../../services/backend/domains/settings.js"),
		import("../../services/backend/jobs/handlers/index.js"),
		import("../../services/backend/jobs/dispatcher.js"),
		import("../../services/backend/jobs/queue.js"),
		import("../../services/backend/jobs/runner.js"),
		import("../../services/backend/store/repositories/jobs.js"),
		import("../../services/backend/store/db.js"),
		import("../../services/backend/store/migrate.js"),
	])
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-command-"))
	const userDataDir = path.join(root, "user-data")
	const source = path.join(root, "source", "command-demo")
	const pidFile = path.join(userDataDir, "plugins", "command-demo", "command.pid")
	fs.mkdirSync(source, { recursive: true })
	fs.writeFileSync(path.join(source, "plugin.json"), JSON.stringify({
		id: "command-demo",
		name: "Command Demo",
		version: "1.0.0",
		permissions: [],
		entries: {
			commands: [{ id: "hang", command: "node hang.js", cwd: "." }],
			services: [],
			setup: [],
			dashboards: [],
		},
	}))
	fs.writeFileSync(path.join(source, "hang.js"), [
		"const fs = require('node:fs')",
		"fs.writeFileSync('command.pid', String(process.pid))",
		"process.on('SIGTERM', () => {})",
		"setInterval(() => {}, 1_000)",
	].join("\n") + "\n")

	const db = await openDatabase({ file: ":memory:" })
	migrate({ db })
	const settings = createSettingsStore({ file: path.join(userDataDir, "backend", "settings.json") })
	const jobs = createJobsRepository({ db })
	const queue = createQueue({ repo: jobs, tickMs: 60_000 })
	let dispatcher
	let plugins
	const pluginPort = new Proxy({}, {
		get: (_target, property) => {
			const value = plugins?.[property]
			return typeof value === "function" ? value.bind(plugins) : value
		},
	})
	const commandServer = createPluginCommandServer({
		plugins: pluginPort,
		jobs: { insert: (input) => dispatcher(input) },
	})
	plugins = createPluginService({
		root: path.resolve(__dirname, "../.."),
		userDataDir,
		settings,
		logs: { appendPlugin() {}, listPlugin: () => [] },
		bridge: {},
		commandServer,
	})
	const runner = createRunner({
		repo: jobs,
		queue,
		handlers: createPluginJobHandlers({ plugins }),
		tmpRoot: path.join(userDataDir, "backend", "tmp"),
	})
	dispatcher = createJobDispatcher({ queue, runner })
	let pid = 0
	try {
		await plugins.install(source)
		const current = settings.read()
		settings.patch({
			ifVersion: current.version,
			patch: { "plugins.nativeExecutionApproved": { "command-demo": true } },
		})
		await plugins.start("command-demo")
		await commandServer.listen()
		const dirs = plugins.runtimeDirs("command-demo")
		assert.equal(dirs.dataDir, path.join(userDataDir, "plugins", ".openpet", "command-demo", "data"))
		assert.equal(dirs.dataDir.startsWith(path.join(userDataDir, "plugins", "command-demo") + path.sep), false)

		const job = plugins.dispatchCommand("command-demo", "hang", { value: 1 })
		await eventually(() => fs.existsSync(pidFile) && Number(fs.readFileSync(pidFile, "utf8")))
		pid = Number(fs.readFileSync(pidFile, "utf8"))
		assert.equal(jobs.byId(job.id).kind, "plugin.command")
		assert.equal(jobs.byId(job.id).status, "running")
		assert.match(spawnSync("ps", ["-p", String(pid), "-o", "pid="], { encoding: "utf8" }).stdout, new RegExp(String(pid)))

		const canceled = await runner.cancel(job.id)
		assert.equal(canceled.status, "canceled")
		await eventually(() => {
			const result = spawnSync("ps", ["-p", String(pid), "-o", "pid="], { encoding: "utf8" })
			return result.status !== 0 || !String(result.stdout).trim()
		})
		assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH")
	} finally {
		if (pid > 0) {
			try { process.kill(pid, "SIGKILL") } catch (_) {}
		}
		await commandServer.close()
		queue.stop()
		db.close()
		fs.rmSync(root, { recursive: true, force: true })
	}
})
