"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { spawnSidecar, stopSidecar } = require("../../apps/desktop/src/sidecar/spawn.js")

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
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: { userDataDir, secrets: {}, legacyToken: null },
			logger: { info() {}, warn() {}, error() {} },
		})

		const headers = {
			authorization: `Bearer ${backend.sessionToken}`,
			"content-type": "application/json",
		}
		const persistedBeforePatch = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
		const settingsResponse = await fetch(`${backend.baseUrl}/settings`, { headers })
		const settingsBody = await settingsResponse.json()
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

		assert.deepEqual({
			get: { status: settingsResponse.status, data: settingsBody.data },
			patch: { status: patchResponse.status, ok: patchBody.ok },
			domainStatuses,
		}, {
			get: { status: 200, data: persistedBeforePatch },
			patch: { status: 200, ok: true },
			domainStatuses: { "/catalog": 200, "/pet-packs": 200, "/actions": 200 },
		})

		const persistedAfterPatch = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
		assert.equal(persistedAfterPatch.values.scale, 1.1)
		assert.equal(persistedAfterPatch.version, persistedBeforePatch.version + 1)
	} finally {
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})
