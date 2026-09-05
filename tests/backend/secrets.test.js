"use strict"

const assert = require("node:assert/strict")
const { before, describe, it } = require("node:test")

const { sanitizeLogText } = require("../../src/main/services/log-safety.js")

let secretsModule
let routesModule

before(async () => {
	secretsModule = await import("../../services/backend/secrets/provider-keys.js")
	routesModule = await import("../../services/backend/routes/ai.js")
})

function responseContext({ providerId = "openai", body = null } = {}) {
	const chunks = []
	return {
		ctx: {
			params: { id: providerId },
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
		const secrets = secretsModule.createProviderKeyStore({ persist: async () => {} })
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

		const remove = responseContext()
		await registered[1].handler(remove.ctx)
		assert.deepEqual(remove.body().data, { configured: false, maskedTail: "" })
	})
})
