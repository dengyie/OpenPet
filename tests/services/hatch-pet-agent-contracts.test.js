const test = require('node:test')
const assert = require('node:assert/strict')

const {
  DEFAULT_HATCH_PET_AGENT_CONFIG,
  DEFAULT_HATCH_PET_BUDGETS,
  HATCH_PET_EXECUTION_MODES,
  normalizeHatchPetAgentConfig,
  resolveHatchPetCompletionConfig,
  createHatchPetAgentPublicConfig,
  validateHatchPetDecision
} = require('../../src/main/services/hatch-pet-agent-contracts')

test('quality-first hatch-pet contracts default to final review and preserve an explicit identity-review choice', () => {
  assert.equal(HATCH_PET_EXECUTION_MODES.has('production'), true)
  assert.equal(DEFAULT_HATCH_PET_AGENT_CONFIG.requireIdentityReviewBeforeActions, false)
  assert.equal(DEFAULT_HATCH_PET_BUDGETS.maxPlannerCalls, 34)
  assert.equal(DEFAULT_HATCH_PET_BUDGETS.maxEvaluatorCalls, 68)
  assert.equal(DEFAULT_HATCH_PET_BUDGETS.maxProviderCalls, 72)
  assert.equal(DEFAULT_HATCH_PET_BUDGETS.maxElapsedMs, 43_200_000)
  const production = normalizeHatchPetAgentConfig({ enabled: true, executionMode: 'production' })
  assert.equal(production.executionMode, 'production')
  assert.equal(production.requireIdentityReviewBeforeActions, false)
  assert.equal(normalizeHatchPetAgentConfig({ requireIdentityReviewBeforeActions: true }).requireIdentityReviewBeforeActions, true)
  assert.equal(normalizeHatchPetAgentConfig({ requireIdentityReviewBeforeActions: false }).requireIdentityReviewBeforeActions, false)
})

test('hatch-pet contracts default disabled and fixed shadow while clamping budgets', () => {
  assert.equal(DEFAULT_HATCH_PET_AGENT_CONFIG.enabled, false)
  assert.equal(DEFAULT_HATCH_PET_AGENT_CONFIG.executionMode, 'shadow')
  const value = normalizeHatchPetAgentConfig({ enabled: true, executionMode: 'execute', apiKeyRef: 'attacker', budgets: { maxIdentityRegenerations: 99, maxActionAttemptsPerAction: 0, maxEvaluationAttemptsPerArtifact: 9, maxPlannerCalls: 999, maxEvaluatorCalls: 999, maxProviderCalls: 999, maxElapsedMs: 999999999, maxEstimatedCost: -2 } })
  assert.equal(value.executionMode, 'shadow')
  assert.deepEqual(value.budgets, { maxIdentityRegenerations: 3, maxActionAttemptsPerAction: 1, maxEvaluationAttemptsPerArtifact: 3, maxPlannerCalls: 34, maxEvaluatorCalls: 68, maxProviderCalls: 72, maxElapsedMs: 43200000, maxEstimatedCost: 0.01 })
})

test('hatch-pet resolution separates follow-chat from dedicated and public URLs remove credentials query and fragment', () => {
  const follow = resolveHatchPetCompletionConfig({ aiConfig: { provider: 'chat', baseUrl: 'https://u:p@chat.test/v1?q=x#f', model: 'chat-model', apiKeyRef: 'ai.default' }, hatchPetConfig: { configMode: 'follow-chat' } })
  assert.equal(follow.apiKeyRef, 'ai.default')
  assert.equal(follow.source, 'chat-fallback')
  const dedicated = resolveHatchPetCompletionConfig({ hatchPetConfig: { configMode: 'override', provider: 'dedicated', baseUrl: 'https://u:p@dedicated.test/v1?q=x#f', model: 'planner', apiKeyRef: 'ai.hatch-pet' } })
  assert.equal(dedicated.apiKeyRef, 'ai.hatch-pet')
  assert.equal(createHatchPetAgentPublicConfig(dedicated, true).baseUrl, 'https://dedicated.test/v1')
})

test('hatch-pet decisions reject unknown and illegal fields and clamp confidence', () => {
  const base = { schemaVersion: 1, decision: 'generate-action', scope: { actionId: 'wave' }, reasonCodes: ['ready'], confidence: 7 }
  assert.equal(validateHatchPetDecision(base, { legalDecisions: ['generate-action'] }).confidence, 1)
  assert.throws(() => validateHatchPetDecision({ ...base, secret: 'x' }, { legalDecisions: ['generate-action'] }), /unknown field/)
  assert.throws(() => validateHatchPetDecision({ ...base, decision: 'accept-stage' }, { legalDecisions: ['generate-action'] }), /illegal/)
  assert.throws(() => validateHatchPetDecision({ ...base, scope: { actionId: '../wave' } }, { legalDecisions: ['generate-action'] }), /invalid/)
})
