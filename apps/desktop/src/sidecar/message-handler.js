"use strict"

const BRIDGE_PROTOCOL_VERSION = 1

// Keep this list frozen in the Shell as well as in the backend bridge client.
// A backend message is untrusted input at this boundary: only these nine
// capabilities may reach Electron/PetService.
const BACKEND_TO_SHELL_TYPES = Object.freeze([
	"pet.say",
	"pet.playAction",
	"pet.event",
	"window.openPluginDashboard",
	"notify",
	"tray.setBadge",
	"ready",
	"degraded",
	"dialog.request",
])

function log(logger, level, message, fields) {
	try {
		logger?.[level]?.(message, fields)
	} catch {
		// A logger must never take down the Shell message loop.
	}
}

function dialogProperties(mode) {
	return mode === "directory" ? ["openDirectory"] : ["openFile"]
}

function fail(reason, detail) {
	return { ok: false, reason, detail: detail ?? null }
}

function parseEnvelope(raw) {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return fail("not-object")
	if (raw.v !== BRIDGE_PROTOCOL_VERSION) return fail("version-mismatch", raw.v)
	if (typeof raw.id !== "string" || raw.id.length === 0) return fail("bad-id", raw.id)
	if (typeof raw.at !== "number" || !Number.isFinite(raw.at)) return fail("bad-at", raw.at)
	const body = raw.body
	if (body === null || typeof body !== "object" || Array.isArray(body) || typeof body.type !== "string") {
		return fail("bad-body")
	}
	if (!BACKEND_TO_SHELL_TYPES.includes(body.type)) return fail("unknown-type", body.type)

	switch (body.type) {
		case "pet.say":
			if (typeof body.text !== "string") return fail("bad-body", "pet.say.text")
			if (body.durationMs !== undefined && (!Number.isInteger(body.durationMs) || body.durationMs <= 0)) return fail("bad-body", "pet.say.durationMs")
			break
		case "pet.playAction":
			if (typeof body.actionId !== "string" || (body.loop !== undefined && typeof body.loop !== "boolean")) return fail("bad-body", "pet.playAction")
			break
		case "pet.event":
			if (typeof body.name !== "string") return fail("bad-body", "pet.event.name")
			break
		case "window.openPluginDashboard":
			if (typeof body.pluginId !== "string" || body.pluginId.length === 0) return fail("bad-body", "window.openPluginDashboard.pluginId")
			break
		case "notify":
			if (!["info", "warn", "error"].includes(body.level) || typeof body.message !== "string") return fail("bad-body", "notify")
			break
		case "tray.setBadge":
			if (!Number.isInteger(body.count) || body.count < 0) return fail("bad-body", "tray.setBadge.count")
			break
		case "ready":
			if (!Number.isInteger(body.port) || body.port <= 0 || body.apiVersion !== "v1" || !Number.isInteger(body.pid) || body.pid <= 0) return fail("bad-body", "ready")
			break
		case "degraded":
			if (typeof body.reason !== "string") return fail("bad-body", "degraded.reason")
			break
		case "dialog.request":
			if (typeof body.requestId !== "string" || !["file", "directory"].includes(body.mode)) return fail("bad-body", "dialog.request")
			break
	}

	return { ok: true, envelope: { v: raw.v, id: raw.id, at: raw.at, body } }
}

function createMessageHandler({ dialog, petService, logger, send, onNotify, onBadge, onDashboard, productionService } = {}) {
	if (typeof send !== "function") throw new TypeError("createMessageHandler 需要 send")

	async function handle(raw) {
		const parsed = parseEnvelope(raw)
		if (!parsed.ok) {
			log(logger, "warn", "丢弃无效的 sidecar 消息", { reason: parsed.reason, detail: parsed.detail })
			return false
		}
		const { body } = parsed.envelope

		try {
				switch (body.type) {
				case "plugin.production.request": {
					if (typeof productionService !== "function") throw new Error("Plugin production service unavailable")
					const result = await productionService(body)
					send({ v: BRIDGE_PROTOCOL_VERSION, id: raw.id, at: Date.now(), body: { type: "plugin.production.result", requestId: raw.id, result } })
					return true
				}
				case "pet.say":
					petService?.say?.({ text: body.text, durationMs: body.durationMs, source: "backend" })
					return true
				case "pet.playAction":
					petService?.playAction?.({ actionId: body.actionId, loop: body.loop, source: "backend" })
					return true
				case "pet.event":
					petService?.setEvent?.({ event: body.name, payload: body.payload, source: "backend" })
					return true
				case "notify":
					onNotify?.(body)
					return true
				case "tray.setBadge":
					onBadge?.(body.count)
					return true
				case "window.openPluginDashboard":
					// Shell owns all BrowserWindow options. The backend may identify the
					// plugin only; URL/preload/webPreferences/path are deliberately dropped.
					onDashboard?.({ pluginId: body.pluginId })
					return true
				case "ready":
				case "degraded":
					return true
				case "dialog.request": {
					if (typeof dialog?.showOpenDialog !== "function") throw new Error("Shell dialog 不可用")
					const result = await dialog.showOpenDialog({ properties: dialogProperties(body.mode) })
					const paths = result?.canceled ? null : (Array.isArray(result?.filePaths) ? result.filePaths : [])
					send({
						v: BRIDGE_PROTOCOL_VERSION,
						id: raw.id,
						at: Date.now(),
						body: { type: "dialog.result", requestId: body.requestId, paths },
					})
					return true
				}
				default:
					// parseEnvelope's immutable allowlist makes this unreachable.
					return false
			}
		} catch (error) {
			log(logger, "error", "处理 sidecar 消息失败", { type: body.type, error: String(error) })
			return false
		}
	}

	return { handle }
}

module.exports = { BACKEND_TO_SHELL_TYPES, createMessageHandler, parseEnvelope }
