"use strict"

const assert = require("node:assert/strict")
const { describe, it } = require("node:test")

describe("T22 SSE hook seams", () => {
	it("exports hooks and uses the contract reconnect constants", async () => {
		const source = require("node:fs").readFileSync("src/control-center/src/hooks/useSse.ts", "utf8")
		assert.match(source, /SSE_RECONNECT_BACKOFF_MS/)
		assert.match(source, /SSE_RECONNECT_AFTER_SILENCE_MS/)
		assert.match(source, /invalidateQueries\(\{ queryKey: \[event\.topic\] \}\)/)
		assert.match(source, /system\.events-dropped/)
		const hooks = await import("../../src/control-center/src/hooks/useSse.ts")
		assert.equal(typeof hooks.useSse, "function")
		assert.equal(typeof hooks.configureSse, "function")
		const job = await import("../../src/control-center/src/hooks/useJob.ts")
		assert.equal(typeof job.useJob, "function")
	})
})
