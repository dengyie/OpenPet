"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

describe("T18 pet packs", () => {
	it("uses the Shell PetPackService snapshot as the HTTP source of truth", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const expected = {
			activePackId: "shell-cat",
			packs: [{
				id: "shell-cat",
				displayName: "Shell Cat",
				version: "2.0.0",
				source: "user-installed",
				rootPath: "/shell-owned/pet-packs/shell-cat",
				active: true,
				actionCount: 3,
				valid: true,
				blockStatus: { blocked: false, reasons: [] },
			}],
		}
		const requests = []
		const shell = {
			request: async (body) => {
				requests.push(body)
				return { body: { type: "pet-packs.result", operation: body.operation, ok: true, result: expected } }
			},
		}
		const packs = createPetPackService({ shell })

		assert.deepEqual(await packs.list(), expected)
		assert.deepEqual(requests, [{ type: "pet-packs.request", operation: "list", payload: {} }])
	})

	it("registers seven routes and forwards activation to the Shell authority", async () => {
		const [{ createRouter }, routes, { createPetPackService }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/routes/pet-packs.js"),
			import("../../services/backend/domains/pet-packs.js"),
		])
		const requests = []
		const shell = { request: async (body) => {
			requests.push(body)
			return { body: {
				type: "pet-packs.result", operation: body.operation, ok: true,
				result: { activePackId: "demo", petPacks: { activePackId: "demo", packs: [{ id: "demo", displayName: "Demo", active: true }] } },
			} }
		} }
		const packs = createPetPackService({ shell })
		const router = createRouter({ basePath: "/api/v1" })
		routes.registerPetPackRoutes(router, { packs })
		assert.deepEqual(router.routes(), routes.PET_PACK_ROUTES.map((entry) => {
			const [method, route] = entry.split(" ")
			return `${method} /api/v1${route}`
		}))
		await packs.activate("demo")
		assert.deepEqual(requests, [{ type: "pet-packs.request", operation: "activate", payload: { packId: "demo" } }])
	})

	it("forwards validation to Shell and maps structured authority failures", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const requests = []
		const packs = createPetPackService({ shell: { request: async (body) => {
			requests.push(body)
			return { body: { type: "pet-packs.result", operation: body.operation, ok: false, error: { code: "PET_PACK_INCOMPATIBLE", message: "blocked by Shell policy" } } }
		} } })
		await assert.rejects(() => packs.inspect("/tmp/pack.zip"), (error) => {
			assert.equal(error.code, "PET_PACK_INCOMPATIBLE")
			assert.equal(error.status, 400)
			return true
		})
		assert.deepEqual(requests, [{ type: "pet-packs.request", operation: "validate", payload: { sourcePath: "/tmp/pack.zip" } }])
	})

	it("routes Pet Pack picking through the Shell authority with a bounded native-dialog timeout", async () => {
		const [{ createRouter }, middleware, routes, { createPetPackService }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/http/middleware.js"),
			import("../../services/backend/routes/pet-packs.js"),
			import("../../services/backend/domains/pet-packs.js"),
		])
		const calls = []
		const selection = {
			canceled: false,
			selectionId: "selection-1",
			folderName: "demo-pack",
			valid: true,
			pack: { id: "demo-pack", displayName: "Demo" },
		}
		const packs = createPetPackService({ shell: { request: async (body, options) => {
			calls.push({ body, options })
			return { body: { type: "pet-packs.result", operation: body.operation, ok: true, result: selection } }
		} } })
		const router = createRouter({ basePath: "/api/v1" })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.jsonBody())
		routes.registerPetPackRoutes(router, { packs })
		const { createServer } = await import("node:http")
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/pet-packs/validate`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ operation: "pick" }),
			})
			assert.equal(response.status, 200)
			assert.deepEqual((await response.json()).data, selection)
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
		assert.deepEqual(calls, [{
			body: { type: "pet-packs.request", operation: "pick", payload: {} },
			options: { expectedType: "pet-packs.result", expectedOperation: "pick", timeoutMs: 180_000 },
		}])
		assert.equal(JSON.stringify(calls).includes("/Users/private"), false)
	})

	it("preserves the reverse-channel timeout code and HTTP status", async () => {
		const [{ createPetPackService }, { ApiError }] = await Promise.all([
			import("../../services/backend/domains/pet-packs.js"),
			import("../../services/backend/http/middleware.js"),
		])
		const packs = createPetPackService({
			shell: {
				request: async () => {
					throw new ApiError("PROVIDER_TIMEOUT", "Shell did not answer Pet Pack request")
				},
			},
		})

		await assert.rejects(() => packs.list(), (error) => {
			assert.equal(error.code, "PROVIDER_TIMEOUT")
			assert.equal(error.status, 504)
			return true
		})
	})

	it("rejects a successful reverse response without a result", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const packs = createPetPackService({
			shell: {
				request: async () => ({
					body: { type: "pet-packs.result", operation: "list", ok: true },
				}),
			},
		})

		await assert.rejects(
			packs.list(),
			(error) => error?.code === "INTERNAL" && error?.status === 500,
		)
	})

	it("rejects malformed structured errors from the Shell authority", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const packs = createPetPackService({
			shell: {
				request: async () => ({
					body: {
						type: "pet-packs.result",
						operation: "list",
						ok: false,
						error: { code: "NOT_FOUND", message: "missing", debugPath: "/private/path" },
					},
				}),
			},
		})

		await assert.rejects(
			packs.list(),
			(error) => error?.code === "INTERNAL" && error?.status === 500,
		)
	})

	it("rejects unknown validation operations before reaching the Shell", async () => {
		const [{ createRouter }, middleware, { registerPetPackRoutes }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/http/middleware.js"),
			import("../../services/backend/routes/pet-packs.js"),
		])
		const calls = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.jsonBody())
		registerPetPackRoutes(router, {
			packs: {
				inspect: async (sourcePath) => { calls.push(["inspect", sourcePath]); return { valid: true } },
				pick: async () => { calls.push(["pick"]); return { canceled: true } },
				clearSelection: async (selectionId) => { calls.push(["clear", selectionId]); return { ok: true } },
			},
		})
		const { createServer } = await import("node:http")
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const url = "http://127.0.0.1:" + server.address().port + "/api/v1/pet-packs/validate"
			for (const body of [
				{ operation: "execute-path", path: "/tmp/owned" },
				{ operation: "pick", path: "/tmp/owned" },
				{ operation: "validate", sourcePath: "/tmp/owned" },
				{ operation: "clear-selection", selectionId: "selection-1", path: "/tmp/owned" },
			]) {
				const response = await fetch(url, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				})
				assert.equal(response.status, 400)
				assert.equal((await response.json()).error.code, "VALIDATION_FAILED")
			}
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
		assert.deepEqual(calls, [])
	})

	it("rejects mixed Pet Pack import handles before Job enqueue", async () => {
		const [{ createRouter }, middleware, { registerPetPackRoutes }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/http/middleware.js"),
			import("../../services/backend/routes/pet-packs.js"),
		])
		const jobs = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.jsonBody())
		registerPetPackRoutes(router, {
			packs: {
				import: (input) => {
					const job = { id: "pet-pack-import:test", kind: "pet-pack.import", input }
					jobs.push(job)
					return { jobId: job.id }
				},
			},
		})
		const { createServer } = await import("node:http")
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/pet-packs/import`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ selectionId: "selection-1", sourcePath: "/tmp/other-pack" }),
			})
			assert.equal(response.status, 400)
			assert.equal((await response.json()).error.code, "VALIDATION_FAILED")
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
		assert.deepEqual(jobs, [])
	})

	it("accepts exactly one Pet Pack import selection handle or path", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const jobs = []
		const requests = []
		const packs = createPetPackService({
			shell: { request: async (body) => {
				requests.push(body)
				return { body: { type: "pet-packs.result", operation: body.operation, ok: true, result: { imported: true } } }
			} },
			jobs: { insert: (job) => { jobs.push(job); return { id: job.id } } },
		})
		assert.throws(() => packs.import({}), (error) => error.code === "VALIDATION_FAILED")
		assert.throws(() => packs.import({ selectionId: "selection-1", sourcePath: "/tmp/owned" }), (error) => error.code === "VALIDATION_FAILED")
		assert.throws(() => packs.import({ selectionId: "selection-1", extra: true }), (error) => error.code === "VALIDATION_FAILED")
		assert.throws(() => packs.import({ path: "/tmp/one", sourcePath: "/tmp/two" }), (error) => error.code === "VALIDATION_FAILED")
		await assert.rejects(() => packs.runImport({ selectionId: "selection-1", sourcePath: "/tmp/owned" }), (error) => error.code === "VALIDATION_FAILED")
		assert.deepEqual(jobs, [])
		assert.deepEqual(requests, [])

		const accepted = packs.import({ selectionId: "selection-1" })
		assert.equal(accepted.jobId, jobs[0].id)
		assert.deepEqual(jobs[0].input, { selectionId: "selection-1" })

		packs.import({ path: "/tmp/owned" })
		assert.deepEqual(jobs[1].input, { sourcePath: "/tmp/owned" })
		await packs.runImport({ sourcePath: "/tmp/owned", finalize: (operation) => operation() })
		assert.deepEqual(requests[0], { type: "pet-packs.request", operation: "import", payload: { sourcePath: "/tmp/owned" } })
	})

	it("clears selection handles after import failure and pre-finalizing cancellation", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const requests = []
		const packs = createPetPackService({
			shell: { request: async (body) => {
				requests.push(body)
				if (body.operation === "import") return { body: {
					type: "pet-packs.result", operation: body.operation, ok: false,
					error: { code: "PET_PACK_INCOMPATIBLE", message: "invalid pet pack" },
				} }
				return { body: { type: "pet-packs.result", operation: body.operation, ok: true, result: { ok: true } } }
			} },
		})
		await assert.rejects(
			() => packs.runImport({ selectionId: "selection-failed", finalize: (operation) => operation() }),
			(error) => error.code === "PET_PACK_INCOMPATIBLE",
		)
		assert.deepEqual(requests.map(({ operation, payload }) => ({ operation, payload })), [
			{ operation: "import", payload: { selectionId: "selection-failed" } },
			{ operation: "clear-selection", payload: { selectionId: "selection-failed" } },
		])

		requests.length = 0
		const controller = new AbortController()
		controller.abort(new Error("cancel before finalizing"))
		await assert.rejects(
			() => packs.runImport({ selectionId: "selection-canceled", signal: controller.signal }),
			/cancel before finalizing/,
		)
		assert.deepEqual(requests, [{ type: "pet-packs.request", operation: "clear-selection", payload: { selectionId: "selection-canceled" } }])
	})

	it("keeps the import outcome when selection cleanup fails", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const warnings = []
		const packs = createPetPackService({
			shell: { request: async (body) => {
				if (body.operation === "clear-selection") throw Object.assign(new Error("transport detail with secret data"), { code: "BACKEND_UNAVAILABLE" })
				return { body: { type: "pet-packs.result", operation: body.operation, ok: true, result: { imported: true } } }
			} },
			logger: { warn: (...entry) => warnings.push(entry) },
		})
		assert.deepEqual(await packs.runImport({ selectionId: "selection-imported", finalize: (operation) => operation() }), { imported: true })
		assert.deepEqual(warnings, [["Pet Pack selection cleanup failed", { operation: "import", selectionId: "selection-imported", errorCode: "BACKEND_UNAVAILABLE" }]])
		assert.equal(JSON.stringify(warnings).includes("secret data"), false)
	})

	it("preserves the import failure when selection cleanup also fails", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const packs = createPetPackService({ shell: { request: async (body) => {
			if (body.operation === "import") return { body: {
				type: "pet-packs.result", operation: body.operation, ok: false,
				error: { code: "PET_PACK_INCOMPATIBLE", message: "blocked pet pack" },
			} }
			throw Object.assign(new Error("selection cleanup unavailable"), { code: "BACKEND_UNAVAILABLE" })
		} } })
		await assert.rejects(
			() => packs.runImport({ selectionId: "selection-double-failure", finalize: (operation) => operation() }),
			(error) => error.code === "PET_PACK_INCOMPATIBLE" && error.cleanupError?.code === "BACKEND_UNAVAILABLE",
		)
	})

	it("rejects invalid export targets before HTTP Job enqueue", async () => {
		const [{ createRouter }, middleware, { registerPetPackRoutes }] = await Promise.all([
			import("../../services/backend/http/router.js"),
			import("../../services/backend/http/middleware.js"),
			import("../../services/backend/routes/pet-packs.js"),
		])
		const jobs = []
		const router = createRouter({ basePath: "/api/v1" })
		router.use(middleware.requestId())
		router.use(middleware.errorBoundary())
		router.use(middleware.jsonBody())
		registerPetPackRoutes(router, { packs: {
			export: (...args) => { jobs.push(args); return { jobId: "export:1" } },
		} })
		const { createServer } = await import("node:http")
		const server = createServer((req, res) => void router.handle(req, res))
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			for (const body of [{ target: "/tmp/" + "x".repeat(4097) }, { target: "/tmp/export", extra: true }]) {
				const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/pet-packs/demo/export`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				})
				assert.equal(response.status, 400)
				assert.equal((await response.json()).error.code, "VALIDATION_FAILED")
			}
		} finally {
			await new Promise((resolve) => server.close(resolve))
		}
		assert.deepEqual(jobs, [])
	})

	it("rejects unbounded Pet Pack export targets at the domain Job boundary", async () => {
		const { createPetPackService } = await import("../../services/backend/domains/pet-packs.js")
		const jobs = []
		const packs = createPetPackService({ shell: { request: async () => { throw new Error("must not dispatch") } }, jobs: {
			insert: (job) => { jobs.push(job); return { id: job.id } },
		} })
		assert.throws(() => packs.export("demo", "/tmp/" + "x".repeat(4097)), (error) => error.code === "VALIDATION_FAILED")
		assert.deepEqual(jobs, [])
		await assert.rejects(
			packs.runExport({ packId: "demo", target: "/tmp/" + "x".repeat(4097) }),
			(error) => error.code === "VALIDATION_FAILED",
		)
		assert.deepEqual(jobs, [])
	})
})
