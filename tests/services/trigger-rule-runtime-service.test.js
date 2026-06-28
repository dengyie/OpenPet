const test = require('node:test')
const assert = require('node:assert/strict')

const { createTriggerRuleRuntimeService } = require('../../src/main/services/trigger-rule-runtime-service')

const createHarness = ({ triggerRules = [] } = {}) => {
  let nowMs = 0
  let heartbeat = null
  let actionListener = null
  let eventListener = null
  const playCalls = []

  const actionService = {
    getConfig: () => ({
      defaultAction: 'idle',
      clickAction: 'wave',
      actions: [
        { id: 'idle', label: 'Idle', kind: 'idle' },
        { id: 'wave', label: 'Wave', kind: 'custom' },
        { id: 'sleep', label: 'Sleep', kind: 'rest' }
      ],
      triggerRules
    })
  }

  const petService = {
    onAction: (listener) => {
      actionListener = listener
      return () => { actionListener = null }
    },
    onEvent: (listener) => {
      eventListener = listener
      return () => { eventListener = null }
    },
    playAction: (payload) => {
      playCalls.push(payload)
      return payload
    }
  }

  const service = createTriggerRuleRuntimeService({
    actionService,
    petService,
    now: () => nowMs,
    setIntervalFn: (callback, intervalMs) => {
      heartbeat = { callback, intervalMs }
      return 1
    },
    clearIntervalFn: () => {
      heartbeat = null
    }
  })

  return {
    service,
    playCalls,
    advanceTo: (value) => { nowMs = value },
    tick: () => heartbeat?.callback(),
    emitAction: (payload) => actionListener?.(payload),
    emitEvent: (payload) => eventListener?.(payload),
    getHeartbeatInterval: () => heartbeat?.intervalMs || 0
  }
}

test('trigger rule runtime fires eligible random rules through pet service', () => {
  const harness = createHarness({
    triggerRules: [
      {
        id: 'rule:random:wave:1',
        type: 'random',
        actionId: 'wave',
        enabled: true,
        binding: '',
        intervalMs: 1000
      }
    ]
  })

  harness.service.start()
  harness.advanceTo(1000)
  harness.tick()

  assert.equal(harness.getHeartbeatInterval(), 1000)
  assert.deepEqual(harness.playCalls, [
    { actionId: 'wave', source: 'trigger-rule:rule:random:wave:1' }
  ])
  assert.deepEqual(harness.service.getDiagnostics().decisions.at(-1), {
    ruleId: 'rule:random:wave:1',
    triggerType: 'random',
    outcome: 'matched',
    reason: 'rule matched',
    actionId: 'wave',
    binding: '',
    source: 'scheduler'
  })
})

test('trigger rule runtime respects random rule cooldown between intervals', () => {
  const harness = createHarness({
    triggerRules: [
      {
        id: 'rule:random:wave:1',
        type: 'random',
        actionId: 'wave',
        enabled: true,
        binding: '',
        intervalMs: 5000
      }
    ]
  })

  harness.service.start()

  harness.advanceTo(5000)
  harness.tick()
  harness.advanceTo(6000)
  harness.tick()
  harness.advanceTo(10000)
  harness.tick()

  assert.deepEqual(harness.playCalls, [
    { actionId: 'wave', source: 'trigger-rule:rule:random:wave:1' },
    { actionId: 'wave', source: 'trigger-rule:rule:random:wave:1' }
  ])
  assert.deepEqual(
    harness.service.getDiagnostics().decisions.slice(-3).map((entry) => [entry.ruleId, entry.outcome, entry.reason]),
    [
      ['rule:random:wave:1', 'matched', 'rule matched'],
      ['rule:random:wave:1', 'skipped', 'cooldown active'],
      ['rule:random:wave:1', 'matched', 'rule matched']
    ]
  )
})

test('trigger rule runtime only fires event rules when the binding matches', () => {
  const harness = createHarness({
    triggerRules: [
      {
        id: 'rule:event:wave:1',
        type: 'event',
        actionId: 'wave',
        enabled: true,
        binding: 'plugin:event',
        intervalMs: 0
      }
    ]
  })

  harness.service.start()
  harness.emitEvent({ type: 'different:event', source: 'plugin:test' })
  harness.emitEvent({ type: 'plugin:event', source: 'plugin:test' })

  assert.deepEqual(harness.playCalls, [
    { actionId: 'wave', source: 'trigger-rule:rule:event:wave:1' }
  ])
  assert.deepEqual(
    harness.service.getDiagnostics().decisions.slice(-2).map((entry) => [entry.ruleId, entry.outcome, entry.reason]),
    [
      ['rule:event:wave:1', 'skipped', 'binding mismatch'],
      ['rule:event:wave:1', 'matched', 'rule matched']
    ]
  )
})

test('trigger rule runtime treats current action id as the minimal supported state binding', () => {
  const harness = createHarness({
    triggerRules: [
      {
        id: 'rule:state:wave:1',
        type: 'state',
        actionId: 'wave',
        enabled: true,
        binding: 'idle',
        intervalMs: 0
      }
    ]
  })

  harness.service.start()
  harness.emitAction({ actionId: 'sleep', source: 'user' })
  harness.emitAction({ actionId: 'idle', source: 'user' })

  assert.deepEqual(harness.playCalls, [
    { actionId: 'wave', source: 'trigger-rule:rule:state:wave:1' }
  ])
  assert.deepEqual(harness.service.getDiagnostics().currentState, { actionId: 'idle' })
  assert.deepEqual(
    harness.service.getDiagnostics().decisions.slice(-2).map((entry) => [entry.ruleId, entry.outcome, entry.reason]),
    [
      ['rule:state:wave:1', 'skipped', 'binding mismatch'],
      ['rule:state:wave:1', 'matched', 'rule matched']
    ]
  )
})

test('trigger rule runtime blocks lower-priority matching rules after the first winner in config order', () => {
  const harness = createHarness({
    triggerRules: [
      {
        id: 'rule:event:wave:1',
        type: 'event',
        actionId: 'wave',
        enabled: true,
        binding: 'plugin:event',
        intervalMs: 0
      },
      {
        id: 'rule:event:sleep:1',
        type: 'event',
        actionId: 'sleep',
        enabled: true,
        binding: 'plugin:event',
        intervalMs: 0
      }
    ]
  })

  harness.service.start()
  harness.emitEvent({ type: 'plugin:event', source: 'plugin:test' })

  assert.deepEqual(harness.playCalls, [
    { actionId: 'wave', source: 'trigger-rule:rule:event:wave:1' }
  ])
  assert.deepEqual(
    harness.service.getDiagnostics().decisions.slice(-2).map((entry) => [entry.ruleId, entry.outcome, entry.reason]),
    [
      ['rule:event:wave:1', 'matched', 'rule matched'],
      ['rule:event:sleep:1', 'blocked', 'higher-priority rule already matched']
    ]
  )
})

test('trigger rule runtime records disabled and invalid rules as non-executed diagnostics', () => {
  const harness = createHarness({
    triggerRules: [
      {
        id: 'rule:random:wave:disabled',
        type: 'random',
        actionId: 'wave',
        enabled: false,
        binding: '',
        intervalMs: 1000
      },
      {
        id: 'rule:event:missing:1',
        type: 'event',
        actionId: 'missing',
        enabled: true,
        binding: 'plugin:event',
        intervalMs: 0
      }
    ]
  })

  harness.service.start()
  harness.advanceTo(1000)
  harness.tick()
  harness.emitEvent({ type: 'plugin:event', source: 'plugin:test' })

  assert.deepEqual(harness.playCalls, [])
  assert.deepEqual(
    harness.service.getDiagnostics().decisions.slice(-2).map((entry) => [entry.ruleId, entry.outcome, entry.reason]),
    [
      ['rule:random:wave:disabled', 'skipped', 'rule disabled'],
      ['rule:event:missing:1', 'blocked', 'action is unavailable']
    ]
  )
})
