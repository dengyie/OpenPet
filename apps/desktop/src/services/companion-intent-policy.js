'use strict'

const LANES = Object.freeze(['attention', 'notice', 'dialogue', 'action'])
const PRIORITIES = Object.freeze(['ambient', 'normal', 'summary', 'important', 'urgent'])
const STATUSES = Object.freeze(['idle', 'thinking', 'working', 'waiting', 'blocked', 'completed', 'failed', 'compacting'])

const PRIORITY_SCORE = Object.freeze({
  ambient: 10,
  normal: 20,
  summary: 30,
  important: 40,
  urgent: 50
})

const STATUS_POLICY = Object.freeze({
  idle: { priority: 'ambient', urgency: 0, ttlMs: 1000 },
  thinking: { priority: 'ambient', urgency: 20, ttlMs: 5 * 60 * 1000 },
  working: { priority: 'ambient', urgency: 30, ttlMs: 5 * 60 * 1000 },
  waiting: { priority: 'urgent', urgency: 100, ttlMs: 10 * 60 * 1000 },
  blocked: { priority: 'urgent', urgency: 95, ttlMs: 10 * 60 * 1000 },
  failed: { priority: 'urgent', urgency: 90, ttlMs: 10 * 60 * 1000 },
  completed: { priority: 'summary', urgency: 70, ttlMs: 10000 },
  compacting: { priority: 'important', urgency: 60, ttlMs: 30000 }
})

const DEFAULT_TTL_MS = Object.freeze({
  attention: 30000,
  notice: 8000,
  dialogue: 12000,
  action: 12000
})

const TTL_LIMITS_MS = Object.freeze({
  attention: { min: 1000, max: 10 * 60 * 1000 },
  notice: { min: 250, max: 2 * 60 * 1000 },
  dialogue: { min: 250, max: 10 * 60 * 1000 },
  action: { min: 250, max: 2 * 60 * 1000 }
})

const normalizeBoundedString = (value, maxLength, { required = false } = {}) => {
  const normalized = String(value ?? '').trim().slice(0, maxLength)
  if (required && !normalized) throw new TypeError('Companion intent string is required')
  return normalized
}

const normalizeFinite = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const clampTtlMs = (lane, value, fallback = DEFAULT_TTL_MS[lane]) => {
  const limits = TTL_LIMITS_MS[lane]
  const numeric = value === undefined || value === null || value === '' ? fallback : Number(value)
  if (!limits || !Number.isFinite(numeric) || numeric < 0) throw new TypeError('Companion intent ttlMs is invalid')
  if (numeric === 0) return Math.min(limits.max, Math.max(limits.min, Math.trunc(fallback)))
  return Math.min(limits.max, Math.max(limits.min, Math.trunc(numeric)))
}

const normalizeLane = (value) => {
  const lane = normalizeBoundedString(value, 16)
  if (!LANES.includes(lane)) throw new TypeError(`Unknown companion lane: ${lane}`)
  return lane
}

const normalizeStatus = (value) => {
  const status = normalizeBoundedString(value, 24).toLowerCase()
  if (!STATUSES.includes(status)) return 'working'
  return status
}

const derivePriority = ({ lane, status, type, trustedHostEvent = false } = {}) => {
  if (lane === 'attention') return STATUS_POLICY[normalizeStatus(status)].priority
  if (lane === 'dialogue') return 'important'
  if (lane === 'action') return ['manual', 'click', 'user'].includes(type) ? 'important' : 'normal'
  if (!trustedHostEvent) return 'normal'
  const normalizedType = normalizeBoundedString(type, 48).toLowerCase()
  if (['approval:requested', 'agent:waiting', 'agent:blocked', 'agent:failed'].includes(normalizedType)) return 'urgent'
  if (['agent:completed', 'agent:success'].includes(normalizedType)) return 'summary'
  return 'normal'
}

const getAttentionUrgency = (status) => STATUS_POLICY[normalizeStatus(status)].urgency

const compareAttentionRecords = (left, right) => {
  if (!left) return -1
  if (!right) return 1
  const leftTuple = [
    getAttentionUrgency(left.status),
    left.explicitFocus ? 1 : 0,
    left.activeTurn ? 1 : 0,
    left.arrivalSequence ?? left.createdAt,
  ]
  const rightTuple = [
    getAttentionUrgency(right.status),
    right.explicitFocus ? 1 : 0,
    right.activeTurn ? 1 : 0,
    right.arrivalSequence ?? right.createdAt,
  ]
  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] !== rightTuple[index]) return leftTuple[index] > rightTuple[index] ? 1 : -1
  }
  return right.sessionKey.localeCompare(left.sessionKey)
}

const normalizePayload = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  let serialized
  try {
    serialized = JSON.stringify(value)
  } catch (cause) {
    throw new TypeError(`Companion intent payload is not serializable: ${cause.message}`)
  }
  if (Buffer.byteLength(serialized, 'utf8') > 64 * 1024) throw new TypeError('Companion intent payload exceeds 65536 bytes')
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(serialized)
}

const normalizeIntent = (input = {}, { now = Date.now, idFactory = () => '' } = {}) => {
  const lane = normalizeLane(input.lane)
  const status = lane === 'attention' ? normalizeStatus(input.status) : undefined
  const source = normalizeBoundedString(input.source, 120, { required: true })
  const sourceSurface = normalizeBoundedString(input.sourceSurface || source, 120, { required: true })
  const createdAt = now()
  if (!Number.isFinite(createdAt) || createdAt < 0) throw new TypeError('Companion intent createdAt is invalid')
  const ttlMs = clampTtlMs(lane, input.ttlMs, status ? STATUS_POLICY[status].ttlMs : undefined)
  const id = normalizeBoundedString(input.id || idFactory(), 128, { required: true })
  const requestId = normalizeBoundedString(input.requestId, 128)
  const sessionKey = normalizeBoundedString(input.sessionKey, 64)
  const dedupeKey = normalizeBoundedString(input.dedupeKey, 128)
  const sourceSequence = normalizeFinite(input.sourceSequence, null)
  if (sourceSequence !== null && (!Number.isInteger(sourceSequence) || sourceSequence < 0)) {
    throw new TypeError('Companion intent sourceSequence is invalid')
  }
  const expiresAt = createdAt + ttlMs
  return {
    id,
    lane,
    source,
    sourceSurface,
    ...(sessionKey ? { sessionKey } : {}),
    ...(sourceSequence === null ? {} : { sourceSequence }),
    ...(status ? { status } : {}),
    priority: derivePriority({ lane, status, type: input.type, trustedHostEvent: input.trustedHostEvent === true }),
    ...(dedupeKey ? { dedupeKey } : {}),
    createdAt,
    expiresAt,
    interruptible: lane !== 'dialogue' && derivePriority({ lane, status, type: input.type, trustedHostEvent: input.trustedHostEvent === true }) !== 'urgent',
    ...(requestId ? { requestId } : {}),
    payload: normalizePayload(input.payload)
  }
}

const namespacedDedupeKey = (intent) => {
  const key = intent.dedupeKey || intent.requestId || intent.id
  return `${intent.source}:${intent.sessionKey || '-'}:${intent.lane}:${key}`
}

const getStatusPolicy = (status) => STATUS_POLICY[normalizeStatus(status)]

module.exports = {
  DEFAULT_TTL_MS,
  LANES,
  PRIORITIES,
  PRIORITY_SCORE,
  STATUSES,
  STATUS_POLICY,
  TTL_LIMITS_MS,
  clampTtlMs,
  compareAttentionRecords,
  derivePriority,
  getAttentionUrgency,
  getStatusPolicy,
  namespacedDedupeKey,
  normalizeBoundedString,
  normalizeIntent,
  normalizeStatus
}
