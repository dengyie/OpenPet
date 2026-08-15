"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { afterEach, before, describe, it } = require("node:test")

let createSettingsStore
const temporaryDirectories = []

before(async () => {
	({ createSettingsStore } = await import("../../services/backend/domains/settings.js"))
})

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function createStore() {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-settings-"))
	temporaryDirectories.push(directory)
	return createSettingsStore({ file: path.join(directory, "backend", "settings.json") })
}

describe("设置域 · 乐观锁", () => {
	it("缺少文件时从版本 0 和空值开始", () => {
		const store = createStore()
		assert.deepEqual(store.read(), { version: 0, values: {} })
		assert.equal(store.version(), 0)
	})

	it("连续 patch 递增版本并返回点路径", () => {
		const store = createStore()
		assert.deepEqual(store.patch({ ifVersion: 0, patch: { "ai.provider": "openai" } }), {
			version: 1,
			changedPaths: ["ai.provider"],
		})
		assert.deepEqual(store.patch({ ifVersion: 1, patch: { "pet.scale": 1.25 } }), {
			version: 2,
			changedPaths: ["pet.scale"],
		})
		assert.deepEqual(store.read(), {
			version: 2,
			values: { ai: { provider: "openai" }, pet: { scale: 1.25 } },
		})
	})

	it("陈旧版本抛 CONFLICT 并返回当前版本", () => {
		const store = createStore()
		store.patch({ ifVersion: 0, patch: { "ai.provider": "openai" } })
		assert.throws(
			() => store.patch({ ifVersion: 0, patch: { "ai.model": "gpt" } }),
			(error) => {
				assert.equal(error.code, "CONFLICT")
				assert.equal(error.status, 409)
				assert.equal(error.details.currentVersion, 1)
				return true
			},
		)
	})

	it("相同值不递增版本,只返回真正变化的路径", () => {
		const store = createStore()
		store.patch({ ifVersion: 0, patch: { "ai.provider": "openai", "pet.scale": 1 } })
		assert.deepEqual(
			store.patch({ ifVersion: 1, patch: { "ai.provider": "openai", "pet.scale": 1.2 } }),
			{ version: 2, changedPaths: ["pet.scale"] },
		)
		assert.deepEqual(store.patch({ ifVersion: 2, patch: { "pet.scale": 1.2 } }), {
			version: 2,
			changedPaths: [],
		})
	})
})

describe("设置域 · 持久化与缓存", () => {
	it("patch 使用临时文件和 rename 后可被新实例读取", () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-settings-"))
		temporaryDirectories.push(directory)
		const file = path.join(directory, "backend", "settings.json")
		const first = createSettingsStore({ file })
		first.patch({ ifVersion: 0, patch: { "pet.scale": 1.5 } })
		const second = createSettingsStore({ file })
		assert.deepEqual(second.read(), { version: 1, values: { pet: { scale: 1.5 } } })
		assert.equal(fs.readdirSync(path.dirname(file)).some((name) => name.includes(".tmp-")), false)
	})

	it("read 返回克隆,外部修改不会污染缓存", () => {
		const store = createStore()
		store.patch({ ifVersion: 0, patch: { "pet.scale": 1 } })
		const snapshot = store.read()
		snapshot.values.pet.scale = 99
		assert.equal(store.read().values.pet.scale, 1)
	})

	it("invalidate 后重新读取磁盘内容", () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-settings-"))
		temporaryDirectories.push(directory)
		const file = path.join(directory, "settings.json")
		const store = createSettingsStore({ file })
		assert.equal(store.version(), 0)
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(file, JSON.stringify({ version: 7, values: { pet: { scale: 2 } } }))
		assert.equal(store.version(), 0)
		store.invalidate()
		assert.deepEqual(store.read(), { version: 7, values: { pet: { scale: 2 } } })
	})
})
