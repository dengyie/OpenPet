"use strict"

const CANONICAL_PATHS = Object.freeze([
	"scale", "walkSpeed", "walkDuration", "bubbleDuration", "menuPosition", "autoStart",
	"selectedCursorId", "customCursor", "customCursors", "hiddenCursorIds", "customCursorScope",
	"petBehavior.grounded", "petBehavior.home.enabled", "petBehavior.home.radius",
	"petBubbleChat.enabled", "petBubbleChat.autoPopup", "petBubbleChat.autoHide", "petBubbleChat.pinOnInteraction",
])
const NORMALIZATION_PATHS = Object.freeze(["petBehavior.home.anchor"])

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

function sameValue(left, right) {
	if (Object.is(left, right)) return true
	if (Array.isArray(left) || Array.isArray(right)) {
		return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameValue(value, right[index]))
	}
	if (isObject(left) || isObject(right)) {
		if (!isObject(left) || !isObject(right)) return false
		const leftKeys = Object.keys(left)
		return leftKeys.length === Object.keys(right).length && leftKeys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
	}
	return false
}

function getPath(value, path) {
	let current = value
	for (const segment of path.split(".")) {
		if (!isObject(current) || !Object.hasOwn(current, segment)) return undefined
		current = current[segment]
	}
	return current
}

function setPath(value, path, nextValue) {
	const output = structuredClone(value)
	const segments = path.split(".")
	let target = output
	for (const segment of segments.slice(0, -1)) {
		if (!isObject(target[segment])) target[segment] = {}
		target = target[segment]
	}
	target[segments.at(-1)] = structuredClone(nextValue)
	return output
}

function canonicalPaths(paths) {
	const requested = new Set(Array.isArray(paths) ? paths : CANONICAL_PATHS)
	return CANONICAL_PATHS.filter((path) => requested.has(path))
}

function mergeCanonicalSettings(current, values, paths) {
	let merged = structuredClone(current || {})
	for (const path of canonicalPaths(paths)) {
		const nextValue = getPath(values, path)
		if (nextValue !== undefined) merged = setPath(merged, path, nextValue)
	}
	return merged
}

function canonicalHostValues(settings, paths) {
	const result = {}
	for (const path of canonicalPaths(paths)) {
		const value = getPath(settings, path)
		if (value !== undefined) result[path] = value
	}
	return result
}

async function persistNormalization({ getBackend, fetchImpl, settings, paths, ifVersion }) {
	const backend = getBackend()
	if (!backend) return null
	const patch = Object.fromEntries(NORMALIZATION_PATHS
		.filter((path) => paths.includes(path) && getPath(settings, path) !== undefined)
		.map((path) => [path, getPath(settings, path)]))
	if (Object.keys(patch).length === 0) return null
	const send = (version) => fetchImpl(`${backend.baseUrl.replace(/\/+$/, "")}/settings`, {
		method: "PATCH",
		headers: { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" },
		body: JSON.stringify({ ifVersion: version, patch }),
	})
	let response = await send(ifVersion)
	if (response.status === 409) {
		const latest = await fetchSnapshot(backend, fetchImpl)
		response = await send(latest.version)
	}
	if (!response.ok) throw new Error(`Backend settings normalization failed: ${response.status}`)
	return response.json()
}

async function fetchSnapshot(backend, fetchImpl) {
	const response = await fetchImpl(`${backend.baseUrl.replace(/\/+$/, "")}/settings`, {
		headers: { authorization: `Bearer ${backend.sessionToken}`, accept: "application/json" },
	})
	if (!response.ok) throw new Error(`Backend settings request failed: ${response.status}`)
	const payload = await response.json()
	const snapshot = payload?.data || payload
	if (!Number.isInteger(snapshot?.version) || !isObject(snapshot?.values)) throw new Error("Invalid backend settings snapshot")
	return snapshot
}

function createSettingsSidecarBridge({ getBackend, fetchImpl = globalThis.fetch, petService, applyHostSettings, sendToPetRenderer, logger } = {}) {
	if (typeof getBackend !== "function") throw new TypeError("createSettingsSidecarBridge 需要 getBackend")
	if (typeof fetchImpl !== "function") throw new TypeError("createSettingsSidecarBridge 需要 fetchImpl")
	let operation = Promise.resolve()

	const apply = async (snapshot, paths) => {
		const current = petService?.getSettings?.() || {}
		let merged = mergeCanonicalSettings(current, snapshot.values, paths)
		try {
			const applied = typeof applyHostSettings === "function"
				? await applyHostSettings({ settings: merged, previousSettings: current, paths, version: snapshot.version })
				: await petService?.applySettings?.(merged)
			if (applied && isObject(applied)) merged = applied
		} catch (error) {
			await rollbackBackend(snapshot, current, paths).catch((rollbackError) => logger?.error?.("回滚 backend settings 失败", { error: String(rollbackError) }))
			throw error
		}
		sendToPetRenderer?.(merged)
		return merged
	}

	async function rollbackBackend(snapshot, previous, paths) {
		const backend = getBackend()
		if (!backend) return
		const patch = canonicalHostValues(previous, paths)
		if (Object.keys(patch).length === 0) return
		const sendPatch = async (ifVersion, values) => fetchImpl(`${backend.baseUrl.replace(/\/+$/, "")}/settings`, {
			method: "PATCH",
			headers: { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" },
			body: JSON.stringify({ ifVersion, patch: values }),
		})
		let response = await sendPatch(snapshot.version, patch)
		if (response.status === 409) {
			const latest = await fetchSnapshot(backend, fetchImpl)
			const safePatch = Object.fromEntries(Object.entries(patch).filter(([path, value]) => sameValue(getPath(latest.values, path), getPath(snapshot.values, path))))
			if (Object.keys(safePatch).length === 0) return
			response = await sendPatch(latest.version, safePatch)
		}
		if (!response.ok) throw new Error(`Backend settings rollback failed: ${response.status}`)
	}

	const applyNotification = async (message) => {
		const notification = message?.body?.type === "settings.changed" ? message.body : message
		if (notification?.type && notification.type !== "settings.changed") return null
		const backend = getBackend()
		if (!backend) return null
		try {
			const snapshot = await fetchSnapshot(backend, fetchImpl)
			const latestBackend = getBackend()
			if (!latestBackend || latestBackend.sessionToken !== backend.sessionToken) return null
			return await apply(snapshot, notification?.paths)
		} catch (error) {
			logger?.warn?.("应用 sidecar settings snapshot 失败", { error: String(error) })
			return null
		}
	}
	const handle = (message) => {
		operation = operation.then(() => applyNotification(message), () => applyNotification(message))
		return operation
	}

	const hydrate = () => {
		operation = operation.then(async () => {
			const backend = getBackend()
			if (!backend) return null
			const snapshot = await fetchSnapshot(backend, fetchImpl)
			if (getBackend()?.sessionToken !== backend.sessionToken) return null
			return apply(snapshot, CANONICAL_PATHS)
		})
		return operation
	}

	return {
		handle,
		hydrate,
		mergeCanonicalSettings,
		fetchSnapshot,
		persistNormalization: (input) => persistNormalization({ getBackend, fetchImpl, ...input }),
	}
}

module.exports = { CANONICAL_PATHS, createSettingsSidecarBridge, mergeCanonicalSettings }
