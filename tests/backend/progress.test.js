"use strict"

const assert = require("node:assert/strict")
const { before, describe, it } = require("node:test")

let progress

before(async () => {
	progress = await import("../../services/backend/jobs/progress.js")
})

function createHarness() {
	let currentTime = 0
	const emitted = []
	const throttle = progress.createProgressThrottle({
		onEmit: (frame) => emitted.push(frame),
		now: () => currentTime,
	})
	return {
		emitted,
		throttle,
		advance(ms) {
			currentTime += ms
		},
	}
}

describe("Job 进度节流 · 常量", () => {
	it("使用卡面冻结的 500 ms、1% 与无进度哨兵", () => {
		assert.equal(progress.THROTTLE_MS, 500)
		assert.equal(progress.MIN_PERCENT_DELTA, 1)
		assert.equal(progress.NO_PROGRESS_PERCENT, -1)
	})
})

describe("Job 进度节流 · report", () => {
	it("窗口内多次 report 只发第一帧,窗口结束时发最新帧", () => {
		const { advance, emitted, throttle } = createHarness()
		const first = { phase: "rendering", percent: 10 }
		const second = { phase: "rendering", percent: 12, message: "第 2 帧" }
		const latest = { phase: "rendering", percent: 14, message: "第 3 帧" }

		throttle.report(first)
		advance(100)
		throttle.report(second)
		advance(399)
		throttle.report(latest)
		assert.deepEqual(emitted, [first])

		advance(1)
		const afterWindow = { phase: "rendering", percent: 16 }
		throttle.report(afterWindow)
		assert.deepEqual(emitted, [first, afterWindow])
	})

	it("phase 变化绕过 500 ms 节流并替换旧待发帧", () => {
		const { advance, emitted, throttle } = createHarness()
		const prompting = { phase: "prompting", percent: 10 }
		const rendering = { phase: "rendering", percent: 12 }

		throttle.report(prompting)
		advance(100)
		throttle.report({ phase: "prompting", percent: 11 })
		advance(100)
		throttle.report(rendering)
		assert.deepEqual(emitted, [prompting, rendering])

		throttle.flush()
		assert.deepEqual(emitted, [prompting, rendering])
	})

	it("回退帧直接丢弃,不会覆盖较新的待发帧", () => {
		const { advance, emitted, throttle } = createHarness()
		const first = { phase: "rendering", percent: 40 }
		const pending = { phase: "rendering", percent: 45 }

		throttle.report(first)
		advance(100)
		throttle.report(pending)
		advance(100)
		throttle.report({ phase: "rendering", percent: 44 })
		throttle.flush()

		assert.deepEqual(emitted, [first, pending])
	})

	it("同 phase 不足 1% 的变化会丢弃,增量从上次已发百分比累计", () => {
		const { advance, emitted, throttle } = createHarness()
		const first = { phase: "rendering", percent: 10 }
		const accumulated = { phase: "rendering", percent: 11 }

		throttle.report(first)
		advance(500)
		throttle.report({ phase: "rendering", percent: 10.4 })
		throttle.report({ phase: "rendering", percent: 10.8 })
		assert.deepEqual(emitted, [first])

		throttle.report(accumulated)
		assert.deepEqual(emitted, [first, accumulated])
	})

	it("percent = -1 保持不确定进度,随后可切换到真实百分比", () => {
		const { advance, emitted, throttle } = createHarness()
		const unknown = { phase: "waiting", percent: progress.NO_PROGRESS_PERCENT }
		const estimated = { phase: "waiting", percent: 0 }

		throttle.report(unknown)
		advance(500)
		throttle.report({ phase: "waiting", percent: progress.NO_PROGRESS_PERCENT })
		throttle.report(estimated)

		assert.deepEqual(emitted, [unknown, estimated])
	})
})

describe("Job 进度节流 · flush 与 reset", () => {
	it("flush 在节流窗口内也会发出最后一帧,且重复调用不重发", () => {
		const { advance, emitted, throttle } = createHarness()
		const first = { phase: "rendering", percent: 96 }
		const final = { phase: "rendering", percent: 100, etaMs: 0 }

		throttle.report(first)
		advance(100)
		throttle.report(final)
		throttle.flush()
		throttle.flush()

		assert.deepEqual(emitted, [first, final])
	})

	it("reset 清空节流和单调性状态,新序列可从低百分比开始", () => {
		const { advance, emitted, throttle } = createHarness()
		const previous = { phase: "rendering", percent: 80 }
		const next = { phase: "prompting", percent: 5 }

		throttle.report(previous)
		advance(100)
		throttle.report({ phase: "rendering", percent: 90 })
		throttle.reset()
		throttle.report(next)
		throttle.flush()

		assert.deepEqual(emitted, [previous, next])
	})
})
