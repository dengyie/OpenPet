const test = require('node:test')
const assert = require('node:assert/strict')

const { createBehaviorOrchestratorService } = require('../../src/main/services/behavior-orchestrator-service')

const actions = [
  { id: 'idle', label: 'Idle', kind: 'idle' },
  { id: 'wave', label: 'Wave', kind: 'greeting' },
  { id: 'done', label: 'Done', kind: 'success' }
]

const createSettingsService = (behavior = {}) => {
  let current = {
    ai: {
      behavior: {
        enabled: true,
        useTools: true,
        cooldownMs: 0,
        rules: [],
        decisions: [],
        ...behavior
      },
      conversations: {}
    }
  }
  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

test('behavior orchestrator applies highest-priority matching rule', () => {
  const service = createBehaviorOrchestratorService({
    settingsService: createSettingsService({
      rules: [
        { id: 'low', priority: 10, when: { contains: ['done'] }, then: { type: 'playAction', actionId: 'wave' } },
        { id: 'high', priority: 20, when: { contains: ['done'] }, then: { type: 'playAction', actionId: 'done' } }
      ]
    })
  })

  assert.deepEqual(service.evaluate({ reply: 'done', actions }), {
    matched: true,
    type: 'playAction',
    actionId: 'done',
    label: 'Done',
    kind: 'success',
    ruleId: 'high',
    reason: 'matched rule high',
    intent: ''
  })
})

test('behavior orchestrator rejects unavailable provider action ids', () => {
  const service = createBehaviorOrchestratorService({
    settingsService: createSettingsService()
  })

  assert.deepEqual(service.evaluate({
    reply: 'ok',
    behaviorIntent: { intent: 'success', actionId: 'missing', confidence: 0.9 },
    actions
  }), {
    matched: false,
    reason: 'provider actionId is not available',
    actionId: 'missing'
  })
})

test('behavior orchestrator skips matching rules with unavailable actions', () => {
  const service = createBehaviorOrchestratorService({
    settingsService: createSettingsService({
      rules: [
        { id: 'bad', priority: 20, when: { contains: ['done'] }, then: { type: 'playAction', actionId: 'missing' } },
        { id: 'good', priority: 10, when: { contains: ['done'] }, then: { type: 'playAction', actionId: 'done' } }
      ]
    })
  })

  assert.equal(service.evaluate({ reply: 'done', actions }).actionId, 'done')
})

test('behavior orchestrator enforces cooldown without affecting dry run', () => {
  const service = createBehaviorOrchestratorService({
    settingsService: createSettingsService({
      cooldownMs: 10000,
      rules: [
        { id: 'success', priority: 10, when: { intent: 'success', minConfidence: 0.7 }, then: { type: 'playAction', actionId: 'done' } }
      ]
    })
  })
  const payload = {
    reply: 'ok',
    behaviorIntent: { intent: 'success', actionId: 'done', confidence: 0.9 },
    actions
  }

  assert.equal(service.evaluate(payload).matched, true)
  assert.deepEqual(service.evaluate(payload), {
    matched: false,
    reason: 'action is cooling down',
    cooldown: true,
    actionId: 'done'
  })
  assert.equal(service.dryRun(payload).matched, true)
})

test('behavior orchestrator dry run can use unsaved behavior config', () => {
  const service = createBehaviorOrchestratorService({
    settingsService: createSettingsService({
      rules: []
    })
  })

  assert.deepEqual(service.dryRun({
    reply: 'ship it',
    actions,
    behavior: {
      enabled: true,
      rules: [
        { id: 'unsaved', priority: 10, when: { contains: ['ship'] }, then: { type: 'playAction', actionId: 'done' } }
      ]
    }
  }), {
    matched: true,
    type: 'playAction',
    actionId: 'done',
    label: 'Done',
    kind: 'success',
    ruleId: 'unsaved',
    reason: 'matched rule unsaved',
    intent: ''
  })
})

test('behavior orchestrator falls back to semantic action matching', () => {
  const service = createBehaviorOrchestratorService({
    settingsService: createSettingsService()
  })

  assert.deepEqual(service.evaluate({ reply: 'hello there', actions }), {
    matched: true,
    type: 'playAction',
    actionId: 'wave',
    label: 'Wave',
    kind: 'greeting',
    reason: 'fallback matched hello',
    intent: ''
  })
})

test('behavior orchestrator preserves conversations while saving config', () => {
  const settingsService = createSettingsService({
    rules: []
  })
  settingsService.save({
    ai: {
      behavior: settingsService.get().ai.behavior,
      conversations: {
        control: [{ role: 'user', content: 'hi' }]
      }
    }
  })
  const service = createBehaviorOrchestratorService({ settingsService })

  service.saveConfig({ enabled: false })

  assert.equal(settingsService.get().ai.behavior.enabled, false)
  assert.deepEqual(settingsService.get().ai.conversations, {
    control: [{ role: 'user', content: 'hi' }]
  })
})
