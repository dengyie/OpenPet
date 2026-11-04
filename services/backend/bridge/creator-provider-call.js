export async function runCreatorProviderCall({ pluginId, payload = {}, signal = null, hatchAgentFactory, operation } = {}) {
	if (typeof operation !== "function") throw new TypeError("Creator Provider operation is required")
	const runId = String(payload?.runId || "").trim()
	const shouldAccount = pluginId === "openpet.creator-studio" && runId
	const agent = shouldAccount && typeof hatchAgentFactory === "function" ? hatchAgentFactory() : null
	const reservation = agent?.reserveProviderCall
		? agent.reserveProviderCall({ runId, timeoutMs: Math.max(0, Number(payload?.timeoutMs) || 0) })
		: null
	let result
	try {
		result = await operation({ signal })
	} catch (error) {
		if (reservation) {
			const httpStatus = String(error?.message || "").match(/HTTP\s+(\d{3})/i)?.[1]
			agent.recordProviderCall({
				runId,
				reservationId: reservation.reservationId,
				budgetLedger: reservation.budgetLedger,
				ok: false,
				code: httpStatus ? `http-${httpStatus}` : String(error?.code || "provider-request-error").slice(0, 80),
			})
		}
		throw error
	}
	if (reservation) {
		agent.recordProviderCall({
			runId,
			reservationId: reservation.reservationId,
			budgetLedger: reservation.budgetLedger,
			ok: true,
			code: "ok",
			estimatedCost: result?.usage?.estimatedCostUsd ?? null,
		})
	}
	return result
}
