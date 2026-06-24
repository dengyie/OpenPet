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
    behaviorIntent: {
      intent: 'success',
      actionId: 'missing',
      confidence: 0.9,
      reason: 'The provider asked for a celebration action that is not installed.',
      displayMode: 'action'
    },
    actions
  }), {
    matched: false,
    reason: 'provider actionId is not available',
    actionId: 'missing',
    providerReason: 'The provider asked for a celebration action that is not installed.',
    displayMode: 'action'
  })
})

test('behavior orchestrator preserves provider behavior reason and display mode in decisions', () => {
  const service = createBehaviorOrchestratorService({
    settingsService: createSettingsService()
  })

  const decision = service.evaluate({
    reply: 'Great work.',
    behaviorIntent: {
      intent: 'success',
      actionId: 'done',
      confidence: 0.9,
      bubbleText: '做得漂亮！',
      reason: 'The user completed a task, so a celebration action fits.',
      displayMode: 'action'
    },
    actions
  })
  const stored = service.getConfig().decisions[0]
  const replayed = service.replayDecision({ decisionId: stored.id, actions })
  const exported = JSON.parse(service.exportDiagnostics())

  assert.equal(decision.providerReason, 'The user completed a task, so a celebration action fits.')
  assert.equal(decision.displayMode, 'action')
  assert.equal(stored.providerReason, 'The user completed a task, so a celebration action fits.')
  assert.equal(stored.displayMode, 'action')
  assert.equal(stored.replay.behaviorIntent.reason, 'The user completed a task, so a celebration action fits.')
  assert.equal(stored.replay.behaviorIntent.displayMode, 'action')
  assert.equal(replayed.providerReason, 'The user completed a task, so a celebration action fits.')
  assert.equal(replayed.displayMode, 'action')
  assert.equal(exported.decisions[0].providerReason, 'The user completed a task, so a celebration action fits.')
  assert.equal(exported.decisions[0].displayMode, 'action')
  assert.equal(JSON.stringify(exported).includes('Great work.'), false)
  assert.equal(JSON.stringify(exported).includes('做得漂亮'), false)
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

test('behavior orchestrator records replayable decisions and exports redacted diagnostics', () => {
  const service = createBehaviorOrchestratorService({
    settingsService: createSettingsService({
      rules: [
        { id: 'success', priority: 10, when: { contains: ['done'] }, then: { type: 'playAction', actionId: 'done' } }
      ]
    })
  })

  const decision = service.evaluate({
    reply: 'done with sensitive prompt text',
    behaviorIntent: { intent: 'success', actionId: 'done', confidence: 0.9 },
    actions
  })
  const config = service.getConfig()
  const stored = config.decisions[0]
  const exported = JSON.parse(service.exportDiagnostics())

  assert.equal(decision.actionId, 'done')
  assert.equal(stored.reason, 'matched rule success')
  assert.equal(stored.inputSummary, 'reply:31 chars · intent:success · actionId:done · confidence:0.9')
  assert.equal(stored.replay.reply, 'done with sensitive prompt text')
  assert.equal(service.replayDecision({ decisionId: stored.id, actions }).actionId, 'done')
  assert.equal(exported.decisions[0].replay, undefined)
  assert.equal(exported.decisions[0].replayRedacted, true)
  assert.equal(JSON.stringify(exported).includes('sensitive prompt text'), false)

  assert.deepEqual(service.clearDecisions(), [])
  assert.deepEqual(service.getConfig().decisions, [])
})
