"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

describe("T11 event hub", async () => {
	const { createEventHub, MAX_BUFFERED_FRAMES } = await import("../../services/backend/events/hub.js")
 const contracts = await import("@openpet/contracts")

	it("filters topics and always delivers system events", () => {
		const sink = { writes: [], write(value) { this.writes.push(value); return true }, end() {} }
		const hub = createEventHub({ heartbeatMs: 60_000 })
		hub.subscribe({ topics: ["jobs"], sink })
		hub.publish("settings.changed", { paths: ["pet.scale"], version: 1 })
		hub.publish("job.created", { jobId: "j1" })
		hub.publish("backend.degraded", { reason: "test" })
		assert.equal(sink.writes.filter((value) => value.includes("event:")).length, 2)
		assert.match(sink.writes.at(-1), /event: backend\.degraded/)
	})

	it("bounds a paused client and emits dropped notice", () => {
		const sink = { writes: [], write(value) { this.writes.push(value); return false }, once() {}, end() {} }
		const hub = createEventHub({ heartbeatMs: 60_000 })
		hub.subscribe({ topics: ["logs"], sink })
		for (let index = 0; index < MAX_BUFFERED_FRAMES + 5; index += 1) hub.publish("log.appended", { index })
		hub.publish("backend.degraded", { reason: "test" })
		const stats = hub.stats()
		assert.equal(stats.clients, 1)
		assert.ok(sink.writes.length >= 1)
	})

	it("contracts expose the complete event directory", () => {
		assert.equal(contracts.EVENT_NAMES.length, 21)
		assert.equal(new Set(contracts.EVENT_NAMES).size, 21)
		for (const name of contracts.EVENT_NAMES) assert.ok(contracts.SSE_TOPICS.includes(contracts.EVENT_TOPIC[name]))
	})
})
