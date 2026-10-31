'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createCompanionIntentBroker } = require('../../apps/desktop/src/services/companion-intent-broker-service')

const createHarness = () => {
  let time = 1000
  let id = 0
  const dispatched = []
  const broker = createCompanionIntentBroker({
    now: () => time,
    idFactory: () => `intent-${++id}`,
    dispatch: (intent, metadata) => dispatched.push({ intent, metadata }),
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {}
  })
  return { broker, dispatched, advance: (delta) => { time += delta }, getNow: () => time }
}

test('deduplicates repeated intents without dispatching duplicate effects', () => {
  const { broker, dispatched } = createHarness()
  const payload = { lane: 'notice', source: 'test-plugin', type: 'status', dedupeKey: 'event-1', payload: { type: 'status' } }
  assert.equal(broker.submit(payload).outcome, 'dispatched')
  assert.equal(broker.submit(payload).reason, 'duplicate-intent')
  assert.equal(dispatched.length, 1)
})

test('selects urgent status across sessions and prefers explicit focus for equal urgency', () => {
  const { broker, dispatched } = createHarness()
  broker.submit({ lane: 'attention', source: 'agent-awareness', sessionKey: 'aaaaaaaaaaaa', status: 'waiting', sourceSequence: 1, dedupeKey: 'wait-a' })
  broker.submit({ lane: 'attention', source: 'agent-awareness', sessionKey: 'bbbbbbbbbbbb', status: 'working', sourceSequence: 1, dedupeKey: 'work-b' })
  assert.equal(broker.getSnapshot().attention.sessionKey, 'aaaaaaaaaaaa')

  broker.submit({ lane: 'attention', source: 'agent-awareness', sessionKey: 'aaaaaaaaaaaa', status: 'working', sourceSequence: 2, dedupeKey: 'work-a' })
  assert.equal(broker.getSnapshot().attention.sessionKey, 'aaaaaaaaaaaa')
  broker.setFocusedSession('bbbbbbbbbbbb')
  assert.equal(broker.getSnapshot().attention.sessionKey, 'bbbbbbbbbbbb')
  assert.equal(dispatched.at(-1).metadata.reason, 'focus-changed')
})

test('ignores older same-session sequence and expires stale attention to idle', () => {
  const { broker, dispatched, advance } = createHarness()
  broker.submit({ lane: 'attention', source: 'agent-awareness', sessionKey: 'aaaaaaaaaaaa', status: 'waiting', sourceSequence: 3, ttlMs: 1000, dedupeKey: 'newer' })
  const stale = broker.submit({ lane: 'attention', source: 'agent-awareness', sessionKey: 'aaaaaaaaaaaa', status: 'working', sourceSequence: 2, dedupeKey: 'older' })
  assert.equal(stale.reason, 'older-source-sequence')
  advance(1000)
  assert.equal(broker.getSnapshot().attention, null)
  assert.equal(dispatched.at(-1).metadata.reason, 'attention-expired')
  assert.equal(dispatched.at(-1).metadata.selectedStatus, 'idle')
})

test('bounds notice queue and promotes the next unexpired notice after current TTL', () => {
  const { broker, dispatched, advance } = createHarness()
  broker.submit({ lane: 'notice', source: 'test', type: 'status', ttlMs: 1000, payload: { type: 'current' } })
  for (let index = 0; index < 40; index += 1) {
    broker.submit({ lane: 'notice', source: 'test', type: 'status', dedupeKey: `queued-${index}`, payload: { type: `queued-${index}` } })
  }
  assert.equal(broker.getSnapshot().queues.notice, 32)
  advance(1000)
  broker.getSnapshot()
  assert.equal(dispatched.length, 2)
  assert.equal(dispatched.at(-1).metadata.reason, 'queue-promoted')
  assert.equal(broker.getSnapshot().active.notice, true)
})

test('suppresses the lowest priority request when a bounded queue is full', () => {
  const { broker } = createHarness()
  broker.submit({ lane: 'notice', source: 'test', type: 'status', ttlMs: 120000, payload: { type: 'current' } })
  for (let index = 0; index < 32; index += 1) {
    broker.submit({ lane: 'notice', source: 'test', type: 'status', dedupeKey: `queued-${index}`, payload: { type: `queued-${index}` } })
  }
  const dropped = broker.submit({ lane: 'notice', source: 'test', type: 'status', ttlMs: 250, dedupeKey: 'lowest', payload: { type: 'lowest' } })
  assert.equal(dropped.outcome, 'suppressed')
  assert.equal(dropped.reason, 'queue-full')
  assert.equal(dropped.accepted, false)
  assert.equal(broker.getSnapshot().queues.notice, 32)
})

test('keeps attention session storage bounded and validates focus identifiers', () => {
  const { broker } = createHarness()
  for (let index = 0; index < 45; index += 1) {
    broker.submit({
      lane: 'attention',
      source: 'agent-awareness',
      sessionKey: index.toString(16).padStart(12, '0'),
      status: 'working',
      dedupeKey: `event-${index}`
    })
  }
  assert.equal(broker.getSnapshot().attentionSessionCount, 40)
  assert.throws(() => broker.setFocusedSession('raw-session-id'), /sessionKey is invalid/)
})

test('keeps attention, dialogue, notice, and action dispatch independent', () => {
  const { broker, dispatched } = createHarness()
  broker.submit({ lane: 'attention', source: 'agent-awareness', sessionKey: 'aaaaaaaaaaaa', status: 'working' })
  broker.submit({ lane: 'dialogue', source: 'ai', requestId: 'reply-1', payload: { text: 'reply' } })
  broker.submit({ lane: 'notice', source: 'plugin', payload: { type: 'notice' } })
  broker.submit({ lane: 'action', source: 'trigger', payload: { actionId: 'wave' } })
  assert.deepEqual(dispatched.map(({ intent }) => intent.lane), ['attention', 'dialogue', 'notice', 'action'])
})

test('manual action replaces an autonomous action and autonomous repeats coalesce', () => {
  const { broker, dispatched } = createHarness()
  broker.submit({ lane: 'action', source: 'trigger:rule-1', type: 'autonomous', dedupeKey: 'wave', payload: { actionId: 'wave' } })
  const repeated = broker.submit({ lane: 'action', source: 'trigger:rule-1', type: 'autonomous', dedupeKey: 'wave', payload: { actionId: 'wave' } })
  assert.equal(repeated.reason, 'duplicate-intent')
  const manual = broker.submit({ lane: 'action', source: 'user', type: 'user', payload: { actionId: 'sit' } })
  assert.equal(manual.outcome, 'dispatched')
  assert.equal(dispatched.at(-1).intent.payload.actionId, 'sit')
  assert.equal(dispatched.at(-1).metadata.reason, 'higher-priority-action')
})

test('clears source state and refuses work after disposal', () => {
  const { broker, dispatched } = createHarness()
  broker.submit({ lane: 'attention', source: 'agent-awareness', sessionKey: 'aaaaaaaaaaaa', status: 'working' })
  assert.equal(broker.clearSource('agent-awareness').attention, null)
  assert.equal(dispatched.at(-1).metadata.reason, 'attention-source-cleared')
  broker.dispose()
  assert.throws(() => broker.submit({ lane: 'dialogue', source: 'ai' }), /disposed/)
})

test('companion disable suppresses Agent Awareness effects and returns the attention surface to idle', () => {
  const { broker, dispatched } = createHarness()
  broker.submit({ lane: 'attention', source: 'agent-awareness', sessionKey: 'aaaaaaaaaaaa', status: 'waiting' })
  assert.equal(dispatched.at(-1).intent.status, 'waiting')

  broker.setCompanionEnabled(false)
  assert.equal(dispatched.at(-1).intent.status, 'idle')
  const suppressed = broker.submit({ lane: 'attention', source: 'agent-awareness', sessionKey: 'bbbbbbbbbbbb', status: 'failed' })
  assert.equal(suppressed.reason, 'policy-disabled')

  const userDialogue = broker.submit({ lane: 'dialogue', source: 'user', payload: { text: 'keep this' } })
  assert.equal(userDialogue.accepted, true)
  assert.equal(dispatched.at(-1).intent.payload.text, 'keep this')
})
