import { createRequire } from "node:module"
import { ApiError } from "../http/middleware.js"

const require = createRequire(import.meta.url)
const { createLocalHttpService, createLocalHttpToken, MCP_PROTOCOL_VERSION } = require("../mcp/local-http-service.cjs")

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
		say: async (payload) => {
			const reply = await shell?.request?.({ type: "pet.command.request", operation: "say", payload }, { expectedType: "pet.command.result" })
			if (reply?.body?.ok !== true) throw new Error(reply?.body?.error || "Shell pet command failed")
			return reply.body.result
		},
		playAction: async (payload) => {
			const reply = await shell?.request?.({ type: "pet.command.request", operation: "playAction", payload }, { expectedType: "pet.command.result" })
			if (reply?.body?.ok !== true) throw new Error(reply?.body?.error || "Shell pet command failed")
			return reply.body.result
		},
		setEvent: async (payload) => {
			const reply = await shell?.request?.({ type: "pet.command.request", operation: "setEvent", payload }, { expectedType: "pet.command.result" })
			if (reply?.body?.ok !== true) throw new Error(reply?.body?.error || "Shell pet command failed")
			return reply.body.result
		},
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
		if (patch.token !== undefined) {
			if (typeof patch.token !== "string" || patch.token.length === 0) throw new ApiError("VALIDATION_FAILED", "服务令牌无效")
			next.token = patch.token
		}
		return next
	}

	const status = () => service.getStatus()
	const start = async (patch = {}) => {
		const next = validate({ ...patch, enabled: true })
		const result = await service.start({ host: next.host, port: next.port, token: next.token })
		config = { ...next, enabled: true }
		return safeConfig(config, result)
	}
	const stop = async () => {
		const result = await service.stop()
		config.enabled = false
		return safeConfig(config, result)
	}
	const rotateToken = async (token) => {
		const nextToken = token === undefined ? createLocalHttpToken() : validate({ token }).token
		if (config.enabled) await service.start({ host: config.host, port: config.port, token: nextToken })
		config.token = nextToken
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

	return {
		status,
		start,
		stop,
		rotateToken,
		revokeMcpSessions: () => service.revokeMcpSessions(),
		config: getConfig,
		setConfig,
		diagnostics,
		getLogs: (filters) => service.getLogPage(filters),
		exportLogs: (filters) => service.exportLogs(filters),
		clearLogs: () => service.clearLogs(),
	}
}
