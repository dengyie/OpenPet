"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const { describe, it } = require("node:test")

const updateResult = {
	status: "ok",
	configured: true,
	currentVersion: "1.0.0",
	latestVersion: "1.1.0",
	updateAvailable: true,
	prerelease: false,
	releaseUrl: "https://github.com/dengyie/OpenPet/releases/tag/v1.1.0",
	assets: [{ name: "OpenPet.dmg", url: "https://example.test/OpenPet.dmg", size: 1024, contentType: "" }],
	checkedAt: "2026-09-05T04:05:06.000Z",
	message: "A newer version is available.",
}

const job = (overrides = {}) => ({
	jobId: "about-check:1",
	kind: "about.check-updates",
	status: "queued",
	progress: null,
	cancelable: true,
	attempt: 1,
	maxAttempts: 2,
	resourceKey: null,
	createdAt: "2026-09-05T04:05:05.000Z",
	startedAt: null,
	finishedAt: null,
	result: null,
	error: null,
	canRetry: false,
	input: { redacted: true, summary: "about.check-updates" },
	...overrides,
})

describe("T42 About HTTP/Job cutover", () => {
	it("uses GET /about and POST /about/check-updates with non-retried Job dispatch", async () => {
		const { createAboutHttpApi } = await import("../../src/control-center/src/features/about/api.ts")
		const calls = []
		const client = {
			request: async (input) => {
				calls.push(input)
				return input.path === "/about"
					? {
						name: "openpet",
						productName: "OpenPet",
						version: "1.0.0",
						packaged: true,
						platform: "darwin",
						arch: "arm64",
						update: { configured: true, provider: "github", owner: "dengyie", repo: "OpenPet", channel: "latest", url: "https://github.com/dengyie/OpenPet/releases" },
					}
					: { jobId: "about-check:1" }
			},
		}
		const api = createAboutHttpApi(client)

		assert.equal((await api.info()).version, "1.0.0")
		assert.deepEqual(await api.checkUpdates(), { jobId: "about-check:1" })
		assert.deepEqual(calls.map(({ method, path }) => ({ method, path })), [
			{ method: "GET", path: "/about" },
			{ method: "POST", path: "/about/check-updates" },
		])
		assert.equal(calls[1].job, true)
		assert.equal(calls[1].retry, false)
		assert.deepEqual(calls[1].body, {})
	})

	it("resolves only a succeeded Job with a valid About result", async () => {
		const { resolveAboutUpdateJob } = await import("../../src/control-center/src/features/about/api.ts")

		assert.deepEqual(resolveAboutUpdateJob(null), { kind: "pending" })
		assert.deepEqual(resolveAboutUpdateJob(job()), { kind: "pending" })
		assert.deepEqual(resolveAboutUpdateJob(job({ status: "running" })), { kind: "pending" })
		assert.deepEqual(resolveAboutUpdateJob(job({
			status: "succeeded",
			result: updateResult,
			finishedAt: "2026-09-05T04:05:06.000Z",
		})), { kind: "succeeded", result: updateResult })
		assert.deepEqual(resolveAboutUpdateJob(job({ status: "succeeded", result: { status: "ok" } })), {
			kind: "failed",
			message: "Update check returned an invalid result.",
		})
	})

	it("maps failed, canceled, and interrupted Jobs without inventing backend error codes", async () => {
		const { resolveAboutUpdateJob } = await import("../../src/control-center/src/features/about/api.ts")

		assert.deepEqual(resolveAboutUpdateJob(job({
			status: "failed",
			error: { code: "INTERNAL", message: "GitHub unavailable", retryable: false },
		})), { kind: "failed", message: "GitHub unavailable" })
		assert.deepEqual(resolveAboutUpdateJob(job({ status: "canceled" })), {
			kind: "failed",
			message: "Update check was canceled.",
		})
		assert.deepEqual(resolveAboutUpdateJob(job({ status: "interrupted" })), {
			kind: "failed",
			message: "Update check was interrupted.",
		})
	})

	it("keeps checking active until useJob returns the matching terminal Job", () => {
		const source = fs.readFileSync("src/control-center/src/hooks/useAboutPane.ts", "utf8")
		assert.match(source, /useJob\(updateJobId\)/)
		assert.match(source, /updateJob\.jobId\s*!==\s*updateJobId/)
		assert.match(source, /resolveAboutUpdateJob\(updateJob\)/)
		assert.doesNotMatch(source, /finally\s*\{\s*setChecking\(false\)/)
	})

	it("uses the deterministic demo adapter only in Vite development without a backend bridge", async () => {
		const { shouldUseAboutDemoApi } = await import("../../src/control-center/src/features/about/api.ts")
		assert.equal(shouldUseAboutDemoApi(true, false), true)
		assert.equal(shouldUseAboutDemoApi(true, true), false)
		assert.equal(shouldUseAboutDemoApi(false, false), false)
		assert.equal(shouldUseAboutDemoApi(false, true), false)
	})

	it("retires both About IPC constants, handlers, preload methods, and legacy renderer calls together", () => {
		for (const file of [
			"src/shared/ipc-channels.ts",
			"src/shared/ipc-channels.js",
			"control-center-preload.js",
			"src/main/ipc.js",
		]) {
			const source = fs.readFileSync(file, "utf8")
			assert.doesNotMatch(source, /ABOUT_GET_INFO|ABOUT_CHECK_UPDATES/, file)
		}
		assert.doesNotMatch(fs.readFileSync("control-center-preload.js", "utf8"), /getAboutInfo|checkForUpdates/)
		assert.doesNotMatch(fs.readFileSync("src/main/ipc.js", "utf8"), /aboutService/)
		assert.doesNotMatch(fs.readFileSync("src/main/bootstrap/create-openpet-runtime.js", "utf8"), /aboutService/)
		assert.doesNotMatch(fs.readFileSync("src/main/bootstrap/create-core-services.js", "utf8"), /createAboutService|aboutService/)
		assert.doesNotMatch(fs.readFileSync("main.js", "utf8"), /createAboutService|services\/about-service/)
		assert.equal(fs.existsSync("src/main/services/about-service.js"), false)
		assert.doesNotMatch(fs.readFileSync("src/shared/openpet-contracts.ts", "utf8"), /getAboutInfo|checkForUpdates/)
		assert.doesNotMatch(fs.readFileSync("src/control-center/src/api/demo-control-center-api.ts", "utf8"), /getAboutInfo|checkForUpdates/)
		assert.doesNotMatch(fs.readFileSync("src/control-center/src/hooks/useAboutPane.ts", "utf8"), /controlCenterAPI|getAboutInfo|checkForUpdates/)
	})
})
