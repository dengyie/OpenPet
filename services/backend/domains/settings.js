// 设置域:Backend 是 settings.json 的唯一写者。
//
// 文件采用 { version, values } 信封,这样 PATCH 的版本比较和实际配置值
// 不会混在一起。缓存只服务于 read();patch() 每次从盘面读取,避免用过期
// 快照做乐观锁判断。

import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import { ApiError } from "../http/middleware.js"

export const SETTINGS_CACHE_TTL_MS = 5_000

const EMPTY_SETTINGS = Object.freeze({ version: 0, values: Object.freeze({}) })
const FORBIDDEN_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"])

function clone(value) {
	return structuredClone(value)
}

function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isValidPath(path) {
	if (typeof path !== "string" || path.length === 0) return false
	const segments = path.split(".")
	return segments.every((segment) => segment.length > 0 && !FORBIDDEN_PATH_SEGMENTS.has(segment))
}

function sameValue(left, right) {
	if (Object.is(left, right)) return true
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
		return left.every((value, index) => sameValue(value, right[index]))
	}
	if (isObject(left) || isObject(right)) {
		if (!isObject(left) || !isObject(right)) return false
		const leftKeys = Object.keys(left)
		const rightKeys = Object.keys(right)
		if (leftKeys.length !== rightKeys.length) return false
		return leftKeys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
	}
	return false
}

function readPath(values, path) {
	let current = values
	for (const segment of path.split(".")) {
		if (!isObject(current) || !Object.hasOwn(current, segment)) return undefined
		current = current[segment]
	}
	return current
}

function writePath(values, path, value) {
	const segments = path.split(".")
	let current = values
	for (const segment of segments.slice(0, -1)) {
		if (!isObject(current[segment])) current[segment] = {}
		current = current[segment]
	}
	current[segments.at(-1)] = clone(value)
}

function normalizePersisted(raw, file) {
	if (!isObject(raw)) {
		throw new ApiError("INTERNAL", "设置文件必须是 JSON 对象", { details: { file } })
	}

	const version = raw.version
	const values = raw.values
	if (!Number.isInteger(version) || version < 0 || !isObject(values)) {
		throw new ApiError("INTERNAL", "设置文件格式无效", { details: { file } })
	}
	return { version, values: clone(values) }
}

function readPersisted(file) {
	let raw
	try {
		raw = JSON.parse(readFileSync(file, "utf8"))
	} catch (error) {
		if (error?.code === "ENOENT") return clone(EMPTY_SETTINGS)
		if (error instanceof SyntaxError) {
			throw new ApiError("INTERNAL", "设置文件不是合法 JSON", { details: { file }, cause: error })
		}
		throw new ApiError("INTERNAL", "读取设置文件失败", { details: { file }, cause: error })
	}
	return normalizePersisted(raw, file)
}

function writePersisted(file, settings, logger) {
	mkdirSync(dirname(file), { recursive: true })
	const temporaryFile = `${file}.tmp-${process.pid}-${randomUUID()}`
	try {
		writeFileSync(temporaryFile, `${JSON.stringify(settings)}\n`, { encoding: "utf8", mode: 0o600 })
		renameSync(temporaryFile, file)
	} catch (error) {
		try {
			unlinkSync(temporaryFile)
		} catch {
			// 清理失败不应覆盖原始写入错误。
		}
		logger?.error?.("写入设置文件失败", { file, error: String(error) })
		throw new ApiError("INTERNAL", "写入设置文件失败", { details: { file }, cause: error })
	}
}

export function createSettingsStore({ file, logger } = {}) {
	if (typeof file !== "string" || file.length === 0) {
		throw new ApiError("VALIDATION_FAILED", "设置文件路径不能为空")
	}

	let cached = null

	const read = () => {
		const now = Date.now()
		if (cached !== null && now - cached.loadedAt < SETTINGS_CACHE_TTL_MS) return clone(cached.settings)

		const settings = readPersisted(file)
		cached = { loadedAt: now, settings }
		return clone(settings)
	}

	const version = () => read().version

	const patch = ({ ifVersion, patch: changes } = {}) => {
		if (!Number.isInteger(ifVersion) || ifVersion < 0 || !isObject(changes)) {
			throw new ApiError("VALIDATION_FAILED", "设置 patch 参数无效")
		}
		for (const path of Object.keys(changes)) {
			if (!isValidPath(path)) {
				throw new ApiError("VALIDATION_FAILED", "设置路径无效", { details: { path } })
			}
		}

		const current = readPersisted(file)
		if (current.version !== ifVersion) {
			throw new ApiError("CONFLICT", "设置版本已变化", {
				details: { currentVersion: current.version },
			})
		}

		const nextValues = clone(current.values)
		const changedPaths = []
		for (const [path, value] of Object.entries(changes)) {
			if (sameValue(readPath(current.values, path), value)) continue
			writePath(nextValues, path, value)
			changedPaths.push(path)
		}

		if (changedPaths.length === 0) {
			cached = { loadedAt: Date.now(), settings: current }
			return { version: current.version, changedPaths }
		}

		const next = { version: current.version + 1, values: nextValues }
		writePersisted(file, next, logger)
		cached = { loadedAt: Date.now(), settings: next }
		return { version: next.version, changedPaths }
	}

	const invalidate = () => {
		cached = null
	}

	return { read, patch, version, invalidate }
}
