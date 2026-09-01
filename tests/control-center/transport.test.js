"use strict"

const assert = require("node:assert/strict")
const { before, describe, it } = require("node:test")

let transport

before(async () => {
	transport = await import("../../src/control-center/src/api/transport.ts")
})

function createClock() {
	let now = 0
	let nextId = 1
	const timers = new Map()
	return {
		now: () => now,
		setTimeout(callback, delay) {
			const id = nextId++
			timers.set(id, { callback, at: now + delay })
			return id
		},
		clearTimeout(id) {
			timers.delete(id)
		},
		advance(ms) {
			now += ms
			for (const [id, timer] of [...timers]) {
				if (timer.at > now) continue
				timers.delete(id)
				timer.callback()
			}
		},
	}
}

function createShell(initial = null) {
	let backend = initial
	const listeners = []
	return {
		getBackend: () => backend,
		onBackendChanged(listener) {
			listeners.push(listener)
			return () => listeners.splice(listeners.indexOf(listener), 1)
		},
		setBackend(next) {
			backend = next
			for (const listener of listeners.slice()) listener(next)
		},
	}
}

function deferred() {
	let resolve
	let reject
	const promise = new Promise((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

describe("T20 transport constants", () => {
	it("exports the frozen queue limits", () => {
		assert.equal(transport.MAX_QUEUE, 50)
		assert.equal(transport.MAX_WAIT_MS, 10_000)
	})
})

describe("HTTP transport readiness gate", () => {
	it("queues while backend is null and flushes FIFO after ready", async () => {
		const clock = createClock()
		const shell = createShell()
		const started = []
		const pendingResponses = []
		const originalFetch = global.fetch
		global.fetch = (url) => {
			started.push(url)
			const response = deferred()
			pendingResponses.push(response)
			return response.promise
		}
		try {
			const http = transport.createHttpTransport({
				getBackend: shell.getBackend,
				onBackendChanged: shell.onBackendChanged,
				setTimeout: clock.setTimeout,
				clearTimeout: clock.clearTimeout,
			})
			const first = http.request({ path: "/first" })
			const second = http.request({ path: "/second" })
			assert.equal(http.state, "pending")
			assert.deepEqual(started, [])

			shell.setBackend({ baseUrl: "http://backend.test/api/v1", sessionToken: "token" })
			await Promise.resolve()
			assert.deepEqual(started, [
				"http://backend.test/api/v1/first",
				"http://backend.test/api/v1/second",
			])
			assert.equal(http.state, "ready")
			pendingResponses[0].resolve({ first: true })
			pendingResponses[1].resolve({ second: true })
			assert.deepEqual(await Promise.all([first, second]), [{ first: true }, { second: true }])
		} finally {
			global.fetch = originalFetch
		}
	})

	it("rejects every queued promise at MAX_WAIT_MS and enters unavailable state", async () => {
		const clock = createClock()
		const shell = createShell()
		const http = transport.createHttpTransport({
			getBackend: shell.getBackend,
			onBackendChanged: shell.onBackendChanged,
			setTimeout: clock.setTimeout,
			clearTimeout: clock.clearTimeout,
		})
		const requests = [http.request({ path: "/a" }), http.request({ path: "/b" })]
		clock.advance(9_999)
		assert.equal(http.state, "pending")
		clock.advance(1)
		const results = await Promise.allSettled(requests)
		assert.equal(http.state, "unavailable")
		for (const result of results) {
			assert.equal(result.status, "rejected")
			assert.equal(result.reason.code, "BACKEND_UNAVAILABLE")
			assert.equal(result.reason.dispatched, false)
		}
		const afterTimeout = await Promise.allSettled([http.request({ path: "/late" })])
		assert.equal(afterTimeout[0].status, "rejected")
		assert.equal(afterTimeout[0].reason.code, "BACKEND_UNAVAILABLE")
		assert.equal(afterTimeout[0].reason.dispatched, false)

		const originalFetch = global.fetch
		global.fetch = async () => ({ recovered: true })
		try {
			shell.setBackend({ baseUrl: "http://recovered.test", sessionToken: "new-token" })
			assert.equal(http.state, "ready")
			assert.deepEqual(await http.request({ path: "/health" }), { recovered: true })
		} finally {
			global.fetch = originalFetch
		}
	})

	it("marks fetch failures as dispatched", async () => {
		const shell = createShell({
			baseUrl: "http://backend.test/api/v1",
			sessionToken: "token",
		})
		const http = transport.createHttpTransport({
			getBackend: shell.getBackend,
			fetchImpl: async () => { throw new Error("connection lost") },
		})

		await assert.rejects(
			http.request({ path: "/commands/run", method: "POST" }),
			(error) => error.code === "BACKEND_UNAVAILABLE" && error.dispatched === true,
		)
	})

	it("keeps the newest 50 requests and rejects the oldest immediately", async () => {
		const clock = createClock()
		const shell = createShell()
		const originalFetch = global.fetch
		const started = []
		global.fetch = async (url) => {
			started.push(url)
			return url
		}
		const http = transport.createHttpTransport({
			getBackend: shell.getBackend,
			onBackendChanged: shell.onBackendChanged,
			setTimeout: clock.setTimeout,
			clearTimeout: clock.clearTimeout,
		})
		try {
			const requests = Array.from({ length: 51 }, (_, index) => http.request({ path: `/${index}` }))
			const oldest = await Promise.allSettled(requests.slice(0, 1))
			assert.equal(oldest[0].status, "rejected")
			assert.equal(oldest[0].reason.code, "BACKEND_UNAVAILABLE")

			shell.setBackend({ baseUrl: "http://backend.test", sessionToken: "token" })
			const newest = await Promise.all(requests.slice(1))
			assert.equal(newest.length, transport.MAX_QUEUE)
			assert.deepEqual(started, Array.from(
				{ length: transport.MAX_QUEUE },
				(_, index) => `http://backend.test/${index + 1}`,
			))
		} finally {
			global.fetch = originalFetch
		}
	})

	it("joins API paths and replaces caller authorization with the current session token", async () => {
		const shell = createShell({
			baseUrl: "http://backend.test/api/v1///",
			sessionToken: "current-token",
		})
		const originalFetch = global.fetch
		let captured
		global.fetch = async (url, init) => {
			captured = { url, init }
			return { ok: true }
		}
		try {
			const http = transport.createHttpTransport({ getBackend: shell.getBackend })
			await http.request({
				pathname: "///settings?view=all",
				method: "POST",
				headers: {
					authorization: "Bearer stale-token",
					"x-openpet-test": "preserved",
				},
				body: "payload",
			})

			assert.equal(captured.url, "http://backend.test/api/v1/settings?view=all")
			assert.equal(captured.init.method, "POST")
			assert.equal(captured.init.body, "payload")
			assert.equal(captured.init.headers.get("authorization"), "Bearer current-token")
			assert.equal(captured.init.headers.get("x-openpet-test"), "preserved")
		} finally {
			global.fetch = originalFetch
		}
	})
})

describe("mock and IPC transports", () => {
	it("expose the same request/stream/state surface", async () => {
		const calls = []
		const transports = [
			transport.createMockTransport({ handlers: [(input) => {
				calls.push(input)
				return { from: "mock" }
			}] }),
			transport.createIpcTransport({ invoke: async (input) => ({ from: "ipc", input }) }),
		]
		for (const item of transports) {
			assert.equal(item.state, "ready")
			assert.deepEqual(await item.request({ path: "/settings" }),
				item === transports[0] ? { from: "mock" } : { from: "ipc", input: { path: "/settings" } })
			assert.equal(typeof item.stream("settings", () => {}), "function")
		}
		assert.deepEqual(calls, [{ path: "/settings" }])
	})
})
