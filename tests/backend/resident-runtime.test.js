const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { spawnSidecar, stopSidecar } = require("../../apps/desktop/src/sidecar/spawn.js")

const repoRoot = path.resolve(__dirname, "../..")

test("resident Backend serves AI context without a desktop Shell and rejects Shell-only AI capabilities", async () => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-resident-runtime-"))
	let backend = null
	try {
		backend = await spawnSidecar({
			entry: path.join(repoRoot, "services/backend/index.js"),
			initBody: {
				userDataDir,
				providerKeys: {},
				legacyToken: null,
				residentBackend: true,
				appInfo: { name: "OpenPet Resident", version: "9.8.7", packaged: true, platform: "test", arch: "test" },
			},
			logger: { info() {}, warn() {}, error() {} },
		})
		const headers = { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" }

		const stateResponse = await fetch(`${backend.baseUrl}/ai/state`, { headers })
		assert.equal(stateResponse.status, 200)
		const state = await stateResponse.json()
		assert.equal(state.data.petPackId, "legacy-cat")

		const dryRunResponse = await fetch(`${backend.baseUrl}/ai/behavior/dry-run`, {
			method: "POST",
			headers,
			body: JSON.stringify({ reply: "hello" }),
		})
		assert.equal(dryRunResponse.status, 200)
		assert.equal((await dryRunResponse.json()).ok, true)

		const creatorStateResponse = await fetch(`${backend.baseUrl}/creator/state`, { headers })
		assert.equal(creatorStateResponse.status, 200)
		assert.equal((await creatorStateResponse.json()).data.backend, true)

		const shellOnlyResponse = await fetch(`${backend.baseUrl}/ai/hatch/agents`, { headers })
		assert.equal(shellOnlyResponse.status, 503)
		assert.equal((await shellOnlyResponse.json()).error.code, "BACKEND_UNAVAILABLE")
	} finally {
		if (backend?.child) await stopSidecar(backend.child, { graceMs: 5_000 })
		fs.rmSync(userDataDir, { recursive: true, force: true })
	}
})
