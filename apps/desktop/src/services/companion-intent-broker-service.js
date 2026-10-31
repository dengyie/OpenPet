'use strict'

const {
  LANES,
  PRIORITY_SCORE,
  compareAttentionRecords,
  namespacedDedupeKey,
  normalizeIntent,
  normalizeStatus
} = require('./companion-intent-policy')

const MAX_ATTENTION_SESSIONS = 40
const MAX_NOTICE_QUEUE = 32
const MAX_ACTION_QUEUE = 16
const MAX_DECISIONS = 100
const MAX_DEDUPE_ENTRIES = 256

const clone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

const createCompanionIntentBroker = ({
  now = () => Date.now(),
  idFactory = null,
  dispatch = () => {},
  onTimerError = (error) => { throw error },
  isEnabled = () => true,
  isCompanionIntent = (intent) => intent.lane === 'attention' || /agent-awareness/i.test(intent.source),
  policy = { normalizeIntent },
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) => {
  if (typeof now !== 'function' || (idFactory !== null && typeof idFactory !== 'function') || typeof dispatch !== 'function' || typeof isEnabled !== 'function' || typeof isCompanionIntent !== 'function') {
    throw new TypeError('Companion intent broker requires now, idFactory, and dispatch functions')
  }
  let generatedId = 0
  const nextId = idFactory || (() => `intent-${Math.trunc(now()).toString(36)}-${(++generatedId).toString(36)}`)
  const attentionBySession = new Map()
  const noticeQueue = []
  const actionQueue = []
  const active = new Map()
  const dedupe = new Map()
  const decisions = []
  let focusedSessionKey = ''
  let selectedAttentionId = ''
  let attentionArrivalSequence = 0
  let expiryTimer = null
  let disposed = false
  let companionEnabled = true

  const rememberDecision = (decision) => {
    decisions.push(Object.freeze({ ...decision }))
    if (decisions.length > MAX_DECISIONS) decisions.shift()
    return decision
  }

  const result = ({ intentId, lane, outcome, reason, accepted = false, selectedSessionKey: selected = undefined }) => rememberDecision({
    accepted,
    intentId,
    lane,
    outcome,
    reason,
    ...(selected ? { selectedSessionKey: selected } : {}),
    queueDepth: lane === 'notice' ? noticeQueue.length : lane === 'action' ? actionQueue.length : 0
  })

  const scheduleExpiry = () => {
    if (expiryTimer) clearTimer(expiryTimer)
    expiryTimer = null
    if (disposed) return
    let expiresAt = Number.POSITIVE_INFINITY
    for (const record of attentionBySession.values()) expiresAt = Math.min(expiresAt, record.expiresAt)
    for (const lane of ['notice', 'action']) {
      for (const record of lane === 'notice' ? noticeQueue : actionQueue) expiresAt = Math.min(expiresAt, record.expiresAt)
      const current = active.get(lane)
      if (current) expiresAt = Math.min(expiresAt, current.expiresAt)
    }
    for (const expiry of dedupe.values()) expiresAt = Math.min(expiresAt, expiry)
    if (!Number.isFinite(expiresAt)) return
    expiryTimer = setTimer(() => {
      expiryTimer = null
      try {
        expire()
      } catch (error) {
        onTimerError(error)
      }
    }, Math.max(0, expiresAt - now()))
    expiryTimer?.unref?.()
  }

  const syncAttentionSelection = (reason) => {
    const selected = selectAttention()
    if (selected?.id === selectedAttentionId) return
    selectedAttentionId = selected?.id || ''
    if (selected) {
      dispatchIntent(selected, {
        selectedSessionKey: selected.sessionKey,
        selectedStatus: selected.status,
        selectedExpiresAt: selected.expiresAt,
        reason
      })
      return
    }
    dispatchIntent({ lane: 'attention', source: 'agent-awareness', sourceSurface: 'agent-awareness', status: 'idle', payload: {} }, {
      selectedStatus: 'idle',
      reason
    })
  }

  const expire = (at = now()) => {
    const previousAttentionId = selectedAttentionId
    for (const [key, record] of attentionBySession) {
      if (record.expiresAt <= at) attentionBySession.delete(key)
    }
    for (const lane of ['notice', 'action']) {
      const queue = lane === 'notice' ? noticeQueue : actionQueue
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (queue[index].expiresAt <= at) queue.splice(index, 1)
      }
      const current = active.get(lane)
      if (current?.expiresAt <= at) active.delete(lane)
    }
    for (const [key, expiresAt] of dedupe) {
      if (expiresAt <= at) dedupe.delete(key)
    }
    if (previousAttentionId !== (selectAttention()?.id || '')) {
      syncAttentionSelection(selectAttention() ? 'attention-selected' : 'attention-expired')
    }
    promote('notice')
    promote('action')
    scheduleExpiry()
  }

  const selectAttention = () => {
    let winner = null
    for (const record of attentionBySession.values()) {
      if (!winner || compareAttentionRecords(record, winner) > 0) winner = record
    }
    return winner
  }

  const dispatchIntent = (intent, extra = {}) => {
    dispatch(clone(intent), clone(extra))
  }

  const dispatchAttention = (intent) => {
    const selected = selectAttention()
    const selectionChanged = selected?.id !== selectedAttentionId
    if (!selectionChanged && selected?.id !== intent.id) return false
    selectedAttentionId = selected?.id || ''
    if (selected) dispatchIntent(selected, {
      selectedSessionKey: selected.sessionKey,
      selectedStatus: selected.status,
      selectedExpiresAt: selected.expiresAt,
      reason: selectionChanged ? 'attention-selected' : 'attention-updated'
    })
    return Boolean(selected)
  }

  const clearCompanionState = () => {
    const hadSelectedAttention = Boolean(selectedAttentionId)
    const priorAttention = selectAttention()
    for (const [key, value] of attentionBySession) {
      if (isCompanionIntent(value)) attentionBySession.delete(key)
    }
    for (const queue of [noticeQueue, actionQueue]) {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (isCompanionIntent(queue[index])) queue.splice(index, 1)
      }
    }
    for (const [lane, value] of active) {
      if (isCompanionIntent(value)) active.delete(lane)
    }
    selectedAttentionId = ''
    if (hadSelectedAttention || priorAttention) {
      dispatchIntent({
        lane: 'attention',
        source: 'agent-awareness',
        sourceSurface: 'agent-awareness',
        status: 'idle',
        payload: {}
      }, { selectedStatus: 'idle', reason: 'policy-disabled' })
    }
    scheduleExpiry()
  }

  const setCompanionEnabled = (enabled) => {
    const nextEnabled = enabled !== false
    if (companionEnabled === nextEnabled) return getSnapshot()
    companionEnabled = nextEnabled
    if (!companionEnabled) clearCompanionState()
    return getSnapshot()
  }

  const promote = (lane) => {
    if (active.has(lane)) return
    const queue = lane === 'notice' ? noticeQueue : actionQueue
    if (!queue.length) return
    queue.sort((left, right) => (
      PRIORITY_SCORE[right.priority] - PRIORITY_SCORE[left.priority] ||
      left.createdAt - right.createdAt ||
      left.id.localeCompare(right.id)
    ))
    const next = queue.shift()
    active.set(lane, next)
    dispatchIntent(next, { reason: 'queue-promoted' })
  }

  const submit = (input = {}) => {
    if (disposed) throw new Error('Companion intent broker is disposed')
    expire()
    let intent
    try {
      intent = policy.normalizeIntent(input, { now, idFactory: nextId })
    } catch {
      const lane = typeof input.lane === 'string' && LANES.includes(input.lane) ? input.lane : 'notice'
      return result({ intentId: '', lane, outcome: 'invalid', reason: 'invalid-intent' })
    }
    if (!companionEnabled || isEnabled() === false) {
      if (companionEnabled) setCompanionEnabled(false)
      if (isCompanionIntent(intent)) return result({
        intentId: intent.id,
        lane: intent.lane,
        outcome: 'suppressed',
        reason: 'policy-disabled'
      })
    }
    const dedupeKey = namespacedDedupeKey(intent)
    if (dedupe.has(dedupeKey)) return result({
      intentId: intent.id,
      lane: intent.lane,
      outcome: 'suppressed',
      reason: 'duplicate-intent'
    })
    dedupe.set(dedupeKey, intent.expiresAt)
    if (dedupe.size > MAX_DEDUPE_ENTRIES) dedupe.delete(dedupe.keys().next().value)

    if (intent.lane === 'attention') {
      if (!intent.sessionKey) return result({ intentId: intent.id, lane: intent.lane, outcome: 'invalid', reason: 'session-key-required' })
      const previous = attentionBySession.get(intent.sessionKey)
      if (previous && intent.sourceSequence !== undefined && previous.sourceSequence !== undefined && intent.sourceSequence < previous.sourceSequence) {
        return result({ intentId: intent.id, lane: intent.lane, outcome: 'suppressed', reason: 'older-source-sequence' })
      }
      const record = {
        ...intent,
        arrivalSequence: ++attentionArrivalSequence,
        explicitFocus: intent.sessionKey === focusedSessionKey,
        activeTurn: typeof intent.payload?.activeTurn === 'boolean'
          ? intent.payload.activeTurn
          : ['thinking', 'working', 'waiting', 'blocked', 'compacting'].includes(intent.status),
        payload: intent.payload
      }
      attentionBySession.set(intent.sessionKey, record)
      if (attentionBySession.size > MAX_ATTENTION_SESSIONS) {
        const selected = selectAttention()
        let oldestKey = ''
        let oldestAt = Number.POSITIVE_INFINITY
        for (const [key, value] of attentionBySession) {
          if (key === selected?.sessionKey) continue
          if (!value.activeTurn && value.createdAt < oldestAt) {
            oldestKey = key
            oldestAt = value.createdAt
          }
        }
        if (!oldestKey) {
          for (const [key, value] of attentionBySession) {
            if (key === selected?.sessionKey) continue
            if (value.createdAt < oldestAt) {
              oldestKey = key
              oldestAt = value.createdAt
            }
          }
        }
        if (oldestKey) attentionBySession.delete(oldestKey)
      }
      const selected = selectAttention()
      const dispatched = dispatchAttention(intent)
      const decision = result({
        intentId: intent.id,
        lane: intent.lane,
        outcome: dispatched ? 'dispatched' : 'coalesced',
        reason: dispatched ? 'attention-selected' : 'attention-stored',
        accepted: true,
        selectedSessionKey: selected?.sessionKey
      })
      scheduleExpiry()
      return decision
    }

    if (intent.lane === 'dialogue') {
      dispatchIntent(intent, { reason: 'dialogue-dispatched' })
      const decision = result({ intentId: intent.id, lane: intent.lane, outcome: 'dispatched', reason: 'dialogue-dispatched', accepted: true })
      scheduleExpiry()
      return decision
    }

    const laneQueue = intent.lane === 'notice' ? noticeQueue : actionQueue
    const laneLimit = intent.lane === 'notice' ? MAX_NOTICE_QUEUE : MAX_ACTION_QUEUE
    if (!active.has(intent.lane)) {
      active.set(intent.lane, intent)
      dispatchIntent(intent, { reason: 'lane-dispatched' })
      const decision = result({ intentId: intent.id, lane: intent.lane, outcome: 'dispatched', reason: 'lane-dispatched', accepted: true })
      scheduleExpiry()
      return decision
    }
    if (intent.lane === 'action' && intent.priority === 'important' && active.get('action')?.interruptible) {
      const previous = active.get('action')
      active.set('action', intent)
      dispatchIntent(intent, { reason: 'higher-priority-action' })
      const decision = result({ intentId: intent.id, lane: intent.lane, outcome: 'dispatched', reason: `replaced:${previous.id}`, accepted: true })
      scheduleExpiry()
      return decision
    }
    laneQueue.push(intent)
    laneQueue.sort((left, right) => PRIORITY_SCORE[right.priority] - PRIORITY_SCORE[left.priority] || left.createdAt - right.createdAt)
    if (laneQueue.length > laneLimit) {
      const dropped = laneQueue.pop()
      if (dropped.id === intent.id) return result({
        intentId: intent.id,
        lane: intent.lane,
        outcome: 'suppressed',
        reason: 'queue-full',
        accepted: false
      })
    }
    const decision = result({ intentId: intent.id, lane: intent.lane, outcome: 'queued', reason: 'lane-busy', accepted: true })
    scheduleExpiry()
    return decision
  }

  const setFocusedSession = (sessionKey = '') => {
    const normalizedSessionKey = String(sessionKey || '').trim().slice(0, 64)
    if (normalizedSessionKey && !/^[a-f0-9]{12}$/.test(normalizedSessionKey)) {
      throw new TypeError('Focused Agent Awareness sessionKey is invalid')
    }
    expire()
    focusedSessionKey = normalizedSessionKey
    for (const record of attentionBySession.values()) record.explicitFocus = record.sessionKey === focusedSessionKey
    const selected = selectAttention()
    if (selected?.id !== selectedAttentionId) syncAttentionSelection('focus-changed')
    return getSnapshot()
  }

  const getSnapshot = () => {
    expire()
    const selected = selectAttention()
    return {
      attention: selected ? {
        sessionKey: selected.sessionKey,
        status: normalizeStatus(selected.status),
        priority: selected.priority,
        createdAt: selected.createdAt,
        expiresAt: selected.expiresAt,
        reason: selected.status === 'waiting' || selected.status === 'blocked' || selected.status === 'failed' ? 'urgent-status' : 'attention-selected'
      } : null,
      focusedSessionKey: focusedSessionKey || undefined,
      attentionSessionCount: attentionBySession.size,
      queues: {
        notice: noticeQueue.length,
        dialogue: 0,
        action: actionQueue.length
      },
      active: {
        notice: Boolean(active.get('notice')),
        action: Boolean(active.get('action'))
      },
      decisions: decisions.slice(-MAX_DECISIONS).map(clone)
    }
  }

  const clearSource = (source) => {
    const normalized = String(source || '').trim().slice(0, 120)
    for (const [key, value] of attentionBySession) if (value.source === normalized) attentionBySession.delete(key)
    for (const queue of [noticeQueue, actionQueue]) {
      for (let index = queue.length - 1; index >= 0; index -= 1) if (queue[index].source === normalized) queue.splice(index, 1)
    }
    for (const [lane, value] of active) if (value.source === normalized) active.delete(lane)
    for (const key of dedupe.keys()) if (key.startsWith(`${normalized}:`)) dedupe.delete(key)
    syncAttentionSelection('attention-source-cleared')
    promote('notice')
    promote('action')
    scheduleExpiry()
    return getSnapshot()
  }

  const dispose = () => {
    disposed = true
    if (expiryTimer) clearTimer(expiryTimer)
    expiryTimer = null
    attentionBySession.clear()
    noticeQueue.length = 0
    actionQueue.length = 0
    active.clear()
    dedupe.clear()
    decisions.length = 0
  }

  return {
    submit,
    setCompanionEnabled,
    setFocusedSession,
    getSnapshot,
    clearSource,
    dispose,
    constants: Object.freeze({ MAX_ATTENTION_SESSIONS, MAX_NOTICE_QUEUE, MAX_ACTION_QUEUE, MAX_DECISIONS })
  }
}

module.exports = {
  MAX_ACTION_QUEUE,
  MAX_ATTENTION_SESSIONS,
  MAX_DECISIONS,
  MAX_NOTICE_QUEUE,
  createCompanionIntentBroker,
}
