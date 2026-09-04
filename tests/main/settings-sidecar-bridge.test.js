"use strict"

const { it } = require("node:test")

const { createSettingsSidecarBridge } = require("../../src/main/settings-sidecar-bridge")

it("keeps the Shell canonical path set in lockstep with the contract", async () => {
	const contracts = await import("@openpet/contracts")
	const { CANONICAL_PATHS } = require("../../src/main/settings-sidecar-bridge")
	assert.deepEqual(CANONICAL_PATHS, contracts.SETTINGS_CANONICAL_PATHS)
})
const assert = require("node:assert/strict")
const { createMessageHandler } = require("../../apps/desktop/src/sidecar/message-handler")

it("applies a trusted backend settings snapshot to host effects and pet renderer only", async () => {
	const calls = []
	const bridge = createSettingsSidecarBridge({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4321/api/v1", sessionToken: "token" }),
		fetchImpl: async (url, init) => {
			calls.push([url, init.headers.authorization])
			return new Response(JSON.stringify({ ok: true, data: {
				version: 3,
				values: { scale: 1.2, petBehavior: { grounded: true, home: { enabled: true, radius: "small", anchor: null } } },
			}, meta: { requestId: "r" } }))
		},
		petService: { getSettings: () => ({ scale: 1 }), saveSettings: (settings) => { calls.push(["save", settings]); return settings } },
		applyHostSettings: (snapshot) => calls.push(["effects", snapshot]),
		sendToPetRenderer: (settings) => calls.push(["renderer", settings]),
	})
	await bridge.handle({ v: 1, id: "b1", at: Date.now(), body: { type: "settings.changed", paths: ["scale"], version: 3 } })
	assert.equal(calls[0][0], "http://127.0.0.1:4321/api/v1/settings")
	assert.equal(calls.some(([kind]) => kind === "renderer"), true)
	assert.equal(calls.some(([kind]) => kind === "effects"), true)
})

it("applies settings.apply.request through the same host-effect path as a change notification", async () => {
	let applied = null
	let fetches = 0
	const bridge = createSettingsSidecarBridge({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4321", sessionToken: "token" }),
		fetchImpl: async () => { fetches += 1; return new Response(JSON.stringify({ ok: true, data: { version: 3, values: { scale: 9 } } })) },
		petService: { getSettings: () => ({ scale: 1 }) },
		applyHostSettings: ({ settings }) => { applied = settings },
	})
	await bridge.handle({ v: 1, id: "b-apply", at: Date.now(), body: { type: "settings.apply.request", paths: ["scale"], version: 3, values: { scale: 1.2 } } })
	assert.equal(applied.scale, 1.2)
	assert.equal(fetches, 0)
})

it("routes a real Shell apply envelope into the bridge without a GET", async () => {
	let applied = null
	const bridge = createSettingsSidecarBridge({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4321", sessionToken: "token" }),
		fetchImpl: async () => { throw new Error("unexpected GET") },
		petService: { getSettings: () => ({ scale: 1 }) },
		applyHostSettings: ({ settings }) => { applied = settings },
	})
	const replies = []
	const handler = createMessageHandler({
		send: (reply) => replies.push(reply),
		onSettingsApplyRequest: (request) => bridge.handle(request),
	})
	await handler.handle({ v: 1, id: "shell-apply", at: Date.now(), body: {
		type: "settings.apply.request", paths: ["scale"], version: 3, values: { scale: 1.2 },
	} })
	assert.equal(applied.scale, 1.2)
	assert.equal(replies[0].body.ok, true)
})

it("broadcasts the host effect's applied snapshot, including normalized values", async () => {
	let rendererSettings = null
	const bridge = createSettingsSidecarBridge({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4321", sessionToken: "token" }),
		fetchImpl: async () => new Response(JSON.stringify({ ok: true, data: { version: 3, values: { scale: 1.2 } } })),
		petService: { getSettings: () => ({ scale: 1 }) },
		applyHostSettings: ({ settings }) => ({ ...settings, petBehavior: { home: { anchor: { x: 2, y: 3 } } } }),
		sendToPetRenderer: (settings) => { rendererSettings = settings }
	})
	await bridge.handle({ type: "settings.changed", paths: ["scale"], version: 3 })
	assert.deepEqual(rendererSettings.petBehavior.home.anchor, { x: 2, y: 3 })
})

it("compensates the backend when a host side effect rejects", async () => {
	const requests = []
	const bridge = createSettingsSidecarBridge({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4321/api/v1", sessionToken: "token" }),
		fetchImpl: async (url, init = {}) => {
			requests.push({ url, init })
			if (init.method === "PATCH") return new Response(JSON.stringify({ ok: true, data: { version: 4, changedPaths: ["scale"] } }))
			return new Response(JSON.stringify({ ok: true, data: { version: 3, values: { scale: 2 } } }))
		},
		petService: { getSettings: () => ({ scale: 1 }) },
		applyHostSettings: async () => { throw new Error("cursor sync failed") },
	})
	await assert.rejects(bridge.handle({ type: "settings.changed", paths: ["scale"], version: 3 }), /cursor sync failed/)
	assert.equal(requests.some(({ init }) => init.method === "PATCH" && JSON.parse(init.body).patch.scale === 1), true)
})

it("does not issue an HTTP rollback for a backend-originated apply failure", async () => {
	const requests = []
	const bridge = createSettingsSidecarBridge({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4321/api/v1", sessionToken: "token" }),
		fetchImpl: async (url, init = {}) => {
			requests.push({ url, init })
			throw new Error("unexpected HTTP request")
		},
		petService: { getSettings: () => ({ scale: 1 }) },
		applyHostSettings: async () => { throw new Error("cursor sync failed") },
	})
	await assert.rejects(bridge.handle({ type: "settings.apply.request", paths: ["scale"], version: 3, values: { scale: 2 } }), /cursor sync failed/)
	assert.equal(requests.length, 0)
})

it("makes a host-effect failure observable to the caller", async () => {
	const bridge = createSettingsSidecarBridge({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4321/api/v1", sessionToken: "token" }),
		fetchImpl: async () => new Response(JSON.stringify({ ok: true, data: { version: 3, values: { scale: 2 } } })),
		petService: { getSettings: () => ({ scale: 1 }) },
		applyHostSettings: async () => { throw new Error("cursor sync failed") }
	})
	await assert.rejects(bridge.handle({ type: "settings.changed", paths: ["scale"], version: 3 }), /cursor sync failed/)
})

	it("does not overwrite a newer backend value while compensating a failed host effect", async () => {
	const requests = []
	let reads = 0
	const bridge = createSettingsSidecarBridge({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4321", sessionToken: "token" }),
		fetchImpl: async (_url, init = {}) => {
			requests.push(init)
			if (init.method === "PATCH") return new Response(JSON.stringify({ ok: false }), { status: 409 })
			reads += 1
			return new Response(JSON.stringify({ ok: true, data: reads === 1
				? { version: 3, values: { scale: 2 } }
				: { version: 4, values: { scale: 3 } } }))
		},
		petService: { getSettings: () => ({ scale: 1 }) },
		applyHostSettings: async () => { throw new Error("cursor sync failed") }
	})
	await assert.rejects(bridge.handle({ type: "settings.changed", paths: ["scale"], version: 3 }), /cursor sync failed/)
	assert.equal(requests.filter((request) => request.method === "PATCH").length, 1)
})

it("persists Shell-normalized home anchors through the trusted backend patch", async () => {
	const requests = []
	const bridge = createSettingsSidecarBridge({
		getBackend: () => ({ baseUrl: "http://127.0.0.1:4321/api/v1", sessionToken: "token" }),
		requestBackend: async (body) => {
			requests.push({ body })
			return { body: { type: "settings.persist.result", version: 4, ok: true, changedPaths: ["petBehavior.home.anchor"] } }
		},
		fetchImpl: async (url, init = {}) => {
			requests.push({ url, init })
			return new Response(JSON.stringify({ ok: true, data: { version: 4, changedPaths: ["petBehavior.home.anchor"] } }))
		},
		petService: { getSettings: () => ({}) },
	})
	await bridge.persistNormalization({ settings: { petBehavior: { home: { anchor: { x: 2, y: 3 } } } }, paths: ["petBehavior.home.anchor"], ifVersion: 3 })
	assert.equal(requests.length, 1)
	assert.deepEqual(requests[0].body, { type: "settings.persist.request", ifVersion: 3, patch: { "petBehavior.home.anchor": { x: 2, y: 3 } } })
})
