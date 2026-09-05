import logSafety from "../../../src/main/services/log-safety.js"

import { ApiError } from "../http/middleware.js"

const { sanitizeLogValue } = logSafety

function providerId(value) {
	const id = typeof value === "string" ? value.trim() : ""
	if (!id) throw new ApiError("VALIDATION_FAILED", "Provider id is required", { details: { field: "providerId" } })
	return id
}

function providerKey(value) {
	const key = typeof value === "string" ? value.trim() : ""
	if (!key) throw new ApiError("VALIDATION_FAILED", "Provider API key is required", { details: { field: "apiKey" } })
	return key
}

function initialEntries(providerKeys) {
	if (providerKeys === null || typeof providerKeys !== "object" || Array.isArray(providerKeys)) return []
	return Object.entries(providerKeys).flatMap(([id, value]) => {
		const normalizedId = typeof id === "string" ? id.trim() : ""
		const normalizedValue = typeof value === "string" ? value.trim() : ""
		return normalizedId && normalizedValue ? [[normalizedId, normalizedValue]] : []
	})
}

function summary(value) {
	if (!value) return { configured: false, maskedTail: "" }
	return { configured: true, maskedTail: value.length > 4 ? "…" + value.slice(-4) : "…" }
}

export function createProviderKeyStore({ providerKeys = {}, persist = async () => {}, logger } = {}) {
	if (typeof persist !== "function") throw new TypeError("createProviderKeyStore requires persist(change)")
	const values = new Map(initialEntries(providerKeys))

	const get = (id) => values.get(providerId(id)) ?? ""
	const status = (id) => summary(get(id))
	const set = async (id, value) => {
		const normalizedId = providerId(id)
		const normalizedValue = providerKey(value)
		await persist({ providerId: normalizedId, value: normalizedValue })
		values.set(normalizedId, normalizedValue)
		logger?.info?.("Provider key persisted", { providerId: normalizedId, configured: true })
		return summary(normalizedValue)
	}
	const clear = async (id) => {
		const normalizedId = providerId(id)
		await persist({ providerId: normalizedId, value: null })
		values.delete(normalizedId)
		logger?.info?.("Provider key cleared", { providerId: normalizedId, configured: false })
		return summary("")
	}
	const sanitize = (value) => sanitizeLogValue(value, { secretValues: [...values.values()] })

	// The plaintext Map remains in this closure. The runtime receives only
	// non-enumerable functions, so diagnostics and crash snapshots cannot pick
	// up provider keys through ordinary object serialization.
	const api = {}
	Object.defineProperties(api, {
		get: { value: get },
		status: { value: status },
		set: { value: set },
		clear: { value: clear },
		sanitizeLogValue: { value: sanitize },
	})
	return Object.freeze(api)
}
