"use strict"

const assert = require("node:assert/strict")
const { before, describe, it } = require("node:test")
const { createServer } = require("node:http")

const { sanitizeLogText } = require("../../apps/desktop/src/services/log-safety.js")

let secretsModule
let routesModule

before(async () => {
	secretsModule = await import("../../services/backend/secrets/provider-keys.js")
	routesModule = await import("../../services/backend/routes/ai.js")
})

function responseContext({ providerId = "ai.default", body = null, query = {} } = {}) {
	const chunks = []
	return {
		ctx: {
			params: { id: providerId },
			query,
			body,
			requestId: "t44-request",
			startedAt: performance.now(),
			res: {
				writableEnded: false,
				writeHead(status, headers) {
					this.status = status
					this.headers = headers
				},
				end(chunk) {
					if (chunk) chunks.push(Buffer.from(chunk))
					this.writableEnded = true
				},
			},
		},
		body: () => JSON.parse(Buffer.concat(chunks).toString("utf8")),
	}
}

describe("T44 provider secrets", () => {
	it("maps Shell persistence failures to retryable HTTP unavailability without changing keys", async () => {
		const { createRouter } = await import("../../services/backend/http/router.js")
		const middleware = await import("../../services/backend/http/middleware.js")
		const router = createRouter({ basePath: "/api/v1" })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.jsonBody())
		const secrets = secretsModule.createProviderKeyStore({
			providerKeys: { "ai.default": "original-provider-secret-4321" },
			persist: async () => { throw new Error("Shell persistence unavailable") },
		})
		routesModule.registerAiSecretRoutes(router, { secrets })
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const base = "http://127.0.0.1:" + server.address().port + "/api/v1/ai/providers/ai.default/key"
			const put = await fetch(base, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ apiKey: "replacement-provider-secret-9876" }),
			})
			assert.equal(put.status, 503)
			const putBody = await put.json()
			assert.equal(putBody.error.code, "BACKEND_UNAVAILABLE")
			assert.equal(putBody.error.retryable, true)
			assert.doesNotMatch(JSON.stringify(putBody), /replacement-provider-secret-9876|Shell persistence unavailable/)
			assert.equal(secrets.get("ai.default"), "original-provider-secret-4321")

			const remove = await fetch(base, { method: "DELETE" })
			assert.equal(remove.status, 503)
			const removeBody = await remove.json()
			assert.equal(removeBody.error.code, "BACKEND_UNAVAILABLE")
			assert.equal(removeBody.error.retryable, true)
			assert.equal(secrets.get("ai.default"), "original-provider-secret-4321")
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
	})

	it("keeps init providerKeys in closure memory and out of JSON.stringify(runtime)", () => {
		const plaintext = "opaque-provider-key-1234567890"
		const input = { openai: plaintext }
		const secrets = secretsModule.createProviderKeyStore({ providerKeys: input })
		const runtime = { startedAt: 1, secrets }

		input.openai = "mutated-after-init"

		assert.equal(secrets.get("openai"), plaintext)
		assert.deepEqual(secrets.status("openai"), { configured: true, maskedTail: "…7890" })
		assert.doesNotMatch(JSON.stringify(runtime), /opaque-provider-key|1234567890/)
		assert.equal(Object.values(runtime).includes(plaintext), false)
	})

	it("returns only configured and maskedTail after a persisted write or clear", async () => {
		const persisted = []
		const secrets = secretsModule.createProviderKeyStore({
			persist: async (change) => persisted.push(change),
		})

		const written = await secrets.set("openai", "provider-write-secret-9876543210")
		assert.deepEqual(written, { configured: true, maskedTail: "…3210" })
		assert.deepEqual(Object.keys(written).sort(), ["configured", "maskedTail"])
		assert.deepEqual(persisted, [{ providerId: "openai", value: "provider-write-secret-9876543210" }])
		assert.doesNotMatch(JSON.stringify(await secrets.set("short", "abc")), /abc/)

		const cleared = await secrets.clear("openai")
		assert.deepEqual(cleared, { configured: false, maskedTail: "" })
		assert.deepEqual(persisted.at(-1), { providerId: "openai", value: null })
	})

	it("does not change the in-memory key when Shell persistence fails", async () => {
		const secrets = secretsModule.createProviderKeyStore({
			providerKeys: { openai: "original-provider-secret" },
			persist: async () => { throw new Error("disk unavailable") },
		})

		await assert.rejects(secrets.set("openai", "replacement-provider-secret"), /disk unavailable/)
		assert.equal(secrets.get("openai"), "original-provider-secret")
		await assert.rejects(secrets.clear("openai"), /disk unavailable/)
		assert.equal(secrets.get("openai"), "original-provider-secret")
	})

	it("redacts provider-key patterns and exact opaque in-memory values from logs", () => {
		const plaintext = "opaque-provider-key-without-known-prefix"
		const secrets = secretsModule.createProviderKeyStore({ providerKeys: { custom: plaintext } })
		const sanitized = secrets.sanitizeLogValue({
			message: `provider failed for ${plaintext}`,
			nested: { apiKey: plaintext },
		})

		assert.doesNotMatch(JSON.stringify(sanitized), /opaque-provider-key-without-known-prefix/)
		assert.doesNotMatch(sanitizeLogText("provider failed: AIzaSyA123456789012345678901234567890"), /AIzaSyA/)
	})

	it("registers only PUT and DELETE provider-key endpoints and never returns plaintext", async () => {
		const registered = []
		const router = {
			put: (path, handler) => registered.push({ method: "PUT", path, handler }),
			delete: (path, handler) => registered.push({ method: "DELETE", path, handler }),
			get: () => { throw new Error("T44 must not register a provider-key GET route") },
		}
		const persisted = []
		const secrets = secretsModule.createProviderKeyStore({ persist: async (change) => persisted.push(change) })
		routesModule.registerAiSecretRoutes(router, { secrets })

		assert.deepEqual(registered.map(({ method, path }) => `${method} ${path}`), [
			"PUT /ai/providers/:id/key",
			"DELETE /ai/providers/:id/key",
		])

		const put = responseContext({ body: { apiKey: "http-provider-secret-abcdef9876" } })
		await registered[0].handler(put.ctx)
		assert.equal(put.ctx.res.status, 200)
		assert.deepEqual(put.body().data, { configured: true, maskedTail: "…9876" })
		assert.doesNotMatch(JSON.stringify(put.body()), /http-provider-secret|abcdef/)
		assert.deepEqual(persisted, [{ providerId: "ai.default", value: "http-provider-secret-abcdef9876" }])

		const invalid = responseContext({ body: { apiKey: "another-secret", unexpected: true } })
		await assert.rejects(
			() => registered[0].handler(invalid.ctx),
			(error) => error.code === "VALIDATION_FAILED",
		)
		const oversized = responseContext({ body: { apiKey: "x".repeat(4097) } })
		await assert.rejects(
			() => registered[0].handler(oversized.ctx),
			(error) => error.code === "VALIDATION_FAILED",
		)

		const unknownProvider = responseContext({ providerId: "custom-provider", body: { apiKey: "must-not-persist" } })
		await assert.rejects(
			() => registered[0].handler(unknownProvider.ctx),
			(error) => error.code === "VALIDATION_FAILED",
		)
		const unknownQuery = responseContext({ query: { debug: "true" }, body: { apiKey: "must-not-persist" } })
		await assert.rejects(
			() => registered[0].handler(unknownQuery.ctx),
			(error) => error.code === "VALIDATION_FAILED",
		)
		assert.equal(persisted.length, 1)

		const remove = responseContext()
		await registered[1].handler(remove.ctx)
		assert.deepEqual(remove.body().data, { configured: false, maskedTail: "" })
		assert.deepEqual(persisted.at(-1), { providerId: "ai.default", value: null })

		const untrustedHandlers = []
		routesModule.registerAiSecretRoutes({
			put: (path, handler) => untrustedHandlers.push({ method: "PUT", path, handler }),
			delete: (path, handler) => untrustedHandlers.push({ method: "DELETE", path, handler }),
		}, {
			secrets: {
				set: async (_providerId, value) => ({ configured: true, maskedTail: `…${value.slice(-4)}`, apiKey: value }),
				clear: async () => ({ configured: false, maskedTail: "", apiKey: "returned-clear-secret" }),
			},
		})
		const untrustedWrite = responseContext({ body: { apiKey: "route-boundary-secret-9876" } })
		await untrustedHandlers[0].handler(untrustedWrite.ctx)
		assert.deepEqual(untrustedWrite.body().data, { configured: true, maskedTail: "…9876" })
		assert.doesNotMatch(JSON.stringify(untrustedWrite.body()), /route-boundary-secret|apiKey/)
		const untrustedClear = responseContext()
		await untrustedHandlers[1].handler(untrustedClear.ctx)
		assert.deepEqual(untrustedClear.body().data, { configured: false, maskedTail: "" })
		assert.doesNotMatch(JSON.stringify(untrustedClear.body()), /returned-clear-secret|apiKey/)
	})
})
