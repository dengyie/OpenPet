"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

const packageWithGithubRelease = {
	name: "openpet",
	version: "1.0.0",
	build: {
		productName: "OpenPet",
		publish: [{ provider: "github", owner: "dengyie", repo: "OpenPet", channel: "latest" }],
	},
}

describe("Backend About domain", () => {
	it("returns the host runtime identity and configured update source", async () => {
		const { createAboutService } = await import("../../services/backend/domains/about.js")
		const service = createAboutService({
			pkg: packageWithGithubRelease,
			runtime: {
				name: "OpenPet Host",
				version: "1.2.3",
				packaged: true,
				platform: "darwin",
				arch: "arm64",
			},
		})

		assert.deepEqual(service.info(), {
			name: "openpet",
			productName: "OpenPet",
			version: "1.2.3",
			packaged: true,
			platform: "darwin",
			arch: "arm64",
			update: {
				configured: true,
				provider: "github",
				owner: "dengyie",
				repo: "OpenPet",
				channel: "latest",
				url: "https://github.com/dengyie/OpenPet/releases",
			},
		})
	})

	it("checks GitHub releases and filters installer assets for the host platform", async () => {
		const { createAboutService } = await import("../../services/backend/domains/about.js")
		const requests = []
		const service = createAboutService({
			pkg: packageWithGithubRelease,
			runtime: { version: "1.9.9", platform: "darwin", arch: "arm64" },
			now: () => Date.parse("2026-09-05T01:02:03.000Z"),
			fetchImpl: async (url, options) => {
				requests.push({ url, options })
				return {
					ok: true,
					json: async () => ({
						tag_name: "v1.10.0",
						html_url: "https://github.com/dengyie/OpenPet/releases/tag/v1.10.0",
						prerelease: false,
						assets: [
							{ name: "OpenPet-1.10.0-darwin-arm64.dmg", browser_download_url: "https://example.test/OpenPet.dmg", size: 1024 },
							{ name: "OpenPet-1.10.0-darwin-arm64.zip", browser_download_url: "https://example.test/OpenPet-mac.zip", size: 2048 },
							{ name: "OpenPet-1.10.0-win32-x64.exe", browser_download_url: "https://example.test/OpenPet.exe", size: 4096 },
							{ name: "OpenPet-1.10.0-darwin-arm64.dmg.blockmap", browser_download_url: "https://example.test/OpenPet.blockmap", size: 12 },
							{ name: "latest-mac.yml", browser_download_url: "https://example.test/latest-mac.yml", size: 42 },
						],
					}),
				}
			},
		})

		const result = await service.checkUpdates()

		assert.equal(requests.length, 1)
		assert.equal(requests[0].url, "https://api.github.com/repos/dengyie/OpenPet/releases/latest")
		assert.equal(requests[0].options.method, "GET")
		assert.equal(requests[0].options.headers.Accept, "application/vnd.github+json")
		assert.equal(requests[0].options.headers["User-Agent"], "openpet-update-check")
		assert.equal(requests[0].options.headers.Authorization, undefined)
		assert.equal(requests[0].options.signal instanceof AbortSignal, true)
		assert.deepEqual(result, {
			status: "ok",
			configured: true,
			currentVersion: "1.9.9",
			latestVersion: "1.10.0",
			updateAvailable: true,
			prerelease: false,
			releaseUrl: "https://github.com/dengyie/OpenPet/releases/tag/v1.10.0",
			assets: [
				{ name: "OpenPet-1.10.0-darwin-arm64.dmg", url: "https://example.test/OpenPet.dmg", size: 1024, contentType: "" },
				{ name: "OpenPet-1.10.0-darwin-arm64.zip", url: "https://example.test/OpenPet-mac.zip", size: 2048, contentType: "" },
			],
			checkedAt: "2026-09-05T01:02:03.000Z",
			message: "A newer version is available.",
		})
	})

	it("keeps Windows assets separate from macOS artifacts", async () => {
		const { createAboutService } = await import("../../services/backend/domains/about.js")
		const service = createAboutService({
			pkg: packageWithGithubRelease,
			runtime: { version: "1.0.0", platform: "win32", arch: "x64" },
			fetchImpl: async () => ({
				ok: true,
				json: async () => ({
					tag_name: "v1.1.0",
					assets: [
						{ name: "OpenPet-1.1.0-darwin-arm64.dmg", browser_download_url: "https://example.test/OpenPet.dmg", size: 1 },
						{ name: "OpenPet-1.1.0-win32-x64.exe", browser_download_url: "https://example.test/OpenPet.exe", size: 2 },
						{ name: "OpenPet-1.1.0-win32-x64.zip", browser_download_url: "https://example.test/OpenPet-win.zip", size: 3 },
						{ name: "latest.yml", browser_download_url: "https://example.test/latest.yml", size: 4 },
					],
				}),
			}),
		})

		assert.deepEqual((await service.checkUpdates()).assets, [
			{ name: "OpenPet-1.1.0-win32-x64.exe", url: "https://example.test/OpenPet.exe", size: 2, contentType: "" },
			{ name: "OpenPet-1.1.0-win32-x64.zip", url: "https://example.test/OpenPet-win.zip", size: 3, contentType: "" },
		])
	})

	it("preserves not-configured, unavailable, HTTP error, and timeout results", async () => {
		const { createAboutService } = await import("../../services/backend/domains/about.js")
		const fixedNow = () => Date.parse("2026-09-05T02:03:04.000Z")
		const notConfigured = await createAboutService({
			pkg: { name: "openpet", version: "1.0.0" },
			runtime: { version: "1.0.0" },
			now: fixedNow,
		}).checkUpdates()
		assert.deepEqual(notConfigured, {
			status: "not-configured",
			configured: false,
			currentVersion: "1.0.0",
			latestVersion: "",
			updateAvailable: false,
			prerelease: false,
			releaseUrl: "",
			assets: [],
			checkedAt: "2026-09-05T02:03:04.000Z",
			message: "Update feed is not configured.",
		})

		const unavailable = await createAboutService({
			pkg: packageWithGithubRelease,
			runtime: { version: "1.0.0" },
			now: fixedNow,
			fetchImpl: null,
		}).checkUpdates()
		assert.equal(unavailable.status, "unavailable")
		assert.equal(unavailable.message, "Network fetch is not available in this runtime.")

		const httpError = await createAboutService({
			pkg: packageWithGithubRelease,
			runtime: { version: "1.0.0" },
			now: fixedNow,
			fetchImpl: async () => ({ ok: false, status: 503 }),
		}).checkUpdates()
		assert.equal(httpError.status, "error")
		assert.equal(httpError.message, "Update check failed with HTTP 503.")

		const timeout = await createAboutService({
			pkg: packageWithGithubRelease,
			runtime: { version: "1.0.0" },
			now: fixedNow,
			fetchImpl: async () => new Promise(() => {}),
			timeoutMs: 5,
		}).checkUpdates()
		assert.equal(timeout.status, "timeout")
		assert.equal(timeout.message, "Update check timed out.")
	})

	it("declares appInfo on the existing init bridge contract", async () => {
		const { shellToBackendSchema } = await import("@openpet/contracts")
		const parsed = shellToBackendSchema.parse({
			type: "init",
			userDataPath: "/tmp/openpet",
			sessionToken: "x".repeat(32),
			logLevel: "info",
			appInfo: {
				name: "OpenPet",
				version: "1.2.3",
				packaged: true,
				platform: "darwin",
				arch: "arm64",
			},
		})
		assert.deepEqual(parsed.appInfo, {
			name: "OpenPet",
			version: "1.2.3",
			packaged: true,
			platform: "darwin",
			arch: "arm64",
		})
	})
})
