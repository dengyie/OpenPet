"use strict"

const BRIDGE_PROTOCOL_VERSION = 1

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

function createMessageHandler({ dialog, petService, logger, send, onNotify, onBadge, onDashboard } = {}) {
	if (typeof send !== "function") throw new TypeError("createMessageHandler 需要 send")

	async function handle(raw) {
		const body = raw?.body
		if (!body || typeof body !== "object" || typeof body.type !== "string") {
			log(logger, "warn", "丢弃无效的 sidecar 消息")
			return false
		}

		try {
			switch (body.type) {
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
					onDashboard?.(body)
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
					log(logger, "warn", "丢弃未知的 sidecar 消息", { type: body.type })
					return false
			}
		} catch (error) {
			log(logger, "error", "处理 sidecar 消息失败", { type: body.type, error: String(error) })
			return false
		}
	}

	return { handle }
}

module.exports = { createMessageHandler }
