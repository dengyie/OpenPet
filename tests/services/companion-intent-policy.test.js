'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  clampTtlMs,
  compareAttentionRecords,
  derivePriority,
  namespacedDedupeKey,
  normalizeIntent
} = require('../../apps/desktop/src/services/companion-intent-policy')

test('normalizes lane priority, bounded fields, and TTL with injected time and ID', () => {
  const intent = normalizeIntent({
    lane: 'attention',
    source: 'agent-awareness',
    sessionKey: '0123456789ab',
    status: 'waiting',
    sourceSequence: 4,
    dedupeKey: 'event-1',
    payload: { message: 'private detail' }
  }, { now: () => 1000, idFactory: () => 'intent-1' })

  assert.deepEqual(intent, {
    id: 'intent-1',
    lane: 'attention',
    source: 'agent-awareness',
    sourceSurface: 'agent-awareness',
    sessionKey: '0123456789ab',
    sourceSequence: 4,
    status: 'waiting',
    priority: 'urgent',
    dedupeKey: 'event-1',
    createdAt: 1000,
    expiresAt: 601000,
    interruptible: false,
    payload: { message: 'private detail' }
  })
})

test('bounds TTLs and rejects invalid, negative, and oversized payload inputs', () => {
  assert.equal(clampTtlMs('notice', 1), 250)
  assert.equal(clampTtlMs('notice', 900000), 120000)
  assert.throws(() => clampTtlMs('notice', Number.NaN), /ttlMs is invalid/)
  assert.throws(() => clampTtlMs('notice', -1), /ttlMs is invalid/)
  assert.throws(() => normalizeIntent({
    lane: 'notice', source: 'test', payload: { message: 'x'.repeat(70 * 1024) }
  }, { now: () => 1, idFactory: () => 'intent-1' }), /payload exceeds/)
})

test('unknown attention states map to routine working priority and plugin notice cannot claim urgency', () => {
  assert.equal(derivePriority({ lane: 'attention', status: 'execute-shell-now' }), 'ambient')
  assert.equal(derivePriority({ lane: 'notice', type: 'agent:failed' }), 'normal')
  assert.equal(derivePriority({ lane: 'notice', type: 'agent:failed', trustedHostEvent: true }), 'urgent')
})

test('dedupe keys are namespaced by normalized source, session, and lane', () => {
  const intent = normalizeIntent({
    lane: 'attention', source: 'agent-awareness', sessionKey: 'session-a', status: 'working', dedupeKey: 'event-1'
  }, { now: () => 1, idFactory: () => 'intent-1' })
  assert.equal(namespacedDedupeKey(intent), 'agent-awareness:session-a:attention:event-1')
})

test('attention comparator prioritizes severity before focus and stabilizes ties by key', () => {
  const focusedWorking = { status: 'working', explicitFocus: true, activeTurn: true, createdAt: 50, sessionKey: 'b' }
  const waiting = { status: 'waiting', explicitFocus: false, activeTurn: true, createdAt: 1, sessionKey: 'z' }
  const samePriorityOther = { status: 'working', explicitFocus: true, activeTurn: true, createdAt: 50, sessionKey: 'a' }
  assert.equal(compareAttentionRecords(waiting, focusedWorking) > 0, true)
  assert.equal(compareAttentionRecords(focusedWorking, samePriorityOther) < 0, true)
})
