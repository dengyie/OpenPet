// ADR-011:反向通道的 v:1 信封。
//
// HTTP 侧有 /api/v1 兼容兜底,这条通道原本没有。而升级或崩溃重拉会产生
// 新旧进程配对(旧 Shell + 新 sidecar,或反之),所以信封必须带版本,
// 不符就杀并重拉(最多 2 次),退出码 78。
//
// 本文件**不**直接调 process.exit —— 只返回 version-mismatch,由调用方决定。
// 这样校验逻辑能被单测直接调用。

import { backendToShellSchema, shellToBackendSchema } from "@openpet/contracts"

export const BRIDGE_PROTOCOL_VERSION = 1
export const EXIT_CODE_VERSION_MISMATCH = 78
export const MAX_VERSION_MISMATCH_RELAUNCHES = 2
export const DIALOG_RESULT_TIMEOUT_MS = 60_000

/** 后端 -> Shell。白名制:不在表里的类型发不出去(R15 反向通道提权)。 */
export const BACKEND_TO_SHELL_TYPES = Object.freeze(backendToShellSchema.options.map((option) => option.shape.type.value))

/** Shell -> 后端。 */
export const SHELL_TO_BACKEND_TYPES = Object.freeze(shellToBackendSchema.options.map((option) => option.shape.type.value))

let sequence = 0

export function nextEnvelopeId() {
	sequence += 1
	// 带 pid:崩溃重拉后新进程的 id 不会与旧进程撞车。
	return "b" + process.pid + "-" + sequence
}

export function createEnvelope(body, options = {}) {
	return {
		v: BRIDGE_PROTOCOL_VERSION,
		id: options.id ?? nextEnvelopeId(),
		at: options.at ?? Date.now(),
		body,
	}
}

function fail(reason, detail) {
	return { ok: false, reason, detail: detail ?? null }
}

/**
 * 校验一条收到的信封。
 *
 * @returns { ok: true, envelope } 或 { ok: false, reason, detail }
 *   reason 可能为:not-object / version-mismatch / bad-id / bad-at / bad-body / unknown-type
 *   只有 version-mismatch 应当导致退出 78,其余一律丢弃并记日志。
 */
export function parseEnvelope(raw, options = {}) {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		return fail("not-object", typeof raw)
	}
	if (raw.v !== BRIDGE_PROTOCOL_VERSION) {
		return fail("version-mismatch", "期望 v=" + BRIDGE_PROTOCOL_VERSION + ",收到 v=" + String(raw.v))
	}
	if (typeof raw.id !== "string" || raw.id.length === 0) return fail("bad-id", String(raw.id))
	if (!Number.isInteger(raw.at) || raw.at <= 0) return fail("bad-at", String(raw.at))

	const body = raw.body
	if (body === null || typeof body !== "object" || Array.isArray(body) || typeof body.type !== "string") {
		return fail("bad-body")
	}

	const allowed = options.allowedTypes
	if (allowed !== undefined && !allowed.includes(body.type)) {
		return fail("unknown-type", body.type)
	}

	return { ok: true, envelope: { v: raw.v, id: raw.id, at: raw.at, body } }
}
