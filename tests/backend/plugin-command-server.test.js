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

test("T27 command child is registered in and removed from the process ledger", async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-command-ledger-"))
	fs.writeFileSync(path.join(root, "complete.js"), "console.log(JSON.stringify({ ok: true }))\n")
	const events = []
	const server = createPluginCommandServer({
		plugins: {
			definition: () => ({
				manifest: {
					id: "ledger-demo",
					basePath: root,
					entries: { commands: [{ id: "complete", command: "node complete.js", cwd: "." }] },
				},
			}),
			runtimeDirs: () => ({ dataDir: root, cacheDir: root, logDir: root }),
		},
		jobs: { insert: (input) => input },
		processLedger: {
			register(pid, metadata) { events.push(["register", pid, metadata]); return metadata },
			unregister(pid) { events.push(["unregister", pid]); return true },
		},
	})
	try {
		const result = await server.execute("ledger-demo", "complete")
		assert.equal(result.ok, true)
		assert.equal(events.length, 2)
		assert.equal(events[0][0], "register")
		assert.ok(events[0][1] > 0)
		assert.deepEqual(events[0][2], {
			pluginId: "ledger-demo",
			commandId: "complete",
			startedAt: events[0][2].startedAt,
			processName: "node",
		})
		assert.deepEqual(events[1], ["unregister", events[0][1]])
	} finally {
		await server.close()
		fs.rmSync(root, { recursive: true, force: true })
	}
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

test("T27 preserves sanitized structured command errors from nonzero exits", async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-structured-error-"))
	const script = path.join(root, "fail.js")
	fs.writeFileSync(script, [
		"console.log(JSON.stringify({",
		"  ok: false,",
		"  error: 'command failed at /Users/demo/private with sk-secret123',",
		"  code: 'COMMAND_FAILED',",
		"  details: { apiKey: 'raw-secret', path: '/tmp/private-output' }",
		"}))",
		"process.exitCode = 7",
	].join("\n") + "\n")
	const definition = {
		manifest: {
			id: "structured-error-demo",
			basePath: root,
			entries: { commands: [{ id: "fail", command: "node fail.js", cwd: "." }] },
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
		await assert.rejects(
			server.execute("structured-error-demo", "fail"),
			(error) => {
				assert.equal(error.code, "PROVIDER_ERROR")
				assert.equal(error.status, 502)
				assert.equal(error.message, "command failed at [redacted-path] with [redacted-secret]")
				assert.deepEqual(error.details, {
					ok: false,
					error: "command failed at [redacted-path] with [redacted-secret]",
					code: "COMMAND_FAILED",
					details: { "[redacted-key]": "[redacted-secret]", path: "[redacted-path]" },
				})
				assert.doesNotMatch(JSON.stringify(error.details), /raw-secret|\/Users\/demo|\/tmp\/private-output|sk-secret123/)
				return true
			},
		)
	} finally {
		await server.close()
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test("T27 bundled agent-awareness doctor receives live native approval state", async () => {
	const [
		{ createPluginCommandServer },
		{ createPluginService },
		{ createSettingsStore },
	] = await Promise.all([
		import("../../services/backend/bridge/plugin-command-server.js"),
		import("../../services/backend/domains/plugins/index.js"),
		import("../../services/backend/domains/settings.js"),
	])
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-agent-doctor-"))
	const userDataDir = path.join(root, "user-data")
	const settings = createSettingsStore({ file: path.join(userDataDir, "backend", "settings.json") })
	let plugins
	const pluginPort = new Proxy({}, {
		get: (_target, property) => {
			const value = plugins?.[property]
			return typeof value === "function" ? value.bind(plugins) : value
		},
	})
	const commandServer = createPluginCommandServer({
		plugins: pluginPort,
		jobs: { insert: (input) => input },
	})
	plugins = createPluginService({
		root: path.resolve(__dirname, "../.."),
		userDataDir,
		settings,
		logs: { appendPlugin() {}, listPlugin: () => [] },
		bridge: {},
		commandServer,
	})
	try {
		plugins.syncBundled()
		const unapproved = await commandServer.execute("openpet.agent-awareness", "doctor", { port: 65530 })
		assert.equal(unapproved.result.nativeExecutionApproved, false)
		assert.deepEqual(
			unapproved.result.checks.find((check) => check.id === "native-execution-approval"),
			{ id: "native-execution-approval", ok: false, value: "not-approved" },
		)

		const current = settings.read()
		settings.patch({
			ifVersion: current.version,
			patch: { "plugins.nativeExecutionApproved": { "openpet.agent-awareness": true } },
		})
		const approved = await commandServer.execute("openpet.agent-awareness", "doctor", { port: 65530 })
		assert.equal(approved.result.nativeExecutionApproved, true)
		assert.deepEqual(
			approved.result.checks.find((check) => check.id === "native-execution-approval"),
			{ id: "native-execution-approval", ok: true, value: "approved" },
		)
	} finally {
		await commandServer.close()
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

test("T27 abort during process registration removes the full plugin command process tree", { timeout: 8_000 }, async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-register-abort-tree-"))
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
			id: "register-abort-tree-demo",
			basePath: root,
			entries: { commands: [{ id: "hang", command: "node spawn-descendant.js", cwd: ".", timeoutMs: 0 }] },
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
	const controller = new AbortController()
	let parentPid = 0
	let descendantPid = 0
	try {
		await assert.rejects(
			server.execute("register-abort-tree-demo", "hang", {}, {
				signal: controller.signal,
				registerProcess(child) {
					parentPid = child.pid
					const waiter = spawnSync(process.execPath, [
						"-e",
						"const fs = require('node:fs'); const file = process.argv[1]; const deadline = Date.now() + 1500; while (!fs.existsSync(file) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); process.exit(fs.existsSync(file) ? 0 : 1)",
						pidFile,
					], { encoding: "utf8", timeout: 2_000 })
					assert.equal(waiter.status, 0, waiter.stderr || "command child did not create its descendant")
					descendantPid = Number(fs.readFileSync(pidFile, "utf8"))
					assert.doesNotThrow(() => process.kill(parentPid, 0))
					assert.doesNotThrow(() => process.kill(descendantPid, 0))
					controller.abort(new Error("cancel during process registration"))
				},
			}),
			/cancel during process registration/,
		)
		await eventually(() => {
			try { process.kill(parentPid, 0); return false } catch (error) { return error.code === "ESRCH" }
		})
		await eventually(() => {
			try { process.kill(descendantPid, 0); return false } catch (error) { return error.code === "ESRCH" }
		})
		assert.throws(() => process.kill(parentPid, 0), (error) => error.code === "ESRCH")
		assert.throws(() => process.kill(descendantPid, 0), (error) => error.code === "ESRCH")
	} finally {
		if (descendantPid > 0) {
			try { process.kill(descendantPid, "SIGKILL") } catch (_) {}
		}
		if (parentPid > 0) {
			try { process.kill(parentPid, "SIGKILL") } catch (_) {}
		}
		await server.close()
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test("T27 rejects an already-aborted command before spawning a process", async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-pre-spawn-abort-"))
	const pidFile = path.join(root, "command.pid")
	const script = path.join(root, "write-pid.js")
	fs.writeFileSync(script, [
		"const fs = require('node:fs')",
		"fs.writeFileSync('command.pid', String(process.pid))",
		"setInterval(() => {}, 1000)",
	].join("\n") + "\n")
	const definition = {
		manifest: {
			id: "pre-spawn-abort-demo",
			basePath: root,
			entries: { commands: [{ id: "run", command: "node write-pid.js", cwd: ".", timeoutMs: 0 }] },
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
	const controller = new AbortController()
	controller.abort(new Error("canceled before spawn"))
	let registered = false
	try {
		await assert.rejects(
			server.execute("pre-spawn-abort-demo", "run", {}, {
				signal: controller.signal,
				registerProcess() { registered = true },
			}),
			/canceled before spawn/,
		)
		await new Promise((resolve) => setTimeout(resolve, 100))
		assert.equal(registered, false)
		assert.equal(fs.existsSync(pidFile), false)
	} finally {
		await server.close()
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test("T27 close removes every active plugin command process tree", { timeout: 8_000 }, async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-close-tree-"))
	const commands = ["first", "second"].map((id) => {
		const parentPidFile = path.join(root, `${id}-parent.pid`)
		const descendantPidFile = path.join(root, `${id}-descendant.pid`)
		const scriptName = `${id}-spawn-descendant.js`
		fs.writeFileSync(path.join(root, scriptName), [
			"const { spawn } = require('node:child_process')",
			"const fs = require('node:fs')",
			`fs.writeFileSync('${id}-parent.pid', String(process.pid))`,
			"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
			`fs.writeFileSync('${id}-descendant.pid', String(child.pid))`,
			"setInterval(() => {}, 1000)",
		].join("\n") + "\n")
		return { id, parentPidFile, descendantPidFile, scriptName }
	})
	const definition = {
		manifest: {
			id: "close-tree-demo",
			basePath: root,
			entries: {
				commands: commands.map(({ id, scriptName }) => ({
					id,
					command: `node ${scriptName}`,
					cwd: ".",
					timeoutMs: 0,
				})),
			},
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
	const pids = []
	try {
		const executions = commands.map(({ id }) => server.execute("close-tree-demo", id))
		await eventually(() => commands.every(({ parentPidFile, descendantPidFile }) => (
			fs.existsSync(parentPidFile) && fs.existsSync(descendantPidFile)
		)))
		for (const { parentPidFile, descendantPidFile } of commands) {
			pids.push(Number(fs.readFileSync(parentPidFile, "utf8")))
			pids.push(Number(fs.readFileSync(descendantPidFile, "utf8")))
		}
		for (const pid of pids) assert.doesNotThrow(() => process.kill(pid, 0))

		const rejectedExecutions = executions.map((execution) => assert.rejects(execution))
		await server.close()
		await Promise.all(rejectedExecutions)
		for (const pid of pids) {
			await eventually(() => {
				try { process.kill(pid, 0); return false } catch (error) { return error.code === "ESRCH" }
			})
			assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH")
		}
	} finally {
		for (const pid of pids) {
			try { process.kill(pid, "SIGKILL") } catch (_) {}
		}
		await server.close()
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test("T27 stopPlugin awaits only that plugin's commands and expires their bridge authorization", { timeout: 8_000 }, async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-stop-plugin-"))
	const definitions = new Map()
	for (const pluginId of ["first-plugin", "second-plugin"]) {
		const pluginRoot = path.join(root, pluginId)
		fs.mkdirSync(pluginRoot, { recursive: true })
		fs.writeFileSync(path.join(pluginRoot, "hang.js"), [
			"const fs = require('node:fs')",
			"fs.writeFileSync('runtime.json', JSON.stringify({ pid: process.pid, url: process.env.OPENPET_BRIDGE_URL, token: process.env.OPENPET_BRIDGE_TOKEN }))",
			"setInterval(() => {}, 1000)",
		].join("\n") + "\n")
		definitions.set(pluginId, {
			manifest: {
				id: pluginId,
				basePath: pluginRoot,
				entries: { commands: [{ id: "hang", command: "node hang.js", cwd: ".", timeoutMs: 0 }] },
			},
		})
	}
	const server = createPluginCommandServer({
		plugins: {
			definition: (id) => definitions.get(id),
			config: () => ({}),
			runtimeDirs: (id) => ({ dataDir: path.join(root, id), cacheDir: path.join(root, id), logDir: path.join(root, id) }),
			handleCommandCapability: async () => ({ ok: true }),
		},
		jobs: { insert: (input) => input },
	})
	const executions = new Map()
	const runtime = new Map()
	try {
		for (const pluginId of definitions.keys()) executions.set(pluginId, server.execute(pluginId, "hang"))
		await eventually(() => [...definitions.keys()].every((id) => fs.existsSync(path.join(root, id, "runtime.json"))))
		for (const pluginId of definitions.keys()) {
			runtime.set(pluginId, JSON.parse(fs.readFileSync(path.join(root, pluginId, "runtime.json"), "utf8")))
		}

		await server.stopPlugin("first-plugin")
		await assert.rejects(executions.get("first-plugin"))
		assert.throws(() => process.kill(runtime.get("first-plugin").pid, 0), (error) => error.code === "ESRCH")
		assert.doesNotThrow(() => process.kill(runtime.get("second-plugin").pid, 0))

		const first = runtime.get("first-plugin")
		const response = await fetch(first.url + "/pet/say", {
			method: "POST",
			headers: { authorization: `Bearer ${first.token}`, "content-type": "application/json" },
			body: JSON.stringify({ text: "must not run" }),
		})
		assert.equal(response.status, 401)
	} finally {
		for (const value of runtime.values()) {
			try { process.kill(value.pid, "SIGKILL") } catch (_) {}
		}
		await server.close()
		await Promise.allSettled(executions.values())
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test("T27 lifecycle stop awaits command revocation for declaration-only and mixed plugins", async () => {
	const { createPluginLifecycle } = await import("../../services/backend/domains/plugins/lifecycle.js")
	for (const mixed of [false, true]) {
		const pluginId = mixed ? "mixed-stop" : "declaration-stop"
		const definition = {
			mainPath: "",
			manifest: {
				id: pluginId,
				permissions: [],
				entries: {
					commands: [{ id: "run", command: "node command.js" }],
					services: mixed ? [{ id: "service", command: "node service.js" }] : [],
				},
			},
		}
		let enabled = false
		let releaseCommands
		let stopped = false
		const commandStopped = new Promise((resolve) => { releaseCommands = resolve })
		const calls = []
		const lifecycle = createPluginLifecycle({
			registry: {
				definition: () => definition,
				get: () => ({ id: pluginId, enabled }),
				requiresNative: () => false,
				isNativeApproved: () => true,
				setEnabled: (_id, value) => { enabled = value },
			},
			processRuntime: {
				start: async () => ({ processes: [] }),
				stop: async () => { calls.push("service"); return { ok: true } },
			},
			commandServer: {
				execute: async () => ({ ok: true }),
				stopPlugin: async (id) => { calls.push(`commands:${id}`); await commandStopped },
			},
		})
		await lifecycle.start(pluginId)
		const stopping = lifecycle.stop(pluginId).then(() => { stopped = true })
		await new Promise((resolve) => setImmediate(resolve))
		assert.equal(stopped, false)
		assert.deepEqual(calls, mixed ? ["service", `commands:${pluginId}`] : [`commands:${pluginId}`])
		releaseCommands()
		await stopping
		assert.equal(enabled, false)
	}
})

test("T27 plugin disable and native approval revoke await command termination", async () => {
	const [{ createPluginService }, { createSettingsStore }] = await Promise.all([
		import("../../services/backend/domains/plugins/index.js"),
		import("../../services/backend/domains/settings.js"),
	])
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-revoke-"))
	const userDataDir = path.join(root, "user-data")
	const settings = createSettingsStore({ file: path.join(userDataDir, "backend", "settings.json") })
	const pending = []
	const stopped = []
	const commandServer = {
		execute: async () => ({ ok: true }),
		stopPlugin(id) {
			stopped.push(id)
			let resolve
			const promise = new Promise((done) => { resolve = done })
			pending.push(resolve)
			return promise
		},
	}
	const source = path.join(root, "source")
	fs.mkdirSync(source, { recursive: true })
	fs.writeFileSync(path.join(source, "plugin.json"), JSON.stringify({
		id: "revoke-demo", name: "Revoke Demo", version: "1.0.0", permissions: [],
		entries: { commands: [{ id: "run", command: "node command.js" }], services: [], setup: [], dashboards: [] },
	}))
	fs.writeFileSync(path.join(source, "command.js"), "")
	const plugins = createPluginService({
		root: path.resolve(__dirname, "../.."), userDataDir, settings, commandServer,
		logs: { appendPlugin() {}, listPlugin: () => [] }, bridge: {},
	})
	try {
		await plugins.install(source)
		settings.patch({
			ifVersion: settings.read().version,
			patch: { "plugins.nativeExecutionApproved": { "revoke-demo": true } },
		})
		await plugins.start("revoke-demo")
		let disabled = false
		const disabling = plugins.setEnabled("revoke-demo", false).then(() => { disabled = true })
		await new Promise((resolve) => setImmediate(resolve))
		assert.equal(disabled, false)
		pending.shift()()
		await disabling
		assert.equal(plugins.get("revoke-demo").enabled, false)

		await plugins.start("revoke-demo")
		let revoked = false
		const revoking = plugins.setNativeExecutionApproved("revoke-demo", false).then(() => { revoked = true })
		await new Promise((resolve) => setImmediate(resolve))
		assert.equal(revoked, false)
		assert.equal(plugins.get("revoke-demo").nativeExecutionApproved, false)
		pending.shift()()
		await revoking
		assert.deepEqual(stopped, ["revoke-demo", "revoke-demo"])
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test("T27 queued mixed-plugin start is serialized before later disable and native revoke", async () => {
	const [{ createPluginService }, { createSettingsStore }] = await Promise.all([
		import("../../services/backend/domains/plugins/index.js"),
		import("../../services/backend/domains/settings.js"),
	])
	for (const mutation of ["disable", "revoke"]) {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), `openpet-t27-${mutation}-race-`))
		const userDataDir = path.join(root, "user-data")
		const source = path.join(root, "source")
		fs.mkdirSync(source, { recursive: true })
		fs.writeFileSync(path.join(source, "plugin.json"), JSON.stringify({
			id: "race-demo", name: "Race Demo", version: "1.0.0", permissions: [],
			entries: {
				commands: [{ id: "run", command: "node command.js" }],
				services: [{ id: "service", command: "node service.js" }],
				setup: [], dashboards: [],
			},
		}))
		fs.writeFileSync(path.join(source, "command.js"), "")
		fs.writeFileSync(path.join(source, "service.js"), "")
		const settings = createSettingsStore({ file: path.join(userDataDir, "backend", "settings.json") })
		let releaseStart
		let markStartEntered
		const startEntered = new Promise((resolve) => { markStartEntered = resolve })
		const startGate = new Promise((resolve) => { releaseStart = resolve })
		let serviceStops = 0
		let commandStops = 0
		const plugins = createPluginService({
			root: path.resolve(__dirname, "../.."), userDataDir, settings,
			logs: { appendPlugin() {}, listPlugin: () => [] }, bridge: {},
			processRuntime: {
				start: async () => { markStartEntered(); await startGate; return { processes: [] } },
				stop: async () => { serviceStops += 1; return { ok: true } },
			},
			commandServer: {
				execute: async () => ({ ok: true }),
				stopPlugin: async () => { commandStops += 1; return { ok: true } },
			},
		})
		try {
			await plugins.install(source)
			settings.patch({
				ifVersion: settings.read().version,
				patch: { "plugins.nativeExecutionApproved": { "race-demo": true } },
			})
			const starting = plugins.start("race-demo")
			const mutating = mutation === "disable"
				? plugins.setEnabled("race-demo", false)
				: plugins.setNativeExecutionApproved("race-demo", false)
			await startEntered
			releaseStart()
			await Promise.all([starting, mutating])
			assert.equal(plugins.status("race-demo").status, "stopped")
			assert.equal(plugins.get("race-demo").enabled, false)
			assert.equal(plugins.get("race-demo").nativeExecutionApproved, mutation !== "revoke")
			assert.equal(serviceStops, 1)
			assert.equal(commandStops, 1)
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	}
})

test("T27 stopPlugin and close return only after reparented command descendants exit", { timeout: 10_000 }, async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	for (const operation of ["stopPlugin", "close"]) {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), `openpet-t27-${operation}-descendants-`))
		const parentPidFile = path.join(root, "parent.pid")
		const grandchildPidFile = path.join(root, "grandchild.pid")
		fs.writeFileSync(path.join(root, "intermediate.js"), [
			"const { spawn } = require('node:child_process')",
			"const fs = require('node:fs')",
			"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
			"fs.writeFileSync('grandchild.pid', String(child.pid))",
			"child.unref()",
		].join("\n") + "\n")
		fs.writeFileSync(path.join(root, "parent.js"), [
			"const { spawn } = require('node:child_process')",
			"const fs = require('node:fs')",
			"fs.writeFileSync('parent.pid', String(process.pid))",
			"const child = spawn(process.execPath, ['intermediate.js'], { stdio: 'ignore' })",
			"child.unref()",
			"setInterval(() => {}, 1000)",
		].join("\n") + "\n")
		const server = createPluginCommandServer({
			plugins: {
				definition: () => ({ manifest: { id: "tree-demo", basePath: root, entries: { commands: [{ id: "run", command: "node parent.js", cwd: ".", timeoutMs: 0 }] } } }),
				config: () => ({}),
				runtimeDirs: () => ({ dataDir: root, cacheDir: root, logDir: root }),
			},
			jobs: { insert: (input) => input },
		})
		let parentPid = 0
		let grandchildPid = 0
		try {
			const executing = server.execute("tree-demo", "run")
			const rejected = assert.rejects(executing)
			await eventually(() => fs.existsSync(parentPidFile) && fs.existsSync(grandchildPidFile))
			parentPid = Number(fs.readFileSync(parentPidFile, "utf8"))
			grandchildPid = Number(fs.readFileSync(grandchildPidFile, "utf8"))
			await eventually(() => {
				const output = spawnSync("ps", ["-o", "ppid=", "-p", String(grandchildPid)], { encoding: "utf8" }).stdout.trim()
				return output && Number(output) !== parentPid
			})
			if (operation === "close") await server.close()
			else await server.stopPlugin("tree-demo")
			await rejected
			assert.throws(() => process.kill(parentPid, 0), (error) => error.code === "ESRCH")
			assert.throws(() => process.kill(grandchildPid, 0), (error) => error.code === "ESRCH")
		} finally {
			for (const pid of [grandchildPid, parentPid]) {
				try { process.kill(pid, "SIGKILL") } catch (_) {}
			}
			await server.close()
			fs.rmSync(root, { recursive: true, force: true })
		}
	}
})

test("T27 dispatch persists only redacted Job input while executing transient original args", async () => {
	const [
		{ createPluginCommandServer }, { createPluginJobHandlers }, { createJobDispatcher }, { createQueue },
		{ createRunner }, { createJobsRepository }, { openDatabase }, { migrate },
	] = await Promise.all([
		import("../../services/backend/bridge/plugin-command-server.js"),
		import("../../services/backend/jobs/handlers/index.js"),
		import("../../services/backend/jobs/dispatcher.js"),
		import("../../services/backend/jobs/queue.js"),
		import("../../services/backend/jobs/runner.js"),
		import("../../services/backend/store/repositories/jobs.js"),
		import("../../services/backend/store/db.js"),
		import("../../services/backend/store/migrate.js"),
	])
	const db = await openDatabase({ file: ":memory:" })
	migrate({ db })
	const jobs = createJobsRepository({ db })
	const queue = createQueue({ repo: jobs, tickMs: 60_000 })
	let received = null
	const runner = createRunner({
		repo: jobs,
		queue,
		handlers: createPluginJobHandlers({ plugins: {
			commandInput: (jobId) => commandServer.takeInput(jobId),
			command: async (pluginId, command, args) => {
				received = { pluginId, command, args }
				return { ok: true }
			},
		} }),
	})
	const dispatcher = createJobDispatcher({ queue, runner })
	const commandServer = createPluginCommandServer({
		plugins: { get: (id) => ({ id }) },
		jobs: { insert: (input) => dispatcher(input) },
		now: () => 12_345,
	})
	const secrets = { telegramToken: "tg-short", apiKey: "api-secret", nested: { password: "pass-secret" } }
	try {
		const job = commandServer.dispatch("secret-demo", "send", secrets)
		const raw = db.prepare("SELECT input_json FROM jobs WHERE id = ?").get(job.id).input_json
		assert.doesNotMatch(raw, /tg-short|api-secret|pass-secret|telegramToken|apiKey|password/)
		assert.deepEqual(JSON.parse(raw), { redacted: true, summary: "Plugin command secret-demo/send" })
		await eventually(() => jobs.byId(job.id).status === "succeeded")
		assert.deepEqual(received, { pluginId: "secret-demo", command: "send", args: secrets })
		assert.equal(jobs.byId(job.id).maxAttempts, 1)
		assert.doesNotMatch(JSON.stringify(jobs.byId(job.id)), /tg-short|api-secret|pass-secret/)
	} finally {
		await commandServer.close()
		queue.stop()
		await runner.shutdown()
		db.close()
	}
})

test("T27 close is a terminal barrier for concurrent and later listen or execute calls", async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-close-barrier-"))
	const pidFile = path.join(root, "spawned.pid")
	fs.writeFileSync(path.join(root, "run.js"), "require('node:fs').writeFileSync('spawned.pid', String(process.pid))\n")
	const server = createPluginCommandServer({
		plugins: {
			definition: () => ({ manifest: { id: "barrier", basePath: root, entries: { commands: [{ id: "run", command: "node run.js", cwd: "." }] } } }),
			config: () => ({}),
			runtimeDirs: () => ({ dataDir: root, cacheDir: root, logDir: root }),
		},
		jobs: { insert: (input) => input },
	})
	try {
		await server.listen()
		const closing = server.close()
		const concurrentListen = server.listen()
		await closing
		await assert.rejects(concurrentListen, (error) => error.code === "BACKEND_UNAVAILABLE")
		await assert.rejects(server.listen(), (error) => error.code === "BACKEND_UNAVAILABLE")
		await assert.rejects(server.execute("barrier", "run"), (error) => error.code === "BACKEND_UNAVAILABLE")
		assert.equal(fs.existsSync(pidFile), false)
	} finally {
		await server.close()
		fs.rmSync(root, { recursive: true, force: true })
	}
})

test("T27 execute already waiting on listen cannot spawn across the close barrier", async () => {
	const { createPluginCommandServer } = await import("../../services/backend/bridge/plugin-command-server.js")
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-t27-execute-close-race-"))
	const pidFile = path.join(root, "spawned.pid")
	fs.writeFileSync(path.join(root, "run.js"), "require('node:fs').writeFileSync('spawned.pid', String(process.pid))\n")
	const server = createPluginCommandServer({
		plugins: {
			definition: () => ({ manifest: { id: "race", basePath: root, entries: { commands: [{ id: "run", command: "node run.js", cwd: "." }] } } }),
			config: () => ({}),
			runtimeDirs: () => ({ dataDir: root, cacheDir: root, logDir: root }),
		},
		jobs: { insert: (input) => input },
	})
	try {
		const executing = server.execute("race", "run")
		const closing = server.close()
		await assert.rejects(executing, (error) => error.code === "BACKEND_UNAVAILABLE")
		await closing
		assert.equal(fs.existsSync(pidFile), false)
	} finally {
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
