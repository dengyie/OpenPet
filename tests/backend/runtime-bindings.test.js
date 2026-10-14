"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { spawnSidecar, stopSidecar } = require("../../apps/desktop/src/sidecar/spawn.js")
const { createMessageHandler } = require("../../apps/desktop/src/sidecar/message-handler.js")
const { createSettingsSidecarBridge } = require("../../apps/desktop/src/services/settings-sidecar-bridge.js")
const { createSettingsHostEffect } = require("../../apps/desktop/src/services/settings-host-effects.js")

const repoRoot = path.resolve(__dirname, "../..")

test("sidecar routes use runtime dependencies initialized before ready", async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-runtime-bindings-"))
	const settingsFile = path.join(userDataDir, "backend", "settings.json")
	fs.mkdirSync(path.dirname(settingsFile), { recursive: true })
	fs.writeFileSync(settingsFile, JSON.stringify({
		version: 7,
		values: { existing: { enabled: true } },
	}) + "\n")

	let backend = null
	let applyValues = null
	const persistedSecrets = []
	const catalogRequests = []
	const catalogState = {
		schemaVersion: 1, updatedAt: "2026-09-05T00:00:00.000Z", feedbackUrl: "",
		localBlocklist: { pluginIds: [], packIds: [], sha256: [] },
		catalogBlocklist: { pluginIds: [], packIds: [], sha256: [] },
		blocklist: { pluginIds: [], packIds: [], sha256: [] }, plugins: [], petPacks: [],
	}
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: {
				userDataDir,
				providerKeys: { openai: "initial-provider-key-1234" },
				legacyToken: null,
				appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" },
			},
			logger: { info() {}, warn() {}, error() {} },
		})
		// The integration harness is the Shell for this isolated sidecar. Keep the
		// real settings.apply request/response handshake enabled while exercising
		// the HTTP routes. Route the envelope through the real Shell handler and
		// host bridge so a backend apply never falls back to a GET.
		let hostAppliedSettings = null
		let rejectHostApply = false
		const hostBridge = createSettingsSidecarBridge({
			getBackend: () => backend,
			fetchImpl: async () => { throw new Error("unexpected settings GET") },
			petService: { getSettings: () => ({ scale: 1 }), applySettings: (settings) => settings },
			applyHostSettings: ({ settings }) => {
				if (rejectHostApply) throw new Error("native cursor helper failed")
				hostAppliedSettings = settings
				return settings
			},
		})
			const shellHandler = createMessageHandler({
				send: (envelope) => backend.child.send(envelope),
				onSettingsApplyRequest: (envelope) => hostBridge.handle(envelope),
				onActionsRequest: async ({ operation }) => {
					assert.equal(operation, "get")
					return {
						defaultAction: "idle",
						clickAction: "idle",
						actions: [],
						triggerRules: [],
						triggerProposalInbox: [],
					}
				},
				onPetPackRequest: ({ operation }) => {
					assert.equal(operation, "list")
					return { activePackId: "legacy-cat", packs: [] }
			},
			onActionsRequest: ({ operation }) => {
				assert.equal(operation, "get")
				return { defaultAction: "idle", clickAction: "idle", actions: [{ id: "idle" }] }
			},
			secretService: {
				setSecret: (entry) => persistedSecrets.push(entry),
				deleteSecret: (id) => persistedSecrets.push({ deleted: id }),
			},
			onCatalogRequest: async (request) => { catalogRequests.push(request); return catalogState },
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "settings.apply.request") applyValues = envelope.body.values
			if (["settings.apply.request", "secrets.persist.request", "catalog.request", "pet-packs.request", "actions.request"].includes(envelope?.body?.type)) {
				void shellHandler.handle(envelope)
			}
		})

		const headers = {
			authorization: `Bearer ${backend.sessionToken}`,
			"content-type": "application/json",
		}
		const persistedBeforePatch = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
		const settingsResponse = await fetch(`${backend.baseUrl}/settings`, { headers })
		const settingsBody = await settingsResponse.json()
		const aboutResponse = await fetch(`${backend.baseUrl}/about`, { headers })
		const aboutBody = await aboutResponse.json()
		const patchResponse = await fetch(`${backend.baseUrl}/settings`, {
			method: "PATCH",
			headers,
			body: JSON.stringify({
				ifVersion: persistedBeforePatch.version,
				patch: { scale: 1.1 },
			}),
		})
		const patchBody = await patchResponse.json()
		const domainStatuses = {}
		for (const route of ["/catalog", "/pet-packs", "/actions"]) {
			const response = await fetch(backend.baseUrl + route, { headers })
			domainStatuses[route] = response.status
		}
		const plaintext = "runtime-provider-secret-9876543210"
		const providerWriteResponse = await fetch(`${backend.baseUrl}/ai/providers/ai.default/key`, {
			method: "PUT",
			headers,
			body: JSON.stringify({ apiKey: plaintext }),
		})
		const providerWriteBody = await providerWriteResponse.json()
		const providerReadResponse = await fetch(`${backend.baseUrl}/ai/providers/ai.default/key`, { headers })
		const providerDeleteResponse = await fetch(`${backend.baseUrl}/ai/providers/ai.default/key`, { method: "DELETE", headers })
		const providerDeleteBody = await providerDeleteResponse.json()

		assert.deepEqual({
			get: { status: settingsResponse.status, data: settingsBody.data },
			about: { status: aboutResponse.status, data: aboutBody.data },
			patch: { status: patchResponse.status, ok: patchBody.ok },
			domainStatuses,
			provider: {
				write: { status: providerWriteResponse.status, data: providerWriteBody.data },
				readStatus: providerReadResponse.status,
				remove: { status: providerDeleteResponse.status, data: providerDeleteBody.data },
			},
		}, {
			get: { status: 200, data: persistedBeforePatch },
			about: {
				status: 200,
				data: {
					name: "openpet",
					productName: "OpenPet",
					version: "9.8.7",
					packaged: true,
					platform: "test-platform",
					arch: "test-arch",
					update: {
						configured: true,
						provider: "github",
						owner: "dengyie",
						repo: "OpenPet",
						channel: "latest",
						url: "https://github.com/dengyie/OpenPet/releases",
					},
				},
			},
			patch: { status: 200, ok: true },
			domainStatuses: { "/catalog": 200, "/pet-packs": 200, "/actions": 200 },
			provider: {
				write: { status: 200, data: { configured: true, maskedTail: "…3210" } },
				readStatus: 404,
				remove: { status: 200, data: { configured: false, maskedTail: "" } },
			},
		})
		assert.doesNotMatch(JSON.stringify(providerWriteBody), /runtime-provider-secret|987654/)
		assert.deepEqual(persistedSecrets, [
			{ id: "ai.default", value: plaintext, label: "ai.default", kind: "provider" },
			{ deleted: "ai.default" },
		])

		const persistedAfterPatch = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
		assert.equal(persistedAfterPatch.values.scale, 1.1)
		assert.equal(persistedAfterPatch.version, persistedBeforePatch.version + 1)
		assert.deepEqual(applyValues, { scale: 1.1 })
		assert.equal(hostAppliedSettings.scale, 1.1)
		assert.deepEqual(catalogRequests, [{ operation: "listCatalog" }])

		rejectHostApply = true
		const rejectedPatch = await fetch(`${backend.baseUrl}/settings`, {
			method: "PATCH",
			headers,
			body: JSON.stringify({ ifVersion: persistedAfterPatch.version, patch: { scale: 1.2 } }),
		})
		assert.equal(rejectedPatch.status, 503)
		assert.equal(JSON.parse(fs.readFileSync(settingsFile, "utf8")).values.scale, 1.1)
	} finally {
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("Pet Pack HTTP picker completes accept and cancel over the real Sidecar reverse channel", { timeout: 10_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-pet-pack-picker-http-"))
	let backend = null
	let pickCount = 0
	const privatePath = path.join(userDataDir, "private-pet-pack")
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: {
				userDataDir,
				providerKeys: {},
				legacyToken: null,
				appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" },
			},
			logger: { info() {}, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onPetPackRequest: async ({ operation, payload }) => {
				assert.deepEqual({ operation, payload }, { operation: "pick", payload: {} })
				pickCount += 1
				if (pickCount === 2) return { canceled: true }
				return {
					canceled: false,
					selectionId: "opaque-selection-1",
					folderName: "demo-pack",
					valid: true,
					errors: [],
					warnings: [],
					pack: { id: "demo-pack", displayName: "Demo Pack" },
				}
			},
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "pet-packs.request") void shellHandler.handle(envelope)
		})

		const headers = {
			authorization: `Bearer ${backend.sessionToken}`,
			"content-type": "application/json",
		}
		const pick = () => fetch(`${backend.baseUrl}/pet-packs/validate`, {
			method: "POST",
			headers,
			body: JSON.stringify({ operation: "pick" }),
		})
		const accepted = await pick()
		assert.equal(accepted.status, 200)
		const acceptedBody = await accepted.json()
		assert.deepEqual(acceptedBody.data, {
			canceled: false,
			selectionId: "opaque-selection-1",
			folderName: "demo-pack",
			valid: true,
			errors: [],
			warnings: [],
			pack: { id: "demo-pack", displayName: "Demo Pack" },
		})
		assert.equal(JSON.stringify(acceptedBody).includes(privatePath), false)

		const canceled = await pick()
		assert.equal(canceled.status, 200)
		assert.deepEqual((await canceled.json()).data, { canceled: true })

		const pathInjection = await fetch(`${backend.baseUrl}/pet-packs/validate`, {
			method: "POST",
			headers,
			body: JSON.stringify({ operation: "pick", sourcePath: privatePath }),
		})
		assert.equal(pathInjection.status, 400)
		assert.equal((await pathInjection.json()).error.code, "VALIDATION_FAILED")
		assert.equal(pickCount, 2)
	} finally {
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("catalog install becomes non-cancelable before the Shell-owned side effect", { timeout: 10_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-catalog-finalizing-"))
	let backend = null
	let releaseInstall = () => {}
	let markInstallStarted = () => {}
	const installReleased = new Promise((resolve) => { releaseInstall = resolve })
	const installStarted = new Promise((resolve) => { markInstallStarted = resolve })
	const catalog = {
		schemaVersion: 1, updatedAt: "2026-09-05T00:00:00.000Z", feedbackUrl: "",
		localBlocklist: { pluginIds: [], packIds: [], sha256: [] },
		catalogBlocklist: { pluginIds: [], packIds: [], sha256: [] },
		blocklist: { pluginIds: [], packIds: [], sha256: [] }, plugins: [], petPacks: [],
	}
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null, appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" } },
			logger: { info() {}, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onCatalogRequest: async (request) => {
				assert.deepEqual(request, { operation: "installSelection", selectionId: "selection-1" })
				markInstallStarted(); await installReleased
				return { ok: true, kind: "plugin", itemId: "focus-timer", catalog }
			},
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "catalog.request") void shellHandler.handle(envelope)
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }
		const queuedResponse = await fetch(`${backend.baseUrl}/catalog/install`, { method: "POST", headers, body: JSON.stringify({ selectionId: "selection-1" }) })
		assert.equal(queuedResponse.status, 202)
		const { jobId } = (await queuedResponse.json()).data
		await installStarted
		const runningJob = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
		assert.equal(runningJob.progress.phase, "finalizing")
		assert.equal(runningJob.cancelable, false)
		const cancelResponse = await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers, body: "{}" })
		assert.equal(cancelResponse.status, 423)
		assert.equal((await cancelResponse.json()).error.code, "JOB_NOT_CANCELABLE")
		releaseInstall()
		let completed = null
		for (let attempt = 0; attempt < 100; attempt += 1) {
			completed = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
			if (completed.status === "succeeded") break
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
		assert.equal(completed.status, "succeeded")
		assert.equal(completed.result.itemId, "focus-timer")
	} finally {
		releaseInstall()
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("hatch Job cancellation forwards a typed stop request and cannot finish succeeded", { timeout: 10_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-hatch-cancel-"))
	let backend = null
	let releaseStart = () => {}
	let markStart = () => {}
	let stopCalls = 0
	const startStarted = new Promise((resolve) => { markStart = resolve })
	const startReleased = new Promise((resolve) => { releaseStart = resolve })
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null, appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" } },
			logger: { info() {}, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onAiTalkRequest: async ({ operation, payload }) => {
				if (operation === "hatch.start") {
					assert.equal(payload.runId, "run-cancel")
					markStart()
					await startReleased
					return { status: "shadow-recorded", code: "ok", message: "recorded", decision: null }
				}
				if (operation === "hatch.stop") {
					assert.equal(payload.runId, "run-cancel")
					stopCalls += 1
					releaseStart()
					return { canceled: true }
				}
				throw new Error(`unexpected AI operation: ${operation}`)
			},
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "ai.talk.request") void shellHandler.handle(envelope)
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }
		const accepted = await fetch(`${backend.baseUrl}/ai/hatch/start`, { method: "POST", headers, body: JSON.stringify({ runId: "run-cancel", mode: "full-pet", stage: "planning" }) })
		assert.equal(accepted.status, 202)
		const { jobId } = (await accepted.json()).data
		await startStarted
		const duplicate = await fetch(`${backend.baseUrl}/ai/hatch/start`, { method: "POST", headers, body: JSON.stringify({ runId: "run-cancel", mode: "full-pet", stage: "planning" }) })
		assert.equal(duplicate.status, 423)
		assert.equal((await duplicate.json()).error.code, "LOCKED")
		const cancel = await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers, body: "{}" })
		assert.equal(cancel.status, 200)
		let settled = null
		for (let attempt = 0; attempt < 100; attempt += 1) {
			settled = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
			if (settled.status === "canceled") break
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
		assert.equal(settled.status, "canceled")
		assert.equal(stopCalls, 1)
	} finally {
		releaseStart()
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("hatch Job stop failures remain observable while cancellation settles", { timeout: 10_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-hatch-stop-failure-"))
	let backend = null
	let releaseStart = () => {}
	let markStart = () => {}
	let stopCalls = 0
	const sidecarLogs = []
	const startStarted = new Promise((resolve) => { markStart = resolve })
	const startReleased = new Promise((resolve) => { releaseStart = resolve })
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null, appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" } },
			logger: { info(message) { sidecarLogs.push(String(message)) }, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onAiTalkRequest: async ({ operation, payload }) => {
				if (operation === "hatch.start") {
					assert.equal(payload.runId, "run-stop-failure")
					markStart()
					await startReleased
					return { status: "shadow-recorded", code: "ok", message: "recorded", decision: null }
				}
				if (operation === "hatch.stop") {
					assert.equal(payload.runId, "run-stop-failure")
					stopCalls += 1
					releaseStart()
				throw Object.assign(new Error("hatch stop transport failed with sk-stop-secret-1234"), { code: "BACKEND_UNAVAILABLE" })
				}
				throw new Error(`unexpected AI operation: ${operation}`)
			},
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "ai.talk.request") void shellHandler.handle(envelope)
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }
		const accepted = await fetch(`${backend.baseUrl}/ai/hatch/start`, { method: "POST", headers, body: JSON.stringify({ runId: "run-stop-failure", mode: "full-pet", stage: "planning" }) })
		assert.equal(accepted.status, 202)
		const { jobId } = (await accepted.json()).data
		await startStarted
		const cancel = await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers, body: "{}" })
		assert.equal(cancel.status, 200)
		let settled = null
		for (let attempt = 0; attempt < 100; attempt += 1) {
			settled = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
			if (settled.status === "canceled") break
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
		assert.equal(settled.status, "canceled")
		assert.equal(stopCalls, 1)
		const stopFailureLog = sidecarLogs.find((line) => line.includes("Hatch Job stop request failed"))
		assert.ok(stopFailureLog?.includes(jobId))
		assert.ok(stopFailureLog?.includes("run-stop-failure"))
		assert.ok(stopFailureLog?.includes("BACKEND_UNAVAILABLE"))
		assert.equal(stopFailureLog?.includes("sk-stop-secret-1234"), false)
	} finally {
		releaseStart()
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("Pet Pack import clears its Shell selection after the uncancelable finalizing operation", { timeout: 10_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-pet-pack-finalizing-"))
	let backend = null
	let releaseImport = () => {}
	let markImportStarted = () => {}
	const importStarted = new Promise((resolve) => { markImportStarted = resolve })
	const importReleased = new Promise((resolve) => { releaseImport = resolve })
	const operations = []
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null, appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" } },
			logger: { info() {}, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onPetPackRequest: async ({ operation, payload }) => {
				operations.push({ operation, payload })
				if (operation === "import") {
					markImportStarted()
					await importReleased
					return { pack: { id: "runtime-pack" }, petPacks: { activePackId: "legacy-cat", packs: [] } }
				}
				if (operation === "clear-selection") return { ok: true }
				throw new Error(`unexpected Pet Pack operation: ${operation}`)
			},
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "pet-packs.request") void shellHandler.handle(envelope)
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }
		const accepted = await fetch(`${backend.baseUrl}/pet-packs/import`, { method: "POST", headers, body: JSON.stringify({ selectionId: "selection-runtime" }) })
		assert.equal(accepted.status, 202)
		const { jobId } = (await accepted.json()).data
		await importStarted
		const running = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
		assert.equal(running.progress.phase, "finalizing")
		const canceled = await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers, body: "{}" })
		assert.equal(canceled.status, 423)
		assert.equal((await canceled.json()).error.code, "JOB_NOT_CANCELABLE")
		releaseImport()
		let settled = null
		for (let attempt = 0; attempt < 100; attempt += 1) {
			settled = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
			if (["succeeded", "failed", "canceled"].includes(settled.status)) break
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
		assert.equal(settled.status, "succeeded")
		assert.deepEqual(operations.map(({ operation, payload }) => ({ operation, payload })), [
			{ operation: "import", payload: { selectionId: "selection-runtime" } },
			{ operation: "clear-selection", payload: { selectionId: "selection-runtime" } },
		])
	} finally {
		releaseImport()
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("Pet Pack import clears its Shell selection after an import failure", { timeout: 10_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-pet-pack-failure-"))
	let backend = null
	const operations = []
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null, appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" } },
			logger: { info() {}, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onPetPackRequest: async ({ operation, payload }) => {
				operations.push({ operation, payload })
				if (operation === "import") throw Object.assign(new Error("blocked pet pack"), { code: "PET_PACK_INCOMPATIBLE" })
				if (operation === "clear-selection") return { ok: true }
				throw new Error(`unexpected Pet Pack operation: ${operation}`)
			},
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "pet-packs.request") void shellHandler.handle(envelope)
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }
		const accepted = await fetch(`${backend.baseUrl}/pet-packs/import`, { method: "POST", headers, body: JSON.stringify({ selectionId: "selection-failure" }) })
		assert.equal(accepted.status, 202)
		const { jobId } = (await accepted.json()).data
		let settled = null
		for (let attempt = 0; attempt < 100; attempt += 1) {
			settled = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
			if (settled.status === "failed") break
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
		assert.equal(settled.status, "failed")
		assert.equal(settled.error.code, "PET_PACK_INCOMPATIBLE")
		assert.equal(settled.error.retryable, false)
		assert.deepEqual(operations.map(({ operation, payload }) => ({ operation, payload })), [
			{ operation: "import", payload: { selectionId: "selection-failure" } },
			{ operation: "clear-selection", payload: { selectionId: "selection-failure" } },
		])
	} finally {
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("Pet Pack export becomes non-cancelable at the Shell-owned finalizing boundary", { timeout: 10_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-pet-pack-export-finalizing-"))
	let backend = null
	let releaseExport = () => {}
	let markExportStarted = () => {}
	const exportStarted = new Promise((resolve) => { markExportStarted = resolve })
	const exportReleased = new Promise((resolve) => { releaseExport = resolve })
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null, appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" } },
			logger: { info() {}, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onPetPackRequest: async ({ operation, payload }) => {
				assert.deepEqual({ operation, payload }, { operation: "export", payload: { packId: "exportable-cat" } })
				markExportStarted()
				await exportReleased
				return { canceled: false, fileName: "exportable-cat-1.0.0.openpet-pet.zip" }
			},
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "pet-packs.request") void shellHandler.handle(envelope)
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }
		const accepted = await fetch(`${backend.baseUrl}/pet-packs/exportable-cat/export`, { method: "POST", headers, body: JSON.stringify({}) })
		assert.equal(accepted.status, 202)
		const { jobId } = (await accepted.json()).data
		await exportStarted
		const running = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
		assert.equal(running.progress.phase, "finalizing")
		const canceled = await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers, body: "{}" })
		assert.equal(canceled.status, 423)
		assert.equal((await canceled.json()).error.code, "JOB_NOT_CANCELABLE")
		releaseExport()
		let settled = null
		for (let attempt = 0; attempt < 100; attempt += 1) {
			settled = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
			if (settled.status === "succeeded") break
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
		assert.equal(settled.status, "succeeded")
		assert.equal(settled.result.fileName, "exportable-cat-1.0.0.openpet-pet.zip")
	} finally {
		releaseExport()
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("Pet Pack export Shell failures settle as non-retryable failed Jobs", { timeout: 10_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-pet-pack-export-failure-"))
	let backend = null
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null, appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" } },
			logger: { info() {}, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onPetPackRequest: async () => { throw Object.assign(new Error("export authority unavailable"), { code: "BACKEND_UNAVAILABLE" }) },
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "pet-packs.request") void shellHandler.handle(envelope)
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }
		const accepted = await fetch(`${backend.baseUrl}/pet-packs/exportable-cat/export`, { method: "POST", headers, body: JSON.stringify({}) })
		assert.equal(accepted.status, 202)
		const { jobId } = (await accepted.json()).data
		let settled = null
		for (let attempt = 0; attempt < 100; attempt += 1) {
			settled = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
			if (settled.status === "failed") break
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
		assert.equal(settled.status, "failed")
		assert.equal(settled.error.code, "BACKEND_UNAVAILABLE")
		assert.equal(settled.error.retryable, true)
		assert.equal(settled.canRetry, false)
	} finally {
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("Actions import Jobs clear retained Shell selections on success and typed failure", { timeout: 10_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-actions-selection-cleanup-"))
	let backend = null
	const operations = []
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null, appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" } },
			logger: { info() {}, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onActionsRequest: async ({ operation, payload }) => {
				operations.push({ operation, payload })
				if (operation === "clear-selection") return { ok: true }
				if (operation !== "import-frames") throw new Error(`unexpected Actions operation: ${operation}`)
				if (payload.selectionId === "selection-failure") {
					throw Object.assign(new Error("frame folder is invalid"), { code: "ACTION_FRAMES_MISSING" })
				}
				return { importedAction: { id: payload.actionId, label: payload.label }, animations: { defaultAction: "idle", clickAction: payload.actionId, actions: [{ id: "idle" }, { id: payload.actionId }], triggerRules: [], triggerProposalInbox: [] } }
			},
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "actions.request") void shellHandler.handle(envelope)
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }
		const enqueue = async (selectionId, actionId) => {
			const response = await fetch(`${backend.baseUrl}/actions/frames/import`, {
				method: "POST", headers, body: JSON.stringify({ selectionId, actionId, label: actionId }),
			})
			assert.equal(response.status, 202)
			return (await response.json()).data.jobId
		}
		const waitForJob = async (jobId) => {
			let job = null
			for (let attempt = 0; attempt < 100; attempt += 1) {
				const response = await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })
				job = (await response.json()).data
				if (["succeeded", "failed", "canceled", "interrupted"].includes(job.status)) return job
				await new Promise((resolve) => setTimeout(resolve, 10))
			}
			return job
		}

		const successId = await enqueue("selection-success", "wave")
		const succeeded = await waitForJob(successId)
		assert.equal(succeeded.status, "succeeded")
		assert.equal(succeeded.result.importedAction.id, "wave")
		assert.equal(succeeded.progress.phase, "finalizing")

		const failureId = await enqueue("selection-failure", "invalid")
		const failed = await waitForJob(failureId)
		assert.equal(failed.status, "failed")
		assert.equal(failed.error.code, "ACTION_FRAMES_MISSING")
		assert.equal(failed.error.retryable, false)
		assert.equal(failed.canRetry, false)
		assert.doesNotMatch(JSON.stringify(failed.input), /selection-failure/)
		assert.deepEqual(operations, [
			{ operation: "import-frames", payload: { selectionId: "selection-success", actionId: "wave", label: "wave" } },
			{ operation: "clear-selection", payload: { selectionId: "selection-success" } },
			{ operation: "import-frames", payload: { selectionId: "selection-failure", actionId: "invalid", label: "invalid" } },
			{ operation: "clear-selection", payload: { selectionId: "selection-failure" } },
		])
	} finally {
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

	test("canceling a queued Actions import clears its retained Shell selection without dispatching import", { timeout: 15_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-actions-queued-cancel-"))
	let backend = null
	let releaseImports = () => {}
	const importsReleased = new Promise((resolve) => { releaseImports = resolve })
		let startedCount = 0
		let markStarted = () => {}
		const exportsStarted = new Promise((resolve) => { markStarted = resolve })
		const operations = []
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null, appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" } },
			logger: { info() {}, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onPetPackRequest: async ({ operation, payload }) => {
				assert.equal(operation, "export")
				assert.match(payload.packId, /^queue-blocker-/)
				startedCount += 1
				if (startedCount === 2) markStarted()
				await importsReleased
				return { fileName: `${payload.packId}.openpet-pet.zip` }
			},
			onActionsRequest: async ({ operation, payload }) => {
				operations.push({ operation, payload })
				if (operation === "clear-selection") return { ok: true }
				if (operation !== "import-frames") throw new Error(`unexpected Actions operation: ${operation}`)
				startedCount += 1
				if (startedCount === 2) markStarted()
				await importsReleased
				return { importedAction: { id: payload.actionId }, animations: { defaultAction: "idle", clickAction: payload.actionId, actions: [{ id: "idle" }, { id: payload.actionId }], triggerRules: [], triggerProposalInbox: [] } }
			},
		})
		backend.child.on("message", (envelope) => {
			if (["actions.request", "pet-packs.request"].includes(envelope?.body?.type)) void shellHandler.handle(envelope)
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }
		const enqueueActionImport = async (selectionId, actionId) => {
			const response = await fetch(`${backend.baseUrl}/actions/frames/import`, { method: "POST", headers, body: JSON.stringify({ selectionId, actionId }) })
			assert.equal(response.status, 202)
			return (await response.json()).data.jobId
		}
		const enqueuePackExport = async (packId) => {
			const response = await fetch(`${backend.baseUrl}/pet-packs/${packId}/export`, { method: "POST", headers, body: "{}" })
			assert.equal(response.status, 202)
			return (await response.json()).data.jobId
		}

		const firstId = await enqueuePackExport("queue-blocker-one")
		const secondId = await enqueuePackExport("queue-blocker-two")
		await exportsStarted
		const queuedId = await enqueueActionImport("selection-canceled", "wave-three")
		const queued = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(queuedId)}`, { headers })).json()).data
		assert.equal(queued.status, "queued")
		assert.deepEqual(queued.input, { redacted: true, summary: "Action frame import input withheld" })

		const canceledResponse = await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(queuedId)}/cancel`, { method: "POST", headers, body: "{}" })
		assert.equal(canceledResponse.status, 200)
		assert.equal((await canceledResponse.json()).data.status, "canceled")
		assert.deepEqual(operations.find(({ operation, payload }) => operation === "clear-selection" && payload.selectionId === "selection-canceled"), { operation: "clear-selection", payload: { selectionId: "selection-canceled" } })
		assert.equal(operations.some(({ operation, payload }) => operation === "import-frames" && payload.actionId === "wave-three"), false)

		releaseImports()
		for (const jobId of [firstId, secondId]) {
			for (let attempt = 0; attempt < 100; attempt += 1) {
				const job = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
				if (["succeeded", "failed", "canceled"].includes(job.status)) break
				await new Promise((resolve) => setTimeout(resolve, 10))
			}
		}
	} finally {
		releaseImports()
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("hatch Job failures release the run lock and retry transient Shell failures once", { timeout: 15_000 }, async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-hatch-terminal-matrix-"))
	let backend = null
	let retryAttempts = 0
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null, appInfo: { name: "OpenPet Host", version: "9.8.7", packaged: true, platform: "test-platform", arch: "test-arch" } },
			logger: { info() {}, warn() {}, error() {} },
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onAiTalkRequest: async ({ operation, payload }) => {
				assert.equal(operation, "hatch.start")
				if (payload.runId === "run-invalid-provider") {
					throw Object.assign(new Error("provider rejected the Hatch request"), { code: "VALIDATION_FAILED" })
				}
				if (payload.runId === "run-transient-provider" && retryAttempts++ === 0) {
					throw Object.assign(new Error("provider temporarily unavailable"), { code: "BACKEND_UNAVAILABLE" })
				}
				return { status: "shadow-recorded", code: "shadow_recorded", message: "recorded", decision: null }
			},
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "ai.talk.request") void shellHandler.handle(envelope)
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }
		const waitForJob = async (jobId, expectedStatus) => {
			let job = null
			for (let attempt = 0; attempt < 150; attempt += 1) {
				job = (await (await fetch(`${backend.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { headers })).json()).data
				if (job.status === expectedStatus || (["failed", "canceled", "interrupted"].includes(job.status) && !job.canRetry)) break
				await new Promise((resolve) => setTimeout(resolve, 10))
			}
			assert.equal(job.status, expectedStatus, JSON.stringify(job))
			return job
		}
		const enqueue = async (runId) => {
			const response = await fetch(`${backend.baseUrl}/ai/hatch/start`, { method: "POST", headers, body: JSON.stringify({ runId, mode: "full-pet" }) })
			assert.equal(response.status, 202)
			return (await response.json()).data.jobId
		}

		const failedJobId = await enqueue("run-invalid-provider")
		const failed = await waitForJob(failedJobId, "failed")
		assert.equal(failed.error.code, "VALIDATION_FAILED")
		assert.equal(failed.error.retryable, false)
		// A terminal failure releases the unique active resource lock for this run.
		const failedRunAgain = await enqueue("run-invalid-provider")
		assert.notEqual(failedRunAgain, failedJobId)
		await waitForJob(failedRunAgain, "failed")

		const retryJobId = await enqueue("run-transient-provider")
		const retried = await waitForJob(retryJobId, "succeeded")
		assert.equal(retryAttempts, 2)
		assert.equal(retried.attempt, 2)
		assert.equal(retried.result.status, "shadow-recorded")
	} finally {
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("backend-originated home enable settles after Shell persists its normalized anchor", async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-settings-anchor-"))
	let backend = null
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, providerKeys: {}, legacyToken: null },
			logger: { info() {}, warn() {}, error() {} },
		})

		let currentSettings = { petBehavior: { home: { enabled: false, radius: 120, anchor: null } } }
		const petService = {
			getSettings: () => structuredClone(currentSettings),
			applySettings: (settings) => {
				currentSettings = structuredClone(settings)
				return structuredClone(currentSettings)
			},
		}
		let bridge
		let requestSequence = 0
		const pendingRequests = new Map()
		const persistedRequests = []
		const requestBackend = (body) => new Promise((resolve, reject) => {
			const id = `shell-test-${++requestSequence}`
			persistedRequests.push(body)
			pendingRequests.set(id, { resolve, reject })
			backend.child.send({ v: 1, id, at: Date.now(), body })
		})
		const applyHostSettings = createSettingsHostEffect({
			getPetWindow: () => ({ isDestroyed: () => false, getBounds: () => ({ x: 10, y: 20, width: 80, height: 90 }) }),
			petService,
			petMovementPolicy: { createHomeAnchorFromWindow: () => ({ displayId: "display-1", x: 50, y: 65 }) },
			persistNormalization: (input) => bridge.persistNormalization(input),
		})
		bridge = createSettingsSidecarBridge({
			getBackend: () => backend,
			requestBackend,
			petService,
			applyHostSettings,
		})
		const shellHandler = createMessageHandler({
			send: (envelope) => backend.child.send(envelope),
			onSettingsApplyRequest: (envelope) => bridge.handle(envelope),
		})
		backend.child.on("message", (envelope) => {
			if (pendingRequests.has(envelope?.id)) {
				pendingRequests.get(envelope.id).resolve(envelope)
				pendingRequests.delete(envelope.id)
				return
			}
			if (["settings.apply.request", "settings.persist.result"].includes(envelope?.body?.type)) {
				void shellHandler.handle(envelope)
			}
		})

		const before = await (await fetch(`${backend.baseUrl}/settings`, { headers: { authorization: `Bearer ${backend.sessionToken}` } })).json()
		const patchPromise = fetch(`${backend.baseUrl}/settings`, {
			method: "PATCH",
			headers: { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" },
			body: JSON.stringify({ ifVersion: before.data.version, patch: { "petBehavior.home.enabled": true } }),
		})
		const response = await Promise.race([
			patchPromise,
			new Promise((_, reject) => setTimeout(() => reject(new Error("settings PATCH deadlocked during anchor normalization")), 500)),
		])
		assert.equal(response.status, 200)
		assert.deepEqual(persistedRequests, [{ "type": "settings.persist.request", ifVersion: before.data.version + 1, patch: { "petBehavior.home.anchor": { displayId: "display-1", x: 50, y: 65 } } }])
	} finally {
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})

test("async home anchor normalization failures are observable after host apply settles", async () => {
	let currentSettings = { petBehavior: { home: { enabled: false, radius: 120, anchor: null } } }
	let normalizationError = null
	const applyHostSettings = createSettingsHostEffect({
		getPetWindow: () => ({ isDestroyed: () => false, getBounds: () => ({ x: 10, y: 20, width: 80, height: 90 }) }),
		petService: {
			getSettings: () => structuredClone(currentSettings),
			applySettings: (settings) => {
				currentSettings = structuredClone(settings)
				return structuredClone(currentSettings)
			},
		},
		petMovementPolicy: { createHomeAnchorFromWindow: () => ({ displayId: "display-1", x: 50, y: 65 }) },
		persistNormalization: async () => { throw new Error("backend unavailable") },
		onNormalizationError: (error) => { normalizationError = error },
	})

	const previousSettings = structuredClone(currentSettings)
	const result = await applyHostSettings({
		settings: { petBehavior: { home: { enabled: true, radius: 120, anchor: null } } },
		previousSettings,
		version: 1,
		awaitNormalization: false,
	})
	await new Promise((resolve) => setImmediate(resolve))
	assert.deepEqual(result.petBehavior.home.anchor, { displayId: "display-1", x: 50, y: 65 })
	assert.equal(normalizationError?.message, "backend unavailable")
})
