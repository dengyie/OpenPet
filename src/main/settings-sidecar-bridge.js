"use strict"

const CANONICAL_PATHS = Object.freeze([
	"pet.scale", "scale", "walkSpeed", "walkDuration", "bubbleDuration", "menuPosition", "autoStart",
	"selectedCursorId", "customCursor", "customCursors", "hiddenCursorIds", "customCursorScope",
	"petBehavior.grounded", "petBehavior.home.enabled", "petBehavior.home.radius", "petBehavior.home.anchor",
	"petBubbleChat.enabled", "petBubbleChat.autoPopup", "petBubbleChat.autoHide", "petBubbleChat.pinOnInteraction",
])
const PERSISTABLE_PATHS = CANONICAL_PATHS

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

async function persistSettingsPaths({ getBackend, fetchImpl, requestBackend, settings, paths, ifVersion }) {
	const backend = getBackend()
	if (!backend) return null
	const patch = Object.fromEntries(PERSISTABLE_PATHS
		.filter((path) => paths.includes(path) && getPath(settings, path) !== undefined)
		.map((path) => [path, getPath(settings, path)]))
	if (Object.keys(patch).length === 0) return null
	let version = Number.isInteger(ifVersion) ? ifVersion : (await fetchSnapshot(backend, fetchImpl)).version
	let trustedChangedPaths = []
	if (Object.hasOwn(patch, "petBehavior.home.anchor")) {
		if (typeof requestBackend !== "function") throw new Error("trusted settings persistence bridge unavailable")
		const trustedPatch = { "petBehavior.home.anchor": patch["petBehavior.home.anchor"] }
		let reply = await requestBackend({ type: "settings.persist.request", ifVersion: version, patch: trustedPatch })
		if (reply?.body?.ok !== true && reply?.body?.errorCode === "CONFLICT") {
			version = (await fetchSnapshot(backend, fetchImpl)).version
			reply = await requestBackend({ type: "settings.persist.request", ifVersion: version, patch: trustedPatch })
		}
		if (reply?.body?.ok !== true) throw new Error(`Backend trusted settings persistence failed: ${reply?.body?.error || "unknown error"}`)
		version = reply.body.version
		trustedChangedPaths = Array.isArray(reply.body.changedPaths) ? reply.body.changedPaths : []
		delete patch["petBehavior.home.anchor"]
	}
	if (Object.keys(patch).length === 0) return { version, changedPaths: trustedChangedPaths }
	const send = (version) => fetchImpl(`${backend.baseUrl.replace(/\/+$/, "")}/settings`, {
		method: "PATCH",
		headers: { authorization: `Bearer ${backend.sessionToken}`, "content-type": "application/json" },
		body: JSON.stringify({ ifVersion: version, patch }),
	})
	let response = await send(version)
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

function createSettingsSidecarBridge({ getBackend, fetchImpl = globalThis.fetch, requestBackend, petService, applyHostSettings, sendToPetRenderer, logger } = {}) {
	if (typeof getBackend !== "function") throw new TypeError("createSettingsSidecarBridge 需要 getBackend")
	if (typeof fetchImpl !== "function") throw new TypeError("createSettingsSidecarBridge 需要 fetchImpl")
	let operation = Promise.resolve()

	const apply = async (snapshot, paths, { skipBackendRollback = false } = {}) => {
		const current = petService?.getSettings?.() || {}
		let merged = mergeCanonicalSettings(current, snapshot.values, paths)
		try {
			const applied = typeof applyHostSettings === "function"
				? await applyHostSettings({ settings: merged, previousSettings: current, paths, version: snapshot.version })
				: await petService?.applySettings?.(merged)
			if (applied && isObject(applied)) merged = applied
		} catch (error) {
			if (!skipBackendRollback) {
				await rollbackBackend(snapshot, current, paths).catch((rollbackError) => logger?.error?.("回滚 backend settings 失败", { error: String(rollbackError) }))
			}
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
		const notification = message?.body?.type === "settings.changed" || message?.body?.type === "settings.apply.request"
			? message.body
			: message
		if (notification?.type && !["settings.changed", "settings.apply.request"].includes(notification.type)) return null
		const backend = getBackend()
		if (!backend) return null
		try {
			const snapshot = notification?.type === "settings.apply.request" && isObject(notification.values)
				? { version: notification.version, values: notification.values }
				: await fetchSnapshot(backend, fetchImpl)
			const latestBackend = getBackend()
			if (!latestBackend || latestBackend.sessionToken !== backend.sessionToken) return null
			return await apply(snapshot, notification?.paths, { skipBackendRollback: notification?.type === "settings.apply.request" })
		} catch (error) {
			logger?.warn?.("应用 sidecar settings snapshot 失败", { error: String(error) })
			throw error
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
		fetchSnapshot: (backend) => fetchSnapshot(backend, fetchImpl),
		persistNormalization: (input) => persistSettingsPaths({ getBackend, fetchImpl, requestBackend, ...input }),
		persistCanonicalSettings: (input) => persistSettingsPaths({ getBackend, fetchImpl, requestBackend, ...input }),
	}
}

module.exports = { CANONICAL_PATHS, createSettingsSidecarBridge, mergeCanonicalSettings }
