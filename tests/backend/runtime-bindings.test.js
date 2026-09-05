"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { spawnSidecar, stopSidecar } = require("../../apps/desktop/src/sidecar/spawn.js")
const { createMessageHandler } = require("../../apps/desktop/src/sidecar/message-handler.js")
const { createSettingsSidecarBridge } = require("../../src/main/settings-sidecar-bridge.js")

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
			secretService: {
				setSecret: (entry) => persistedSecrets.push(entry),
				deleteSecret: (id) => persistedSecrets.push({ deleted: id }),
			},
		})
		backend.child.on("message", (envelope) => {
			if (envelope?.body?.type === "settings.apply.request") applyValues = envelope.body.values
			if (["settings.apply.request", "secrets.persist.request"].includes(envelope?.body?.type)) {
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
		const providerWriteResponse = await fetch(`${backend.baseUrl}/ai/providers/openai/key`, {
			method: "PUT",
			headers,
			body: JSON.stringify({ apiKey: plaintext }),
		})
		const providerWriteBody = await providerWriteResponse.json()
		const providerReadResponse = await fetch(`${backend.baseUrl}/ai/providers/openai/key`, { headers })
		const providerDeleteResponse = await fetch(`${backend.baseUrl}/ai/providers/openai/key`, { method: "DELETE", headers })
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
			{ id: "openai", value: plaintext, label: "openai", kind: "provider" },
			{ deleted: "openai" },
		])

		const persistedAfterPatch = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
		assert.equal(persistedAfterPatch.values.scale, 1.1)
		assert.equal(persistedAfterPatch.version, persistedBeforePatch.version + 1)
		assert.deepEqual(applyValues, { scale: 1.1 })
		assert.equal(hostAppliedSettings.scale, 1.1)

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
