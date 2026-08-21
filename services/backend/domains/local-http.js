import { createRequire } from "node:module"
import { ApiError } from "../http/middleware.js"

const require = createRequire(import.meta.url)
const { createLocalHttpService, createLocalHttpToken, MCP_PROTOCOL_VERSION } = require("../../../src/main/services/local-http-service.js")

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"])

function safeConfig(config, status) {
	return {
		enabled: Boolean(status?.enabled ?? config.enabled),
		host: config.host,
		port: Number(status?.port ?? config.port),
		tokenConfigured: Boolean(config.token),
		mcpProtocolVersion: MCP_PROTOCOL_VERSION,
	}
}

export function createLocalHttpManager({ settings, logger, now = () => new Date(), secrets, shell, petState } = {}) {
	let config = { enabled: false, host: "127.0.0.1", port: 0, token: secrets?.localHttpToken ?? createLocalHttpToken() }
	const petService = {
		getSnapshot: () => petState?.() ?? {},
		say: (payload) => { shell?.send?.({ type: "pet.say", text: payload.text, durationMs: payload.ttlMs }); return { accepted: true } },
		playAction: (payload) => { shell?.send?.({ type: "pet.playAction", actionId: payload.actionId }); return { accepted: true } },
		setEvent: (payload) => { shell?.send?.({ type: "pet.event", name: payload.name, payload: payload.payload }); return { accepted: true } },
	}
	const service = createLocalHttpService({ petService, now, logger })

	const validate = (patch = {}) => {
		const next = { ...config }
		if (patch.host !== undefined) {
			if (typeof patch.host !== "string" || !LOOPBACK_HOSTS.has(patch.host)) throw new ApiError("VALIDATION_FAILED", "服务只能绑定回环地址")
			next.host = patch.host
		}
		if (patch.port !== undefined) {
			const port = Number(patch.port)
			if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ApiError("VALIDATION_FAILED", "服务端口无效")
			next.port = port
		}
		if (patch.enabled !== undefined) {
			if (typeof patch.enabled !== "boolean") throw new ApiError("VALIDATION_FAILED", "enabled 必须是布尔值")
			next.enabled = patch.enabled
		}
		return next
	}

	const status = () => service.getStatus()
	const start = async (patch = {}) => {
		config = validate({ ...patch, enabled: true })
		const result = await service.start({ host: config.host, port: config.port, token: config.token })
		config = { ...config, ...result, enabled: true }
		return safeConfig(config, result)
	}
	const stop = async () => {
		const result = await service.stop()
		config.enabled = false
		return safeConfig(config, result)
	}
	const rotateToken = async () => {
		config.token = createLocalHttpToken()
		if (config.enabled) await service.start({ host: config.host, port: config.port, token: config.token })
		return { tokenConfigured: true, rotated: true }
	}
	const getConfig = () => safeConfig(config, status())
	const setConfig = async (patch = {}) => {
		const next = validate(patch)
		if (next.enabled) return start(next)
		config = next
		return stop()
	}
	const diagnostics = () => ({
		status: getConfig(),
		logs: service.getLogPage({ page: 1, pageSize: 50 }).entries,
		secrets: { token: "redacted" },
	})

	return { status, start, stop, rotateToken, config: getConfig, setConfig, diagnostics, getLogs: (filters) => service.getLogPage(filters), clearLogs: () => service.clearLogs() }
}
